import type { CycleStat } from './cycleStatsLogic';
import { supabase } from './supabase';

/** Số liệu tóm tắt của các vụ (máy chủ tính, kiểm quyền từng mục) và bản lưu để xem lại khi mất mạng. */
export interface CycleStats { generated_at: string; can_money: boolean; can_ops: boolean; cycles: CycleStat[] }

const KEY = (orgId: string) => `agriconnect.cyclestats.${orgId}`;
const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const B = (v: unknown) => (v === null || v === undefined ? null : Boolean(v));

/**
 * Chuẩn hóa dữ liệu thống kê từ máy chủ HOẶC từ bản lưu cũ trên máy: khóa thiếu (bản lưu từ phiên bản app cũ chưa có cột mới) thành null,
 * để giao diện không gặp "undefined" (lỗi "Cannot read properties of undefined (reading 'toLocaleString')").
 */
export function normalizeStats(d: Record<string, unknown>): CycleStats {
  return {
    generated_at: String(d.generated_at ?? ''), can_money: Boolean(d.can_money), can_ops: Boolean(d.can_ops),
    cycles: ((d.cycles ?? []) as Record<string, unknown>[]).map((x) => ({
      cycle_id: String(x.cycle_id), status: String(x.status), start_date: (x.start_date as string | null) ?? null, expected_end_date: (x.expected_end_date as string | null) ?? null,
      target_yield_kg: N(x.target_yield_kg), budget_amount: N(x.budget_amount), days_elapsed: N(x.days_elapsed), days_planned: N(x.days_planned), delay_days: N(x.delay_days),
      labor_hours: N(x.labor_hours), workers: N(x.workers), logs: N(x.logs), harvest_net: N(x.harvest_net), harvest_gross: N(x.harvest_gross), harvest_loss: N(x.harvest_loss),
      cost_total: N(x.cost_total), cost_material: N(x.cost_material), cost_labor: N(x.cost_labor), cost_other: N(x.cost_other), revenue: N(x.revenue), profit: N(x.profit),
      sold: N(x.sold), unsold: N(x.unsold), avg_price: N(x.avg_price), cost_per_kg: N(x.cost_per_kg), profit_per_kg: N(x.profit_per_kg), receivable: N(x.receivable),
      area_m2: N(x.area_m2), plant_count: N(x.plant_count), variety: (x.variety as string | null) ?? null, density_per_1000m2: N(x.density_per_1000m2), yield_per_1000m2: N(x.yield_per_1000m2),
      kg_per_plant: N(x.kg_per_plant), cost_per_1000m2: N(x.cost_per_1000m2), revenue_per_1000m2: N(x.revenue_per_1000m2), profit_per_1000m2: N(x.profit_per_1000m2),
      open_incidents: N(x.open_incidents), overdue_actions: N(x.overdue_actions),
      partial_out: B(x.partial_out), heads_out: N(x.heads_out), heads_left: N(x.heads_left),
      labor_unposted: N(x.labor_unposted), labor_unposted_missing_rate: N(x.labor_unposted_missing_rate), labor_manual: N(x.labor_manual),
      missing_cost: B(x.missing_cost), has_estimate: B(x.has_estimate), missing_harvest: B(x.missing_harvest), missing_revenue: B(x.missing_revenue),
    })),
  };
}

export const cachedCycleStats = (orgId: string): CycleStats | null => {
  try { const raw = localStorage.getItem(KEY(orgId)); return raw ? normalizeStats(JSON.parse(raw) as Record<string, unknown>) : null; } catch { return null; }
};

/** Số vụ tối đa hỏi máy chủ một lần (máy chủ cũng giới hạn 200) và số vụ tối đa app chịu tải số liệu một lúc (D173) */
const CHUNK = 100;
export const STATS_MAX_CYCLES = 120;

/**
 * Tải số liệu tóm tắt CHỈ cho các vụ cần hiển thị (D173), không tính cả cơ sở. Kết quả gộp vào bản lưu trên máy theo mã vụ
 * (vụ đã tải trước đó giữ nguyên cho tới khi tải lại) và trả về toàn bộ bản gộp để màn hình tra theo mã vụ.
 */
export async function fetchCycleStatsFor(orgId: string, ids: string[]): Promise<CycleStats> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const base = cachedCycleStats(orgId);
  const byId = new Map((base?.cycles ?? []).map((c) => [c.cycle_id, c]));
  let head = base ? { generated_at: base.generated_at, can_money: base.can_money, can_ops: base.can_ops } : { generated_at: '', can_money: false, can_ops: false };
  const want = ids.slice(0, STATS_MAX_CYCLES);
  for (let i = 0; i < want.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('get_cycles_stats_for', { p_org: orgId, p_cycle_ids: want.slice(i, i + CHUNK) });
    if (error) throw new Error(error.message);
    const r = normalizeStats(data as Record<string, unknown>);
    head = { generated_at: r.generated_at, can_money: r.can_money, can_ops: r.can_ops };
    for (const c of r.cycles) byId.set(c.cycle_id, c);
  }
  const merged: CycleStats = { ...head, cycles: [...byId.values()].slice(-1000) };
  try { localStorage.setItem(KEY(orgId), JSON.stringify(merged)); } catch { /* bỏ qua */ }
  return merged;
}
