import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from './Collapsible';
import { AttendanceList, type ListPreset } from './AttendanceList';
import { AttendancePhotos } from './AttendancePhotos';
import { ChartCard, HBarList } from './charts';
import { KpiTile } from './HomeStats';
import { KioskAdmin } from './KioskAdmin';
import { db } from '../lib/db';
import { getAttendanceSummary, type AttSummary } from '../lib/attendanceAdmin';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { stageForDay } from '../lib/cycles';
import {
  clockIn, clockOut, clockOutLocal, ensureMyWorker, listAttendance, listOrphans, listWorkers, recalledMyWorker, recordShift, rememberMyWorker,
  type AttendanceRow, type WorkerLite,
} from '../lib/work';
import { useTable } from '../lib/tables';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

type Tab = 'today' | 'list' | 'photos' | 'setup';

/**
 * Chấm công (D42, D115). Bốn mục, mỗi mục một việc:
 *  - Hôm nay: số liệu trong ngày, việc cần xử lý, chấm công của tôi, chấm công hộ.
 *  - Công: danh sách phân trang, lọc, xác nhận (cả hàng loạt).
 *  - Ảnh cần xem: ảnh cờ đỏ từ máy chấm công (chỉ chủ/quản lý).
 *  - Thiết lập: máy chấm công và mã PIN (chỉ chủ/quản lý).
 * Số liệu và danh sách do máy chủ tính (không tải cả danh sách công về máy). Cần mạng.
 */
