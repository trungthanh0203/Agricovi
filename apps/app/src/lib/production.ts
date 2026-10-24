import type { CycleStatus } from '@agriconnect/shared';
import { db, type AreaRow, type CycleRow, type LogRow, type NoteRow, type StageRow } from './db';
import { syncFinanceDown } from './finance';
import { refreshCatalogCache } from './templates';
import { syncHarvestsDown } from './harvest';
import { syncIncidentsDown, syncWithdrawalsDown } from './incidents';
import { toLocalInput } from './hooks';
import { syncInventoryDown } from './inventory';
import { enqueue, flushOutbox } from './outbox';
import { insertAndCache, requireOnline, updateAndCache } from './serverWrite';
import { supabase } from './supabase';

const CYCLE_COLUMNS_BASE =
  'id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date, note, version, created_at, name, template_id, template_name, template_version';
// cột kế hoạch (D93) chỉ có sau khi CSDL được cập nhật; chưa cập nhật thì tải bản không có để KHÔNG làm hỏng đồng bộ cả danh sách vụ
const CYCLE_COLUMNS = `${CYCLE_COLUMNS_BASE}, target_yield_kg, budget_amount, planted_area_m2, plant_count, variety_name, seed_source, seed_lot, sowing_date, planting_date`;
const missingPlanColumns = (e: { message?: string; code?: string } | null) => !!e && (e.code === '42703' || /target_yield_kg|budget_amount|planted_area|variety_name|column/i.test(e.message ?? ''));
const STAGE_COLUMNS =
  'id, cycle_id, name, seq, work_type_id, duration_days, planned_start, planned_end, actual_start, actual_end, status, note';

const NOTE_COLUMNS = 'id, cycle_id, organization_id, note_date, content, done, created_by, author_name, created_at';

const LOG_COLUMNS =
  'id, organization_id, cycle_id, area_id, work_type_id, stage_id, performed_at, data, note, voided_at, void_reason, version, created_by, performed_by, author_name, author_roles, received_at';

/** Tải dữ liệu về thiết bị để dùng offline. Không ghi đè bản ghi đang chờ gửi hoặc đang xung đột. */
export async function syncDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  await flushOutbox().catch((e) => console.warn('Chưa gửi hết phần chờ', e)); // gửi phần còn chờ trước để dữ liệu nhìn thấy khớp máy chủ

  const pendingIds = new Set(
    (await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string),
  );
  const fresh = <T extends { id: string }>(rows: T[] | null) => (rows ?? []).filter((r) => !pendingIds.has(r.id));

  const [areas, cycles, logs, stages, notes] = await Promise.all([
    supabase.from('production_areas').select('id, organization_id, name, description, location, area_size, area_unit, image, is_active'),
    supabase.from('production_cycles').select(CYCLE_COLUMNS),
    supabase.from('activity_logs').select(LOG_COLUMNS).order('performed_at', { ascending: false }).limit(200),
    supabase.from('production_stages').select(STAGE_COLUMNS),
    supabase.from('cycle_notes').select(NOTE_COLUMNS).order('note_date', { ascending: false }).limit(1000),
  ]);
  let cyclesRes: { data: unknown; error: { message?: string; code?: string } | null } = cycles;
  if (cycles.error && missingPlanColumns(cycles.error)) cyclesRes = await supabase.from('production_cycles').select(CYCLE_COLUMNS_BASE);
  // mỗi bảng độc lập: bảng nào tải được thì vẫn ghi vào máy, lỗi của bảng khác chỉ báo ở cuối (không để một bảng lỗi làm mất cả danh sách vụ)
  const firstErr = [areas, cyclesRes, logs].find((r) => r.error)?.error ?? null;
  // Các phần còn lại độc lập nhau nên tải song song (trước đây tải tuần tự, chậm hơn nhiều khi mạng yếu).
  // Vật tư/kho, thu hoạch, chi phí/doanh thu: lỗi ở đây không làm hỏng đồng bộ sản xuất.
  const extras = Promise.all([
    refreshCatalogCache(), // sản phẩm, loại việc và bản chỉnh của cơ sở
    syncInventoryDown().catch((e) => console.warn('Không tải được vật tư/kho', e)),
    syncHarvestsDown().catch((e) => console.warn('Không tải được thu hoạch', e)),
    syncFinanceDown().catch((e) => console.warn('Không tải được chi phí/doanh thu', e)),
    syncIncidentsDown().catch((e) => console.warn('Không tải được sự cố', e)),
    syncWithdrawalsDown().catch((e) => console.warn('Không tải được thời gian cách ly', e)),
  ]);

  extras.catch(() => undefined); // lỗi được báo ở lệnh await cuối, tránh cảnh báo sớm

  await db.transaction('rw', [db.areas, db.cycles, db.logs, db.stages, db.notes], async () => {
    // giai đoạn chưa có (CSDL chưa cập nhật) thì bỏ qua, không làm hỏng phần còn lại
    if (!stages.error) {
      await db.stages.clear(); // giai đoạn đã xóa ở nơi khác thì bỏ khỏi máy
      await db.stages.bulkPut((stages.data ?? []) as StageRow[]);
    }
    if (!notes.error) {
      await db.notes.clear();
      await db.notes.bulkPut((notes.data ?? []) as NoteRow[]);
    }
    if (!areas.error) await db.areas.bulkPut(fresh(areas.data as AreaRow[]));
    if (!cyclesRes.error) await db.cycles.bulkPut(fresh(cyclesRes.data as CycleRow[]));
    if (!logs.error) await db.logs.bulkPut(fresh(logs.data as LogRow[]));
  });
  await extras;
  if (firstErr) throw new Error(firstErr.message ?? 'Không tải được dữ liệu sản xuất');
}

