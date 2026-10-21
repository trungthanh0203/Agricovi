import { db, type LocalShift } from './db';
import { enqueue, flushOutbox } from './outbox';
import { supabase } from './supabase';

/**
 * Chấm công, sản lượng, đơn giá, tiền công (D42). Mọi thao tác cần mạng và ghi thẳng lên máy chủ
 * (chấm công offline sẽ làm ở bản sau). Quyền do máy chủ kiểm; giao diện chỉ ẩn/hiện nút.
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

export interface WorkerLite { id: string; full_name: string; user_id: string | null; work_mode: string | null; status: string }
export interface AttendanceRow {
  id: string; worker_id: string; work_date: string; started_at: string; ended_at: string | null; break_minutes: number;
  declared_minutes: number | null; approved_minutes: number | null; status: 'open' | 'needs_confirmation' | 'confirmed' | 'rejected';
  source: 'self' | 'team_leader' | 'admin'; exception_reason: string | null; note: string | null; start_lat: number | null;
}
export interface OutputRow {
  id: string; worker_id: string; work_date: string; quantity: number; unit: string; status: 'draft' | 'confirmed' | 'approved' | 'rejected';
  note: string | null; source: string;
}
export interface RateRow {
  id: string; rate_type: 'hour' | 'quantity'; worker_id: string | null; team_id: string | null; work_type_id: string | null;
  unit: string | null; amount: number; valid_from: string; valid_to: string | null; is_active: boolean;
}
export interface PeriodRow { id: string; organization_id: string; start_date: string; end_date: string; status: 'draft' | 'pending_confirmation' | 'reviewed' | 'pending_approval' | 'locked' }
export interface StatementRow { id: string; period_id: string; worker_id: string; total_estimated: number; total_approved: number | null }
export interface LineRow { id: string; statement_id: string; line_type: 'hours' | 'output'; quantity: number; unit: string; rate_amount: number; amount: number; explanation: string }
export interface AdjustmentRow { id: string; worker_id: string; period_id: string | null; kind: 'bonus' | 'deduction' | 'advance'; amount: number; reason: string }
export interface PayrollResult { lines: number; missing_rate_hours: number; missing_rate_output: number; total: number; workers: number }

export const ATT_STATUS_LABEL: Record<AttendanceRow['status'], string> = {
  open: 'Đang trong ca', needs_confirmation: 'Chờ xác nhận', confirmed: 'Đã xác nhận', rejected: 'Đã từ chối',
};
export const OUTPUT_STATUS_LABEL: Record<OutputRow['status'], string> = {
  draft: 'Chờ xác nhận', confirmed: 'Đã xác nhận', approved: 'Đã duyệt', rejected: 'Đã từ chối',
};
export const PERIOD_STATUS_LABEL: Record<PeriodRow['status'], string> = {
  draft: 'Đang soạn', pending_confirmation: 'Chờ xác nhận', reviewed: 'Đã rà soát', pending_approval: 'Chờ duyệt', locked: 'Đã khóa',
};
export const ADJ_KIND_LABEL: Record<AdjustmentRow['kind'], string> = { bonus: 'Thưởng/cộng thêm', deduction: 'Khấu trừ', advance: 'Tạm ứng' };

const num = <T extends object>(rows: T[] | null, keys: (keyof T)[]): T[] =>
  (rows ?? []).map((r) => {
    const o = { ...r } as Record<string, unknown>;
    for (const k of keys) if (o[k as string] != null) o[k as string] = Number(o[k as string]);
    return o as T;
  });

/** Chủ/quản lý/nhân viên tự có hồ sơ lao động để chấm công như nhân sự khác (tạo một lần) */
export async function ensureMyWorker(orgId: string): Promise<string> {
  needOnline('bật chấm công');
  return (await ok(client().rpc('ensure_my_worker', { p_org: orgId }))) as string;
}

// ------------------------------------------------------------------ hồ sơ lao động
export async function listWorkers(orgId: string): Promise<WorkerLite[]> {
  const rows = await ok(client().from('worker_profiles').select('id, full_name, user_id, work_mode, status').eq('organization_id', orgId).order('full_name'));
  return (rows ?? []) as WorkerLite[];
}

// ------------------------------------------------------------------ chấm công
export async function listAttendance(orgId: string, fromDate: string): Promise<AttendanceRow[]> {
  const rows = await ok(client().from('attendance_records')
    .select('id, worker_id, work_date, started_at, ended_at, break_minutes, declared_minutes, approved_minutes, status, source, exception_reason, note, start_lat')
    .eq('organization_id', orgId).gte('work_date', fromDate).order('started_at', { ascending: false }).limit(300));
  return (rows ?? []) as AttendanceRow[];
}

export interface Pos { lat: number; lng: number; acc: number }

