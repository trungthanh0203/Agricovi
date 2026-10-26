import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import {
  fetchMemberAreas, fetchPermissionOverrides, listMembers, pendingOrgInvites, revokeInvitation, type Member, type PendingInvite,
} from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import type { PermOverrides } from '../lib/permissions';
import { inviteMemberPosition, listMemberPositions, listPositions, type PositionRow } from '../lib/positions';
import { isOwner as ownerOf, roleSummary } from '../lib/roles';
import type { StaffCredentials } from '../lib/staff';
import { createWorkerWithoutAccount, loadTeams, type TeamMembershipRow, type TeamRow, type WorkerRow } from '../lib/teams';
import { useTable } from '../lib/tables';
import { Collapsible } from './Collapsible';
import { MemberProfile } from './MemberProfile';
import { WorkerProfile } from './WorkerProfile';
import { PositionPicker } from './PositionPicker';
import { CredentialsCard, StaffCreateForm } from './StaffAccountsSection';

/**
 * Nhân sự (D85): danh sách người của cơ sở, mỗi người một dòng (tên, chức vụ, tổ, trạng thái). Chủ bấm vào một người để mở HỒ SƠ
 * (thông tin và tài khoản, chức vụ và quyền, phòng/tổ, trả công). Chủ thêm người bằng tài khoản số điện thoại hoặc mời qua email.
 * Quản lý chỉ xem danh sách; nhân viên không thấy mục này.
 */
