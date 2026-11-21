// Service worker của app (H2 lát 1, D182). Thay cho bản sinh tự động để có xử lý thông báo đẩy (`push`, `notificationclick`),
// nhưng GIỮ NGUYÊN các hành vi cũ: lưu sẵn tệp của app để dùng offline, tự thay bản mới âm thầm (autoUpdate), không chặn /quan-tri/,
// thư viện nhận diện khuôn mặt chỉ lưu khi máy chấm công tải lần đầu.
// Tệp này nằm ngoài `src` nên không đi qua tsc (kiểu tối thiểu viết tay); vite-plugin-pwa (injectManifest) dựng nó khi build.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sw = self as any;

sw.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
// vite-plugin-pwa thay đúng chuỗi `self.__WB_MANIFEST` bằng danh sách tệp cần lưu sẵn (không đổi tên `self` ở dòng này)
precacheAndRoute((self as any).__WB_MANIFEST); // eslint-disable-line @typescript-eslint/no-explicit-any

// trang điều hướng trả về index.html (app một trang), trừ trang quản trị nền tảng là bản dựng riêng
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/quan-tri/] }));

registerRoute(
  ({ url }: { url: URL }) => /\/(assets\/face-api-[^/]+\.js|models\/.+)$/.test(url.pathname),
  new CacheFirst({ cacheName: 'face-models', plugins: [new ExpirationPlugin({ maxEntries: 12 })] }),
);

// ---- Thông báo đẩy ----
// Nội dung do máy chủ gửi: { title, body, url?, tag? }. Không có số tiền hay tên khách (hiện trên màn hình khóa).
sw.addEventListener('push', (event: { data?: { json(): unknown; text(): string }; waitUntil(p: Promise<unknown>): void }) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { data = (event.data?.json() ?? {}) as typeof data; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(sw.registration.showNotification(data.title || 'Acovin', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'acovin',      // cùng tag thì thay thông báo cũ, không chồng nhiều cái
    data: { url: data.url || '/' },
  }));
});

// Bấm vào thông báo: mở lại cửa sổ app đang có (nếu có) hoặc mở mới
sw.addEventListener('notificationclick', (event: { notification: { close(): void; data?: { url?: string } }; waitUntil(p: Promise<unknown>): void }) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', sw.location.origin).href;
  event.waitUntil((async () => {
    const wins = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === sw.location.origin && 'focus' in w) { await w.focus(); return; }
    }
    await sw.clients.openWindow(target);
  })());
});
