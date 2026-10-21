import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { AuditPage, OrgDetailPage, OrgsPage, OverviewPage, PaymentsPage, PlansPage, PublicCyclesPage, ReviewsPage, SettingsPage } from './pages';
import { clean, rpc, supabase } from './supabase';
import './styles.css';

/**
 * Trang quản trị nền tảng AgriConnect (D53). Chỉ tài khoản có tên trong bảng quản trị viên vào được; quyền kiểm ở CSDL
 * (mọi hàm admin_* đều kiểm lại). Quản trị viên chỉ xem số liệu tổng hợp, không đọc dữ liệu vận hành của nhà vườn.
 */
const PAGES: { id: string; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: '📊' },
  { id: 'orgs', label: 'Cơ sở', icon: '🏡' },
  { id: 'plans', label: 'Gói và giá', icon: '🏷️' },
  { id: 'payments', label: 'Thanh toán', icon: '💵' },
  { id: 'reviews', label: 'Duyệt hồ sơ', icon: '✅' },
  { id: 'public', label: 'Vụ công khai', icon: '🌐' },
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

function Admin({ session }: { session: Session }) {
  const [page, setPage] = useState('overview');
  const [orgId, setOrgId] = useState<string | null>(null);
  const go = (p: string) => { setPage(p); setOrgId(null); };
  const title = PAGES.find((p) => p.id === page)?.label ?? '';
  return (
    <div className="shell">
      <aside>
        <h1>AgriConnect<br /><small>Quản trị nền tảng</small></h1>
        <nav>
          {PAGES.map((p) => (
            <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}><span>{p.icon}</span> {p.label}</button>
          ))}
        </nav>
        <div className="who">
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
        <button onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>
      </main>
    );
  }
  return <Admin session={session} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
