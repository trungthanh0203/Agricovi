import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CropTypeRow, type FieldDef, type WorkTypeRow } from './db';
import { useOrgs } from './orgs';

/**
 * Cây trồng và loại việc HIỆU LỰC cho một cơ sở: mục dùng chung + mục của chính cơ sở, áp bản chỉnh của cơ sở
 * (tên riêng, trường ghi riêng, dừng/dùng) — xem quyết định D32. Mục đã dừng vẫn có trong danh sách (is_active = false)
 * để lịch sử hiển thị đúng tên; nơi chọn thì lọc is_active.
 */
export type EffCrop = CropTypeRow & { is_active: boolean; shared: boolean; overridden: boolean; base_name: string };
export type EffWorkType = WorkTypeRow & { is_active: boolean; field_schema: FieldDef[]; shared: boolean; overridden: boolean; base_name: string };

export function effectiveCrops(rows: CropTypeRow[], orgId: string | undefined): EffCrop[] {
  return rows
    .filter((r) => !r.organization_id || r.organization_id === orgId)
    .map((r) => {
      const shared = !r.organization_id;
      const o = shared && orgId ? r.ov?.[orgId] : undefined;
      return { ...r, name: o?.display_name ?? r.name, base_name: r.name, shared, overridden: Boolean(o), is_active: o ? o.is_active : (r.is_active ?? true) };
    });
}

export function effectiveWorkTypes(rows: WorkTypeRow[], orgId: string | undefined): EffWorkType[] {
  return rows
    .filter((r) => !r.organization_id || r.organization_id === orgId)
    .map((r) => {
      const shared = !r.organization_id;
      const o = shared && orgId ? r.ov?.[orgId] : undefined;
      return {
        ...r, name: o?.display_name ?? r.name, base_name: r.name, shared, overridden: Boolean(o),
        field_schema: o?.field_schema ?? r.field_schema ?? [],
        is_active: o ? o.is_active : (r.is_active ?? true),
      };
    });
}

/** Danh mục hiệu lực của cơ sở đang chọn, cập nhật theo bản lưu trên máy (dùng được offline) */
export function useCatalog() {
  const { active } = useOrgs();
  const crops = useLiveQuery(() => db.cropTypes.toArray(), [], []);
  const types = useLiveQuery(() => db.workTypes.toArray(), [], []);
  return useMemo(
    () => ({ cropTypes: effectiveCrops(crops, active?.id), workTypes: effectiveWorkTypes(types, active?.id) }),
    [crops, types, active?.id],
  );
}
