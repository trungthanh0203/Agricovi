import { useState, type FormEvent } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import { EMPTY_HR, saveWorkerHr, type WorkerHr } from '../lib/hr';
import { issuePinCodeForUser } from '../lib/kiosk';
import { setMemberAreas, setMemberDescription } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import { setMemberPosition } from '../lib/positions';
import { createStaffAccount, isLeaderMode, WORK_MODE_LABEL, type StaffCredentials, type WorkMode } from '../lib/staff';
import { createWorkerWithoutAccount, type TeamRow, type WorkerRow } from '../lib/teams';
import { listWorkers } from '../lib/work';
import { Collapsible } from './Collapsible';
import { HrFields } from './HrRecord';
import { AreaChoice } from './MemberAreas';
import { PositionPicker } from './PositionPicker';

/** Các loại nhân sự khi thêm: MỘT biểu mẫu thống nhất, đổi ô theo loại (thay cho bốn biểu mẫu rời trước đây) */
type Kind = 'account' | 'no_phone' | 'monthly';
const KIND_LABEL: Record<Kind, string> = {
  account: 'Nhân viên có điện thoại (đăng nhập bằng số điện thoại)',
  no_phone: 'Người không có điện thoại (tổ trưởng chấm công hộ)',
  monthly: 'Người làm công tháng (lương cố định, không chấm công)',
};
const KIND_HINT: Record<Kind, string> = {
  account: 'Hệ thống tạo tài khoản đăng nhập bằng số điện thoại và mật khẩu tạm (hiện một lần).',
  no_phone: 'Chỉ là hồ sơ để tổ trưởng chấm công và ghi sản lượng hộ; không có tài khoản đăng nhập.',
  monthly: 'Không đăng nhập và không chấm công; trả lương tháng cố định. Đặt số tiền lương ở hồ sơ người đó sau khi thêm.',
};

/**
 * Thêm nhân sự (chủ cơ sở): chọn LOẠI nhân sự rồi nhập thông tin; các ô chung (họ tên, điện thoại, tổ, ngày vào làm, loại hình,
 * liên hệ khẩn cấp, mô tả) giống hồ sơ khi sửa. `onDone(thông báo, quay về danh sách?)`; tài khoản mới có mật khẩu tạm thì hiện qua `onCreds`.
 */
