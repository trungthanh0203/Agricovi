import { db, type CatalogOverride, type FieldDef } from './db';
import { supabase } from './supabase';

/**
 * Khai báo sản phẩm, loại việc và quy trình mùa vụ mẫu của cơ sở (D28, P1).
 * Việc khai báo cần mạng và ghi thẳng lên máy chủ (D24). Sản phẩm và loại việc được lưu lại trên máy để dùng offline khi ghi việc.
 */

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}
async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------------------------------------------ kiểu dữ liệu
export interface TemplateRow {
  id: string; organization_id: string; crop_type_id: string; name: string; note: string | null;
  version: number; is_active: boolean; updated_at: string;
  template_stages: { id: string; duration_days: number }[];
}
/** Giai đoạn = một việc chọn từ danh mục + số ngày. `name` là tên việc lúc chọn (máy chủ tự điền). */
export interface StageRow { id: string; template_id: string; seq: number; name: string; work_type_id: string | null; duration_days: number; note: string | null }

// ------------------------------------------------------------------ bản lưu trên máy (dùng khi ghi việc, tạo vụ, hiển thị)
/**
 * Tải lại sản phẩm và loại việc (kể cả đã dừng, để lịch sử vẫn hiện đúng tên) cùng bản chỉnh của các cơ sở về máy.
 * Bản chỉnh lỗi/chưa có (CSDL chưa cập nhật) thì coi như không có, không làm hỏng phần còn lại.
 */
export async function refreshCatalogCache(): Promise<void> {
  const cropsQ = async () => {
    const r = await client().from('crop_types').select('id, code, name, description, kind, kind_item, image, organization_id, is_active');
    return r.error ? client().from('crop_types').select('id, code, name, description, kind, image, organization_id, is_active') : r; // chưa db push 0098
  };
  const [crops, types, ovr] = await Promise.all([
    cropsQ(),
    client().from('work_types').select('id, code, name, description, field_schema, organization_id, is_active'),
    client().from('org_catalog_overrides').select('organization_id, item_kind, item_id, display_name, description, image, field_schema, is_active'),
  ]);
  if (crops.error) throw new Error(crops.error.message);
  if (types.error) throw new Error(types.error.message);
  const ov = { crop_type: new Map<string, Record<string, CatalogOverride>>(), work_type: new Map<string, Record<string, CatalogOverride>>() };
  for (const o of (ovr.error ? [] : ovr.data ?? []) as Array<{ organization_id: string; item_kind: 'crop_type' | 'work_type'; item_id: string } & CatalogOverride>) {
    const m = ov[o.item_kind];
    m.set(o.item_id, { ...(m.get(o.item_id) ?? {}), [o.organization_id]: { display_name: o.display_name, description: o.description ?? null, image: o.image ?? null, field_schema: o.field_schema, is_active: o.is_active } });
  }
  await db.transaction('rw', db.cropTypes, db.workTypes, async () => {
    await db.cropTypes.clear();
    await db.workTypes.clear();
    await db.cropTypes.bulkPut((crops.data ?? []).map((c) => ({ ...c, ov: ov.crop_type.get(c.id) })));
    await db.workTypes.bulkPut((types.data ?? []).map((w) => ({ ...w, ov: ov.work_type.get(w.id) })));
  });
}

