/**
 * Mốc nhắc việc an toàn (P4 gọn, D100), phần thuần. Ngày đến hạn được TÍNH từ ngày của vụ, không lưu:
 * 'end' = N ngày trước ngày thu/xuất dự kiến, 'start' = N ngày sau ngày bắt đầu. Đổi ngày của vụ thì mốc tự dời.
 */
export interface MilestoneLite { anchor: 'start' | 'end' | string; offset_days: number; done_at?: string | null }
export interface CycleDates { start_date: string | null; expected_end_date?: string | null }

const DAY = 86400000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Ngày đến hạn (yyyy-mm-dd), hoặc null nếu vụ chưa có ngày làm điểm neo */
export function milestoneDue(m: MilestoneLite, c: CycleDates): string | null {
  const base = m.anchor === 'end' ? c.expected_end_date : c.start_date;
  if (!base) return null;
  return toIso(toMs(base) + (m.anchor === 'end' ? -m.offset_days : m.offset_days) * DAY);
}

export type MilestoneStatus = 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'nodate';

/** Trạng thái so với hôm nay; 'soon' = trong vòng `soonDays` ngày tới */
export function milestoneStatus(m: MilestoneLite, c: CycleDates, today: string, soonDays = 3): MilestoneStatus {
  if (m.done_at) return 'done';
  const due = milestoneDue(m, c);
  if (!due) return 'nodate';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return toMs(due) - toMs(today) <= soonDays * DAY ? 'soon' : 'later';
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  done: 'Đã làm', overdue: 'Quá hạn', today: 'Hôm nay', soon: 'Sắp đến', later: 'Chưa đến', nodate: 'Chưa có ngày',
};

export function milestoneWhen(m: MilestoneLite): string {
  return m.anchor === 'end' ? (m.offset_days === 0 ? 'đúng ngày thu / xuất dự kiến' : `${m.offset_days} ngày trước ngày thu / xuất dự kiến`)
    : m.offset_days === 0 ? 'đúng ngày bắt đầu' : `ngày thứ ${m.offset_days + 1} kể từ khi bắt đầu (sau ${m.offset_days} ngày)`;
}

/**
 * Trống chuồng (P4 gọn): vụ mới bắt đầu ngày `startDate` ở khu `areaId` mà vụ trước ở khu đó mới kết thúc cách chưa đủ `minDays` ngày,
 * hoặc khu vẫn còn vụ đang chạy. Trả về câu cảnh báo hoặc null. Ngày kết thúc của vụ đã xong = ngày hoàn thành giai đoạn cuối nếu có, nếu không thì ngày kết thúc dự kiến.
 */
export function restWarning(
  areaId: string, startDate: string, minDays: number,
  cycles: { id: string; area_id: string; status: string; expected_end_date?: string | null }[],
  lastActualEnd: (cycleId: string) => string | null,
): string | null {
  const same = cycles.filter((c) => c.area_id === areaId);
  if (same.some((c) => c.status === 'active' || c.status === 'paused')) return 'Khu này đang có vụ chạy. Nên đợi vụ đó xong và để trống chuồng trước khi nhập lứa mới.';
  let latest: string | null = null;
  for (const c of same.filter((x) => x.status === 'ended')) {
    const end = lastActualEnd(c.id) ?? c.expected_end_date ?? null;
    if (end && (!latest || end > latest)) latest = end;
  }
  if (!latest) return null;
  const gap = Math.round((toMs(startDate) - toMs(latest)) / DAY);
  return gap < minDays ? `Vụ trước ở khu này kết thúc ngày ${latest.split('-').reverse().join('/')}, mới cách ${Math.max(gap, 0)} ngày. Nên để trống chuồng tối thiểu ${minDays} ngày để vệ sinh, sát trùng.` : null;
}
