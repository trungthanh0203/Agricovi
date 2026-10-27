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
export interface StageRow { id: string; template_id: string; seq: number; name: string; work_type_id: string | null; duration_days: number; note: string | null; phase_id?: string | null; importance?: Importance }
/** Mức độ quan trọng của một việc trong quy trình */
export type Importance = 'high' | 'normal' | 'low';
export const IMPORTANCE_LABEL: Record<Importance, string> = { high: 'Cao', normal: 'Trung bình', low: 'Thấp' };
/** Công đoạn của quy trình: nhóm các việc; chỉ có số thứ tự (mã), tên và mô tả */
export interface PhaseRow { id: string; template_id: string; seq: number; code: string | null; name: string; description: string | null }

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
  const ovrQ = async () => {
    const r0 = await client().from('org_catalog_overrides').select('organization_id, kind, item_kind, item_id, display_name, description, image, field_schema, is_active, material_ids');
    const r = r0.error ? await client().from('org_catalog_overrides').select('organization_id, kind, item_kind, item_id, display_name, description, image, field_schema, is_active') : r0; // chưa db push 0109
    return r.error ? client().from('org_catalog_overrides').select('organization_id, item_kind, item_id, display_name, description, image, field_schema, is_active') : r; // chưa db push 0107
  };
  const [crops, types, ovr] = await Promise.all([
    cropsQ(),
    (async () => {
      const r = await client().from('work_types').select('id, code, name, description, field_schema, organization_id, is_active, applies_to, material_ids');
      if (!r.error) return r;
      const r2 = await client().from('work_types').select('id, code, name, description, field_schema, organization_id, is_active, applies_to'); // chưa db push 0109
      return r2.error ? client().from('work_types').select('id, code, name, description, field_schema, organization_id, is_active') : r2; // chưa db push 0107
    })(),
    ovrQ(),
  ]);
  if (crops.error) throw new Error(crops.error.message);
  if (types.error) throw new Error(types.error.message);
  const ov = { crop_type: new Map<string, Record<string, CatalogOverride>>(), work_type: new Map<string, Record<string, CatalogOverride>>() };
  const ovk = new Map<string, Record<string, Record<string, CatalogOverride>>>(); // loại việc: mục → cơ sở → loại → bản chỉnh theo loại
  for (const o of (ovr.error ? [] : ovr.data ?? []) as unknown as Array<{ organization_id: string; kind?: string; item_kind: 'crop_type' | 'work_type'; item_id: string } & CatalogOverride>) {
    const one: CatalogOverride = { display_name: o.display_name, description: o.description ?? null, image: o.image ?? null, field_schema: o.field_schema, material_ids: o.material_ids ?? null, is_active: o.is_active };
    if (o.kind) {
      const byOrg = ovk.get(o.item_id) ?? {};
      byOrg[o.organization_id] = { ...(byOrg[o.organization_id] ?? {}), [o.kind]: one };
      ovk.set(o.item_id, byOrg);
    } else {
      const m = ov[o.item_kind];
      m.set(o.item_id, { ...(m.get(o.item_id) ?? {}), [o.organization_id]: one });
    }
  }
  await db.transaction('rw', db.cropTypes, db.workTypes, async () => {
    await db.cropTypes.clear();
    await db.workTypes.clear();
    await db.cropTypes.bulkPut((crops.data ?? []).map((c) => ({ ...c, ov: ov.crop_type.get(c.id) })));
    await db.workTypes.bulkPut((types.data ?? []).map((w) => ({ ...w, ov: ov.work_type.get(w.id), ovk: ovk.get(w.id) })));
  });
}

/**
 * Chỉnh một mục có sẵn dùng chung cho riêng cơ sở này (đổi tên, trường ghi, dừng/dùng lại).
 * `fieldKind` = loại vụ mà bản chỉnh áp dụng ('' = mọi loại, mặc định; 'crop'/'livestock'/'aquatic'/'other' = chỉ cho loại đó).
 * Chưa db push 0107 (chưa có cột kind) thì bản chỉnh "mọi loại" vẫn lưu được như cũ.
 */