/**
 * Tải thêm nhật ký cũ hơn từ máy chủ (bộ nhớ trên máy chỉ giữ 200 bản ghi gần nhất).
 * Trả về số bản ghi mới tải được.
 */
export async function loadOlderLogs(beforeIso: string, limit = 100): Promise<number> {
  if (!supabase || !navigator.onLine) throw new Error('Cần có mạng để xem nhật ký cũ hơn.');
  const { data, error } = await supabase
    .from('activity_logs').select(LOG_COLUMNS)
    .lt('performed_at', beforeIso).order('performed_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const pendingIds = new Set(
    (await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string),
  );
  const rows = ((data ?? []) as LogRow[]).filter((r) => !pendingIds.has(r.id));
  await db.logs.bulkPut(rows);
  return rows.length;
}

export interface QuotaContext {
  kind: 'own' | 'cooperative';
  org_id: string;
  org_name: string;
  plan_name: string | null;
  max_cycles: number | null;
  used_cycles: number;
  is_current: boolean;
}

export async function fetchQuotaContexts(householdId: string): Promise<QuotaContext[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('quota_contexts', { p_household: householdId });
  if (error) throw error;
  return (data ?? []) as QuotaContext[];
}

/** Thêm trang trại (cần mạng, quyết định D24) */
export interface FarmInput {
  name: string;
  location?: string | null;
  area_size?: number | null;
  area_unit?: 'm2' | 'ha';
  description?: string | null;
  image?: string | null;
}

export async function createArea(organizationId: string, f: FarmInput): Promise<string> {
  const id = crypto.randomUUID();
  const row: AreaRow = {
    id, organization_id: organizationId, name: f.name.trim(), description: f.description?.trim() || null,
    location: f.location?.trim() || null, area_size: f.area_size ?? null, area_unit: f.area_unit ?? 'm2', image: f.image || null,
  };
  await insertAndCache('production_areas', { ...row }, { ...row }, 'thêm trang trại');
  return id;
}

/** Đổi tên hoặc dừng/dùng lại trang trại (cần mạng). Trang trại đã dừng giữ lịch sử, không dùng để tạo vụ mới. */
export async function updateArea(id: string, c: Partial<FarmInput> & { is_active?: boolean }): Promise<void> {
  requireOnline('sửa trang trại');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.location !== undefined) patch.location = c.location?.trim() || null;
  if (c.area_size !== undefined) patch.area_size = c.area_size;
  if (c.area_unit !== undefined) patch.area_unit = c.area_unit;
  if (c.image !== undefined) patch.image = c.image || null;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  const { error } = await supabase.from('production_areas').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  await db.areas.update(id, patch);
}