export function StaffAddForm({ org, teams, workers, onDone, onCreds, onCancel }: {
  org: MyOrg; teams: TeamRow[]; workers: WorkerRow[]; onDone: (msg: string, back: boolean) => void; onCreds: (c: StaffCredentials) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>('account');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [posId, setPosId] = useState('');
  const [roles, setRoles] = useState<MemberRole[]>(['worker']);
  const [mode, setMode] = useState<WorkMode | ''>('');      // kiểu phân hệ không bắt buộc: bỏ trống thì dùng mặc định của loại
  const [teamId, setTeamId] = useState('');
  const [areaSel, setAreaSel] = useState<string[] | null>(null);   // null = tất cả phân khu
  const [hr, setHr] = useState<WorkerHr>(EMPTY_HR);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTeams = teams.filter((t) => t.is_active !== false);
  const leaderName = (t: TeamRow) => workers.find((w) => w.id === t.leader_worker_id)?.full_name ?? '';
  const isAccount = kind === 'account';
  const modeOptions: WorkMode[] = kind === 'no_phone' ? ['leader_hourly', 'leader_output'] : (Object.keys(WORK_MODE_LABEL) as WorkMode[]).filter((m) => m !== 'monthly_salary');
  const effMode: WorkMode = mode || (kind === 'no_phone' ? 'leader_hourly' : 'self_hourly');
  const needTeam = kind === 'no_phone' || (isAccount && isLeaderMode(effMode));

  function changeKind(k: Kind) {
    setKind(k); setError(null);
    setMode('');
  }
  const reset = () => { setName(''); setPhone(''); setPosId(''); setTeamId(''); setAreaSel(null); setHr(EMPTY_HR); setDesc(''); };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) return setError('Thêm nhân sự cần có mạng.');
    if (name.trim().length < 2) return setError('Hãy nhập họ tên (ít nhất 2 ký tự).');
    if (isAccount && !phone.trim()) return setError('Hãy nhập số điện thoại của nhân viên.');
    if (isAccount && !posId) return setError('Hãy chọn chức vụ cho nhân viên.');
    if (isAccount && areaSel && areaSel.length === 0) return setError('Hãy chọn ít nhất một phân khu, hoặc chọn "Tất cả phân khu".');
    if (needTeam && !teamId) return setError(activeTeams.length === 0 ? 'Kiểu này cần chọn một tổ. Hãy tạo tổ ở mục Phòng / Tổ trước.' : 'Hãy chọn một tổ lao động.');
    setBusy(true);
    try {
      let workerId: string | null = null;
      let msg = '';
      let back = true;
      if (kind === 'account') {
        const res = await createStaffAccount({ organization_id: org.id, full_name: name, phone, roles, work_mode: effMode, team_id: teamId || null });
        if (res.user_id) {
          await setMemberPosition(org.id, res.user_id, posId);
          if (areaSel && areaSel.length > 0) await setMemberAreas(org.id, res.user_id, areaSel);
          if (desc.trim()) await setMemberDescription(org.id, res.user_id, desc);
          const pin_code = (await issuePinCodeForUser(org.id, res.user_id)) ?? undefined;
          onCreds({ ...res, pin_code });
          workerId = (await listWorkers(org.id).catch(() => [])).find((w) => w.user_id === res.user_id)?.id ?? null;
        } else onCreds(res);
        msg = 'Đã tạo tài khoản nhân viên. Hãy chép mật khẩu tạm đưa cho nhân viên.';
        back = false;
      } else {
        workerId = await createWorkerWithoutAccount(org.id, name, phone, kind === 'monthly' ? 'monthly_salary' : effMode, teamId || null);
        msg = kind === 'monthly' ? 'Đã thêm người làm. Bấm vào người đó để đặt lương tháng ở mục Trả công.' : 'Đã thêm người làm. Tổ trưởng sẽ chấm công hộ.';
      }
      // thông tin nhân sự (ngày vào làm, loại hình, liên hệ khẩn cấp, chức danh, ghi chú): lưu sau khi có hồ sơ lao động
      const hrToSave: WorkerHr = { ...hr, note: !isAccount ? desc.trim() : hr.note, end_date: '' };
      if (workerId && Object.values(hrToSave).some((v) => v.trim() !== '')) {
        try { await saveWorkerHr(workerId, hrToSave, null); } catch (err) { msg += ` (Chưa lưu được thông tin nhân sự: ${friendlyError(err)} Mở hồ sơ để nhập lại.)`; }
      }
      reset();
      onDone(msg, back);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="inline-form" noValidate>
      <label>Loại nhân sự
        <select value={kind} disabled={busy} onChange={(e) => changeKind(e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <small>{KIND_HINT[kind]}</small>
      </label>

      <label>Họ tên<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <label>Số điện thoại{isAccount ? ' (dùng để đăng nhập)' : ' (không bắt buộc)'}
        <input type="tel" inputMode="tel" autoComplete="off" value={phone} placeholder="0912345678" onChange={(e) => setPhone(e.target.value)} />
      </label>
      {isAccount && <PositionPicker orgId={org.id} value={posId} onChange={(id, role) => { setPosId(id); setRoles([role]); }} />}
      <HrFields hr={hr} setHr={setHr} disabled={busy} withPosition={!isAccount} hideEnd orgId={org.id} />
      {isAccount && (
        <Collapsible inline title="Phân khu làm việc" summary={areaSel === null ? 'tất cả phân khu' : `${areaSel.length} phân khu`}>
          <AreaChoice orgId={org.id} value={areaSel} onChange={setAreaSel} />
        </Collapsible>
      )}
      <label>Phòng / Tổ{needTeam ? ' (bắt buộc)' : ' (không bắt buộc)'}
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— {needTeam ? 'Chọn tổ' : 'Chưa vào tổ'} —</option>
          {activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.leader_worker_id ? `tổ trưởng ${leaderName(t)}` : 'chưa có tổ trưởng'}</option>)}
        </select>
        {activeTeams.length === 0 && <small>Chưa có tổ nào. Hãy tạo ở mục Phòng / Tổ.</small>}
      </label>
      {kind !== 'monthly' && (
        <label>Kiểu chấm công (không bắt buộc)
          <select value={mode} onChange={(e) => setMode(e.target.value as WorkMode | '')}>
          <option value="">— Không chọn (mặc định: {WORK_MODE_LABEL[effMode].toLowerCase()}) —</option>
          {modeOptions.map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}
          </select>
        </label>
      )}
      <label>Mô tả (không bắt buộc)
        <textarea rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Lái máy, phụ trách tưới" />
      </label>
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Đang lưu…' : kind === 'account' ? 'Tạo tài khoản' : 'Thêm người làm'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { reset(); onCancel(); }}>Hủy</button>
      </div>
    </form>
  );
}
