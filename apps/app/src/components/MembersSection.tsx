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
import { loadTeams, type TeamMembershipRow, type TeamRow, type WorkerRow } from '../lib/teams';
import { Collapsible } from './Collapsible';
import { MemberProfile } from './MemberProfile';
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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<StaffCredentials | null>(null);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [m, i, t] = await Promise.all([listMembers(org.id), pendingOrgInvites(org.id), loadTeams(org.id)]);
      setMembers(m); setInvites(i); setTeams(t.teams); setWorkers(t.workers); setTeamLinks(t.members);
      if (ownerOf(org.roles)) {
        const [ov, ar, h, cat] = await Promise.all([
          fetchPermissionOverrides(org.id),
          fetchMemberAreas(org.id).catch(() => ({} as Record<string, string[] | null>)),
          listMemberPositions(org.id).catch(() => new Map<string, string[]>()),
          listPositions(org.id).catch(() => [] as PositionRow[]),
        ]);
        setOverrides(ov); setAreaMap(ar); setHeld(h); setCatalog(cat);
      }
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

  return (
    <>
      <h2 className="sect">Nhân sự{members.length > 0 ? ` (${members.length} người${invites.length > 0 ? ` · ${invites.length} lời mời chờ` : ''})` : ''}</h2>
      {!navigator.onLine && <p className="msg warn">Cần có mạng để xem và quản lý nhân sự.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
      {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}

      {members.map((m) => {
        const label = m.is_staff ? m.full_name ?? m.phone ?? '' : m.email;
        const owner = m.roles.includes('owner');
        const pos = positionOf(m.user_id);
        const team = teamOf(m.user_id);
        const body = (
          <>
            <span className="grow">
              <strong>{label}{m.is_self && ' (bạn)'}</strong>
              <span className="sub">
                {owner ? 'Chủ cơ sở (toàn quyền)' : `${pos ? `${pos.name} · ` : ''}${roleSummary(m.roles)}`}{team ? ` · Tổ ${team.name}` : ''}
              </span>
              <span className="badges">
                {m.status === 'suspended' && <span className="pill err">Tạm dừng</span>}
                {m.is_staff && m.must_change_password && <span className="pill warn">Chưa đổi mật khẩu</span>}
                {m.leads_teams && m.leads_teams.length > 0 && <span className="pill ok">Tổ trưởng — {m.leads_teams.join(', ')}</span>}
              </span>
            </span>
            {isOwner && !owner && <span className="menu-go" aria-hidden>›</span>}
          </>
        );
        return isOwner && !owner
          ? <button key={m.user_id} className="member row member-btn" onClick={() => { setOpen(m.user_id); setError(null); setInfo(null); }}>{body}</button>
          : <div key={m.user_id} className="member row">{body}</div>;
      })}

      {invites.length > 0 && <h3 className="sub">Đang chờ chấp nhận</h3>}
      {invites.map((i) => (
        <div className="row member" key={i.id}>
          <span className="grow">{i.email} · {roleSummary(i.roles)}</span>
          {isOwner && <button className="link" disabled={busy} onClick={() => void run(() => revokeInvitation(i.id))}>Hủy lời mời</button>}
        </div>
      ))}

      {isOwner && (
        <Collapsible inline title="＋ Tạo tài khoản nhân viên (đăng nhập bằng số điện thoại)">
          <StaffCreateForm org={org} teams={teams} workers={workers} onChanged={() => void load()} />
        </Collapsible>
      )}
      {isOwner && (
        <Collapsible inline title="＋ Mời người đã có tài khoản email">
          <form onSubmit={onInvite} className="inline-form" noValidate>
            <label>
              Email người được mời
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <PositionPicker orgId={org.id} value={invitePos} onChange={(id) => setInvitePos(id)} />
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy}>Gửi lời mời</button>
              <button type="button" className="secondary" onClick={() => { setEmail(''); setError(null); }}>Hủy</button>
            </div>
          </form>
        </Collapsible>
      )}
    </>
  );
}
