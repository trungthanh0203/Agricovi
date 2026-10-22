import { sb } from './db';

/** Tóm tắt tin giao thương công khai (khách chỉ thấy phần này; chi tiết cần đăng nhập) */
export interface TradeSummary { id: string; kind: 'buy' | 'sell'; title: string; category_id: string | null; category_name: string | null; province: string; quantity: number | null; unit: string; expires_at: string; created_at: string }

let memo: { at: number; v: TradeSummary[] } | null = null;
export async function loadTradePosts(): Promise<TradeSummary[]> {
  if (memo && Date.now() - memo.at < 30_000) return memo.v;
  let v: TradeSummary[] = [];
  try {
    if (sb) {
      const { data, error } = await Promise.race([
        sb.from('public_trade_posts').select('id, kind, title, category_id, category_name, province, quantity, unit, expires_at, created_at').order('created_at', { ascending: false }).limit(300),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500)),
      ]);
      if (!error) v = (data ?? []) as TradeSummary[];
    }
  } catch { /* bảng chưa có hoặc chậm: danh sách rỗng */ }
  memo = { at: Date.now() - (v.length ? 0 : 20_000), v };
  return v;
}
export const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
