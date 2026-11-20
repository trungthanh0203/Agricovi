import { useShowMore } from './ShowMore';
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { listPinStatus, type PinStatus } from '../lib/kiosk';
import {
  fetchMemberAreas, fetchPermissionOverrides, listMembers, pendingOrgInvites, revokeInvitation, type Member, type PendingInvite,
} from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import type { PermOverrides } from '../lib/permissions';
import { listMemberPositions, listPositions, type PositionRow } from '../lib/positions';
import { isOwner as ownerOf, roleSummary } from '../lib/roles';
import type { StaffCredentials } from '../lib/staff';
import { loadTeams, type TeamMembershipRow, type TeamRow, type WorkerRow } from '../lib/teams';
import { useTable } from '../lib/tables';
import { Collapsible } from './Collapsible';
import { MemberProfile } from './MemberProfile';
import { WorkerProfile } from './WorkerProfile';
import { CredentialsCard } from './StaffAccountsSection';
import { StaffAddForm } from './StaffAddForm';
import { areaPath } from '../lib/areas';

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
  const [open, setOpen] = useState<string | null>(null); // người đang mở hồ sơ
  const [adding, setAdding] = useState(false); // đang ở biểu mẫu thêm nhân sự
  const [openWorker, setOpenWorker] = useState<string | null>(null); // người làm không tài khoản đang mở hồ sơ
  const areas = useTable('areas').filter((a) => a.organization_id === org.id);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<StaffCredentials | null>(null);
  const [pins, setPins] = useState<Record<string, PinStatus>>({}); // trạng thái PIN và khuôn mặt theo mã hồ sơ lao động

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
      setPins(Object.fromEntries((await listPinStatus(org.id).catch(() => [] as PinStatus[])).map((p) => [p.wid, p])));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [org.id, org.roles]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const positionOf = (uid: string) => catalog.find((p) => p.id === (held.get(uid) ?? [])[0]) ?? null;
  const workerOf = (uid: string) => workers.find((w) => w.user_id === uid) ?? null;
  const teamOf = (uid: string) => {
    const w = workerOf(uid);
    const link = w ? teamLinks.find((l) => l.worker_id === w.id) : null;
    return link ? teams.find((t) => t.id === link.team_id) ?? null : null;
  };

  const offlineWorkers = workers.filter((w) => !w.user_id);
  // ô tìm + hiện từng 50 dòng (D142): gộp người có tài khoản và người làm không tài khoản thành một danh sách
  const [find, setFind] = useState('');
  const needle = find.trim().toLowerCase();
  const hit = (...xs: (string | null | undefined)[]) => !needle || xs.some((x) => (x ?? '').toLowerCase().includes(needle));
  const memberHits = members.filter((m) => hit(m.full_name, m.display_name, m.phone, m.email));
  const workerHits = offlineWorkers.filter((w) => hit(w.full_name, w.phone));
  const staffRows = [...memberHits.map((m) => ({ m, w: null as null | typeof workerHits[number] })), ...workerHits.map((w) => ({ m: null as null | typeof memberHits[number], w }))];
  const { visible: staffShown, more: staffMore } = useShowMore(staffRows, needle);
  const selWorker = offlineWorkers.find((w) => w.id === openWorker) ?? null;
  if (isOwner && selWorker) {
    const link = teamLinks.find((l) => l.worker_id === selWorker.id);
    return <WorkerProfile org={org} worker={selWorker} team={link ? teams.find((t) => t.id === link.team_id) ?? null : null} teams={teams} onBack={() => setOpenWorker(null)} onChanged={() => void load()} />;
  }
  const sel = members.find((m) => m.user_id === open) ?? null;
  if (isOwner && sel && !sel.roles.includes('owner')) {
    return (
      <>
        {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
        <MemberProfile org={org} member={sel} worker={workerOf(sel.user_id)} team={teamOf(sel.user_id)} teams={teams} position={positionOf(sel.user_id)}
          overrides={overrides[sel.user_id] ?? {}} areas={areaMap[sel.user_id] ?? null} pin={workerOf(sel.user_id) ? pins[workerOf(sel.user_id)!.id] ?? null : null} onBack={() => setOpen(null)} onChanged={() => void load()} onCreds={setCreds} />
      </>
    );
  }

  const areaText = (uid: string) => {
    if (!(uid in areaMap)) return '';
    const ids = areaMap[uid];
    return !ids ? 'Tất cả' : ids.map((id) => areaPath(id, areas)).filter(Boolean).join(', ');
  };

  if (isOwner && adding) {
    return (
      <>
        <div className="menubar">
          <button className="menu-back" onClick={() => setAdding(false)} aria-label="Quay lại danh sách nhân sự">‹ Danh sách</button>
          <strong className="menu-cur">Thêm nhân sự</strong>
        </div>
        {creds && <CredentialsCard creds={creds} onClose={() => setCreds(null)} />}
        <StaffAddForm org={org} teams={teams} workers={workers} onCreds={setCreds}
          onDone={(msg, back) => { setInfo(msg); setError(null); if (back) setAdding(false); void load(); }} onCancel={() => setAdding(false)} />
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

      {members.length + offlineWorkers.length > 8 && <div className="filters"><label>Tìm nhân sự<input type="search" value={find} placeholder="Tên hoặc số điện thoại" onChange={(e) => setFind(e.target.value)} /></label></div>}
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Nhân sự</th><th>Trạng thái</th>{isOwner && <th></th>}</tr></thead>
          <tbody>
            {staffRows.length === 0 && <tr><td colSpan={isOwner ? 3 : 2} className="muted">{needle ? "Không tìm thấy ai." : "Chưa có nhân sự."}</td></tr>}
            {staffShown.map(({ m }) => {
              if (!m) return null;
              const label = m.is_staff ? m.full_name ?? m.phone ?? '' : m.display_name || m.email.split('@')[0]; // chủ cơ sở: tên hiển thị (chưa đặt thì dùng phần đầu email, không hiện cả email)
              const owner = m.roles.includes('owner');
              const pos = positionOf(m.user_id);
              const w = workerOf(m.user_id);
              const ps = w ? pins[w.id] : undefined;
              const pwText = m.status === 'suspended' ? ['err', 'Đã khóa'] : m.is_staff && m.must_change_password ? ['warn', 'Chờ đặt lại'] : ['ok', 'Đã đặt'];
              const pinText = !w ? ['', 'Chưa có'] : ps?.is_locked ? ['err', 'Bị khóa'] : ps?.has_pin ? ['ok', 'Đã đặt'] : ps?.code_pending ? ['warn', 'Chờ đặt lại'] : ['', 'Chưa có'];
              return (
                <tr key={m.user_id} className={m.status === 'suspended' ? 'off' : ''}>
                  <td>
                    <strong>{label}</strong>
                    {m.phone && <span className="sub">{m.phone}</span>}
                    <span className="sub">{owner ? 'Chủ cơ sở' : pos?.name ?? roleSummary(m.roles)}</span>
                  </td>
                  <td>
                    {/* ba dòng theo thứ tự: mật khẩu, PIN, khuôn mặt (không ghi nhãn cho gọn; rê chuột/đọc màn hình có tên) */}
                    <span className="stl"><span className="stl-ic" aria-hidden>🔑</span><span className={pwText[0] ? `pill ${pwText[0]}` : 'pill'} title="Mật khẩu" aria-label={`Mật khẩu: ${pwText[1]}`}>{pwText[1]}</span></span>
                    <span className="stl"><span className="stl-ic" aria-hidden>🔢</span><span className={pinText[0] ? `pill ${pinText[0]}` : 'pill'} title="PIN" aria-label={`PIN: ${pinText[1]}`}>{pinText[1]}</span></span>
                    {w && <span className="stl"><span className="stl-ic" aria-hidden>🙂</span><span className={ps?.has_face ? 'pill ok' : 'pill'} title="Khuôn mặt" aria-label={`Khuôn mặt: ${ps?.has_face ? 'Đã đăng ký' : 'Chưa đăng ký'}`}>{ps?.has_face ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></span>}
                  </td>
                  {isOwner && (
                    <td className="act">
                      {!owner && <button className="icon" aria-label={`Sửa ${label}`} onClick={() => { setOpen(m.user_id); setError(null); setInfo(null); }}>✎</button>}
                    </td>
                  )}
                </tr>
              );
            })}
            {staffShown.map(({ w }) => w && (
              <tr key={w.id}>
                <td>
                  <strong>{w.full_name}</strong>
                  <span className="sub">{w.phone ?? ''}</span>
                  <span className="sub">{w.work_mode === 'monthly_salary' ? 'Lương tháng' : 'Người làm'}</span>
                </td>
                <td><span className="pill">Không tài khoản</span></td>
                {isOwner && <td className="act"><button className="icon" aria-label={`Sửa ${w.full_name}`} onClick={() => { setOpenWorker(w.id); setError(null); setInfo(null); }}>✎</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {staffMore}

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
