import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { removeMember, setMemberSuspended, type Member } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import type { PermOverrides } from '../lib/permissions';
import { setMemberPosition, type PositionRow } from '../lib/positions';
import { roleSummary } from '../lib/roles';
import { updateStaffProfile, type StaffCredentials, WORK_MODE_LABEL, type WorkMode } from '../lib/staff';
import { assignWorkerToTeam, type TeamRow, type WorkerRow } from '../lib/teams';
import { Collapsible } from './Collapsible';
import { MemberAreas } from './MemberAreas';
import { MemberPay } from './MemberPay';
import { MemberPermissions } from './MemberPermissions';
import { PositionPicker } from './PositionPicker';
import { ResetPasswordButton } from './StaffAccountsSection';

/**
 * Hồ sơ một nhân sự (D85, chỉ chủ): mọi thứ về MỘT người nằm một chỗ, 4 thẻ thu gọn:
 * 1) Thông tin và tài khoản · 2) Chức vụ và quyền (kèm trang trại được giao) · 3) Phòng / Tổ · 4) Trả công.
 */
export function MemberProfile({ org, member, worker, team, teams, position, overrides, areas, onBack, onChanged, onCreds }: {
  org: MyOrg;
  member: Member;
  worker: WorkerRow | null;
  team: TeamRow | null;
  teams: TeamRow[];
  position: PositionRow | null;
  overrides: PermOverrides;
  areas: string[] | null;
  onBack: () => void;
  onChanged: () => void;
  onCreds: (c: StaffCredentials) => void;
}) {
  const label = member.is_staff ? member.full_name ?? member.phone ?? '' : member.email;
  const suspended = member.status === 'suspended';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [name, setName] = useState(member.full_name ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [posId, setPosId] = useState(position?.id ?? '');
  const [teamId, setTeamId] = useState(team?.id ?? '');
  useEffect(() => { setPosId(position?.id ?? ''); }, [position?.id]);
  useEffect(() => { setTeamId(team?.id ?? ''); }, [team?.id]);

  async function run(fn: () => Promise<unknown>, done?: string, after?: () => void) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); onChanged(); after?.(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="member-profile">
      <div className="menubar">
        <button className="menu-back" onClick={onBack} aria-label="Quay lại danh sách nhân sự">‹ Danh sách</button>
        <strong className="menu-cur">{label}</strong>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
      {suspended && <p className="msg warn" role="status">Đang tạm dừng: người này không đăng nhập được.</p>}
      <p className="muted">{position ? `${position.name} · ` : ''}{roleSummary(member.roles)}{team ? ` · Tổ ${team.name}` : ''}</p>

      <Collapsible title="Thông tin và tài khoản" summary={member.is_staff ? (member.phone ?? '') : member.email} defaultOpen>
        {member.is_staff ? (
          <div className="inline-form">
            <label>Họ tên<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <label>Số điện thoại (dùng để đăng nhập)<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <p className="muted">Nếu đổi số điện thoại, nhân viên đăng nhập bằng số mới (mật khẩu giữ nguyên).</p>
            {member.must_change_password && <p className="msg warn">Chưa đổi mật khẩu tạm — chưa dùng được dữ liệu.</p>}
            <div className="btnrow">
              <button className="primary" disabled={busy} onClick={() => {
                if (name.trim().length < 2) return setError('Hãy nhập họ tên (ít nhất 2 ký tự).');
                if (!phone.trim()) return setError('Hãy nhập số điện thoại.');
                void run(() => updateStaffProfile(org.id, member.user_id, name, phone), 'Đã cập nhật thông tin.');
              }}>Lưu</button>
              <button type="button" className="secondary" onClick={() => { setName(member.full_name ?? ''); setPhone(member.phone ?? ''); setError(null); }}>Hủy</button>
            </div>
            <ResetPasswordButton org={org} userId={member.user_id} onDone={(c) => { onCreds(c); onChanged(); }} />
          </div>
        ) : (
          <p>Tài khoản email: <strong>{member.email}</strong></p>
        )}
        <div className="btnrow">
          <button type="button" className="secondary" disabled={busy} onClick={() => {
            if (suspended || window.confirm(`Tạm dừng ${label}? Người này sẽ không đăng nhập hay xem được dữ liệu cơ sở cho tới khi bạn bấm Dùng lại.`))
              void run(() => setMemberSuspended(org.id, member.user_id, !suspended));
          }}>{suspended ? 'Dùng lại (cho đăng nhập)' : 'Tạm dừng (không cho đăng nhập)'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => {
            if (window.confirm(`Gỡ ${label} khỏi cơ sở? Người này sẽ không vào được nữa; lịch sử đã ghi vẫn được giữ.`))
              void run(() => removeMember(org.id, member.user_id), undefined, onBack);
          }}>Gỡ khỏi cơ sở</button>
        </div>
      </Collapsible>

      <Collapsible title="Chức vụ và quyền" summary={position ? `${position.name} · ${roleSummary(member.roles)}` : roleSummary(member.roles)}>
        <div className="inline-form">
          <PositionPicker orgId={org.id} value={posId} onChange={(id) => setPosId(id)} disabled={busy || suspended} />
          <div className="btnrow">
            <button className="primary" disabled={busy || suspended || !posId} onClick={() => void run(() => setMemberPosition(org.id, member.user_id, posId), 'Đã đổi chức vụ.')}>Lưu</button>
            <button type="button" className="secondary" onClick={() => setPosId(position?.id ?? '')}>Hủy</button>
          </div>
        </div>
        <Collapsible inline highlight title="Quyền cấp riêng (ngoại lệ)" summary={Object.keys(overrides).length > 0 ? 'Đã cấp riêng' : 'Theo chức vụ'}>
          <MemberPermissions key={JSON.stringify(overrides)} orgId={org.id} userId={member.user_id} roles={member.roles} overrides={overrides} onSaved={onChanged} />
        </Collapsible>
      </Collapsible>

      <Collapsible title="Trang trại làm việc" summary={areas ? `${areas.length} trang trại` : 'Tất cả trang trại'}>
        <p className="muted">Người này chỉ thấy và ghi việc ở các trang trại được chọn. Một người làm được nhiều trang trại.</p>
        <MemberAreas key={JSON.stringify(areas)} orgId={org.id} userId={member.user_id} initial={areas} onSaved={onChanged} />
      </Collapsible>

      <Collapsible title="Phòng / Tổ" summary={team ? team.name : 'Chưa vào tổ'}>
        {worker ? (
          <div className="inline-form">
            <label>Tổ lao động
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">— Chưa vào tổ —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {member.leads_teams && member.leads_teams.length > 0 && <p className="muted">Đang là tổ trưởng: {member.leads_teams.join(', ')} (đổi tổ trưởng ở mục Phòng / Tổ).</p>}
            {member.work_mode && <p className="muted">Kiểu chấm công: {WORK_MODE_LABEL[member.work_mode as WorkMode] ?? member.work_mode}</p>}
            <div className="btnrow">
              <button className="primary" disabled={busy || !teamId || teamId === (team?.id ?? '')} onClick={() => void run(() => assignWorkerToTeam(worker.id, teamId), 'Đã đổi tổ.')}>Lưu</button>
              <button type="button" className="secondary" onClick={() => setTeamId(team?.id ?? '')}>Hủy</button>
            </div>
          </div>
        ) : <p className="muted">Người này chưa có hồ sơ lao động (hồ sơ được tạo khi người đó chấm công lần đầu).</p>}
      </Collapsible>

      <Collapsible title="Trả công" summary="theo giờ hoặc lương tháng">
        <MemberPay orgId={org.id} workerId={worker?.id ?? null} />
      </Collapsible>
    </div>
  );
}
