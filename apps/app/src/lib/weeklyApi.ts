import { supabase } from './supabase';
import type { WeekMetrics, WeeklyReport } from './weekly';

/** Gọi hàm máy chủ `get_weekly_report` (cần mạng) và nhớ bản tuần vừa qua trên máy để xem lại khi mất mạng. */

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function metrics(m: Record<string, unknown>): WeekMetrics {
  return {
    logs: Number(m.logs ?? 0), harvest_kg: numOrNull(m.harvest_kg), revenue: numOrNull(m.revenue), cost: numOrNull(m.cost), labor_hours: numOrNull(m.labor_hours),
    collected: numOrNull(m.collected), paid_out: numOrNull(m.paid_out), web_orders: numOrNull(m.web_orders), web_quotes: numOrNull(m.web_quotes),
  };
}

const pair = (v: unknown): { count: number; amount: number } | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return { count: Number(o.count ?? 0), amount: Number(o.amount ?? 0) };
};

/** Tải báo cáo tuần. `weekStart` = ngày bất kỳ trong tuần cần xem (bỏ trống = tuần vừa qua). Cần mạng. */
export async function fetchWeekly(orgId: string, weekStart: string | null = null): Promise<WeeklyReport> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_weekly_report', { p_org: orgId, p_week_start: weekStart });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const a = (d.attention ?? {}) as Record<string, unknown>;
  const r: WeeklyReport = {
    week_start: String(d.week_start), week_end: String(d.week_end), is_current_week: Boolean(d.is_current_week),
    cur: metrics((d.cur ?? {}) as Record<string, unknown>), prev: metrics((d.prev ?? {}) as Record<string, unknown>),
    daily: ((d.daily ?? []) as Record<string, unknown>[]).map((x) => ({
      date: String(x.date), logs: Number(x.logs ?? 0), cost: numOrNull(x.cost), revenue: numOrNull(x.revenue), harvest_kg: numOrNull(x.harvest_kg),
    })),
    attention: {
      overdue_payables: pair(a.overdue_payables), overdue_receivables: pair(a.overdue_receivables), low_stock: numOrNull(a.low_stock),
      late_cycles: Number(a.late_cycles ?? 0), open_incidents: Number(a.open_incidents ?? 0), overdue_actions: Number(a.overdue_actions ?? 0), pending_attendance: Number(a.pending_attendance ?? 0), web_orders_waiting: numOrNull(a.web_orders_waiting),
    },
    generated_at: String(d.generated_at ?? ''),
  };
  if (!weekStart) { try { localStorage.setItem(`agriconnect.weekly.${orgId}`, JSON.stringify(r)); } catch { /* bỏ qua */ } }
  return r;
}

/** Bản tuần vừa qua đã lưu lần trước (để xem lại khi mất mạng) */
export function cachedWeekly(orgId: string): WeeklyReport | null {
  try { const raw = localStorage.getItem(`agriconnect.weekly.${orgId}`); return raw ? (JSON.parse(raw) as WeeklyReport) : null; } catch { return null; }
}

