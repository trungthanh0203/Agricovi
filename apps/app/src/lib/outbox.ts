import type { OutboxItem, SyncState } from '@agriconnect/shared';
import { db as defaultDb, type LocalDb } from './db';
import { supabase } from './supabase';

/**
 * Hàng đợi gửi (outbox) - v1.1 mục 8, FR-SYNC-001..006.
 *
 * Phạm vi (quyết định D24): hàng đợi CHỈ dành cho việc GHI MỚI hằng ngày của nhân viên khi không có mạng tại nơi làm việc:
 * nhật ký (kèm giao dịch xuất vật tư đã dùng) và phiếu thu hoạch. Mọi thao tác khác (phân khu, vụ, kho, chi phí,
 * doanh thu, sửa/hủy…) cần mạng và ghi thẳng lên máy chủ, xem serverWrite.ts.
 *
 *  INSERT: id là UUID tạo ở thiết bị, gửi bằng "ON CONFLICT DO NOTHING" => gửi lặp không tạo bản ghi trùng.
 *  Lỗi (không đủ quyền, vượt hạn mức...) => needs_attention, giữ dữ liệu trên thiết bị, KHÔNG xóa.
 *  Gửi tuần tự theo thứ tự tạo (nhật ký -> giao dịch xuất kho). Mục lỗi chặn các mục phụ thuộc cùng bản ghi.
 */

/** Phần của supabase-js mà outbox dùng; tách ra để kiểm thử bằng máy chủ giả */
export interface SyncClient {
  from(table: string): {
    upsert(values: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface OutboxDeps {
  db: LocalDb;
  client: () => SyncClient | null;
  online: () => boolean;
}

export function createOutbox(deps: OutboxDeps) {
  const { db } = deps;

  // Thời điểm tạo tăng chặt: các mục xếp cùng lúc (nhật ký rồi giao dịch xuất kho) luôn gửi đúng thứ tự tạo
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };

  async function enqueue(table: string, payload: Record<string, unknown>): Promise<OutboxItem> {
    const id = (payload.id as string | undefined) ?? crypto.randomUUID();
    const item: OutboxItem = {
      id,
      table,
      op: 'insert',
      payload: { ...payload, id },
      createdAt: stamp(),
      attempts: 0,
      state: 'local_only',
    };
    await db.outbox.put(item);
    return item;
  }

  async function setState(id: string, state: SyncState, lastError?: string) {
    await db.outbox.update(id, { state, lastError });
  }

  let flushing: Promise<{ synced: number; failed: number }> | null = null;

  /** Gửi các mục chưa đồng bộ. Gọi chồng nhau sẽ dùng chung một lượt. */
  function flush(): Promise<{ synced: number; failed: number }> {
    if (flushing) return flushing;
    flushing = doFlush().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function doFlush(): Promise<{ synced: number; failed: number }> {
    const client = deps.client();
    if (!client || !deps.online()) return { synced: 0, failed: 0 };

    const pending = await db.outbox.where('state').anyOf('local_only', 'needs_attention', 'syncing').sortBy('createdAt');
    let synced = 0;
    let failed = 0;
    const blocked = new Set<string>(); // bản ghi đang lỗi: các mục phụ thuộc tạm dừng

    for (const item of pending) {
      const rid = item.payload.id as string;
      // bản ghi cha: vụ, phân khu, hoặc nhật ký mà giao dịch xuất kho gắn vào
      const parents = [item.payload.cycle_id, item.payload.area_id, item.payload.activity_log_id] as (string | undefined)[];
      if (blocked.has(rid) || parents.some((p) => p && blocked.has(p))) {
        blocked.add(rid);
        continue;
      }

      await db.outbox.update(item.id, { state: 'syncing', attempts: item.attempts + 1 });
      const { error } = await client.from(item.table).upsert(item.payload, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        failed += 1;
        blocked.add(rid);
        await setState(item.id, 'needs_attention', error.message);
      } else {
        synced += 1;
        await setState(item.id, 'synced');
      }
    }
    return { synced, failed };
  }

  /** Thử lại các mục "Cần xử lý" */
  async function retryFailed(): Promise<void> {
    const items = await db.outbox.where('state').equals('needs_attention').toArray();
    for (const it of items) await db.outbox.update(it.id, { state: 'local_only' });
    await flush();
  }

  async function countByState(): Promise<Record<SyncState, number>> {
    const out: Record<SyncState, number> = { local_only: 0, syncing: 0, synced: 0, needs_attention: 0 };
    for (const it of await db.outbox.toArray()) out[it.state] += 1;
    return out;
  }

  return { enqueue, flush, retryFailed, countByState };
}

// --- thể hiện dùng trong app (CSDL cục bộ thật + Supabase thật) ---
const instance = createOutbox({
  db: defaultDb,
  client: () => supabase as unknown as SyncClient | null,
  online: () => navigator.onLine,
});

export const enqueue = instance.enqueue;
export const flushOutbox = instance.flush;
export const retryFailed = instance.retryFailed;
export const countByState = instance.countByState;
