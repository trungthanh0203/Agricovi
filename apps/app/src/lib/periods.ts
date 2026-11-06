import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { requireOnline } from './serverWrite';
import { refreshCycle } from './production';

/**
 * Kỳ của vườn cây / đàn (migration 0182): mở kỳ mới sao quy trình thành việc của kỳ, đóng kỳ chốt ngày kết thúc.
 * Tổng kết theo kỳ và biến động đàn do máy chủ tính; app chỉ hiển thị. Cần mạng.
 */
export interface CyclePeriod { id: string; cycle_id: string; label: string; start_date: string; end_date: string | null; status: 'open' | 'closed'; template_id: string | null }

export interface PeriodSummary {
  period_id: string; label: string; status: 'open' | 'closed'; start: string; end: string | null; mode: string;
  cost_expenses: number; cost_material: number; cost_labor: number; depreciation: number; capital_in_window: number; capital_total: number; total_cost: number;
  harvest_net: number; harvest_gross: number; harvest_loss: number; sold_qty: number; revenue: number; profit: number;
  cost_per_kg: number | null; yield_per_plant: number | null; yield_per_1000m2: number | null; age_years: number | null; phase: 'construction' | 'business' | null;
  heads_end: number | null; cost_per_head: number | null; revenue_per_head: number | null;
}

export interface HerdGroupBalance { group: string; opening: number; in: number; born: number; move_in: number; move_out: number; dead: number; culled: number; out: number; closing: number }

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export async function listPeriods(cycleId: string): Promise<CyclePeriod[]> {
  const { data, error } = await client().from('cycle_periods').select('id, cycle_id, label, start_date, end_date, status, template_id').eq('cycle_id', cycleId).order('start_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as CyclePeriod[];
}

/** Danh sách kỳ của một vụ; chỉ tải với vườn cây / đàn */
export function useCyclePeriods(cycleId: string, enabled: boolean): { periods: CyclePeriod[] | null; reload: () => Promise<void> } {
  const [periods, setPeriods] = useState<CyclePeriod[] | null>(null);
  const reload = useCallback(async () => {
    if (!enabled || !navigator.onLine) return;
    try { setPeriods(await listPeriods(cycleId)); } catch { setPeriods([]); }
  }, [cycleId, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { periods, reload };
}

export async function openCyclePeriod(cycleId: string, label: string, start: string, templateId: string): Promise<void> {
  requireOnline('mở kỳ mới');
  const { error } = await client().rpc('open_cycle_period', { p_cycle: cycleId, p_label: label.trim(), p_start: start, p_template: templateId });
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId);
}

export async function closeCyclePeriod(cycleId: string, periodId: string, end: string): Promise<void> {
  requireOnline('đóng kỳ');
  const { error } = await client().rpc('close_cycle_period', { p_period: periodId, p_end: end });
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId);
}

export async function fetchPeriodsReport(cycleId: string): Promise<PeriodSummary[]> {
  requireOnline('xem tổng kết theo kỳ');
  const { data, error } = await client().rpc('get_cycle_periods_report', { p_cycle: cycleId });
  if (error) throw new Error(error.message);
  return (data ?? []) as PeriodSummary[];
}

export async function fetchHerdBalance(cycleId: string, from: string, to: string): Promise<HerdGroupBalance[]> {
  requireOnline('xem biến động đàn');
  const { data, error } = await client().rpc('get_herd_balance', { p_cycle: cycleId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []) as HerdGroupBalance[];
}

export async function setOrchardParams(cycleId: string, planting: string, maturity: number, amort: number): Promise<void> {
  requireOnline('lưu thông số vườn cây');
  const { error } = await client().rpc('set_orchard_params', { p_cycle: cycleId, p_planting: planting, p_maturity: maturity, p_amort: amort });
  if (error) throw new Error(error.message);
  await refreshCycle(cycleId);
}
