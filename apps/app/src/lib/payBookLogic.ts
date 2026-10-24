import { addMonths, fmtIso, parseDay } from './dates';

/**
 * Bảng lương (D87), phần thuần (kiểu, kỳ xem, nhóm theo tổ, CSV; không import máy chủ để kiểm thử được). Số liệu tính ở máy chủ (get_pay_overview, get_pay_detail). Người thường chỉ xem của mình; chủ và người có quyền Tiền công
 * xem một người / tất cả / theo tổ. Đây là phần tính thuần (kỳ xem, nhóm theo tổ, CSV) và phần gọi máy chủ.
 */

export interface PayRow {
  worker_id: string; name: string; user_id: string | null; status: string; team_id: string | null; team_name: string | null;
  hours: number; pending_hours: number; days: number; hourly: number; salary: number; bonus: number; deduction: number; advance: number;
  net: number; net_locked: number; no_rate_days: number;
  /** số khoản theo trạng thái (đã chốt / đã tính / ước tính / đang trong ca) */
  n_locked: number; n_calculated: number; n_estimate: number; n_open: number;
}
export interface PayOverview { from: string; to: string; generated_at: string; can_see_all: boolean; workers: PayRow[] }

export type PayStatus = 'locked' | 'calculated' | 'estimate' | 'no_rate' | 'pending' | 'open' | 'rejected';
export interface PayItem {
  kind: 'hours' | 'pending' | 'open' | 'rejected' | 'salary' | 'bonus' | 'deduction' | 'advance';
  date: string; id: string | null; minutes: number; amount: number; rate: number | null; status: PayStatus; label: string | null;
  started_at: string | null; ended_at: string | null; break_minutes: number | null;
}
export interface PayDetail { worker_id: string; from: string; to: string; generated_at: string; items: PayItem[] }

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  locked: 'Đã chốt', calculated: 'Đã tính', estimate: 'Ước tính', no_rate: 'Chưa có cách trả công', pending: 'Chờ xác nhận', open: 'Đang trong ca', rejected: 'Bị từ chối',
};

// ---------------------------------------------------------------- kỳ xem (phần thuần)
export type RangeMode = 'month' | 'quarter' | 'year' | 'recent';

const lastDay = (y: number, m0: number) => fmtIso(new Date(y, m0 + 1, 0));
const first = (y: number, m0: number) => fmtIso(new Date(y, m0, 1));

/** Khoảng ngày của một kỳ xem quanh ngày `anchor`: tháng, quý, năm, hoặc 24 tháng gần nhất (tính tới tháng của anchor) */
export function rangeOf(mode: RangeMode, anchor: string): { from: string; to: string; label: string } {
  const d = parseDay(anchor);
  const y = d.getFullYear(), m = d.getMonth();
  if (mode === 'month') return { from: first(y, m), to: lastDay(y, m), label: `Tháng ${m + 1}/${y}` };
  if (mode === 'quarter') { const q = Math.floor(m / 3); return { from: first(y, q * 3), to: lastDay(y, q * 3 + 2), label: `Quý ${q + 1}/${y}` }; }
  if (mode === 'year') return { from: first(y, 0), to: lastDay(y, 11), label: `Năm ${y}` };
  const start = parseDay(addMonths(first(y, m), -23));
  return { from: fmtIso(start), to: lastDay(y, m), label: `24 tháng tới ${m + 1}/${y}` };
}

/** Lùi/tiến một kỳ xem (n = -1 hoặc 1) */
export function shiftAnchor(mode: RangeMode, anchor: string, n: number): string {
  const d = parseDay(anchor);
  const base = first(d.getFullYear(), d.getMonth());
  return addMonths(base, mode === 'month' ? n : mode === 'quarter' ? 3 * n : mode === 'year' ? 12 * n : n);
}

/** Gom theo tổ (người chưa có tổ vào "Chưa có tổ"), kèm tổng từng tổ; tổ xếp theo tên, "Chưa có tổ" cuối */
export function groupByTeam(rows: PayRow[]): { team: string; rows: PayRow[]; total: PayRow }[] {
  const by = new Map<string, PayRow[]>();
  for (const r of rows) { const k = r.team_name ?? 'Chưa có tổ'; by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by.entries()]
    .sort(([a], [b]) => (a === 'Chưa có tổ' ? 1 : b === 'Chưa có tổ' ? -1 : a.localeCompare(b, 'vi')))
    .map(([team, rs]) => ({ team, rows: rs, total: sumRows(rs, team) }));
}

