/**
 * Số đo nhập tay của vụ (mục 6 báo cáo đối thủ), phần thuần: danh sách chỉ số, so với ngưỡng, số đo mới nhất.
 * Ngưỡng mặc định TRỐNG: chưa đặt ngưỡng thì không cảnh báo (chờ chuyên gia duyệt, chủ cơ sở tự đặt).
 */
export interface MetricDef { key: string; label: string; unit: string; decimals: number; /** loại hình nào thường dùng */ kinds: string[]; custom?: boolean }

/** Chỉ số chuẩn; khóa trùng với migration 0195 */
export const STANDARD_METRICS: MetricDef[] = [
  { key: 'ph', label: 'pH', unit: '', decimals: 2, kinds: ['aquatic', 'crop'] },
  { key: 'do', label: 'Oxy hòa tan (DO)', unit: 'mg/l', decimals: 1, kinds: ['aquatic'] },
  { key: 'water_temp', label: 'Nhiệt độ nước', unit: '°C', decimals: 1, kinds: ['aquatic', 'crop'] },
  { key: 'salinity', label: 'Độ mặn', unit: '‰', decimals: 1, kinds: ['aquatic'] },
  { key: 'ec', label: 'Độ dẫn điện (EC)', unit: 'mS/cm', decimals: 2, kinds: ['crop'] },
  { key: 'air_temp', label: 'Nhiệt độ không khí', unit: '°C', decimals: 1, kinds: ['crop'] },
  { key: 'humidity', label: 'Độ ẩm không khí', unit: '%', decimals: 0, kinds: ['crop'] },
];

export interface LimitLite { metric: string; label?: string | null; unit?: string | null; min_value: number | null; max_value: number | null; is_active?: boolean }
export interface ReadingLite { id: string; cycle_id?: string; metric: string; value: number; measured_at: string; voided_at?: string | null }

/** Chỉ số tự thêm: khóa bắt đầu bằng x_ */
export const isCustomMetric = (key: string) => key.startsWith('x_');

/** Tạo khóa chỉ số riêng từ tên người dùng gõ (bỏ dấu, chữ thường, gạch dưới) */
export function customKeyFromLabel(label: string): string {
  const s = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `x_${s || 'chi_so'}`.slice(0, 40);
}

/** Danh sách chỉ số cơ sở có thể nhập: chuẩn phù hợp loại hình (hoặc tất cả) + chỉ số riêng còn dùng */
export function metricDefs(limits: LimitLite[], kind?: string): MetricDef[] {
  const std = STANDARD_METRICS.filter((m) => !kind || m.kinds.includes(kind));
  const custom: MetricDef[] = limits
    .filter((l) => isCustomMetric(l.metric) && l.is_active !== false)
    .map((l) => ({ key: l.metric, label: l.label ?? l.metric, unit: l.unit ?? '', decimals: 2, kinds: [], custom: true }));
  return [...std, ...custom];
}

export function metricInfo(key: string, limits: LimitLite[]): MetricDef {
  const std = STANDARD_METRICS.find((m) => m.key === key);
  if (std) return std;
  const l = limits.find((x) => x.metric === key);
  return { key, label: l?.label ?? key, unit: l?.unit ?? '', decimals: 2, kinds: [], custom: true };
}

export type Verdict = 'low' | 'high' | 'ok' | null;

/** So một số đo với ngưỡng: null nếu chưa đặt ngưỡng nào (không cảnh báo) */
export function judge(value: number, limit: LimitLite | undefined): Verdict {
  if (!limit || limit.is_active === false) return null;
  const { min_value: lo, max_value: hi } = limit;
  if (lo === null && hi === null) return null;
  if (lo !== null && value < lo) return 'low';
  if (hi !== null && value > hi) return 'high';
  return 'ok';
}

export function limitText(l: LimitLite | undefined, unit = ''): string {
  if (!l || (l.min_value === null && l.max_value === null)) return 'chưa đặt ngưỡng';
  const u = unit ? ` ${unit}` : '';
  if (l.min_value !== null && l.max_value !== null) return `${l.min_value} – ${l.max_value}${u}`;
  return l.min_value !== null ? `từ ${l.min_value}${u}` : `tối đa ${l.max_value}${u}`;
}

/** Số đo mới nhất (chưa hủy) của từng chỉ số */
export function latestByMetric<T extends ReadingLite>(readings: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of readings) {
    if (r.voided_at) continue;
    const cur = m.get(r.metric);
    if (!cur || r.measured_at > cur.measured_at) m.set(r.metric, r);
  }
  return m;
}

export interface MeasureAlert<T extends ReadingLite = ReadingLite> { reading: T; verdict: 'low' | 'high' }

/** Cảnh báo: chỉ xét số đo MỚI NHẤT của từng chỉ số (số đo cũ đã sửa lại rồi thì không báo nữa) */
export function measureAlerts<T extends ReadingLite>(readings: T[], limits: LimitLite[]): MeasureAlert<T>[] {
  const out: MeasureAlert<T>[] = [];
  for (const r of latestByMetric(readings).values()) {
    const v = judge(r.value, limits.find((l) => l.metric === r.metric));
    if (v === 'low' || v === 'high') out.push({ reading: r, verdict: v });
  }
  return out.sort((a, b) => b.reading.measured_at.localeCompare(a.reading.measured_at));
}

/** Đọc số người dùng gõ (chấp nhận dấu phẩy thập phân); NaN nếu không hợp lệ */
export function parseNumber(s: string): number {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return NaN;
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
