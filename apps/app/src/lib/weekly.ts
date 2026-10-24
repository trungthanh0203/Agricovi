/**
 * Báo cáo tuần (G2-7, D80): kiểu dữ liệu từ hàm máy chủ `get_weekly_report`, so sánh với tuần trước, và tóm tắt dạng chữ để chia sẻ (Zalo…).
 * Máy chủ tính khi mở và kiểm quyền từng chỉ số. File này chỉ gồm kiểu và phần tính thuần (không import gì) để kiểm thử được; phần gọi máy chủ ở `weeklyApi.ts`.
 */

export interface WeekMetrics {
  logs: number;
  /** null = người xem không có quyền xem mục đó */
  harvest_kg: number | null;
  revenue: number | null;
  cost: number | null;
  labor_hours: number | null;
  collected: number | null;
  paid_out: number | null;
  web_orders: number | null;
  web_quotes: number | null;
}

export interface WeekDay { date: string; logs: number; cost: number | null; revenue: number | null; harvest_kg: number | null }

export interface Attention {
  overdue_payables: { count: number; amount: number } | null;
  overdue_receivables: { count: number; amount: number } | null;
  low_stock: number | null;
  late_cycles: number;
  /** Sự cố đang mở và việc khắc phục quá hạn (D95) */
  open_incidents: number;
  overdue_actions: number;
  pending_attendance: number;
  web_orders_waiting: number | null;
}

export interface WeeklyReport {
  week_start: string;
  week_end: string;
  is_current_week: boolean;
  cur: WeekMetrics;
  prev: WeekMetrics;
  daily: WeekDay[];
  attention: Attention;
  generated_at: string;
}

// ---------------------------------------------------------------- phần thuần (kiểm thử được)

/** Cộng n ngày vào ngày dạng YYYY-MM-DD (không phụ thuộc múi giờ) */
export const addDaysIso = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** "20/10 – 26/10/2026" */
export function weekLabel(start: string, end: string): string {
  const f = (s: string) => s.split('-').reverse();
  const [sd, sm] = f(start);
  const [ed, em, ey] = f(end);
  return `${sd}/${sm} – ${ed}/${em}/${ey}`;
}

export type DeltaDir = 'up' | 'down' | 'flat' | 'new';
export interface Delta { dir: DeltaDir; pct: number | null }

/** So với tuần trước: tăng/giảm/không đổi; tuần trước bằng 0 mà tuần này có số thì là "mới" (không có phần trăm) */
export function delta(cur: number, prev: number): Delta {
  if (cur === prev) return { dir: 'flat', pct: 0 };
  if (prev === 0) return { dir: cur > 0 ? 'new' : 'flat', pct: null };
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return { dir: cur > prev ? 'up' : 'down', pct: Math.abs(pct) };
}

export type MetricKey = keyof WeekMetrics;
/** Tăng là tốt (xanh) hay xấu (đỏ) hay chỉ để biết (xám) theo từng chỉ số */
const GOOD_WHEN_UP: Record<MetricKey, 'good' | 'bad' | 'neutral'> = {
  logs: 'good', harvest_kg: 'good', revenue: 'good', cost: 'bad', labor_hours: 'neutral', collected: 'good', paid_out: 'neutral', web_orders: 'good', web_quotes: 'good',
};
export function deltaTone(key: MetricKey, d: Delta): 'ok' | 'bad' | 'neutral' {
  if (d.dir === 'flat') return 'neutral';
  const rule = GOOD_WHEN_UP[key];
  if (rule === 'neutral') return 'neutral';
  const up = d.dir === 'up' || d.dir === 'new';
  return (up && rule === 'good') || (!up && rule === 'bad') ? 'ok' : 'bad';
}

