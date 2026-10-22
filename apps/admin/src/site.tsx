import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_ABOUT_MENU, DEFAULT_FOOTER_COLS, DEFAULT_HEADER_NAV, DEFAULT_PAGES, DEFAULT_SETTINGS, parseBody, safeHref,
  type SiteFooterCol, type SiteLink, type SiteNavItem, type SiteSettings,
} from '@agriconnect/shared';
import { Err, useLoad } from './pages';
import { clean, fmtDateTime, rpc, supabase } from './supabase';

/**
 * Quản trị nội dung website (W1, D60–D61): trang tĩnh, banner, menu, thông tin chung, người biên tập.
 * Quyền thật do CSDL ép (migration 0042); giao diện chỉ ẩn bớt nút cho gọn.
 * Biên tập viên chỉ soạn nháp/gửi duyệt; đăng, gỡ, sửa bản đã đăng, menu và thông tin chung cần tổng biên tập hoặc quản trị viên.
 */
const STATUS_LABEL: Record<string, string> = { draft: 'Nháp', review: 'Chờ duyệt', published: 'Đã đăng', hidden: 'Đã gỡ' };
const STATUS_CLS: Record<string, string> = { draft: '', review: 'info', published: 'ok', hidden: 'warn' };
const SiteBadge = ({ s }: { s: string }) => <span className={`badge ${STATUS_CLS[s] ?? ''}`}>{STATUS_LABEL[s] ?? s}</span>;

export const canPublish = (roles: string[]) => roles.includes('admin') || roles.includes('chief_editor');
const statusOptions = (roles: string[]) => (canPublish(roles) ? ['draft', 'review', 'published', 'hidden'] : ['draft', 'review']);

const SITE_URL = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}).VITE_PUBLIC_SITE_URL;

/** Chỉ tổng biên tập/quản trị đổi được bản đã đăng */
const locked = (roles: string[], status: string | undefined) => !canPublish(roles) && (status === 'published' || status === 'hidden');

// ============================================================ Trang tĩnh
interface PageRow { id: string; slug: string; title: string; description: string | null; body: string; status: string; version: number; updated_at: string }
interface VersionRow { version: number; title: string; body: string; saved_at: string }
interface PageForm { id: string | null; version: number | null; slug: string; title: string; description: string; body: string; status: string }
const emptyPage: PageForm = { id: null, version: null, slug: '', title: '', description: '', body: '', status: 'draft' };

