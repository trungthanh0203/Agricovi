import { useEffect, useState } from 'react';
import { newsSections, NEWS_CHANNEL_HREF } from '@agriconnect/shared';
import { supabase } from '@agriconnect/admin-kit';

// Bộ chọn trang đích cho menu, chân trang, banner: chọn trong danh sách thay vì gõ đường dẫn (tránh sai chính tả, liên kết hỏng).
export interface Dest { href: string; label: string }
export interface DestGroup { title: string; items: Dest[] }

const FEATURES: Dest[] = [
  { href: '/', label: 'Trang chủ' }, { href: '/danh-ba/', label: 'Danh bạ nhà cung cấp' }, { href: '/vat-tu/', label: 'Vật tư nông nghiệp' },
  { href: '/giao-thuong/', label: 'Giao thương' }, { href: '/giao-thuong/ket-qua/', label: 'Kết quả giao thương' },
  { href: '/danh-cho-nguoi-ban', label: 'Dành cho người bán' }, { href: '/danh-cho-nguoi-mua', label: 'Dành cho người mua' },
  { href: '/gia-nong-san/', label: 'Giá nông sản tham khảo' }, { href: '/lich-mua-vu/', label: 'Lịch mùa vụ' }, { href: '/truyxuat/', label: 'Truy xuất nguồn gốc' },
  { href: '/lien-he', label: 'Liên hệ' }, { href: '/tim-kiem/', label: 'Tìm kiếm' }, { href: '/dang-ky/', label: 'Đăng ký tài khoản' }, { href: '/dang-nhap/', label: 'Đăng nhập' },
];
const CHANNELS: [keyof typeof NEWS_CHANNEL_HREF, string][] = [['nong_nghiep', 'Tin nông nghiệp'], ['xuat_khau', 'Tin xuất khẩu'], ['hoi_cho', 'Tin hội chợ']];

let cache: Promise<DestGroup[]> | null = null;
function load(): Promise<DestGroup[]> {
  cache ??= (async () => {
    const news: Dest[] = CHANNELS.flatMap(([ch, name]) => [{ href: NEWS_CHANNEL_HREF[ch], label: name }, ...newsSections(ch).map((s) => ({ href: `${NEWS_CHANNEL_HREF[ch]}${s.slug}/`, label: `${name} › ${s.label}` }))]);
    const [pages, cats] = await Promise.all([
      supabase!.from('site_pages').select('slug, title').order('title'),
      supabase!.from('product_categories').select('slug, name').eq('is_active', true).order('sort_order'),
    ]);
    return [
      { title: 'Trang chức năng', items: FEATURES },
      { title: 'Tin tức', items: news },
      { title: 'Trang tĩnh (Giới thiệu, Chính sách…)', items: (pages.data ?? []).map((p) => ({ href: `/${p.slug as string}`, label: p.title as string })) },
      { title: 'Danh mục sản phẩm / vật tư', items: (cats.data ?? []).map((c) => ({ href: `/danh-muc/${c.slug as string}/`, label: c.name as string })) },
    ].filter((g) => g.items.length > 0);
  })().catch(() => { cache = null; return [{ title: 'Trang chức năng', items: FEATURES }]; });
  return cache;
}
export function useDests(): DestGroup[] {
  const [g, setG] = useState<DestGroup[]>([{ title: 'Trang chức năng', items: FEATURES }]);
  useEffect(() => { let on = true; void load().then((x) => { if (on) setG(x); }); return () => { on = false; }; }, []);
  return g;
}

const CUSTOM = '__custom';
/** Chọn trang đích; chọn "Địa chỉ khác" để gõ đường dẫn riêng (/… hoặc https://…). onPick báo thêm tên trang để tự điền nhãn. */
export function LinkSelect({ value, onChange, onPick, disabled }: { value: string; onChange: (href: string) => void; onPick?: (d: Dest) => void; disabled?: boolean }) {
  const groups = useDests();
  const all = groups.flatMap((g) => g.items);
  const known = all.some((d) => d.href === value);
  const [custom, setCustom] = useState(false);
  const showCustom = custom || (!!value && !known);
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <select disabled={disabled} value={showCustom ? CUSTOM : value} onChange={(e) => {
        if (e.target.value === CUSTOM) { setCustom(true); return; }
        setCustom(false); onChange(e.target.value); const d = all.find((x) => x.href === e.target.value); if (d) onPick?.(d);
      }}>
        <option value="">— Chọn trang —</option>
        {groups.map((g) => <optgroup key={g.title} label={g.title}>{g.items.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup>)}
        <option value={CUSTOM}>Địa chỉ khác…</option>
      </select>
      {showCustom && <input disabled={disabled} value={value} placeholder="/duong-dan hoặc https://…" style={{ minWidth: 200 }} onChange={(e) => onChange(e.target.value.trim())} />}
    </span>
  );
}
