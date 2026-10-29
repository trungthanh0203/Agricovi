import { useCallback, useState, type FormEvent } from 'react';
import { Turnstile, turnstileEnabled } from './Turnstile';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { registerByPhone } from '../lib/phoneSignup';

/**
 * Đăng ký chủ cơ sở bằng số điện thoại (cho hộ không có email). Sau khi gửi, tài khoản đăng nhập được ngay nhưng ở trạng thái
 * CHỜ DUYỆT: quản trị Agricovi liên hệ qua Zalo số này để xác nhận rồi duyệt thì cơ sở mới được tạo.
 */
export function PhoneSignupForm() {
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<'household' | 'cooperative'>('household');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onToken = useCallback((t: string) => setToken(t), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError('Hãy nhập họ tên người đại diện.');
    if (orgName.trim().length < 2) return setError('Hãy nhập tên cơ sở (ví dụ "Vườn nhà Lan").');
    if (!phone.trim()) return setError('Hãy nhập số điện thoại có dùng Zalo.');
    if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.');
    if (turnstileEnabled && !token) return setError('Hãy chờ khung "xác nhận bạn là người thật" hiện xong rồi thử lại.');
    if (!navigator.onLine) return setError('Đăng ký cần có mạng.');
    setBusy(true);
    try {
      const res = await registerByPhone({ phone, password, full_name: fullName, org_name: orgName, org_type: orgType, turnstile_token: token || undefined });
      await signIn(res.phone, password); // đăng nhập ngay; app hiện màn "đang chờ duyệt"
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="muted auth-hint">Dành cho chủ Hộ / Hợp tác xã <strong>không có email</strong>. Chúng tôi sẽ liên hệ qua Zalo số điện thoại bạn nhập để xác nhận rồi mở cơ sở cho bạn (miễn phí).</p>
      <label>
        Họ tên người đại diện
        <input value={fullName} maxLength={80} autoComplete="name" onChange={(e) => setFullName(e.target.value)} />
      </label>
      <label>
        Tên cơ sở
        <input value={orgName} maxLength={80} placeholder="Ví dụ: Vườn nhà Lan" onChange={(e) => setOrgName(e.target.value)} />
      </label>
      <label>
        Loại cơ sở
        <select value={orgType} onChange={(e) => setOrgType(e.target.value as 'household' | 'cooperative')}>
          <option value="household">Hộ nông dân / trang trại</option>
          <option value="cooperative">Hợp tác xã</option>
        </select>
      </label>
      <label>
        Số điện thoại (có dùng Zalo)
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0912345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <small>Số này dùng để đăng nhập và để chúng tôi xác nhận qua Zalo.</small>
      </label>
      <label>
        Mật khẩu
        <span className="pwfield">
          <input type={showPw ? 'text' : 'password'} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="pwtoggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPw ? '🙈' : '👁'}</button>
        </span>
        <small>Ít nhất 8 ký tự. Hãy nhớ mật khẩu này.</small>
      </label>
      <Turnstile onToken={onToken} />
      {error && <p className="msg error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi đăng ký'}</button>
    </form>
  );
}
