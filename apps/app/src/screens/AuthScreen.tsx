import { useEffect, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { LangSwitch } from '../components/LangSwitch';
import { useAuth } from '../lib/auth';
import { InstallGuide } from '../components/InstallGuide';
import { PhoneSignupForm } from '../components/PhoneSignupForm';
import { friendlyError } from '../lib/errors';
import { setStoredRef, storedRef } from '../lib/referral';
import { ContactCard } from '../components/ContactCard';

type Mode = 'signin' | 'signup' | 'forgot' | 'newpass';

export function AuthScreen() {
  const { t } = useLingui();
  const { recovering, signIn, signUp, sendReset, setNewPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(recovering ? 'newpass' : 'signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [byPhone, setByPhone] = useState(false); // đăng ký bằng số điện thoại (không có email)
  const [fullName, setFullName] = useState('');
  const [agree, setAgree] = useState(false);
  const [refCode, setRefCode] = useState(storedRef);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('auth.remember') !== '0'; } catch { return true; } });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Nhớ tài khoản đã đăng nhập lần trước (mật khẩu do trình duyệt / điện thoại tự lưu, app không lưu mật khẩu)
  useEffect(() => { try { const s = localStorage.getItem('auth.last'); if (s) setIdentifier(s); } catch { /* bỏ qua */ } }, []);

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
    if (effective === 'signin' && !id) return setError(t`Hãy nhập email hoặc số điện thoại.`);
    if ((effective === 'signup' || effective === 'forgot') && !id.includes('@')) {
      return setError(
        effective === 'forgot' && id
          ? t`Số điện thoại: nhân viên hãy nhờ chủ cơ sở đặt lại mật khẩu; chủ hộ đăng ký bằng số điện thoại hãy liên hệ Acovin qua Zalo để được đặt lại.`
          : t`Chủ Hộ/HTX đăng ký bằng email. Hãy nhập email của bạn.`,
      );
    }
    if (effective === 'signup' && fullName.trim().length < 2) return setError(t`Hãy nhập họ tên người đại diện (ít nhất 2 ký tự).`);
    if ((effective === 'signup' || effective === 'newpass') && password.length < 8) {
      return setError(t`Mật khẩu cần ít nhất 8 ký tự.`);
    }
    if (effective === 'signup' && !agree) return setError(t`Hãy tích chọn đồng ý với điều khoản dịch vụ và chính sách bảo mật.`);
    setBusy(true);
    try {
      if (effective === 'signin') {
        await signIn(id, password);
        try { localStorage.setItem('auth.remember', remember ? '1' : '0'); if (remember) localStorage.setItem('auth.last', id); else localStorage.removeItem('auth.last'); } catch { /* bỏ qua */ }
      } else if (effective === 'signup') {
        setStoredRef(refCode); // được điền sẵn vào ô Mã giới thiệu khi tạo cơ sở đầu tiên
        const needsConfirm = await signUp(id, password, fullName);
        if (needsConfirm) {
          setInfo(t`Đã gửi thư xác nhận. Hãy mở email, bấm liên kết xác nhận, rồi quay lại đăng nhập.`);
          setMode('signin');
        }
      } else if (effective === 'forgot') {
        await sendReset(id);
        setInfo(t`Nếu email này có tài khoản, bạn sẽ nhận được thư hướng dẫn đặt lại mật khẩu.`);
      } else {
        await setNewPassword(password);
        setInfo(t`Đã đổi mật khẩu.`);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const title = {
    signin: t`Đăng nhập`,
    signup: t`Tạo tài khoản`,
    forgot: t`Quên mật khẩu`,
    newpass: t`Đặt mật khẩu mới`,
  }[effective];

  const tabbed = !recovering && (effective === 'signin' || effective === 'signup');
  const pwInput = (
    <span className="pwfield">
      <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
        autoComplete={effective === 'signin' ? 'current-password' : 'new-password'} />
      <button type="button" className="pwtoggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t`Ẩn mật khẩu` : t`Hiện mật khẩu`}>{showPw ? '🙈' : '👁'}</button>
    </span>
  );

  return (
    <div className="authpage">
      <header className="auth-hero">
        <span className="auth-logo" aria-hidden><img src="/logo-mark.png" alt="" width="56" height="56" /></span>
        <h1>Acovin</h1>
        <p><Trans>Kết nối nông nghiệp số Việt Nam</Trans></p>
      </header>

      <main className="auth auth-card">
        <LangSwitch />
        {tabbed ? (
          <div className="seg" role="tablist" aria-label={t`Chọn chức năng`}>
            <button role="tab" aria-selected={effective === 'signin'} className={effective === 'signin' ? 'on' : ''} onClick={() => go('signin')}><Trans>Đăng nhập</Trans></button>
            <button role="tab" aria-selected={effective === 'signup'} className={effective === 'signup' ? 'on' : ''} onClick={() => go('signup')}><Trans>Tạo tài khoản</Trans></button>
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {effective === 'signup' && (
          <div className="chips" role="tablist" aria-label={t`Cách đăng ký`}>
            <button type="button" role="tab" aria-selected={!byPhone} className={!byPhone ? 'chip active' : 'chip'} onClick={() => { setByPhone(false); setError(null); }}><Trans>Dùng email</Trans></button>
            <button type="button" role="tab" aria-selected={byPhone} className={byPhone ? 'chip active' : 'chip'} onClick={() => { setByPhone(true); setError(null); }}><Trans>Dùng điện thoại</Trans></button>
          </div>
        )}
        {effective === 'signup' && byPhone && <PhoneSignupForm />}
        {effective === 'signup' && !byPhone && <p className="muted auth-hint"><Trans>Dành cho chủ Hộ / Hợp tác xã. Nhân viên dùng tài khoản do chủ cơ sở cấp.</Trans></p>}

        <form onSubmit={onSubmit} noValidate style={effective === 'signup' && byPhone ? { display: 'none' } : undefined}>
          {effective !== 'newpass' && (
            <label>
              {effective === 'signin' ? t`Email hoặc số điện thoại` : 'Email'}
              <input
                type={effective === 'signin' ? 'text' : 'email'}
                autoComplete={effective === 'signin' ? 'username' : 'email'}
                inputMode={effective === 'signin' ? 'text' : 'email'}
                autoCapitalize="none"
                placeholder={effective === 'signin' ? t`Email hoặc số điện thoại` : 'ten@email.com'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              {effective === 'signin' && <small><Trans>Nhân viên dùng số điện thoại do chủ cơ sở cấp.</Trans></small>}
            </label>
          )}
          {effective !== 'forgot' && (
            <label>
              {effective === 'newpass' ? t`Mật khẩu mới` : effective === 'signup' ? t`Mật khẩu (ít nhất 8 ký tự)` : t`Mật khẩu`}
              {pwInput}
            </label>
          )}
          {effective === 'signup' && (
            <label>
              <Trans>Họ tên người đại diện</Trans>
              <input autoComplete="name" maxLength={80} placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          )}

          {effective === 'signup' && (
            <label>
              <Trans>Mã giới thiệu (nếu có)</Trans>
              <input value={refCode} maxLength={20} autoCapitalize="characters" placeholder={t`Ví dụ: DL-HUNG`} onChange={(e) => setRefCode(e.target.value.toUpperCase())} />
              <small><Trans>Không có thì để trống.</Trans></small>
            </label>
          )}
          {effective === 'signup' && (
            <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span><Trans>Đồng ý với <a href="/chinh-sach" target="_blank" rel="noopener noreferrer">điều khoản dịch vụ và chính sách bảo mật</a> của hệ thống</Trans></span></label>
          )}

          {error && <p className="msg error" role="alert">{error}</p>}
          {info && <p className="msg ok" role="status">{info}</p>}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? t`Đang xử lý…` : effective === 'forgot' ? t`Gửi thư đặt lại mật khẩu` : title}
          </button>
          {effective === 'signin' && (
            <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span><Trans>Nhớ tài khoản</Trans></span></label>
          )}
        </form>

        {!recovering && (
          <div className="links">
            {effective === 'forgot' && <button className="link" onClick={() => go('signin')}><Trans>Quay lại đăng nhập</Trans></button>}
            {effective === 'signin' && <button className="link" onClick={() => go('forgot')}><Trans>Quên mật khẩu (chủ Hộ / HTX)</Trans></button>}
          </div>
        )}
      </main>
      {tabbed && <InstallGuide />}
      <div className="auth-contact"><ContactCard /></div>
      <p className="auth-foot"><Trans>Dữ liệu của bạn riêng tư và được bảo vệ</Trans></p>
    </div>
  );
}
