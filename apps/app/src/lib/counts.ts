import { db, type CountEventRow, type CycleRow } from './db';
import { enqueue, flushOutbox } from './outbox';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Biến động số lượng của vụ (P2 gọn, D100). Ghi mới dùng được OFFLINE (id tạo ở thiết bị, gửi bằng hàng đợi như nhật ký);
 * hủy cần mạng và lý do (D24).
 */
const COLUMNS = 'id, cycle_id, organization_id, event_date, kind, quantity, note, voided_at, void_reason, created_by, author_name, created_at';

/** Tải về máy; bảng chưa có (CSDL chưa cập nhật) thì bỏ qua, không làm hỏng đồng bộ chung. Không ghi đè bản đang chờ gửi. */
export async function syncCountEventsDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const pending = new Set((await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string));
  const { data, error } = await supabase.from('cycle_count_events').select(COLUMNS).order('event_date', { ascending: false }).limit(2000);
  if (error) return;
  await db.countEvents.bulkPut(((data ?? []) as CountEventRow[]).filter((r) => !pending.has(r.id)));
}

export interface NewCountEvent {
  cycle: CycleRow;
  kind: CountEventRow['kind'];
  quantity: number;
  date: string; // yyyy-mm-dd
  note: string;
  userId: string;
}

export async function recordCountEvent(e: NewCountEvent): Promise<void> {
  const row = {
    id: crypto.randomUUID(),
    cycle_id: e.cycle.id,
    organization_id: e.cycle.owner_org_id, // máy chủ tự gán lại theo chủ vụ
    event_date: e.date,
    kind: e.kind,
    quantity: e.quantity,
    note: e.note.trim() || null,
  };
  await db.transaction('rw', db.countEvents, db.outbox, async () => {
    await db.countEvents.put({ ...row, created_by: e.userId, created_at: new Date().toISOString() });
    await enqueue('cycle_count_events', { ...row, source: navigator.onLine ? 'online' : 'offline', created_by: e.userId });
  });
  void flushOutbox();
}

export async function voidCountEvent(id: string, reason: string): Promise<void> {
  requireOnline('hủy bản ghi số lượng');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('void_count_event', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  await db.countEvents.put(data as CountEventRow);
}