export function SitePagesPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('site_pages').select('id, slug, title, description, body, status, version, updated_at').order('updated_at', { ascending: false });
    if (e) throw new Error(e.message);
    return (rows ?? []) as PageRow[];
  });
  const [f, setF] = useState<PageForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  async function open(p: PageRow | PageForm) {
    setErr(null); setMsg(null); setVersions([]);
    if ('updated_at' in p) {
      setF({ id: p.id, version: p.version, slug: p.slug, title: p.title, description: p.description ?? '', body: p.body, status: p.status });
      const { data: v } = await supabase!.from('site_page_versions').select('version, title, body, saved_at').eq('page_id', p.id).order('version', { ascending: false }).limit(20);
      setVersions((v ?? []) as VersionRow[]);
    } else setF(p);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr(null); setMsg(null);
    try {
      await rpc('site_save_page', { p_id: f.id, p_slug: f.slug, p_title: f.title, p_description: f.description, p_body: f.body, p_status: f.status, p_version: f.version });
      setMsg(f.status === 'published' ? 'Đã lưu và đăng lên website.' : 'Đã lưu.');
      setF(null);
      reload();
    } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  async function remove() {
    if (!f?.id || !window.confirm('Xóa hẳn trang này? Thao tác không hoàn tác được. Nếu chỉ muốn ẩn, hãy đổi trạng thái thành "Đã gỡ".')) return;
    try { await rpc('site_delete_page', { p_id: f.id }); setF(null); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }

  const existing = new Set((data ?? []).map((p) => p.slug));
  const suggestions = Object.entries(DEFAULT_PAGES).filter(([slug]) => !existing.has(slug));
  const isLocked = f ? locked(roles, (data ?? []).find((p) => p.id === f.id)?.status) : false;
  const blocks = f ? parseBody(f.body) : [];

  return (
    <>
      <Err e={error ?? (f ? null : err)} />{msg && <p className="msg ok" role="status">{msg}</p>}
      {!f && <div className="toolbar"><button className="primary" onClick={() => void open(emptyPage)}>+ Thêm trang</button></div>}
      {f && (
        <section className="card">
          <h2>{f.id ? `Sửa trang: ${f.title}` : 'Thêm trang'}</h2>
          {isLocked && <p className="msg error">Trang đã đăng chỉ tổng biên tập hoặc quản trị viên được sửa.</p>}
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Tiêu đề<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label>Địa chỉ trang (chữ thường không dấu, nối bằng dấu gạch ngang)
              <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.trim().toLowerCase() })} placeholder="vi-du: gioi-thieu" />
              <small>Trang sẽ ở địa chỉ {SITE_URL ?? 'website'}/{f.slug || '…'}</small>
            </label>
            <label>Mô tả ngắn (hiện khi chia sẻ và trên Google)<input value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            <label>Trạng thái
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {statusOptions(roles).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              {!canPublish(roles) && <small>Bạn soạn nháp rồi chọn "Chờ duyệt"; tổng biên tập sẽ đăng.</small>}
            </label>
            <label>Nội dung
              <textarea rows={14} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <small>Cách viết: cách nhau một dòng trống là sang đoạn mới. <code>## Tiêu đề nhỏ</code> · các dòng bắt đầu bằng <code>- </code> là danh sách · một dòng <code>[[Chữ trên nút|/duong-dan]]</code> tạo nút bấm.</small>
            </label>
            <Err e={err} />
            <div className="toolbar">
              <button className="primary" disabled={isLocked}>Lưu</button>
              <button type="button" onClick={() => setF(null)}>Hủy</button>
              {f.id && canPublish(roles) && <button type="button" onClick={() => void remove()}>Xóa trang</button>}
            </div>
          </form>
          <h2>Xem trước</h2>
          <div className="card" style={{ background: 'transparent' }}>
            <h3 style={{ marginTop: 0 }}>{f.title || '(chưa có tiêu đề)'}</h3>
            {blocks.map((b, i) => (b.t === 'h' ? <h4 key={i}>{b.text}</h4>
              : b.t === 'p' ? <p key={i}>{b.text}</p>
              : b.t === 'ul' ? <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
              : <p key={i}><button type="button">{b.label}</button> <small>→ {b.href}</small></p>))}
          </div>
          {versions.length > 0 && (
            <>
              <h2>Các bản cũ</h2>
              <table className="list"><tbody>
                {versions.map((v) => (
                  <tr key={v.version}><td>Bản {v.version}</td><td>{fmtDateTime(v.saved_at)}</td>
                    <td><button type="button" disabled={isLocked} onClick={() => setF({ ...f, title: v.title, body: v.body })}>Dùng lại nội dung này</button></td></tr>))}
              </tbody></table>
            </>
          )}
        </section>
      )}
      {!f && (
        <>
          <table className="list"><thead><tr><th>Trang</th><th>Địa chỉ</th><th>Trạng thái</th><th>Cập nhật</th><th></th></tr></thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}><td><strong>{p.title}</strong></td><td>/{p.slug}</td><td><SiteBadge s={p.status} /></td><td>{fmtDateTime(p.updated_at)}</td>
                  <td className="acts"><button onClick={() => void open(p)}>Sửa</button>
                    {p.status === 'published' && SITE_URL && <a href={`${SITE_URL}/${p.slug}`} target="_blank" rel="noopener noreferrer">Xem</a>}</td></tr>))}
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">Chưa có trang nào. Website đang dùng nội dung mặc định.</td></tr>}
            </tbody></table>
          {suggestions.length > 0 && (
            <section className="card">
              <h2>Trang gợi ý chưa tạo</h2>
              <p className="muted">Website đang hiển thị nội dung mặc định cho các trang này. Bấm "Soạn" để sửa và đăng bản của bạn.</p>
              <table className="list"><tbody>
                {suggestions.map(([slug, d]) => (
                  <tr key={slug}><td><strong>{d.title}</strong></td><td>/{slug}</td>
                    <td><button onClick={() => void open({ ...emptyPage, slug, title: d.title, description: d.description, body: d.body })}>Soạn</button></td></tr>))}
              </tbody></table>
            </section>
          )}
        </>
      )}
    </>
  );
}

