import { useState, type FormEvent } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import type { MyOrg } from '../lib/orgs';
import { issuePinCodeForUser } from '../lib/kiosk';
import {
  createStaffAccount, isLeaderMode, resetStaffPassword, WORK_MODE_LABEL, type StaffCredentials, type WorkMode,
} from '../lib/staff';
import type { TeamRow, WorkerRow } from '../lib/teams';
import { PositionPicker } from './PositionPicker';
import { AreaChoice } from './MemberAreas';
import { setMemberPosition } from '../lib/positions';
import { setMemberAreas, setMemberDescription } from '../lib/members';

/**
 * Chủ cơ sở tạo tài khoản nhân viên đăng nhập bằng số điện thoại; hệ thống sinh mật khẩu tạm ngẫu nhiên, hiện MỘT lần.
 * Kiểu phân hệ do tổ trưởng chấm/ghi thì bắt buộc chọn một tổ ĐÃ CÓ tổ trưởng (quyết định D17).
 */
export function StaffCreateForm({
  org, teams, workers, onChanged, onCancel,
}: { org: MyOrg; teams: TeamRow[]; workers: WorkerRow[]; onChanged: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<MemberRole[]>(['worker']);
  const [posId, setPosId] = useState('');
  const [areaSel, setAreaSel] = useState<string[] | null>(null); // null = tất cả phân khu
  const [mode, setMode] = useState<WorkMode>('self_hourly');
  const [teamId, setTeamId] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<StaffCredentials | null>(null);

  // Hiện mọi tổ đang hoạt động, kể cả tổ chưa có tổ trưởng (chủ chọn tổ trưởng sau, D38)
  const teamsWithLeader = teams.filter((t) => t.is_active !== false);
  const leaderName = (t: TeamRow) => workers.find((w) => w.id === t.leader_worker_id)?.full_name ?? '';
  const needTeam = isLeaderMode(mode);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Hãy nhập họ tên nhân viên.');
    if (!phone.trim()) return setError('Hãy nhập số điện thoại của nhân viên.');
    if (!posId) return setError('Hãy chọn chức vụ cho nhân viên.');
    if (areaSel && areaSel.length === 0) return setError('Hãy chọn ít nhất một phân khu, hoặc chọn "Tất cả phân khu".');
    if (needTeam && !teamId) {
      return setError(
        teamsWithLeader.length === 0
          ? 'Kiểu này cần chọn một tổ. Hãy tạo tổ ở mục Tổ chức trước.'
          : 'Hãy chọn một tổ lao động.',
      );
    }
    if (!navigator.onLine) return setError('Tạo tài khoản cần có mạng.');
    setBusy(true);
    try {
      const res = await createStaffAccount({
        organization_id: org.id, full_name: name, phone, roles, work_mode: mode, team_id: needTeam || teamId ? teamId || null : null,
      });
      if (posId && res.user_id) await setMemberPosition(org.id, res.user_id, posId); // chức vụ quyết định vai trò và quyền
      if (areaSel && areaSel.length > 0 && res.user_id) await setMemberAreas(org.id, res.user_id, areaSel); // phân khu làm việc
      if (desc.trim() && res.user_id) await setMemberDescription(org.id, res.user_id, desc); // mô tả
      const pin_code = res.user_id ? (await issuePinCodeForUser(org.id, res.user_id)) ?? undefined : undefined;
      setCreds({ ...res, pin_code });
      setName('');
      setPhone('');
      setDesc('');
      onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
      <form onSubmit={onSubmit} className="inline-form" noValidate>
        <label>
          Họ tên
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Số điện thoại
          <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
        </label>
        <PositionPicker orgId={org.id} value={posId} onChange={(id, role) => { setPosId(id); setRoles([role]); }} />
        <label>
          Kiểu phân hệ
          <select value={mode} onChange={(e) => setMode(e.target.value as WorkMode)}>
            {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).filter((m) => m !== 'monthly_salary').map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <label>
          Phòng / Tổ{needTeam ? ' (bắt buộc)' : ' (không bắt buộc)'}
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— Không chọn —</option>
            {teamsWithLeader.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.leader_worker_id ? `tổ trưởng ${leaderName(t)}` : 'chưa có tổ trưởng'}</option>)}
          </select>
          {teamsWithLeader.length === 0 && <small>Chưa có tổ nào. Hãy tạo ở mục Tổ chức.</small>}
        </label>
        <fieldset className="roles">
          <legend>Phân khu làm việc</legend>
          <AreaChoice orgId={org.id} value={areaSel} onChange={setAreaSel} />
        </fieldset>
        <label>
          Mô tả (không bắt buộc)
          <textarea rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Lái máy, phụ trách tưới" />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
          {onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Hủy</button>}
        </div>
      </form>
    </>
  );
}

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
  const text = `Đăng nhập Agricovi\nSố điện thoại: ${creds.phone}\nMật khẩu tạm: ${creds.temp_password}${creds.pin_code ? `\nMã đặt PIN chấm công: ${creds.pin_code} (dùng ở máy chấm công, hạn 24 giờ)` : ''}`;
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
