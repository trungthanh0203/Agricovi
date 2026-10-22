import {
  DEFAULT_ABOUT_MENU, DEFAULT_FOOTER_COLS, DEFAULT_HEADER_NAV, DEFAULT_HOME_BLOCKS, DEFAULT_SETTINGS, normalizeHomeBlocks, safeHref,
  type HomeBlock, type SiteFooterCol, type SiteLink, type SiteNavItem, type SiteSettings,
} from '@agriconnect/shared';
import { sb, img } from './db';

/**
 * Nội dung "khung" của website (menu, chân trang, cài đặt, banner) lấy từ CMS (migration 0042).
 * Luôn có giá trị mặc định: chưa chạy migration, CSDL chậm hoặc lỗi thì website vẫn hiển thị đầy đủ.
 * Lưu đệm trong bộ nhớ của Worker ~60 giây để không gọi CSDL ở mỗi lượt xem.
 */
export interface Banner { id: string; slot: 'hero' | 'side'; title: string; subtitle: string; image: string; link: string }
export interface SiteChrome { settings: SiteSettings; header: SiteNavItem[]; about: SiteLink[]; footer: SiteFooterCol[]; banners: Banner[]; home: HomeBlock[] }

const TTL_MS = 60_000;
let cached: { at: number; value: SiteChrome } | null = null;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanLink(v: unknown): SiteLink | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const label = str(o.label, 80);
  const href = safeHref(typeof o.href === 'string' ? o.href : '');
  return label && href ? { label, href } : null;
}
function cleanNav(items: unknown): SiteNavItem[] {
  if (!Array.isArray(items)) return [];
  const out: SiteNavItem[] = [];
  for (const it of items.slice(0, 12)) {
    const base = cleanLink(it);
    if (!base) continue;
    const kids = Array.isArray((it as { children?: unknown }).children)
      ? ((it as { children: unknown[] }).children.slice(0, 12).map(cleanLink).filter((x): x is SiteLink => x !== null)) : [];
    out.push(kids.length ? { ...base, children: kids } : base);
  }
  return out;
}
function cleanFooter(items: unknown): SiteFooterCol[] {
  if (!Array.isArray(items)) return [];
  const out: SiteFooterCol[] = [];
  for (const it of items.slice(0, 4)) {
    const title = str((it as { title?: unknown }).title, 60);
    const links = Array.isArray((it as { links?: unknown }).links)
      ? ((it as { links: unknown[] }).links.slice(0, 12).map(cleanLink).filter((x): x is SiteLink => x !== null)) : [];
    if (title && links.length) out.push({ title, links });
  }
  return out;
}
function cleanSettings(rows: { key: string; value: unknown }[]): SiteSettings {
  const s: SiteSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as SiteSettings;
  for (const r of rows) {
    const o = (r.value ?? {}) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) { const t = str(v, 400); if (t) clean[k] = t; }
    if (r.key === 'brand') s.brand = { ...s.brand, ...clean };
    else if (r.key === 'contact') s.contact = { ...s.contact, ...clean };
    else if (r.key === 'social') s.social = { ...s.social, ...clean };
    else if (r.key === 'legal') s.legal = { ...s.legal, ...clean };
  }
  return s;
}

function timeout<T>(p: PromiseLike<T>, ms = 2500): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function loadChrome(): Promise<SiteChrome> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value: SiteChrome = { settings: DEFAULT_SETTINGS, header: DEFAULT_HEADER_NAV, about: DEFAULT_ABOUT_MENU, footer: DEFAULT_FOOTER_COLS, banners: [], home: DEFAULT_HOME_BLOCKS };
  if (sb) {
    try {
      const [m, s, b] = await timeout(Promise.all([
        sb.from('site_menus').select('key, items'),
        sb.from('site_settings').select('key, value'),
        sb.from('site_banners').select('id, slot, title, subtitle, image, link, sort_order').order('sort_order').order('created_at', { ascending: false }).limit(20),
      ]));
      if (!m.error) {
        for (const r of (m.data ?? []) as { key: string; items: unknown }[]) {
          if (r.key === 'header_nav') { const n = cleanNav(r.items); if (n.length) value.header = n; }
          else if (r.key === 'about_menu') { const n = cleanNav(r.items); if (n.length) value.about = n; }
          else if (r.key === 'footer_cols') { const n = cleanFooter(r.items); if (n.length) value.footer = n; }
        }
      }
      if (!s.error) {
        const rows = (s.data ?? []) as { key: string; value: unknown }[];
        value.settings = cleanSettings(rows.filter((r) => r.key !== 'home'));
        const home = rows.find((r) => r.key === 'home');
        if (home) value.home = normalizeHomeBlocks((home.value as { blocks?: unknown } | null)?.blocks);
      }
      if (!b.error) {
        value.banners = ((b.data ?? []) as { id: string; slot: string; title: string; subtitle: string | null; image: string | null; link: string | null }[])
          .filter((x) => x.slot === 'hero' || x.slot === 'side')
          .map((x) => ({ id: x.id, slot: x.slot as 'hero' | 'side', title: x.title, subtitle: x.subtitle ?? '', image: img(x.image), link: safeHref(x.link) }));
      }
    } catch {
      // giữ mặc định; không lưu đệm lâu khi lỗi
      cached = { at: Date.now() - TTL_MS + 10_000, value };
      return value;
    }
  }
  cached = { at: Date.now(), value };
  return value;
}

export interface SitePage { title: string; description: string; body: string }
/** Trang tĩnh đã đăng trong CSDL; null nếu không có hoặc lỗi (khi đó dùng nội dung mặc định) */
export async function loadPage(slug: string): Promise<SitePage | null> {
  if (!sb) return null;
  try {
    const { data, error } = await timeout(sb.from('site_pages').select('title, description, body').eq('slug', slug).eq('status', 'published').maybeSingle());
    if (error || !data) return null;
    return { title: data.title as string, description: (data.description as string | null) ?? '', body: data.body as string };
  } catch { return null; }
}