// ============================================================ Banner
interface BannerRow { id: string; slot: string; title: string; subtitle: string | null; image: string | null; link: string | null; sort_order: number; starts_at: string | null; ends_at: string | null; status: string; version: number }
interface BannerForm { id: string | null; version: number | null; slot: string; title: string; subtitle: string; image: string; link: string; sort: string; starts: string; ends: string; status: string }
const emptyBanner: BannerForm = { id: null, version: null, slot: 'hero', title: '', subtitle: '', image: '', link: '', sort: '0', starts: '', ends: '', status: 'draft' };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null);

/** Thu nhỏ ảnh banner (cạnh dài tối đa 1400 px), giảm chất lượng dần cho tới khi vừa giới hạn của CSDL */
async function fileToBannerImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không xử lý được ảnh trên thiết bị này.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  for (const q of [0.82, 0.7, 0.58, 0.46]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= 390_000) return url;
  }
  throw new Error('Ảnh quá phức tạp để nén gọn. Hãy chọn ảnh nhỏ hơn hoặc ít chi tiết hơn.');
}

export function SiteBannersPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('site_banners').select('id, slot, title, subtitle, image, link, sort_order, starts_at, ends_at, status, version').order('slot').order('sort_order');
    if (e) throw new Error(e.message);
    return (rows ?? []) as BannerRow[];
  });
  const [f, setF] = useState<BannerForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (b: BannerRow | null) => {
    setErr(null);
    setF(b ? { id: b.id, version: b.version, slot: b.slot, title: b.title, subtitle: b.subtitle ?? '', image: b.image ?? '', link: b.link ?? '', sort: String(b.sort_order), starts: toLocal(b.starts_at), ends: toLocal(b.ends_at), status: b.status } : emptyBanner);
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr(null);
    if (f.link && !safeHref(f.link)) { setErr('Liên kết phải bắt đầu bằng / (trang trong website) hoặc https://.'); return; }
    try {
      await rpc('site_save_banner', { p_id: f.id, p_slot: f.slot, p_title: f.title, p_subtitle: f.subtitle, p_image: f.image, p_link: f.link, p_sort: Number(f.sort) || 0, p_starts: fromLocal(f.starts), p_ends: fromLocal(f.ends), p_status: f.status, p_version: f.version });
      setF(null); reload();
    } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  async function pick(file: File | undefined) {
    if (!file || !f) return;
    setBusy(true); setErr(null);
    try { setF({ ...f, image: await fileToBannerImage(file) }); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
    setBusy(false);
  }
  async function remove() {
    if (!f?.id || !window.confirm('Xóa banner này?')) return;
    try { await rpc('site_delete_banner', { p_id: f.id }); setF(null); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  const isLocked = f ? locked(roles, (data ?? []).find((b) => b.id === f.id)?.status) : false;

  return (
    <>
      <Err e={error} />
      {!f && <div className="toolbar"><button className="primary" onClick={() => open(null)}>+ Thêm banner</button></div>}
      {f && (
        <section className="card">
          <h2>{f.id ? 'Sửa banner' : 'Thêm banner'}</h2>
          {isLocked && <p className="msg error">Banner đã đăng chỉ tổng biên tập hoặc quản trị viên được sửa.</p>}
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Vị trí
              <select value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>
                <option value="hero">Băng chuyền lớn trên trang chủ</option><option value="side">Ô nhỏ bên phải (hiện tối đa 2)</option>
              </select>
            </label>
            <label>Tiêu đề<input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label>Dòng phụ (tùy chọn)<input value={f.subtitle} maxLength={200} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></label>
            <label>Liên kết khi bấm (tùy chọn)<input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value.trim() })} placeholder="/danh-ba/ hoặc https://…" /></label>
            <label>Hình ảnh (tùy chọn; ảnh ngang đẹp nhất)
              <input type="file" accept="image/*" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
              {f.image && <img src={f.image} alt="" style={{ maxWidth: 320, borderRadius: 8, marginTop: 6 }} />}
              {f.image && <button type="button" onClick={() => setF({ ...f, image: '' })}>Bỏ ảnh</button>}
            </label>
            <label>Thứ tự (số nhỏ hiện trước)<input value={f.sort} inputMode="numeric" onChange={(e) => setF({ ...f, sort: e.target.value })} /></label>
            <label>Bắt đầu hiển thị (tùy chọn)<input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></label>
            <label>Ngừng hiển thị (tùy chọn)<input type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></label>
            <label>Trạng thái
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {statusOptions(roles).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <Err e={err} />
            <div className="toolbar">
              <button className="primary" disabled={busy || isLocked}>Lưu</button>
              <button type="button" onClick={() => setF(null)}>Hủy</button>
              {f.id && canPublish(roles) && <button type="button" onClick={() => void remove()}>Xóa banner</button>}
            </div>
          </form>
        </section>
      )}
      {!f && (
        <table className="list"><thead><tr><th>Ảnh</th><th>Banner</th><th>Vị trí</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((b) => (
              <tr key={b.id}>
                <td>{b.image ? <img src={b.image} alt="" style={{ width: 90, borderRadius: 6 }} /> : <small>(không ảnh)</small>}</td>
                <td><strong>{b.title}</strong>{b.subtitle && <small>{b.subtitle}</small>}</td>
                <td>{b.slot === 'hero' ? 'Băng chuyền' : 'Ô nhỏ'} · thứ tự {b.sort_order}</td>
                <td>{b.starts_at || b.ends_at ? `${fmtDateTime(b.starts_at)} → ${fmtDateTime(b.ends_at)}` : 'Luôn hiển thị'}</td>
                <td><SiteBadge s={b.status} /></td><td><button onClick={() => open(b)}>Sửa</button></td>
              </tr>))}
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có banner. Trang chủ đang dùng banner mặc định.</td></tr>}
          </tbody></table>
      )}
    </>
  );
}

