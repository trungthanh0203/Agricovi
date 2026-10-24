import { supabase } from './supabase';
import type { PayDetail, PayItem, PayOverview, PayRow, PayStatus } from './payBookLogic';

/** Gọi máy chủ cho Bảng lương (có bản lưu để xem lại khi mất mạng). Phần tính thuần ở payBookLogic.ts. */

const num = (v: unknown) => Number(v ?? 0);
const normRow = (r: Record<string, unknown>): PayRow => ({
  worker_id: String(r.worker_id), name: String(r.name ?? ''), user_id: (r.user_id as string | null) ?? null, status: String(r.status ?? 'active'),
  team_id: (r.team_id as string | null) ?? null, team_name: (r.team_name as string | null) ?? null,
  hours: num(r.hours), pending_hours: num(r.pending_hours), days: num(r.days), hourly: num(r.hourly), salary: num(r.salary), bonus: num(r.bonus),
  deduction: num(r.deduction), advance: num(r.advance), net: num(r.net), net_locked: num(r.net_locked), no_rate_days: num(r.no_rate_days),
  n_locked: num(r.n_locked), n_calculated: num(r.n_calculated), n_estimate: num(r.n_estimate), n_open: num(r.n_open),
});

const cacheKey = (k: string) => `agriconnect.paybook.${k}`;
const save = (k: string, v: unknown) => { try { localStorage.setItem(cacheKey(k), JSON.stringify(v)); } catch { /* bỏ qua */ } };
const read = <T>(k: string): T | null => { try { const raw = localStorage.getItem(cacheKey(k)); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };

export const cachedOverview = (orgId: string, from: string, to: string, worker: string | null) => read<PayOverview>(`o.${orgId}.${from}.${to}.${worker ?? ''}`);
export const cachedDetail = (orgId: string, worker: string, from: string, to: string) => read<PayDetail>(`d.${orgId}.${worker}.${from}.${to}`);

export async function fetchPayOverview(orgId: string, from: string, to: string, worker: string | null = null): Promise<PayOverview> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_pay_overview', { p_org: orgId, p_from: from, p_to: to, p_worker: worker });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const r: PayOverview = { from, to, generated_at: String(d.generated_at ?? ''), can_see_all: Boolean(d.can_see_all), workers: ((d.workers ?? []) as Record<string, unknown>[]).map(normRow) };
  save(`o.${orgId}.${from}.${to}.${worker ?? ''}`, r);
  return r;
}

export async function fetchPayDetail(orgId: string, worker: string, from: string, to: string): Promise<PayDetail> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_pay_detail', { p_org: orgId, p_worker: worker, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const items = ((d.items ?? []) as Record<string, unknown>[]).map((i) => ({
    kind: i.kind as PayItem['kind'], date: String(i.date), id: (i.id as string | null) ?? null, minutes: num(i.minutes), amount: num(i.amount),
    rate: i.rate == null ? null : num(i.rate), status: i.status as PayStatus, label: (i.label as string | null) ?? null,
    started_at: (i.started_at as string | null) ?? null, ended_at: (i.ended_at as string | null) ?? null, break_minutes: i.break_minutes == null ? null : num(i.break_minutes),
  }));
  const r: PayDetail = { worker_id: worker, from, to, generated_at: String(d.generated_at ?? ''), items };
  save(`d.${orgId}.${worker}.${from}.${to}`, r);
  return r;
}

export interface PaySeries { generated_at: string; can_see_all: boolean; months: { month: string; net: number; net_locked: number; hours: number }[] }

export const cachedSeries = (orgId: string, worker: string | null) => read<PaySeries>(`s.${orgId}.${worker ?? ''}`);

/** Thực nhận và giờ công theo tháng (mặc định 6 tháng gần nhất) cho biểu đồ; worker = null: chính mình (hoặc cả cơ sở nếu có quyền Tiền công) */
export async function fetchPaySeries(orgId: string, worker: string | null = null, months = 6): Promise<PaySeries> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_pay_series', { p_org: orgId, p_worker: worker, p_months: months });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const r: PaySeries = {
    generated_at: String(d.generated_at ?? ''), can_see_all: Boolean(d.can_see_all),
    months: ((d.months ?? []) as Record<string, unknown>[]).map((m) => ({ month: String(m.month), net: num(m.net), net_locked: num(m.net_locked), hours: num(m.hours) })),
  };
  if (months === 6) save(`s.${orgId}.${worker ?? ''}`, r);
  return r;
}

// ---------------------------------------------------------------- chốt lương ngay trong Bảng lương (D89)
export interface SettleState {
  month: string; from: string; to: string; period_id: string | null; status: string; overlap_legacy: boolean; can_edit: boolean; is_owner: boolean;
  blockers: {
    pending_attendance: number; open_shifts: number; pending_requests: number; uncomputed: number; blocked: boolean; messages: string[];
    missing_rate: { worker_id: string; name: string; days: number }[];
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Trạng thái chốt lương của một tháng (kỳ, việc còn dang dở); cần quyền xem Tiền công */
export const fetchSettleState = (orgId: string, month: string) => rpc<SettleState>('get_pay_settle_state', { p_org: orgId, p_month: month });
/** Tính lương cả tháng (tạo kỳ nếu chưa có) */
export const settleMonth = (orgId: string, month: string) => rpc<{ period_id: string; lines: number; missing_rate_hours: number; workers: number; total: number }>('settle_month', { p_org: orgId, p_month: month });
export const lockPeriod = (periodId: string) => rpc<void>('lock_payroll', { p_period: periodId });
export const unlockPeriod = (periodId: string, reason: string) => rpc<void>('unlock_payroll', { p_period: periodId, p_reason: reason });
export const addPayAdjustment = (orgId: string, worker: string, month: string, kind: 'bonus' | 'deduction' | 'advance', amount: number, reason: string) =>
  rpc<unknown>('add_pay_adjustment', { p_org: orgId, p_worker: worker, p_month: month, p_kind: kind, p_amount: amount, p_reason: reason });
export const updatePayAdjustment = (id: string, kind: 'bonus' | 'deduction' | 'advance', amount: number, reason: string) =>
  rpc<unknown>('update_pay_adjustment', { p_id: id, p_kind: kind, p_amount: amount, p_reason: reason });
export const deletePayAdjustment = (id: string) => rpc<unknown>('delete_pay_adjustment', { p_id: id });