/** "▲ 20% so với tuần trước (30)" / "▼ 5% …" / "Bằng tuần trước" / "Tuần trước chưa có" */
export function deltaText(d: Delta, prevText: string): string {
  if (d.dir === 'flat') return 'Bằng tuần trước';
  if (d.dir === 'new') return 'Tuần trước chưa có';
  return `${d.dir === 'up' ? '▲' : '▼'} ${d.pct}% so với tuần trước (${prevText})`;
}

const vn = (n: number, digits = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits });
const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

/** Tóm tắt dạng chữ để gửi qua Zalo/tin nhắn. Chỉ gồm các chỉ số người xem có quyền xem. */
export function buildWeeklyText(r: WeeklyReport, orgName: string): string {
  const L: string[] = [];
  L.push(`BÁO CÁO TUẦN ${weekLabel(r.week_start, r.week_end)} · ${orgName}`);
  const line = (label: string, cur: number | null, prev: number | null, fmt: (n: number) => string) => {
    if (cur === null || prev === null) return;
    const d = delta(cur, prev);
    L.push(`• ${label}: ${fmt(cur)}${d.dir === 'flat' ? ' (bằng tuần trước)' : d.dir === 'new' ? ' (tuần trước chưa có)' : ` (${d.dir === 'up' ? 'tăng' : 'giảm'} ${d.pct}% so với tuần trước)`}`);
  };
  line('Việc đã ghi', r.cur.logs, r.prev.logs, (n) => String(n));
  line('Thu hoạch (sau hao hụt)', r.cur.harvest_kg, r.prev.harvest_kg, (n) => `${vn(n)} kg`);
  line('Doanh thu', r.cur.revenue, r.prev.revenue, money);
  line('Chi phí', r.cur.cost, r.prev.cost, money);
  line('Giờ công đã xác nhận', r.cur.labor_hours, r.prev.labor_hours, (n) => `${vn(n)} giờ`);
  line('Đã thu nợ', r.cur.collected, r.prev.collected, money);
  line('Đã trả nợ', r.cur.paid_out, r.prev.paid_out, money);
  line('Đơn đặt hàng từ website', r.cur.web_orders, r.prev.web_orders, (n) => String(n));
  const a = r.attention;
  const todo: string[] = [];
  if (a.overdue_payables && a.overdue_payables.count > 0) todo.push(`${a.overdue_payables.count} hóa đơn mua quá hạn (${money(a.overdue_payables.amount)})`);
  if (a.overdue_receivables && a.overdue_receivables.count > 0) todo.push(`${a.overdue_receivables.count} khoản phải thu quá hạn (${money(a.overdue_receivables.amount)})`);
  if (a.low_stock) todo.push(`${a.low_stock} vật tư sắp hết`);
  if (a.late_cycles > 0) todo.push(`${a.late_cycles} vụ trễ tiến độ`);
  if (a.open_incidents > 0) todo.push(`${a.open_incidents} sự cố đang mở${a.overdue_actions > 0 ? `, ${a.overdue_actions} việc khắc phục quá hạn` : ''}`);
  if (a.pending_attendance > 0) todo.push(`${a.pending_attendance} ca công chờ xác nhận`);
  if (a.web_orders_waiting) todo.push(`${a.web_orders_waiting} đơn website chờ báo giá`);
  if (todo.length > 0) { L.push('Cần chú ý:'); for (const t of todo) L.push(`  - ${t}`); }
  L.push('(Chi phí không gồm tiền mua vật tư vì đã tính khi dùng.)');
  return L.join('\n');
}

/** Có điểm cần chú ý nào không (để hiện chấm ở Trang chủ) */
export function attentionCount(a: Attention): number {
  return (a.overdue_payables?.count ? 1 : 0) + (a.overdue_receivables?.count ? 1 : 0) + (a.low_stock ? 1 : 0) + (a.late_cycles > 0 ? 1 : 0) + (a.open_incidents > 0 ? 1 : 0)
    + (a.pending_attendance > 0 ? 1 : 0) + (a.web_orders_waiting ? 1 : 0);
}
