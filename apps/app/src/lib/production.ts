import type { CycleStatus } from '@agriconnect/shared';
import { db, type AreaRow, type CycleRow, type LogRow } from './db';
import { syncHarvestsDown } from './harvest';
import { toLocalInput } from './hooks';
import { syncInventoryDown } from './inventory';
import { enqueue, enqueueUpdate, flushOutbox } from './outbox';
import { supabase } from './supabase';

const LOG_COLUMNS =
  'id, organization_id, cycle_id, area_id, work_type_id, performed_at, data, note, voided_at, void_reason, version, created_by, received_at';

/** Tải dữ liệu về thiết bị để dùng offline. Không ghi đè bản ghi đang chờ gửi hoặc đang xung đột. */
export async function syncDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  await flushOutbox(); // gửi phần còn chờ trước để dữ liệu nhìn thấy khớp máy chủ

  const pendingIds = new Set(
    (await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string),
  );
  const fresh = <T extends { id: string }>(rows: T[] | null) => (rows ?? []).filter((r) => !pendingIds.has(r.id));

  const [areas, cycles, workTypes, cropTypes, logs] = await Promise.all([
    supabase.from('production_areas').select('id, organization_id, name'),
    supabase.from('production_cycles').select('id, owner_org_id, area_id, crop_type_id, status, start_date, note, version, created_at'),
    supabase.from('work_types').select('id, code, name, field_schema').eq('is_active', true),
    supabase.from('crop_types').select('id, code, name').eq('is_active', true),
    supabase.from('activity_logs').select(LOG_COLUMNS).order('performed_at', { ascending: false }).limit(200),
  ]);
  for (const r of [areas, cycles, workTypes, cropTypes, logs]) if (r.error) throw r.error;

  await db.transaction('rw', [db.areas, db.cycles, db.workTypes, db.cropTypes, db.logs], async () => {
    await db.areas.bulkPut(fresh(areas.data as AreaRow[]));
    await db.cycles.bulkPut(fresh(cycles.data as CycleRow[]));
    await db.workTypes.bulkPut(workTypes.data ?? []);
    await db.cropTypes.bulkPut(cropTypes.data ?? []);
    await db.logs.bulkPut(fresh(logs.data as LogRow[]));
  });
  // Vật tư & kho: lỗi ở đây không làm hỏng đồng bộ sản xuất ở trên
  await syncInventoryDown().catch((e) => console.warn('Không tải được vật tư/kho', e));
  await syncHarvestsDown().catch((e) => console.warn('Không tải được thu hoạch', e));
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

export async function createArea(organizationId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  const row: AreaRow = { id, organization_id: organizationId, name: name.trim() };
  await db.areas.put(row); // hiện ngay trên thiết bị
  await enqueue('production_areas', { ...row });
  void flushOutbox();
  return id;
}

export interface NewCycle {
  ownerOrgId: string;
  areaId: string;
  cropTypeId: string;
  status: Extract<CycleStatus, 'preparing' | 'active'>;
  startDate: string | null;
}

export async function createCycle(c: NewCycle): Promise<string> {
  const id = crypto.randomUUID();
  const row = {
    id,
    owner_org_id: c.ownerOrgId,
    area_id: c.areaId,
    crop_type_id: c.cropTypeId,
    status: c.status,
    start_date: c.startDate,
  };
  await db.cycles.put({ ...row, version: 1 });
  await enqueue('production_cycles', row);
  void flushOutbox();
  return id;
}

/** Đổi trạng thái vụ: áp dụng ngay trên thiết bị, gửi lên kèm phiên bản đã thấy để phát hiện xung đột. */
export async function setCycleStatus(cycleId: string, status: CycleStatus): Promise<void> {
  const cur = await db.cycles.get(cycleId);
  if (!cur) return;
  await db.cycles.update(cycleId, { status });
  await enqueueUpdate('production_cycles', cycleId, cur.version, { status });
  void flushOutbox();
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

/** Sửa nhật ký (FR-LOG-005): hiện ngay trên thiết bị, gửi kèm phiên bản để phát hiện xung đột. */
export async function editLog(logId: string, e: LogEdit): Promise<void> {
  const cur = await db.logs.get(logId);
  if (!cur) return;
  const note = e.note.trim() || null;
  await db.logs.update(logId, { performed_at: e.performedAt, data: e.data, note });
  await enqueueUpdate('activity_logs', logId, cur.version, { performed_at: e.performedAt, data: e.data, note });
  void flushOutbox();
}

/** Hủy nhật ký (không xóa): cần lý do; bản ghi đã hủy không khôi phục được. */
export async function voidLog(logId: string, reason: string): Promise<void> {
  const cur = await db.logs.get(logId);
  if (!cur) return;
  const voidedAt = new Date().toISOString();
  await db.logs.update(logId, { voided_at: voidedAt, void_reason: reason.trim() });
  await enqueueUpdate('activity_logs', logId, cur.version, { voided_at: voidedAt, void_reason: reason.trim() });
  void flushOutbox();
}