export async function saveOverride(
  orgId: string, kind: 'crop_type' | 'work_type', itemId: string,
  patch: { display_name?: string | null; description?: string | null; image?: string | null; field_schema?: FieldDef[] | null; material_ids?: string[] | null; is_active?: boolean },
  fieldKind = '',
): Promise<void> {
  needOnline('chỉnh mục có sẵn');
  const sel = () => client().from('org_catalog_overrides').select('*')
    .eq('organization_id', orgId).eq('item_kind', kind).eq('item_id', itemId);
  let cur = await sel().eq('kind', fieldKind).maybeSingle();
  if (cur.error && fieldKind === '') cur = await sel().maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  const base = (cur.data as CatalogOverride | null) ?? { display_name: null, description: null, image: null, field_schema: null, is_active: true };
  const row = {
    organization_id: orgId, item_kind: kind, item_id: itemId,
    display_name: patch.display_name === undefined ? base.display_name : (patch.display_name?.trim() || null),
    description: patch.description === undefined ? base.description ?? null : (patch.description?.trim() || null),
    image: patch.image === undefined ? base.image ?? null : (patch.image || null),
    field_schema: patch.field_schema === undefined ? base.field_schema : patch.field_schema,
    ...(patch.material_ids !== undefined ? { material_ids: patch.material_ids } : base.material_ids !== undefined ? { material_ids: base.material_ids } : {}),
    is_active: patch.is_active ?? base.is_active,
  };
  let up = await client().from('org_catalog_overrides').upsert({ ...row, kind: fieldKind }, { onConflict: 'organization_id,item_kind,item_id,kind' });
  if (up.error && fieldKind === '') up = await client().from('org_catalog_overrides').upsert(row, { onConflict: 'organization_id,item_kind,item_id' });
  if (up.error) throw new Error(up.error.message);
  await refreshCatalogCache().catch(() => undefined);
}

