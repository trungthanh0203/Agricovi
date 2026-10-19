import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SyncState } from '@agriconnect/shared';
import { db } from './db';

export interface RecordSync {
  state: SyncState;
  error?: string;
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
      if (!cur || RANK[it.state] > RANK[cur.state]) map.set(rid, { state: it.state, error: it.lastError });
    }
    return map;
  }, [items]);
}

/** Bản ghi còn nằm trên thiết bị (chưa lên máy chủ) thì chưa sửa/hủy được: cần đợi gửi xong */
export function isPendingUpload(sync: Map<string, RecordSync>, id: string): boolean {
  const s = sync.get(id);
  return Boolean(s && s.state !== 'synced');
}

/** Có mạng hay không, tự cập nhật khi mạng đổi */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayLocal(): string {
  return toLocalInput(new Date()).slice(0, 10);
}
