import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi build, admin phục vụ ở đường dẫn /quan-tri/ của cùng dự án với app; đọc chung biến môi trường (.env) với app.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/quan-tri/' : '/',
  envDir: '../app',
  plugins: [react()],
}));
