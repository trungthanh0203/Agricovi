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
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // bản mới tự thay âm thầm, có hiệu lực ở lần mở app kế tiếp (không hiện thông báo, không tự tải lại giữa lúc nhập)
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AgriConnect',
        short_name: 'AgriConnect',
        description: 'Quản lý sản xuất nông nghiệp',
        lang: 'vi',
        theme_color: '#0e5e2e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // trang quản trị (/quan-tri/) là bản dựng riêng, không để app chặn điều hướng vào đó
        navigateFallbackDenylist: [/^\/quan-tri/],
      },
    }),
  ],
});
