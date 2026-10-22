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
export const img = (s: unknown): string => (typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '');
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
  images?: { src: string; caption?: string }[];
  certifications?: { name: string; issuer?: string; status: string; number?: string; expires?: string }[];
}
export interface ProductRow {
  listing_id: string; profile_id: string; supply_status: string | null; supply_updated_on: string | null;
  snapshot: { name: string; description?: string; specification?: string; crop?: string; unit?: string; season?: string; price_note?: string; min_order?: string; trace_code?: string; images?: { src: string; caption?: string }[];
    price_from?: number | string | null; category_id?: string | null; category_slug?: string; category_name?: string; certifications?: { name: string; status: string }[] };
}
export interface DirRow { profile_id: string; slug: string; display_name: string; province: string | null; district: string | null; description: string | null; is_priority: boolean }

export const place = (p: { province?: string | null; district?: string | null; commune?: string | null }) => [p.commune, p.district, p.province].filter(Boolean).join(', ');

export function supplyPill(status: string | null | undefined): string {
  if (!status) return '';
  return `<span class="pill ${status === 'available' ? 'ok' : ''}">${esc(SUPPLY_LABEL[status] ?? status)}</span>`;
}

/** Thẻ cơ sở dùng ở trang chủ và danh bạ */
export function profileCard(d: DirRow, snap: ProfileSnap | undefined, products: ProductRow[]): string {
  const cover = img(snap?.images?.[0]?.src);
  const prods = products.slice(0, 3).map((p) => `<span class="chip">${esc(p.snapshot.name)}</span>`).join('');
  return `<a class="card" href="/co-so/${encodeURIComponent(d.slug)}">
    ${cover ? `<img class="cover" src="${cover}" alt="" loading="lazy" />` : '<div class="cover ph">🌾</div>'}
    <div class="body">
      <h3>${esc(d.display_name)}${d.is_priority ? ' <span class="pill pri" title="Cơ sở dùng gói dịch vụ có ưu tiên hiển thị">Ưu tiên</span>' : ''}</h3>
      ${snap?.tagline ? `<p class="tag">${esc(snap.tagline)}</p>` : ''}
      <p class="muted">📍 ${esc([d.district, d.province].filter(Boolean).join(', ') || 'Việt Nam')}</p>
      <div class="chips">${prods}</div>
    </div></a>`;
}

export async function loadDirectory(): Promise<{ rows: DirRow[]; snaps: Map<string, ProfileSnap>; prods: Map<string, ProductRow[]> }> {
  if (!sb) throw new Error('Website chưa được cấu hình kết nối dữ liệu.');
  const { data: rows, error } = await sb.from('public_directory')
    .select('profile_id, slug, display_name, province, district, description, is_priority')
    .order('is_priority', { ascending: false }).order('rank_score', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as DirRow[];
  const ids = list.map((r) => r.profile_id);
  const snaps = new Map<string, ProfileSnap>();
  const prods = new Map<string, ProductRow[]>();
  if (ids.length > 0) {
    const [p, q] = await Promise.all([
      sb.from('public_profiles').select('profile_id, snapshot').in('profile_id', ids),
      sb.from('public_products').select('listing_id, profile_id, supply_status, supply_updated_on, snapshot').in('profile_id', ids).eq('is_visible', true),
    ]);
    for (const r of (p.data ?? []) as { profile_id: string; snapshot: ProfileSnap }[]) snaps.set(r.profile_id, r.snapshot);
    for (const r of (q.data ?? []) as ProductRow[]) { const a = prods.get(r.profile_id) ?? []; a.push(r); prods.set(r.profile_id, a); }
  }
  return { rows: list, snaps, prods };
}