/** Lấy vị trí MỘT lần tại thời điểm chấm (không theo dõi nền). Không cho phép hoặc quá lâu thì bỏ qua, vẫn chấm công được. */
export function getPosition(timeoutMs = 8000): Promise<Pos | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

const WORKER_KEY = (org: string, uid: string) => `agriconnect.worker.${org}.${uid}`;
/** Nhớ mã hồ sơ lao động của tôi để vào ca được cả khi mất mạng */
export function rememberMyWorker(org: string, uid: string, workerId: string): void {
  try { localStorage.setItem(WORKER_KEY(org, uid), workerId); } catch { /* bỏ qua */ }
}
export function recalledMyWorker(org: string, uid: string): string | null {
  try { return localStorage.getItem(WORKER_KEY(org, uid)); } catch { return null; }
}

/**
 * Vào ca. Có mạng: ghi lên máy chủ ngay (người khác thấy "đang trong ca"). Mất mạng: giữ ca trên máy, khi ra ca sẽ gửi
 * MỘT bản ghi hoàn chỉnh qua hàng đợi (máy chủ tự quyết định trạng thái/ngày công, không tin giờ máy để tự xác nhận).
 */
export async function clockIn(orgId: string, workerId: string | null, cycleId: string | null): Promise<'server' | 'local'> {
  const pos = await getPosition();
  if (navigator.onLine) {
    await ok(client().rpc('clock_in', {
      p_id: crypto.randomUUID(), p_org: orgId, p_cycle: cycleId, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_acc: pos?.acc ?? null,
    }));
    return 'server';
  }
  if (!workerId) throw new Error('OFFLINE: Cần mở app khi có mạng ít nhất một lần để vào ca khi mất mạng. Hãy kết nối mạng rồi thử lại.');
  await db.localShifts.put({
    id: crypto.randomUUID(), org: orgId, worker_id: workerId, started_at: new Date().toISOString(), cycle_id: cycleId,
    lat: pos?.lat ?? null, lng: pos?.lng ?? null, acc: pos?.acc ?? null,
  });
  return 'local';
}

/** Ra ca của ca đã mở trên máy chủ (cần mạng) */
export async function clockOut(attendanceId: string, breakMinutes: number, cycleId: string | null = null): Promise<void> {
  if (!navigator.onLine) throw new Error('OFFLINE: Ca này đã mở trên máy chủ nên cần có mạng để ra ca. Hãy kết nối mạng rồi bấm lại; giờ vào ca của bạn vẫn được giữ.');
  const pos = await getPosition();
  await ok(client().rpc('clock_out', {
    p_id: attendanceId, p_break: breakMinutes, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_acc: pos?.acc ?? null, p_cycle: cycleId,
  }));
}

/** Ra ca của ca bắt đầu khi mất mạng: gửi một bản ghi hoàn chỉnh qua hàng đợi (dùng được cả khi vẫn mất mạng) */
export async function clockOutLocal(shift: LocalShift, breakMinutes: number, cycleId: string | null): Promise<void> {
  const pos = await getPosition(5000);
  const now = new Date().toISOString();
  await db.transaction('rw', db.localShifts, db.outbox, async () => {
    await enqueue('attendance_records', {
      id: shift.id, worker_id: shift.worker_id, work_date: shift.started_at.slice(0, 10), started_at: shift.started_at, ended_at: now,
      break_minutes: breakMinutes, source: 'self', device_recorded_at: now, cycle_id: cycleId ?? shift.cycle_id,
      start_lat: shift.lat, start_lng: shift.lng, start_accuracy_m: shift.acc,
      end_lat: pos?.lat ?? null, end_lng: pos?.lng ?? null, end_accuracy_m: pos?.acc ?? null,
    });
    await db.localShifts.delete(shift.id);
  });
  void flushOutbox();
}

/** Đề nghị sửa công (giờ vào/ra/phút nghỉ); quản lý hoặc chủ duyệt */
export async function requestAdjustment(attendanceId: string, proposed: { started_at?: string; ended_at?: string; break_minutes?: number }, reason: string): Promise<void> {
  needOnline('đề nghị sửa công');
  await ok(client().rpc('request_attendance_adjustment', { p_attendance: attendanceId, p_proposed: proposed, p_reason: reason }));
}
export async function decideAdjustment(id: string, approve: boolean): Promise<void> {
  needOnline('duyệt yêu cầu sửa công');
  await ok(client().rpc('decide_attendance_adjustment', { p_id: id, p_approve: approve }));
}
export interface AdjustmentRequest {
  id: string; attendance_id: string; reason: string; status: 'pending' | 'approved' | 'rejected';
  proposed: { started_at?: string; ended_at?: string; break_minutes?: number }; created_at: string;
}
export async function listAdjustments(orgId: string): Promise<AdjustmentRequest[]> {
  const rows = await ok(client().from('attendance_adjustments').select('id, attendance_id, reason, status, proposed, created_at')
    .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50));
  return (rows ?? []) as AdjustmentRequest[];
}

