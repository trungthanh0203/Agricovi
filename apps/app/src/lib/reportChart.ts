import { clip, dayShort, groupOthers, monthShort } from './chartMath';
import type { ReportResult } from './reports';

/**
 * Chọn biểu đồ cho kết quả Báo cáo theo nhu cầu, DỰA VÀO CÁC CỘT THỰC CÓ của kết quả (không gắn cứng theo loại báo cáo):
 *  - nhãn theo THÁNG/NGÀY (hoặc nhãn dạng ngày)  -> cột theo thời gian;
 *  - chi phí theo nhóm/loại khoản (≤ 8 phần)    -> vòng cơ cấu;
 *  - có cả cột chi phí và doanh thu              -> so sánh hai cột (mặc định cho tổng hợp theo vụ, theo ô/phân khu);
 *  - còn lại                                     -> thanh ngang "Top N" của số đo đang chọn (âm vẽ màu đỏ, ghi "âm").
 * Người xem đổi được số đo cần vẽ (`chartOptions`): mọi cột cộng được của báo cáo đều vẽ được, nên không còn báo "không có số liệu"
 * khi bảng có số. Màu theo nghĩa: thu = xanh lá (ok), chi/nợ = đỏ (bad), số lượng = xanh dương (info), hao hụt = cam (warn).
 * Thuần tính toán (không React) để kiểm thử được.
 */

export type ValueKind = 'money' | 'num' | 'int';
export type Tone = 'ok' | 'bad' | 'warn' | 'info';

export interface SeriesSpec { key: string; label: string; tone: Tone; kind: ValueKind }
export interface ChartItem { label: string; value: number; tone?: Tone; note?: string }

export type ChartSpec =
  | { kind: 'bars'; title: string; labels: string[]; shortLabels: string[]; series: SeriesSpec[]; values: number[][] }
  | { kind: 'donut'; title: string; valueKind: ValueKind; unit: string; items: { label: string; value: number }[] }
  | { kind: 'hbars'; title: string; valueKind: ValueKind; unit: string; tone: Tone; items: ChartItem[] };

/** Một lựa chọn "vẽ theo" cho người xem */
export interface ChartOption { key: string; label: string }
export const COMPARE_KEY = '__compare';

type Row = Record<string, string | number | null>;
type Col = { key: string; label: string; kind: string; sum?: boolean };
type Input = Pick<ReportResult, 'type' | 'group' | 'rows' | 'columns'>;
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const TOP = 8;

const MONEY_KEYS = new Set(['amount', 'total', 'cost', 'revenue', 'profit', 'owed', 'paid', 'collected', 'received', 'payable', 'receivable']);
const BAD_KEYS = new Set(['cost', 'owed', 'issue', 'payable']);
const OK_KEYS = new Set(['revenue', 'collected', 'receipt', 'profit', 'received']);
const WARN_KEYS = new Set(['loss']);
/** Thứ tự ưu tiên khi chọn số đo mặc định */
const PREFER = ['amount', 'total', 'revenue', 'net', 'hours', 'receipt', 'cost', 'qty', 'harvest_kg', 'cycles', 'count'];
const UNIT_BY_KEY: Record<string, string> = { net: 'kg', gross: 'kg', loss: 'kg', harvest_kg: 'kg', hours: 'giờ', cycles: 'vụ', count: '' };

/** Các cột vẽ cùng nhau theo thời gian (mặc định) của từng loại báo cáo, nếu báo cáo có các cột đó */
const TIME_DEFAULT: Record<string, string[]> = {
  harvest: ['net', 'loss'], stock: ['receipt', 'issue'], purchases: ['total', 'owed'], customers: ['amount', 'owed'],
};

/** Cột số đo vẽ được: cột số, bỏ cột nhãn; nếu báo cáo có đánh dấu cột cộng được thì chỉ lấy các cột đó (bỏ tỉ lệ, đơn giá) */
function measureCols(r: Input): Col[] {
  const cols = (r.columns as Col[]).filter((c) => c.key !== 'label' && c.kind !== 'text');
  const additive = cols.filter((c) => c.sum);
  return additive.length > 0 ? additive : cols;
}

const kindOf = (c: Col): ValueKind => (c.kind === 'money' || MONEY_KEYS.has(c.key) ? 'money' : c.kind === 'int' ? 'int' : 'num');
const toneOf = (key: string, type: string): Tone => {
  if (BAD_KEYS.has(key)) return 'bad';
  if (OK_KEYS.has(key)) return 'ok';
  if (WARN_KEYS.has(key)) return 'warn';
  if (key === 'amount') return type === 'expenses' || type === 'purchases' ? 'bad' : type === 'sales' || type === 'customers' ? 'ok' : 'info';
  return 'info';
};
const seriesOf = (c: Col, type: string): SeriesSpec => ({ key: c.key, label: c.label, tone: toneOf(c.key, type), kind: kindOf(c) });

