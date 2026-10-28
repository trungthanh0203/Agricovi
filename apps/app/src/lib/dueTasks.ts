import type { StageRow } from './db';

/** Số ngày từ ngày a đến ngày b (YYYY-MM-DD), theo lịch (không lệch giờ) */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export interface DueTask { stage: StageRow; doneToday: boolean }

/**
 * Việc ĐẾN HẠN HÔM NAY của một vụ: việc chưa xong có khoảng thực hiện bao trùm hôm nay.
 * Việc có "lặp lại mỗi N ngày" chỉ đến hạn đúng các ngày 0, N, 2N… kể từ ngày bắt đầu; không lặp thì đến hạn mọi ngày trong khoảng.
 * `doneToday`: hôm nay đã có nhật ký gắn đúng việc đó (hoặc cùng loại việc của vụ) nên không cần nhắc nữa.
 */
export function dueToday(stages: StageRow[], logsToday: { stage_id?: string | null; work_type_id: string }[], today: string): DueTask[] {
  const out: DueTask[] = [];
  for (const s of [...stages].sort((a, b) => a.seq - b.seq)) {
    if (s.status === 'done' || !s.planned_start || !s.planned_end) continue;
    if (today < s.planned_start || today > s.planned_end) continue;
    if (s.repeat_every_days && daysBetween(s.planned_start, today) % s.repeat_every_days !== 0) continue;
    const doneToday = logsToday.some((l) => l.stage_id === s.id || (!l.stage_id && l.work_type_id === s.work_type_id));
    out.push({ stage: s, doneToday });
  }
  return out;
}