export interface NewCycle {
  ownerOrgId: string;
  areaId: string;
  /** Quy trình mẫu của cơ sở sở hữu vụ (bắt buộc, P2): giai đoạn và ngày kế hoạch lấy từ mẫu */
  templateId: string;
  status: Extract<CycleStatus, 'preparing' | 'active'>;
  startDate: string | null;
  name?: string;
  /** Kế hoạch (không bắt buộc, D93) */
  targetYield?: number | null;
  budget?: number | null;
  /** Giống và diện tích (không bắt buộc, D94) */
  info?: CropInfo | null;
}

/** Giống và diện tích của vụ; diện tích theo m² (D94) */
export interface CropInfo {
  areaM2: number | null; plants: number | null; variety: string; seedSource: string; seedLot: string; sowingDate: string | null; plantingDate: string | null;
}

/** Đặt thông tin giống và diện tích của vụ (cần mạng, người quản lý vụ); trống = bỏ */
export async function setCycleInfo(cycleId: string, i: CropInfo): Promise<void> {
  requireOnline('lưu thông tin giống và diện tích');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_cycle_info', {
    p_cycle: cycleId, p_area_m2: i.areaM2, p_plants: i.plants, p_variety: i.variety, p_seed_source: i.seedSource, p_seed_lot: i.seedLot,
    p_sowing: i.sowingDate, p_planting: i.plantingDate,
  });
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId);
}

/** Tạo vụ theo quy trình mẫu (cần mạng): máy chủ kiểm hạn mức, sao chép giai đoạn và tính ngày kế hoạch */
export async function createCycle(c: NewCycle): Promise<string> {
  requireOnline('tạo vụ');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const id = crypto.randomUUID();
  const { error } = await supabase.rpc('create_cycle_from_template', {
    p_id: id, p_owner_org: c.ownerOrgId, p_area: c.areaId, p_template: c.templateId,
    p_start: c.startDate, p_status: c.status, p_name: c.name?.trim() || null,
  });
  if (error) throw new Error(error.message);
  if ((c.targetYield ?? null) !== null || (c.budget ?? null) !== null) await setCyclePlan(id, c.targetYield ?? null, c.budget ?? null).catch(() => undefined);
  if (c.info && (c.info.areaM2 !== null || c.info.plants !== null || c.info.variety.trim() || c.info.seedSource.trim() || c.info.seedLot.trim() || c.info.sowingDate || c.info.plantingDate)) {
    await setCycleInfo(id, c.info).catch(() => undefined);
  }
  await refreshCycle(id);
  return id;
}

/** Đặt sản lượng dự kiến (kg) và ngân sách dự kiến (đồng) của vụ; null = bỏ (cần mạng, người quản lý vụ) */
export async function setCyclePlan(cycleId: string, targetYield: number | null, budget: number | null): Promise<void> {
  requireOnline('đặt kế hoạch vụ');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_cycle_plan', { p_cycle: cycleId, p_target_yield: targetYield, p_budget: budget });
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId);
}

