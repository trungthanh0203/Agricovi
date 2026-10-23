import { useState, type FormEvent } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import type { MyOrg } from '../lib/orgs';
import {
  createStaffAccount, isLeaderMode, resetStaffPassword, WORK_MODE_LABEL, type StaffCredentials, type WorkMode,
} from '../lib/staff';
import type { TeamRow, WorkerRow } from '../lib/teams';
import { RolePicker } from './RolePicker';
import { setMemberPositions } from '../lib/positions';

/**
 * Chủ cơ sở tạo tài khoản nhân viên đăng nhập bằng số điện thoại; hệ thống sinh mật khẩu tạm ngẫu nhiên, hiện MỘT lần.
 * Kiểu phân hệ do tổ trưởng chấm/ghi thì bắt buộc chọn một tổ ĐÃ CÓ tổ trưởng (quyết định D17).
 */
export function StaffCreateForm({
  org, teams, workers, onChanged,
}: { org: MyOrg; teams: TeamRow[]; workers: WorkerRow[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<MemberRole[]>(['worker']);
  const [posIds, setPosIds] = useState<string[]>([]);
  const [mode, setMode] = useState<WorkMode>('self_hourly');
  const [teamId, setTeamId] = useState('');
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
    if (roles.length === 0) return setError('Hãy chọn ít nhất một vai trò.');
    if (needTeam && !teamId) {
      return setError(
        teamsWithLeader.length === 0
          ? 'Kiểu này cần chọn một tổ. Hãy tạo tổ ở mục Phòng / Tổ trước.'
          : 'Hãy chọn một tổ lao động.',
      );
    }
    if (!navigator.onLine) return setError('Tạo tài khoản cần có mạng.');
    setBusy(true);
    try {
      const res = await createStaffAccount({
        organization_id: org.id, full_name: name, phone, roles, work_mode: mode, team_id: needTeam || teamId ? teamId || null : null,
      });
      if (posIds.length > 0 && res.user_id) await setMemberPositions(org.id, res.user_id, posIds); // vai trò riêng
      setCreds(res);
      setName('');
      setPhone('');
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
        <RolePicker orgType={org.type} orgId={org.id} value={roles} onChange={setRoles} positionIds={posIds} onPositionsChange={setPosIds} />
        <label>
          Kiểu phân hệ
          <select value={mode} onChange={(e) => setMode(e.target.value as WorkMode)}>
            {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <label>
          Phòng / Tổ{needTeam ? ' (bắt buộc)' : ' (không bắt buộc)'}
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— Không chọn —</option>
            {teamsWithLeader.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.leader_worker_id ? `tổ trưởng ${leaderName(t)}` : 'chưa có tổ trưởng'}</option>)}
          </select>
          {teamsWithLeader.length === 0 && <small>Chưa có tổ nào. Hãy tạo ở mục Phòng / Tổ.</small>}
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        <button type="submit" className="secondary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </form>
    </>
  );
}

export function ResetPasswordButton({ org, userId, onDone }: { org: MyOrg; userId: string; onDone: (c: StaffCredentials) => void }) {
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
      <button className="link" disabled={busy} onClick={() => void click()}>Đặt lại mật khẩu</button>
      {error && <p className="msg error" role="alert">{error}</p>}
    </>
  );
}

export function CredentialsCard({ creds, onClose }: { creds: StaffCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Đăng nhập AgriConnect\nSố điện thoại: ${creds.phone}\nMật khẩu tạm: ${creds.temp_password}`;
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
      <p className="msg warn">
        Mật khẩu này <strong>chỉ hiện một lần</strong>. Hãy chép hoặc đưa cho nhân viên ngay. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu
        (hết hạn {new Date(creds.expires_at).toLocaleDateString('vi-VN')}).
      </p>
      <div className="actions">
        <button className="secondary" onClick={() => void copy()}>{copied ? 'Đã chép' : 'Chép thông tin đăng nhập'}</button>
        <button className="secondary" onClick={onClose}>Đã lưu, đóng</button>
      </div>
    </div>
  );
}
