import type { CycleRow } from './db';
import { cellWord } from './areas';

/**
 * Công đoạn chuẩn bị của vụ (D126, migration 0137): khi tạo vụ chọn một trong ba cách chuẩn bị THEO NHÀ MÀNG CỦA VỤ:
 * - 'whole': chuẩn bị trong toàn bộ nhà màng (như trước: vụ Chuẩn bị chưa ghi việc được);
 * - 'part': chuẩn bị trong một phần nhà màng (phần còn lại vẫn chạy vụ khác): vụ Chuẩn bị nhưng GHI VIỆC được;
 * - 'separate': nhà chuẩn bị riêng (chuẩn bị ở nơi khác, ví dụ vườn ươm): vụ Chuẩn bị nhưng GHI VIỆC được.
 * Hai kiểu sau ghi việc được tối đa PREP_LOG_DAYS ngày kể từ lúc tạo vụ, không bắt đầu/hoàn thành việc cho tới khi vụ sang Đang sản xuất.
 * Hạn mức gói không đổi: vụ Chuẩn bị không tính.
 */
export type PrepMode = 'whole' | 'part' | 'separate';
export const PREP_LOG_DAYS = 45;

/** Chữ "Nhà chuẩn bị riêng" theo loại: nhà (cây trồng), chuồng, ao, nơi */
const separateWord = (kind?: string | null) => (kind === 'livestock' ? 'Chuồng' : kind === 'aquatic' ? 'Ao' : kind === 'other' ? 'Nơi' : 'Nhà');

export function prepChoices(kind?: string | null): { code: PrepMode; label: string; hint: string }[] {
  const w = cellWord(kind).toLowerCase();
  return [
    { code: 'whole', label: `Chuẩn bị trong toàn bộ ${w}`, hint: 'Như hiện nay: bắt đầu sản xuất ngay, hoặc chờ ở trạng thái Chuẩn bị (lúc này chưa ghi việc được).' },
    { code: 'part', label: `Chuẩn bị trong 1 phần ${w}`, hint: `Phần còn lại của ${w} vẫn chạy vụ khác. Vụ ở trạng thái Chuẩn bị nhưng ghi việc chuẩn bị được.` },
    { code: 'separate', label: `${separateWord(kind)} chuẩn bị riêng`, hint: 'Chuẩn bị ở một nơi khác (vườn ươm, nhà sơ chế…). Vụ ở trạng thái Chuẩn bị nhưng ghi việc chuẩn bị được.' },
  ];
}

export const prepLabel = (mode: PrepMode | null | undefined, kind?: string | null): string => prepChoices(kind).find((c) => c.code === (mode ?? 'whole'))?.label ?? '';

type CycleLite = Pick<CycleRow, 'status'> & { prep_mode?: PrepMode | null; created_at?: string | null };

/** Vụ đang Chuẩn bị nhưng được ghi việc chuẩn bị (chọn 'part' hoặc 'separate', còn trong hạn PREP_LOG_DAYS ngày kể từ lúc tạo) */
export function prepLoggable(c: CycleLite, now = Date.now()): boolean {
  if (c.status !== 'preparing' || !c.prep_mode || c.prep_mode === 'whole') return false;
  if (!c.created_at) return true;
  return now - new Date(c.created_at).getTime() <= PREP_LOG_DAYS * 86_400_000;
}

/** Vụ ghi việc được: đang sản xuất, hoặc đang chuẩn bị trước */
export const canLogCycle = (c: CycleLite, now = Date.now()): boolean => c.status === 'active' || prepLoggable(c, now);

/** Vụ nối tiếp: vụ trước (nếu có) và đã kết thúc chưa */
export function predecessorOf(c: Pick<CycleRow, 'id'> & { follows_cycle_id?: string | null }, cycles: Pick<CycleRow, 'id' | 'status' | 'name' | 'crop_type_id'>[]) {
  const pred = c.follows_cycle_id ? cycles.find((x) => x.id === c.follows_cycle_id) : undefined;
  return pred ? { pred, ended: pred.status === 'ended' || pred.status === 'cancelled' } : null;
}
