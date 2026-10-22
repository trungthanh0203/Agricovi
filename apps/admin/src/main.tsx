import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { AuditPage, OrgDetailPage, OrgsPage, OverviewPage, PaymentsPage, PlansPage, PublicCyclesPage, ReviewsPage, SettingsPage } from './pages';
import { SiteBannersPage, SiteMenusPage, SitePagesPage, SiteRolesPage, SiteSettingsPage } from './site';
import { clean, rpc, supabase } from './supabase';
import './styles.css';

/**
 * Trang quản trị nền tảng AgriConnect (D53). Chỉ tài khoản có tên trong bảng quản trị viên vào được; quyền kiểm ở CSDL
 * (mọi hàm admin_* đều kiểm lại). Quản trị viên chỉ xem số liệu tổng hợp, không đọc dữ liệu vận hành của nhà vườn.
 */
const PAGES: { id: string; label: string; icon: string; group: 'platform' | 'site'; adminOnly?: boolean }[] = [
  { id: 'overview', label: 'Tổng quan', icon: '📊', group: 'platform', adminOnly: true },
  { id: 'orgs', label: 'Cơ sở', icon: '🏡', group: 'platform', adminOnly: true },
  { id: 'plans', label: 'Gói và giá', icon: '🏷️', group: 'platform', adminOnly: true },
  { id: 'payments', label: 'Thanh toán', icon: '💵', group: 'platform', adminOnly: true },
  { id: 'reviews', label: 'Duyệt hồ sơ', icon: '✅', group: 'platform', adminOnly: true },
  { id: 'public', label: 'Vụ công khai', icon: '🌐', group: 'platform', adminOnly: true },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️', group: 'platform', adminOnly: true },
  { id: 'audit', label: 'Nhật ký kiểm toán', icon: '📜', group: 'platform', adminOnly: true },
  { id: 'site-pages', label: 'Trang tĩnh', icon: '📄', group: 'site' },
  { id: 'site-banners', label: 'Banner trang chủ', icon: '🖼️', group: 'site' },
  { id: 'site-menus', label: 'Menu và chân trang', icon: '🧭', group: 'site' },
  { id: 'site-settings', label: 'Thông tin chung', icon: '🛠️', group: 'site' },
  { id: 'site-roles', label: 'Người biên tập', icon: '👥', group: 'site', adminOnly: true },
];

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr(/invalid/i.test(error.message) ? 'Email hoặc mật khẩu chưa đúng.' : clean(error.message));
    setBusy(false);
  }
  return (
    <main className="login">
      <h1>AgriConnect — Quản trị nền tảng</h1>
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
  const visible = PAGES.filter((p) => isAdmin || !p.adminOnly);
  const [page, setPage] = useState(isAdmin ? 'overview' : 'site-pages');
  const [orgId, setOrgId] = useState<string | null>(null);
  const go = (p: string) => { setPage(p); setOrgId(null); };
  const title = PAGES.find((p) => p.id === page)?.label ?? '';
  const groups: { id: 'platform' | 'site'; label: string }[] = [{ id: 'platform', label: 'Nền tảng' }, { id: 'site', label: 'Website' }];
  return (
    <div className="shell">
      <aside>
        <h1>AgriConnect<br /><small>Quản trị nền tảng</small></h1>
        <nav>
          {groups.map((g) => {
            const items = visible.filter((p) => p.group === g.id);
            return items.length === 0 ? null : (
              <div key={g.id}>
                {isAdmin && <small style={{ display: 'block', margin: '10px 0 4px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{g.label}</small>}
                {items.map((p) => (
                  <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}><span>{p.icon}</span> {p.label}</button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="who">
          <a href={import.meta.env.DEV ? 'http://localhost:5180/' : '/'}>← Về ứng dụng</a>
          <small>{session.user.email}</small>
          <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <h1>{orgId ? 'Chi tiết cơ sở' : title}</h1>
        {page === 'overview' && <OverviewPage onOpenOrg={(id) => { setPage('orgs'); setOrgId(id); }} go={go} />}
        {page === 'orgs' && (orgId ? <OrgDetailPage id={orgId} onBack={() => setOrgId(null)} /> : <OrgsPage onOpen={setOrgId} />)}
        {page === 'plans' && <PlansPage />}
        {page === 'payments' && <PaymentsPage />}
        {page === 'reviews' && <ReviewsPage />}
        {page === 'public' && <PublicCyclesPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'audit' && <AuditPage />}
        {page === 'site-pages' && <SitePagesPage roles={roles} />}
        {page === 'site-banners' && <SiteBannersPage roles={roles} />}
        {page === 'site-menus' && <SiteMenusPage roles={roles} />}
        {page === 'site-settings' && <SiteSettingsPage roles={roles} />}
        {page === 'site-roles' && isAdmin && <SiteRolesPage />}
      </main>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setRoles(null);
    // Vai trò quản trị/biên tập (migration 0042); nếu chưa chạy migration thì chỉ kiểm quản trị viên như trước
    if (session) {
      void rpc<string[]>('get_my_site_roles').then(setRoles).catch(() =>
        rpc<boolean>('is_platform_admin').then((a) => setRoles(a ? ['admin'] : [])).catch(() => setRoles([])));
    }
  }, [session]);

  if (!supabase) return <main className="login"><h1>Chưa cấu hình</h1><p className="muted">Thiếu biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY khi build (xem docs/DEPLOY_CLOUDFLARE.md).</p></main>;
  if (session === undefined) return <p className="muted" style={{ padding: 24 }}>Đang tải…</p>;
  if (!session) return <Login />;
  if (roles === null) return <p className="muted" style={{ padding: 24 }}>Đang kiểm tra quyền…</p>;
  if (roles.length === 0) {
    return (
      <main className="login">
        <h1>Không có quyền</h1>
        <p className="msg error">Tài khoản {session.user.email} chưa được cấp quyền quản trị hoặc biên tập.</p>
        <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
      </main>
    );
  }
  return <Admin session={session} roles={roles} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
