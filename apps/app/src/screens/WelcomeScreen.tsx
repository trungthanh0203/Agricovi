import { useEffect, useState } from 'react';
import { InvitationsPanel } from '../components/InvitationsPanel';
import { myInvitations } from '../lib/members';
import { useAuth } from '../lib/auth';
import { CreateOrgScreen } from './CreateOrgScreen';

/**
 * Màn hình cho tài khoản chưa thuộc cơ sở nào: nhận lời mời (nhân viên, quản lý...) hoặc tạo cơ sở của riêng mình.
 * Người được mời không bị ép phải tạo cơ sở.
 */
export function WelcomeScreen({ isStaff = false }: { isStaff?: boolean }) {
  const { session, signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const [invCount, setInvCount] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.onLine) return setInvCount(0);
    myInvitations().then((r) => setInvCount(r.length)).catch(() => setInvCount(0));
  }, []);

  if (isStaff && invCount === 0) {
    return (
      <main className="auth">
        <h1>Chưa có cơ sở</h1>
        <p className="msg warn" role="status">Tài khoản của bạn chưa thuộc cơ sở nào. Hãy liên hệ chủ cơ sở.</p>
        <button className="link" onClick={() => void signOut()}>Đăng xuất</button>
      </main>
    );
  }
  if (creating || invCount === 0) return <CreateOrgScreen first />;
  if (invCount === null) return <p className="center muted">Đang tải…</p>;

  return (
    <main className="auth">
      <img className="welcome-img" src="/welcome.webp" alt="" width="900" height="468" />
      <h1>Chào mừng!</h1>
      <p className="muted">Tài khoản: {session?.user.email}</p>
      <InvitationsPanel onChanged={() => setInvCount((n) => n)} />
      {!isStaff && <button className="secondary" onClick={() => setCreating(true)}>Tôi muốn tạo cơ sở của riêng mình</button>}
      <button className="link" onClick={() => void signOut()}>Đăng xuất</button>
    </main>
  );
}
