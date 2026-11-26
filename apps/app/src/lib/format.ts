/**
 * Ngôn ngữ đang dùng và cách đọc / viết số, tiền, ngày theo ngôn ngữ đó. Phần thuần (không dùng thư viện dịch) để test chạy được bằng Node.
 * Tiếng Việt giữ đúng hành vi cũ.
 */
export type Lang = 'vi' | 'en';
export const LANG_KEY = 'agriconnect.lang';

export function getLang(): Lang {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; }
}

export const dateLocale = (): string => (getLang() === 'en' ? 'en-GB' : 'vi-VN');
const numberLocale = (): string => (getLang() === 'en' ? 'en-US' : 'vi-VN');

export const fmtNumber = (n: number, maxDigits = 3): string => n.toLocaleString(numberLocale(), { maximumFractionDigits: maxDigits });
export const fmtMoney = (n: number): string => (getLang() === 'en' ? `${n.toLocaleString('en-US')} VND` : `${n.toLocaleString('vi-VN')} đ`);
/** Tiếng Anh viết tên tháng ("26 Nov 2026") để không nhầm ngày với tháng */
export const fmtDay = (d: Date): string =>
  getLang() === 'en' ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : d.toLocaleDateString('vi-VN');
export const fmtLongDay = (d: Date): string =>
  d.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: getLang() === 'en' ? 'short' : '2-digit', year: 'numeric' });
export const fmtTime = (d: Date): string => d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });

/**
 * Đổi chữ người dùng nhập thành chuỗi số dạng máy (dấu chấm thập phân).
 * Tiếng Việt: dấu phẩy là thập phân (như trước). Tiếng Anh: dấu phẩy chỉ được là dấu nhóm nghìn ("1,500" = 1500);
 * dấu phẩy đặt kiểu khác ("1,5", "0,125") trả về "NaN" để báo người nhập, không đoán.
 */
export function normalizeDecimal(raw: string): string {
  const s = raw.trim();
  if (getLang() !== 'en') return s.replace(',', '.');
  if (!s.includes(',')) return s;
  return /^-?[1-9]\d{0,2}(,\d{3})+(\.\d*)?$/.test(s) ? s.replace(/,/g, '') : 'NaN';
}

/** Số điền sẵn vào ô nhập: không có dấu nhóm nghìn, dấu thập phân theo ngôn ngữ */
export const numberToInput = (n: number | string): string => (getLang() === 'en' ? String(n) : String(n).replace('.', ','));
