import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import {
  ATT_STATUS_LABEL, clockIn, clockOut, confirmAttendance, confirmOutput, fmtMinutes, listAttendance, listOutputs, listWorkers,
  OUTPUT_STATUS_LABEL, recordOutput, recordShift, rejectAttendance, type AttendanceRow, type OutputRow, type WorkerLite,
} from '../lib/work';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Chấm công và sản lượng (D42): vào/ra ca của chính mình; tổ trưởng/quản lý chấm hộ và ghi sản lượng; xác nhận công.
 * Cần mạng (chấm công offline sẽ làm sau). Máy chủ kiểm quyền; người không có hồ sơ lao động chỉ xem được phần được phép.
 */
export function AttendanceSection() {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [outs, setOuts] = useState<OutputRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brk, setBrk] = useState('0');

  const orgId = active?.id;
  const isAdmin = hasRole(active?.roles, 'manager');
  const me = workers.find((w) => w.user_id === uid) ?? null;
  const others = workers.filter((w) => w.id !== me?.id && w.status === 'active');
  const canRecordFor = isAdmin ? workers.filter((w) => w.status === 'active') : others; // tổ trưởng chỉ thấy người trong tổ (máy chủ lọc)
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.full_name ?? '—';

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const from = addDays(todayLocal(), -14);
      const [w, a, o] = await Promise.all([listWorkers(orgId), listAttendance(orgId, from), listOutputs(orgId, from)]);
      setWorkers(w); setAtt(a); setOuts(o);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const openShift = useMemo(() => att.find((a) => a.worker_id === me?.id && !a.ended_at && a.status !== 'rejected') ?? null, [att, me?.id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (!active) return null;
  const canConfirm = (a: { worker_id: string }) => isAdmin || (a.worker_id !== me?.id && workers.some((w) => w.id === a.worker_id));

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chấm công cần có mạng. Hãy kết nối mạng rồi thử lại.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {me ? (
        <div className="card">
          <h2>Chấm công của tôi</h2>
          {openShift ? (
            <>
              <p>Bạn vào ca lúc <strong>{hhmm(openShift.started_at)}</strong> ngày {fmtDate(openShift.work_date)}.</p>
              <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
              <button className="primary" disabled={busy || !online}
                onClick={() => void run(() => clockOut(openShift.id, Math.max(0, parseInt(brk || '0', 10) || 0)))}>Ra ca</button>
            </>
          ) : (
            <button className="primary" disabled={busy || !online} onClick={() => void run(() => clockIn(active.id))}>Vào ca</button>
          )}
          <p className="muted">Công của bạn được tổ trưởng hoặc quản lý xác nhận trước khi tính tiền.</p>
        </div>
      ) : (
        <p className="muted">Bạn chưa có hồ sơ lao động ở cơ sở này nên không tự chấm công được{canRecordFor.length > 0 ? ', nhưng có thể chấm công hộ người trong tổ' : ''}.</p>
      )}

      {canRecordFor.length > 0 && (
        <>
          <Collapsible inline title="＋ Chấm công hộ" summary="nhập ca đã làm của người khác">
            <ShiftForm workers={canRecordFor} busy={busy || !online} onSave={(w, s, e, b, n) => run(() => recordShift(w, s, e, b, n))} />
          </Collapsible>
          <Collapsible inline title="＋ Ghi sản lượng" summary="khối lượng đã làm của người khác">
            <OutputForm workers={canRecordFor} busy={busy || !online} onSave={(w, d, q, u, n) => run(() => recordOutput(w, d, q, u, n))} />
          </Collapsible>
        </>
      )}

      <h2 className="sect">Công 14 ngày qua ({att.length})</h2>
      <table className="grid">
        <thead><tr><th>Người · ngày</th><th>Giờ làm</th><th></th></tr></thead>
        <tbody>
          {att.length === 0 && <tr><td colSpan={3} className="muted">Chưa có bản ghi công.</td></tr>}
          {att.map((a) => (
            <tr key={a.id} className={a.status === 'rejected' ? 'off' : ''}>
              <td>
                {nameOf(a.worker_id)}<span className="sub">{fmtDate(a.work_date)} · {hhmm(a.started_at)}{a.ended_at ? `–${hhmm(a.ended_at)}` : ' (đang trong ca)'}</span>
                {a.exception_reason && <span className="sub">{a.exception_reason}</span>}
              </td>
              <td>
                {a.ended_at ? fmtMinutes(a.status === 'confirmed' ? a.approved_minutes : a.declared_minutes) : '—'}
                <span className={a.status === 'confirmed' ? 'pill ok' : a.status === 'rejected' ? 'pill err' : 'pill warn'}>{ATT_STATUS_LABEL[a.status]}</span>
              </td>
              <td className="act">
                {a.ended_at && a.status === 'needs_confirmation' && canConfirm(a) && (
                  <>
                    <button className="icon" disabled={busy || !online} aria-label="Xác nhận công" title="Xác nhận" onClick={() => void run(() => confirmAttendance(a.id))}>✔</button>{' '}
                    <button className="icon" disabled={busy || !online} aria-label="Từ chối công" title="Từ chối" onClick={() => {
                      const r = window.prompt('Lý do từ chối công này?');
                      if (r) void run(() => rejectAttendance(a.id, r));
                    }}>✕</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {outs.length > 0 && (
        <>
          <h2 className="sect">Sản lượng 14 ngày qua ({outs.length})</h2>
          <table className="grid">
            <thead><tr><th>Người · ngày</th><th className="num">Sản lượng</th><th></th></tr></thead>
            <tbody>
              {outs.map((o) => (
                <tr key={o.id}>
                  <td>{nameOf(o.worker_id)}<span className="sub">{fmtDate(o.work_date)}{o.note ? ` · ${o.note}` : ''}</span></td>
                  <td className="num">{o.quantity.toLocaleString('vi-VN')} {o.unit}<span className={o.status === 'confirmed' || o.status === 'approved' ? 'pill ok' : 'pill warn'}>{OUTPUT_STATUS_LABEL[o.status]}</span></td>
                  <td className="act">
                    {o.status === 'draft' && canConfirm(o) && (
                      <button className="icon" disabled={busy || !online} aria-label="Xác nhận sản lượng" onClick={() => void run(() => confirmOutput(o.id))}>✔</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="muted">✔ xác nhận, ✕ từ chối (cần lý do). Chỉ công và sản lượng đã xác nhận mới được tính tiền.</p>
    </>
  );
}

function ShiftForm({ workers, busy, onSave }: { workers: WorkerLite[]; busy: boolean; onSave: (w: string, s: Date, e: Date, b: number, note: string) => Promise<unknown> }) {
  const [w, setW] = useState(workers[0]?.id ?? '');
  const [date, setDate] = useState(todayLocal());
  const [from, setFrom] = useState('07:00');
  const [to, setTo] = useState('11:00');
  const [brk, setBrk] = useState('0');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const s = new Date(`${date}T${from}:00`);
    const t = new Date(`${date}T${to}:00`);
    if (!w) return setErr('Hãy chọn người.');
    if (!(t > s)) return setErr('Giờ kết thúc phải sau giờ bắt đầu.');
    setErr(null);
    void onSave(w, s, t, Math.max(0, parseInt(brk || '0', 10) || 0), note).then(() => setNote('')).catch(() => undefined);
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <label>Người lao động
        <select value={w || workers[0]?.id} onChange={(e) => setW(e.target.value)}>{workers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select>
      </label>
      <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="pair">
        <label>Từ giờ<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến giờ<input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <button type="submit" className="secondary" disabled={busy}>Lưu công</button>
    </form>
  );
}

function OutputForm({ workers, busy, onSave }: { workers: WorkerLite[]; busy: boolean; onSave: (w: string, d: string, q: number, u: string, n: string) => Promise<unknown> }) {
  const [w, setW] = useState(workers[0]?.id ?? '');
  const [date, setDate] = useState(todayLocal());
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const q = Number(qty.replace(',', '.'));
    if (!w) return setErr('Hãy chọn người.');
    if (!qty.trim() || Number.isNaN(q) || q <= 0) return setErr('Sản lượng phải là số lớn hơn 0.');
    if (!unit.trim()) return setErr('Hãy nhập đơn vị (kg, giỏ, cây…).');
    setErr(null);
    void onSave(w, date, q, unit, note).then(() => { setQty(''); setNote(''); }).catch(() => undefined);
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <label>Người lao động
        <select value={w || workers[0]?.id} onChange={(e) => setW(e.target.value)}>{workers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select>
      </label>
      <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="pair">
        <label>Sản lượng<input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} /></label>
        <label>Đơn vị<input value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      </div>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <button type="submit" className="secondary" disabled={busy}>Lưu sản lượng</button>
    </form>
  );
}
