import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { lockPeriod, settleMonth, unlockPeriod, type SettleState } from '../lib/payBook';
import { fmtVnd } from '../lib/work';
import type { TabId } from '../lib/tabs';

const STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: 'Chưa tính lương', cls: 'pill' },
  draft: { label: 'Đã tính, chưa khóa', cls: 'pill warn' },
  pending_confirmation: { label: 'Đã tính, chưa khóa', cls: 'pill warn' },
  reviewed: { label: 'Đã tính, chưa khóa', cls: 'pill warn' },
  pending_approval: { label: 'Đã tính, chưa khóa', cls: 'pill warn' },
  locked: { label: 'Đã chốt', cls: 'pill ok' },
};

/**
 * Chốt lương ngay trong Bảng lương (D89), chỉ hiện khi xem một THÁNG và có quyền Tiền công: trạng thái của tháng, việc cần xong trước khi chốt
 * (kèm lối đi tới nơi xử lý), nút Tính lương / Tính lại, Khóa kỳ (chủ; bị chặn khi còn việc dang dở), Mở khóa (chủ, có lý do).
 */
export function PaySettleBar({ orgId, state, onChanged, onGo }: {
  orgId: string; state: SettleState; onChanged: () => void; onGo?: (tab: TabId, section?: string) => void;
}) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState('');
  const st = STATUS[state.status] ?? STATUS.draft!;
  const locked = state.status === 'locked';
  const b = state.blockers;

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (done) setInfo(done); onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const todo: { text: string; go?: { tab: TabId; section: string; label: string } }[] = [];
  if (b.pending_attendance > 0) todo.push({ text: `${b.pending_attendance} ca công đang chờ xác nhận`, go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' } });
  if (b.open_shifts > 0) todo.push({ text: `${b.open_shifts} ca đang mở (chưa ra ca)`, go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' } });
  if (b.pending_requests > 0) todo.push({ text: `${b.pending_requests} yêu cầu sửa công chờ duyệt`, go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' } });
  if (b.missing_rate.length > 0) todo.push({ text: `Chưa có cách trả công: ${b.missing_rate.map((m) => `${m.name} (${m.days} ngày)`).join(', ')}`, go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' } });
  if (b.uncomputed > 0 && state.status !== 'none') todo.push({ text: `${b.uncomputed} ca công mới chưa tính vào bảng lương (bấm Tính lại)` });

  return (
    <div className="card">
      <div className="row">
        <strong className="grow">Chốt lương tháng này</strong>
        <span className={st.cls}>{st.label}</span>
      </div>
      {state.overlap_legacy && <p className="msg warn" role="status">Có kỳ lương cũ (tạo theo kiểu cũ) trùng một phần với tháng này, nên chưa tính lương tháng này được. Hãy báo quản trị xử lý kỳ cũ.</p>}
      {!locked && todo.length > 0 && (
        <div className="msg warn" role="status">
          <strong>Việc cần xong trước khi khóa kỳ:</strong>
          {todo.map((t) => (
            <p key={t.text}>{t.text}{t.go && onGo && <> <button type="button" className="link inline" onClick={() => onGo(t.go!.tab, t.go!.section)}>{t.go.label}</button></>}</p>
          ))}
        </div>
      )}
      {!locked && todo.length === 0 && state.status !== 'none' && <p className="muted">Không còn việc dang dở. Có thể khóa kỳ (chốt số).</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}

      {state.can_edit && !locked && !state.overlap_legacy && (
        <button className="primary" disabled={busy || !online}
          onClick={() => void run(async () => { const r = await settleMonth(orgId, state.from); setInfo(`Đã tính ${r.lines} dòng cho ${r.workers} người, tổng ${fmtVnd(r.total)}.`); })}>
          {state.status === 'none' ? 'Tính lương tháng này' : 'Tính lại'}
        </button>
      )}
      {state.is_owner && !locked && state.period_id && (
        <button className="secondary" disabled={busy || !online || b.blocked}
          onClick={() => {
            if (window.confirm('Khóa kỳ này? Sau khi khóa, công và các khoản thưởng/phạt/tạm ứng trong tháng không sửa được nữa (chủ có thể mở khóa kèm lý do).'))
              void run(() => lockPeriod(state.period_id!), 'Đã khóa kỳ. Số liệu tháng này đã chốt.');
          }}>Khóa kỳ (chốt số)</button>
      )}
      {state.is_owner && !locked && b.blocked && state.period_id && <p className="muted">Nút Khóa kỳ sẽ bật khi xong các việc trên.</p>}
      {!state.is_owner && !locked && state.period_id && <p className="muted">Chỉ chủ cơ sở được khóa kỳ.</p>}
      {state.is_owner && locked && !unlocking && <button className="secondary" disabled={busy || !online} onClick={() => setUnlocking(true)}>Mở khóa kỳ</button>}
      {unlocking && (
        <div className="inline-form">
          <label>Lý do mở khóa (ít nhất 5 ký tự)<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="btnrow">
            <button className="primary" disabled={busy || !online} onClick={() => {
              if (reason.trim().length < 5) return setError('Hãy ghi lý do (ít nhất 5 ký tự).');
              void run(async () => { await unlockPeriod(state.period_id!, reason); setUnlocking(false); setReason(''); }, 'Đã mở khóa. Sửa xong hãy Tính lại rồi Khóa kỳ.');
            }}>Mở khóa</button>
            <button type="button" className="secondary" onClick={() => { setUnlocking(false); setReason(''); setError(null); }}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
