import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// W0 (D60): website dựng phía máy chủ trên Cloudflare Workers để công cụ tìm kiếm và Zalo/Facebook đọc được nội dung.
// Trang công khai gửi Cache-Control cho bộ nhớ đệm biên; phần riêng của người dùng (sau này) chỉ tải ở trình duyệt.
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  session: false,
});
