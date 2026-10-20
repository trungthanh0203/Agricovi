import { db, type FieldDef } from './db';
import { supabase } from './supabase';

/**
 * Khai báo cây trồng, loại việc và quy trình mùa vụ mẫu của cơ sở (D28, P1).
 * Việc khai báo cần mạng và ghi thẳng lên máy chủ (D24). Cây trồng và loại việc được lưu lại trên máy để dùng offline khi ghi việc.
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
export interface CropRow { id: string; organization_id: string | null; code: string; name: string; is_active: boolean }
export interface WorkTypeFull { id: string; organization_id: string | null; code: string; name: string; field_schema: FieldDef[]; is_active: boolean }
export interface TemplateRow {
  id: string; organization_id: string; crop_type_id: string; name: string; note: string | null;
  version: number; is_active: boolean; updated_at: string;
  template_stages: { id: string; duration_days: number }[];
}
/** Giai đoạn = một việc chọn từ danh mục + số ngày. `name` là tên việc lúc chọn (máy chủ tự điền). */
export interface StageRow { id: string; template_id: string; seq: number; name: string; work_type_id: string | null; duration_days: number; note: string | null }

// ------------------------------------------------------------------ bản lưu trên máy (dùng khi ghi việc, tạo vụ)
/** Tải lại danh sách cây trồng và loại việc đang dùng về máy (sau khi khai báo hoặc đồng bộ) */
export async function refreshCatalogCache(): Promise<void> {
  const [crops, types] = await Promise.all([
    client().from('crop_types').select('id, code, name, organization_id').eq('is_active', true),
    client().from('work_types').select('id, code, name, field_schema, organization_id').eq('is_active', true),
  ]);
  if (crops.error) throw new Error(crops.error.message);
  if (types.error) throw new Error(types.error.message);
  await db.transaction('rw', db.cropTypes, db.workTypes, async () => {
    await db.cropTypes.clear();
    await db.workTypes.clear();
    await db.cropTypes.bulkPut(crops.data ?? []);
    await db.workTypes.bulkPut(types.data ?? []);
  });
}

// ------------------------------------------------------------------ cây trồng
export async function listCrops(orgId: string): Promise<CropRow[]> {
  const rows = await ok(client().from('crop_types').select('id, organization_id, code, name, is_active').order('name'));
  return ((rows ?? []) as CropRow[]).filter((c) => c.organization_id === null || c.organization_id === orgId);
}

export async function createCrop(orgId: string, name: string): Promise<void> {
  needOnline('thêm cây trồng');
  await ok(client().from('crop_types').insert({ organization_id: orgId, name: name.trim() }));
  await refreshCatalogCache().catch(() => undefined);
}

export async function updateCrop(id: string, c: { name?: string; is_active?: boolean }): Promise<void> {
  needOnline('sửa cây trồng');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  await ok(client().from('crop_types').update(patch).eq('id', id));
  await refreshCatalogCache().catch(() => undefined);
}

// ------------------------------------------------------------------ loại việc
export async function listWorkTypes(orgId: string): Promise<WorkTypeFull[]> {
  const rows = await ok(client().from('work_types').select('id, organization_id, code, name, field_schema, is_active').order('name'));
  return ((rows ?? []) as WorkTypeFull[]).filter((w) => w.organization_id === null || w.organization_id === orgId);
}

export async function createWorkType(orgId: string, name: string, fields: FieldDef[]): Promise<void> {
  needOnline('thêm loại việc');
  await ok(client().from('work_types').insert({ organization_id: orgId, name: name.trim(), field_schema: fields }));
  await refreshCatalogCache().catch(() => undefined);
}

export async function updateWorkType(id: string, c: { name?: string; field_schema?: FieldDef[]; is_active?: boolean }): Promise<void> {
  needOnline('sửa loại việc');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
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

export async function addStage(templateId: string, s: { work_type_id: string; duration_days: number }): Promise<void> {
  needOnline('thêm giai đoạn');
  await ok(client().from('template_stages').insert({ template_id: templateId, work_type_id: s.work_type_id, duration_days: s.duration_days }));
}
/** Đổi việc (chọn từ danh mục) và/hoặc số ngày của giai đoạn */
export async function updateStage(id: string, s: { work_type_id?: string; duration_days?: number }): Promise<void> {
  needOnline('sửa giai đoạn');
  await ok(client().from('template_stages').update(s).eq('id', id));
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
