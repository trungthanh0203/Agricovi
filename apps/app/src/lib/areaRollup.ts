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

export async function fetchAreaRollup(orgId: string, key: string, statuses: string[] | null, endedFrom: string | null, endedTo: string | null): Promise<AreaRollupData> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_area_rollup', { p_org: orgId, p_statuses: statuses, p_ended_from: endedFrom, p_ended_to: endedTo });
  if (error) throw new Error(error.message);
  const r = normalize(data as Record<string, unknown>);
  try { localStorage.setItem(KEY(orgId, key), JSON.stringify(r)); } catch { /* bỏ qua */ }
  return r;
}
