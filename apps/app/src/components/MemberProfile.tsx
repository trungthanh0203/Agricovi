import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { removeMember, setMemberAreas, setMemberDescription, setMemberSuspended, type Member } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import type { PermOverrides } from '../lib/permissions';
import { setMemberPosition, type PositionRow } from '../lib/positions';
import { updateStaffProfile, type StaffCredentials } from '../lib/staff';
import { assignWorkerToTeam, type TeamRow, type WorkerRow } from '../lib/teams';
import { Collapsible } from './Collapsible';
import { AreaChoice } from './MemberAreas';
import { MemberPay } from './MemberPay';
import { MemberPermissions } from './MemberPermissions';
import { PositionPicker } from './PositionPicker';
import { ResetPasswordButton } from './StaffAccountsSection';

/**
 * Hồ sơ một nhân sự (D85, chỉ chủ): ba nút Đặt lại mật khẩu / Tạm dừng / Gỡ khỏi cơ sở ở TRÊN CÙNG; dưới là MỘT biểu mẫu
 * (họ tên, điện thoại, chức vụ, phòng/tổ, phân khu, mô tả) với một nút Lưu; quyền cấp riêng và Trả công để thu gọn.
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
  const [areaSel, setAreaSel] = useState<string[] | null>(areas);
  const [desc, setDesc] = useState(member.description ?? '');
  useEffect(() => { setPosId(position?.id ?? ''); }, [position?.id]);
  useEffect(() => { setTeamId(team?.id ?? ''); }, [team?.id]);

  async function run(fn: () => Promise<unknown>, done?: string, after?: () => void) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); onChanged(); after?.(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const norm = (a: string[] | null) => JSON.stringify(a === null ? null : [...a].sort());
  function reset() {
    setName(member.full_name ?? ''); setPhone(member.phone ?? ''); setPosId(position?.id ?? ''); setTeamId(team?.id ?? '');
    setAreaSel(areas); setDesc(member.description ?? ''); setError(null);
  }
  function save() {
    if (member.is_staff) {
      if (name.trim().length < 2) return setError('Hãy nhập họ tên (ít nhất 2 ký tự).');
      if (!phone.trim()) return setError('Hãy nhập số điện thoại.');
    }
    if (areaSel && areaSel.length === 0) return setError('Hãy chọn ít nhất một phân khu, hoặc chọn "Tất cả phân khu".');
    void run(async () => {
      // chỉ gửi phần đã đổi
      if (member.is_staff && (name.trim() !== (member.full_name ?? '') || phone.trim() !== (member.phone ?? ''))) await updateStaffProfile(org.id, member.user_id, name, phone);
      if (posId && posId !== (position?.id ?? '')) await setMemberPosition(org.id, member.user_id, posId);
      if (worker && teamId && teamId !== (team?.id ?? '')) await assignWorkerToTeam(worker.id, teamId);
      if (norm(areaSel) !== norm(areas)) await setMemberAreas(org.id, member.user_id, areaSel);
      if (desc.trim() !== (member.description ?? '')) await setMemberDescription(org.id, member.user_id, desc);
    }, 'Đã lưu.');
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

      <div className="btnrow">
        {member.is_staff && <ResetPasswordButton org={org} userId={member.user_id} onDone={(c) => { onCreds(c); onChanged(); }} />}
        <button type="button" className="secondary" disabled={busy} onClick={() => {
          if (suspended || window.confirm(`Tạm dừng ${label}? Người này sẽ không đăng nhập hay xem được dữ liệu cơ sở cho tới khi bạn bấm Dùng lại.`))
            void run(() => setMemberSuspended(org.id, member.user_id, !suspended));
        }}>{suspended ? 'Dùng lại (cho đăng nhập)' : 'Tạm dừng (không cho đăng nhập)'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => {
          if (window.confirm(`Gỡ ${label} khỏi cơ sở? Người này sẽ không vào được nữa; lịch sử đã ghi vẫn được giữ.`))
            void run(() => removeMember(org.id, member.user_id), undefined, onBack);
        }}>Gỡ khỏi cơ sở</button>
      </div>
      {member.is_staff && member.must_change_password && <p className="msg warn">Chưa đổi mật khẩu tạm — chưa dùng được dữ liệu.</p>}

      <div className="inline-form">
        {member.is_staff ? (
          <>
            <label>Họ tên<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <label>Số điện thoại (dùng để đăng nhập)
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <small>Nếu đổi số điện thoại, nhân viên đăng nhập bằng số mới (mật khẩu giữ nguyên).</small>
            </label>
          </>
        ) : (
          <p>Tài khoản email: <strong>{member.email}</strong></p>
        )}
        <PositionPicker orgId={org.id} value={posId} onChange={(id) => setPosId(id)} disabled={busy || suspended} />
        <label>Phòng / Tổ
          <select value={teamId} disabled={!worker} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— Chưa vào tổ —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {!worker && <small>Người này chưa có hồ sơ lao động (được tạo khi chấm công lần đầu) nên chưa xếp tổ được.</small>}
          {member.leads_teams && member.leads_teams.length > 0 && <small>Đang là tổ trưởng: {member.leads_teams.join(', ')} (đổi tổ trưởng ở mục Phòng / Tổ).</small>}
        </label>
        <fieldset className="roles">
          <legend>Phân khu làm việc</legend>
          <AreaChoice orgId={org.id} value={areaSel} onChange={setAreaSel} />
        </fieldset>
        <label>Mô tả (không bắt buộc)
          <textarea rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Lái máy, phụ trách tưới" />
        </label>
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={save}>Lưu</button>
          <button type="button" className="secondary" disabled={busy} onClick={reset}>Hủy</button>
        </div>
      </div>

      <Collapsible title="Quyền cấp riêng (ngoại lệ)" summary={Object.keys(overrides).length > 0 ? 'Đã cấp riêng' : 'Theo chức vụ'}>
        <MemberPermissions key={JSON.stringify(overrides)} orgId={org.id} userId={member.user_id} roles={member.roles} overrides={overrides} onSaved={onChanged} />
      </Collapsible>

      <Collapsible title="Trả công" summary="theo giờ hoặc lương tháng">
        <MemberPay orgId={org.id} workerId={worker?.id ?? null} />
      </Collapsible>
    </div>
  );
}
