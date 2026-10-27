import type { CountSummary } from './countLogic';

/**
 * Chỉ số "Theo con" của Tổng kết vụ cho vật nuôi và thủy sản (phần thuần). Tính ở máy từ số lượng đã ghi (nhập, chết, loại, xuất; số con ở phiếu thu hoạch)
 * và số tổng kết của máy chủ. Thiếu số liệu thì trả về null (không đoán) và liệt kê trong `missing` để nhắc người dùng.
 */
export interface PerHeadInput {
  counts: CountSummary;
  /** thu hoạch sau hao hụt (kg), tổng chi phí đã ghi, doanh thu đã ghi (đồng) từ tổng kết của máy chủ */
  netKg: number;
  totalCost: number;
  revenue: number;
  /** đã đủ dữ liệu để so doanh thu với chi phí (canCompare) */
  compare: boolean;
}

export interface PerHead {
  entered: number | null;
  lost: number;
  lossPct: number | null;
  out: number;
  netKg: number;
  kgPerHead: number | null;
  costPerHead: number | null;
  revenuePerHead: number | null;
  /** dương = lãi, âm = lỗ; null nếu chưa đủ dữ liệu so sánh */
  profitPerHead: number | null;
  missing: string[];
}

const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function perHeadSummary(i: PerHeadInput): PerHead {
  const c = i.counts;
  const entered = c.initial !== null ? c.initial + c.added : c.added > 0 ? c.added : null;
  const out = c.out;
  const missing: string[] = [];
  if (entered === null) missing.push('số con nhập');
  if (out <= 0) missing.push('số con xuất (ghi ở phiếu thu hoạch hoặc "Xuất / chuyển đi")');
  const per = (v: number) => (out > 0 ? v / out : null);
  const kg = per(i.netKg);
  const cost = i.totalCost > 0 ? per(i.totalCost) : null;
  const rev = i.revenue > 0 ? per(i.revenue) : null;
  return {
    entered, lost: c.dead + c.culled, lossPct: c.lossPct, out, netKg: i.netKg,
    kgPerHead: kg === null ? null : r(kg, 1),
    costPerHead: cost === null ? null : r(cost),
    revenuePerHead: rev === null ? null : r(rev),
    profitPerHead: i.compare && out > 0 ? r((i.revenue - i.totalCost) / out) : null,
    missing,
  };
}
