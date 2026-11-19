import { CycleSelect } from './CycleSelect';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AttendanceList, type ListPreset } from './AttendanceList';
import { AbsencesSection } from './AbsencesSection';
import { TimesheetsSection } from './TimesheetsSection';
import { AttendancePhotos } from './AttendancePhotos';
import { absenceBadge, fetchAbsences, type Absence } from '../lib/absences';
import { getAttendanceSummary, type AttSummary } from '../lib/attendanceAdmin';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole, isOwner } from '../lib/roles';
import {
  ensureMyWorker, listOrphans, listWorkers, recordShift,
  type WorkerLite,
} from '../lib/work';
import { useTable } from '../lib/tables';
import { useCycleTitle } from '../lib/useCycleTitle';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

type Tab = 'list' | 'sheets' | 'absences' | 'photos';

/**
 * Chấm công (D42, D115). Bốn mục, mỗi mục một việc:
 *  - Bảng công (mở đầu): hai nút Chấm công hộ / Ghi nghỉ, dòng "Hôm nay", khung Cần xử lý, bộ lọc (mặc định Chờ xác nhận, 30 ngày), bảng công, nút xác nhận các công hợp lệ dưới bảng, đề nghị sửa công.
 *  - Bảng giấy: in bảng chấm công từ ngày đến ngày (có sẵn tên người, ghi chú cách ghi), danh sách bảng đã in.
 *  - Nghỉ phép: ghi nghỉ hộ, danh sách theo tháng, tổng hợp năm.
 *  - Ảnh cờ đỏ: ảnh cờ đỏ từ máy chấm công (chỉ chủ/quản lý).
 * (Máy chấm công và mã PIN nằm ở Khai báo → Máy chấm công.)
 * Không còn Vào/Ra ca bằng tài khoản đăng nhập (D117): công đến từ máy chấm công hoặc do chủ/quản lý (tổ trưởng với người trong tổ) nhập.
 * Số liệu và danh sách do máy chủ tính (không tải cả danh sách công về máy). Cần mạng.
 */
