import { personState, type PayItem, type PayRow } from './payBookLogic';

/**
 * Phần thuần của giao diện Bảng lương mới (D207): trạng thái từng người, lọc và sắp xếp bảng tổng hợp, phép tính Thu nhập − Khấu trừ của phiếu lương,
 * so với kỳ trước, lịch công theo ngày. Có test.
 */
export type RowStatus = 'attention' | 'locked' | 'open' | 'none';
/** attention = cần xử lý (thiếu cách trả công, công chờ xác nhận, đang trong ca); locked = đã chốt; open = chưa chốt; none = chưa có số liệu */
export function rowStatus(r: PayRow): RowStatus {
  const st = personState(r);
  if (st.needs) return 'attention';
  if (st.label === 'Đã chốt') return 'locked';
  if (st.label === 'Chưa có số liệu') return 'none';
  return 'open';
}

export type RowFilter = 'all' | 'todo' | 'open' | 'locked';
export function filterRows(rows: PayRow[], f: RowFilter): PayRow[] {
  if (f === 'all') return rows;
  return rows.filter((r) => { const s = rowStatus(r); return f === 'todo' ? s === 'attention' : f === 'locked' ? s === 'locked' : s === 'open' || s === 'attention'; });
}
export function filterCounts(rows: PayRow[]): Record<RowFilter, number> {
  return { all: rows.length, todo: filterRows(rows, 'todo').length, open: filterRows(rows, 'open').length, locked: filterRows(rows, 'locked').length };
}

export type SortKey = 'name' | 'net_desc' | 'net_asc' | 'hours_desc' | 'todo_first';
export const SORT_LABEL: Record<SortKey, string> = {
  name: 'Tên A–Z', net_desc: 'Thực nhận cao trước', net_asc: 'Thực nhận thấp trước', hours_desc: 'Giờ công nhiều trước', todo_first: 'Cần xử lý trước',
};
export function sortRows(rows: PayRow[], key: SortKey): PayRow[] {
  const byName = (a: PayRow, b: PayRow) => a.name.localeCompare(b.name, 'vi');
  const out = [...rows];
  switch (key) {
    case 'net_desc': return out.sort((a, b) => b.net - a.net || byName(a, b));
    case 'net_asc': return out.sort((a, b) => a.net - b.net || byName(a, b));
    case 'hours_desc': return out.sort((a, b) => b.hours - a.hours || byName(a, b));
    case 'todo_first': return out.sort((a, b) => Number(rowStatus(b) === 'attention') - Number(rowStatus(a) === 'attention') || byName(a, b));
    default: return out.sort(byName);
  }
}

/** Phiếu lương: THU NHẬP (công giờ + lương cố định + khoán + thưởng) − KHẤU TRỪ (phạt + tạm ứng) = THỰC NHẬN. `gap` ≠ 0 nghĩa là số thực nhận của máy chủ lệch phép tính (hiện cảnh báo). */
export function statement(r: PayRow) {
  const income = r.hourly + r.salary + r.piece + r.bonus;
  const deduct = r.deduction + r.advance;
  return { income, deduct, net: r.net, gap: Math.round(r.net - (income - deduct)) };
}

/** So với kỳ trước: phần trăm đổi (làm tròn), null khi kỳ trước không có số để so */
export function compareWithPrev(net: number, prev: number | null | undefined): { pct: number; tone: 'up' | 'down' | 'same' } | null {
  if (prev === null || prev === undefined || !(prev > 0)) return null;
  const pct = Math.round(((net - prev) / prev) * 100);
  return { pct, tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same' };
}

/** Đơn giá giờ duy nhất trong kỳ (để ghi "168 giờ × 40.000"); 'multi' khi có nhiều mức; null khi không có công giờ */
export function singleRate(items: PayItem[]): number | 'multi' | null {
  const rates = new Set(items.filter((i) => i.kind === 'hours' && i.rate !== null).map((i) => i.rate as number));
  return rates.size === 0 ? null : rates.size === 1 ? [...rates][0]! : 'multi';
}

export type DayState = 'full' | 'part' | 'pending' | 'off' | 'none';
export interface CalCell { date: string | null; day: number; state: DayState; hours: number }
const FULL_HOURS = 6;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Lịch công theo tuần (thứ hai đầu tuần) cho một kỳ: mỗi ngày một ô, tô theo trạng thái: đủ công (≥ 6 giờ), một phần, chờ xác nhận/đang trong ca,
 * nghỉ (ghi nghỉ), hoặc không có gì. Ô trống đầu tuần đầu có date = null. Kỳ dài hơn 62 ngày trả mảng rỗng (không vẽ lịch).
 */
export function calendarCells(from: string, to: string, items: PayItem[], offDates: Iterable<string> = []): CalCell[] {
  const span = Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000) + 1;
  if (span < 1 || span > 62) return [];
  const worked = new Map<string, number>();
  const pend = new Set<string>();
  for (const i of items) {
    if (i.kind === 'hours') worked.set(i.date, (worked.get(i.date) ?? 0) + i.minutes / 60);
    else if (i.kind === 'pending' || i.kind === 'open') pend.add(i.date);
  }
  const off = new Set(offDates);
  const cells: CalCell[] = [];
  const lead = (utc(from).getUTCDay() + 6) % 7;      // 0 = thứ hai
  for (let k = 0; k < lead; k++) cells.push({ date: null, day: 0, state: 'none', hours: 0 });
  for (let n = 0; n < span; n++) {
    const d = new Date(utc(from).getTime() + n * 86400000);
    const date = d.toISOString().slice(0, 10);
    const h = Math.round((worked.get(date) ?? 0) * 100) / 100;
    const state: DayState = pend.has(date) ? 'pending' : h >= FULL_HOURS ? 'full' : h > 0 ? 'part' : off.has(date) ? 'off' : 'none';
    cells.push({ date, day: d.getUTCDate(), state, hours: h });
  }
  return cells;
}
