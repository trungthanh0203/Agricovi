import type { CycleStat } from './cycleStatsLogic';

/**
 * So năng suất, chi phí và lãi theo diện tích của vụ này với các vụ trước ở CÙNG nơi (H6, D185). Phần thuần, có test.
 * Chỉ so các vụ cùng loại sản phẩm, cùng nơi trồng, đã kết thúc và có diện tích; số lấy từ thống kê vụ của máy chủ (D93/D94).
 */
export interface CompareRow {
  cycleId: string; current: boolean;
  yieldPer1000: number | null; costPer1000: number | null; profitPer1000: number | null; costPerKg: number | null;
}

/** Các vụ trước của cùng nơi để so: cùng khu, cùng sản phẩm, đã kết thúc, khác vụ hiện tại; mới kết thúc trước; tối đa `limit` vụ */
export function previousCycleIds(
  cur: { id: string; area_id: string; crop_type_id: string | null },
  all: { id: string; area_id: string; crop_type_id: string | null; status: string; end_date?: string | null; expected_end_date?: string | null; start_date?: string | null }[],
  limit = 3,
): string[] {
  return all
    .filter((c) => c.id !== cur.id && c.area_id === cur.area_id && c.crop_type_id === cur.crop_type_id && c.status === 'ended')
    .sort((a, b) => (b.end_date ?? b.expected_end_date ?? b.start_date ?? '').localeCompare(a.end_date ?? a.expected_end_date ?? a.start_date ?? ''))
    .slice(0, limit)
    .map((c) => c.id);
}

export function compareRows(currentId: string, stats: CycleStat[], order: string[]): CompareRow[] {
  const by = new Map(stats.map((s) => [s.cycle_id, s]));
  const row = (id: string, current: boolean): CompareRow | null => {
    const s = by.get(id);
    if (!s) return null;
    return { cycleId: id, current, yieldPer1000: s.yield_per_1000m2, costPer1000: s.cost_per_1000m2, profitPer1000: s.profit_per_1000m2, costPerKg: s.cost_per_kg };
  };
  return [row(currentId, true), ...order.map((id) => row(id, false))].filter((r): r is CompareRow => r !== null);
}

/** Thay đổi năng suất (%) của vụ này so với vụ trước gần nhất có năng suất; null khi không đủ số liệu */
export function yieldChangePct(rows: CompareRow[]): number | null {
  const cur = rows.find((r) => r.current)?.yieldPer1000;
  const prev = rows.find((r) => !r.current && r.yieldPer1000 !== null && r.yieldPer1000 > 0)?.yieldPer1000;
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
