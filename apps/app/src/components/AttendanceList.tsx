import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RowMenu } from './RowMenu';
import { bulkConfirmAttendance, listAttendancePage, type AttPage, type AttPageRow, type AttStatusFilter } from '../lib/attendanceAdmin';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import {
  ATT_STATUS_LABEL, confirmAttendance, decideAdjustment, fmtMinutes, listAdjustments, rejectAttendance, requestAdjustment,
  type AdjustmentRequest, type AttendanceRow, type WorkerLite,
} from '../lib/work';

const PAGE = 50;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const RANGES: { id: string; label: string; days: number }[] = [
  { id: 'today', label: 'Hôm nay', days: 0 },
  { id: 'week', label: '7 ngày', days: 6 },
  { id: 'month', label: '30 ngày', days: 29 },
];
const STATUS_OPTIONS: { id: AttStatusFilter; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ xác nhận' },
  { id: 'open', label: 'Đang trong ca' },
  { id: 'flagged', label: 'Có ngoại lệ / ảnh cờ đỏ' },
  { id: 'confirmed', label: 'Đã xác nhận' },
  { id: 'rejected', label: 'Đã từ chối' },
];

export interface ListPreset { status: AttStatusFilter; range: 'today' | 'week' | 'month'; stamp: number }

/**
 * Danh sách công (D115): lọc theo ngày, trạng thái, tên; phân trang 50 dòng do máy chủ cắt nên đủ cho cơ sở hàng trăm người.
 * Chủ/quản lý có nút xác nhận hàng loạt các công hợp lệ; tổ trưởng chỉ thấy người trong tổ (chính sách RLS).
 */
