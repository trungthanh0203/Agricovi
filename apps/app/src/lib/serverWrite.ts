import { db } from './db';
import { supabase } from './supabase';

/**
 * Ghi THẲNG lên máy chủ (quyết định D24): mọi thao tác không phải "ghi mới việc hằng ngày của nhân viên" cần có mạng.
 * Kết quả báo ngay (thành công hoặc lỗi rõ ràng), không cất vào hàng đợi, không có trạng thái "Cần xử lý".
 *
 *  - Thêm mới: INSERT có id tạo ở thiết bị (an toàn khi bấm lặp). Không dùng RETURNING (xem CLAUDE.md, bẫy 1).
 *  - Sửa/hủy: gọi hàm máy chủ kèm PHIÊN BẢN đã thấy; người khác sửa trước thì máy chủ báo CONFLICT, ta tải lại bản mới
 *    và báo người dùng, KHÔNG ghi đè âm thầm.
 *  - Sau khi thành công, bản lưu trên thiết bị được cập nhật ngay để danh sách hiện đúng và vẫn xem được khi mất mạng.
 */

export interface WriteClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
    select(columns: string): { eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }> } };
  };
}

/** Hàm máy chủ sửa có kiểm tra phiên bản, theo bảng */
export const UPDATE_RPC: Record<string, string> = {
  activity_logs: 'update_activity_log',
  production_cycles: 'update_cycle',
  harvest_records: 'update_harvest',
  expense_records: 'update_expense',
  sales_records: 'update_sale',
};

/** Bảng trên thiết bị ứng với bảng máy chủ */
const LOCAL_TABLE: Record<string, 'areas' | 'cycles' | 'logs' | 'harvests' | 'expenses' | 'sales'> = {
  production_areas: 'areas',
  production_cycles: 'cycles',
  activity_logs: 'logs',
  harvest_records: 'harvests',
  expense_records: 'expenses',
  sales_records: 'sales',
};

const NUMERIC_COLUMNS = ['quantity', 'loss_quantity', 'amount'];

export const CONFLICT_MESSAGE =
  'CONFLICT: Người khác vừa thay đổi bản ghi này. Đã tải lại bản mới nhất, hãy xem lại rồi sửa lại nếu còn cần.';

export function requireOnline(action: string): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(`OFFLINE: Cần có mạng để ${action}. Hãy kết nối mạng rồi thử lại.`);
  }
}

function defaultClient(): WriteClient {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase as unknown as WriteClient;
}

/** Thêm một hàng (id do thiết bị tạo nên gửi lặp không nhân đôi). Ném lỗi nếu máy chủ từ chối (quyền, hạn mức, ràng buộc…). */
export async function insertRow(table: string, row: Record<string, unknown>, c: WriteClient = defaultClient()): Promise<void> {
  const { error } = await c.from(table).insert(row);
  if (!error) return;
  // Cùng id đã được lưu (mất phản hồi rồi bấm lại): coi như thành công, không nhân đôi
  if (/duplicate key value violates unique constraint "[a-z_]+_pkey"/.test(error.message)) return;
  throw new Error(error.message);
}

/** Sửa/hủy có kiểm tra phiên bản; trả về hàng mới trên máy chủ. CONFLICT được đổi sang câu dễ hiểu. */
export async function updateVersioned<T = Record<string, unknown>>(
  table: string, id: string, expectedVersion: number, changes: Record<string, unknown>, c: WriteClient = defaultClient(),
): Promise<T> {
  const fn = UPDATE_RPC[table];
  if (!fn) throw new Error(`Bảng ${table} chưa hỗ trợ sửa có kiểm tra phiên bản`);
  const { data, error } = await c.rpc(fn, {
    p_id: id,
    p_expected_version: expectedVersion,
    p_op_id: crypto.randomUUID(),
    p_changes: changes,
  });
  if (error) {
    if (/^CONFLICT/.test(error.message)) throw new Error(CONFLICT_MESSAGE);
    throw new Error(error.message);
  }
  return data as T;
}

function coerce(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const k of NUMERIC_COLUMNS) if (out[k] !== undefined && out[k] !== null) out[k] = Number(out[k]);
  return out;
}

type Putter = { put(row: object): Promise<unknown> };
const local = (table: string): Putter => {
  const name = LOCAL_TABLE[table];
  if (!name) throw new Error(`Bảng ${table} chưa có bản lưu trên thiết bị`);
  return db[name] as unknown as Putter;
};

/** Lưu (hoặc thay) một hàng vào bản lưu trên thiết bị */
export async function putLocal(table: string, row: Record<string, unknown>): Promise<void> {
  await local(table).put(coerce(row));
}

/** Tải lại một hàng từ máy chủ vào thiết bị (dùng sau khi gặp xung đột) */
export async function refreshRow(table: string, id: string): Promise<void> {
  const c = defaultClient();
  const { data } = await c.from(table).select('*').eq('id', id).maybeSingle();
  if (data) await putLocal(table, data as Record<string, unknown>);
}

/** Thêm hàng lên máy chủ rồi lưu bản trên thiết bị. `action` mô tả việc đang làm để báo "Cần có mạng để …". */
export async function insertAndCache(
  table: string, row: Record<string, unknown>, localRow: Record<string, unknown>, action: string,
): Promise<void> {
  requireOnline(action);
  await insertRow(table, row);
  await putLocal(table, localRow);
}

/** Sửa/hủy rồi cập nhật bản trên thiết bị; gặp xung đột thì tải lại bản mới rồi báo lỗi. */
export async function updateAndCache<T extends Record<string, unknown>>(
  table: string, id: string, expectedVersion: number, changes: Record<string, unknown>, action: string,
): Promise<T> {
  requireOnline(action);
  try {
    const row = await updateVersioned<T>(table, id, expectedVersion, changes);
    await putLocal(table, row);
    return row;
  } catch (e) {
    if (e instanceof Error && /^CONFLICT/.test(e.message)) await refreshRow(table, id).catch(() => undefined);
    throw e;
  }
}
