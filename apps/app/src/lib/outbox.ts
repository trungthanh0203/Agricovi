import type { OutboxItem, SyncState } from '@agriconnect/shared';
import { db as defaultDb, type LocalDb } from './db';
import { supabase } from './supabase';

/**
 * Hàng đợi gửi (outbox) - v1.1 mục 8, FR-SYNC-001..006.
 *
 *  INSERT: id là UUID tạo ở thiết bị, gửi bằng "ON CONFLICT DO NOTHING" => gửi lặp không tạo bản ghi trùng
 *          và không cần quyền UPDATE.
 *  UPDATE: gửi qua hàm máy chủ kèm PHIÊN BẢN đã thấy. Máy chủ chỉ áp dụng nếu khớp; nếu người khác đã sửa trước
 *          thì báo CONFLICT và app giữ nguyên thay đổi của người dùng để họ chọn cách giải quyết, KHÔNG ghi đè âm thầm.
 *          Mỗi lần sửa có opId riêng: nếu mạng đứt sau khi máy chủ đã áp dụng, gửi lại không bị coi là xung đột.
 *  Lỗi khác (vượt hạn mức, không đủ quyền...) => needs_attention, giữ dữ liệu trên thiết bị, KHÔNG xóa.
 *  Gửi tuần tự theo thứ tự tạo (khu trồng -> vụ -> nhật ký). Mục lỗi chặn các mục phụ thuộc cùng bản ghi.
 */

/** Hàm máy chủ ứng với từng bảng cho thao tác sửa có kiểm tra phiên bản */
const UPDATE_RPC: Record<string, string> = {
  activity_logs: 'update_activity_log',
  production_cycles: 'update_cycle',
  harvest_records: 'update_harvest',
};

interface ClientResult<T = unknown> {
  data: T;
  error: { message: string } | null;
}
/** Phần của supabase-js mà outbox dùng; tách ra để kiểm thử bằng máy chủ giả */
export interface SyncClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<ClientResult>;
  from(table: string): {
    upsert(values: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
    select(columns: string): { eq(col: string, val: string): { maybeSingle(): PromiseLike<ClientResult<Record<string, unknown> | null>> } };
  };
}

export interface OutboxDeps {
  db: LocalDb;
  client: () => SyncClient | null;
  online: () => boolean;
}