export function AttendanceSection(_props: { onOpenCycle?: (id: string, opts?: { calendar?: boolean; notice?: string }) => void; onLogFor?: (cycleId: string | null) => void }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const uid = session?.user.id;
  const [tab, setTab] = useState<Tab>('list');
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [sum, setSum] = useState<AttSummary | null>(null);
  const [orphans, setOrphans] = useState<{ worker_id: string; full_name: string; team_name: string | null }[]>([]);
  const [preset, setPreset] = useState<ListPreset | null>(null);
  const [absToday, setAbsToday] = useState<Absence[]>([]);
  const [panel, setPanel] = useState<'shift' | null>(null);   // biểu mẫu chấm công hộ đang mở ở tab Hôm nay
  const [showAbs, setShowAbs] = useState(false);
  const [focus, setFocus] = useState(false);                   // đang xem danh sách tập trung (bấm Xem ở Cần xử lý): ẩn khung Cần xử lý
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
      void fetchAbsences(orgId, todayLocal(), todayLocal()).then(setAbsToday).catch(() => setAbsToday([]));
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
    { id: 'list', label: 'Bảng công' },
    ...(isAdmin || canRecordFor.length > 0 ? [{ id: 'sheets' as Tab, label: 'Bảng giấy' }, { id: 'absences' as Tab, label: 'Nghỉ phép' }] : []),
    ...(isAdmin ? [
      { id: 'photos' as Tab, label: `Ảnh cờ đỏ${sum && sum.flagged > 0 ? ` (${sum.flagged})` : ''}` },
    ] : []),
  ];

  const todo: { key: string; tone: 'warn' | 'err'; tag: string; text: string; go?: () => void }[] = [];
  if (sum) {
    if (sum.pending > 0) todo.push({ key: 'pending', tone: 'warn', tag: 'Chờ xác nhận', text: `${sum.pending} công chờ xác nhận`, go: () => goList('pending', 'all') });
    if (sum.stale > 0) todo.push({ key: 'stale', tone: 'err', tag: 'Quên ra ca', text: `${sum.stale} ca đã mở từ hôm trước chưa ra ca`, go: () => goList('open', 'stale') });
    if (isAdmin && sum.flagged > 0) todo.push({ key: 'flagged', tone: 'err', tag: 'Ảnh cờ đỏ', text: `${sum.flagged} ảnh cờ đỏ hôm nay`, go: () => setTab('photos') });
    for (const o of orphans) todo.push({ key: o.worker_id, tone: 'warn', tag: 'Chưa có tổ trưởng', text: `${o.full_name}${o.team_name ? ` (${o.team_name})` : ' chưa thuộc tổ nào'}: chọn tổ trưởng ở Khai báo → Phòng / Tổ` });
  }
  const todoNode = !sum ? null : todo.length === 0 ? (
    <p className="msg ok" role="status">Không có việc cần xử lý.</p>
  ) : (
    <div className="card alert-warn">
      <h2>Cần xử lý ({todo.length})</h2>
      {todo.map((t) => (
        <p key={t.key}><span className={`pill ${t.tone}`}>{t.tag}</span> {t.text}{t.go && <> <button type="button" className="link" onClick={t.go}>Xem</button></>}</p>
      ))}
    </div>
  );

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

      {tab === 'list' && (
        <>
          {canRecordFor.length === 0 && (
            <p className="muted">Chấm công do máy chấm công ghi, hoặc do chủ, quản lý, tổ trưởng nhập cho người làm. Bạn xem công của mình ở bảng dưới.</p>
          )}

          {sum && (
            <p className="att-summary">
              Hôm nay: <strong>{sum.in_shift}</strong> đang trong ca · <strong>{sum.done}</strong> đã ra ca ({sum.present}/{sum.workers} người có mặt)
              {absToday.length > 0 && <> · <button type="button" className="link" onClick={() => setShowAbs((v) => !v)}>{absToday.length} nghỉ</button></>}
            </p>
          )}
          {showAbs && absToday.length > 0 && (
            <div className="card slim">
              {absToday.slice(0, 12).map((x) => <p key={x.id} className="muted">{workers.find((w) => w.id === x.worker_id)?.full_name ?? 'Người làm'}: {absenceBadge(x)}{x.reason ? ` · ${x.reason}` : ''}</p>)}
              <button type="button" className="link" onClick={() => setTab('absences')}>Mở danh sách nghỉ phép</button>
            </div>
          )}

          {!focus && todoNode}

          <AttendanceList orgId={active.id} isAdmin={isAdmin} isOwner={isOwner(active.roles)} meId={me?.id ?? null} workers={workers} online={online} preset={preset} rangeAction={canRecordFor.length > 0 ? (
              <button type="button" className="chip add" disabled={!online} aria-expanded={panel === 'shift'} onClick={() => setPanel(panel === 'shift' ? null : 'shift')}>＋ Ghi công</button>
            ) : null}
            panel={panel === 'shift' && canRecordFor.length > 0 ? (
              <div className="card">
                <h2>Ghi công</h2>
                <p className="muted">{isAdmin ? 'Nhập ca đã làm của người làm, kể cả của bạn (dành cho nơi không dùng máy chấm công).' : 'Nhập ca đã làm của người trong tổ.'}</p>
                <ShiftForm workers={canRecordFor} cycles={cycles} busy={busy || !online} onCancel={() => setPanel(null)} onSave={(w, s, e, b, n, c) => run(() => recordShift(w, s, e, b, n, c))} />
              </div>
            ) : null}
            onFocusChange={setFocus} onChanged={() => void load()} />
        </>
      )}

      {tab === 'sheets' && <TimesheetsSection orgId={active.id} orgName={active.name} workers={canRecordFor} online={online} />}

      {tab === 'absences' && <AbsencesSection orgId={active.id} workers={canRecordFor} canWrite={canRecordFor.length > 0} isOwner={isOwner(active.roles)} online={online} />}

      {tab === 'photos' && isAdmin && <AttendancePhotos orgId={active.id} />}

    </>
  );
}

type CycleOpt = { id: string; status?: string; name?: string | null; crop_type_id?: string | null; start_date?: string | null };
const ShiftCycleSelect = ({ cycles, value, onChange }: { cycles: CycleOpt[]; value: string; onChange: (v: string) => void }) => {
  const titleOf = useCycleTitle();
  return cycles.length === 0 ? null : (
  <CycleSelect label="Vụ (không bắt buộc)" cycles={cycles.map((c) => ({ id: c.id, status: c.status ?? '' }))} value={value} onChange={onChange} emptyLabel="— Không gắn vụ —"
    labelOf={(id) => { const c = cycles.find((x) => x.id === id); return c ? titleOf(c) : ''; }} />
  );
};

function ShiftForm({ workers, cycles, busy, onSave, onCancel }: { workers: WorkerLite[]; cycles: CycleOpt[]; busy: boolean; onCancel: () => void; onSave: (w: string, s: Date, e: Date, b: number, note: string, c: string | null) => Promise<unknown> }) {
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
      <ShiftCycleSelect cycles={cycles} value={cyc} onChange={setCyc} />
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      <div className="btnrow">
        <button type="submit" className="primary" disabled={busy}>Lưu công</button>
        <button type="button" className="secondary" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}
