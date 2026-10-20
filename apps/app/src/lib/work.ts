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
  source: 'self' | 'team_leader' | 'admin'; exception_reason: string | null; note: string | null;
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

// ------------------------------------------------------------------ hồ sơ lao động
export async function listWorkers(orgId: string): Promise<WorkerLite[]> {
  const rows = await ok(client().from('worker_profiles').select('id, full_name, user_id, work_mode, status').eq('organization_id', orgId).order('full_name'));
  return (rows ?? []) as WorkerLite[];
}

// ------------------------------------------------------------------ chấm công
export async function listAttendance(orgId: string, fromDate: string): Promise<AttendanceRow[]> {
  const rows = await ok(client().from('attendance_records')
    .select('id, worker_id, work_date, started_at, ended_at, break_minutes, declared_minutes, approved_minutes, status, source, exception_reason, note')
    .eq('organization_id', orgId).gte('work_date', fromDate).order('started_at', { ascending: false }).limit(300));
  return (rows ?? []) as AttendanceRow[];
}

export async function clockIn(orgId: string): Promise<void> {
  needOnline('vào ca');
  await ok(client().rpc('clock_in', { p_id: crypto.randomUUID(), p_org: orgId, p_cycle: null }));
}
export async function clockOut(attendanceId: string, breakMinutes: number): Promise<void> {
  needOnline('ra ca');
  await ok(client().rpc('clock_out', { p_id: attendanceId, p_break: breakMinutes }));
}
export async function recordShift(workerId: string, start: Date, end: Date, breakMinutes: number, note: string): Promise<void> {
  needOnline('chấm công hộ');
  await ok(client().rpc('record_shift', {
    p_id: crypto.randomUUID(), p_worker: workerId, p_start: start.toISOString(), p_end: end.toISOString(),
    p_break: breakMinutes, p_cycle: null, p_note: note || null,
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
export async function recordOutput(workerId: string, date: string, qty: number, unit: string, note: string): Promise<void> {
  needOnline('ghi sản lượng');
  await ok(client().rpc('record_output', {
    p_id: crypto.randomUUID(), p_worker: workerId, p_date: date, p_cycle: null, p_work_type: null, p_qty: qty, p_unit: unit, p_note: note || null,
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

export const fmtMinutes = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút`);
export const fmtVnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
