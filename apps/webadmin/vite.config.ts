import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi build, quản trị website được đặt vào public/admin của website và phục vụ ở /admin/ cùng Worker với website (D64).
// Đọc chung biến môi trường (.env) với app.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  envDir: '../app',
  plugins: [react()],
}));
