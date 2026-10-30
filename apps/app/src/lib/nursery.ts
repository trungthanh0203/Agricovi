import type { CycleRow } from './db';

/**
 * Ươm gối vụ (D124, migration 0135): vụ B làm giá thể, ươm cây khi vụ A còn chạy ở cùng phân khu; B ở trạng thái Chuẩn bị nhưng vẫn
 * được GHI VIỆC (không bắt đầu/hoàn thành việc), tối đa NURSERY_LOG_DAYS ngày kể từ lúc tạo. Khi vụ A xong thì chuyển B sang sản xuất.
 * Cơ sở bật ở Cấu hình → Chỗ ươm: 'inside' (khu ươm riêng trong khu trồng), 'separate' (vườn ươm riêng), 'same' (ươm ngay tại khu trồng, không ươm gối).
 */
export type NurseryMode = 'inside' | 'separate' | 'same';
export const NURSERY_LOG_DAYS = 45;

export const NURSERY_CHOICES: { code: NurseryMode; label: string; hint: string }[] = [
  { code: 'inside', label: 'Khu ươm riêng trong khu trồng', hint: 'Ươm ở một góc nhỏ của chính phân khu đang trồng. Vụ sau được tạo trước (Chuẩn bị) và ghi việc ươm khi vụ trước còn chạy.' },
  { code: 'separate', label: 'Vườn ươm riêng', hint: 'Có vườn ươm tách khỏi khu trồng. Vụ sau được tạo trước (Chuẩn bị) và ghi việc ươm khi vụ trước còn chạy.' },
  { code: 'same', label: 'Ươm ngay tại khu trồng', hint: 'Chỉ ươm khi khu trồng đã trống, không ươm gối. Cách làm như hiện nay: vụ phải Đang sản xuất mới ghi việc.' },
];
export const nurseryModeLabel = (m: NurseryMode) => NURSERY_CHOICES.find((c) => c.code === m)?.label ?? '';

type CycleLite = Pick<CycleRow, 'status'> & { nursery_overlap?: boolean | null; created_at?: string | null };

/** Vụ đang Chuẩn bị nhưng được ghi việc ươm (còn trong hạn NURSERY_LOG_DAYS ngày kể từ lúc tạo) */
export function nurseryLoggable(c: CycleLite, now = Date.now()): boolean {
  if (c.status !== 'preparing' || !c.nursery_overlap) return false;
  if (!c.created_at) return true;
  return now - new Date(c.created_at).getTime() <= NURSERY_LOG_DAYS * 86_400_000;
}

/** Vụ ghi việc được: đang sản xuất, hoặc đang ươm gối */
export const canLogCycle = (c: CycleLite, now = Date.now()): boolean => c.status === 'active' || nurseryLoggable(c, now);

/** Vụ nối tiếp: vụ trước (nếu có) và đã kết thúc chưa */
export function predecessorOf(c: Pick<CycleRow, 'id'> & { follows_cycle_id?: string | null }, cycles: Pick<CycleRow, 'id' | 'status' | 'name' | 'crop_type_id'>[]) {
  const pred = c.follows_cycle_id ? cycles.find((x) => x.id === c.follows_cycle_id) : undefined;
  return pred ? { pred, ended: pred.status === 'ended' || pred.status === 'cancelled' } : null;
}
