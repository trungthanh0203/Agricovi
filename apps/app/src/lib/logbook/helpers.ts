import type { LogEntry, LogbookData, Use } from './types';

export const vnDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const vnLocalDay = (iso: string) => vnDate(new Date(new Date(iso).getTime() + 7 * 3600000).toISOString());

export const logDate = (e: LogEntry) => vnLocalDay(e.log.performed_at);
export const logDay = (e: LogEntry) => new Date(new Date(e.log.performed_at).getTime() + 7 * 3600000).toISOString().slice(0, 10);

/** Giá trị trường của form động ở dạng chữ (nhiều lựa chọn nối bằng dấu phẩy; có/không thành Có/Không) */
export function fv(data: Record<string, unknown> | null | undefined, key: string): string {
  const v = data?.[key];
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  return String(v);
}

export const names = (uses: Use[]) => uses.map((u) => u.material?.name ?? 'Vật tư').join('; ');
export const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];
export const qtyText = (uses: Use[]) => uses.map((u) => `${u.quantity.toLocaleString('vi-VN')} ${u.unit}`.trim()).join('; ');
export const lotText = (u: Use) => [u.lotNo, u.expiry ? `HSD ${vnDate(u.expiry)}` : ''].filter(Boolean).join(' / ');
export const maxPhi = (uses: Use[]) => uses.reduce((m, u) => Math.max(m, u.material?.withdrawal_days ?? 0), 0);

/** Việc thuộc sổ nếu tên việc chứa một trong các từ khóa (không phân biệt hoa thường) hoặc mã việc khớp */
export function matchWork(e: LogEntry, keywords: string[], codes: string[] = []): boolean {
  if (!e.wt) return false;
  const n = e.wt.name.toLowerCase();
  return codes.includes(e.wt.code) || keywords.some((k) => n.includes(k.toLowerCase()));
}

export const byDate = <T>(get: (x: T) => string) => (a: T, b: T) => get(a).localeCompare(get(b));

/** Ngày + số ngày (yyyy-mm-dd) */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

export const cycleLabel = (d: LogbookData) => d.cycle ? (d.cycle.code ?? d.cycle.name ?? d.productName) : d.orgName;
