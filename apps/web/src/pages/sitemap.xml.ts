import type { APIRoute } from 'astro';
import { DEFAULT_PAGES } from '@agriconnect/shared';
import { localizePath } from '@agriconnect/shared/src/i18n';
import { loadArticles, loadCategories, loadMaterials, loadProducts, loadShops } from '../lib/catalog';
import { loadDirectory, sb } from '../lib/db';

// Sơ đồ trang cho công cụ tìm kiếm: trang tĩnh, danh mục, sản phẩm, vật tư, bài viết, nhà cung cấp; mỗi trang có cả bản tiếng Việt và tiếng Anh (/en/…).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const paths = new Set<string>(['/', '/danh-ba/', '/gia-nong-san/', '/lich-mua-vu/', '/vat-tu/', '/truyxuat/', '/tin-nong-nghiep/', '/tin-xuat-khau/', '/tin-hoi-cho/']);
  for (const slug of Object.keys(DEFAULT_PAGES)) paths.add(`/${slug}`);
  try {
    if (sb) {
      const { data } = await sb.from('site_pages').select('slug').eq('status', 'published');
      for (const r of (data ?? []) as { slug: string }[]) paths.add(`/${r.slug}`);
    }
    for (const c of await loadCategories()) if (!c.restricted) paths.add(`/danh-muc/${c.slug}/`);
    for (const p of await loadProducts()) paths.add(`/san-pham/${p.id}`);
    for (const m of await loadMaterials()) paths.add(`/vat-tu/${m.slug}`);
    for (const a of await loadArticles()) paths.add(`/bai-viet/${a.slug}`);
    for (const sh of await loadShops()) paths.add(`/gian-hang-vat-tu/${sh.slug}`);
    for (const d of (await loadDirectory()).rows) paths.add(`/co-so/${encodeURIComponent(d.slug)}`);
  } catch { /* trả phần đã có */ }
  const entries = [...paths].map((p) => {
    const vi = esc(origin + p);
    const en = esc(origin + localizePath(p, 'en'));
    const alt = `<xhtml:link rel="alternate" hreflang="vi" href="${vi}"/><xhtml:link rel="alternate" hreflang="en" href="${en}"/>`;
    return `  <url><loc>${vi}</loc>${alt}</url>\n  <url><loc>${en}</loc>${alt}</url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=600' } });
};
