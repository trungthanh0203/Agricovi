import type { StageRow } from './db';
import { diffDays } from './dates';

/** Nhãn trạng thái giai đoạn của vụ */
export const STAGE_STATUS_LABEL_VI: Record<StageRow['status'], string> = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  done: 'Đã xong',
};

/** Giai đoạn hiện tại: đang làm; nếu không có thì giai đoạn chưa làm đầu tiên; xong hết thì null */
export function currentStage(stages: StageRow[]): StageRow | null {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq);
  return sorted.find((s) => s.status === 'in_progress') ?? sorted.find((s) => s.status === 'pending') ?? null;
}

/** Số ngày trễ so với kế hoạch (0 = đúng hạn). Giai đoạn xong: so ngày xong thực tế; còn lại: so với hôm nay. */
export function stageDelayDays(s: StageRow, today: string): number {
  if (s.status === 'done') return s.actual_end && s.planned_end ? Math.max(0, diffDays(s.planned_end, s.actual_end)) : 0;
  if (s.status === 'in_progress') return s.planned_end ? Math.max(0, diffDays(s.planned_end, today)) : 0;
  return s.planned_start ? Math.max(0, diffDays(s.planned_start, today)) : 0;
}

export interface CycleProgress {
  total: number;
  done: number;
  percent: number;
  current: StageRow | null;
  /** Số ngày trễ của giai đoạn hiện tại */
  delay: number;
}

export function cycleProgress(stages: StageRow[], today: string): CycleProgress {
  const total = stages.length;
  const done = stages.filter((s) => s.status === 'done').length;
  const current = currentStage(stages);
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0, current, delay: current ? stageDelayDays(current, today) : 0 };
}

/** Màu giai đoạn (cùng bảng màu với trình soạn quy trình) */
export const STAGE_COLORS = ['#2e7d32', '#1976d2', '#f9a825', '#8e24aa', '#00838f', '#c62828', '#6d4c41'];
export const stageColor = (index: number) => STAGE_COLORS[index % STAGE_COLORS.length]!;
