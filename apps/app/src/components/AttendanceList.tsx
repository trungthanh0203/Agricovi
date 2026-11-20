import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapsible } from './Collapsible';
import { RowMenu } from './RowMenu';
import { bulkConfirmAttendance, closeOpenShift, closeStaleShifts, listAttendancePage, type AttPage, type AttPageRow, type AttStatusFilter } from '../lib/attendanceAdmin';
import { absenceBadge, absenceOn, fetchAbsences, type Absence } from '../lib/absences';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import {
  ATT_STATUS_LABEL, confirmAttendance, decideAdjustment, fmtMinutes, listAdjustments, rejectAttendance, requestAdjustment,
  type AdjustmentRequest, type AttendanceRow, type WorkerLite,
} from '../lib/work';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const STATUS_OPTIONS: { id: AttStatusFilter; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ xác nhận' },
  { id: 'open', label: 'Đang trong ca' },
  { id: 'flagged', label: 'Có ngoại lệ / ảnh cờ đỏ' },
  { id: 'confirmed', label: 'Đã xác nhận' },
  { id: 'rejected', label: 'Đã từ chối' },
];

export interface ListPreset { status: AttStatusFilter; range: 'prev' | 'today' | 'month' | 'all' | 'stale'; stamp: number; expected?: number }

/**
 * Danh sách công (D115): lọc theo ngày, trạng thái, tên; phân trang 50 dòng do máy chủ cắt nên đủ cho cơ sở hàng trăm người.
 * Chủ/quản lý có nút xác nhận hàng loạt các công hợp lệ; tổ trưởng chỉ thấy người trong tổ (chính sách RLS).
 */