/** Bỏ bản chỉnh: mục trở về mặc định của nền tảng (cho loại `fieldKind`; '' = bản chỉnh mọi loại) */
export async function clearOverride(orgId: string, kind: 'crop_type' | 'work_type', itemId: string, fieldKind = ''): Promise<void> {
  needOnline('khôi phục mặc định');
  const del = () => client().from('org_catalog_overrides').delete().eq('organization_id', orgId).eq('item_kind', kind).eq('item_id', itemId);
  let r = await del().eq('kind', fieldKind);
  if (r.error && fieldKind === '') r = await del();
  if (r.error) throw new Error(r.error.message);
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
export async function createWorkType(orgId: string, name: string, fields: FieldDef[], description = '', appliesTo: string[] | null = null, materialIds: string[] = []): Promise<void> {
  needOnline('thêm loại việc');
  await ok(client().from('work_types').insert({ organization_id: orgId, name: name.trim(), description: description.trim() || null, field_schema: fields, ...(appliesTo && appliesTo.length > 0 ? { applies_to: appliesTo } : {}), ...(materialIds.length > 0 ? { material_ids: materialIds } : {}) }));
  await refreshCatalogCache().catch(() => undefined);
}

export async function updateWorkType(id: string, c: { name?: string; description?: string | null; field_schema?: FieldDef[]; is_active?: boolean; applies_to?: string[] | null; material_ids?: string[] }): Promise<void> {
  needOnline('sửa loại việc');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.field_schema !== undefined) patch.field_schema = c.field_schema;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  if (c.applies_to !== undefined) patch.applies_to = c.applies_to && c.applies_to.length > 0 ? c.applies_to : null;
  if (c.material_ids !== undefined) patch.material_ids = c.material_ids;
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

export async function loadTemplate(id: string): Promise<{ template: TemplateRow; stages: StageRow[]; phases: PhaseRow[] }> {
  const c = client();
  const [t, st, ph] = await Promise.all([
    ok(c.from('cycle_templates').select('id, organization_id, crop_type_id, name, note, version, is_active, updated_at, template_stages(id, duration_days)').eq('id', id).single()),
    (async () => {
      const r = await c.from('template_stages').select('id, template_id, seq, name, work_type_id, duration_days, note, phase_id, importance').eq('template_id', id).order('seq');
      if (!r.error) return r.data;
      return ok(c.from('template_stages').select('id, template_id, seq, name, work_type_id, duration_days, note').eq('template_id', id).order('seq')); // chưa db push 0109
    })(),
    (async () => {
      const r = await c.from('template_phases').select('id, template_id, seq, code, name, description').eq('template_id', id).order('seq');
      return r.error ? [] : r.data; // chưa db push 0109
    })(),
  ]);
  return { template: t as unknown as TemplateRow, stages: (st ?? []) as StageRow[], phases: (ph ?? []) as PhaseRow[] };
}

export async function addStage(templateId: string, s: { work_type_id: string; duration_days: number; note?: string; phase_id?: string | null; importance?: Importance }): Promise<string> {
  needOnline('thêm việc');
  const r = await ok(client().from('template_stages').insert({ template_id: templateId, work_type_id: s.work_type_id, duration_days: s.duration_days, note: s.note?.trim() || null, ...(s.phase_id ? { phase_id: s.phase_id } : {}), ...(s.importance ? { importance: s.importance } : {}) }).select('id').single());
  return (r as { id: string }).id;
}
/** Đổi việc (chọn từ danh mục) và/hoặc số ngày của giai đoạn */
export async function updateStage(id: string, s: { work_type_id?: string; duration_days?: number; note?: string | null; importance?: Importance; phase_id?: string | null }): Promise<void> {
  needOnline('sửa việc');
  const patch = { ...s, ...(s.note !== undefined ? { note: s.note?.trim() || null } : {}) };
  await ok(client().from('template_stages').update(patch).eq('id', id));
}
export async function deleteStage(id: string): Promise<void> {
  needOnline('xóa việc');
  await ok(client().from('template_stages').delete().eq('id', id));
}
/** Sắp xếp lại toàn bộ giai đoạn (kéo thả hoặc nút lên/xuống): ids theo thứ tự mới */
export async function reorderStages(templateId: string, ids: string[]): Promise<void> {
  needOnline('đổi thứ tự giai đoạn');
  await ok(client().rpc('reorder_template_stages', { p_template: templateId, p_order: ids }));
}

// ------------------------------------------------------------------ công đoạn của quy trình (migration 0109)
export async function addPhase(templateId: string, p: { code?: string; name: string; description?: string }): Promise<string> {
  needOnline('thêm công đoạn');
  const r = await ok(client().from('template_phases').insert({ template_id: templateId, code: p.code?.trim() || null, name: p.name.trim(), description: p.description?.trim() || null }).select('id').single());
  return (r as { id: string }).id;
}
export async function updatePhase(id: string, p: { code?: string | null; name?: string; description?: string | null }): Promise<void> {
  needOnline('sửa công đoạn');
  const patch: Record<string, unknown> = {};
  if (p.code !== undefined) patch.code = p.code?.trim() || null;
  if (p.name !== undefined) patch.name = p.name.trim();
  if (p.description !== undefined) patch.description = p.description?.trim() || null;
  await ok(client().from('template_phases').update(patch).eq('id', id));
}
/** Xóa công đoạn: các việc bên trong không mất, chỉ thành "chưa xếp công đoạn" */
export async function deletePhase(id: string): Promise<void> {
  needOnline('xóa công đoạn');
  await ok(client().from('template_phases').delete().eq('id', id));
}
/** Đổi chỗ hai công đoạn kề nhau */
export async function swapPhases(a: { id: string; seq: number }, b: { id: string; seq: number }): Promise<void> {
  needOnline('đổi thứ tự công đoạn');
  await ok(client().from('template_phases').update({ seq: b.seq }).eq('id', a.id));
  await ok(client().from('template_phases').update({ seq: a.seq }).eq('id', b.id));
}

/**
 * Thứ tự toàn bộ việc của quy trình: theo công đoạn (đúng thứ tự công đoạn), trong công đoạn theo thứ tự hiện có, việc chưa xếp công đoạn ở cuối.
 * Tạo vụ sao chép việc theo thứ tự này nên mọi thay đổi cấu trúc đều gọi reorderStages với kết quả của hàm này.
 */
export function flatOrder(phases: { id: string; seq: number }[], stages: { id: string; seq: number; phase_id?: string | null }[]): string[] {
  const bySeq = <T extends { seq: number }>(a: T[]) => [...a].sort((x, y) => x.seq - y.seq);
  const known = new Set(phases.map((p) => p.id));
  const out: string[] = [];
  for (const p of bySeq(phases)) for (const s of bySeq(stages.filter((x) => x.phase_id === p.id))) out.push(s.id);
  for (const s of bySeq(stages.filter((x) => !x.phase_id || !known.has(x.phase_id)))) out.push(s.id);
  return out;
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
