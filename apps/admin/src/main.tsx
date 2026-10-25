import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { clean, rpc, supabase } from '@agriconnect/admin-kit';
import { AuditPage, OrgDetailPage, OrgsPage, OverviewPage, PaymentsPage, PlansPage, RolesPage, SettingsPage } from './pages';
import '@agriconnect/admin-kit/src/styles.css';

/**
 * Trang quản trị NỀN TẢNG Agricovi (D53): cơ sở, gói, thanh toán, cấu hình, nhật ký kiểm toán. Chỉ tài khoản có tên trong bảng
 * quản trị viên vào được; quyền kiểm ở CSDL (mọi hàm admin_* đều kiểm lại). Quản trị viên chỉ xem số liệu tổng hợp, không đọc dữ liệu
 * vận hành của nhà vườn.
 * Từ D63, nội dung và kiểm duyệt WEBSITE (bài viết, vật tư, banner, duyệt hồ sơ, vụ công khai…) nằm ở trang quản trị website riêng (apps/webadmin).
 */
const WEBADMIN_URL = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}).VITE_WEBADMIN_URL;

const PAGES: { id: string; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: '📊' },
  { id: 'orgs', label: 'Cơ sở', icon: '🏡' },
  { id: 'plans', label: 'Gói và giá', icon: '🏷️' },
  { id: 'payments', label: 'Thanh toán', icon: '💵' },
  { id: 'roles', label: 'Tên vai trò', icon: '🛡️' },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️' },
  { id: 'audit', label: 'Nhật ký kiểm toán', icon: '📜' },
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
      <h1>Agricovi — Quản trị nền tảng</h1>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Mật khẩu<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>Đăng nhập</button>
      </form>
    </main>
  );
}

function Admin({ session }: { session: Session }) {
  const [page, setPage] = useState('overview');
  const [orgId, setOrgId] = useState<string | null>(null);
  // "reviews" (hồ sơ chờ duyệt) giờ ở quản trị website
  const go = (p: string) => { if (p === 'reviews' && WEBADMIN_URL) { window.open(WEBADMIN_URL, '_blank', 'noopener'); return; } setPage(p); setOrgId(null); };
  const title = PAGES.find((p) => p.id === page)?.label ?? '';
  return (
    <div className="shell">
      <aside>
        <h1>Agricovi<br /><small>Quản trị nền tảng</small></h1>
        <nav>
          {PAGES.map((p) => (
            <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}><span>{p.icon}</span> {p.label}</button>
          ))}
          {WEBADMIN_URL && <a className="navlink" href={WEBADMIN_URL} target="_blank" rel="noopener noreferrer"><span>🌐</span> Quản trị website ↗</a>}
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
        {page === 'roles' && <RolesPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'audit' && <AuditPage />}
      </main>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setIsAdmin(null);
    if (session) void rpc<boolean>('is_platform_admin').then(setIsAdmin).catch(() => setIsAdmin(false));
  }, [session]);

  if (!supabase) return <main className="login"><h1>Chưa cấu hình</h1><p className="muted">Thiếu biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY khi build (xem docs/DEPLOY_CLOUDFLARE.md).</p></main>;
  if (session === undefined) return <p className="muted" style={{ padding: 24 }}>Đang tải…</p>;
  if (!session) return <Login />;
  if (isAdmin === null) return <p className="muted" style={{ padding: 24 }}>Đang kiểm tra quyền…</p>;
  if (!isAdmin) {
    return (
      <main className="login">
        <h1>Không có quyền</h1>
        <p className="msg error">Tài khoản {session.user.email} không phải quản trị viên nền tảng.</p>
        {WEBADMIN_URL && <p>Nếu bạn là biên tập viên website, hãy vào <a href={WEBADMIN_URL}>trang quản trị website</a>.</p>}
        <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
      </main>
    );
  }
  return <Admin session={session} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
