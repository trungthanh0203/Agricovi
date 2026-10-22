import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Trang quản trị WEBSITE: dự án Cloudflare riêng (D63), phục vụ ở gốc địa chỉ. Đọc chung biến môi trường (.env) với app.
export default defineConfig({
  envDir: '../app',
  plugins: [react()],
});
