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
export function dueToday(stages: StageRow[], logsToday: { stage_id?: string | null; work_type_id: string }[], today: string, logsAny: { stage_id?: string | null }[] = []): DueTask[] {
  const out: DueTask[] = [];
  for (const s of [...stages].sort((a, b) => a.seq - b.seq)) {
    if (s.status === 'done' || !s.planned_start || !s.planned_end) continue;
    if (today < s.planned_start || today > s.planned_end) continue;
    if (s.repeat_every_days && daysBetween(s.planned_start, today) % s.repeat_every_days !== 0) continue;
    // việc lặp: đã ghi hôm nay là xong lượt hôm nay; việc không lặp (kéo dài nhiều ngày): chỉ cần đã có một bản ghi gắn với việc là thôi nhắc
    const doneToday = s.repeat_every_days
      ? logsToday.some((l) => l.stage_id === s.id || (!l.stage_id && l.work_type_id === s.work_type_id))
      : logsAny.some((l) => l.stage_id === s.id) || logsToday.some((l) => l.stage_id === s.id || (!l.stage_id && l.work_type_id === s.work_type_id));
    out.push({ stage: s, doneToday });
  }
  return out;
}

export interface LogLite { stage_id?: string | null; work_type_id: string; performed_at: string; voided_at?: string | null }

/**
 * Số lần phải Ghi việc và số lần đã ghi của một việc trong vụ, để bấm Xong (khớp stage_log_progress của máy chủ, migration 0125).
 * Việc không lặp: 1 lần; việc lặp mỗi N ngày: số ngày đến hạn 0, N, 2N… từ ngày bắt đầu kế hoạch tới `ref` (ngày hoàn thành, tối đa ngày kết thúc kế hoạch).
 * Mỗi ngày chỉ tính một lần. Bản ghi tính cho việc: gắn đúng việc, hoặc cùng loại việc và chưa gắn việc nào, ghi từ ngày bắt đầu việc.
 * Việc Thu hoạch tính thêm các phiếu thu hoạch của vụ. Việc không gắn loại việc (vụ cũ) thì không kiểm (0/0).
 */
export function stageLogProgress(s: StageRow, logs: LogLite[], harvestCount: number, isHarvest: boolean, today: string, localDay: (iso: string) => string): { expected: number; logged: number } {
  if (!s.work_type_id) return { expected: 0, logged: 0 };
  const ref = s.planned_end && s.planned_end < today ? s.planned_end : today;
  let expected = 1;
  if (s.repeat_every_days && s.planned_start && ref >= s.planned_start) expected = Math.floor(daysBetween(s.planned_start, ref) / s.repeat_every_days) + 1;
  const from = s.actual_start ?? s.planned_start ?? '1900-01-01';
  const days = new Set<string>();
  for (const l of logs) {
    if (l.voided_at) continue;
    const d = localDay(l.performed_at);
    if (l.stage_id === s.id || (!l.stage_id && l.work_type_id === s.work_type_id && d >= from)) days.add(d);
  }
  return { expected, logged: days.size + (isHarvest ? harvestCount : 0) };
}
