import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { SUPPORT_CONTACT } from '../lib/brand';
import type { OwnerSignup } from '../lib/phoneSignup';

/**
 * Chủ đăng ký bằng số điện thoại đang chờ Agricovi duyệt (hoặc bị từ chối). Tự kiểm tra lại mỗi 20 giây; được duyệt thì vào app ngay.
 */
export function OwnerPendingScreen({ signup, onCheck }: { signup: OwnerSignup; onCheck: () => void }) {
  const { signOut } = useAuth();
  useEffect(() => {
    if (signup.status !== 'pending') return;
    const t = window.setInterval(onCheck, 20000);
    return () => window.clearInterval(t);
  }, [signup.status, onCheck]);

  if (signup.status === 'rejected') {
    return (
      <main className="auth">
        <h1>Đăng ký chưa được duyệt</h1>
        <p className="msg error" role="alert">{signup.note ?? 'Agricovi chưa thể xác nhận đăng ký này.'}</p>
        <p className="muted">{SUPPORT_CONTACT}</p>
        <button className="link" onClick={() => void signOut()}>Đăng xuất</button>
      </main>
    );
  }
  return (
    <main className="auth">
      <h1>Đã nhận đăng ký</h1>
      <p className="msg ok" role="status">Cơ sở <strong>{signup.org_name}</strong> đang chờ duyệt.</p>
      <p>Chúng tôi sẽ nhắn hoặc gọi <strong>Zalo số {signup.phone}</strong> để xác nhận. Duyệt xong, màn hình này tự chuyển vào app; bạn không cần làm gì thêm.</p>
      <p className="muted">{SUPPORT_CONTACT}</p>
      <button className="secondary" onClick={onCheck}>Kiểm tra lại</button>
      <button className="link" onClick={() => void signOut()}>Đăng xuất</button>
    </main>
  );
}
