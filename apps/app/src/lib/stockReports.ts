import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/** Báo cáo kho (K7): tính ở máy chủ, chỉ đọc, cần có mạng. */
export interface PeriodRow {
  material_id: string; material_name: string; unit_name: string; material_group: string | null;
  opening: number; receipts: number; issues: number; adjustments: number; closing: number;
}
export interface UseRow {
  cycle_id: string; cycle_name: string; area_name: string; material_id: string; material_name: string; unit_name: string;
  quantity: number; cost: number; cost_unknown: number;
}

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
const num = (v: unknown) => Number(v ?? 0);

/** Nhập–xuất–tồn theo kỳ (có thể lọc một kho) */
export async function fetchStockPeriod(orgId: string, from: string, to: string, locationId: string | null): Promise<PeriodRow[]> {
  requireOnline('xem báo cáo kho');
  const { data, error } = await client().rpc('get_stock_period_report', { p_org: orgId, p_from: from, p_to: to, p_location: locationId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    material_id: String(r.material_id), material_name: String(r.material_name), unit_name: String(r.unit_name ?? ''), material_group: (r.material_group as string | null) ?? null,
    opening: num(r.opening), receipts: num(r.receipts), issues: num(r.issues), adjustments: num(r.adjustments), closing: num(r.closing),
  }));
}

/** Vật tư dùng theo vụ trong kỳ (lượng ròng và giá vốn) */
export async function fetchMaterialUse(orgId: string, from: string, to: string): Promise<UseRow[]> {
  requireOnline('xem báo cáo kho');
  const { data, error } = await client().rpc('get_material_use_by_cycle', { p_org: orgId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cycle_id: String(r.cycle_id), cycle_name: String(r.cycle_name), area_name: String(r.area_name), material_id: String(r.material_id),
    material_name: String(r.material_name), unit_name: String(r.unit_name ?? ''), quantity: num(r.quantity), cost: num(r.cost), cost_unknown: num(r.cost_unknown),
  }));
}

const NL = String.fromCharCode(13, 10);
const cell = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[,"\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
};

/** CSV mở được bằng Excel (BOM UTF-8, số ghi nguyên không dấu phân cách) */
export function buildStockCsv(title: string, orgName: string, from: string, to: string, head: string[], rows: (string | number | null)[][], total?: (string | number | null)[]): string {
  const lines = [`${title} - ${orgName}`, `Từ ${from} đến ${to}`].map(cell);
  lines.push(head.map(cell).join(','));
  for (const r of rows) lines.push(r.map(cell).join(','));
  if (total) lines.push(total.map(cell).join(','));
  return String.fromCharCode(0xfeff) + lines.join(NL) + NL;
}

/** Tổng giá vốn và số dòng chưa biết giá của báo cáo vật tư theo vụ */
export function useTotals(rows: UseRow[]): { cost: number; unknown: number } {
  return { cost: rows.reduce((s, r) => s + r.cost, 0), unknown: rows.reduce((s, r) => s + r.cost_unknown, 0) };
}
