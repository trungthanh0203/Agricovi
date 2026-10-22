import { DEFAULT_CATEGORIES, safeHref } from '@agriconnect/shared';
import { img, loadDirectory, sb, SUPPLY_LABEL } from './db';

/**
 * Dữ liệu danh mục, sản phẩm của nhà cung cấp, vật tư và bài viết cho website (W2). Chỉ đọc nội dung công khai.
 * Luôn có giá trị dự phòng: bảng chưa có (chưa chạy migration 0043) hoặc CSDL chậm thì trang vẫn hiển thị.
 */
export interface Cat { id: string; parent_id: string | null; slug: string; name: string; branch: string; sort_order: number; restricted: boolean; description?: string | null }

const TTL = 60_000;
const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  try {
    const v = await Promise.race([fn(), new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500))]);
    memo.set(key, { at: Date.now(), v });
    return v;
  } catch {
    memo.set(key, { at: Date.now() - TTL + 8_000, v: fallback });
    return fallback;
  }
}

const FALLBACK_CATS: Cat[] = DEFAULT_CATEGORIES.map((c, i) => ({
  id: 'fb' + i, parent_id: null, slug: c.href.split('/').filter(Boolean)[1] ?? '', name: c.label, sort_order: i, restricted: false,
  branch: i < 4 ? 'nong_san' : i === 4 ? 'giong' : i === 5 ? 'vat_tu' : 'phu_kien',
}));

export const loadCategories = (): Promise<Cat[]> => cached('cats', async () => {
  if (!sb) return FALLBACK_CATS;
  const { data, error } = await sb.from('product_categories').select('id, parent_id, slug, name, branch, sort_order, restricted, description').order('sort_order').order('name');
  if (error || !data || data.length === 0) return FALLBACK_CATS;
  return data as Cat[];
}, FALLBACK_CATS);

export function catTree(cats: Cat[]) {
  const top = cats.filter((c) => !c.parent_id);
  const kids = new Map<string, Cat[]>();
  for (const c of cats) if (c.parent_id) kids.set(c.parent_id, [...(kids.get(c.parent_id) ?? []), c]);
  return { top, kids };
}
/** Mã danh mục và mọi danh mục con (nhiều cấp) */
export function descendantIds(cats: Cat[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats) if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}
export const catHref = (c: Cat) => `/danh-muc/${c.slug}/`;
export function catTrail(cats: Cat[], c: Cat): Cat[] {
  const trail: Cat[] = [c];
  let cur = c;
  for (let i = 0; i < 5 && cur.parent_id; i++) { const p = cats.find((x) => x.id === cur.parent_id); if (!p) break; trail.unshift(p); cur = p; }
  return trail;
}

// ------------------------------------------------------------------ sản phẩm của nhà cung cấp
export interface ProductItem {
  id: string; name: string; unit: string; priceFrom: number | null; priceNote: string; image: string; supply: string; supplyLabel: string;
  supplier: string; supplierSlug: string; profileId: string; province: string; categoryId: string | null; categorySlug: string; crop: string; trace: string;
  minOrder: string; season: string; spec: string; description: string; images: string[]; certs: { name: string; status: string }[]; updated: string;
}

export const loadProducts = (): Promise<ProductItem[]> => cached('products', async () => {
  const { rows, snaps, prods } = await loadDirectory();
  const byId = new Map(rows.map((r) => [r.profile_id, r]));
  const out: ProductItem[] = [];
  for (const [pid, list] of prods) {
    const d = byId.get(pid);
    if (!d) continue;
    for (const p of list) {
      const s = p.snapshot;
      const images = (s.images ?? []).map((i) => img(i.src)).filter(Boolean);
      out.push({
        id: p.listing_id, name: s.name, unit: s.unit ?? '', priceFrom: s.price_from == null ? null : Number(s.price_from), priceNote: s.price_note ?? '',
        image: images[0] ?? '', supply: p.supply_status ?? '', supplyLabel: p.supply_status ? SUPPLY_LABEL[p.supply_status] ?? '' : '',
        supplier: d.display_name, supplierSlug: d.slug, profileId: pid, province: d.province ?? '', categoryId: s.category_id ?? null, categorySlug: s.category_slug ?? '',
        crop: s.crop ?? '', trace: s.trace_code ?? '', minOrder: s.min_order ?? '', season: s.season ?? '', spec: s.specification ?? '', description: s.description ?? '',
        images, certs: (s.certifications ?? []).map((c) => ({ name: c.name, status: c.status })), updated: p.supply_updated_on ?? '',
      });
    }
  }
  void snaps;
  return out;
}, [] as ProductItem[]);
export const fmtVnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
/** "Từ 40.000đ/kg", hoặc giá chữ của nhà cung cấp, hoặc "Liên hệ báo giá" */
export function priceText(priceFrom: number | null, priceNote: string, unit: string): string {
  if (priceFrom != null && priceFrom > 0) return `Từ ${fmtVnd(priceFrom)}${unit ? '/' + unit : ''}`;
  return priceNote || 'Liên hệ báo giá';
}

