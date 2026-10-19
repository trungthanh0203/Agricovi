import { db } from './db';
import { supabase } from './supabase';
import type { CycleSummary } from './summaryReport';

/** Các bảng mà tổng kết vụ dựa vào: bản ghi còn chờ gửi sẽ chưa có trong số liệu máy chủ */
const SUMMARY_TABLES = new Set(['harvest_records', 'expense_records', 'sales_records', 'inventory_transactions']);

export async function countPendingForSummary(): Promise<number> {
  const items = await db.outbox.where('state').notEqual('synced').toArray();
  return items.filter((i) => SUMMARY_TABLES.has(i.table)).length;
}

/** Tính tổng kết trên máy chủ (kiểm quyền ở CSDL) rồi lưu bản này để xem lại khi mất mạng */
export async function fetchCycleSummary(cycleId: string): Promise<CycleSummary> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('get_cycle_summary', { p_cycle: cycleId });
  if (error) throw error;
  const s = data as CycleSummary;
  await db.summaries.put({ cycle_id: cycleId, fetched_at: new Date().toISOString(), data: s });
  return s;
}

export const getCachedSummary = (cycleId: string) => db.summaries.get(cycleId);

/** Lưu file CSV về máy (người dùng bấm nút "Xuất CSV") */
export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
