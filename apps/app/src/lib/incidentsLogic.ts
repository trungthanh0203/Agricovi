import type { IncidentActionRow, IncidentRow } from './db';

/** Phần thuần của Sự cố và xử lý (D95): nhãn tiếng Việt và cách đếm/sắp xếp. Không import gì ngoài kiểu để kiểm thử được. */

export const INCIDENT_KINDS: { id: IncidentRow['kind']; label: string }[] = [
  { id: 'pest', label: 'Sâu bệnh' },
  { id: 'loss', label: 'Hao hụt, hư hỏng' },
  { id: 'weather', label: 'Thời tiết bất thường' },
  { id: 'complaint', label: 'Khách phản ánh' },
  { id: 'other', label: 'Khác' },
];

export const INCIDENT_SEVERITIES: { id: IncidentRow['severity']; label: string }[] = [
  { id: 'low', label: 'Nhẹ' },
  { id: 'medium', label: 'Vừa' },
  { id: 'high', label: 'Nặng' },
];

export const kindLabel = (k: string) => INCIDENT_KINDS.find((x) => x.id === k)?.label ?? 'Khác';
export const severityLabel = (s: string) => INCIDENT_SEVERITIES.find((x) => x.id === s)?.label ?? s;

/** Sự cố còn hiệu lực (chưa hủy) */
export const liveIncidents = (list: IncidentRow[]) => list.filter((i) => !i.voided_at);

/** Mới nhất lên trước; sự cố đang mở xếp trước sự cố đã đóng */
export function sortIncidents(list: IncidentRow[]): IncidentRow[] {
  return [...list].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || b.incident_date.localeCompare(a.incident_date));
}

export const openCount = (list: IncidentRow[]) => liveIncidents(list).filter((i) => i.status === 'open').length;

/** Việc khắc phục quá hạn (chưa xong, có hạn, hạn đã qua) của các sự cố đang mở */
export function overdueActions(actions: IncidentActionRow[], incidents: IncidentRow[], today: string): IncidentActionRow[] {
  const open = new Set(liveIncidents(incidents).filter((i) => i.status === 'open').map((i) => i.id));
  return actions.filter((a) => !a.done && a.due_date && a.due_date < today && open.has(a.incident_id));
}

/** Việc khắc phục chưa xong của sự cố đang mở mà hạn trong `days` ngày tới hoặc đã qua; dùng cho nhắc việc ở Trang chủ */
export function dueActions(actions: IncidentActionRow[], incidents: IncidentRow[], limitIso: string): IncidentActionRow[] {
  const open = new Set(liveIncidents(incidents).filter((i) => i.status === 'open').map((i) => i.id));
  return actions.filter((a) => !a.done && a.due_date && a.due_date <= limitIso && open.has(a.incident_id))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
}

/** Tóm tắt thiệt hại ước tính của danh sách sự cố (null khi chưa ai ghi) */
export function lossTotals(list: IncidentRow[]): { amount: number | null } {
  const v = liveIncidents(list).map((i) => i.loss_amount).filter((x): x is number => x !== null);
  return { amount: v.length ? v.reduce((s, x) => s + x, 0) : null };
}