export function AttendanceSection({ onOpenCycle }: { onOpenCycle?: (id: string, opts?: { calendar?: boolean; notice?: string }) => void; onLogFor?: (cycleId: string | null) => void }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const [tab, setTab] = useState<Tab>('today');
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [mine, setMine] = useState<AttendanceRow[]>([]);
  const [sum, setSum] = useState<AttSummary | null>(null);
  const [orphans, setOrphans] = useState<{ worker_id: string; full_name: string; team_name: string | null }[]>([]);
  const [preset, setPreset] = useState<ListPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brk, setBrk] = useState('0');
  const [cycleId, setCycleId] = useState('');
  const localShift = useLiveQuery(async () => (active ? (await db.localShifts.where('org').equals(active.id).toArray())[0] ?? null : null), [active?.id], null);
  const cycles = useTable('cycles').filter((c) => c.status === 'active' && c.owner_org_id === active?.id);
  const recalled = active && uid ? recalledMyWorker(active.id, uid) : null;

  const orgId = active?.id;
  const isAdmin = hasRole(active?.roles, 'manager');
  const me = workers.find((w) => w.user_id === uid) ?? null;
  const others = workers.filter((w) => w.id !== me?.id && w.status === 'active');
  const canRecordFor = isAdmin ? workers.filter((w) => w.status === 'active') : others; // tổ trưởng chỉ thấy người trong tổ (máy chủ lọc)

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      let w = await listWorkers(orgId);
      // chủ/quản lý/nhân viên chưa có hồ sơ lao động: tự tạo để chấm công như nhân sự khác
      if (uid && !w.some((x) => x.user_id === uid) && hasRole(active?.roles, 'manager', 'worker')) {
        await ensureMyWorker(orgId).catch(() => undefined);
        w = await listWorkers(orgId);
      }
      const mineW = w.find((x) => x.user_id === uid);
      setWorkers(w);
      if (mineW && uid) rememberMyWorker(orgId, uid, mineW.id);
      // chỉ công của chính mình (để biết đang trong ca hay chưa); danh sách đầy đủ ở mục "Công" do máy chủ phân trang
      const wid = mineW?.id ?? (uid ? recalledMyWorker(orgId, uid) : null);
      setMine(wid ? await listAttendance(orgId, todayLocal().slice(0, 8) + '01', wid) : []);
      setSum(await getAttendanceSummary(orgId, todayLocal()).catch(() => null));
      if (isAdmin) void listOrphans(orgId).then(setOrphans).catch(() => setOrphans([]));
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, uid, active?.roles, isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const openShift = useMemo(() => mine.find((a) => !a.ended_at && a.status !== 'rejected') ?? null, [mine]);

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

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const goList = (status: ListPreset['status'], range: ListPreset['range']) => { setPreset({ status, range, stamp: Date.now() }); setTab('list'); };

  if (!active) return null;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Hôm nay' },
    { id: 'list', label: 'Công' },
    ...(isAdmin ? [
      { id: 'photos' as Tab, label: `Ảnh cần xem${sum && sum.flagged > 0 ? ` (${sum.flagged})` : ''}` },
      { id: 'setup' as Tab, label: 'Máy chấm công' },
    ] : []),
  ];
  const hours = (m: number) => `${(m / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
  const myState = localShift ? `đang trong ca từ ${hhmm(localShift.started_at)}` : openShift ? `đang trong ca từ ${hhmm(openShift.started_at)}` : 'chưa vào ca';

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chấm công cần có mạng. Hãy kết nối mạng rồi thử lại.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {tabs.length > 1 && (
        <div className="chips" role="tablist" aria-label="Mục chấm công">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'chip active' : 'chip'} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      )}

      {tab === 'today' && (
        <>
          {sum && (
            <div className="kpis">
              <KpiTile label="Đang trong ca" value={String(sum.in_shift)} tone="info" note={`${sum.present}/${sum.workers} người có mặt`} />
              <KpiTile label="Đã ra ca hôm nay" value={String(sum.done)} tone="ok" />
              <KpiTile label="Công chờ xác nhận" value={String(sum.pending)} tone={sum.pending > 0 ? 'warn' : 'ok'} note={sum.pending > 0 ? 'bấm để xem' : 'đã xong'}
                onClick={sum.pending > 0 ? () => goList('pending', 'month') : undefined} />
              <KpiTile label="Quên Ra ca" value={String(sum.stale)} tone={sum.stale > 0 ? 'bad' : 'ok'} note={sum.stale > 0 ? 'bấm để xem' : 'không có'}
                onClick={sum.stale > 0 ? () => goList('open', 'month') : undefined} />
              {isAdmin && <KpiTile label="Ảnh cờ đỏ hôm nay" value={String(sum.flagged)} tone={sum.flagged > 0 ? 'bad' : 'ok'} note={sum.flagged > 0 ? 'bấm để xem' : 'không có'}
                onClick={sum.flagged > 0 ? () => setTab('photos') : undefined} />}
              <KpiTile label="Giờ công tháng này" value={hours(sum.month_minutes)} tone="neutral" note="đã xác nhận" />
            </div>
          )}

          {(orphans.length > 0 || (sum && sum.stale > 0)) && (
            <div className="card alert-warn">
              <h2>Cần xử lý</h2>
              {sum && sum.stale > 0 && <p><span className="pill err">Quên Ra ca</span> {sum.stale} ca đã mở từ hôm trước chưa Ra ca. <button className="link" onClick={() => goList('open', 'month')}>Xem danh sách</button> rồi dùng “Đề nghị sửa giờ” hoặc nhờ họ Ra ca.</p>}
              {orphans.map((o) => <p key={o.worker_id}><span className="pill warn">Chưa có tổ trưởng</span> {o.full_name}{o.team_name ? ` (${o.team_name})` : ' chưa thuộc tổ nào'}: công của họ do tổ trưởng chấm nhưng chưa có ai. Chọn tổ trưởng ở Khai báo → Phòng / Tổ.</p>)}
            </div>
          )}

          {me || recalled ? (
            <Collapsible title="Chấm công của tôi" summary={myState} defaultOpen={!isAdmin}>
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
                    onClick={() => void run(() => clockOutLocal(localShift, Math.max(0, parseInt(brk || '0', 10) || 0), cycleId || null))}>Ra ca</button>
                  <p className="muted">Ca sẽ được gửi lên khi có mạng, rồi chờ tổ trưởng hoặc quản lý xác nhận.</p>
                </>
              ) : openShift ? (
                <>
                  <p>Bạn vào ca lúc <strong>{hhmm(openShift.started_at)}</strong> ngày {fmtDate(openShift.work_date)}{openShift.start_lat != null ? ' · đã ghi vị trí' : ''}.</p>
                  <label>Nghỉ giữa ca (phút)<input value={brk} inputMode="numeric" onChange={(e) => setBrk(e.target.value)} /></label>
                  <button className="primary" disabled={busy || !online}
                    onClick={() => void run(() => clockOut(openShift.id, Math.max(0, parseInt(brk || '0', 10) || 0), cycleId || null))}>Ra ca</button>
                </>
              ) : (
                <button className="primary" disabled={busy} onClick={() => void startShift()}>Vào ca</button>
              )}
              <p className="muted">Vị trí chỉ được ghi lúc bạn bấm Vào ca/Ra ca (nếu bạn cho phép), không theo dõi liên tục. Công được xác nhận trước khi tính tiền.</p>
            </Collapsible>
          ) : (
            <p className="muted">Bạn chưa có hồ sơ lao động ở cơ sở này nên không tự chấm công được{canRecordFor.length > 0 ? ', nhưng có thể chấm công hộ người trong tổ' : ''}.</p>
          )}

          {canRecordFor.length > 0 && (
            <Collapsible inline title="＋ Chấm công hộ" summary="nhập ca đã làm của người khác">
              <ShiftForm workers={canRecordFor} cycles={cycles} busy={busy || !online} onSave={(w, s, e, b, n, c) => run(() => recordShift(w, s, e, b, n, c))} />
            </Collapsible>
          )}

          {sum && sum.top.length > 0 && (
            <ChartCard title="Giờ công tháng này theo người" subtitle="Chỉ tính công đã xác nhận · 8 người nhiều nhất" footer="Xem theo phòng/tổ: Báo cáo → Theo nhu cầu → Giờ công và tiền công → Theo phòng / tổ."
              table={{ columns: ['Người', 'Giờ công'], rows: sum.top.map((p) => [p.name, `${(Math.round(p.minutes / 6) / 10).toLocaleString('vi-VN')} giờ`]) }}>
              <HBarList items={sum.top.map((p) => ({ label: p.name, value: Math.round(p.minutes / 6) / 10 }))} tone="info"
                format={(n) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`} ariaLabel="Giờ công theo người" />
            </ChartCard>
          )}
        </>
      )}

      {tab === 'list' && (
        <AttendanceList orgId={active.id} isAdmin={isAdmin} meId={me?.id ?? null} workers={workers} online={online} preset={preset} onChanged={() => void load()} />
      )}

      {tab === 'photos' && isAdmin && <AttendancePhotos orgId={active.id} />}

      {tab === 'setup' && isAdmin && <KioskAdmin workers={workers} onChanged={() => void load()} />}
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

function ShiftForm({ workers, cycles, busy, onSave }: { workers: WorkerLite[]; cycles: CycleOpt[]; busy: boolean; onSave: (w: string, s: Date, e: Date, b: number, note: string, c: string | null) => Promise<unknown> }) {
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