export function AttendanceList({ orgId, isAdmin, isOwner, meId, workers, online, preset, onFocusChange, onChanged }: {
  orgId: string; isAdmin: boolean; isOwner: boolean; meId: string | null; workers: WorkerLite[]; online: boolean; preset: ListPreset | null;
  /** Báo cho khung ngoài biết đang ở chế độ tập trung (bấm Xem ở Cần xử lý) để ẩn khung Cần xử lý */
  onFocusChange?: (focused: boolean) => void; onChanged: () => void;
}) {
  // Mặc định: hôm nay, trạng thái Chờ xác nhận (việc chủ/quản lý cần làm nhất)
  const [range, setRange] = useState<'custom' | 'all' | 'stale'>('custom')   // 'all' và 'stale' chỉ đến từ nút Xem ở khung Cần xử lý; 'custom' = Từ ngày – Đến ngày
  const [status, setStatus] = useState<AttStatusFilter>('pending');
  const [dFrom, setDFrom] = useState(todayLocal());
  const [dTo, setDTo] = useState(todayLocal());
  // giá trị đang chọn trong bộ lọc; chỉ áp dụng khi bấm Tìm
  const [fromIn, setFromIn] = useState(todayLocal());
  const [toIn, setToIn] = useState(todayLocal());
  const [statusIn, setStatusIn] = useState<AttStatusFilter>('pending');
  const appliedQ = '';
  const [page, setPage] = useState(0);
  const [expected, setExpected] = useState<number | undefined>(undefined);   // số lượng dự kiến khi xem mọi ngày (để dừng sớm nếu CSDL cũ)
  const [size, setSize] = useState(50);                // số dòng mỗi trang (máy chủ cắt trang, tối đa 100)
  const [data, setData] = useState<AttPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [adjFor, setAdjFor] = useState<string | null>(null);
  const [adjs, setAdjs] = useState<AdjustmentRequest[]>([]);
  const [abs, setAbs] = useState<Absence[]>([]);
  const headRef = useRef<HTMLHeadingElement>(null);
  const [closeAt, setCloseAt] = useState('17:00');   // giờ ra dùng khi đóng nhanh các ca quên ra ca
  const focused = range === 'all' || range === 'stale';   // đang xem từ nút Xem ở Cần xử lý: không chọn ngày/lọc
  useEffect(() => { onFocusChange?.(focused); }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở từ "Hôm nay" bằng một bộ lọc sẵn (ví dụ: công chờ xác nhận)
  useEffect(() => {
    if (!preset) return;
    const t = todayLocal();
    const ms = `${t.slice(0, 8)}01`;
    const pe = addDays(ms, -1);
    if (preset.range === 'all' || preset.range === 'stale') setRange(preset.range);
    else {
      setRange('custom');
      const [f, e] = preset.range === 'today' ? [t, t] : preset.range === 'month' ? [ms, t] : [`${pe.slice(0, 8)}01`, pe];
      setDFrom(f); setDTo(e); setFromIn(f); setToIn(e);
    }
    setStatus(preset.status); setStatusIn(preset.status); setPage(0); setExpected(preset.expected);
    // bấm "Xem" ở khung Cần xử lý: cuộn tới bảng để thấy danh sách đã lọc
    window.setTimeout(() => headRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [preset?.stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayLocal();
  // 'all': mọi ngày (công chờ xác nhận ở Cần xử lý đếm cả những ngày cũ); 'stale': mọi ngày trước hôm nay (ca quên ra ca); 'custom': Từ ngày – Đến ngày người dùng chọn
  const from = range === 'custom' ? (dFrom || today) : '2000-01-01';
  const to = range === 'stale' ? addDays(today, -1) : range === 'custom' ? (dTo || today) : today;

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      setData(await listAttendancePage(orgId, { from, to, status, q: appliedQ, limit: size, offset: page * size, expected: focused ? expected : undefined }));
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, from, to, status, appliedQ, page, size, focused, expected]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetchAbsences(orgId, from, to).then(setAbs).catch(() => setAbs([])); }, [orgId, from, to]);
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
    } catch (e) {
      // CSDL cũ (chưa chạy migration 0229) chỉ cho xác nhận hàng loạt trong 31 ngày
      setError(/31 ngày/.test(String((e as Error).message)) && focused
        ? 'Xác nhận hàng loạt cho mọi ngày cần cập nhật cơ sở dữ liệu lên bản mới (nhờ người cài đặt chạy "npx supabase db push"). Bạn vẫn xác nhận từng công được, hoặc quay lại bảng công, chọn Tháng này để xác nhận hàng loạt.'
        : friendlyError(e));
    } finally { setBusy(false); }
  }

  const canCloseAll = isAdmin || workers.length > 0;
  async function closeAll() {
    if (busy || !closeAt) return;
    if (!window.confirm(`Đóng tất cả các ca quên ra ca lúc ${closeAt} của từng ngày? ${isOwner ? 'Công đóng xong sẽ được xác nhận luôn.' : 'Công đóng xong sẽ chờ xác nhận.'} Ca vào muộn hơn ${closeAt} sẽ được giữ lại.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await closeStaleShifts(orgId, closeAt);
      setNotice(`Đã đóng ${r.closed} ca${r.skipped ? `. Còn ${r.skipped} ca chưa đóng (vào muộn hơn ${closeAt}, kỳ lương đã khóa hoặc không đủ quyền): đóng riêng từng ca ở bảng dưới.` : '.'}`);
      await load(); onChanged();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  function closeOne(a: { id: string; work_date: string; worker_name: string }) {
    const t = window.prompt(`Giờ ra của ${a.worker_name} ngày ${fmtDate(a.work_date)} (giờ:phút, ví dụ 17:00)?`, closeAt);
    if (!t) return;
    if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return setError('Giờ ra nhập dạng giờ:phút, ví dụ 17:00.');
    const [h, m] = t.trim().split(':');
    void run(() => closeOpenShift(a.id, new Date(`${a.work_date}T${h!.padStart(2, '0')}:${m}:00`)));
  }

  const canConfirm = (a: { worker_id: string }) => isAdmin || (a.worker_id !== meId && workers.some((w) => w.id === a.worker_id));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const rows = data?.rows ?? [];
  const adjRec = adjFor ? rows.find((r) => r.id === adjFor) : undefined;
  const pendingAdjs = adjs.filter((x) => x.status === 'pending');

  return (
    <>
      {focused ? (
        <div className="card">
          <button type="button" className="link" onClick={() => { setRange('custom'); setDFrom(todayLocal()); setDTo(todayLocal()); setFromIn(todayLocal()); setToIn(todayLocal()); setStatus('pending'); setStatusIn('pending'); setPage(0); }}>‹ Quay lại bảng công</button>
          <h2 ref={headRef}>{range === 'all' ? 'Công chờ xác nhận' : 'Ca quên ra ca'}{data ? ` (${total})` : ''}</h2>
          <p className="muted">{range === 'all' ? 'Mọi công đã ra ca nhưng chưa được xác nhận, của tất cả các ngày.' : 'Các ca đã mở từ những ngày trước mà chưa ra ca.'}</p>
          {range === 'stale' && canCloseAll && total > 0 && (
            <div className="inline-form">
              <label>Đóng nhanh tất cả: giờ ra mỗi ngày<input type="time" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} /></label>
              <button type="button" className="primary" disabled={busy || !online || !closeAt} onClick={() => void closeAll()}>✔ Đóng tất cả {total} ca lúc {closeAt}</button>
              <p className="muted">Mỗi ca được đóng lúc {closeAt || '…'} của chính ngày làm đó. Ca vào muộn hơn giờ này sẽ được giữ lại để bạn đóng riêng từng ca. {isOwner ? 'Công đóng xong được xác nhận luôn.' : 'Công đóng xong ở trạng thái chờ xác nhận.'}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="filters att-filters">
            <div className="pair">
              <label>Từ ngày<input type="date" value={fromIn} max={toIn || today} onChange={(e) => setFromIn(e.target.value)} /></label>
              <label>Đến ngày<input type="date" value={toIn} min={fromIn} max={today} onChange={(e) => setToIn(e.target.value)} /></label>
            </div>
            <div className="searchrow">
              <label>Trạng thái
                <select value={statusIn} onChange={(e) => setStatusIn(e.target.value as AttStatusFilter)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <button type="button" className="secondary" onClick={() => {
                if (!fromIn || !toIn) { setError('Hãy chọn từ ngày và đến ngày.'); return; }
                if (toIn < fromIn) { setError('Đến ngày không được trước từ ngày.'); return; }
                setError(null); setDFrom(fromIn); setDTo(toIn); setStatus(statusIn); setPage(0);
              }}>Tìm</button>
            </div>
          </div>
        </>
      )}

      {error && <p className="msg error" role="alert">{error}</p>}
      {notice && <p className="msg ok" role="status">{notice}</p>}

      {pendingAdjs.length > 0 && (
        <Collapsible inline defaultOpen title={`Đề nghị sửa công chờ duyệt (${pendingAdjs.length})`} warn summary={isAdmin ? 'bấm Duyệt hoặc Từ chối' : 'chờ quản lý duyệt'}>
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
        </Collapsible>
      )}

      {!focused && <h2 className="sect" ref={headRef}>{status === 'pending' ? 'Các công chờ xác nhận' : status === 'open' ? 'Các ca chưa ra ca' : status === '' ? 'Danh sách công' : STATUS_OPTIONS.find((o) => o.id === status)?.label}</h2>}
      <p className="muted">{data ? (total === 0 ? 'Không có bản ghi nào.' : `Hiện ${page * size + 1}–${Math.min(total, (page + 1) * size)} trong ${total} bản ghi.`) : 'Đang tải…'}</p>
      <table className="grid">
        <thead><tr><th>Người · ngày</th><th>Giờ làm</th><th></th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={a.status === 'rejected' ? 'off' : ''}>
              <td>
                {a.worker_name}<span className="sub">{fmtDate(a.work_date)} · {hhmm(a.started_at)}{a.ended_at ? `–${hhmm(a.ended_at)}` : (a.work_date < today ? ' (quên ra ca)' : ' (đang trong ca)')}{a.source === 'kiosk' ? ' · máy chấm công' : ''}</span>
                {(() => { const ab = absenceOn(abs, a.worker_id, a.work_date); return ab ? <span className="pill warn">Đã ghi nghỉ ngày này: {absenceBadge(ab)}, nhưng có chấm công</span> : null; })()}
                {a.exception_reason && <span className="sub">{a.exception_reason}</span>}
                {a.has_photo && <span className="pill warn">Có ảnh cờ đỏ</span>}
              </td>
              <td>
                {a.ended_at ? fmtMinutes(a.status === 'confirmed' ? a.approved_minutes : a.declared_minutes) : '—'}
                <span className={a.status === 'confirmed' ? 'pill ok' : a.status === 'rejected' ? 'pill err' : 'pill warn'}>{ATT_STATUS_LABEL[a.status]}</span>
              </td>
              <td className="act">
                <RowMenu label={`Công ${a.worker_name} ${fmtDate(a.work_date)}`} items={[
                  ...(!a.ended_at && a.status !== 'rejected' && a.work_date < today && canConfirm(a)
                    ? [{ label: 'Đóng ca (nhập giờ ra)', icon: '⏹', disabled: busy || !online, onClick: () => closeOne(a) }] : []),
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

      {(pages > 1 || size !== 50) && (
        <div className="btnrow">
          <label className="inline-label">Số dòng mỗi trang
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      )}

      {pages > 1 && (
        <div className="btnrow">
          <button className="secondary" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>‹ Trước</button>
          <span className="muted pager">Trang {page + 1}/{pages}</span>
          <button className="secondary" disabled={page + 1 >= pages || busy} onClick={() => setPage(page + 1)}>Sau ›</button>
        </div>
      )}

      {isAdmin && (status === '' || status === 'pending') && (status === 'pending' ? total > 0 : rows.some((r) => r.status === 'needs_confirmation')) && (
        <button className="primary" disabled={busy || !online} onClick={() => void bulk()}>✔ Xác nhận các công hợp lệ trong khoảng này</button>
      )}

      {adjRec && (
        <AdjustForm key={adjRec.id} rec={adjRec} busy={busy || !online} onClose={() => setAdjFor(null)}
          onSave={(p, r) => run(async () => { await requestAdjustment(adjRec.id, p, r); setAdjFor(null); setAdjs(await listAdjustments(orgId)); })} />
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
