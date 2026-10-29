import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Collapsible } from './Collapsible';
import { AttendanceList, type ListPreset } from './AttendanceList';
import { AttendancePhotos } from './AttendancePhotos';
import { ChartCard, HBarList } from './charts';
import { KpiTile } from './HomeStats';
import { getAttendanceSummary, type AttSummary } from '../lib/attendanceAdmin';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import {
  ensureMyWorker, listOrphans, listWorkers, recordShift,
  type WorkerLite,
} from '../lib/work';
import { useTable } from '../lib/tables';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

type Tab = 'today' | 'list' | 'photos';

/**
 * Chấm công (D42, D115). Bốn mục, mỗi mục một việc:
 *  - Hôm nay: số liệu trong ngày, việc cần xử lý, chấm công cho người làm (cho hộ nhỏ không dùng máy chấm công).
 *  - Công: danh sách phân trang, lọc, xác nhận (cả hàng loạt).
 *  - Ảnh cần xem: ảnh cờ đỏ từ máy chấm công (chỉ chủ/quản lý).
 * (Máy chấm công và mã PIN nằm ở Khai báo → Máy chấm công.)
 * Không còn Vào/Ra ca bằng tài khoản đăng nhập (D117): công đến từ máy chấm công hoặc do chủ/quản lý (tổ trưởng với người trong tổ) nhập.
 * Số liệu và danh sách do máy chủ tính (không tải cả danh sách công về máy). Cần mạng.
 */
export function AttendanceSection(_props: { onOpenCycle?: (id: string, opts?: { calendar?: boolean; notice?: string }) => void; onLogFor?: (cycleId: string | null) => void }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const [tab, setTab] = useState<Tab>('today');
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [sum, setSum] = useState<AttSummary | null>(null);
  const [orphans, setOrphans] = useState<{ worker_id: string; full_name: string; team_name: string | null }[]>([]);
  const [preset, setPreset] = useState<ListPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cycles = useTable('cycles').filter((c) => c.status === 'active' && c.owner_org_id === active?.id);

  const orgId = active?.id;
  const isAdmin = hasRole(active?.roles, 'manager');
  const me = workers.find((w) => w.user_id === uid) ?? null;
  // Chủ/quản lý chấm công cho mọi người làm, kể cả chính mình; tổ trưởng chỉ cho người trong tổ (máy chủ lọc), không cho mình
  const canRecordFor = isAdmin ? workers.filter((w) => w.status === 'active') : workers.filter((w) => w.id !== me?.id && w.status === 'active');

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      let w = await listWorkers(orgId);
      // chủ/quản lý chưa có hồ sơ lao động: tự tạo để chấm công cho chính mình ở mục “Chấm công cho người làm”
      if (uid && !w.some((x) => x.user_id === uid) && hasRole(active?.roles, 'manager')) {
        await ensureMyWorker(orgId).catch(() => undefined);
        w = await listWorkers(orgId);
      }
      setWorkers(w);
      setSum(await getAttendanceSummary(orgId, todayLocal()).catch(() => null));
      if (isAdmin) void listOrphans(orgId).then(setOrphans).catch(() => setOrphans([]));
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, uid, active?.roles, isAdmin]);
  useEffect(() => { void load(); }, [load]);

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
    ] : []),
  ];
  const hours = (m: number) => `${(m / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;

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

          {canRecordFor.length === 0 && (
            <p className="muted">Chấm công do máy chấm công ghi, hoặc do chủ, quản lý, tổ trưởng nhập cho người làm. Bạn xem công của mình ở mục “Công”.</p>
          )}

          {canRecordFor.length > 0 && (
            <Collapsible inline title="＋ Chấm công cho người làm" summary={isAdmin ? 'nhập ca đã làm, kể cả của bạn (dành cho hộ không dùng máy chấm công)' : 'nhập ca đã làm của người trong tổ'}>
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
