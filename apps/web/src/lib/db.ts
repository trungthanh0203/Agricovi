import { createClient } from '@supabase/supabase-js';

/**
 * Website công khai: CHỈ đọc bảng/view public_* bằng khóa anon (FR-WEB-007, FR-WEB-017). Không đọc bảng nội bộ.
 * Trang tĩnh, dữ liệu tải ở trình duyệt nên luôn mới (không cần build lại khi có hồ sơ/vụ mới).
 */
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const sb = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Mọi chữ do người dùng nhập phải qua hàm này trước khi đưa vào HTML */
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]!);
/** Chỉ nhận ảnh nhúng dạng data:image */
export const img = (s: unknown): string => (typeof s === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^\/anh\/(sp|cs|vt|bv|bn)\/[0-9a-f-]{36}(\/\d)?$/.test(s)) ? s : '');
/** Bản "nhẹ" của hồ sơ/sản phẩm (view *_lite) chỉ có chú thích + cờ ok; đổi thành đường dẫn ảnh /anh/<loại>/<mã>/<thứ tự> */
export function withImageUrls<T extends { images?: { src?: string; ok?: boolean; caption?: string }[] }>(snap: T, kind: 'sp' | 'cs', id: string): T {
  const images = (snap.images ?? []).map((i, n) => (i.ok ? { src: `/anh/${kind}/${id}/${n}`, caption: i.caption } : null)).filter((x): x is { src: string; caption: string | undefined } => x !== null);
  return { ...snap, images } as T;
}
export const link = (s: unknown): string => (typeof s === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '');
export const fmtDate = (d: string | null | undefined): string => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

export const SUPPLY_LABEL: Record<string, string> = {
  producing: 'Đang sản xuất', expected: 'Dự kiến có hàng', available: 'Đang có hàng', out_of_stock: 'Hết hàng', paused: 'Tạm ngừng',
};
export const CERT_LABEL: Record<string, string> = {
  self_declared: 'Tự khai báo (chưa xác minh)', document_received: 'Đã nhận tài liệu', document_checked: 'Đã kiểm tra tài liệu', verified: 'Đã xác minh',
};
export const CYCLE_STATUS: Record<string, string> = { planned: 'Dự kiến', active: 'Đang sản xuất', completed: 'Đã kết thúc', closed: 'Đã kết thúc', cancelled: 'Đã hủy' };

export interface ProfileSnap {
  display_name: string; tagline?: string; description?: string; province?: string; district?: string; commune?: string;
  established_year?: number; total_area?: number; area_unit?: string; practices?: string; capacity_note?: string;
  contact?: { phone?: string; email?: string; zalo?: string; website?: string; facebook?: string };
  images?: { src: string; ok?: boolean; caption?: string }[];
  certifications?: { name: string; issuer?: string; status: string; number?: string; expires?: string }[];
}
export interface ProductRow {
  listing_id: string; profile_id: string; supply_status: string | null; supply_updated_on: string | null;
  snapshot: { name: string; description?: string; specification?: string; crop?: string; unit?: string; season?: string; price_note?: string; min_order?: string; trace_code?: string; images?: { src: string; caption?: string }[];
    price_from?: number | string | null; category_id?: string | null; category_slug?: string; category_name?: string; certifications?: { name: string; status: string }[] };
}
export const BADGE_LABEL: Record<string, string> = {
  profile: 'Hồ sơ đã được kiểm duyệt', docs: 'Có giấy tờ đã được kiểm tra', trace: 'Có truy xuất nguồn gốc', deals: 'Giao dịch thực tế tốt', rating: 'Khách đánh giá cao',
};
export const BADGE_LEVEL: Record<number, string> = { 1: 'Cơ bản', 2: 'Tin cậy', 3: 'Rất tin cậy' };
export interface Badge { level: number; badges: string[] }
export interface DirRow { profile_id: string; slug: string; display_name: string; province: string | null; district: string | null; description: string | null; is_priority: boolean }

export const place = (p: { province?: string | null; district?: string | null; commune?: string | null }) => [p.commune, p.district, p.province].filter(Boolean).join(', ');

export function supplyPill(status: string | null | undefined): string {
  if (!status) return '';
  return `<span class="pill ${status === 'available' ? 'ok' : ''}">${esc(SUPPLY_LABEL[status] ?? status)}</span>`;
}

/** Thẻ cơ sở dùng ở trang chủ và danh bạ */
export function profileCard(d: DirRow, snap: ProfileSnap | undefined, products: ProductRow[], badge?: Badge): string {
  const cover = img(snap?.images?.[0]?.src);
  const prods = products.slice(0, 3).map((p) => `<span class="chip">${esc(p.snapshot.name)}</span>`).join('');
  return `<a class="card" href="/co-so/${encodeURIComponent(d.slug)}">
    ${cover ? `<img class="cover" src="${cover}" alt="" loading="lazy" />` : '<div class="cover ph">🌾</div>'}
    <div class="body">
      <h3>${esc(d.display_name)}${d.is_priority ? ' <span class="pill pri" title="Cơ sở dùng gói dịch vụ có ưu tiên hiển thị">Ưu tiên</span>' : ''}</h3>
      ${snap?.tagline ? `<p class="tag">${esc(snap.tagline)}</p>` : ''}
      ${badge && badge.level >= 2 ? `<p><span class="pill ok" title="${esc(badge.badges.map((b) => BADGE_LABEL[b] ?? b).join(' · '))}">✔ ${esc(BADGE_LEVEL[badge.level] ?? '')}</span></p>` : ''}
      <p class="muted">📍 ${esc([d.district, d.province].filter(Boolean).join(', ') || 'Việt Nam')}</p>
      <div class="chips">${prods}</div>
    </div></a>`;
}

export async function loadDirectory(): Promise<{ rows: DirRow[]; snaps: Map<string, ProfileSnap>; prods: Map<string, ProductRow[]>; badges: Map<string, Badge> }> {
  if (!sb) throw new Error('Website chưa được cấu hình kết nối dữ liệu.');
  const { data: rows, error } = await sb.from('public_directory')
    .select('profile_id, slug, display_name, province, district, description, is_priority')
    .order('is_priority', { ascending: false }).order('rank_score', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as DirRow[];
  const ids = list.map((r) => r.profile_id);
  const snaps = new Map<string, ProfileSnap>();
  const prods = new Map<string, ProductRow[]>();
  const badges = new Map<string, Badge>();
  if (ids.length > 0) {
    const [p, q, b] = await Promise.all([
      sb.from('public_profiles_lite').select('profile_id, snapshot').in('profile_id', ids),
      sb.from('public_products_lite').select('listing_id, profile_id, supply_status, supply_updated_on, snapshot').in('profile_id', ids),
      sb.from('public_profile_badges').select('profile_id, level, badges').in('profile_id', ids),
    ]);
    for (const r of (b.data ?? []) as { profile_id: string; level: number; badges: string[] }[]) badges.set(r.profile_id, { level: r.level, badges: r.badges });
    for (const r of (p.data ?? []) as { profile_id: string; snapshot: ProfileSnap }[]) snaps.set(r.profile_id, withImageUrls(r.snapshot, 'cs', r.profile_id));
    for (const r of (q.data ?? []) as ProductRow[]) { r.snapshot = withImageUrls(r.snapshot, 'sp', r.listing_id); const a = prods.get(r.profile_id) ?? []; a.push(r); prods.set(r.profile_id, a); }
  }
  return { rows: list, snaps, prods, badges };
}
