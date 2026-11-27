import { useEffect, useState, type ReactNode } from 'react';
import { HOME_BLOCK_LABEL, normalizeHomeBlocks, type HomeBlock } from '@agriconnect/shared';
import { clean, Err, fmtDateTime, rpc, supabase, useLoad } from '@agriconnect/admin-kit';
import { canPublish } from './site';

// ============================================================ Tổng quan website
interface Overview {
  quotes_new: number; articles: { draft: number; review: number; published: number; scheduled: number }; materials: { draft: number; review: number; published: number };
  pages: { draft: number; published: number }; banners_active: number; profiles_pending: number | null; profiles_public: number; cycles_public: number; products_public: number;
  trade_pending: number; trade_published: number; reports_open: number; users_total: number; shops_pending: number; shops_active: number; shop_materials_review: number;
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
  if (o.shops_pending > 0) todo.push({ text: `${o.shops_pending} gian hàng vật tư chờ duyệt`, page: 'site-shops' });
  if (o.shop_materials_review > 0) todo.push({ text: `${o.shop_materials_review} vật tư của gian hàng chờ duyệt`, page: 'site-shopmat' });
  if (o.trade_pending > 0) todo.push({ text: `${o.trade_pending} tin giao thương chờ duyệt`, page: 'site-trade' });
  if (o.reports_open > 0) todo.push({ text: `${o.reports_open} báo cáo vi phạm chưa xử lý`, page: 'site-reports' });
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
        <Kpi label="Gian hàng vật tư chờ duyệt" value={o.shops_pending} tone={o.shops_pending > 0 ? 'warn' : 'ok'} onClick={() => go('site-shops')} />
        <Kpi label="Gian hàng vật tư đang hoạt động" value={o.shops_active} tone="info" onClick={() => go('site-shops')} />
        <Kpi label="Vật tư gian hàng chờ duyệt" value={o.shop_materials_review} tone={o.shop_materials_review > 0 ? 'warn' : 'ok'} onClick={() => go('site-shopmat')} />
        <Kpi label="Tin giao thương chờ duyệt" value={o.trade_pending} tone={o.trade_pending > 0 ? 'warn' : 'ok'} onClick={() => go('site-trade')} />
        <Kpi label="Tin giao thương đang hiển thị" value={o.trade_published} tone="info" onClick={() => go('site-trade')} />
        <Kpi label="Báo cáo vi phạm mở" value={o.reports_open} tone={o.reports_open > 0 ? 'bad' : 'ok'} onClick={() => go('site-reports')} />
        <Kpi label="Người dùng website" value={o.users_total} tone="info" onClick={() => go('site-users')} />
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
  site_article_create: 'Tạo bài viết', site_article_update: 'Sửa bài viết', site_article_delete: 'Xóa bài viết', site_quote_set: 'Xử lý yêu cầu báo giá', site_user_blocked: 'Khóa người dùng website', site_user_active: 'Mở khóa người dùng website', site_trade_approve: 'Duyệt tin giao thương', site_trade_reject: 'Từ chối tin giao thương', site_trade_hide: 'Ẩn tin giao thương', site_trade_restore: 'Hiện lại tin giao thương', site_report_handled: 'Xử lý báo cáo vi phạm', site_shop_approve: 'Duyệt gian hàng vật tư', site_shop_reject: 'Từ chối gian hàng vật tư', site_shop_suspend: 'Tạm khóa gian hàng vật tư', site_shop_restore: 'Mở lại gian hàng vật tư', site_shopmat_approve: 'Duyệt vật tư gian hàng', site_shopmat_reject: 'Từ chối vật tư gian hàng', site_shopmat_hide: 'Ẩn vật tư gian hàng', site_report_dismissed: 'Bỏ qua báo cáo vi phạm',
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
interface WebUser { user_id: string; full_name: string; buyer_kind: string; company: string | null; tax_code?: string | null; phone: string | null; login_kind: string; status: string; blocked_reason: string | null; created_at: string; email: string | null; favorites: number; posts?: number; posts_pending?: number }
const KIND_LABEL: Record<string, string> = { individual: 'Cá nhân', restaurant: 'Nhà hàng, bếp ăn', trader: 'Thương lái, đại lý', business: 'Doanh nghiệp', farm: 'Nhà vườn mua vật tư' };
export function SiteUsersPage() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const { data, error, reload } = useLoad(() => rpc<WebUser[]>('site_list_users', { p_search: applied || null, p_limit: 200 }), [applied]);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [postersOnly, setPostersOnly] = useState(false);
  async function setStatus(u: WebUser, status: 'active' | 'blocked') {
    setErr(null);
    const reason = status === 'blocked' ? window.prompt('Lý do khóa tài khoản (ít nhất 5 ký tự)?') : '';
    if (status === 'blocked' && !reason) return;
    try { await rpc('site_set_user_status', { p_user: u.user_id, p_status: status, p_reason: reason }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  const opened = (data ?? []).find((u) => u.user_id === openId);
  if (opened) {
    return (
      <>
        <Err e={error ?? err} />
        <SiteUserDetail u={opened} back={() => setOpenId(null)} setStatus={setStatus} reloadList={reload} />
      </>
    );
  }
  const rows = (data ?? []).filter((u) => !postersOnly || (u.posts ?? 0) > 0);
  return (
    <>
      <p className="muted">Người mua đã đăng ký trên website (email hoặc số điện thoại). Chủ cơ sở dùng tài khoản app không nằm ở đây cho tới khi họ đăng nhập website lần đầu. Tài khoản nhân viên không dùng website. Số điện thoại chưa xác minh OTP, không coi là bằng chứng danh tính.</p>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input placeholder="Tìm theo tên, email hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} /><button className="primary">Tìm</button>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={postersOnly} onChange={(e) => setPostersOnly(e.target.checked)} /> Chỉ người có tin giao thương</label>
      </form>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Loại</th><th>Đăng ký</th><th>Tin giao thương</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.user_id} className={u.status === 'blocked' ? 'off' : ''}>
              <td><strong>{u.full_name}</strong>{u.company && <small>{u.company}</small>}</td>
              <td>{u.email ?? u.phone ?? ''}<small>{u.login_kind === 'phone' ? 'Đăng nhập bằng số điện thoại' : 'Đăng nhập bằng email'} · {u.favorites} mục yêu thích</small></td>
              <td>{KIND_LABEL[u.buyer_kind] ?? u.buyer_kind}</td><td>{fmtDateTime(u.created_at)}</td>
              <td>{u.posts ?? 0} tin{(u.posts_pending ?? 0) > 0 && <small><span className="badge warn">{u.posts_pending} chờ duyệt</span></small>}</td>
              <td>{u.status === 'blocked' ? <span className="badge bad">Đã khóa</span> : <span className="badge ok">Đang dùng</span>}{u.blocked_reason && <small>{u.blocked_reason}</small>}</td>
              <td className="acts"><button className="primary" onClick={() => setOpenId(u.user_id)}>Xem</button>{u.status === 'blocked' ? <button onClick={() => void setStatus(u, 'active')}>Mở khóa</button> : <button className="danger" onClick={() => void setStatus(u, 'blocked')}>Khóa</button>}</td>
            </tr>))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">{postersOnly ? 'Chưa có người dùng nào đăng tin.' : 'Chưa có người dùng nào.'}</td></tr>}
        </tbody></table>
    </>
  );
}

