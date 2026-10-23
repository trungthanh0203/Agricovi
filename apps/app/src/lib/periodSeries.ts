import { supabase } from './supabase';

/**
 * Số liệu theo tháng cho biểu đồ xu hướng ở Trang chủ (G2-7, D79): máy chủ tính theo kỳ đầy đủ và kiểm quyền từng mục
 * (hàm `get_period_series`); điện thoại chỉ vẽ. Bản đã tải được nhớ trên máy để xem lại khi mất mạng (ghi rõ "đã lưu trên máy").
 */
export interface PeriodSeries {
  months: string[];
  /** null = người xem không có quyền xem mục đó */
  cost: number[] | null;
  revenue: number[] | null;
  harvest_kg: number[] | null;
  generated_at: string;
}

const cacheKey = (orgId: string, months: number) => `agriconnect.series.${orgId}.${months}`;

const toNums = (a: unknown): number[] | null => (Array.isArray(a) ? a.map((x) => Number(x)) : null);

export async function fetchPeriodSeries(orgId: string, months = 6): Promise<PeriodSeries> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_period_series', { p_org: orgId, p_months: months });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  const s: PeriodSeries = {
    months: (d.months as string[]) ?? [], cost: toNums(d.cost), revenue: toNums(d.revenue), harvest_kg: toNums(d.harvest_kg), generated_at: String(d.generated_at ?? ''),
  };
  try { localStorage.setItem(cacheKey(orgId, months), JSON.stringify(s)); } catch { /* bỏ qua */ }
  return s;
}

/** Bản đã lưu lần trước (null nếu chưa có) */
export function cachedPeriodSeries(orgId: string, months = 6): PeriodSeries | null {
  try {
    const raw = localStorage.getItem(cacheKey(orgId, months));
    return raw ? (JSON.parse(raw) as PeriodSeries) : null;
  } catch { return null; }
}
