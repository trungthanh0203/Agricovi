import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import type { MyOrg } from '../lib/orgs';
import { resetStaffPassword, type StaffCredentials } from '../lib/staff';

export function ResetPasswordButton({ org, userId, onDone, label = 'Đặt lại mật khẩu', className = 'link' }: { org: MyOrg; userId: string; onDone: (c: StaffCredentials) => void; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function click() {
    if (!window.confirm('Đặt lại mật khẩu cho nhân viên này? Mật khẩu cũ sẽ không dùng được nữa.')) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await resetStaffPassword(org.id, userId));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className={className} disabled={busy} onClick={() => void click()}>{label}</button>
      {error && <p className="msg error" role="alert">{error}</p>}
    </>
  );
}

export function CredentialsCard({ creds, onClose }: { creds: StaffCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Đăng nhập Acovin\nSố điện thoại: ${creds.phone}\nMật khẩu tạm: ${creds.temp_password}${creds.pin_code ? `\nMã đặt PIN chấm công: ${creds.pin_code} (dùng ở máy chấm công, hạn 24 giờ)` : ''}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="card cred" role="status">
      <h3 className="sub">Đã tạo tài khoản</h3>
      <p>Số điện thoại: <strong>{creds.phone}</strong></p>
      <p>Mật khẩu tạm: <strong className="mono">{creds.temp_password}</strong></p>
      {creds.pin_code && <p>Mã đặt PIN chấm công: <strong className="mono">{creds.pin_code}</strong> <span className="muted">(6 số, dùng một lần ở máy chấm công trong 24 giờ; người làm tự đặt PIN riêng và chụp khuôn mặt làm mẫu)</span></p>}
      <p className="msg warn">
        {creds.pin_code ? 'Mật khẩu và mã PIN' : 'Mật khẩu này'} <strong>chỉ hiện một lần</strong>. Quên thì bấm Đổi mật khẩu hoặc Cấp mã PIN mới ở hồ sơ người đó. Hãy chép hoặc đưa cho nhân viên ngay. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu
        (hết hạn {new Date(creds.expires_at).toLocaleDateString('vi-VN')}).
      </p>
      <div className="actions">
        <button className="secondary" onClick={() => void copy()}>{copied ? 'Đã chép' : 'Chép thông tin đăng nhập'}</button>
        <button className="secondary" onClick={onClose}>Đã lưu, đóng</button>
      </div>
    </div>
  );
}