// ------------------------------------------------------------------ vật tư (quản trị viên nhập)
export interface Material {
  id: string; slug: string; name: string; brand: string; summary: string; ingredients: string; usage: string; safety: string; unit: string;
  priceFrom: number | null; priceNote: string; distributor: string; image: string; categoryId: string | null;
}
const MAT_COLS = 'id, slug, name, brand, summary, ingredients, usage, safety, unit, price_from, price_note, distributor, image, category_id';
function toMaterial(r: Record<string, unknown>): Material {
  const t = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  return { id: t('id'), slug: t('slug'), name: t('name'), brand: t('brand'), summary: t('summary'), ingredients: t('ingredients'), usage: t('usage'), safety: t('safety'), unit: t('unit'),
    priceFrom: r.price_from == null ? null : Number(r.price_from), priceNote: t('price_note'), distributor: t('distributor'), image: img(r.image), categoryId: (r.category_id as string | null) ?? null };
}
export const loadMaterials = (): Promise<Material[]> => cached('materials', async () => {
  if (!sb) return [];
  const { data, error } = await sb.from('site_materials').select(MAT_COLS).eq('status', 'published').order('sort_order').order('name').limit(500);
  if (error) return [];
  return (data ?? []).map((r) => toMaterial(r as Record<string, unknown>));
}, [] as Material[]);

// ------------------------------------------------------------------ bài viết, tin hội chợ
export interface Article {
  id: string; channel: 'nong_nghiep' | 'xuat_khau' | 'hoi_cho'; section: string; slug: string; title: string; summary: string; body: string; image: string;
  sourceName: string; sourceUrl: string; start: string; end: string; place: string; organizer: string; publishedAt: string;
}
const ART_COLS = 'id, channel, section, slug, title, summary, body, image, source_name, source_url, event_start, event_end, event_place, event_organizer, published_at';
export function toArticle(r: Record<string, unknown>): Article {
  const t = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  return { id: t('id'), channel: r.channel as Article['channel'], section: t('section'), slug: t('slug'), title: t('title'), summary: t('summary'), body: t('body'), image: img(r.image),
    sourceName: t('source_name'), sourceUrl: safeHref(t('source_url')), start: t('event_start'), end: t('event_end'), place: t('event_place'), organizer: t('event_organizer'), publishedAt: t('published_at') };
}
/** Bài đã đăng (không kèm thân bài để danh sách nhẹ), mới nhất trước */
export const loadArticles = (): Promise<Article[]> => cached('articles', async () => {
  if (!sb) return [];
  const { data, error } = await sb.from('site_articles').select(ART_COLS.replace(' body,', '')).eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(300);
  if (error) return [];
  return (data ?? []).map((r) => toArticle(r as Record<string, unknown>));
}, [] as Article[]);
export async function loadArticle(slug: string): Promise<Article | null> {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('site_articles').select(ART_COLS).eq('slug', slug).eq('status', 'published').maybeSingle();
    return error || !data ? null : toArticle(data as Record<string, unknown>);
  } catch { return null; }
}
export async function loadMaterial(slug: string): Promise<Material | null> {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('site_materials').select(MAT_COLS).eq('slug', slug).eq('status', 'published').maybeSingle();
    return error || !data ? null : toMaterial(data as Record<string, unknown>);
  } catch { return null; }
}

export const fmtDay = (d: string) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('vi-VN') : '');
export const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // ngày hiện tại theo giờ Việt Nam
