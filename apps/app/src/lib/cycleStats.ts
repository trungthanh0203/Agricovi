import type { CycleStat } from './cycleStatsLogic';
import { supabase } from './supabase';

/** Số liệu tóm tắt của các vụ (máy chủ tính, kiểm quyền từng mục) và bản lưu để xem lại khi mất mạng. */
export interface CycleStats { generated_at: string; can_money: boolean; can_ops: boolean; cycles: CycleStat[] }

const KEY = (orgId: string) => `agriconnect.cyclestats.${orgId}`;
const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const B = (v: unknown) => (v === null || v === undefined ? null : Boolean(v));

export const cachedCycleStats = (orgId: string): CycleStats | null => {
  try { const raw = localStorage.getItem(KEY(orgId)); return raw ? (JSON.parse(raw) as CycleStats) : null; } catch { return null; }
};

export async function fetchCycleStats(orgId: string): Promise<CycleStats> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_cycles_stats', { p_org: orgId });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const r: CycleStats = {
    generated_at: String(d.generated_at ?? ''), can_money: Boolean(d.can_money), can_ops: Boolean(d.can_ops),
    cycles: ((d.cycles ?? []) as Record<string, unknown>[]).map((x) => ({
      cycle_id: String(x.cycle_id), status: String(x.status), start_date: (x.start_date as string | null) ?? null, expected_end_date: (x.expected_end_date as string | null) ?? null,
      target_yield_kg: N(x.target_yield_kg), budget_amount: N(x.budget_amount), days_elapsed: N(x.days_elapsed), days_planned: N(x.days_planned), delay_days: N(x.delay_days),
      labor_hours: N(x.labor_hours), workers: N(x.workers), logs: N(x.logs), harvest_net: N(x.harvest_net), harvest_gross: N(x.harvest_gross), harvest_loss: N(x.harvest_loss),
      cost_total: N(x.cost_total), cost_material: N(x.cost_material), cost_labor: N(x.cost_labor), cost_other: N(x.cost_other), revenue: N(x.revenue), profit: N(x.profit),
      sold: N(x.sold), unsold: N(x.unsold), avg_price: N(x.avg_price), cost_per_kg: N(x.cost_per_kg), profit_per_kg: N(x.profit_per_kg), receivable: N(x.receivable),
      area_m2: N(x.area_m2), plant_count: N(x.plant_count), variety: (x.variety as string | null) ?? null, density_per_1000m2: N(x.density_per_1000m2), yield_per_1000m2: N(x.yield_per_1000m2),
      kg_per_plant: N(x.kg_per_plant), cost_per_1000m2: N(x.cost_per_1000m2), revenue_per_1000m2: N(x.revenue_per_1000m2), profit_per_1000m2: N(x.profit_per_1000m2),
      missing_cost: B(x.missing_cost), has_estimate: B(x.has_estimate), missing_harvest: B(x.missing_harvest), missing_revenue: B(x.missing_revenue),
    })),
  };
  try { localStorage.setItem(KEY(orgId), JSON.stringify(r)); } catch { /* bỏ qua */ }
  return r;
}
