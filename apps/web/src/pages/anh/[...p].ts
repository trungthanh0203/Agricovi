import type { APIRoute } from 'astro';
import { sb } from '../../lib/db';

/**
 * Phục vụ ảnh công khai (W8, D71). Ảnh đang lưu dạng data URL trong CSDL; trang không nhúng ảnh vào HTML mà trỏ về đây để:
 * trình duyệt/biên Cloudflare lưu đệm riêng từng ảnh, HTML nhẹ, danh sách không phải tải nội dung ảnh.
 * Đường dẫn: /anh/sp/<mã sản phẩm>/<số thứ tự> · /anh/cs/<mã hồ sơ>/<số thứ tự> · /anh/vt/<mã vật tư> · /anh/bv/<mã bài viết> · /anh/bn/<mã banner>.
 * Chỉ trả ảnh jpeg/png/webp đúng định dạng; dữ liệu đọc bằng khóa anon nên vẫn chịu chính sách RLS (chỉ nội dung đã đăng).
 */
export const prerender = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATA = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function notFound(): Response {
  return new Response('Không tìm thấy ảnh', { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60', 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function load(kind: string, id: string, idx: number): Promise<string | null> {
  if (!sb) return null;
  if (kind === 'sp' || kind === 'cs') {
    const table = kind === 'sp' ? 'public_products' : 'public_profiles';
    const col = kind === 'sp' ? 'listing_id' : 'profile_id';
    const { data } = await sb.from(table).select(`src:snapshot->images->${idx}->>src`).eq(col, id).eq('is_visible', true).maybeSingle();
    return ((data as { src?: string | null } | null)?.src) ?? null;
  }
  const table = kind === 'vt' ? 'site_materials' : kind === 'bv' ? 'site_articles' : kind === 'bn' ? 'site_banners' : null;
  if (!table) return null;
  const { data } = await sb.from(table).select('image').eq('id', id).maybeSingle();
  return ((data as { image?: string | null } | null)?.image) ?? null;
}

// Mã băm nhanh để làm ETag (đổi ảnh thì đổi mã)
function etagOf(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `"${s.length.toString(36)}-${(h >>> 0).toString(36)}"`;
}

export const GET: APIRoute = async ({ params, request }) => {
  const parts = (params.p ?? '').split('/').filter(Boolean);
  const [kind, id, n] = parts;
  const idx = n === undefined ? 0 : Number(n);
  if (!kind || !id || !UUID.test(id) || !Number.isInteger(idx) || idx < 0 || idx > 9 || parts.length > 3) return notFound();
  let src: string | null = null;
  try { src = await load(kind, id, idx); } catch { return new Response('Tạm thời chưa tải được ảnh', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const m = src ? DATA.exec(src) : null;
  if (!m) return notFound();
  const etag = etagOf(m[2]!);
  const headers = new Headers({
    'Content-Type': `image/${m[1]}`, 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400', ETag: etag,
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { status: 200, headers });
};