/** Chỉnh một mục có sẵn dùng chung cho riêng cơ sở này (đổi tên, trường ghi, dừng/dùng lại) */
export async function saveOverride(
  orgId: string, kind: 'crop_type' | 'work_type', itemId: string,
  patch: { display_name?: string | null; description?: string | null; image?: string | null; field_schema?: FieldDef[] | null; is_active?: boolean },
): Promise<void> {
  needOnline('chỉnh mục có sẵn');
  const cur = await ok(client().from('org_catalog_overrides').select('display_name, description, image, field_schema, is_active')
    .eq('organization_id', orgId).eq('item_kind', kind).eq('item_id', itemId).maybeSingle());
  const base = (cur as CatalogOverride | null) ?? { display_name: null, description: null, image: null, field_schema: null, is_active: true };
  const row = {
    organization_id: orgId, item_kind: kind, item_id: itemId,
    display_name: patch.display_name === undefined ? base.display_name : (patch.display_name?.trim() || null),
    description: patch.description === undefined ? base.description ?? null : (patch.description?.trim() || null),
    image: patch.image === undefined ? base.image ?? null : (patch.image || null),
    field_schema: patch.field_schema === undefined ? base.field_schema : patch.field_schema,
    is_active: patch.is_active ?? base.is_active,
  };
  await ok(client().from('org_catalog_overrides').upsert(row, { onConflict: 'organization_id,item_kind,item_id' }));
  await refreshCatalogCache().catch(() => undefined);
}

/** Bỏ bản chỉnh: mục trở về mặc định của nền tảng */
export async function clearOverride(orgId: string, kind: 'crop_type' | 'work_type', itemId: string): Promise<void> {
  needOnline('khôi phục mặc định');
  await ok(client().from('org_catalog_overrides').delete().eq('organization_id', orgId).eq('item_kind', kind).eq('item_id', itemId));
  await refreshCatalogCache().catch(() => undefined);
}

// ------------------------------------------------------------------ sản phẩm
import type { ProductKind } from './config';
export type { ProductKind } from './config';

export async function createCrop(orgId: string, f: { name: string; kind: ProductKind; kindItem?: string | null; description?: string; image?: string }): Promise<void> {
  needOnline('thêm sản phẩm');
  await ok(client().from('crop_types').insert({
    organization_id: orgId, name: f.name.trim(), kind: f.kind, ...(f.kindItem ? { kind_item: f.kindItem } : {}), description: f.description?.trim() || null, image: f.image || null,
  }));
  await refreshCatalogCache().catch(() => undefined);
}

export async function updateCrop(id: string, c: { name?: string; kind?: ProductKind; kindItem?: string | null; description?: string | null; image?: string | null; is_active?: boolean }): Promise<void> {
  needOnline('sửa sản phẩm');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.kind !== undefined) patch.kind = c.kind;
  if (c.kindItem !== undefined) patch.kind_item = c.kindItem;
  if (c.image !== undefined) patch.image = c.image || null;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  await ok(client().from('crop_types').update(patch).eq('id', id));
  await refreshCatalogCache().catch(() => undefined);
}

// ------------------------------------------------------------------ loại việc
export async function createWorkType(orgId: string, name: string, fields: FieldDef[], description = ''): Promise<void> {
  needOnline('thêm loại việc');
  await ok(client().from('work_types').insert({ organization_id: orgId, name: name.trim(), description: description.trim() || null, field_schema: fields }));
  await refreshCatalogCache().catch(() => undefined);
}

export async function updateWorkType(id: string, c: { name?: string; description?: string | null; field_schema?: FieldDef[]; is_active?: boolean }): Promise<void> {
  needOnline('sửa loại việc');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.field_schema !== undefined) patch.field_schema = c.field_schema;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  await ok(client().from('work_types').update(patch).eq('id', id));
  await refreshCatalogCache().catch(() => undefined);
}

/** Khóa ổn định cho trường dữ liệu của loại việc (không đổi khi sửa nhãn, để nhật ký cũ vẫn hiện đúng) */
export const newFieldKey = () => `f${Math.random().toString(36).slice(2, 8)}`;

// ------------------------------------------------------------------ quy trình mẫu
export async function listTemplates(orgId: string): Promise<TemplateRow[]> {
  const rows = await ok(
    client().from('cycle_templates')
      .select('id, organization_id, crop_type_id, name, note, version, is_active, updated_at, template_stages(id, duration_days)')
      .eq('organization_id', orgId).order('name'),
  );
  return (rows ?? []) as unknown as TemplateRow[];
}

