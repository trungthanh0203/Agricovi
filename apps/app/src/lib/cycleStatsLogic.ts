/**
 * Số liệu tóm tắt của vụ (D93), phần thuần (kiểu, tỉ lệ so với kế hoạch). Số tính ở máy chủ (get_cycles_stats); null = người xem không có quyền mục đó.
 */
export interface CycleStat {
  cycle_id: string; status: string; start_date: string | null; expected_end_date: string | null;
  target_yield_kg: number | null; budget_amount: number | null;
  days_elapsed: number | null; days_planned: number | null; delay_days: number | null; labor_hours: number | null; workers: number | null; logs: number | null;
  harvest_net: number | null; harvest_gross: number | null; harvest_loss: number | null;
  cost_total: number | null; cost_material: number | null; cost_labor: number | null; cost_other: number | null;
  revenue: number | null; profit: number | null; sold: number | null; unsold: number | null; avg_price: number | null; cost_per_kg: number | null; profit_per_kg: number | null;
  receivable: number | null;
  /** Diện tích và năng suất (D94) */
  area_m2: number | null; plant_count: number | null; variety: string | null; density_per_1000m2: number | null; yield_per_1000m2: number | null; kg_per_plant: number | null;
  cost_per_1000m2: number | null; revenue_per_1000m2: number | null; profit_per_1000m2: number | null;
  missing_cost: boolean | null; has_estimate: boolean | null; missing_harvest: boolean | null; missing_revenue: boolean | null;
}

/** Phần trăm đã dùng so với kế hoạch (làm tròn); null khi chưa có kế hoạch hoặc kế hoạch bằng 0 */
export function pctOf(used: number | null, plan: number | null): number | null {
  if (used === null || plan === null || plan <= 0) return null;
  return Math.round((used / plan) * 100);
}

/** Màu của thanh ngân sách: xanh khi dưới 80%, cam từ 80%, đỏ khi vượt 100% */
export function budgetTone(pct: number): 'ok' | 'warn' | 'bad' {
  return pct > 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
}

/** Những điều cần chú ý khi số liệu chưa đủ (hiện ở "Xem thêm") */
export function statWarnings(s: CycleStat): string[] {
  const w: string[] = [];
  if (s.missing_cost) w.push('Có vật tư đã dùng chưa có giá nên chi phí có thể thấp hơn thực tế.');
  if (s.has_estimate) w.push('Chi phí có phần ước tính hoặc tiền công chưa chốt.');
  if (s.missing_harvest) w.push('Chưa ghi thu hoạch nên chưa tính được giá thành mỗi kg.');
  if (s.missing_revenue) w.push('Chưa ghi doanh thu.');
  return w;
}

/** Vụ có số liệu nào để hiện không (không có quyền nào thì ẩn cả dòng thống kê) */
export function hasAnyStat(s: CycleStat | undefined): boolean {
  return !!s && (s.cost_total !== null || s.harvest_net !== null || s.revenue !== null || s.labor_hours !== null);
}
