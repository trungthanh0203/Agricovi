import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import type { MyOrg } from '../lib/orgs';
import { WORK_MODE_LABEL, type WorkMode } from '../lib/staff';
import { deactivateWorker, updateWorkerInfo, type TeamRow, type WorkerRow } from '../lib/teams';
import { Collapsible } from './Collapsible';
import { MemberPay } from './MemberPay';

/**
 * Hồ sơ một người làm KHÔNG có tài khoản (ví dụ người làm công tháng): sửa họ tên, điện thoại, đặt trả công (lương tháng hoặc theo giờ),
 * hoặc cho ngừng làm việc. Chỉ chủ cơ sở mở được.
 */
export function WorkerProfile({ org, worker, team, onBack, onChanged }: { org: MyOrg; worker: WorkerRow; team: TeamRow | null; onBack: () => void; onChanged: () => void }) {
  const [name, setName] = useState(worker.full_name);
  const [phone, setPhone] = useState(worker.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done?: string, after?: () => void) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); onChanged(); after?.(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="member-profile">
      <div className="menubar">
        <button className="menu-back" onClick={onBack} aria-label="Quay lại danh sách nhân sự">‹ Danh sách</button>
        <strong className="menu-cur">{worker.full_name}</strong>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
      <p className="muted">Người làm không có tài khoản đăng nhập. {worker.work_mode ? WORK_MODE_LABEL[worker.work_mode as WorkMode] ?? worker.work_mode : ''}{team ? ` · Tổ ${team.name}` : ''}</p>
      <div className="btnrow">
        <button type="button" className="secondary" disabled={busy} onClick={() => {
          if (window.confirm(`Cho ${worker.full_name} ngừng làm việc? Lịch sử công và lương vẫn được giữ.`)) void run(() => deactivateWorker(worker.id), undefined, onBack);
        }}>Ngừng làm việc</button>
      </div>
      <div className="inline-form">
        <label>Họ tên<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label>Số điện thoại (không bắt buộc)<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setError('Hãy nhập họ tên (ít nhất 2 ký tự).');
            void run(() => updateWorkerInfo(worker.id, name, phone), 'Đã lưu.');
          }}>Lưu</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setName(worker.full_name); setPhone(worker.phone ?? ''); setError(null); }}>Hủy</button>
        </div>
      </div>
      <Collapsible title="Trả công" summary="theo giờ hoặc lương tháng">
        <MemberPay orgId={org.id} workerId={worker.id} />
      </Collapsible>
    </div>
  );
}
