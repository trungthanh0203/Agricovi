import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { completePasswordChange, type StaffStatus } from '../lib/staff';

/** Nhân viên vừa nhận mật khẩu tạm: bắt buộc đặt mật khẩu mới trước khi dùng app (máy chủ cũng khóa dữ liệu tới lúc đó). */
export function ForcePasswordScreen({ status, onDone }: { status: StaffStatus; onDone: () => void }) {
  const { signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.expired) {
    return (
      <main className="auth">
        <h1>Mật khẩu tạm đã hết hạn</h1>
        <p className="msg warn" role="alert">Hãy nhờ chủ cơ sở đặt lại mật khẩu cho bạn, rồi đăng nhập lại.</p>
        <button className="secondary" onClick={() => void signOut()}>Đăng xuất</button>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) return setError('Đổi mật khẩu cần có mạng. Hãy kết nối Internet rồi thử lại.');
    if (pw.length < 8) return setError('Mật khẩu mới cần ít nhất 8 ký tự.');
    if (pw !== pw2) return setError('Hai lần nhập mật khẩu chưa giống nhau.');
    setBusy(true);
    try {
      await completePasswordChange(pw);
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>Đặt mật khẩu mới</h1>
      <p className="muted">
        {status.full_name ? `Chào ${status.full_name}. ` : ''}Mật khẩu tạm chỉ dùng một lần
        {status.org_name ? ` tại ${status.org_name}` : ''}. Hãy đặt mật khẩu của riêng bạn để tiếp tục.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <label>
          Mật khẩu mới
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <small>Ít nhất 8 ký tự, khác mật khẩu tạm.</small>
        </label>
        <label>
          Nhập lại mật khẩu mới
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
      </form>
      <button className="link" onClick={() => void signOut()}>Đăng xuất</button>
    </main>
  );
}
