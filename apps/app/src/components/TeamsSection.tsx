import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { Collapsible } from './Collapsible';
import type { MyOrg } from '../lib/orgs';
import { WORK_MODE_LABEL, type WorkMode } from '../lib/staff';
import {
  assignWorkerToTeam, createTeam, createWorkerWithoutAccount, loadTeams, setTeamLeader,
  type OrphanWorker, type TeamMembershipRow, type TeamRow, type WorkerRow,
} from '../lib/teams';

/**
 * Phòng / Tổ và tổ trưởng. Tổ trưởng là CHỈ ĐỊNH theo tổ (một nhân viên có tài khoản), không phải vai trò cấp cơ sở.
 * Người không có điện thoại chỉ là hồ sơ do tổ trưởng chấm hộ, bắt buộc thuộc tổ có tổ trưởng.
 */
export function TeamsSection({ org }: { org: MyOrg }) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [members, setMembers] = useState<TeamMembershipRow[]>([]);
  const [orphans, setOrphans] = useState<OrphanWorker[]>([]);
  const [teamName, setTeamName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wMode, setWMode] = useState<WorkMode>('leader_hourly');
  const [wTeam, setWTeam] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const r = await loadTeams(org.id);
      setTeams(r.teams);
      setWorkers(r.workers);
      setMembers(r.members);
      setOrphans(r.orphans);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const withAccount = workers.filter((w) => w.user_id);
  const leaderOf = (t: TeamRow) => workers.find((w) => w.id === t.leader_worker_id);

  function onCreateTeam(e: FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return setError('Hãy nhập tên tổ.');
    void run(async () => {
      const id = await createTeam(org.id, teamName, leaderId || null);
      if (leaderId) await assignWorkerToTeam(leaderId, id); // tổ trưởng cũng là thành viên của tổ
      setTeamName('');
      setLeaderId('');
    });
  }

  function onCreateWorker(e: FormEvent) {
    e.preventDefault();
    if (wName.trim().length < 2) return setError('Hãy nhập họ tên.');
    if (!wTeam) return setError('Hãy chọn tổ (tổ phải có tổ trưởng).');
    void run(async () => {
      await createWorkerWithoutAccount(org.id, wName, wPhone, wMode, wTeam);
      setWName('');
      setWPhone('');
    });
  }

  return (
    <>
      <h2 className="sect">Phòng / Tổ{orphans.length > 0 ? ` (${orphans.length} người cần xử lý)` : teams.length > 0 ? ` (${teams.length} tổ)` : ''}</h2>
      <p className="muted">Tổ trưởng chấm công và ghi sản lượng hộ người trong tổ. Công của chính tổ trưởng do quản lý hoặc chủ xác nhận.</p>
      {!navigator.onLine && <p className="msg warn">Cần có mạng để quản lý tổ.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {orphans.length > 0 && (
        <div className="msg warn" role="status">
          <strong>Cần xử lý:</strong> {orphans.length} người theo kiểu "tổ trưởng chấm" nhưng chưa thuộc tổ có tổ trưởng:{' '}
          {orphans.map((o) => o.full_name).join(', ')}.
        </div>
      )}

      {teams.length === 0 && <p className="muted">Chưa có tổ nào.</p>}
      {teams.map((t) => {
        const leader = leaderOf(t);
        const ids = members.filter((m) => m.team_id === t.id).map((m) => m.worker_id);
        return (
          <div className="member" key={t.id}>
            <div className="row">
              <strong className="grow">{t.name}</strong>
              {leader ? <span className="pill ok">Tổ trưởng: {leader.full_name}</span> : <span className="pill warn">Chưa có tổ trưởng</span>}
            </div>
            <label>
              Tổ trưởng
              <select value={t.leader_worker_id ?? ''} disabled={busy}
                onChange={(e) => void run(async () => {
                  const v = e.target.value || null;
                  await setTeamLeader(t.id, v);
                  if (v && !ids.includes(v)) await assignWorkerToTeam(v, t.id);
                })}>
                <option value="">— Chưa chọn —</option>
                {withAccount.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
              <small>Chỉ người có tài khoản (điện thoại) mới làm tổ trưởng được.</small>
            </label>
            <p className="muted">Thành viên ({ids.length}): {ids.map((id) => workers.find((w) => w.id === id)?.full_name).filter(Boolean).join(', ') || '—'}</p>
          </div>
        );
      })}


      <Collapsible inline title="＋ Tạo tổ mới">
      <form onSubmit={onCreateTeam} className="inline-form" noValidate>
        <label>
          Tên tổ
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ví dụ: Tổ thu hoạch 1" />
        </label>
        <label>
          Tổ trưởng (không bắt buộc, chọn sau cũng được)
          <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
            <option value="">— Chưa chọn —</option>
            {withAccount.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
          </select>
        </label>
        <button type="submit" className="secondary" disabled={busy}>Tạo tổ</button>
      </form>
      </Collapsible>

      <Collapsible inline title="＋ Thêm người không có điện thoại">
      <form onSubmit={onCreateWorker} className="inline-form" noValidate>
        <p className="muted">Chỉ là hồ sơ để tổ trưởng chấm công và ghi sản lượng hộ; không có tài khoản đăng nhập.</p>
        <label>
          Họ tên
          <input value={wName} onChange={(e) => setWName(e.target.value)} />
        </label>
        <label>
          Số điện thoại (không bắt buộc)
          <input type="tel" inputMode="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)} />
        </label>
        <label>
          Kiểu phân hệ
          <select value={wMode} onChange={(e) => setWMode(e.target.value as WorkMode)}>
            <option value="leader_hourly">{WORK_MODE_LABEL.leader_hourly}</option>
            <option value="leader_output">{WORK_MODE_LABEL.leader_output}</option>
          </select>
        </label>
        <label>
          Phòng / Tổ
          <select value={wTeam} onChange={(e) => setWTeam(e.target.value)}>
            <option value="">— Chọn tổ —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.leader_worker_id ? '' : ' · chưa có tổ trưởng'}</option>)}
          </select>
        </label>
        <button type="submit" className="secondary" disabled={busy}>Thêm người</button>
      </form>
      </Collapsible>
    </>
  );
}