export function sumRows(rs: PayRow[], name = 'Tổng'): PayRow {
  const s = (k: keyof PayRow) => rs.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return {
    worker_id: '', name, user_id: null, status: 'active', team_id: null, team_name: null,
    hours: Math.round(s('hours') * 100) / 100, pending_hours: Math.round(s('pending_hours') * 100) / 100, days: s('days'), hourly: s('hourly'), salary: s('salary'),
    bonus: s('bonus'), deduction: s('deduction'), advance: s('advance'), net: s('net'), net_locked: s('net_locked'), no_rate_days: s('no_rate_days'),
    n_locked: s('n_locked'), n_calculated: s('n_calculated'), n_estimate: s('n_estimate'), n_open: s('n_open'),
  };
}

export const hoursText = (h: number) => `${h.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ`;

/** Bảng CSV cho danh sách (tất cả / theo tổ) */
export function buildPayBookCsv(rows: PayRow[], range: { from: string; to: string }): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Người', 'Tổ', 'Giờ công', 'Số ngày công', 'Tiền công theo giờ', 'Lương cố định', 'Thưởng', 'Phạt', 'Tạm ứng', 'Thực nhận', 'Trong đó đã chốt'];
  const lines = [`${q('Bảng lương')},${q(`${range.from} đến ${range.to}`)}`, head.map(q).join(',')];
  for (const r of [...rows, sumRows(rows)]) {
    lines.push([r.name, r.team_name ?? '', r.hours, r.days, r.hourly, r.salary, r.bonus, r.deduction, r.advance, r.net, r.net_locked].map((v) => (typeof v === 'number' ? v : q(v))).join(','));
  }
  return '﻿' + lines.join('\n');
}

/** Trạng thái của một người trong tháng và những việc cần xử lý (chấm trạng thái ở danh sách, bộ lọc "Cần xử lý") */
export function personState(r: PayRow): { label: string; cls: 'ok' | 'warn' | 'plain'; needs: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.no_rate_days > 0) reasons.push('thiếu cách trả công');
  if (r.pending_hours > 0) reasons.push(`chờ xác nhận ${hoursText(r.pending_hours)}`);
  if (r.n_open > 0) reasons.push('đang trong ca');
  const label = r.n_estimate > 0 ? 'Chưa tính' : r.n_calculated > 0 ? 'Đã tính' : r.n_locked > 0 ? 'Đã chốt' : 'Chưa có số liệu';
  const cls = label === 'Đã chốt' ? 'ok' : label === 'Chưa có số liệu' ? 'plain' : 'warn';
  return { label, cls, needs: reasons.length > 0, reasons };
}

/** Phiếu lương một người dạng chữ để gửi qua Zalo/tin nhắn (không kèm từng ngày công; có các khoản và lý do) */
export function buildPayslipText(r: PayRow, items: PayItem[], rangeLabel: string, orgName: string): string {
  const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
  const L: string[] = [`PHIẾU LƯƠNG ${rangeLabel.toUpperCase()} · ${orgName}`, `Người: ${r.name}${r.team_name ? ` (${r.team_name})` : ''}`];
  L.push(`• Giờ công: ${hoursText(r.hours)} (${r.days} ngày)`);
  if (r.hourly) L.push(`• Tiền công theo giờ: ${money(r.hourly)}`);
  if (r.salary) L.push(`• Lương cố định: ${money(r.salary)}`);
  const adj = items.filter((i) => i.kind === 'bonus' || i.kind === 'deduction' || i.kind === 'advance');
  for (const a of adj) L.push(`• ${a.kind === 'bonus' ? 'Thưởng' : a.kind === 'deduction' ? 'Phạt/khấu trừ' : 'Tạm ứng'}: ${a.amount < 0 ? '−' : '+'}${money(Math.abs(a.amount))}${a.label ? ` (${a.label})` : ''}`);
  L.push(`THỰC NHẬN: ${money(r.net)}`);
  const open = r.net - r.net_locked;
  L.push(open > 0.5 ? `(Đã chốt ${money(r.net_locked)}; phần còn lại là dự tính, có thể đổi tới khi chủ khóa kỳ lương.)` : '(Số liệu đã chốt.)');
  return L.join('\n');
}
