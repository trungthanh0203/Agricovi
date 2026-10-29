import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

declare const process: { env: Record<string, string | undefined> }; // chỉ cần đọc biến môi trường lúc build

// Mã phiên bản hiện ở mục Cơ sở của tôi để biết đang chạy bản nào (Cloudflare cung cấp mã commit lúc build)
const commit = (process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7);
const appVersion = `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // Cổng riêng để không đụng các dự án khác trên máy (5173 là mặc định của Vite, hay bị chiếm)
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: {
    rollupOptions: {
      // Thư viện lớn ít đổi tách riêng để trình duyệt lưu đệm, lần cập nhật app chỉ tải lại phần mã của mình
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          dexie: ['dexie', 'dexie-react-hooks'],
          'face-api': ['@vladmandic/face-api'], // chỉ tải khi mở Máy chấm công
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // bản mới tự thay âm thầm, có hiệu lực ở lần mở app kế tiếp (không hiện thông báo, không tự tải lại giữa lúc nhập)
      includeAssets: ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-mark.png', 'welcome.webp'],
      manifest: {
        name: 'Agricovi',
        short_name: 'Agricovi',
        description: 'Quản lý sản xuất nông nghiệp',
        lang: 'vi',
        theme_color: '#0e5e2e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        // Thư viện + mô hình nhận diện khuôn mặt (~8 MB) không nạp sẵn cho mọi người dùng: chỉ máy chấm công tải, rồi trình duyệt lưu lại dùng offline
        globIgnores: ['**/face-api-*.js'],
        runtimeCaching: [
          { urlPattern: /\/(assets\/face-api-[^/]+\.js|models\/.+)$/, handler: 'CacheFirst', options: { cacheName: 'face-models', expiration: { maxEntries: 12 } } },
        ],
        // trang quản trị (/quan-tri/) là bản dựng riêng, không để app chặn điều hướng vào đó
        navigateFallbackDenylist: [/^\/quan-tri/],
      },
    }),
  ],
});
