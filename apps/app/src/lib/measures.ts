import { db, type CycleRow, type MeasureLimitRow, type MeasureReadingRow } from './db';
import { enqueue, flushOutbox } from './outbox';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Số đo nhập tay của vụ (mục 6 báo cáo đối thủ). Ghi mới dùng được OFFLINE (id tạo ở thiết bị, gửi bằng hàng đợi như nhật ký, D24);
 * hủy và đặt ngưỡng cần mạng (ghi thẳng qua hàm có kiểm quyền).
 */
const R_COLUMNS = 'id, cycle_id, organization_id, area_id, metric, value, measured_at, note, voided_at, void_reason, created_by, author_name, created_at';

/** Tải về máy; bảng chưa có (CSDL chưa `db push` 0195) thì bỏ qua, không làm hỏng đồng bộ chung. Không ghi đè bản đang chờ gửi. */
export async function syncMeasuresDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const pending = new Set((await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string));
  const since = new Date(Date.now() - 120 * 86400_000).toISOString(); // 120 ngày gần nhất là đủ để xem và cảnh báo
  const r = await supabase.from('measure_readings').select(R_COLUMNS).gte('measured_at', since).order('measured_at', { ascending: false }).limit(3000);
  if (!r.error) await db.measureReadings.bulkPut((r.data as unknown as MeasureReadingRow[]).map((x) => ({ ...x, value: Number(x.value) })).filter((x) => !pending.has(x.id)));
  const l = await supabase.from('measure_limits').select('organization_id, metric, label, unit, min_value, max_value, is_active');
  if (!l.error) {
    const rows = (l.data as unknown as Omit<MeasureLimitRow, 'id'>[]).map((x) => ({
      ...x, id: `${x.organization_id}|${x.metric}`,
      min_value: x.min_value === null ? null : Number(x.min_value), max_value: x.max_value === null ? null : Number(x.max_value),
    }));
    await db.transaction('rw', db.measureLimits, async () => { await db.measureLimits.clear(); await db.measureLimits.bulkPut(rows); });
  }
}

export interface NewMeasure { metric: string; value: number }

/** Ghi một lượt đo nhiều chỉ số cùng thời điểm: mỗi chỉ số một bản ghi (id riêng) */
export async function recordMeasures(cycle: CycleRow, items: NewMeasure[], measuredAt: string, note: string, userId: string): Promise<void> {
  const when = new Date(measuredAt).toISOString();
  const rows = items.map((it) => ({
    id: crypto.randomUUID(), cycle_id: cycle.id, organization_id: cycle.owner_org_id, // máy chủ tự gán lại theo chủ vụ
    metric: it.metric, value: it.value, measured_at: when, note: note.trim() || null,
  }));
  await db.transaction('rw', db.measureReadings, db.outbox, async () => {
    for (const row of rows) {
      await db.measureReadings.put({ ...row, created_by: userId, created_at: new Date().toISOString() });
      await enqueue('measure_readings', { ...row, source: navigator.onLine ? 'online' : 'offline', created_by: userId });
    }
  });
  void flushOutbox();
}

export async function voidMeasure(id: string, reason: string): Promise<void> {
  requireOnline('hủy số đo');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('void_measure_reading', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  const r = data as MeasureReadingRow;
  await db.measureReadings.put({ ...r, value: Number(r.value) });
}

export interface LimitInput { metric: string; label?: string | null; unit?: string | null; min: number | null; max: number | null; active?: boolean }

export async function saveMeasureLimit(orgId: string, v: LimitInput): Promise<void> {
  requireOnline('đặt ngưỡng số đo');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('set_measure_limit', {
    p_org: orgId, p_metric: v.metric, p_label: v.label ?? null, p_unit: v.unit ?? null, p_min: v.min, p_max: v.max, p_active: v.active ?? true,
  });
  if (error) throw new Error(error.message);
  const x = data as Omit<MeasureLimitRow, 'id'>;
  await db.measureLimits.put({
    ...x, id: `${x.organization_id}|${x.metric}`,
    min_value: x.min_value === null ? null : Number(x.min_value), max_value: x.max_value === null ? null : Number(x.max_value),
  });
}
