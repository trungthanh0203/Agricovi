import { registerSW } from 'virtual:pwa-register';

/**
 * Cập nhật bản mới của app (PWA). Trình duyệt tải bản mới về nhưng GIỮ chờ, không tự đổi giữa lúc người dùng đang nhập;
 * khi có bản mới ta hiện thông báo để người dùng bấm "Cập nhật ngay". Nếu không có bước này, bản cũ được lưu trong máy
 * sẽ chạy mãi tới khi đóng hết các tab (tải lại trang không đủ) — đó là lý do bản mới "không thấy đổi".
 */
type Listener = (needRefresh: boolean) => void;

let needRefresh = false;
let update: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

export function initPwa(): void {
  if (update) return;
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((l) => l(true));
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      setInterval(check, 30 * 60 * 1000); // kiểm tra bản mới mỗi 30 phút
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check(); // và mỗi lần mở lại app
      });
    },
  });
}

/** Đăng ký nghe "có bản mới"; trả về hàm hủy đăng ký */
export function onUpdateAvailable(l: Listener): () => void {
  listeners.add(l);
  if (needRefresh) l(true);
  return () => { listeners.delete(l); };
}

/** Áp dụng bản mới và tải lại trang */
export function applyUpdate(): void {
  void update?.(true);
}
