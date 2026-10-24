/**
 * Đơn vị diện tích (D94): dữ liệu lưu theo m²; người dùng nhập/xem bằng m², ha, sào hoặc công (nhớ lựa chọn trên máy).
 * Sào và công khác nhau theo vùng nên ghi rõ số m² trong tên đơn vị.
 */
export interface AreaUnit { id: string; label: string; short: string; m2: number }

export const AREA_UNITS: AreaUnit[] = [
  { id: 'm2', label: 'm²', short: 'm²', m2: 1 },
  { id: 'ha', label: 'ha (10.000 m²)', short: 'ha', m2: 10000 },
  { id: 'sao_bb', label: 'sào Bắc Bộ (360 m²)', short: 'sào', m2: 360 },
  { id: 'sao_tb', label: 'sào Trung Bộ (500 m²)', short: 'sào', m2: 500 },
  { id: 'cong', label: 'công (1.000 m²)', short: 'công', m2: 1000 },
];

const unitOf = (id: string): AreaUnit => AREA_UNITS.find((u) => u.id === id) ?? AREA_UNITS[0]!;

/** Đọc số người dùng gõ: "1.200" là một nghìn hai trăm; "1,5" và "1.5" là một rưỡi; trống hoặc sai thì null */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  const n = /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const toM2 = (value: number, unitId: string): number => value * unitOf(unitId).m2;
export const fromM2 = (m2: number, unitId: string): number => m2 / unitOf(unitId).m2;

/** "500 m²", "1,4 sào" */
export function fmtArea(m2: number, unitId: string): string {
  const u = unitOf(unitId);
  const v = m2 / u.m2;
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: v >= 100 ? 0 : 2 })} ${u.short}`;
}

/** Số kg trên 1.000 m² hoặc trên đơn vị đang chọn (đồng/kg trên đơn vị) từ giá trị trên 1.000 m² */
export const per1000ToUnit = (valuePer1000m2: number, unitId: string): number => valuePer1000m2 * (unitOf(unitId).m2 / 1000);

const KEY = 'agriconnect.areaUnit';
export function getAreaUnit(): string {
  try { const v = localStorage.getItem(KEY); return v && AREA_UNITS.some((u) => u.id === v) ? v : 'm2'; } catch { return 'm2'; }
}
export function setAreaUnit(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* bỏ qua */ }
}