type LocalTableName = 'areas' | 'cycles' | 'logs' | 'harvests';
const LOCAL_TABLE: Record<string, LocalTableName> = {
  production_areas: 'areas',
  production_cycles: 'cycles',
  activity_logs: 'logs',
  harvest_records: 'harvests',
};
/** Các cột của hàng máy chủ được ghi vào bản lưu trên thiết bị khi "dùng bản máy chủ" */
const SERVER_FIELDS: Record<string, string[]> = {
  activity_logs: ['data', 'note', 'performed_at', 'work_type_id', 'voided_at', 'void_reason', 'version'],
  production_cycles: ['status', 'start_date', 'note', 'version'],
  harvest_records: ['harvested_at', 'grade', 'quantity', 'loss_quantity', 'note', 'voided_at', 'void_reason', 'version'],
};

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

  /** Xếp hàng một thay đổi. expectedVersion = phiên bản bản ghi người dùng đang thấy trên thiết bị. */
  async function enqueueUpdate(
    table: string,
    recordId: string,
    expectedVersion: number,
    changes: Record<string, unknown>,
  ): Promise<OutboxItem> {
    if (!UPDATE_RPC[table]) throw new Error(`Bảng ${table} chưa hỗ trợ sửa có kiểm tra phiên bản`);
    const opId = crypto.randomUUID();
    const item: OutboxItem = {
      id: `${table}:${recordId}:${opId}`,
      table,
      op: 'update',
      payload: { id: recordId },
      changes,
      expectedVersion,
      opId,
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
    const blocked = new Set<string>();           // bản ghi đang lỗi/xung đột: các mục phụ thuộc tạm dừng
    const versions = new Map<string, number>();  // phiên bản mới nhất sau các lần sửa thành công trong lượt này

    for (const item of pending) {
      const rid = item.payload.id as string;
      // bản ghi cha: vụ, khu trồng, hoặc nhật ký mà giao dịch xuất kho gắn vào
      const parents = [item.payload.cycle_id, item.payload.area_id, item.payload.activity_log_id] as (string | undefined)[];
      if (blocked.has(rid) || parents.some((p) => p && blocked.has(p))) {
        blocked.add(rid);
        continue;
      }
      if (item.conflict) {
        // chờ người dùng giải quyết; không tự gửi lại
        blocked.add(rid);
        continue;
      }

      await db.outbox.update(item.id, { state: 'syncing', attempts: item.attempts + 1 });

      if (item.op === 'insert') {
        const { error } = await client.from(item.table).upsert(item.payload, { onConflict: 'id', ignoreDuplicates: true });
        if (error) {
          failed += 1;
          blocked.add(rid);
          await setState(item.id, 'needs_attention', error.message);
        } else {
          synced += 1;
          await setState(item.id, 'synced');
        }
        continue;
      }

      // --- sửa có kiểm tra phiên bản ---
      const fn = UPDATE_RPC[item.table]!;
      const expected = versions.get(rid) ?? item.expectedVersion ?? 1;
      const res = await client.rpc(fn, {
        p_id: rid,
        p_expected_version: expected,
        p_op_id: item.opId,
        p_changes: item.changes ?? {},
      });

      if (!res.error) {
        const row = res.data as Record<string, unknown>;
        const newVersion = Number(row.version);
        versions.set(rid, newVersion);
        synced += 1;
        await setState(item.id, 'synced');
        // đồng bộ phiên bản vào bản lưu trên thiết bị và các thay đổi còn chờ của cùng bản ghi
        const local = LOCAL_TABLE[item.table];
        if (local) await (db[local] as unknown as { update(id: string, c: object): Promise<number> }).update(rid, { version: newVersion });
        const later = (await db.outbox.where('state').anyOf('local_only', 'needs_attention', 'syncing').toArray())
          .filter((o) => o.op === 'update' && o.payload.id === rid && o.id !== item.id);
        for (const o of later) await db.outbox.update(o.id, { expectedVersion: newVersion });
        continue;
      }

      failed += 1;
      blocked.add(rid);
      if (/^CONFLICT/.test(res.error.message)) {
        // lấy bản đang có trên máy chủ để người dùng so sánh
        const cur = await client.from(item.table).select('*').eq('id', rid).maybeSingle();
        await db.outbox.update(item.id, {
          state: 'needs_attention',
          lastError: res.error.message,
          conflict: cur.data ? { server: cur.data } : undefined,
        });
      } else {
        await setState(item.id, 'needs_attention', res.error.message);
      }
    }
    return { synced, failed };
  }

  /** Thử lại các mục "Cần xử lý" không phải xung đột */
  async function retryFailed(): Promise<void> {
    const items = await db.outbox.where('state').equals('needs_attention').toArray();
    for (const it of items) if (!it.conflict) await db.outbox.update(it.id, { state: 'local_only' });
    await flush();
  }

  /** Xung đột -> "Giữ thay đổi của tôi": gửi lại thay đổi trên nền phiên bản máy chủ hiện tại */
  async function resolveKeepMine(itemId: string): Promise<void> {
    const item = await db.outbox.get(itemId);
    if (!item?.conflict) return;
    const serverVersion = Number(item.conflict.server.version);
    const rid = item.payload.id as string;
    const chain = (await db.outbox.toArray()).filter(
      (o) => o.op === 'update' && o.payload.id === rid && o.state !== 'synced' && o.createdAt >= item.createdAt,
    );
    for (const o of chain) {
      await db.outbox.update(o.id, { expectedVersion: serverVersion, conflict: undefined, state: 'local_only', lastError: undefined });
    }
    await flush();
  }

  /** Xung đột -> "Dùng bản trên máy chủ": bỏ thay đổi của tôi, lấy bản máy chủ về thiết bị */
  async function resolveUseServer(itemId: string): Promise<void> {
    const item = await db.outbox.get(itemId);
    if (!item?.conflict) return;
    const rid = item.payload.id as string;
    const local = LOCAL_TABLE[item.table];
    if (local) {
      const picked: Record<string, unknown> = {};
      for (const k of SERVER_FIELDS[item.table] ?? []) picked[k] = item.conflict.server[k];
      await (db[local] as unknown as { update(id: string, c: object): Promise<number> }).update(rid, picked);
    }
    const chain = (await db.outbox.toArray()).filter(
      (o) => o.op === 'update' && o.payload.id === rid && o.state !== 'synced' && o.createdAt >= item.createdAt,
    );
    await db.outbox.bulkDelete(chain.map((o) => o.id));
  }

  async function countByState(): Promise<Record<SyncState, number>> {
    const out: Record<SyncState, number> = { local_only: 0, syncing: 0, synced: 0, needs_attention: 0 };
    for (const it of await db.outbox.toArray()) out[it.state] += 1;
    return out;
  }

  return { enqueue, enqueueUpdate, flush, retryFailed, resolveKeepMine, resolveUseServer, countByState };
}

// --- thể hiện dùng trong app (CSDL cục bộ thật + Supabase thật) ---
const instance = createOutbox({
  db: defaultDb,
  client: () => supabase as unknown as SyncClient | null,
  online: () => navigator.onLine,
});

export const enqueue = instance.enqueue;
export const enqueueUpdate = instance.enqueueUpdate;
export const flushOutbox = instance.flush;
export const retryFailed = instance.retryFailed;
export const resolveKeepMine = instance.resolveKeepMine;
export const resolveUseServer = instance.resolveUseServer;
export const countByState = instance.countByState;
