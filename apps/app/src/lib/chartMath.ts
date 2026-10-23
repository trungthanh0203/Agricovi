/**
 * Phần tính toán thuần của biểu đồ (không dùng React) để kiểm thử được: thang trục "đẹp", gộp phần nhỏ thành "Khác",
 * rút gọn số, nhãn tháng/ngày. Quy tắc trình bày: docs/DESIGN_DASHBOARD.md mục 3.
 */

export interface Scale { min: number; max: number; step: number; ticks: number[] }

/**
 * Thang trục dạng số tròn (1, 2, 2,5, 5 × 10^n). Cột và đường luôn gồm mốc 0 nên min ≤ 0 ≤ max.
 * `target` = số khoảng chia mong muốn (thực tế gần số đó).
 */
export function niceScale(minValue: number, maxValue: number, target = 4): Scale {
  let lo = Math.min(0, Number.isFinite(minValue) ? minValue : 0);
  let hi = Math.max(0, Number.isFinite(maxValue) ? maxValue : 0);
  if (hi === lo) hi = lo + 1; // không có số liệu: vẫn vẽ được trục 0–1
  const rough = (hi - lo) / Math.max(1, target);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  const step = nice * pow;
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

export interface Slice { label: string; value: number }

/**
 * Cơ cấu: bỏ phần bằng 0 hoặc âm, sắp xếp giảm dần, tối đa `maxSlices` phần; phần còn lại gộp thành "Khác" (docs/DESIGN_DASHBOARD.md mục 3.7).
 */
export function groupOthers<T extends Slice>(items: T[], maxSlices = 6, otherLabel = 'Khác'): Slice[] {
  const pos = items.filter((i) => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  if (pos.length <= maxSlices) return pos.map((i) => ({ label: i.label, value: i.value }));
  const head = pos.slice(0, maxSlices - 1).map((i) => ({ label: i.label, value: i.value }));
  const rest = pos.slice(maxSlices - 1).reduce((s, i) => s + i.value, 0);
  return [...head, { label: otherLabel, value: rest }];
}

/** Phần trăm làm tròn một chữ số thập phân (0 khi tổng bằng 0) */
export function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

const vi = (n: number, digits = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits });

/** Số rút gọn cho trục và nhãn: 1,2 tr · 3,4 tỷ · 850 k. Tiền và số lượng dùng cùng cách. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return `${vi(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${vi(n / 1e6)} tr`;
  if (a >= 1e4) return `${vi(n / 1e3, 0)} k`;
  if (a >= 1e3) return `${vi(n / 1e3)} k`;
  return vi(n, a < 10 ? 1 : 0);
}

/** "2026-10" -> "T10/26"; nhãn khác giữ nguyên */
export function monthShort(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  return m ? `T${Number(m[2])}/${m[1]!.slice(2)}` : label;
}

/** "2026-10-23" -> "23/10"; nhãn khác giữ nguyên */
export function dayShort(label: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(label);
  return m ? `${m[2]}/${m[1]}` : label;
}

/** Cắt chữ dài thêm dấu … (nhãn trên trục, tên dài trong danh sách) */
export function clip(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…` : label;
}

/** Bước nhảy nhãn trục X để các nhãn không đè lên nhau: hiện 1 nhãn mỗi `step` điểm */
export function labelStep(count: number, maxLabels: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
}
