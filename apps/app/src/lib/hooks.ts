import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SyncState } from '@agriconnect/shared';
import { db } from './db';

export interface RecordSync {
  state: SyncState;
  error?: string;
  /** Có khi máy chủ báo xung đột: chờ người dùng chọn cách giải quyết */
  conflict?: { server: Record<string, unknown> };
  itemId?: string;
  table?: string;
  changes?: Record<string, unknown>;
}

const RANK: Record<SyncState, number> = { synced: 0, local_only: 1, syncing: 2, needs_attention: 3 };

/** Trạng thái đồng bộ theo id bản ghi, tự cập nhật khi hàng đợi thay đổi. Bản ghi không có trong hàng đợi = đã có trên máy chủ. */
export function useRecordSync(): Map<string, RecordSync> {
  const items = useLiveQuery(() => db.outbox.toArray(), [], []);
  return useMemo(() => {
    const map = new Map<string, RecordSync>();
    for (const it of items) {
      const rid = it.payload.id as string;
      const cur = map.get(rid);
      const beats = !cur || RANK[it.state] > RANK[cur.state] || (it.conflict && !cur.conflict);
      if (beats) {
        map.set(rid, {
          state: it.state,
          error: it.lastError,
          conflict: it.conflict,
          itemId: it.id,
          table: it.table,
          changes: it.changes,
        });
      }
    }
    return map;
  }, [items]);
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayLocal(): string {
  return toLocalInput(new Date()).slice(0, 10);
}