/** Các cách vẽ người xem chọn được; phần tử đầu là mặc định. Rỗng nghĩa là không có số đo nào để vẽ. */
export function chartOptions(r: Input): ChartOption[] {
  const ms = measureCols(r);
  if (ms.length === 0) return [];
  const has = (k: string) => ms.some((c) => c.key === k);
  const out: ChartOption[] = [];
  if (has('cost') && has('revenue')) out.push({ key: COMPARE_KEY, label: 'Chi phí và doanh thu' });
  const first = PREFER.map((k) => ms.find((c) => c.key === k)).find(Boolean) ?? ms[0]!;
  const ordered = [first, ...ms.filter((c) => c.key !== first.key)];
  for (const c of ordered) out.push({ key: c.key, label: c.label });
  return out;
}

function isTime(r: Input): boolean {
  if (r.group === 'month' || r.group === 'day') return true;
  const rows = r.rows as Row[];
  return rows.length > 0 && rows.every((x) => /^\d{4}-\d{2}(-\d{2})?$/.test(String(x.label ?? '')));
}

export function buildChartSpec(r: Input, measureKey?: string): ChartSpec | null {
  const rows = r.rows as Row[];
  if (rows.length === 0) return null;
  const ms = measureCols(r);
  const opts = chartOptions(r);
  if (ms.length === 0 || opts.length === 0) return null;
  const key = measureKey && opts.some((o) => o.key === measureKey) ? measureKey : opts[0]!.key;
  const labelOf = (x: Row) => String(x.label ?? '—');

  // So sánh chi phí và doanh thu (tổng hợp theo vụ, theo ô, theo phân khu)
  if (key === COMPARE_KEY) {
    const top = [...rows].sort((a, b) => n(b.cost) - n(a.cost)).slice(0, TOP);
    return {
      kind: 'bars', title: 'Chi phí và doanh thu',
      labels: top.map(labelOf), shortLabels: top.map((x) => clip(labelOf(x), 9)),
      series: [{ key: 'cost', label: 'Tổng chi phí', tone: 'bad', kind: 'money' }, { key: 'revenue', label: 'Doanh thu đã ghi', tone: 'ok', kind: 'money' }],
      values: [top.map((x) => n(x.cost)), top.map((x) => n(x.revenue))],
    };
  }

  const col = ms.find((c) => c.key === key)!;
  const kind = kindOf(col);
  const unit = kind === 'money' ? 'đ' : UNIT_BY_KEY[col.key] ?? '';

  // Theo thời gian: cột theo tháng/ngày. Mặc định các cột cùng loại số đo (ví dụ nhập và xuất); người xem chọn riêng một số đo thì vẽ riêng nó.
  if (isTime(r)) {
    const curated = (TIME_DEFAULT[r.type] ?? []).map((k) => ms.find((c) => c.key === k)).filter((c): c is Col => !!c);
    const together = key !== opts[0]!.key ? [col]
      : curated.length > 0 ? curated
      : ms.filter((c) => kindOf(c) === kind && c.key !== 'count' && c.key !== 'cycles').slice(0, 3);
    const series = (together.length > 0 ? together : [col]).map((c) => seriesOf(c, r.type));
    const labels = rows.map(labelOf);
    return {
      kind: 'bars', title: `${series.length === 1 ? series[0]!.label : col.label} theo ${r.group === 'day' ? 'ngày' : 'tháng'}`,
      labels, shortLabels: labels.map((l) => (r.group === 'day' || l.length > 7 ? dayShort(l) : monthShort(l))),
      series, values: series.map((s) => rows.map((x) => n(x[s.key]))),
    };
  }

  const all = rows.map((x) => ({ label: labelOf(x), value: n(x[col.key]) })).filter((x) => x.value !== 0);
  if (all.length === 0) return null;
  const tone = toneOf(col.key, r.type);
  const positive = all.every((x) => x.value > 0);
  // Cơ cấu chi phí theo nhóm/loại khoản: vòng (tối đa 6 phần)
  if (r.type === 'expenses' && positive && col.key === 'amount' && (r.group === 'category' || r.group === 'kind' || r.group === 'default') && all.length <= 8) {
    return { kind: 'donut', title: `Cơ cấu ${col.label.toLowerCase()}`, valueKind: kind, unit, items: groupOthers(all, 6) };
  }
  // Còn lại: Top N thanh ngang theo độ lớn; giá trị âm (lỗ…) vẽ đỏ kèm chữ "âm"
  const top = [...all].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, TOP);
  const items: ChartItem[] = top.map((x) => (x.value < 0 ? { label: x.label, value: Math.abs(x.value), tone: 'bad', note: 'âm' } : x));
  return { kind: 'hbars', title: `${col.label}: ${top.length < all.length ? `${top.length} mục lớn nhất` : 'theo từng mục'}`, valueKind: kind, unit, tone, items };
}
