import type { AreaRollupServerRow } from './areas';
import { supabase } from './supabase';

/**
 * Tổng hợp theo khu do máy chủ cộng sẵn (D177): app không tải số liệu từng vụ cho màn Tổng kết vụ theo phân khu.
 * Kết quả mỗi bộ lọc được lưu trên máy để xem lại khi mất mạng.
 */
export interface AreaRollupData { can_money: boolean; can_harvest: boolean; generated_at: string; rows: AreaRollupServerRow[] }

const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const KEY = (orgId: string, k: string) => `agriconnect.arearollup.${orgId}.${k}`;

function normalize(d: Record<string, unknown>): AreaRollupData {
  return {
    can_money: Boolean(d.can_money), can_harvest: Boolean(d.can_harvest), generated_at: String(d.generated_at ?? ''),
    rows: ((d.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      area_id: String(r.area_id), cycles: Number(r.cycles ?? 0), running: Number(r.running ?? 0),
      cost: N(r.cost), harvest: N(r.harvest), revenue: N(r.revenue), profit: N(r.profit),
    })),
  };
}

export const cachedAreaRollup = (orgId: string, key: string): AreaRollupData | null => {
  try { const raw = localStorage.getItem(KEY(orgId, key)); return raw ? normalize(JSON.parse(raw) as Record<string, unknown>) : null; } catch { return null; }
};

export async function fetchAreaRollup(orgId: string, key: string, statuses: string[] | null, endedFrom: string | null, endedTo: string | null, refresh = false): Promise<AreaRollupData> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_area_rollup', { p_org: orgId, p_statuses: statuses, p_ended_from: endedFrom, p_ended_to: endedTo, ...(refresh ? { p_refresh: true } : {}) });
  if (error) throw new Error(error.message);
  const r = normalize(data as Record<string, unknown>);
  try { localStorage.setItem(KEY(orgId, key), JSON.stringify(r)); } catch { /* bỏ qua */ }
  return r;
}

/** Một vụ trong danh sách của khu (D178); lãi/lỗ null khi vụ chưa có doanh thu hoặc đang xuất dở (pending) */
export interface AreaCycleItem {
  cycle_id: string; area_id: string; name: string; status: string; start_date: string | null; end_date: string | null;
  cost: number | null; harvest: number | null; revenue: number | null; profit: number | null; pending: boolean | null;
}
export interface AreaCyclePage { can_money: boolean; total: number; items: AreaCycleItem[] }
export const AREA_CYCLES_PAGE = 50;

/** Danh sách vụ của một khu (ô hoặc phân khu gồm ô con), từng trang 50 vụ; chỉ tải khi người dùng mở khu */
export async function fetchAreaCycles(orgId: string, areaId: string, statuses: string[] | null, endedFrom: string | null, endedTo: string | null, offset: number): Promise<AreaCyclePage> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_area_cycles', { p_org: orgId, p_area: areaId, p_statuses: statuses, p_ended_from: endedFrom, p_ended_to: endedTo, p_limit: AREA_CYCLES_PAGE, p_offset: offset });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    can_money: Boolean(d.can_money), total: Number(d.total ?? 0),
    items: ((d.items ?? []) as Record<string, unknown>[]).map((r) => ({
      cycle_id: String(r.cycle_id), area_id: String(r.area_id), name: String(r.name ?? 'Vụ'), status: String(r.status),
      start_date: (r.start_date as string | null) ?? null, end_date: (r.end_date as string | null) ?? null,
      cost: N(r.cost), harvest: N(r.harvest), revenue: N(r.revenue), profit: N(r.profit), pending: r.pending === null || r.pending === undefined ? null : Boolean(r.pending),
    })),
  };
}
