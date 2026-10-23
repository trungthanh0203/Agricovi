import { clip, dayShort, groupOthers, monthShort } from './chartMath';
import type { ReportResult } from './reports';

/**
 * Chọn biểu đồ cho kết quả Báo cáo theo nhu cầu (G2-7, docs/DESIGN_DASHBOARD.md):
 *  - nhóm theo THÁNG/NGÀY  -> biểu đồ cột theo thời gian;
 *  - chi phí theo nhóm/loại khoản (≤ 6 phần) -> vòng cơ cấu;
 *  - nhóm khác (vụ, khách, nhà cung ứng, vật tư, người…) -> thanh ngang "Top N" của số đo chính;
 *  - tổng hợp theo vụ -> so sánh chi phí và doanh thu từng vụ.
 * Màu theo nghĩa cố định: thu = xanh lá (ok), chi/nợ = đỏ (bad), số lượng/tổng = xanh dương (info), cảnh báo = cam (warn).
 * Thuần tính toán (không React) để kiểm thử được.
 */

export type ValueKind = 'money' | 'num' | 'int';
export type Tone = 'ok' | 'bad' | 'warn' | 'info';

export interface SeriesSpec { key: string; label: string; tone: Tone; kind: ValueKind }

export type ChartSpec =
  | { kind: 'bars'; title: string; labels: string[]; shortLabels: string[]; series: SeriesSpec[]; values: number[][] }
  | { kind: 'donut'; title: string; valueKind: ValueKind; unit: string; items: { label: string; value: number }[] }
  | { kind: 'hbars'; title: string; valueKind: ValueKind; unit: string; items: { label: string; value: number }[] };

type Row = Record<string, string | number | null>;
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const TOP = 8;

/** Số đo chính và nhãn của từng loại báo cáo khi hiện dạng thanh ngang */
const PRIMARY: Record<string, { key: string; unit: string; kind: ValueKind; title: string }> = {
  expenses: { key: 'amount', unit: 'đ', kind: 'money', title: 'Chi phí' },
  sales: { key: 'amount', unit: 'đ', kind: 'money', title: 'Doanh thu' },
  harvest: { key: 'net', unit: 'kg', kind: 'num', title: 'Thu hoạch sau hao hụt' },
  stock: { key: 'receipt', unit: '', kind: 'num', title: 'Số lượng nhập' },
  labor: { key: 'hours', unit: 'giờ', kind: 'num', title: 'Giờ công' },
  purchases: { key: 'total', unit: 'đ', kind: 'money', title: 'Tiền mua hàng' },
  customers: { key: 'amount', unit: 'đ', kind: 'money', title: 'Doanh thu' },
};

/** Các cột vẽ theo thời gian của từng loại báo cáo */
const TIME_SERIES: Record<string, SeriesSpec[]> = {
  expenses: [{ key: 'amount', label: 'Chi phí', tone: 'bad', kind: 'money' }],
  sales: [{ key: 'amount', label: 'Doanh thu', tone: 'ok', kind: 'money' }],
  harvest: [{ key: 'net', label: 'Sau hao hụt (kg)', tone: 'info', kind: 'num' }, { key: 'loss', label: 'Hao hụt (kg)', tone: 'warn', kind: 'num' }],
  stock: [{ key: 'receipt', label: 'Nhập', tone: 'ok', kind: 'num' }, { key: 'issue', label: 'Xuất dùng', tone: 'bad', kind: 'num' }],
  labor: [{ key: 'hours', label: 'Giờ công', tone: 'info', kind: 'num' }],
  purchases: [{ key: 'total', label: 'Tổng tiền', tone: 'info', kind: 'money' }, { key: 'owed', label: 'Còn nợ', tone: 'bad', kind: 'money' }],
  customers: [{ key: 'amount', label: 'Doanh thu', tone: 'ok', kind: 'money' }, { key: 'owed', label: 'Còn phải thu', tone: 'bad', kind: 'money' }],
};

export function buildChartSpec(r: Pick<ReportResult, 'type' | 'group' | 'rows' | 'columns'>): ChartSpec | null {
  const rows = r.rows as Row[];
  if (rows.length === 0) return null;
  const has = (key: string) => r.columns.some((c) => c.key === key);

  // Tổng hợp theo vụ: so sánh chi phí và doanh thu từng vụ
  if (r.type === 'cycles') {
    const top = [...rows].sort((a, b) => n(b.cost) - n(a.cost)).slice(0, TOP);
    return {
      kind: 'bars', title: 'Chi phí và doanh thu theo vụ',
      labels: top.map((x) => String(x.label ?? '—')), shortLabels: top.map((x) => clip(String(x.label ?? '—'), 9)),
      series: [{ key: 'cost', label: 'Tổng chi phí', tone: 'bad', kind: 'money' }, { key: 'revenue', label: 'Doanh thu đã ghi', tone: 'ok', kind: 'money' }],
      values: [top.map((x) => n(x.cost)), top.map((x) => n(x.revenue))],
    };
  }

  const primary = PRIMARY[r.type];
  if (!primary || !has(primary.key)) return null;

  // Theo thời gian
  if (r.group === 'month' || r.group === 'day') {
    const series = (TIME_SERIES[r.type] ?? []).filter((s) => has(s.key));
    if (series.length === 0) return null;
    const labels = rows.map((x) => String(x.label ?? ''));
    return {
      kind: 'bars', title: `${primary.title} theo ${r.group === 'month' ? 'tháng' : 'ngày'}`,
      labels, shortLabels: labels.map((l) => (r.group === 'month' ? monthShort(l) : dayShort(l))),
      series, values: series.map((s) => rows.map((x) => n(x[s.key]))),
    };
  }

  const items = rows.map((x) => ({ label: String(x.label ?? '—'), value: n(x[primary.key]) })).filter((x) => x.value > 0);
  if (items.length === 0) return null;
  // Cơ cấu chi phí theo nhóm/loại khoản: vòng (tối đa 6 phần)
  if (r.type === 'expenses' && (r.group === 'category' || r.group === 'kind' || r.group === 'default') && items.length <= 8) {
    return { kind: 'donut', title: `Cơ cấu ${primary.title.toLowerCase()}`, valueKind: primary.kind, unit: primary.unit, items: groupOthers(items, 6) };
  }
  // Còn lại: Top N thanh ngang
  const top = [...items].sort((a, b) => b.value - a.value).slice(0, TOP);
  return { kind: 'hbars', title: `${primary.title}: ${top.length < items.length ? `${top.length} mục lớn nhất` : 'theo từng mục'}`, valueKind: primary.kind, unit: primary.unit, items: top };
}
