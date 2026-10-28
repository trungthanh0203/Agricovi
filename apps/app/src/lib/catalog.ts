import { useMemo } from 'react';
import { db, type CropTypeRow, type FieldDef, type WorkTypeRow } from './db';
import { useOrgs } from './orgs';
import { sharedCodeFor, standardFieldsFor } from './standardFields';
import { useTable } from './tables';

/**
 * Sản phẩm và loại việc HIỆU LỰC cho một cơ sở: mục dùng chung + mục của chính cơ sở, áp bản chỉnh của cơ sở
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
      return { ...r, name: o?.display_name ?? r.name, description: o ? o.description ?? r.description : r.description, image: o ? o.image ?? r.image : r.image, base_name: r.name, shared, overridden: Boolean(o), is_active: o ? o.is_active : (r.is_active ?? true) };
    });
}

/**
 * Biểu mẫu của một đầu việc cho một LOẠI vụ (điểm 2): bản chỉnh của cơ sở đúng loại → bản chỉnh "mọi loại" → biểu mẫu chuẩn (đầu việc dùng chung, vật nuôi/thủy sản)
 * → form gốc. Không truyền loại thì chỉ xét bản chỉnh "mọi loại" và form gốc (như trước đây).
 */
export function fieldsForKind(r: WorkTypeRow, orgId: string | undefined, kind?: string): FieldDef[] {
  const shared = !r.organization_id;
  const any = shared && orgId ? r.ov?.[orgId] : undefined;
  const byKind = shared && orgId && kind ? r.ovk?.[orgId]?.[kind] : undefined;
  return byKind?.field_schema ?? any?.field_schema ?? (shared ? standardFieldsFor(kind, r.code) : undefined) ?? r.field_schema ?? [];
}

export function effectiveWorkTypes(rows: WorkTypeRow[], orgId: string | undefined, kind?: string): EffWorkType[] {
  return rows
    .filter((r) => !r.organization_id || r.organization_id === orgId)
    .map((r) => {
      const shared = !r.organization_id;
      const o = shared && orgId ? r.ov?.[orgId] : undefined;
      return {
        ...r, name: o?.display_name ?? r.name, description: o ? o.description ?? r.description : r.description, base_name: r.name, shared, overridden: Boolean(o),
        field_schema: fieldsForKind(r, orgId, kind),
        material_ids: (shared ? o?.material_ids : null) ?? r.material_ids ?? [],
        is_active: o ? o.is_active : (r.is_active ?? true),
      };
    });
}

/**
 * Đầu việc chọn được cho một loại vụ: bỏ việc không áp dụng cho loại đó (applies_to), và nếu cơ sở đã tự có việc cùng tên với việc dùng chung
 * (ví dụ đã áp gói heo cũ) thì chỉ hiện việc của cơ sở để khỏi trùng. Không có loại (null) thì giữ nguyên.
 */
export function workTypesForKind<T extends { name: string; shared: boolean; applies_to?: string[] | null }>(list: T[], kind: string | undefined): T[] {
  if (!kind || kind === 'other') return list; // loại "Khác" hoặc chưa rõ loại: hiện đủ
  const ok = list.filter((w) => !w.applies_to || w.applies_to.length === 0 || w.applies_to.includes(kind));
  const mine = new Set(ok.filter((w) => !w.shared).map((w) => w.name.trim().toLowerCase()));
  return ok.filter((w) => !w.shared || !mine.has(w.name.trim().toLowerCase()));
}

/** Danh mục hiệu lực của cơ sở đang chọn, cập nhật theo bản lưu trên máy (dùng được offline) */
export function useCatalog() {
  const { active } = useOrgs();
  const crops = useTable('cropTypes');
  const types = useTable('workTypes');
  return useMemo(
    () => ({ cropTypes: effectiveCrops(crops, active?.id), workTypes: effectiveWorkTypes(types, active?.id) }),
    [crops, types, active?.id],
  );
}

/** Đầu việc hiệu lực theo loại của vụ (biểu mẫu theo loại; `filter` bỏ việc không áp dụng cho loại đó) */
export function useKindWorkTypes(kind: string | undefined, filter = false) {
  const { active } = useOrgs();
  const types = useTable('workTypes');
  return useMemo(() => {
    const all = effectiveWorkTypes(types, active?.id, kind);
    return filter ? workTypesForKind(all, kind) : all;
  }, [types, active?.id, kind, filter]);
}

/** Biểu mẫu Thu hoạch (đầu việc dùng chung mã 'harvesting') cho một loại vụ */
export const harvestSchemaFor = (types: WorkTypeRow[], orgId: string | undefined, kind: string | undefined): FieldDef[] =>
  (() => {
    const all = effectiveWorkTypes(types, orgId, kind);
    // việc Thu hoạch riêng cho từng đối tượng (mã harvesting / harvesting_lv / harvesting_aq); CSDL chưa cập nhật thì dùng mã cũ
    return (all.find((w) => w.code === sharedCodeFor(kind ?? 'crop', 'harvesting')) ?? all.find((w) => w.code === 'harvesting'))?.field_schema ?? [];
  })();

/** Loại sản phẩm (crop/livestock/aquatic/other) của khu: khu cơ sở vật chất không có loại; mã cũ 'growing' coi như trồng trọt */
export const productKindOfArea = (k: string | null | undefined): string | undefined => (!k || k === 'facility' ? undefined : k === 'growing' ? 'crop' : k);