// ============================================================ Menu
type MenuKey = 'header_nav' | 'about_menu' | 'footer_cols';
const MENU_META: Record<MenuKey, { label: string; hint: string }> = {
  header_nav: { label: 'Thanh chuyên mục (hàng dưới của đầu trang)', hint: 'Mỗi dòng: Tên | đường dẫn. Dòng bắt đầu bằng "- " là mục con của dòng trên.' },
  about_menu: { label: 'Menu "Tìm hiểu về…" (thanh xanh)', hint: 'Mỗi dòng: Tên | đường dẫn.' },
  footer_cols: { label: 'Các cột liên kết ở chân trang', hint: 'Dòng bắt đầu bằng "# " là tên cột; các dòng sau là liên kết dạng Tên | đường dẫn.' },
};
const linkLine = (l: SiteLink) => `${l.label} | ${l.href}`;
function serialize(key: MenuKey, items: unknown): string {
  if (key === 'header_nav') return (items as SiteNavItem[]).map((i) => [linkLine(i), ...(i.children ?? []).map((c) => `- ${linkLine(c)}`)].join('\n')).join('\n');
  if (key === 'about_menu') return (items as SiteLink[]).map(linkLine).join('\n');
  return (items as SiteFooterCol[]).map((c) => [`# ${c.title}`, ...c.links.map(linkLine)].join('\n')).join('\n');
}
function parseLink(line: string, n: number): SiteLink {
  const i = line.lastIndexOf('|');
  const label = line.slice(0, i).trim(), href = line.slice(i + 1).trim();
  if (i < 0 || !label) throw new Error(`Dòng ${n}: cần dạng "Tên | đường dẫn".`);
  if (!safeHref(href)) throw new Error(`Dòng ${n}: đường dẫn phải bắt đầu bằng / hoặc https://.`);
  return { label, href };
}
function parseMenu(key: MenuKey, text: string): unknown {
  const lines = text.split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 })).filter((x) => x.l);
  if (key === 'footer_cols') {
    const cols: SiteFooterCol[] = [];
    for (const { l, n } of lines) {
      if (l.startsWith('# ')) cols.push({ title: l.slice(2).trim(), links: [] });
      else if (cols.length === 0) throw new Error(`Dòng ${n}: cần có dòng tên cột "# …" trước.`);
      else cols[cols.length - 1]!.links.push(parseLink(l, n));
    }
    return cols;
  }
  const items: SiteNavItem[] = [];
  for (const { l, n } of lines) {
    if (l.startsWith('- ')) {
      if (key !== 'header_nav' || items.length === 0) throw new Error(`Dòng ${n}: mục con chỉ dùng trong thanh chuyên mục, sau một mục chính.`);
      const last = items[items.length - 1]!;
      last.children = [...(last.children ?? []), parseLink(l.slice(2), n)];
    } else items.push(parseLink(l, n));
  }
  return items;
}
const DEFAULT_MENU: Record<MenuKey, unknown> = { header_nav: DEFAULT_HEADER_NAV, about_menu: DEFAULT_ABOUT_MENU, footer_cols: DEFAULT_FOOTER_COLS };