interface UserPost {
  id: string; kind: string; title: string; status: string; review_note: string | null; quantity: number | null; unit: string; price_min: number | null; price_max: number | null;
  province: string; district: string | null; when_date: string | null; quality: string[]; description: string | null; images: string[]; expires_at: string; created_at: string; expired: boolean;
  category_name: string | null; org_name: string | null; responses: number; open_reports: number;
}
interface UserDetail { email_verified: boolean; orgs: string[]; addresses: { label: string; recipient: string; phone: string; address: string }[]; reports_open: number; responses_sent: number; posts: UserPost[] }
const POST_ST: Record<string, string> = { pending: 'Chờ duyệt', published: 'Đang hiển thị', rejected: 'Từ chối', hidden: 'Đã ẩn', closed: 'Đã đóng' };

function SiteUserDetail({ u, back, setStatus, reloadList }: { u: WebUser; back: () => void; setStatus: (u: WebUser, s: 'active' | 'blocked') => Promise<void>; reloadList: () => void }) {
  const { data, error, reload } = useLoad(() => rpc<UserDetail>('site_user_detail', { p_user: u.user_id }), [u.user_id]);
  const [err, setErr] = useState<string | null>(null);
  async function decide(p: UserPost, decision: 'approve' | 'reject' | 'hide') {
    setErr(null);
    let reason = '';
    if (decision !== 'approve') {
      const r = window.prompt(decision === 'reject' ? 'Lý do từ chối (người đăng sẽ thấy, ít nhất 5 ký tự)?' : 'Lý do ẩn tin (ít nhất 5 ký tự)?');
      if (!r) return;
      reason = r;
    }
    try { await rpc('site_review_trade_post', { p_id: p.id, p_decision: decision, p_reason: reason }); reload(); reloadList(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <div className="toolbar"><button onClick={back}>← Danh sách người dùng</button></div>
      <section className="card">
        <h2>{u.full_name} {u.status === 'blocked' ? <span className="badge bad">Đã khóa</span> : <span className="badge ok">Đang dùng</span>}</h2>
        <p>{KIND_LABEL[u.buyer_kind] ?? u.buyer_kind}{u.company ? ` · ${u.company}` : ''}{u.tax_code ? ` · mã số thuế ${u.tax_code}` : ''}</p>
        <p>{u.email ? `Email: ${u.email}${data ? (data.email_verified ? ' (đã xác nhận)' : ' (chưa xác nhận)') : ''}` : 'Đăng nhập bằng số điện thoại'}{u.phone ? ` · Điện thoại: ${u.phone}` : ''}</p>
        <p className="muted">Đăng ký {fmtDateTime(u.created_at)}{data ? ` · đã gửi ${data.responses_sent} báo giá/quan tâm · ${data.reports_open} báo cáo chưa xử lý` : ''}</p>
        {data && data.orgs.length > 0 && <p className="muted">Cơ sở tham gia: {data.orgs.join(', ')}</p>}
        {data?.addresses.map((a, i) => <p key={i} className="muted">{a.label}: {a.recipient} · {a.phone} · {a.address}</p>)}
        {u.blocked_reason && <p className="muted">Lý do khóa: {u.blocked_reason}</p>}
        <div className="acts">{u.status === 'blocked' ? <button onClick={() => void setStatus(u, 'active')}>Mở khóa</button> : <button className="danger" onClick={() => void setStatus(u, 'blocked')}>Khóa tài khoản</button>}</div>
      </section>
      <h2>Tin giao thương đã đăng{data ? ` (${data.posts.length})` : ''}</h2>
      <Err e={error ?? err} />
      {!data && !error && <p className="muted">Đang tải…</p>}
      {data && data.posts.length === 0 && <p className="muted">Người này chưa đăng tin nào.</p>}
      {data?.posts.map((p) => (
        <section className="card" key={p.id}>
          <h2>{p.title} <span className="badge">{POST_ST[p.status] ?? p.status}</span>{p.expired && p.status === 'published' && <span className="badge warn">Hết hạn</span>}{p.open_reports > 0 && <span className="badge bad">{p.open_reports} báo cáo</span>}</h2>
          <p className="muted">{p.kind === 'sell' ? 'Cần bán' : 'Cần mua'}{p.org_name ? ` · cơ sở ${p.org_name}` : ''} · đăng {fmtDateTime(p.created_at)} · hết hạn {fmtDateTime(p.expires_at)} · {p.responses} phản hồi</p>
          <p>{p.category_name} · {p.quantity} {p.unit} · {[p.district, p.province].filter(Boolean).join(', ')}{(p.price_min != null || p.price_max != null) && ` · giá ${p.price_min ?? ''}–${p.price_max ?? ''}`}{p.when_date && ` · ngày ${p.when_date}`}{p.quality.length > 0 && ` · ${p.quality.join(', ')}`}</p>
          {p.description && <p style={{ whiteSpace: 'pre-line' }}>{p.description}</p>}
          {p.images.map((s, i) => <img key={i} src={s} alt="" style={{ height: 90, borderRadius: 6, marginRight: 6 }} />)}
          {p.review_note && <p className="muted">Ghi chú kiểm duyệt: {p.review_note}</p>}
          <div className="acts">
            {(p.status === 'pending' || p.status === 'rejected' || p.status === 'hidden') && <button className="primary" onClick={() => void decide(p, 'approve')}>Duyệt và hiển thị</button>}
            {p.status === 'pending' && <button onClick={() => void decide(p, 'reject')}>Từ chối</button>}
            {p.status === 'published' && <button className="danger" onClick={() => void decide(p, 'hide')}>Ẩn tin</button>}
          </div>
        </section>
      ))}
    </>
  );
}