/** Tải lại một vụ cùng giai đoạn của nó từ máy chủ vào bộ nhớ trên máy */
export async function refreshCycle(id: string): Promise<void> {
  if (!supabase) return;
  let [cy, st] = await Promise.all([
    supabase.from('production_cycles').select(CYCLE_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('production_stages').select(STAGE_COLUMNS).eq('cycle_id', id),
  ]);
  if (cy.error && missingPlanColumns(cy.error)) cy = (await supabase.from('production_cycles').select(CYCLE_COLUMNS_BASE).eq('id', id).maybeSingle()) as typeof cy;
  if (cy.error) throw new Error(cy.error.message);
  if (cy.data) await db.cycles.put(cy.data as unknown as CycleRow);
  if (!st.error) {
    await db.stages.where('cycle_id').equals(id).delete();
    await db.stages.bulkPut((st.data ?? []) as StageRow[]);
  }
}

/** Sửa thông tin vụ (cần mạng): tên, ngày bắt đầu, ghi chú. Kèm phiên bản đã thấy, người khác sửa trước thì báo và tải lại. */
export async function editCycle(cycleId: string, c: { name?: string; start_date?: string | null; note?: string }): Promise<void> {
  const cur = await db.cycles.get(cycleId);
  if (!cur) return;
  await updateAndCache('production_cycles', cycleId, cur.version, { ...c }, 'sửa vụ');
  if (c.start_date !== undefined) await refreshCycle(cycleId).catch(() => undefined); // đổi ngày bắt đầu thì lịch các giai đoạn dời theo (máy chủ)
}

/** Xóa vụ (cần mạng). Chỉ xóa được vụ chưa có dữ liệu; máy chủ từ chối nếu đã có nhật ký, thu hoạch, chi phí… */
export async function deleteCycle(cycleId: string): Promise<void> {
  requireOnline('xóa vụ');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('delete_cycle', { p_id: cycleId });
  if (error) throw new Error(error.message);
  await db.transaction('rw', [db.cycles, db.stages, db.notes], async () => {
    await db.stages.where('cycle_id').equals(cycleId).delete();
    await db.notes.where('cycle_id').equals(cycleId).delete();
    await db.cycles.delete(cycleId);
  });
}

export interface StageEdit {
  name?: string;
  work_type_id?: string | null;
  planned_start?: string;
  planned_end?: string;
  note?: string;
}

async function stageRpc(fn: string, args: Record<string, unknown>, cycleId: string, action: string): Promise<void> {
  requireOnline(action);
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId); // ngày dự kiến xong của vụ cũng có thể đổi
}

/** Sửa thông tin một giai đoạn của vụ (tên, việc, ngày kế hoạch, ghi chú) */
export const updateCycleStage = (cycleId: string, stageId: string, c: StageEdit) =>
  stageRpc('update_cycle_stage', { p_stage: stageId, p_changes: c }, cycleId, 'sửa giai đoạn');

/** Thêm giai đoạn vào cuối quy trình của vụ */
export const addCycleStage = (cycleId: string, s: { workTypeId: string | null; name: string; start: string; end: string; note?: string }) =>
  stageRpc('add_cycle_stage', { p_cycle: cycleId, p_work_type: s.workTypeId, p_name: s.name, p_start: s.start, p_end: s.end, p_note: s.note ?? null }, cycleId, 'thêm giai đoạn');

export const deleteCycleStage = (cycleId: string, stageId: string) =>
  stageRpc('delete_cycle_stage', { p_stage: stageId }, cycleId, 'xóa giai đoạn');

/** Thêm ghi chú cho một ngày của vụ (cần mạng) */
export async function addNote(cycle: CycleRow, userId: string, noteDate: string, content: string): Promise<void> {
  const row = { id: crypto.randomUUID(), cycle_id: cycle.id, note_date: noteDate, content: content.trim(), created_by: userId };
  requireOnline('thêm ghi chú');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.from('cycle_notes').insert(row);
  if (error) throw new Error(error.message);
  await db.notes.put({ ...row, organization_id: cycle.owner_org_id, done: false });
}

/** Đánh dấu đã xong / chưa xong một ghi chú */
export async function setNoteDone(id: string, done: boolean): Promise<void> {
  requireOnline('đổi ghi chú');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.from('cycle_notes').update({ done }).eq('id', id);
  if (error) throw new Error(error.message);
  await db.notes.update(id, { done });
}

