import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { Collapsible } from './Collapsible';
import type { MyOrg } from '../lib/orgs';
import { WORK_MODE_LABEL, type WorkMode } from '../lib/staff';
import { useTable } from '../lib/tables';
import {
  archiveTeam, assignWorkerToTeam, createTeam, createWorkerWithoutAccount, loadTeams, updateTeam,
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
  const areas = useTable('areas').filter((a) => a.organization_id === org.id);
  const [editing, setEditing] = useState<string | 'new' | null>(null); // tổ đang sửa / tạo
  const [teamName, setTeamName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [desc, setDesc] = useState('');
  const [areaId, setAreaId] = useState('');
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

  function openForm(t: TeamRow | null) {
    setEditing(t ? t.id : 'new');
    setTeamName(t?.name ?? '');
    setLeaderId(t?.leader_worker_id ?? '');
    setDesc(t?.description ?? '');
    setAreaId(t?.area_id ?? '');
    setError(null);
  }

  function onSaveTeam(e: FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return setError('Hãy nhập tên tổ.');
    const id = editing;
    void run(async () => {
      if (id && id !== 'new') {
        await updateTeam(id, teamName, leaderId || null, desc, areaId || null);
      } else {
        const nid = await createTeam(org.id, teamName, leaderId || null, desc, areaId || null);
        if (leaderId) await assignWorkerToTeam(leaderId, nid); // tổ trưởng cũng là thành viên của tổ
      }
      setEditing(null);
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

      {editing === null && <button className="secondary" disabled={busy || !navigator.onLine} onClick={() => openForm(null)}>+ Thêm phòng / tổ</button>}
      {editing !== null && (
        <form onSubmit={onSaveTeam} className="inline-form" noValidate>
          <h3 className="sub">{editing === 'new' ? 'Thêm phòng / tổ' : 'Sửa phòng / tổ'}</h3>
          <label>
            Tên tổ
            <input value={teamName} maxLength={80} onChange={(e) => setTeamName(e.target.value)} placeholder="Ví dụ: Tổ thu hoạch 1" />
          </label>
          <label>
            Tổ trưởng (không bắt buộc, chọn sau cũng được)
            <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {withAccount.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
            <small>Chỉ người có tài khoản (điện thoại) mới làm tổ trưởng được.</small>
          </label>
          <label>
            Mô tả (không bắt buộc)
            <textarea rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Phụ trách thu hoạch và đóng gói" />
          </label>
          <label>
            Trang trại (không bắt buộc)
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">— Không chọn —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="btnrow">
            <button type="submit" className="primary" disabled={busy}>Lưu</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Tên tổ</th><th>Tổ trưởng</th><th>Mô tả</th><th>Trang trại</th><th></th></tr></thead>
        <tbody>
          {teams.length === 0 && <tr><td colSpan={5} className="muted">Chưa có tổ nào. Bấm "+ Thêm phòng / tổ".</td></tr>}
          {teams.map((t) => {
            const leader = leaderOf(t);
            const count = members.filter((m) => m.team_id === t.id).length;
            return (
              <tr key={t.id}>
                <td>{t.name}<span className="sub">{count} người</span></td>
                <td>{leader ? leader.full_name : <span className="pill warn">Chưa có</span>}</td>
                <td>{t.description ?? ''}</td>
                <td>{areas.find((a) => a.id === t.area_id)?.name ?? ''}</td>
                <td className="act">
                  <button className="icon" disabled={busy} aria-label={`Sửa ${t.name}`} onClick={() => openForm(t)}>✎</button>{' '}
                  <button className="icon" disabled={busy || !navigator.onLine} aria-label={`Xóa ${t.name}`} onClick={() => {
                    if (window.confirm(`Xóa tổ "${t.name}"? Các thành viên sẽ không còn thuộc tổ này; lịch sử chấm công vẫn được giữ.`)) void run(() => archiveTeam(t.id));
                  }}>🗑</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
