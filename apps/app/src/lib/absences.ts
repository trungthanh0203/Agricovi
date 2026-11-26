import { supabase } from './supabase';
import { t } from '@lingui/core/macro';
import { dateLocale } from './format';

/**
 * Ghi nghỉ việc theo chấm công (D189, migration 0223). Người làm ít dùng app nên chủ/quản lý (tổ trưởng với người trong tổ) ghi hộ.
 * Chỉ ghi nhận, chưa nối vào phiếu lương. Cần mạng (chức năng quản lý, D24).
 */
export type AbsenceKind = 'annual' | 'sick' | 'family' | 'unpaid' | 'no_notice' | 'other';
export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = {
  get annual() { return t`Phép năm`; }, get sick() { return t`Ốm`; }, get family() { return t`Việc gia đình`; }, get unpaid() { return t`Nghỉ không lương`; }, get no_notice() { return t`Nghỉ không báo trước`; }, other: 'Khác',
};
/** Loại nghỉ thường được hưởng lương (chỉ là gợi ý ô "Hưởng lương", chủ đổi được) */
export const ABSENCE_KIND_PAID: Record<AbsenceKind, boolean> = { annual: true, sick: true, family: true, unpaid: false, no_notice: false, other: false };
export type AbsenceNotice = 'before' | 'after' | 'none';
export const ABSENCE_NOTICE_LABEL: Record<AbsenceNotice, string> = { get before() { return t`Có xin phép trước`; }, get after() { return t`Báo sau`; }, get none() { return t`Không báo`; } };
export type AbsenceChannel = 'in_person' | 'phone' | 'zalo' | 'other';
export const ABSENCE_CHANNEL_LABEL: Record<AbsenceChannel, string> = { get in_person() { return t`Trực tiếp`; }, get phone() { return t`Điện thoại`; }, zalo: 'Zalo', get other() { return t`Cách khác`; } };

export interface Absence {
  id: string; organization_id: string; worker_id: string; from_date: string; to_date: string; half_day: boolean; kind: AbsenceKind;
  notice: AbsenceNotice; channel: AbsenceChannel | null; noticed_on: string | null; reason: string | null; paid: boolean; file: string | null;
  note: string | null; status: 'active' | 'cancelled'; version: number;
}
export interface AbsenceInput {
  id: string; from: string; to: string; half: boolean; kind: AbsenceKind; notice: AbsenceNotice; channel: AbsenceChannel | ''; noticedOn: string;
  reason: string; paid: boolean; file: string; note: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(t`Supabase chưa được cấu hình`);
  if (!navigator.onLine) throw new Error(t`OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.`);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const COLS = 'id,organization_id,worker_id,from_date,to_date,half_day,kind,notice,channel,noticed_on,reason,paid,file,note,status,version';
/** Các ghi nghỉ giao với khoảng [from, to] (kể cả đã hủy khi includeCancelled) */
export async function fetchAbsences(orgId: string, from: string, to: string, includeCancelled = false): Promise<Absence[]> {
  if (!supabase || !navigator.onLine) return [];
  let q = supabase.from('worker_absences').select(COLS).eq('organization_id', orgId).lte('from_date', to).gte('to_date', from);
  if (!includeCancelled) q = q.eq('status', 'active');
  const { data, error } = await q.order('from_date', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Absence[];
}

const args = (i: AbsenceInput) => ({
  p_from: i.from, p_to: i.to, p_half: i.half, p_kind: i.kind, p_notice: i.notice, p_channel: i.channel || null, p_noticed_on: i.noticedOn || null,
  p_reason: i.reason, p_paid: i.paid, p_file: i.file || null, p_note: i.note,
});
export const createAbsence = (workerId: string, i: AbsenceInput) => rpc<Absence>('create_worker_absence', { p_id: i.id, p_worker: workerId, ...args(i) });
export const updateAbsence = (version: number, i: AbsenceInput) => rpc<Absence>('update_worker_absence', { p_id: i.id, p_version: version, ...args(i) });
export const cancelAbsence = (id: string, version: number) => rpc<Absence>('cancel_worker_absence', { p_id: id, p_version: version });

/** Ghi nghỉ còn hiệu lực của một người vào một ngày (YYYY-MM-DD), nếu có */
export function absenceOn(list: Absence[], workerId: string, day: string): Absence | undefined {
  return list.find((a) => a.status === 'active' && a.worker_id === workerId && a.from_date <= day && day <= a.to_date);
}

/** Nhãn ngắn: "Nghỉ phép (Ốm)" / "Nghỉ không báo (Nghỉ không báo trước)" */
export function absenceBadge(a: Absence): string {
  const kind = ABSENCE_KIND_LABEL[a.kind];
  const part = a.half_day ? t`, nửa ngày` : '';
  return a.notice === 'none' || a.kind === 'no_notice' ? t`Nghỉ không báo${part}` : t`Nghỉ có phép: ${kind.toLowerCase()}${part}`;
}

/** Số ngày một ghi nghỉ chiếm (nửa ngày = 0,5); dùng cho tóm tắt */
export function absenceDays(a: Pick<Absence, 'from_date' | 'to_date' | 'half_day'>): number {
  if (a.half_day) return 0.5;
  return Math.round((Date.parse(`${a.to_date}T00:00:00Z`) - Date.parse(`${a.from_date}T00:00:00Z`)) / 86400000) + 1;
}

/** Tổng hợp ngày nghỉ theo năm (D190, migration 0224): ngày dương lịch, nửa ngày = 0,5; ghi nghỉ vắt qua năm chỉ tính phần trong năm */
export interface SummaryRow { worker_id: string; month: number; kind: AbsenceKind; days: number }
export interface YearSummary { allowance: number; rows: SummaryRow[] }
export async function fetchYearSummary(orgId: string, year: number, workerId: string | null = null): Promise<YearSummary> {
  const r = await rpc<{ allowance: number; rows: (Omit<SummaryRow, 'days'> & { days: number | string })[] }>('absence_year_summary', { p_org: orgId, p_year: year, p_worker: workerId });
  return { allowance: Number(r.allowance), rows: r.rows.map((x) => ({ ...x, days: Number(x.days) })) };
}
export const setAnnualLeaveDays = (orgId: string, days: number) => rpc<number>('set_annual_leave_days', { p_org: orgId, p_days: days });

export interface WorkerYear { workerId: string; byKind: Record<AbsenceKind, number>; months: number[]; total: number; annualLeft: number }
const zeroKinds = (): Record<AbsenceKind, number> => ({ annual: 0, sick: 0, family: 0, unpaid: 0, no_notice: 0, other: 0 });
/** Gộp theo người: ngày theo loại, theo tháng (12 số), tổng, phép năm còn lại (có thể âm) */
export function aggregateYear(s: YearSummary): WorkerYear[] {
  const by = new Map<string, WorkerYear>();
  for (const r of s.rows) {
    const w = by.get(r.worker_id) ?? { workerId: r.worker_id, byKind: zeroKinds(), months: Array.from({ length: 12 }, () => 0), total: 0, annualLeft: s.allowance };
    w.byKind[r.kind] += r.days;
    w.months[r.month - 1] = (w.months[r.month - 1] ?? 0) + r.days;
    w.total += r.days;
    by.set(r.worker_id, w);
  }
  for (const w of by.values()) w.annualLeft = s.allowance - w.byKind.annual;
  return [...by.values()].sort((a, b) => b.total - a.total);
}
export const fmtDays = (n: number): string => t`${n.toLocaleString(dateLocale(), { maximumFractionDigits: 1 })} ngày`;
