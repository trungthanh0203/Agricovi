import { useCallback, useState } from 'react';

/**
 * Như useState nhưng GIỮ giá trị khi màn bị đóng rồi mở lại trong cùng phiên làm việc (D225). Dùng cho bộ lọc, trạng thái nhóm/trang của các danh sách
 * mà người dùng bấm vào xem một mục (màn Quản lý vụ, Ghi việc...) rồi bấm Quay lại: danh sách phải còn nguyên như lúc rời đi, không phải chọn lại.
 * Khóa nên gồm mã cơ sở (ví dụ `${orgId}|production.area`) để đổi cơ sở không dính bộ lọc của cơ sở khác. Mất khi tải lại trang.
 */
const store = new Map<string, unknown>();

export function useKeptState<T>(key: string, initial: T): [T, (next: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  const set = useCallback((next: T | ((cur: T) => T)) => {
    setValue((cur) => {
      const v = typeof next === 'function' ? (next as (c: T) => T)(cur) : next;
      store.set(key, v);
      return v;
    });
  }, [key]);
  return [value, set];
}
