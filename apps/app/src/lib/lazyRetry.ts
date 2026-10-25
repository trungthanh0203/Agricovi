import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * `lazy` có tự thử lại: sau khi app cập nhật bản mới, trang đang mở có thể xin một tệp màn hình cũ đã không còn trên máy chủ
 * (lỗi tải "dynamically imported module") và màn hình bị trắng. Gặp lỗi này thì tự tải lại trang MỘT lần (cờ lưu theo phiên để không lặp vô hạn);
 * lần sau vẫn lỗi thì để ErrorBoundary hiện thông báo.
 */
const FLAG = 'agriconnect.chunkReloaded';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const m = await load();
      try { sessionStorage.removeItem(FLAG); } catch { /* bỏ qua */ }
      return m;
    } catch (e) {
      let already = true;
      try { already = sessionStorage.getItem(FLAG) === '1'; sessionStorage.setItem(FLAG, '1'); } catch { /* bỏ qua */ }
      if (!already) {
        window.location.reload();
        return new Promise<never>(() => undefined); // chờ trang tải lại
      }
      throw e;
    }
  });
}
