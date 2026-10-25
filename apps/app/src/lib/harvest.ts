import { db, type CycleRow, type HarvestRow } from './db';
import { enqueue, flushOutbox } from './outbox';
import { updateAndCache } from './serverWrite';
import { supabase } from './supabase';

/**
 * Thu hoạch (FR-INV-007, quyết định D20, D21).
 *  - Mọi người ghi được nhật ký đều ghi được thu hoạch; GHI MỚI dùng được offline. Sửa/hủy cần mạng (D24).
 *  - Đơn vị khóa kg. Hao hụt không vượt số lượng thu.
 *  - Sửa/hủy gửi kèm phiên bản để phát hiện xung đột; hủy cần lý do, không khôi phục.
 */

export const HARVEST_UNIT = 'kg';
/** Gợi ý phân loại; người dùng gõ tự do được */
export const GRADE_SUGGESTIONS = ['Loại 1', 'Loại 2', 'Loại 3', 'Loại bỏ'];

const COLUMNS =
  'id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note, voided_at, void_reason, version, created_by, received_at';
// mã lô, số quả/con, dữ liệu form động (D98) chỉ có sau migration 0082
const COLUMNS_D98 = `${COLUMNS}, lot_code, unit_count, extra`;

/** Tải thu hoạch gần đây về thiết bị (200 phiếu mới nhất). Không ghi đè phiếu đang chờ gửi hoặc đang xung đột. */
export async function syncHarvestsDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const pendingIds = new Set(
    (await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string),
  );
  const q = (cols: string) => supabase!.from('harvest_records').select(cols).order('harvested_at', { ascending: false }).limit(200);
  let { data, error } = await q(COLUMNS_D98);
  if (error && /column|schema cache/i.test(error.message ?? '')) ({ data, error } = await q(COLUMNS));
  if (error) throw error;
  const rows = ((data ?? []) as unknown as HarvestRow[])
    .filter((r) => !pendingIds.has(r.id))
    .map((r) => ({ ...r, quantity: Number(r.quantity), loss_quantity: r.loss_quantity == null ? null : Number(r.loss_quantity) }));
  await db.harvests.bulkPut(rows);
}

export interface NewHarvest {
  cycle: CycleRow;
  harvestedAt: string; // ISO
  grade: string;
  quantity: number;
  lossQuantity: number | null;
  note: string;
  userId: string;
  /** Lý do thu trong thời gian cách ly (D96) */
  withdrawalReason?: string;
  /** Số quả/con và dữ liệu theo form động (D98); trống thì không gửi để không cần CSDL mới */
  unitCount?: number | null;
  extra?: Record<string, unknown>;
}

export async function recordHarvest(h: NewHarvest): Promise<string> {
  const id = crypto.randomUUID();
  const source = navigator.onLine ? 'online' : 'offline';
  const row = {
    id,
    organization_id: h.cycle.owner_org_id, // máy chủ tự gán lại theo chủ vụ
    cycle_id: h.cycle.id,
    harvested_at: h.harvestedAt,
    grade: h.grade.trim() || null,
    quantity: h.quantity,
    unit: HARVEST_UNIT,
    loss_quantity: h.lossQuantity,
    note: h.note.trim() || null,
    ...(h.withdrawalReason?.trim() ? { withdrawal_reason: h.withdrawalReason.trim() } : {}),
    ...(h.unitCount ? { unit_count: h.unitCount } : {}),
    ...(h.extra && Object.keys(h.extra).length > 0 ? { extra: h.extra } : {}),
  };
  await db.transaction('rw', db.harvests, db.outbox, async () => {
    await db.harvests.put({ ...row, version: 1, created_by: h.userId, received_at: new Date().toISOString() });
    await enqueue('harvest_records', { ...row, source, created_by: h.userId });
  });
  void flushOutbox();
  return id;
}

export interface HarvestEdit {
  harvestedAt: string; // ISO
  grade: string;
  quantity: number;
  lossQuantity: number | null;
  note: string;
  unitCount?: number | null;
  extra?: Record<string, unknown>;
}

/** Sửa phiếu (cần mạng): kèm phiên bản đã thấy để phát hiện xung đột. */
export async function editHarvest(id: string, e: HarvestEdit): Promise<void> {
  const cur = await db.harvests.get(id);
  if (!cur) return;
  const changes = {
    harvested_at: e.harvestedAt,
    grade: e.grade.trim() || null,
    quantity: e.quantity,
    loss_quantity: e.lossQuantity,
    note: e.note.trim() || null,
    // chỉ gửi phần riêng khi có (hoặc đang có sẵn cần xóa) để CSDL chưa cập nhật vẫn sửa được phần chung
    ...(e.unitCount !== undefined && (e.unitCount || cur.unit_count) ? { unit_count: e.unitCount ? String(e.unitCount) : '' } : {}),
    ...(e.extra !== undefined && (Object.keys(e.extra).length > 0 || Object.keys(cur.extra ?? {}).length > 0) ? { extra: e.extra } : {}),
  };
  await updateAndCache('harvest_records', id, cur.version, changes, 'sửa phiếu thu hoạch');
}

/** Hủy phiếu (không xóa, cần mạng): cần lý do; không khôi phục được. */
export async function voidHarvest(id: string, reason: string): Promise<void> {
  const cur = await db.harvests.get(id);
  if (!cur) return;
  await updateAndCache('harvest_records', id, cur.version, { voided_at: new Date().toISOString(), void_reason: reason.trim() }, 'hủy phiếu thu hoạch');
}

/** Kiểm tra số liệu nhập: trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ */
export function validateHarvest(quantity: number | null, loss: number | null): string | null {
  if (quantity === null || Number.isNaN(quantity) || quantity <= 0) return 'Số lượng thu phải là số lớn hơn 0 (kg).';
  if (loss !== null && (Number.isNaN(loss) || loss < 0)) return 'Hao hụt phải là số không âm (kg).';
  if (loss !== null && loss > quantity) return 'Hao hụt không được lớn hơn số lượng thu.';
  return null;
}
