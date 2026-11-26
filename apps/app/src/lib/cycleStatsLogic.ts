import { t } from '@lingui/core/macro';
import { dateLocale } from './format';
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
  /** Sự cố đang mở và việc khắc phục quá hạn (D95) */
  open_incidents: number | null; overdue_actions: number | null;
  /** Vật nuôi đang xuất dở (D170): chưa tính giá thành/lãi theo kg */
  /** Công chấm công chưa vào bảng lương được tính tạm (D171) */
  labor_unposted?: number | null; labor_unposted_missing_rate?: number | null; labor_manual?: number | null;
  /** Vườn cây theo mùa vụ (D176) */
  cycle_mode?: string | null; orchard_cycle_id?: string | null; orchard_depreciation?: number | null; capital_total?: number | null; depreciated_to_date?: number | null; seasons?: number | null;
  partial_out?: boolean | null; heads_out?: number | null; heads_left?: number | null;
  missing_cost: boolean | null; has_estimate: boolean | null; missing_harvest: boolean | null; missing_revenue: boolean | null;
}

/**
 * Vụ chưa kết thúc và chưa có doanh thu thì CHƯA có lãi/lỗ để nói (D170): chi phí đã bỏ ra nhưng chưa bán, hiện "lỗ" sẽ gây hiểu nhầm.
 * Số lãi/lỗ của máy chủ vẫn đúng về phép tính; chỉ giao diện không hiện và không cộng vào tổng lãi/lỗ.
 */
export function profitPending(s: Pick<CycleStat, 'status' | 'revenue' | 'partial_out' | 'cycle_mode' | 'seasons'>): boolean {
  if (s.cycle_mode === 'perennial' && (s.seasons ?? 0) > 0) return true;   // vườn đã có vụ mùa: lãi/lỗ xem ở từng vụ mùa
  return s.status !== 'ended' && (s.partial_out === true || !(s.revenue !== null && s.revenue > 0));
}

/** Lý do chưa có lãi/lỗ, viết cho người xem */
export function profitPendingText(s: Pick<CycleStat, 'partial_out' | 'heads_out' | 'heads_left' | 'cycle_mode' | 'seasons'>): string {
  if (s.cycle_mode === 'perennial' && (s.seasons ?? 0) > 0) return t`Vườn cây: xem lãi/lỗ ở từng mùa vụ (khấu hao đầu tư đã chia vào các vụ mùa)`;
  return s.partial_out ? t`Đã xuất ${s.heads_out ?? 0} con, còn ${s.heads_left ?? 0} con: lãi/lỗ và giá thành/kg tính khi xuất hết` : t`Chưa có doanh thu (chưa bán)`;
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
  if (s.missing_cost) w.push(t`Có vật tư đã dùng chưa có giá nên chi phí có thể thấp hơn thực tế.`);
  if (s.has_estimate) w.push(t`Chi phí có phần ước tính hoặc tiền công chưa chốt.`);
  if ((s.labor_manual ?? 0) > 0 && (s.labor_unposted ?? 0) > 0) w.push(t`Vụ vừa có tiền công ghi tay vừa có công chấm công chưa vào bảng lương: hãy kiểm tra xem có tính trùng không.`);
  if ((s.labor_unposted_missing_rate ?? 0) > 0) w.push(t`${s.labor_unposted_missing_rate!} ca công chưa có đơn giá giờ nên chưa tính vào chi phí.`);
  if (s.sold !== null && s.harvest_net !== null && s.harvest_net > 0 && s.sold > s.harvest_net + 0.5) w.push(t`Đã bán ${Math.round(s.sold).toLocaleString(dateLocale())} kg nhiều hơn thu hoạch sau hao hụt ${Math.round(s.harvest_net).toLocaleString(dateLocale())} kg: hãy kiểm tra số thu hoạch hoặc số bán.`);
  if (s.missing_harvest) w.push(t`Chưa ghi thu hoạch nên chưa tính được giá thành mỗi kg.`);
  if (s.missing_revenue) w.push(t`Chưa ghi doanh thu.`);
  return w;
}

/** Vụ có số liệu nào để hiện không (không có quyền nào thì ẩn cả dòng thống kê) */
export function hasAnyStat(s: CycleStat | undefined): boolean {
  return !!s && (s.cost_total !== null || s.harvest_net !== null || s.revenue !== null || s.labor_hours !== null);
}

/**
 * Giá thành mỗi kg để so với giá bán lúc ghi bán (H7). Vụ đã có giá thành thì dùng số của máy chủ (tạm tính nếu vụ chưa kết thúc).
 * Vật nuôi đang xuất dở (máy chủ chưa tính giá thành): ước theo cân trung bình mỗi con đã xuất × tổng số con (đã xuất + còn lại).
 * Trả null khi không đủ số liệu hoặc người xem không có quyền xem chi phí.
 */
export function saleCostHint(s: CycleStat | undefined): { perKg: number; estimated: boolean; note: string } | null {
  if (!s || s.cost_total === null) return null;
  if (s.cost_per_kg !== null && s.cost_per_kg > 0) {
    return { perKg: Math.round(s.cost_per_kg), estimated: s.status !== 'ended', note: s.status === 'ended' ? t`giá thành của vụ` : t`giá thành tạm tính, chi phí còn thay đổi đến khi kết thúc vụ` };
  }
  if (s.partial_out && s.harvest_net !== null && s.harvest_net > 0 && (s.heads_out ?? 0) > 0) {
    const heads = (s.heads_out ?? 0) + (s.heads_left ?? 0);
    const projectedKg = (s.harvest_net / (s.heads_out ?? 1)) * heads;
    if (projectedKg > 0 && s.cost_total > 0) {
      return { perKg: Math.round(s.cost_total / projectedKg), estimated: true, note: t`ước theo cân trung bình đã xuất, còn ${s.heads_left ?? 0} con chưa xuất` };
    }
  }
  return null;
}

/** So giá bán mỗi kg với giá thành: lãi/lỗ mỗi kg và cho cả lần bán */
export function saleVsCost(pricePerKg: number, qtyKg: number, costPerKg: number): { diffPerKg: number; total: number } {
  const diffPerKg = Math.round(pricePerKg - costPerKg);
  return { diffPerKg, total: Math.round((pricePerKg - costPerKg) * qtyKg) };
}
