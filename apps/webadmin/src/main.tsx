import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { clean, rpc, supabase } from '@agriconnect/admin-kit';
import { SiteAuditPage, SiteHomePage, SiteOverviewPage, SiteUsersPage } from './extras';
import { SiteShopMaterialsPage, SiteShopsPage } from './shops';
import { SiteReportsPage, SiteTradePage } from './trade';
import { SiteReviewsPage } from './reviews2';
import { SiteTranslationsPage } from './translations';
import { PublicCyclesPage, ReviewsPage } from './reviews';
import { SiteBannersPage, SiteMenusPage, SitePagesPage, SiteRolesPage, SiteSettingsPage } from './site';
import { SiteArticlesPage, SiteCategoriesPage, SiteMaterialsPage, SiteQuotesPage } from './site2';
import '@agriconnect/admin-kit/src/styles.css';

/**
 * Trang QUẢN TRỊ WEBSITE Agricovi (D63): dự án Cloudflare riêng, tách khỏi quản trị nền tảng (gói, thanh toán, cơ sở…) của app.
 * Gom mọi thứ cần quản lý của website: nội dung, sản phẩm/vật tư, kiểm duyệt, người biên tập, nhật ký. Các phần của W3 trở đi
 * (người dùng web, giao thương, đơn hàng, báo cáo vi phạm, huy hiệu) sẽ thêm vào đây.
 * Quyền thật do CSDL ép; giao diện chỉ ẩn bớt mục không dùng được.
 */
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
const APP_URL = env.VITE_APP_URL;

interface PageDef { id: string; label: string; icon: string; group: string; adminOnly?: boolean; chiefOnly?: boolean; modOk?: boolean }
const PAGES: PageDef[] = [
  { id: 'overview', label: 'Tổng quan', icon: '📊', group: '' },
  { id: 'site-articles', label: 'Bài viết và tin hội chợ', icon: '📰', group: 'Nội dung' },
  { id: 'site-pages', label: 'Trang tĩnh', icon: '📄', group: 'Nội dung' },
  { id: 'site-banners', label: 'Banner trang chủ', icon: '🖼️', group: 'Nội dung' },
  { id: 'site-home', label: 'Các khối trang chủ', icon: '🏠', group: 'Nội dung' },
  { id: 'site-menus', label: 'Menu và chân trang', icon: '🧭', group: 'Nội dung' },
  { id: 'site-settings', label: 'Thông tin chung', icon: '🛠️', group: 'Nội dung' },
  { id: 'site-translations', label: 'Bản dịch tiếng Anh', icon: '🌐', group: 'Nội dung' },
  { id: 'site-categories', label: 'Danh mục sản phẩm', icon: '🗂️', group: 'Sản phẩm' },
  { id: 'site-materials', label: 'Vật tư nông nghiệp', icon: '🌿', group: 'Sản phẩm' },
  { id: 'site-quotes', label: 'Yêu cầu báo giá', icon: '💬', group: 'Tiếp nhận và kiểm duyệt' },
  { id: 'site-shops', label: 'Gian hàng vật tư', icon: '🏪', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true, modOk: true },
  { id: 'site-shopmat', label: 'Duyệt vật tư gian hàng', icon: '🧪', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true, modOk: true },
  { id: 'site-trade', label: 'Duyệt tin giao thương', icon: '🤝', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true, modOk: true },
  { id: 'site-reports', label: 'Báo cáo vi phạm', icon: '🚩', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true, modOk: true },
  { id: 'site-reviews', label: 'Đánh giá nhà cung cấp', icon: '★', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true, modOk: true },
  { id: 'site-users', label: 'Người dùng website', icon: '🙋', group: 'Tiếp nhận và kiểm duyệt', chiefOnly: true },
  { id: 'reviews', label: 'Duyệt hồ sơ nhà cung cấp', icon: '✅', group: 'Tiếp nhận và kiểm duyệt', adminOnly: true },
  { id: 'public', label: 'Vụ công khai (truy xuất)', icon: '🌐', group: 'Tiếp nhận và kiểm duyệt', adminOnly: true },
  { id: 'site-roles', label: 'Người biên tập', icon: '👥', group: 'Hệ thống', adminOnly: true },
  { id: 'site-audit', label: 'Nhật ký thao tác', icon: '📜', group: 'Hệ thống', chiefOnly: true },
];

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr(/invalid/i.test(error.message) ? 'Email hoặc mật khẩu chưa đúng.' : clean(error.message));
    setBusy(false);
  }
  return (
    <main className="login">
      <h1>Agricovi — Quản trị website</h1>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Mật khẩu<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>Đăng nhập</button>
      </form>
    </main>
  );
}

