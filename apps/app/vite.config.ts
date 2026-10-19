import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Cổng riêng để không đụng các dự án khác trên máy (5173 là mặc định của Vite, hay bị chiếm)
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // không tự cập nhật giữa lúc người dùng đang nhập dữ liệu
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AgriConnect',
        short_name: 'AgriConnect',
        description: 'Quản lý sản xuất nông nghiệp',
        lang: 'vi',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
});