export async function deleteNote(id: string): Promise<void> {
  requireOnline('xóa ghi chú');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.from('cycle_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await db.notes.delete(id);
}

/** Bắt đầu / hoàn thành / mở lại một giai đoạn của vụ (cần mạng, người quản lý vụ). Ngày thực tế mặc định là hôm nay. */
export async function advanceStage(stageId: string, action: 'start' | 'complete' | 'reopen', date?: string): Promise<void> {
  requireOnline('đổi giai đoạn');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('advance_stage', { p_stage: stageId, p_action: action, p_date: date ?? null });
  if (error) throw new Error(error.message);
  const row = data as unknown as StageRow | null;
  if (row) await db.stages.put({ ...(await db.stages.get(stageId)), ...row });
  // bắt đầu/hoàn thành lệch kế hoạch thì các giai đoạn sau (và ngày dự kiến xong của vụ) dời theo
  const cyc = row?.cycle_id ?? (await db.stages.get(stageId))?.cycle_id;
  if (cyc) await refreshCycle(cyc).catch(() => undefined);
}

/** Đổi trạng thái vụ (cần mạng): kèm phiên bản đã thấy, người khác đổi trước thì báo và tải lại. */
export async function setCycleStatus(cycleId: string, status: CycleStatus): Promise<void> {
  const cur = await db.cycles.get(cycleId);
  if (!cur) return;
  await updateAndCache('production_cycles', cycleId, cur.version, { status }, 'đổi trạng thái vụ');
  // bắt đầu chạy vụ: máy chủ đặt ngày bắt đầu = hôm nay và dời lịch các giai đoạn theo; tải lại để thấy ngay
  if (status === 'active') await refreshCycle(cycleId).catch(() => undefined);
}

/** Vật tư đã dùng khi làm việc: mỗi dòng thành một giao dịch xuất kho gắn với nhật ký (FR-INV-003) */
export interface UsedMaterials {
  /** Cơ sở sở hữu kho và vật tư (cơ sở đang chọn) */
  organizationId: string;
  locationId: string;
  items: { materialId: string; quantity: number }[];
}

export interface NewLog {
  cycle: CycleRow;
  workTypeId: string;
  performedAt: string; // ISO
  data: Record<string, unknown>;
  note: string;
  userId: string;
  used?: UsedMaterials;
  /** Giai đoạn của vụ mà việc này thuộc về (không bắt buộc) */
  stageId?: string | null;
}

/**
 * Ghi nhật ký. Nếu có vật tư đã dùng thì nhật ký và các giao dịch xuất kho được lưu trên thiết bị
 * trong MỘT giao dịch cục bộ (cùng có hoặc cùng không) và gửi theo đúng thứ tự: nhật ký trước, kho sau.
 */
export async function logActivity(l: NewLog): Promise<string> {
  const id = crypto.randomUUID();
  const source = navigator.onLine ? 'online' : 'offline';
  const row = {
    id,
    organization_id: l.cycle.owner_org_id, // máy chủ tự gán lại theo chủ vụ
    cycle_id: l.cycle.id,
    area_id: l.cycle.area_id,
    work_type_id: l.workTypeId,
    stage_id: l.stageId ?? null,
    performed_at: l.performedAt,
    data: l.data,
    note: l.note.trim() || null,
  };
  const day = toLocalInput(new Date(l.performedAt)).slice(0, 10);
  await db.transaction('rw', db.logs, db.outbox, async () => {
    await db.logs.put({ ...row, version: 1, created_by: l.userId, received_at: new Date().toISOString() });
    await enqueue('activity_logs', { ...row, source, created_by: l.userId, performed_by: l.userId });
    for (const it of l.used?.items ?? []) {
      await enqueue('inventory_transactions', {
        id: crypto.randomUUID(),
        organization_id: l.used!.organizationId,
        location_id: l.used!.locationId,
        material_id: it.materialId,
        txn_type: 'issue',
        quantity_delta: -it.quantity,
        unit_cost: null, // giá vốn do máy chủ tính (bình quân gia quyền), người ghi việc không biết giá
        txn_date: day,
        cycle_id: l.cycle.id,
        activity_log_id: id,
        reason: null,
        source,
      });
    }
  });
  void flushOutbox();
  return id;
}

export interface LogEdit {
  performedAt: string; // ISO
  data: Record<string, unknown>;
  note: string;
}

/** Sửa nhật ký (FR-LOG-005, cần mạng): kèm phiên bản để phát hiện xung đột. */
export async function editLog(logId: string, e: LogEdit): Promise<void> {
  const cur = await db.logs.get(logId);
  if (!cur) return;
  const note = e.note.trim() || null;
  await updateAndCache('activity_logs', logId, cur.version, { performed_at: e.performedAt, data: e.data, note }, 'sửa nhật ký');
}

/** Hủy nhật ký (không xóa, cần mạng): cần lý do; bản ghi đã hủy không khôi phục được. */
export async function voidLog(logId: string, reason: string): Promise<void> {
  const cur = await db.logs.get(logId);
  if (!cur) return;
  await updateAndCache('activity_logs', logId, cur.version, { voided_at: new Date().toISOString(), void_reason: reason.trim() }, 'hủy nhật ký');
}
