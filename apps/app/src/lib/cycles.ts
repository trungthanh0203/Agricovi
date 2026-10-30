import type { StageRow } from './db';
import { diffDays } from './dates';
import { canLogCycle } from './prep';

/** Nhãn trạng thái công đoạn của vụ */
export const STAGE_STATUS_LABEL_VI: Record<StageRow['status'], string> = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  done: 'Đã xong',
};

/** Công đoạn hiện tại: đang làm; nếu không có thì công đoạn chưa làm đầu tiên; xong hết thì null */
export function currentStage(stages: StageRow[]): StageRow | null {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq);
  return sorted.find((s) => s.status === 'in_progress') ?? sorted.find((s) => s.status === 'pending') ?? null;
}

/** Công đoạn của một ngày: công đoạn chưa xong có kế hoạch bao trùm ngày đó; không có thì công đoạn hiện tại */
export function stageForDay(stages: StageRow[], day: string): StageRow | null {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq);
  return sorted.find((s) => s.status !== 'done' && s.planned_start && s.planned_end && s.planned_start <= day && day <= s.planned_end) ?? currentStage(stages);
}

/** Số ngày trễ so với kế hoạch (0 = đúng hạn). Công đoạn xong: so ngày xong thực tế; còn lại: so với hôm nay. */
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
  /** Số ngày trễ của công đoạn hiện tại */
  delay: number;
}

export function cycleProgress(stages: StageRow[], today: string): CycleProgress {
  const total = stages.length;
  const done = stages.filter((s) => s.status === 'done').length;
  const current = currentStage(stages);
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0, current, delay: current ? stageDelayDays(current, today) : 0 };
}

/** Màu công đoạn (cùng bảng màu với trình soạn quy trình) */
export const STAGE_COLORS = ['#2e7d32', '#1976d2', '#f9a825', '#8e24aa', '#00838f', '#c62828', '#6d4c41'];
export const stageColor = (index: number) => STAGE_COLORS[index % STAGE_COLORS.length]!;

/** Tên hiển thị của vụ: tên vụ do người dùng đặt; chưa đặt thì "Sản phẩm dd/mm" (theo ngày bắt đầu) để phân biệt các vụ cùng sản phẩm */
export function cycleTitle(c: { name?: string | null; start_date?: string | null }, productName: string): string {
  const n = c.name?.trim();
  if (n) return n;
  const d = c.start_date ? c.start_date.slice(0, 10).split('-') : null;
  return d && d.length === 3 ? `${productName || 'Vụ'} ${d[2]}/${d[1]}` : productName || 'Vụ';
}

/**
 * Vụ chọn được trong biểu mẫu GHI MỚI (thu hoạch, chi phí, doanh thu…): chỉ vụ đang sản xuất (và vụ chuẩn bị trước ghi việc được), cho gọn.
 * `showAll` (ô tích "Hiện cả vụ không còn sản xuất") hiện đủ; `keepId` là vụ đang chọn/đang sửa, luôn có mặt.
 */
export function formCycles<T extends { id: string; status: string; prep_mode?: 'whole' | 'part' | 'separate' | null; created_at?: string | null }>(cycles: T[], showAll: boolean, keepId?: string | null): T[] {
  if (showAll) return cycles;
  return cycles.filter((c) => c.id === keepId || canLogCycle(c as unknown as Parameters<typeof canLogCycle>[0]));
}