/** Tiền công của tôi theo kỳ (người lao động xem phiếu lương của chính mình) */
export interface MyPay { periodId: string; start: string; end: string; locked: boolean; total: number; approved: boolean }
export async function fetchMyPay(workerId: string): Promise<MyPay[]> {
  const st = await ok(client().from('worker_pay_statements').select('period_id, total_estimated, total_approved').eq('worker_id', workerId));
  const rows = (st ?? []) as { period_id: string; total_estimated: number; total_approved: number | null }[];
  if (rows.length === 0) return [];
  const per = await ok(client().from('payroll_periods').select('id, start_date, end_date, status').in('id', rows.map((r) => r.period_id)));
  const byId = new Map(((per ?? []) as { id: string; start_date: string; end_date: string; status: string }[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.period_id);
    const locked = p?.status === 'locked';
    return { periodId: r.period_id, start: p?.start_date ?? '', end: p?.end_date ?? '', locked, approved: locked && r.total_approved != null, total: Number(locked ? r.total_approved ?? r.total_estimated : r.total_estimated) };
  }).sort((x, y) => y.start.localeCompare(x.start));
}

export async function recordShift(workerId: string, start: Date, end: Date, breakMinutes: number, note: string, cycleId: string | null = null): Promise<void> {
  needOnline('chấm công hộ');
  await ok(client().rpc('record_shift', {
    p_id: crypto.randomUUID(), p_worker: workerId, p_start: start.toISOString(), p_end: end.toISOString(),
    p_break: breakMinutes, p_cycle: cycleId, p_note: note || null,
  }));
}
export async function confirmAttendance(id: string, minutes?: number): Promise<void> {
  needOnline('xác nhận công');
  await ok(client().rpc('confirm_attendance', { p_id: id, p_minutes: minutes ?? null }));
}
export async function rejectAttendance(id: string, reason: string): Promise<void> {
  needOnline('từ chối công');
  await ok(client().rpc('reject_attendance', { p_id: id, p_reason: reason }));
}

// ------------------------------------------------------------------ sản lượng
export async function listOutputs(orgId: string, fromDate: string): Promise<OutputRow[]> {
  const rows = await ok(client().from('work_output_records').select('id, worker_id, work_date, quantity, unit, status, note, source')
    .eq('organization_id', orgId).gte('work_date', fromDate).order('work_date', { ascending: false }).limit(300));
  return num((rows ?? []) as OutputRow[], ['quantity']);
}
export async function recordOutput(workerId: string, date: string, qty: number, unit: string, note: string, cycleId: string | null = null): Promise<void> {
  needOnline('ghi sản lượng');
  await ok(client().rpc('record_output', {
    p_id: crypto.randomUUID(), p_worker: workerId, p_date: date, p_cycle: cycleId, p_work_type: null, p_qty: qty, p_unit: unit, p_note: note || null,
  }));
}
export async function confirmOutput(id: string): Promise<void> {
  needOnline('xác nhận sản lượng');
  await ok(client().rpc('confirm_output', { p_id: id }));
}

// ------------------------------------------------------------------ đơn giá
export async function listRates(orgId: string): Promise<RateRow[]> {
  const rows = await ok(client().from('work_rates')
    .select('id, rate_type, worker_id, team_id, work_type_id, unit, amount, valid_from, valid_to, is_active')
    .eq('organization_id', orgId).order('valid_from', { ascending: false }));
  return num((rows ?? []) as RateRow[], ['amount']);
}
export async function addRate(orgId: string, r: { type: 'hour' | 'quantity'; workerId: string | null; teamId: string | null; unit: string | null; amount: number; validFrom: string }): Promise<void> {
  needOnline('thêm đơn giá');
  await ok(client().from('work_rates').insert({
    organization_id: orgId, rate_type: r.type, worker_id: r.workerId, team_id: r.teamId, unit: r.type === 'quantity' ? r.unit : null,
    amount: r.amount, valid_from: r.validFrom,
  }));
}
export async function setRateActive(id: string, active: boolean): Promise<void> {
  needOnline('đổi đơn giá');
  await ok(client().from('work_rates').update({ is_active: active }).eq('id', id));
}

