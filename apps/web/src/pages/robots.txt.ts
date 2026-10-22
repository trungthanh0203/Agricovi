import type { APIRoute } from 'astro';

// Trang riêng tư/kết quả động không cần công cụ tìm kiếm lập chỉ mục (cả bản /en/)
export const GET: APIRoute = ({ url }) => new Response(
  `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /bao-gia/\nDisallow: /tim-kiem/\nDisallow: /en/bao-gia/\nDisallow: /en/tim-kiem/\n\nSitemap: ${url.origin}/sitemap.xml\n`,
  { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' } },
);