export async function createTemplate(orgId: string, cropTypeId: string, name: string, note: string): Promise<string> {
  needOnline('tạo quy trình mẫu');
  const row = await ok(
    client().from('cycle_templates')
      .insert({ organization_id: orgId, crop_type_id: cropTypeId, name: name.trim(), note: note.trim() || null })
      .select('id').single(),
  );
  return (row as { id: string }).id;
}

export async function updateTemplate(id: string, c: { name?: string; note?: string | null; is_active?: boolean }): Promise<void> {
  needOnline('sửa quy trình mẫu');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.note !== undefined) patch.note = c.note?.trim() || null;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  await ok(client().from('cycle_templates').update(patch).eq('id', id));
}

/** Xóa quy trình mẫu (kèm các giai đoạn). Mẫu đã có vụ dùng thì máy chủ từ chối: chỉ ngừng dùng được. */
export async function deleteTemplate(id: string): Promise<void> {
  needOnline('xóa quy trình mẫu');
  await ok(client().from('cycle_templates').delete().eq('id', id));
}

export async function duplicateTemplate(id: string, name: string): Promise<string> {
  needOnline('nhân bản quy trình mẫu');
  return (await ok(client().rpc('duplicate_cycle_template', { p_template: id, p_name: name.trim() }))) as string;
}

export async function loadTemplate(id: string): Promise<{ template: TemplateRow; stages: StageRow[] }> {
  const c = client();
  const [t, st] = await Promise.all([
    ok(c.from('cycle_templates').select('id, organization_id, crop_type_id, name, note, version, is_active, updated_at, template_stages(id, duration_days)').eq('id', id).single()),
    ok(c.from('template_stages').select('id, template_id, seq, name, work_type_id, duration_days, note').eq('template_id', id).order('seq')),
  ]);
  return { template: t as unknown as TemplateRow, stages: (st ?? []) as StageRow[] };
}

export async function addStage(templateId: string, s: { work_type_id: string; duration_days: number; note?: string }): Promise<void> {
  needOnline('thêm giai đoạn');
  await ok(client().from('template_stages').insert({ template_id: templateId, work_type_id: s.work_type_id, duration_days: s.duration_days, note: s.note?.trim() || null }));
}
/** Đổi việc (chọn từ danh mục) và/hoặc số ngày của giai đoạn */
export async function updateStage(id: string, s: { work_type_id?: string; duration_days?: number; note?: string | null }): Promise<void> {
  needOnline('sửa giai đoạn');
  const patch = { ...s, ...(s.note !== undefined ? { note: s.note?.trim() || null } : {}) };
  await ok(client().from('template_stages').update(patch).eq('id', id));
}
export async function deleteStage(id: string): Promise<void> {
  needOnline('xóa giai đoạn');
  await ok(client().from('template_stages').delete().eq('id', id));
}
/** Sắp xếp lại toàn bộ giai đoạn (kéo thả hoặc nút lên/xuống): ids theo thứ tự mới */
export async function reorderStages(templateId: string, ids: string[]): Promise<void> {
  needOnline('đổi thứ tự giai đoạn');
  await ok(client().rpc('reorder_template_stages', { p_template: templateId, p_order: ids }));
}

// ------------------------------------------------------------------ tính ngày (dùng cả để xem trước ở trình soạn)
/** Tổng số ngày của quy trình */
export const totalDays = (stages: { duration_days: number }[]) => stages.reduce((s, x) => s + x.duration_days, 0);

/** Khoảng ngày (tính từ ngày 1 của cả quy trình) của từng giai đoạn */
export function stageRanges(stages: { id: string; duration_days: number }[]): Map<string, { from: number; to: number }> {
  const m = new Map<string, { from: number; to: number }>();
  let day = 1;
  for (const s of stages) {
    m.set(s.id, { from: day, to: day + s.duration_days - 1 });
    day += s.duration_days;
  }
  return m;
}