// ------------------------------------------------------------------ tiền công
export async function listPeriods(orgId: string): Promise<PeriodRow[]> {
  const rows = await ok(client().from('payroll_periods').select('id, organization_id, start_date, end_date, status').eq('organization_id', orgId).order('start_date', { ascending: false }));
  return (rows ?? []) as PeriodRow[];
}
export async function createPeriod(orgId: string, start: string, end: string): Promise<string> {
  needOnline('tạo kỳ trả công');
  const id = crypto.randomUUID();
  await ok(client().from('payroll_periods').insert({ id, organization_id: orgId, start_date: start, end_date: end }));
  return id;
}
export async function computePayroll(periodId: string): Promise<PayrollResult> {
  needOnline('tính tiền công');
  return (await ok(client().rpc('compute_payroll', { p_period: periodId }))) as PayrollResult;
}
export async function loadStatements(periodId: string): Promise<{ statements: StatementRow[]; lines: LineRow[]; adjustments: AdjustmentRow[] }> {
  const c = client();
  const [s, a] = await Promise.all([
    ok(c.from('worker_pay_statements').select('id, period_id, worker_id, total_estimated, total_approved').eq('period_id', periodId)),
    ok(c.from('pay_adjustments').select('id, worker_id, period_id, kind, amount, reason').eq('period_id', periodId)),
  ]);
  const statements = num((s ?? []) as StatementRow[], ['total_estimated', 'total_approved']);
  const ids = statements.map((x) => x.id);
  const lines = ids.length === 0 ? [] : num(((await ok(c.from('pay_statement_lines')
    .select('id, statement_id, line_type, quantity, unit, rate_amount, amount, explanation').in('statement_id', ids))) ?? []) as LineRow[], ['quantity', 'rate_amount', 'amount']);
  return { statements, lines, adjustments: num((a ?? []) as AdjustmentRow[], ['amount']) };
}
export async function addAdjustment(orgId: string, periodId: string, workerId: string, kind: AdjustmentRow['kind'], amount: number, reason: string): Promise<void> {
  needOnline('thêm khoản cộng/trừ');
  await ok(client().from('pay_adjustments').insert({ organization_id: orgId, period_id: periodId, worker_id: workerId, kind, amount, reason }));
}
export async function lockPayroll(periodId: string): Promise<void> {
  needOnline('khóa kỳ');
  await ok(client().rpc('lock_payroll', { p_period: periodId }));
}
export async function unlockPayroll(periodId: string, reason: string): Promise<void> {
  needOnline('mở khóa kỳ');
  await ok(client().rpc('unlock_payroll', { p_period: periodId, p_reason: reason }));
}

/** Người "do tổ trưởng chấm" chưa thuộc tổ có tổ trưởng (cần chủ xử lý) */
export async function listOrphans(orgId: string): Promise<{ worker_id: string; full_name: string; team_name: string | null }[]> {
  const rows = await ok(client().from('workers_without_leader').select('worker_id, full_name, team_name').eq('organization_id', orgId));
  return (rows ?? []) as { worker_id: string; full_name: string; team_name: string | null }[];
}

/** CSV bảng lương một kỳ (mở được bằng Excel): mỗi dòng công/sản lượng và khoản cộng/trừ, kèm tổng từng người */
export function buildPayrollCsv(period: { start_date: string; end_date: string; status: string }, workers: WorkerLite[],
  statements: StatementRow[], lines: LineRow[], adjustments: AdjustmentRow[]): string {
  const cell = (v: string | number | null) => {
    const t = v === null ? '' : String(v);
    return /[,"\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
  };
  const rows: (string | number | null)[][] = [['Người', 'Loại', 'Diễn giải', 'Số lượng', 'Đơn vị', 'Đơn giá (đồng)', 'Thành tiền (đồng)']];
  const name = (id: string) => workers.find((w) => w.id === id)?.full_name ?? '';
  for (const s of statements) {
    for (const l of lines.filter((x) => x.statement_id === s.id)) rows.push([name(s.worker_id), l.line_type === 'hours' ? 'Giờ công' : 'Sản lượng', l.explanation, l.quantity, l.unit, l.rate_amount, l.amount]);
    for (const a of adjustments.filter((x) => x.worker_id === s.worker_id)) rows.push([name(s.worker_id), ADJ_KIND_LABEL[a.kind], a.reason, '', '', '', a.kind === 'bonus' ? a.amount : -a.amount]);
    rows.push([name(s.worker_id), 'TỔNG', period.status === 'locked' ? 'Đã duyệt (khóa kỳ)' : 'Dự tính (chưa khóa)', '', '', '', period.status === 'locked' ? s.total_approved ?? s.total_estimated : s.total_estimated]);
  }
  const NL = String.fromCharCode(13, 10);
  return String.fromCharCode(0xfeff) + `Kỳ ${period.start_date} đến ${period.end_date}` + NL + rows.map((r) => r.map(cell).join(',')).join(NL) + NL;
}

export const fmtMinutes = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút`);
export const fmtVnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
