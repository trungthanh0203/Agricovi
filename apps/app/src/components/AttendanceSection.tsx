import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from './Collapsible';
import { RowMenu } from './RowMenu';
import { AttendanceOverview } from './AttendanceOverview';
import { KioskAdmin } from './KioskAdmin';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { stageForDay } from '../lib/cycles';
import {
  ATT_STATUS_LABEL, clockIn, clockOut, clockOutLocal, confirmAttendance, decideAdjustment, fmtMinutes, listAdjustments, listAttendance,
  ensureMyWorker, listWorkers, recalledMyWorker, recordShift, rejectAttendance, rememberMyWorker, requestAdjustment,
  type AdjustmentRequest, type AttendanceRow, type WorkerLite,
} from '../lib/work';
import { useTable } from '../lib/tables';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Chấm công và sản lượng (D42): vào/ra ca của chính mình; tổ trưởng/quản lý chấm hộ và ghi sản lượng; xác nhận công.
 * Cần mạng (chấm công offline sẽ làm sau). Máy chủ kiểm quyền; người không có hồ sơ lao động chỉ xem được phần được phép.
 */
export function AttendanceSection({ onOpenCycle, onLogFor }: { onOpenCycle?: (id: string, opts?: { calendar?: boolean; notice?: string }) => void; onLogFor?: (cycleId: string | null) => void }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brk, setBrk] = useState('0');
  const [cycleId, setCycleId] = useState('');
  const [adjFor, setAdjFor] = useState<string | null>(null);
  const [adjs, setAdjs] = useState<AdjustmentRequest[]>([]);
  const localShift = useLiveQuery(async () => (active ? (await db.localShifts.where('org').equals(active.id).toArray())[0] ?? null : null), [active?.id], null);
  const cycles = useTable('cycles').filter((c) => c.status === 'active' && c.owner_org_id === active?.id);
  const recalled = active && uid ? recalledMyWorker(active.id, uid) : null;

  const orgId = active?.id;
  const isAdmin = hasRole(active?.roles, 'manager');
  const me = workers.find((w) => w.user_id === uid) ?? null;
  const others = workers.filter((w) => w.id !== me?.id && w.status === 'active');
  const canRecordFor = isAdmin ? workers.filter((w) => w.status === 'active') : others; // tổ trưởng chỉ thấy người trong tổ (máy chủ lọc)
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.full_name ?? '—';

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const from = addDays(todayLocal(), -31);
      let w = await listWorkers(orgId);
      // chủ/quản lý/nhân viên chưa có hồ sơ lao động: tự tạo để chấm công như nhân sự khác
      if (uid && !w.some((x) => x.user_id === uid) && hasRole(active?.roles, 'manager', 'worker')) {
        await ensureMyWorker(orgId).catch(() => undefined);
        w = await listWorkers(orgId);
      }
      const [a, aj] = await Promise.all([listAttendance(orgId, from), listAdjustments(orgId).catch(() => [])]);
      setWorkers(w); setAtt(a); setAdjs(aj);
      const mine = w.find((x) => x.user_id === uid);
      if (mine && uid) rememberMyWorker(orgId, uid, mine.id);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, uid, active?.roles]);
  useEffect(() => { void load(); }, [load]);

  const openShift = useMemo(() => att.find((a) => a.worker_id === me?.id && !a.ended_at && a.status !== 'rejected') ?? null, [att, me?.id]);


  /** Vào ca; nếu có chọn vụ thì báo giai đoạn của hôm nay và chuyển tới Lịch của vụ đó */
  async function startShift() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await clockIn(active.id, me?.id ?? recalled, cycleId || null);
      await load();
      if (cycleId && onOpenCycle) {
        const st = await db.stages.where('cycle_id').equals(cycleId).toArray();
        const today = todayLocal();
        const stage = stageForDay(st, today);
        const cyc = cycles.find((c) => c.id === cycleId);
        const name = cyc?.name || cyc?.template_name || 'Vụ';
        const when = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const what = stage
          ? `Hôm nay vụ "${name}" đang ở giai đoạn "${stage.name}"${stage.planned_start && stage.planned_end ? ` (${fmtDate(stage.planned_start)} – ${fmtDate(stage.planned_end)})` : ''}. Hãy làm việc theo giai đoạn này.`
          : `Vụ "${name}" hiện chưa có giai đoạn nào cho hôm nay.`;
        onOpenCycle(cycleId, { calendar: true, notice: `Bạn đã vào ca lúc ${when}. ${what}` });
      }
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  /** Ra ca không còn bắt buộc đã Ghi việc: việc được kiểm khi bấm Xong ở Quản lý vụ (người quản lý ghi việc theo quy định) */
  async function endShift(_startIso: string, doOut: () => Promise<unknown>) {
    await run(doOut);
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (!active) return null;
  const recent = att.filter((a) => a.work_date >= addDays(todayLocal(), -14));
  const canConfirm = (a: { worker_id: string }) => isAdmin || (a.worker_id !== me?.id && workers.some((w) => w.id === a.worker_id));

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chấm công cần có mạng. Hãy kết nối mạng rồi thử lại.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {me || recalled ? (
        <div className="card">
          <h2>Chấm công của tôi</h2>
          {cycles.length > 0 && (
            <label>Làm cho vụ (không bắt buộc)
              <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                <option value="">— Không gắn vụ —</option>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}
              </select>
            </label>
          )}
          {localShift ? (
            <>
              <p>Bạn vào ca lúc <strong>{hhmm(localShift.started_at)}</strong> (lưu trên máy{online ? '' : ', đang mất mạng'}).</p>
              <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
              <button className="primary" disabled={busy}
                onClick={() => void endShift(localShift.started_at, () => clockOutLocal(localShift, Math.max(0, parseInt(brk || '0', 10) || 0), cycleId || null))}>Ra ca</button>
              <p className="muted">Ca sẽ được gửi lên khi có mạng, rồi chờ tổ trưởng hoặc quản lý xác nhận.</p>
            </>
          ) : openShift ? (
            <>
              <p>Bạn vào ca lúc <strong>{hhmm(openShift.started_at)}</strong> ngày {fmtDate(openShift.work_date)}{openShift.start_lat != null ? ' · đã ghi vị trí' : ''}.</p>
              <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
              <button className="primary" disabled={busy || !online}
                onClick={() => void endShift(openShift.started_at, () => clockOut(openShift.id, Math.max(0, parseInt(brk || '0', 10) || 0), cycleId || null))}>Ra ca</button>
            </>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void startShift()}>Vào ca</button>
          )}
          <p className="muted">Vị trí chỉ được ghi lúc bạn bấm Vào ca/Ra ca (nếu bạn cho phép), không theo dõi liên tục. Công được xác nhận trước khi tính tiền.</p>
        </div>
      ) : (
        <p className="muted">Bạn chưa có hồ sơ lao động ở cơ sở này nên không tự chấm công được{canRecordFor.length > 0 ? ', nhưng có thể chấm công hộ người trong tổ' : ''}.</p>
      )}

      {canRecordFor.length > 0 && (
        <Collapsible inline title="＋ Chấm công hộ" summary="nhập ca đã làm của người khác">
          <ShiftForm workers={canRecordFor} cycles={cycles} att={att} busy={busy || !online} onSave={(w, s, e, b, n, c) => run(() => recordShift(w, s, e, b, n, c))} />
        </Collapsible>
      )}

      {canRecordFor.length > 0 && <AttendanceOverview orgId={active.id} workers={workers} att={att} isAdmin={isAdmin} />}

      {isAdmin && <KioskAdmin workers={workers} />}

      <h2 className="sect">Công gần đây ({recent.length})</h2>
      <table className="grid">
        <thead><tr><th>Người · ngày</th><th>Giờ làm</th><th></th></tr></thead>
        <tbody>
          {recent.length === 0 && <tr><td colSpan={3} className="muted">Chưa có bản ghi công.</td></tr>}
          {recent.map((a) => (
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
                <RowMenu label={`Công ${nameOf(a.worker_id)} ${fmtDate(a.work_date)}`} items={[
                  ...(a.ended_at && a.status !== 'rejected' && (a.worker_id === me?.id || canConfirm(a))
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

      {adjFor && att.find((x) => x.id === adjFor) && (
        <AdjustForm key={adjFor} rec={att.find((x) => x.id === adjFor)!} busy={busy || !online} onClose={() => setAdjFor(null)}
          onSave={(p, r) => run(async () => { await requestAdjustment(adjFor, p, r); setAdjFor(null); })} />
      )}

      {adjs.filter((x) => x.status === 'pending').length > 0 && (
        <>
          <h2 className="sect">Yêu cầu sửa công chờ duyệt</h2>
          {adjs.filter((x) => x.status === 'pending').map((x) => {
            const rec = att.find((r) => r.id === x.attendance_id);
            return (
              <div className="card slim" key={x.id}>
                <strong>{rec ? nameOf(rec.worker_id) : 'Công'}</strong> · {rec ? fmtDate(rec.work_date) : ''}
                <p className="muted">Đề nghị: {x.proposed.started_at ? `vào ${hhmm(x.proposed.started_at)} ` : ''}{x.proposed.ended_at ? `ra ${hhmm(x.proposed.ended_at)} ` : ''}{x.proposed.break_minutes != null ? `nghỉ ${x.proposed.break_minutes} phút` : ''}</p>
                <p className="muted">Lý do: {x.reason}</p>
                {isAdmin ? (
                  <div className="actions">
                    <button className="primary" disabled={busy || !online} onClick={() => void run(() => decideAdjustment(x.id, true))}>Duyệt</button>
                    <button className="secondary" disabled={busy || !online} onClick={() => void run(() => decideAdjustment(x.id, false))}>Từ chối</button>
                  </div>
                ) : <span className="pill warn">Chờ quản lý duyệt</span>}
              </div>
            );
          })}
        </>
      )}

      <p className="muted">✔ xác nhận, ✕ từ chối (cần lý do). Chỉ công đã xác nhận mới được tính tiền.</p>
    </>
  );
}

type CycleOpt = { id: string; name?: string | null; template_name?: string | null };
const CycleSelect = ({ cycles, value, onChange }: { cycles: CycleOpt[]; value: string; onChange: (v: string) => void }) => cycles.length === 0 ? null : (
  <label>Vụ (không bắt buộc)
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Không gắn vụ —</option>
      {cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}
    </select>
  </label>
);

function ShiftForm({ workers, cycles, att, busy, onSave }: { workers: WorkerLite[]; cycles: CycleOpt[]; att: AttendanceRow[]; busy: boolean; onSave: (w: string, s: Date, e: Date, b: number, note: string, c: string | null) => Promise<unknown> }) {
  const [cyc, setCyc] = useState('');
  const [w, setW] = useState(workers[0]?.id ?? '');
  const [date, setDate] = useState(todayLocal());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [brk, setBrk] = useState('0');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const s = new Date(`${date}T${from}:00`);
    const t = new Date(`${date}T${to}:00`);
    const wid = w || workers[0]?.id;
    if (!wid) return setErr('Hãy chọn người.');
    if (!from || !to) return setErr('Hãy nhập giờ bắt đầu và giờ kết thúc.');
    if (!(t > s)) return setErr('Giờ kết thúc phải sau giờ bắt đầu.');
    const clash = att.find((a) => a.worker_id === wid && a.status !== 'rejected' && new Date(a.started_at) < t && (a.ended_at ? new Date(a.ended_at) > s : true));
    if (clash) return setErr(`Người này đã có công ${hhmm(clash.started_at)}${clash.ended_at ? `–${hhmm(clash.ended_at)}` : ''} ngày ${fmtDate(clash.work_date)}, trùng giờ vừa nhập. Hãy kiểm tra lại.`);
    setErr(null);
    setOk(null);
    const who = workers.find((x) => x.id === wid)?.full_name ?? '';
    void onSave(wid, s, t, Math.max(0, parseInt(brk || '0', 10) || 0), note, cyc || null)
      .then(() => { setNote(''); setFrom(''); setTo(''); setOk(`Đã lưu công cho ${who} (đang ở trạng thái Chờ xác nhận): ${date.split('-').reverse().join('/')} ${hhmm(s.toISOString())}–${hhmm(t.toISOString())}.`); })
      .catch(() => undefined);
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
      <CycleSelect cycles={cycles} value={cyc} onChange={setCyc} />
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      <button type="submit" className="secondary" disabled={busy}>Lưu công</button>
    </form>
  );
}

/** Đề nghị sửa giờ vào/ra/phút nghỉ của một ca đã xong (có lý do); quản lý duyệt thì công được cập nhật và xác nhận */
function AdjustForm({ rec, busy, onSave, onClose }: {
  rec: AttendanceRow; busy: boolean; onSave: (p: { started_at?: string; ended_at?: string; break_minutes?: number }, reason: string) => Promise<unknown>; onClose: () => void;
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