export function SiteMenusPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('site_menus').select('key, items, version');
    if (e) throw new Error(e.message);
    return Object.fromEntries((rows ?? []).map((r) => [r.key as string, { items: r.items as unknown, version: r.version as number }]));
  });
  const [text, setText] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setText(Object.fromEntries((Object.keys(MENU_META) as MenuKey[]).map((k) => [k, serialize(k, data[k]?.items ?? DEFAULT_MENU[k])])));
  }, [data]);
  const can = canPublish(roles);

  async function save(k: MenuKey) {
    try {
      const items = parseMenu(k, text[k] ?? '');
      await rpc('site_save_menu', { p_key: k, p_items: items, p_version: data?.[k]?.version ?? null });
      setMsg({ ...msg, [k]: 'Đã lưu. Website cập nhật trong vòng khoảng 1 phút.' });
      reload();
    } catch (x) { setMsg({ ...msg, [k]: 'LỖI: ' + clean(x instanceof Error ? x.message : String(x)) }); }
  }
  return (
    <>
      <Err e={error} />
      {!can && <p className="msg">Chỉ tổng biên tập hoặc quản trị viên được sửa menu. Bạn chỉ xem được.</p>}
      {(Object.keys(MENU_META) as MenuKey[]).map((k) => (
        <section className="card" key={k}>
          <h2>{MENU_META[k].label}</h2>
          <p className="muted">{MENU_META[k].hint} {!data?.[k] && 'Đang dùng cấu hình mặc định; bấm Lưu để tạo bản của bạn.'}</p>
          <textarea rows={k === 'about_menu' ? 5 : 12} value={text[k] ?? ''} disabled={!can} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
          {msg[k] && <p className={`msg ${msg[k]!.startsWith('LỖI') ? 'error' : 'ok'}`} role="status">{msg[k]}</p>}
          <div className="toolbar">
            <button className="primary" disabled={!can} onClick={() => void save(k)}>Lưu</button>
            <button disabled={!can} onClick={() => setText({ ...text, [k]: serialize(k, DEFAULT_MENU[k]) })}>Đặt lại về mặc định</button>
          </div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Thông tin chung
type SettingKey = keyof SiteSettings;
const SETTING_FIELDS: { key: SettingKey; label: string; fields: { name: string; label: string; area?: boolean }[] }[] = [
  { key: 'brand', label: 'Thương hiệu', fields: [{ name: 'name', label: 'Tên hiển thị' }, { name: 'tagline', label: 'Khẩu hiệu' }, { name: 'description', label: 'Giới thiệu ngắn (chân trang, chia sẻ)', area: true }] },
  { key: 'contact', label: 'Liên hệ (hiện ở chân trang; để trống thì không hiện)', fields: [{ name: 'hotline', label: 'Hotline' }, { name: 'email', label: 'Email' }, { name: 'address', label: 'Địa chỉ' }, { name: 'operator', label: 'Đơn vị vận hành' }] },
  { key: 'social', label: 'Mạng xã hội (dán đường dẫn https://…)', fields: [{ name: 'facebook', label: 'Facebook' }, { name: 'zalo', label: 'Zalo OA' }, { name: 'youtube', label: 'YouTube' }, { name: 'tiktok', label: 'TikTok' }] },
  { key: 'legal', label: 'Pháp lý (chỉ điền khi đã có thông tin chính thức)', fields: [{ name: 'registration', label: 'Thông tin đăng ký website thương mại điện tử', area: true }, { name: 'copyright', label: 'Dòng bản quyền (để trống = tự tạo)' }] },
];

export function SiteSettingsPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('site_settings').select('key, value, version');
    if (e) throw new Error(e.message);
    return Object.fromEntries((rows ?? []).map((r) => [r.key as string, { value: (r.value ?? {}) as Record<string, string>, version: r.version as number }]));
  });
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(SETTING_FIELDS.map((g) => [g.key, { ...(DEFAULT_SETTINGS[g.key] as Record<string, string>), ...(data[g.key]?.value ?? {}) }])));
  }, [data]);
  const can = canPublish(roles);

  async function save(k: SettingKey) {
    try {
      const value: Record<string, string> = Object.fromEntries(Object.entries(draft[k] ?? {}).map(([a, b]) => [a, b.trim()] as [string, string]).filter(([, b]) => b));
      if (k === 'social') for (const [a, b] of Object.entries(value)) if (!safeHref(b)) throw new Error(`Đường dẫn "${a}" phải bắt đầu bằng https://`);
      await rpc('site_save_setting', { p_key: k, p_value: value, p_version: data?.[k]?.version ?? null });
      setMsg({ ...msg, [k]: 'Đã lưu. Website cập nhật trong vòng khoảng 1 phút.' });
      reload();
    } catch (x) { setMsg({ ...msg, [k]: 'LỖI: ' + clean(x instanceof Error ? x.message : String(x)) }); }
  }
  return (
    <>
      <Err e={error} />
      {!can && <p className="msg">Chỉ tổng biên tập hoặc quản trị viên được sửa thông tin chung. Bạn chỉ xem được.</p>}
      {SETTING_FIELDS.map((g) => (
        <section className="card" key={g.key}>
          <h2>{g.label}</h2>
          <div className="form">
            {g.fields.map((fl) => (
              <label key={fl.name}>{fl.label}
                {fl.area
                  ? <textarea rows={3} disabled={!can} value={draft[g.key]?.[fl.name] ?? ''} onChange={(e) => setDraft({ ...draft, [g.key]: { ...draft[g.key], [fl.name]: e.target.value } })} />
                  : <input disabled={!can} value={draft[g.key]?.[fl.name] ?? ''} onChange={(e) => setDraft({ ...draft, [g.key]: { ...draft[g.key], [fl.name]: e.target.value } })} />}
              </label>
            ))}
          </div>
          {msg[g.key] && <p className={`msg ${msg[g.key]!.startsWith('LỖI') ? 'error' : 'ok'}`} role="status">{msg[g.key]}</p>}
          <div className="toolbar"><button className="primary" disabled={!can} onClick={() => void save(g.key)}>Lưu</button></div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Người biên tập (chỉ quản trị viên)
interface RoleRow { user_id: string; email: string; role: string; created_at: string }
const ROLE_LABEL: Record<string, string> = { chief_editor: 'Tổng biên tập', editor: 'Biên tập viên', moderator: 'Kiểm duyệt viên' };

export function SiteRolesPage() {
  const { data, error, reload } = useLoad(() => rpc<RoleRow[]>('admin_list_site_roles'));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [err, setErr] = useState<string | null>(null);
  async function set(em: string, r: string, on: boolean) {
    setErr(null);
    try { await rpc('admin_set_site_role', { p_email: em, p_role: r, p_on: on }); if (on) setEmail(''); reload(); }
    catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Người được cấp vai trò đăng nhập trang quản trị này bằng email của mình và chỉ thấy phần Website. Người đó cần có tài khoản AgriConnect (đăng ký bằng email) trước.</p>
      <Err e={error ?? err} />
      <section className="card">
        <h2>Cấp vai trò</h2>
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void set(email, role, true); }}>
          <input type="email" required placeholder="Email của người được cấp" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="primary">Cấp</button>
        </form>
        <small>Tổng biên tập: đăng, gỡ, sửa mọi nội dung, menu và thông tin chung. Biên tập viên: soạn nháp và gửi duyệt. Kiểm duyệt viên: xem nội dung nháp (duyệt hồ sơ và tin giao thương ở các lát sau).</small>
      </section>
      <table className="list"><thead><tr><th>Email</th><th>Vai trò</th><th>Từ ngày</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.user_id + r.role}><td>{r.email}</td><td>{ROLE_LABEL[r.role] ?? r.role}</td><td>{fmtDateTime(r.created_at)}</td>
              <td><button onClick={() => void set(r.email, r.role, false)}>Thu hồi</button></td></tr>))}
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa cấp vai trò nào. Quản trị viên luôn có đủ quyền.</td></tr>}
        </tbody></table>
    </>
  );
}
