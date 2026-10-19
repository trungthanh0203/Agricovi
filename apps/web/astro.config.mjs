import { defineConfig } from 'astro/config';

// Giai đoạn khung: build tĩnh, đủ để host trên Cloudflare Pages.
// Khi cần trang động theo dữ liệu (danh bạ, tìm kiếm) sẽ thêm adapter @astrojs/cloudflare (backlog E5-S8).
export default defineConfig({
  output: 'static',
});
