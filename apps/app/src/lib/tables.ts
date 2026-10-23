import { useSyncExternalStore } from 'react';
import { liveQuery, type Subscription, type Table } from 'dexie';
import { db, type LocalDb } from './db';

type TableKey = {
  [K in keyof LocalDb]: LocalDb[K] extends Table<any, any> ? K : never;
}[keyof LocalDb];
type RowOf<K extends TableKey> = LocalDb[K] extends Table<infer R, any> ? R : never;

/**
 * Bản đọc dùng chung của một bảng trên máy: nhiều màn cùng cần "danh sách vụ" thì chỉ đọc và theo dõi MỘT lần
 * (trước đây mỗi màn tự đọc cả bảng, Trang chủ đọc cùng bảng tới 2 lần). Rời màn 2 giây không ai dùng thì ngừng theo dõi và bỏ bản đã đọc.
 */
interface Store<T> {
  subscribe(cb: () => void): () => void;
  get(): T[];
}

const EMPTY: never[] = [];
const stores = new Map<string, Store<unknown>>();

function createStore<T>(read: () => Promise<T[]>): Store<T> {
  let value: T[] = EMPTY;
  const listeners = new Set<() => void>();
  let sub: Subscription | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    get: () => value,
    subscribe(cb) {
      listeners.add(cb);
      if (timer) { clearTimeout(timer); timer = null; }
      if (!sub) {
        sub = liveQuery(read).subscribe({
          next: (v) => { value = v; listeners.forEach((f) => f()); },
          error: () => undefined,
        });
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && !timer) {
          timer = setTimeout(() => {
            timer = null;
            if (listeners.size === 0) { sub?.unsubscribe(); sub = null; value = EMPTY; }
          }, 2000);
        }
      };
    },
  };
}

/** Toàn bộ dòng của một bảng trên máy, tự cập nhật khi bảng đổi. Dùng thay cho useLiveQuery(() => db.x.toArray()). */
export function useTable<K extends TableKey>(name: K): RowOf<K>[] {
  let store = stores.get(name) as Store<RowOf<K>> | undefined;
  if (!store) {
    store = createStore<RowOf<K>>(() => (db[name] as Table<RowOf<K>, any>).toArray());
    stores.set(name, store as Store<unknown>);
  }
  const s = store;
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}