export function AttendanceList({ orgId, isAdmin, meId, workers, online, preset, onChanged }: {
  orgId: string; isAdmin: boolean; meId: string | null; workers: WorkerLite[]; online: boolean; preset: ListPreset | null; onChanged: () => void;
}) {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const [status, setStatus] = useState<AttStatusFilter>('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AttPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [adjFor, setAdjFor] = useState<string | null>(null);
  const [adjs, setAdjs] = useState<AdjustmentRequest[]>([]);

  // Mở từ "Hôm nay" bằng một bộ lọc sẵn (ví dụ: công chờ xác nhận)
  useEffect(() => {
    if (!preset) return;
    setRange(preset.range); setStatus(preset.status); setQ(''); setAppliedQ(''); setPage(0);
  }, [preset?.stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = RANGES.find((r) => r.id === range)?.days ?? 0;
  const to = todayLocal();
  const from = addDays(to, -days);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      setData(await listAttendancePage(orgId, { from, to, status, q: appliedQ, limit: PAGE, offset: page * PAGE }));
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, from, to, status, appliedQ, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (navigator.onLine) void listAdjustments(orgId).then(setAdjs).catch(() => setAdjs([])); }, [orgId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); await load(); onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function bulk() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const dry = await bulkConfirmAttendance(orgId, from, to, appliedQ, true);
      if (dry.count === 0) { setNotice('Không có công hợp lệ nào cần xác nhận trong khoảng này.'); return; }
      if (!window.confirm(`Xác nhận ${dry.count} công hợp lệ (đã Ra ca, không có ngoại lệ hay ảnh cờ đỏ)? Công có dấu hiệu bất thường sẽ được giữ lại để bạn xem từng cái.`)) return;
      const r = await bulkConfirmAttendance(orgId, from, to, appliedQ, false);
      setNotice(`Đã xác nhận ${r.count} công${r.skipped ? `, bỏ qua ${r.skipped} công (kỳ lương đã khóa hoặc không đủ quyền)` : ''}.`);
      await load(); onChanged();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const canConfirm = (a: { worker_id: string }) => isAdmin || (a.worker_id !== meId && workers.some((w) => w.id === a.worker_id));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const rows = data?.rows ?? [];
  const adjRec = adjFor ? rows.find((r) => r.id === adjFor) : undefined;
  const pendingAdjs = adjs.filter((x) => x.status === 'pending');

  function search(e: FormEvent) { e.preventDefault(); setPage(0); setAppliedQ(q); }

  return (
    <>
      <div className="chips" role="tablist" aria-label="Khoảng ngày">
        {RANGES.map((r) => (
          <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'chip active' : 'chip'} onClick={() => { setRange(r.id as typeof range); setPage(0); }}>{r.label}</button>
        ))}
      </div>
      <div className="filters att-filters">
        <label>Trạng thái
          <select value={status} onChange={(e) => { setStatus(e.target.value as AttStatusFilter); setPage(0); }}>
            {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <form onSubmit={search} className="searchrow">
          <label>Tìm theo tên<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên rồi bấm Tìm" /></label>
          <button type="submit" className="secondary">Tìm</button>
        </form>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}
      {notice && <p className="msg ok" role="status">{notice}</p>}

      {isAdmin && (status === '' || status === 'pending') && (
        <button className="primary" disabled={busy || !online} onClick={() => void bulk()}>✔ Xác nhận các công hợp lệ trong khoảng này</button>
      )}

      <p className="muted">{data ? (total === 0 ? 'Không có bản ghi nào.' : `Hiện ${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} trong ${total} bản ghi.`) : 'Đang tải…'}</p>
      <table className="grid">
        <thead><tr><th>Người · ngày</th><th>Giờ làm</th><th></th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={a.status === 'rejected' ? 'off' : ''}>
              <td>
                {a.worker_name}<span className="sub">{fmtDate(a.work_date)} · {hhmm(a.started_at)}{a.ended_at ? `–${hhmm(a.ended_at)}` : ' (đang trong ca)'}{a.source === 'kiosk' ? ' · máy chấm công' : ''}</span>
                {a.exception_reason && <span className="sub">{a.exception_reason}</span>}
                {a.has_photo && <span className="pill warn">Có ảnh cờ đỏ</span>}
              </td>
              <td>
                {a.ended_at ? fmtMinutes(a.status === 'confirmed' ? a.approved_minutes : a.declared_minutes) : '—'}
                <span className={a.status === 'confirmed' ? 'pill ok' : a.status === 'rejected' ? 'pill err' : 'pill warn'}>{ATT_STATUS_LABEL[a.status]}</span>
              </td>
              <td className="act">
                <RowMenu label={`Công ${a.worker_name} ${fmtDate(a.work_date)}`} items={[
                  ...(a.ended_at && a.status !== 'rejected' && (a.worker_id === meId || canConfirm(a))
                    ? [{ label: 'Đề nghị sửa giờ', icon: '✎', disabled: busy || !online, onClick: () => setAdjFor(adjFor === a.id ? null : a.id) }] : []),
                  ...(a.ended_at && a.status === 'needs_confirmation' && canConfirm(a) ? [
                    { label: 'Xác nhận công', icon: '✔', disabled: busy || !online, onClick: () => void run(() => confirmAttendance(a.id)) },
                    { label: 'Từ chối công', icon: '✕', danger: true, disabled: busy || !online, onClick: () => {
                      const r = window.prompt('Lý do từ chối công này?');
                      if (r) void run(() => rejectAttendance(a.id, r));
                    } },
                  ] : []),
                ]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pages > 1 && (
        <div className="btnrow">
          <button className="secondary" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>‹ Trước</button>
          <span className="muted pager">Trang {page + 1}/{pages}</span>
          <button className="secondary" disabled={page + 1 >= pages || busy} onClick={() => setPage(page + 1)}>Sau ›</button>
        </div>
      )}

      {adjRec && (
        <AdjustForm key={adjRec.id} rec={adjRec} busy={busy || !online} onClose={() => setAdjFor(null)}
          onSave={(p, r) => run(async () => { await requestAdjustment(adjRec.id, p, r); setAdjFor(null); setAdjs(await listAdjustments(orgId)); })} />
      )}

      {pendingAdjs.length > 0 && (
        <>
          <h2 className="sect">Yêu cầu sửa công chờ duyệt ({pendingAdjs.length})</h2>
          {pendingAdjs.map((x) => {
            const rec = rows.find((r) => r.id === x.attendance_id);
            return (
            <div className="card slim" key={x.id}>
              <strong>{rec ? rec.worker_name : 'Đề nghị sửa công'}</strong>{rec ? ` · ${fmtDate(rec.work_date)}` : ''}
              <p className="muted">Đề nghị: {x.proposed.started_at ? `vào ${hhmm(x.proposed.started_at)} ` : ''}{x.proposed.ended_at ? `ra ${hhmm(x.proposed.ended_at)} ` : ''}{x.proposed.break_minutes != null ? `nghỉ ${x.proposed.break_minutes} phút` : ''}</p>
              <p className="muted">Lý do: {x.reason}</p>
              {isAdmin ? (
                <div className="actions">
                  <button className="primary" disabled={busy || !online} onClick={() => void run(async () => { await decideAdjustment(x.id, true); setAdjs(await listAdjustments(orgId)); })}>Duyệt</button>
                  <button className="secondary" disabled={busy || !online} onClick={() => void run(async () => { await decideAdjustment(x.id, false); setAdjs(await listAdjustments(orgId)); })}>Từ chối</button>
                </div>
              ) : <span className="pill warn">Chờ quản lý duyệt</span>}
            </div>
            );
          })}
        </>
      )}

      <p className="muted">Chỉ công đã xác nhận mới được tính tiền. Công từ máy chấm công nằm ở trạng thái Chờ xác nhận cho tới khi bạn xác nhận.</p>
    </>
  );
}

/** Đề nghị sửa giờ vào/ra/phút nghỉ của một ca đã xong (có lý do); quản lý duyệt thì công được cập nhật và xác nhận */
function AdjustForm({ rec, busy, onSave, onClose }: {
  rec: AttPageRow | AttendanceRow; busy: boolean; onSave: (p: { started_at?: string; ended_at?: string; break_minutes?: number }, reason: string) => Promise<unknown>; onClose: () => void;
}) {
  const toTime = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  const [from, setFrom] = useState(toTime(rec.started_at));
  const [to, setTo] = useState(rec.ended_at ? toTime(rec.ended_at) : '');
  const [brk, setBrk] = useState(String(rec.break_minutes));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>Đề nghị sửa công ngày {fmtDate(rec.work_date)}</h2>
      <div className="inline-form">
        <div className="pair">
          <label>Giờ vào<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Giờ ra<input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
        <label>Lý do (bắt buộc)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: quên bấm Ra ca" /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (reason.trim().length < 3) return setErr('Hãy ghi lý do.');
            if (!from || !to) return setErr('Hãy nhập giờ vào và giờ ra.');
            const day = rec.work_date;
            const s = new Date(`${day}T${from}:00`);
            const e = new Date(`${day}T${to}:00`);
            if (!(e > s)) return setErr('Giờ ra phải sau giờ vào.');
            setErr(null);
            void onSave({ started_at: s.toISOString(), ended_at: e.toISOString(), break_minutes: Math.max(0, parseInt(brk || '0', 10) || 0) }, reason).catch(() => undefined);
          }}>Gửi đề nghị</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
