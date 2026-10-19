import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import {
  fetchPermissionOverrides, inviteMember, listMembers, pendingOrgInvites, removeMember, revokeInvitation, setMemberRoles,
  type Member, type PendingInvite,
} from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import { isOwner as ownerOf, roleSummary } from '../lib/roles';
import { loadTeams, type TeamRow, type WorkerRow } from '../lib/teams';
import type { StaffCredentials } from '../lib/staff';
import { Collapsible } from './Collapsible';
import type { PermOverrides } from '../lib/permissions';
import { MemberPermissions } from './MemberPermissions';
import { RolePicker } from './RolePicker';
import { CredentialsCard, ResetPasswordButton, StaffCreateForm } from './StaffAccountsSection';

/**
 * Thành viên của cơ sở. Chủ cơ sở: mời theo email, tạo tài khoản nhân viên (số điện thoại), đổi vai trò, gỡ.
 * Quản lý: chỉ xem danh sách. Nhân viên không thấy mục này.
 */
export function MembersSection({ org }: { org: MyOrg }) {
  const isOwner = ownerOf(org.roles);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRoles, setInviteRoles] = useState<MemberRole[]>(['worker']);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState<MemberRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<StaffCredentials | null>(null);
  const [overrides, setOverrides] = useState<Record<string, PermOverrides>>({});

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [m, i, t, ov] = await Promise.all([
        listMembers(org.id), pendingOrgInvites(org.id), loadTeams(org.id),
        ownerOf(org.roles) ? fetchPermissionOverrides(org.id) : Promise.resolve({} as Record<string, PermOverrides>),
      ]);
      setOverrides(ov);
      setMembers(m);
      setInvites(i);
      setTeams(t.teams);
      setWorkers(t.workers);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [org.id]);

  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (done) setInfo(done);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return setError('Hãy nhập email của người cần mời.');
    if (inviteRoles.length === 0) return setError('Hãy chọn ít nhất một vai trò.');
    void run(async () => {
      await inviteMember(org.id, email, inviteRoles);
      setEmail('');
    }, 'Đã tạo lời mời. Hãy bảo người đó đăng ký hoặc đăng nhập bằng đúng email này, họ sẽ thấy lời mời.');
  }

  function saveRoles(userId: string) {
    if (editRoles.length === 0) return setError('Hãy chọn ít nhất một vai trò.');
    void run(async () => {
      await setMemberRoles(org.id, userId, editRoles);
      setEditing(null);
    });
  }

  return (
    <Collapsible title="Thành viên" summary={members.length > 0 ? `${members.length} người${invites.length > 0 ? ` · ${invites.length} lời mời chờ` : ''}` : undefined}>
      {!navigator.onLine && <p className="msg warn">Cần có mạng để xem và quản lý thành viên.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}

      {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
      {members.map((m) => {
        const label = m.is_staff ? `${m.full_name ?? ''} · ${m.phone ?? ''}` : m.email;
        const owner = m.roles.includes('owner');
        return (
          <div className="member" key={m.user_id}>
            <div className="row">
              <span className="grow">{label}{m.is_self && ' (bạn)'}</span>
            </div>
            <div className="badges">
              <span className="pill">{roleSummary(m.roles)}</span>
              {m.leads_teams && m.leads_teams.length > 0 && (
                <span className="pill ok">Tổ trưởng — {m.leads_teams.join(', ')}</span>
              )}
            </div>
            {m.is_staff && m.must_change_password && <p className="msg warn">Chưa đổi mật khẩu tạm — chưa dùng được dữ liệu.</p>}

            {isOwner && !owner && editing !== m.user_id && (
              <div className="actions">
                <button className="secondary" disabled={busy} onClick={() => { setEditing(m.user_id); setEditRoles(m.roles.filter((r) => r !== 'owner')); setError(null); }}>Đổi vai trò</button>
                {m.is_staff && <ResetPasswordButton org={org} userId={m.user_id} onDone={(c) => { setCreds(c); void load(); }} />}
                <button className="link" disabled={busy}
                  onClick={() => window.confirm(`Gỡ ${label} khỏi cơ sở? Người này sẽ không vào được nữa; lịch sử đã ghi vẫn được giữ.`) && void run(() => removeMember(org.id, m.user_id))}>
                  Gỡ khỏi cơ sở
                </button>
              </div>
            )}
            {isOwner && !owner && (
              <Collapsible inline title="Quyền vật tư, chi phí, thu hoạch" summary={Object.keys(overrides[m.user_id] ?? {}).length > 0 ? 'Đã cấp riêng' : 'Theo vai trò'}>
                <MemberPermissions key={JSON.stringify(overrides[m.user_id] ?? {})} orgId={org.id} userId={m.user_id} roles={m.roles}
                  overrides={overrides[m.user_id] ?? {}} onSaved={() => void load()} />
              </Collapsible>
            )}
            {isOwner && editing === m.user_id && (
              <div className="inline-form">
                <RolePicker orgType={org.type} value={editRoles} onChange={setEditRoles} disabled={busy} />
                <div className="actions">
                  <button className="secondary" disabled={busy} onClick={() => saveRoles(m.user_id)}>Lưu vai trò</button>
                  <button className="link" onClick={() => setEditing(null)}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        );
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
          <RolePicker orgType={org.type} value={inviteRoles} onChange={setInviteRoles} />
          <button type="submit" className="secondary" disabled={busy}>Gửi lời mời</button>
        </form>
        </Collapsible>
      )}
    </Collapsible>
  );
}
