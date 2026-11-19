import { supabase } from './supabase';
import { listWindowed } from './attendanceWindows';
import type { AttendanceRow } from './work';

/**
 * Chấm công cho cơ sở đông người (D115): số liệu, danh sách phân trang và xác nhận hàng loạt do MÁY CHỦ tính,
 * không tải cả danh sách công về máy. Quyền theo chính sách RLS (tổ trưởng chỉ thấy người trong tổ).
 */

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export interface AttSummary {
  workers: number; present: number; in_shift: number; stale: number; done: number; pending: number;
  flagged: number; flagged_people?: number; flagged_week: number; month_minutes: number; top: { name: string; minutes: number }[];
}

export async function getAttendanceSummary(orgId: string, day: string): Promise<AttSummary> {
  const { data, error } = await client().rpc('attendance_summary', { p_org: orgId, p_day: day });
  if (error) throw new Error(error.message);
  return data as AttSummary;
}

export type AttStatusFilter = '' | 'pending' | 'open' | 'confirmed' | 'rejected' | 'flagged';

export interface AttPageRow extends AttendanceRow { worker_name: string; has_photo: boolean }
export interface AttPage { total: number; rows: AttPageRow[] }

async function listPageRaw(orgId: string, o: { from: string; to: string; status: AttStatusFilter; q: string; limit: number; offset: number }): Promise<AttPage> {
  const { data, error } = await client().rpc('attendance_list', {
    p_org: orgId, p_from: o.from, p_to: o.to, p_status: o.status || null, p_q: o.q.trim() || null, p_limit: o.limit, p_offset: o.offset,
  });
  if (error) throw new Error(error.message);
  const page = data as { total: number; rows: Omit<AttPageRow, 'note' | 'start_lat'>[] };
  return { total: page.total, rows: page.rows.map((r) => ({ ...r, note: null, start_lat: null })) };
}

/**
 * Danh sách công phân trang. `expected` là số lượng dự kiến khi xem "mọi ngày" từ khung Cần xử lý. Cơ sở dữ liệu đã cập nhật (migration 0229/0230) nhận khoảng
 * ngày bất kỳ cho công chờ xác nhận / ca đang mở; bản CŨ báo "không quá 92 ngày" nên app tự chia khoảng thành các đoạn ≤ 90 ngày và ghép lại.
 */
export async function listAttendancePage(orgId: string, o: { from: string; to: string; status: AttStatusFilter; q: string; limit: number; offset: number; expected?: number }): Promise<AttPage> {
  try {
    return await listPageRaw(orgId, o);
  } catch (e) {
    if (!/92 ngày/.test(String((e as Error).message)) || (o.status !== 'pending' && o.status !== 'open')) throw e;
    return listWindowed((r) => listPageRaw(orgId, { ...o, ...r }), { from: o.from, to: o.to, limit: o.limit, offset: o.offset }, o.expected);
  }
}

/** Xác nhận các công hợp lệ trong khoảng ngày (dry = chỉ đếm). Bỏ qua công có ngoại lệ, ảnh cờ đỏ hoặc giờ quá dài. */
export async function bulkConfirmAttendance(orgId: string, from: string, to: string, q: string, dry: boolean): Promise<{ count: number; skipped: number }> {
  const { data, error } = await client().rpc('attendance_bulk_confirm', { p_org: orgId, p_from: from, p_to: to, p_q: q.trim() || null, p_dry: dry });
  if (error) throw new Error(error.message);
  return data as { count: number; skipped: number };
}

/** Đóng MỘT ca quên ra ca (D198, migration 0225): chủ đóng thì công được xác nhận luôn, quản lý/tổ trưởng đóng thì chờ xác nhận */
export async function closeOpenShift(id: string, endedAt: Date, breakMinutes: number | null = null): Promise<void> {
  const { error } = await client().rpc('close_open_shift', { p_id: id, p_ended_at: endedAt.toISOString(), p_break: breakMinutes });
  if (error) throw new Error(error.message);
}
/** Đóng HÀNG LOẠT mọi ca còn mở từ những ngày trước, mỗi ca ra lúc `hhmm` (giờ Việt Nam) của ngày làm đó */
export async function closeStaleShifts(orgId: string, hhmm: string): Promise<{ closed: number; skipped: number }> {
  const { data, error } = await client().rpc('close_stale_shifts', { p_org: orgId, p_time: hhmm });
  if (error) throw new Error(error.message);
  return data as { closed: number; skipped: number };
}
