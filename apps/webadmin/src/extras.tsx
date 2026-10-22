import { useEffect, useState, type ReactNode } from 'react';
import { HOME_BLOCK_LABEL, normalizeHomeBlocks, type HomeBlock } from '@agriconnect/shared';
import { clean, Err, fmtDateTime, rpc, supabase, useLoad } from '@agriconnect/admin-kit';
import { canPublish } from './site';

// ============================================================ Tổng quan website
interface Overview {
  quotes_new: number; articles: { draft: number; review: number; published: number; scheduled: number }; materials: { draft: number; review: number; published: number };
  pages: { draft: number; published: number }; banners_active: number; profiles_pending: number | null; profiles_public: number; cycles_public: number; products_public: number;
}
function Kpi({ label, value, tone, onClick, note }: { label: string; value: ReactNode; tone?: string; onClick?: () => void; note?: string }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return onClick ? <button className={`kpi linkish ${tone ?? ''}`} onClick={onClick}>{body}</button> : <div className={`kpi ${tone ?? ''}`}>{body}</div>;
}

export function SiteOverviewPage({ go }: { go: (p: string) => void }) {
  const { data: o, error } = useLoad(() => rpc<Overview>('site_overview'));
  if (error) return <Err e={error} />;
  if (!o) return <p className="muted">Đang tải…</p>;
  const todo: { text: string; page: string }[] = [];
  if (o.quotes_new > 0) todo.push({ text: `${o.quotes_new} yêu cầu báo giá mới cần liên hệ`, page: 'site-quotes' });
  if (o.profiles_pending) todo.push({ text: `${o.profiles_pending} hồ sơ nhà cung cấp chờ duyệt`, page: 'reviews' });
  if (o.articles.review > 0) todo.push({ text: `${o.articles.review} bài viết chờ duyệt đăng`, page: 'site-articles' });
  if (o.materials.review > 0) todo.push({ text: `${o.materials.review} vật tư chờ duyệt đăng`, page: 'site-materials' });
  if (o.materials.draft > 0) todo.push({ text: `${o.materials.draft} vật tư đang ở dạng nháp`, page: 'site-materials' });
  if (o.pages.draft > 0) todo.push({ text: `${o.pages.draft} trang tĩnh chưa đăng`, page: 'site-pages' });
  return (
    <>
      <section className="card">
        <h2>Việc cần làm</h2>
        {todo.length === 0 && <p className="muted">Không có việc tồn đọng.</p>}
        <ul>{todo.map((t) => <li key={t.text}><a href="#" onClick={(e) => { e.preventDefault(); go(t.page); }}>{t.text}</a></li>)}</ul>
      </section>
      <div className="kpis">
        <Kpi label="Yêu cầu báo giá mới" value={o.quotes_new} tone={o.quotes_new > 0 ? 'warn' : 'ok'} onClick={() => go('site-quotes')} />
        <Kpi label="Bài viết đã đăng" value={o.articles.published} note={`${o.articles.draft} nháp · ${o.articles.review} chờ duyệt · ${o.articles.scheduled} hẹn giờ`} onClick={() => go('site-articles')} />
        <Kpi label="Vật tư đã đăng" value={o.materials.published} note={`${o.materials.draft} nháp · ${o.materials.review} chờ duyệt`} onClick={() => go('site-materials')} />
        <Kpi label="Trang tĩnh đã đăng" value={o.pages.published} onClick={() => go('site-pages')} />
        <Kpi label="Banner đang hiển thị" value={o.banners_active} onClick={() => go('site-banners')} />
        <Kpi label="Nhà cung cấp đang công khai" value={o.profiles_public} tone="info" />
        <Kpi label="Sản phẩm đang công khai" value={o.products_public} tone="info" />
        <Kpi label="Vụ có truy xuất công khai" value={o.cycles_public} tone="info" />
        {o.profiles_pending !== null && <Kpi label="Hồ sơ chờ duyệt" value={o.profiles_pending} tone={o.profiles_pending > 0 ? 'warn' : 'ok'} onClick={() => go('reviews')} />}
      </div>
    </>
  );
}

// ============================================================ Trang chủ: thứ tự và ẩn/hiện các khối
export function SiteHomePage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: row, error: e } = await supabase!.from('site_settings').select('value, version').eq('key', 'home').maybeSingle();
    if (e) throw new Error(e.message);
    return { blocks: normalizeHomeBlocks((row?.value as { blocks?: unknown } | null)?.blocks), version: (row?.version as number | undefined) ?? null };
  });
  const [blocks, setBlocks] = useState<HomeBlock[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) setBlocks(data.blocks); }, [data]);
  const can = canPublish(roles);
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= blocks.length) return; const b = [...blocks]; [b[i], b[j]] = [b[j]!, b[i]!]; setBlocks(b); };
  async function save() {
    setErr(null); setMsg(null);
    try {
      await rpc('site_save_setting', { p_key: 'home', p_value: { blocks }, p_version: data?.version ?? null });
      setMsg('Đã lưu. Trang chủ cập nhật trong vòng khoảng 1 phút.'); reload();
    } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Banner (cột danh mục, băng chuyền, hai ô nhỏ) luôn ở đầu trang chủ. Các khối bên dưới đổi được thứ tự và ẩn/hiện. Khối chưa có dữ liệu (ví dụ chưa có sản phẩm trong mục) sẽ tự không hiện dù đang bật.</p>
      {!can && <p className="msg">Chỉ tổng biên tập hoặc quản trị viên được sửa. Bạn chỉ xem được.</p>}
      <Err e={error ?? err} />{msg && <p className="msg ok" role="status">{msg}</p>}
      <table className="list"><thead><tr><th>Thứ tự</th><th>Khối</th><th>Hiện</th><th></th></tr></thead>
        <tbody>
          {blocks.map((b, i) => (
            <tr key={b.id} className={b.on ? '' : 'off'}>
              <td>{i + 1}</td><td><strong>{HOME_BLOCK_LABEL[b.id]}</strong></td>
              <td><input type="checkbox" checked={b.on} disabled={!can} style={{ width: 'auto' }} onChange={(e) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, on: e.target.checked } : x)))} /></td>
              <td className="acts"><button disabled={!can || i === 0} onClick={() => move(i, -1)}>↑ Lên</button><button disabled={!can || i === blocks.length - 1} onClick={() => move(i, 1)}>↓ Xuống</button></td>
            </tr>))}
        </tbody></table>
      <div className="toolbar"><button className="primary" disabled={!can} onClick={() => void save()}>Lưu</button><button disabled={!can} onClick={() => reload()}>Hoàn tác thay đổi</button></div>
    </>
  );
}

