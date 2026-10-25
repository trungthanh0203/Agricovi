import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';

type Mode = 'signin' | 'signup' | 'forgot' | 'newpass';

export function AuthScreen() {
  const { recovering, signIn, signUp, sendReset, setNewPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(recovering ? 'newpass' : 'signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Khi vừa bấm liên kết đặt lại mật khẩu trong email
  const effective: Mode = recovering ? 'newpass' : mode;

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const id = identifier.trim();
    if (effective === 'signin' && !id) return setError('Hãy nhập email hoặc số điện thoại.');
    if ((effective === 'signup' || effective === 'forgot') && !id.includes('@')) {
      return setError(
        effective === 'forgot' && id
          ? 'Số điện thoại là tài khoản nhân viên do chủ cơ sở tạo. Hãy nhờ chủ cơ sở đặt lại mật khẩu cho bạn.'
          : 'Chủ Hộ/HTX đăng ký bằng email. Hãy nhập email của bạn.',
      );
    }
    if ((effective === 'signup' || effective === 'newpass') && password.length < 8) {
      return setError('Mật khẩu cần ít nhất 8 ký tự.');
    }
    setBusy(true);
    try {
      if (effective === 'signin') {
        await signIn(id, password);
      } else if (effective === 'signup') {
        const needsConfirm = await signUp(id, password);
        if (needsConfirm) {
          setInfo('Đã gửi thư xác nhận. Hãy mở email, bấm liên kết xác nhận, rồi quay lại đăng nhập.');
          setMode('signin');
        }
      } else if (effective === 'forgot') {
        await sendReset(id);
        setInfo('Nếu email này có tài khoản, bạn sẽ nhận được thư hướng dẫn đặt lại mật khẩu.');
      } else {
        await setNewPassword(password);
        setInfo('Đã đổi mật khẩu.');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const title = {
    signin: 'Đăng nhập',
    signup: 'Tạo tài khoản',
    forgot: 'Quên mật khẩu',
    newpass: 'Đặt mật khẩu mới',
  }[effective];

  const tabbed = !recovering && (effective === 'signin' || effective === 'signup');
  const pwInput = (
    <span className="pwfield">
      <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
        autoComplete={effective === 'signin' ? 'current-password' : 'new-password'} />
      <button type="button" className="pwtoggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPw ? '🙈' : '👁'}</button>
    </span>
  );

  return (
    <div className="authpage">
      <header className="auth-hero">
        <span className="auth-logo" aria-hidden>🌱</span>
        <h1>Agricovi</h1>
        <p>Quản lý nuôi trồng đơn giản, kết nối nông sản</p>
      </header>

      <main className="auth auth-card">
        {tabbed ? (
          <div className="seg" role="tablist" aria-label="Chọn chức năng">
            <button role="tab" aria-selected={effective === 'signin'} className={effective === 'signin' ? 'on' : ''} onClick={() => go('signin')}>Đăng nhập</button>
            <button role="tab" aria-selected={effective === 'signup'} className={effective === 'signup' ? 'on' : ''} onClick={() => go('signup')}>Tạo tài khoản</button>
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {effective === 'signup' && <p className="muted auth-hint">Dành cho chủ Hộ / Hợp tác xã. Nhân viên dùng tài khoản do chủ cơ sở cấp.</p>}

        <form onSubmit={onSubmit} noValidate>
          {effective !== 'newpass' && (
            <label>
              {effective === 'signin' ? 'Email hoặc số điện thoại' : 'Email'}
              <input
                type={effective === 'signin' ? 'text' : 'email'}
                autoComplete={effective === 'signin' ? 'username' : 'email'}
                inputMode={effective === 'signin' ? 'text' : 'email'}
                autoCapitalize="none"
                placeholder={effective === 'signin' ? 'Email hoặc số điện thoại' : 'ten@email.com'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              {effective === 'signin' && <small>Nhân viên dùng số điện thoại do chủ cơ sở cấp.</small>}
            </label>
          )}
          {effective !== 'forgot' && (
            <label>
              {effective === 'newpass' ? 'Mật khẩu mới' : 'Mật khẩu'}
              {pwInput}
              {(effective === 'signup' || effective === 'newpass') && <small>Ít nhất 8 ký tự.</small>}
            </label>
          )}

          {error && <p className="msg error" role="alert">{error}</p>}
          {info && <p className="msg ok" role="status">{info}</p>}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Đang xử lý…' : effective === 'forgot' ? 'Gửi thư đặt lại mật khẩu' : title}
          </button>
        </form>

        {!recovering && (
          <div className="links">
            {effective === 'forgot' && <button className="link" onClick={() => go('signin')}>Quay lại đăng nhập</button>}
            {effective === 'signin' && <button className="link" onClick={() => go('forgot')}>Quên mật khẩu (chủ Hộ / HTX)</button>}
          </div>
        )}
      </main>
      <p className="auth-foot">Dữ liệu của bạn riêng tư và được bảo vệ</p>
    </div>
  );
}
