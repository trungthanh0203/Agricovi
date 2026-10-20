/**
 * Tổng kết vụ (v1.1 mục 4.5): kiểu dữ liệu từ hàm máy chủ `get_cycle_summary`, các cảnh báo thiếu dữ liệu và xuất CSV.
 * Không import gì ngoài kiểu để dùng được cả trong app lẫn kiểm thử.
 *
 * Nguyên tắc: không gọi số liệu là "lợi nhuận chính xác" khi chi phí hoặc doanh thu chưa đầy đủ;
 * giá thành/kg và chênh lệch chỉ hiện khi đủ dữ liệu; luôn ghi thời điểm cập nhật.
 */

export interface CycleSummary {
  cycle_id: string;
  status: string;
  updated_at: string;
  cash_paid_other: number;
  cash_paid_material: number;
  material_used_cost: number;
  material_used_manual: number;
  allocated_or_estimated: number;
  /** Tiền công gắn vụ: kỳ đã khóa (đã duyệt) và kỳ chưa khóa (dự tính). Có thể thiếu ở bản máy chủ cũ. */
  labor_cost?: number;
  labor_estimated?: number;
  total_cost: number;
  harvested_gross_qty: number;
  harvest_loss_qty: number;
  harvested_net_qty: number;
  sold_qty: number;
  revenue_recorded: number;
  cost_per_kg: number | null;
  issues_missing_cost: number;
  issues_cost_from_average: number;
  has_estimated_cost: boolean;
  missing_harvest: boolean;
  missing_revenue: boolean;
}

export interface SummaryNote {
  level: 'warn' | 'info';
  text: string;
}

/** Cảnh báo cần hiện cùng tổng kết. `pendingCount` = số bản ghi còn nằm trên thiết bị, chưa tính vào số liệu máy chủ. */
export function summaryNotes(s: CycleSummary, pendingCount = 0): SummaryNote[] {
  const notes: SummaryNote[] = [];
  if (pendingCount > 0) {
    notes.push({ level: 'warn', text: `Có ${pendingCount} bản ghi trên điện thoại chưa gửi lên máy chủ nên chưa được tính vào tổng kết này.` });
  }
  if (s.missing_harvest) {
    notes.push({ level: 'warn', text: 'Chưa ghi thu hoạch nên chưa tính được giá thành mỗi kg.' });
  }
  if (s.missing_revenue) {
    notes.push({ level: 'warn', text: 'Chưa ghi doanh thu bán hàng nên chưa so sánh được thu và chi.' });
  }
  if (s.issues_missing_cost > 0) {
    notes.push({
      level: 'warn',
      text: `${s.issues_missing_cost} lần dùng vật tư chưa biết giá vốn nên chi phí vật tư đang bị thiếu. Hãy ghi giá khi nhập kho để tính đủ.`,
    });
  }
  if (s.issues_cost_from_average > 0) {
    notes.push({ level: 'info', text: `${s.issues_cost_from_average} lần dùng vật tư được tính theo giá nhập bình quân, không phải giá ghi riêng từng lần.` });
  }
  if (s.has_estimated_cost) {
    notes.push({ level: 'info', text: 'Tổng chi phí có cả khoản ước tính hoặc phân bổ (không phải tiền đã thực chi).' });
  }
  if ((s.labor_estimated ?? 0) > 0) {
    notes.push({ level: 'info', text: 'Nhân công có phần của kỳ trả công chưa khóa nên mới là dự tính. Chủ khóa kỳ để chốt số.' });
  }
  return notes;
}

/** Chỉ so sánh thu và chi khi chi phí vật tư đã đủ giá, đã có thu hoạch và doanh thu */
export function canCompare(s: CycleSummary): boolean {
  return !s.missing_harvest && !s.missing_revenue && s.issues_missing_cost === 0;
}

/** Số có dấu phân cách hàng nghìn kiểu Việt Nam, dùng cho cả giao diện lẫn CSV */
export const vnNumber = (n: number, digits = 3) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits });

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV mở được trong Excel (có BOM UTF-8 để giữ tiếng Việt). Số ghi nguyên, không có dấu phân cách nghìn,
 * để Excel và công cụ khác đọc được; ô giá thành để trống khi chưa đủ dữ liệu.
 */
export function buildSummaryCsv(opts: { cycleLabel: string; summary: CycleSummary; pendingCount?: number }): string {
  const { cycleLabel, summary: s } = opts;
  const rows: (string | number | null)[][] = [
    ['Mục', 'Giá trị', 'Đơn vị', 'Ghi chú'],
    ['Vụ trồng', cycleLabel, '', ''],
    ['Cập nhật lúc', new Date(s.updated_at).toLocaleString('vi-VN'), '', 'Giờ máy chủ khi tính tổng kết'],
    ['Thực chi không phải vật tư', s.cash_paid_other, 'đồng', ''],
    ['Vật tư đã dùng (tính từ kho)', s.material_used_cost, 'đồng', 'Giá vốn bình quân các lần nhập có giá'],
    ['Vật tư đã dùng (ghi tay)', s.material_used_manual, 'đồng', ''],
    ['Chi phí phân bổ / ước tính', s.allocated_or_estimated, 'đồng', ''],
    ['Nhân công (kỳ đã khóa)', s.labor_cost ?? 0, 'đồng', 'Tiền công của công/sản lượng gắn vụ'],
    ['Nhân công (kỳ chưa khóa, dự tính)', s.labor_estimated ?? 0, 'đồng', ''],
    ['Tổng chi phí đã ghi', s.total_cost, 'đồng', 'Chưa gồm tiền mua vật tư (đã tính khi dùng)'],
    ['Tiền mua vật tư (chỉ để tham khảo)', s.cash_paid_material, 'đồng', 'Không cộng vào tổng chi phí'],
    ['Tổng thu hoạch', s.harvested_gross_qty, 'kg', ''],
    ['Hao hụt', s.harvest_loss_qty, 'kg', ''],
    ['Thu hoạch sau hao hụt', s.harvested_net_qty, 'kg', ''],
    ['Đã bán', s.sold_qty, 'kg', ''],
    ['Doanh thu đã ghi', s.revenue_recorded, 'đồng', 'Chưa phải lợi nhuận'],
    ['Giá thành mỗi kg', s.cost_per_kg, s.cost_per_kg === null ? '' : 'đồng/kg', s.cost_per_kg === null ? 'Chưa đủ dữ liệu để tính' : ''],
  ];
  if (canCompare(s)) rows.push(['Doanh thu trừ chi phí đã ghi', s.revenue_recorded - s.total_cost, 'đồng', 'Chưa phải lợi nhuận chính thức']);
  for (const n of summaryNotes(s, opts.pendingCount ?? 0)) rows.push(['Lưu ý', n.text, '', n.level === 'warn' ? 'Cần xem' : 'Thông tin']);
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
