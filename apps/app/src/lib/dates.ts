/** Ngày dạng "YYYY-MM-DD" (giờ địa phương, không dính múi giờ) */

export const parseDay = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};

export const fmtIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (s: string, n: number): string => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return fmtIso(d);
};

/** Cộng n tháng; ngày không có ở tháng đích (31 → tháng 30 ngày) lùi về ngày cuối tháng */
export const addMonths = (s: string, n: number): string => {
  const d = parseDay(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmtIso(d);
};

/** Số ngày từ a đến b (b - a) */
export const diffDays = (a: string, b: string): number =>
  Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);

/** "05/11/2026" */
export const fmtDate = (s: string | null | undefined): string => (s ? parseDay(s).toLocaleDateString('vi-VN') : '—');
