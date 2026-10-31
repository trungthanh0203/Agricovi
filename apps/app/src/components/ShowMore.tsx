import { useEffect, useState } from 'react';

/**
 * Danh sách dài chỉ vẽ 50 dòng đầu, bấm "Xem thêm" để vẽ tiếp (Đợt 2 hiệu năng, D140).
 * `resetKey` đổi (ví dụ bộ lọc/ô tìm đổi) thì quay về 50 dòng đầu.
 */
export function useShowMore<T>(items: T[], resetKey = '', step = 50) {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [resetKey, step]);
  const visible = items.length > n ? items.slice(0, n) : items;
  const more = items.length > n ? (
    <div className="btnrow">
      <button type="button" className="secondary" onClick={() => setN((x) => x + step)}>
        Xem thêm ({items.length - n} dòng nữa)
      </button>
    </div>
  ) : null;
  return { visible, more };
}