export function MembersSection({ org }: { org: MyOrg }) {
  const isOwner = ownerOf(org.roles);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [teamLinks, setTeamLinks] = useState<TeamMembershipRow[]>([]);
  const [held, setHeld] = useState<Map<string, string[]>>(new Map());
  const [catalog, setCatalog] = useState<PositionRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, PermOverrides>>({});
  const [areaMap, setAreaMap] = useState<Record<string, string[] | null>>({});
  const [email, setEmail] = useState('');
  const [invitePos, setInvitePos] = useState('');
  const [open, setOpen] = useState<string | null>(null); // người đang mở hồ sơ
  const [adding, setAdding] = useState(false); // đang ở biểu mẫu thêm nhân sự
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [openWorker, setOpenWorker] = useState<string | null>(null); // người làm không tài khoản đang mở hồ sơ
  const areas = useTable('areas').filter((a) => a.organization_id === org.id);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<StaffCredentials | null>(null);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [m, i, t] = await Promise.all([listMembers(org.id), pendingOrgInvites(org.id), loadTeams(org.id)]);
      setMembers(m); setInvites(i); setTeams(t.teams); setWorkers(t.workers); setTeamLinks(t.members);
      const [ar, h, cat] = await Promise.all([
        fetchMemberAreas(org.id).catch(() => ({} as Record<string, string[] | null>)),
        listMemberPositions(org.id).catch(() => new Map<string, string[]>()),
        listPositions(org.id).catch(() => [] as PositionRow[]),
      ]);
      setAreaMap(ar); setHeld(h); setCatalog(cat);
      if (ownerOf(org.roles)) setOverrides(await fetchPermissionOverrides(org.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [org.id, org.roles]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return setError('Hãy nhập email của người cần mời.');
    if (!invitePos) return setError('Hãy chọn chức vụ cho người được mời.');
    void run(async () => { await inviteMemberPosition(org.id, email, invitePos); setEmail(''); },
      'Đã tạo lời mời. Hãy bảo người đó đăng ký hoặc đăng nhập bằng đúng email này, họ sẽ thấy lời mời.');
  }

  const positionOf = (uid: string) => catalog.find((p) => p.id === (held.get(uid) ?? [])[0]) ?? null;
  const workerOf = (uid: string) => workers.find((w) => w.user_id === uid) ?? null;
  const teamOf = (uid: string) => {
    const w = workerOf(uid);
    const link = w ? teamLinks.find((l) => l.worker_id === w.id) : null;
    return link ? teams.find((t) => t.id === link.team_id) ?? null : null;
  };

  const offlineWorkers = workers.filter((w) => !w.user_id);
  const selWorker = offlineWorkers.find((w) => w.id === openWorker) ?? null;
  if (isOwner && selWorker) {
    const link = teamLinks.find((l) => l.worker_id === selWorker.id);
    return <WorkerProfile org={org} worker={selWorker} team={link ? teams.find((t) => t.id === link.team_id) ?? null : null} onBack={() => setOpenWorker(null)} onChanged={() => void load()} />;
  }
  const sel = members.find((m) => m.user_id === open) ?? null;
  if (isOwner && sel && !sel.roles.includes('owner')) {
    return (
      <>
        {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
        <MemberProfile org={org} member={sel} worker={workerOf(sel.user_id)} team={teamOf(sel.user_id)} teams={teams} position={positionOf(sel.user_id)}
          overrides={overrides[sel.user_id] ?? {}} areas={areaMap[sel.user_id] ?? null} onBack={() => setOpen(null)} onChanged={() => void load()} onCreds={setCreds} />
      </>
    );
  }

  const areaText = (uid: string) => {
    if (!(uid in areaMap)) return '';
    const ids = areaMap[uid];
    return !ids ? 'Tất cả' : ids.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean).join(', ');
  };

  if (isOwner && adding) {
    return (
      <>
        <div className="menubar">
          <button className="menu-back" onClick={() => setAdding(false)} aria-label="Quay lại danh sách nhân sự">‹ Danh sách</button>
          <strong className="menu-cur">Thêm nhân sự</strong>
        </div>
        {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
        <Collapsible inline defaultOpen title="Tài khoản nhân viên (đăng nhập bằng số điện thoại)">
          <StaffCreateForm org={org} teams={teams} workers={workers} onChanged={() => void load()} onCancel={() => setAdding(false)} />
        </Collapsible>
        <Collapsible inline title="Hoặc thêm người làm không có tài khoản (làm công tháng)">
          <form className="inline-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (wName.trim().length < 2) return setError('Hãy nhập họ tên người làm.');
            void run(async () => { await createWorkerWithoutAccount(org.id, wName, wPhone, 'monthly_salary', null); setWName(''); setWPhone(''); setAdding(false); },
              'Đã thêm người làm. Bấm ✎ ở dòng của người đó để đặt lương tháng.');
          }}>
            <p className="muted">Người này không đăng nhập và không chấm công; trả lương tháng cố định. Đặt số tiền lương ở hồ sơ người đó sau khi thêm.</p>
            <label>Họ tên<input value={wName} maxLength={80} onChange={(e) => setWName(e.target.value)} /></label>
            <label>Số điện thoại (không bắt buộc)<input type="tel" inputMode="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)} /></label>
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy}>Thêm người làm</button>
              <button type="button" className="secondary" onClick={() => { setWName(''); setWPhone(''); setAdding(false); }}>Hủy</button>
            </div>
          </form>
        </Collapsible>
        <Collapsible inline title="Hoặc mời người đã có tài khoản email">
          <form onSubmit={onInvite} className="inline-form" noValidate>
            <label>
              Email người được mời
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <PositionPicker orgId={org.id} value={invitePos} onChange={(id) => setInvitePos(id)} />
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy}>Gửi lời mời</button>
              <button type="button" className="secondary" onClick={() => { setEmail(''); setError(null); setAdding(false); }}>Hủy</button>
            </div>
          </form>
        </Collapsible>
        {error && <p className="msg error" role="alert">{error}</p>}
        {info && <p className="msg ok" role="status">{info}</p>}
      </>
    );
  }

  return (
    <>
      <h2 className="sect">Nhân sự{members.length > 0 ? ` (${members.length} người${invites.length > 0 ? ` · ${invites.length} lời mời chờ` : ''})` : ''}</h2>
      {!navigator.onLine && <p className="msg warn">Cần có mạng để xem và quản lý nhân sự.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
      {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
      {isOwner && <button className="secondary" disabled={!navigator.onLine} onClick={() => { setAdding(true); setError(null); setInfo(null); }}>+ Thêm nhân sự</button>}

      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Họ tên</th><th>Điện thoại</th><th>Chức vụ</th><th>Phòng / Tổ</th><th>Phân khu</th>{isOwner && <th></th>}</tr></thead>
          <tbody>
            {members.length === 0 && offlineWorkers.length === 0 && <tr><td colSpan={isOwner ? 6 : 5} className="muted">Chưa có nhân sự.</td></tr>}
            {members.map((m) => {
              const label = m.is_staff ? m.full_name ?? m.phone ?? '' : m.email;
              const owner = m.roles.includes('owner');
              const pos = positionOf(m.user_id);
              const team = teamOf(m.user_id);
              return (
                <tr key={m.user_id} className={m.status === 'suspended' ? 'off' : ''}>
                  <td>
                    <strong>{label}{m.is_self && ' (bạn)'}</strong>
                    {m.description && <span className="sub">{m.description}</span>}
                    {m.status === 'suspended' && <span className="pill err">Tạm dừng</span>}
                    {m.is_staff && m.must_change_password && <span className="pill warn">Chưa đổi mật khẩu</span>}
                    {m.leads_teams && m.leads_teams.length > 0 && <span className="pill ok">Tổ trưởng — {m.leads_teams.join(', ')}</span>}
                  </td>
                  <td>{m.phone ?? ''}</td>
                  <td>{owner ? 'Chủ cơ sở' : pos?.name ?? roleSummary(m.roles)}</td>
                  <td>{team?.name ?? ''}</td>
                  <td>{owner ? 'Tất cả' : areaText(m.user_id)}</td>
                  {isOwner && (
                    <td className="act">
                      {!owner && <button className="icon" aria-label={`Sửa ${label}`} onClick={() => { setOpen(m.user_id); setError(null); setInfo(null); }}>✎</button>}
                    </td>
                  )}
                </tr>
              );
            })}
            {offlineWorkers.map((w) => {
              const link = teamLinks.find((l) => l.worker_id === w.id);
              return (
                <tr key={w.id}>
                  <td><strong>{w.full_name}</strong><span className="pill">Không tài khoản</span></td>
                  <td>{w.phone ?? ''}</td>
                  <td className="muted">{w.work_mode === 'monthly_salary' ? 'Lương tháng' : 'Người làm'}</td>
                  <td>{link ? teams.find((t) => t.id === link.team_id)?.name ?? '' : ''}</td>
                  <td></td>
                  {isOwner && <td className="act"><button className="icon" aria-label={`Sửa ${w.full_name}`} onClick={() => { setOpenWorker(w.id); setError(null); setInfo(null); }}>✎</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && <h3 className="sub">Đang chờ chấp nhận</h3>}
      {invites.map((i) => (
        <div className="row member" key={i.id}>
          <span className="grow">{i.email} · {roleSummary(i.roles)}</span>
          {isOwner && <button className="link" disabled={busy} onClick={() => void run(() => revokeInvitation(i.id))}>Hủy lời mời</button>}
        </div>
      ))}

    </>
  );
}