// ============================================================ Nhật ký thao tác website
const ACTION_LABEL: Record<string, string> = {
  site_role_grant: 'Cấp vai trò biên tập', site_role_revoke: 'Thu hồi vai trò biên tập', site_page_create: 'Tạo trang', site_page_update: 'Sửa trang', site_page_delete: 'Xóa trang',
  site_banner_create: 'Tạo banner', site_banner_update: 'Sửa banner', site_banner_delete: 'Xóa banner', site_menu_save: 'Sửa menu', site_setting_save: 'Sửa thông tin chung/trang chủ',
  site_category_create: 'Tạo danh mục', site_category_update: 'Sửa danh mục', site_material_create: 'Tạo vật tư', site_material_update: 'Sửa vật tư', site_material_delete: 'Xóa vật tư', site_material_import: 'Nhập vật tư hàng loạt',
  site_article_create: 'Tạo bài viết', site_article_update: 'Sửa bài viết', site_article_delete: 'Xóa bài viết', site_quote_set: 'Xử lý yêu cầu báo giá', site_user_blocked: 'Khóa người dùng website', site_user_active: 'Mở khóa người dùng website',
};
interface AuditRow { id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null }
export function SiteAuditPage() {
  const { data, error } = useLoad(() => rpc<AuditRow[]>('site_list_audit', { p_limit: 200 }));
  return (
    <>
      <Err e={error} />
      <table className="list"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Thao tác</th><th>Đối tượng</th></tr></thead>
        <tbody>
          {(data ?? []).map((a) => <tr key={a.id}><td>{fmtDateTime(a.at)}</td><td>{a.actor ?? '—'}</td><td>{ACTION_LABEL[a.action] ?? a.action}</td><td><small>{a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}</small></td></tr>)}
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa có thao tác nào.</td></tr>}
        </tbody></table>
    </>
  );
}

// ============================================================ Người dùng website
interface WebUser { user_id: string; full_name: string; buyer_kind: string; company: string | null; phone: string | null; login_kind: string; status: string; blocked_reason: string | null; created_at: string; email: string | null; favorites: number }
const KIND_LABEL: Record<string, string> = { individual: 'Cá nhân', restaurant: 'Nhà hàng, bếp ăn', trader: 'Thương lái, đại lý', business: 'Doanh nghiệp', farm: 'Nhà vườn mua vật tư' };
export function SiteUsersPage() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const { data, error, reload } = useLoad(() => rpc<WebUser[]>('site_list_users', { p_search: applied || null, p_limit: 200 }), [applied]);
  const [err, setErr] = useState<string | null>(null);
  async function setStatus(u: WebUser, status: 'active' | 'blocked') {
    setErr(null);
    const reason = status === 'blocked' ? window.prompt('Lý do khóa tài khoản (ít nhất 5 ký tự)?') : '';
    if (status === 'blocked' && !reason) return;
    try { await rpc('site_set_user_status', { p_user: u.user_id, p_status: status, p_reason: reason }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Người mua đã đăng ký trên website (email hoặc số điện thoại). Chủ cơ sở dùng tài khoản app không nằm ở đây cho tới khi họ đăng nhập website lần đầu. Tài khoản nhân viên không dùng website. Số điện thoại chưa xác minh OTP, không coi là bằng chứng danh tính.</p>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input placeholder="Tìm theo tên, email hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} /><button className="primary">Tìm</button>
      </form>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Loại</th><th>Đăng ký</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.user_id} className={u.status === 'blocked' ? 'off' : ''}>
              <td><strong>{u.full_name}</strong>{u.company && <small>{u.company}</small>}</td>
              <td>{u.email ?? u.phone ?? ''}<small>{u.login_kind === 'phone' ? 'Đăng nhập bằng số điện thoại' : 'Đăng nhập bằng email'} · {u.favorites} mục yêu thích</small></td>
              <td>{KIND_LABEL[u.buyer_kind] ?? u.buyer_kind}</td><td>{fmtDateTime(u.created_at)}</td>
              <td>{u.status === 'blocked' ? <span className="badge bad">Đã khóa</span> : <span className="badge ok">Đang dùng</span>}{u.blocked_reason && <small>{u.blocked_reason}</small>}</td>
              <td>{u.status === 'blocked' ? <button onClick={() => void setStatus(u, 'active')}>Mở khóa</button> : <button className="danger" onClick={() => void setStatus(u, 'blocked')}>Khóa</button>}</td>
            </tr>))}
          {(data ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có người dùng nào.</td></tr>}
        </tbody></table>
    </>
  );
}