function Admin({ session, roles }: { session: Session; roles: string[] }) {
  const isAdmin = roles.includes('admin');
  const isChief = isAdmin || roles.includes('chief_editor');
  const isMod = roles.includes('moderator');
  const visible = PAGES.filter((p) => (!p.adminOnly || isAdmin) && (!p.chiefOnly || isChief || (p.modOk && isMod)));
  const [page, setPage] = useState(() => { try { const p = sessionStorage.getItem('webadmin.page'); return p && visible.some((v) => v.id === p) ? p : 'overview'; } catch { return 'overview'; } });
  const go = (p: string) => { const n = visible.some((v) => v.id === p) ? p : 'overview'; setPage(n); try { sessionStorage.setItem('webadmin.page', n); } catch { /* bỏ qua */ } };
  const title = PAGES.find((p) => p.id === page)?.label ?? '';
  const groups = [...new Set(visible.map((p) => p.group))];
  return (
    <div className="shell">
      <aside>
        <h1>Agricovi<br /><small>Quản trị website</small></h1>
        <nav>
          {groups.map((g) => (
            <div key={g || 'top'}>
              {g && <small style={{ display: 'block', margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{g}</small>}
              {visible.filter((p) => p.group === g).map((p) => (
                <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}><span>{p.icon}</span> {p.label}</button>
              ))}
            </div>
          ))}
          {isAdmin && APP_URL && <a className="navlink" href={`${APP_URL.replace(/\/$/, '')}/quan-tri/`} target="_blank" rel="noopener noreferrer"><span>🏢</span> Quản trị nền tảng ↗</a>}
        </nav>
        <div className="who">
          <small>{session.user.email}</small>
          <small>{roles.map((r) => ({ admin: 'Quản trị viên', chief_editor: 'Tổng biên tập', editor: 'Biên tập viên', moderator: 'Kiểm duyệt viên' }[r] ?? r)).join(', ')}</small>
          <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <h1>{title}</h1>
        {page === 'overview' && <SiteOverviewPage go={go} />}
        {page === 'site-articles' && <SiteArticlesPage roles={roles} />}
        {page === 'site-pages' && <SitePagesPage roles={roles} />}
        {page === 'site-banners' && <SiteBannersPage roles={roles} />}
        {page === 'site-home' && <SiteHomePage roles={roles} />}
        {page === 'site-menus' && <SiteMenusPage roles={roles} />}
        {page === 'site-settings' && <SiteSettingsPage roles={roles} />}
        {page === 'site-translations' && <SiteTranslationsPage />}
        {page === 'site-categories' && <SiteCategoriesPage roles={roles} />}
        {page === 'site-materials' && <SiteMaterialsPage roles={roles} />}
        {page === 'site-quotes' && <SiteQuotesPage />}
        {page === 'site-shops' && (isChief || isMod) && <SiteShopsPage />}
        {page === 'site-shopmat' && (isChief || isMod) && <SiteShopMaterialsPage />}
        {page === 'site-trade' && (isChief || isMod) && <SiteTradePage />}
        {page === 'site-reports' && (isChief || isMod) && <SiteReportsPage />}
        {page === 'site-reviews' && (isChief || isMod) && <SiteReviewsPage />}
        {page === 'site-users' && isChief && <SiteUsersPage />}
        {page === 'reviews' && isAdmin && <ReviewsPage />}
        {page === 'public' && isAdmin && <PublicCyclesPage />}
        {page === 'site-roles' && isAdmin && <SiteRolesPage />}
        {page === 'site-audit' && isChief && <SiteAuditPage />}
      </main>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [roles, setRoles] = useState<string[] | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase) return;
    // Supabase phát lại SIGNED_IN/TOKEN_REFRESHED mỗi khi quay lại tab: giữ phiên cũ nếu vẫn cùng người dùng, kẻo cả trang bị dựng lại và về Tổng quan.
    const keep = (s: Session | null) => setSession((prev) => (prev && s && prev.user.id === s.user.id ? prev : s));
    void supabase.auth.getSession().then(({ data }) => keep(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => keep(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setRoles(null);
    if (userId) void rpc<string[]>('get_my_site_roles').then(setRoles).catch(() => setRoles([]));
  }, [userId]);

  if (!supabase) return <main className="login"><h1>Chưa cấu hình</h1><p className="muted">Thiếu biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY khi build (xem docs/DEPLOY_CLOUDFLARE.md).</p></main>;
  if (session === undefined) return <p className="muted" style={{ padding: 24 }}>Đang tải…</p>;
  if (!session) return <Login />;
  if (roles === null) return <p className="muted" style={{ padding: 24 }}>Đang kiểm tra quyền…</p>;
  if (roles.length === 0) {
    return (
      <main className="login">
        <h1>Không có quyền</h1>
        <p className="msg error">Tài khoản {session.user.email} chưa được cấp quyền quản trị hoặc biên tập website. Hãy nhờ quản trị viên cấp quyền (mục Người biên tập).</p>
        <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
      </main>
    );
  }
  return <Admin session={session} roles={roles} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
