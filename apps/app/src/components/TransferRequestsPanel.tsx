import { useCallback, useEffect, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { decideCycleTransfer, listTransferRequests, TRANSFER_STATUS_LABEL, type TransferRequest } from '../lib/cycleTransfer';
import type { CoopHousehold } from '../lib/members';
import { Collapsible } from './Collapsible';

/**
 * HTX duyệt yêu cầu "chuyển vụ theo HTX thành vụ riêng" của hộ (D156). Duyệt: chủ vụ chuyển sang hộ, nhật ký/giai đoạn/thu hoạch đi theo vụ;
 * chi phí, doanh thu HTX đã ghi và phiếu thu mua giữ ở sổ HTX. Hộ phải có tài khoản riêng, còn gói và còn hạn mức (máy chủ kiểm lại lúc duyệt).
 */
export function TransferRequestsPanel({ coopId, households, canEdit }: { coopId: string; households: CoopHousehold[]; canEdit: boolean }) {
  const [rows, setRows] = useState<TransferRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setRows(await listTransferRequests('cooperative', coopId)); setErr(null); } catch (e) { setErr(friendlyError(e)); }
  }, [coopId]);
  useEffect(() => { void load(); }, [load]);

  const nameOf = (hid: string) => households.find((h) => h.household_org_id === hid)?.name ?? 'Hộ';
  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const history = (rows ?? []).filter((r) => r.status !== 'pending').slice(0, 20);

  async function decide(r: TransferRequest, approve: boolean) {
    let reason = '';
    if (approve) { if (!window.confirm(`Duyệt cho ${nameOf(r.household_org_id)} quản lý riêng vụ "${r.production_cycles?.name || r.production_cycles?.code || 'vụ'}"? Chủ vụ chuyển sang hộ; không đổi ngược lại được.`)) return; }
    else { reason = window.prompt('Lý do từ chối (ít nhất 3 ký tự):') ?? ''; if (reason.trim().length < 3) return; }
    setBusy(true); setErr(null); setOk(null);
    try { await decideCycleTransfer(r.id, approve, reason.trim()); setOk(approve ? 'Đã chuyển vụ sang hộ.' : 'Đã từ chối yêu cầu.'); await load(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Collapsible title="Yêu cầu chuyển vụ sang vụ riêng" summary={rows === null ? 'Đang tải…' : pending.length ? `${pending.length} yêu cầu chờ duyệt` : 'Không có yêu cầu chờ'} warn={pending.length > 0} defaultOpen={pending.length > 0}>
      <p className="muted">Hộ có tài khoản riêng, còn gói dịch vụ và còn hạn mức có thể xin quản lý riêng một vụ đang ghi theo HTX. Chỉ chuyển một chiều.</p>
      {err && <p className="msg error" role="alert">{err}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      {pending.map((r) => (
        <div className="card slim" key={r.id}>
          <div className="row"><strong>{nameOf(r.household_org_id)}</strong><span className="muted">{fmtDate(r.created_at)}</span></div>
          <p>Vụ: {r.production_cycles?.name || r.production_cycles?.code || '—'}</p>
          {r.note && <p className="muted">Hộ ghi: {r.note}</p>}
          {canEdit && (
            <div className="actions">
              <button className="primary" disabled={busy || !navigator.onLine} onClick={() => void decide(r, true)}>Duyệt chuyển</button>
              <button className="secondary" disabled={busy || !navigator.onLine} onClick={() => void decide(r, false)}>Từ chối</button>
            </div>
          )}
        </div>
      ))}
      {history.length > 0 && <p className="muted">Gần đây:</p>}
      {history.map((r) => (
        <p key={r.id} className="muted">
          {fmtDate(r.decided_at ?? r.created_at)} · {nameOf(r.household_org_id)} · {r.production_cycles?.name || r.production_cycles?.code || 'vụ'} · {TRANSFER_STATUS_LABEL[r.status]}{r.decision_reason ? ` (${r.decision_reason})` : ''}
        </p>
      ))}
    </Collapsible>
  );
}
