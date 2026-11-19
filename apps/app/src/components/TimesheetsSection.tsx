import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import { loadTeams } from '../lib/teams';
import {
  MODE_LABEL, createSheet, dayCount, fetchSheets, groupByTeam, hhmm, loadPrefs, markSheetEntered, savePrefs, defaultFrom,
  type Sheet, type SheetData, type SheetMode, type SheetPrefs, type SheetWorker,
} from '../lib/timesheets';
import type { WorkerLite } from '../lib/work';
import { PrintSheet } from './PrintSheet';
import { TimesheetEntry } from './TimesheetEntry';

type View = { kind: 'list' } | { kind: 'form' } | { kind: 'entry'; sheet: Sheet } | { kind: 'preview'; id: string; data: SheetData } | { kind: 'saved'; sheet: Sheet };

/**
 * Chấm công → Bảng giấy (D199, lớp C): in bảng chấm công có sẵn tên người và các ngày từ-đến kèm ghi chú cách ghi; mỗi bảng in ra được LƯU
 * (mã bảng, kỳ, người, ca mặc định, kiểu ghi) để nhập số liệu theo đúng bảng ở bước sau. Chủ/quản lý cho mọi người, tổ trưởng cho người trong tổ.
 */
export function TimesheetsSection({ orgId, orgName, workers, online }: { orgId: string; orgName: string; workers: WorkerLite[]; online: boolean }) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<SheetPrefs>(() => loadPrefs(orgId));
  useEffect(() => setPrefs(loadPrefs(orgId)), [orgId]);
  const updatePrefs = (p: SheetPrefs) => { setPrefs(p); savePrefs(orgId, p); };

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setSheets(await fetchSheets(orgId)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function saveAndPrint(id: string, data: SheetData) {
    setBusy(true); setError(null);
    try {
      const sheet = await createSheet(orgId, id, data);
      setView({ kind: 'saved', sheet });
      void load();
      window.setTimeout(() => window.print(), 400);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function toggleEntered(s: Sheet) {
    setBusy(true); setError(null);
    try { await markSheetEntered(s.id, s.version, s.status !== 'entered'); await load(); } catch (e) {
      if (/CONFLICT/.test(String((e as Error).message))) { await load(); setError('Bảng vừa được người khác sửa. Đã tải lại bản mới.'); } else setError(friendlyError(e));
    } finally { setBusy(false); }
  }

  if (view.kind === 'preview' || view.kind === 'saved') {
    const saved = view.kind === 'saved';
    const data: SheetData = saved ? view.sheet : view.data;
    return (
      <PrintSheet orgName={orgName} data={data} code={saved ? view.sheet.code : null} prefs={prefs} onPrefs={updatePrefs}
        toolbar={(
          <>
            {error && <span className="msg error" role="alert">{error}</span>}
            {!saved && <button type="button" className="secondary" disabled={busy} onClick={() => { setError(null); setView({ kind: 'form' }); }}>‹ Sửa lại</button>}
            {!saved && <button type="button" className="primary" disabled={busy || !online} onClick={() => void saveAndPrint(view.id, view.data)}>{busy ? 'Đang lưu…' : '🖨 Lưu và in bảng'}</button>}
            {saved && <button type="button" className="primary" onClick={() => window.print()}>🖨 In</button>}
            {saved && <button type="button" className="secondary" onClick={() => setView({ kind: 'list' })}>Xong</button>}
          </>
        )} />
    );
  }

  if (view.kind === 'entry') {
    return <TimesheetEntry sheet={view.sheet} orgName={orgName} onBack={() => { setView({ kind: 'list' }); void load(); }} onChanged={() => void load()} />;
  }

  if (view.kind === 'form') {
    return <SheetForm orgId={orgId} workers={workers} prefs={prefs} onPrefs={updatePrefs} onCancel={() => setView({ kind: 'list' })}
      onPreview={(data) => setView({ kind: 'preview', id: crypto.randomUUID(), data })} />;
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: tạo bảng cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <p className="muted">In bảng chấm công có sẵn tên người và các ngày để ghi tay trên giấy; cuối kỳ bấm Nhập số liệu để gõ lại đúng bảng đó vào hệ thống.</p>
      <button type="button" className="primary" disabled={!online || workers.length === 0} onClick={() => { setError(null); setView({ kind: 'form' }); }}>＋ Tạo bảng mới</button>
      {workers.length === 0 && <p className="muted">Chưa có người làm nào để lập bảng.</p>}

      <h2 className="sect">Bảng đã in{sheets && sheets.length > 0 ? ` (${sheets.length})` : ''}</h2>
      {sheets === null ? <p className="muted">{online ? 'Đang tải…' : 'Cần mạng để xem.'}</p>
        : sheets.length === 0 ? <p className="muted">Chưa có bảng nào.</p>
        : sheets.map((s) => (
          <div key={s.id} className="card slim">
            <p><strong>{s.code}</strong> <span className={s.status === 'entered' ? 'pill ok' : 'pill warn'}>{s.status === 'entered' ? 'Đã nhập xong' : 'Chưa nhập'}</span></p>
            <p>{fmtDate(s.from_date)} – {fmtDate(s.to_date)} · {dayCount(s.from_date, s.to_date)} ngày · {s.workers.length} người</p>
            <p className="muted">{MODE_LABEL[s.mode]} · ca {hhmm(s.shift_start)}–{hhmm(s.shift_end)}, nghỉ {s.break_minutes} phút</p>
            <div className="btnrow">
              <button type="button" className={s.status === 'entered' ? 'secondary' : 'primary'} disabled={busy || !online} onClick={() => setView({ kind: 'entry', sheet: s })}>Nhập số liệu</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setView({ kind: 'saved', sheet: s })}>In lại</button>
              <button type="button" className="secondary" disabled={busy || !online} onClick={() => void toggleEntered(s)}>{s.status === 'entered' ? 'Bỏ đánh dấu nhập xong' : 'Đánh dấu đã nhập xong'}</button>
            </div>
          </div>
        ))}
    </>
  );
}

/** Màn tạo bảng: khoảng ngày từ-đến, người (theo tổ), kiểu ghi, ca mặc định, rồi Xem trước */
function SheetForm({ orgId, workers, prefs, onPrefs, onCancel, onPreview }: {
  orgId: string; workers: WorkerLite[]; prefs: SheetPrefs; onPrefs: (p: SheetPrefs) => void; onCancel: () => void; onPreview: (d: SheetData) => void;
}) {
  const today = todayLocal();
  const [from, setFrom] = useState(defaultFrom(today));
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<SheetMode>(prefs.mode);
  const [start, setStart] = useState(prefs.start);
  const [end, setEnd] = useState(prefs.end);
  const [brk, setBrk] = useState(String(prefs.brk));
  const [note, setNote] = useState('');
  const [teamOf, setTeamOf] = useState<Map<string, string>>(new Map());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(workers.map((w) => w.id)));
  const [error, setError] = useState<string | null>(null);

  // tên tổ của từng người (để nhóm khi chọn và khi in); không tải được thì coi như chưa vào tổ
  useEffect(() => {
    if (!navigator.onLine) return;
    void loadTeams(orgId).then((t) => {
      const name = new Map(t.teams.map((x) => [x.id, x.name]));
      const m = new Map<string, string>();
      for (const l of t.members) { const n = name.get(l.team_id); if (n && !m.has(l.worker_id)) m.set(l.worker_id, n); }
      setTeamOf(m);
    }).catch(() => undefined);
  }, [orgId]);

  const list: SheetWorker[] = useMemo(() => workers.map((w) => ({ worker_id: w.id, name: w.full_name, team: teamOf.get(w.id) ?? null })), [workers, teamOf]);
  const groups = useMemo(() => groupByTeam(list), [list]);
  const days = from && to && to >= from ? dayCount(from, to) : 0;

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (ids: string[], on: boolean) => setPicked((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });

  function next() {
    if (!from || !to) return setError('Hãy chọn ngày bắt đầu và ngày kết thúc.');
    if (to < from) return setError('Ngày kết thúc không được trước ngày bắt đầu.');
    if (days > 31) return setError('Một bảng tối đa 31 ngày. Hãy chia thành nhiều bảng.');
    const chosen = groups.flatMap((g) => g.items).filter((w) => picked.has(w.worker_id));
    if (chosen.length === 0) return setError('Hãy chọn ít nhất một người.');
    if (chosen.length > 200) return setError('Một bảng tối đa 200 người. Hãy chia theo tổ.');
    if (!start || !end || end <= start) return setError('Giờ ra của ca mặc định phải sau giờ vào.');
    const b = Number(brk);
    if (!Number.isInteger(b) || b < 0 || b > 480) return setError('Nghỉ giữa ca từ 0 đến 480 phút.');
    setError(null);
    onPrefs({ ...prefs, start, end, brk: b, mode });
    onPreview({ from_date: from, to_date: to, mode, shift_start: start, shift_end: end, break_minutes: b, workers: chosen, note: note.trim() || null });
  }

  return (
    <div className="card inline-form">
      <p><strong>Tạo bảng chấm công</strong></p>
      <div className="pair">
        <label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến ngày<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="muted">{days > 0 ? `${days} ngày${days > 31 ? ' (quá 31 ngày, hãy chia nhỏ)' : ''}` : 'Chọn ngày bắt đầu và kết thúc.'}</p>

      <fieldset className="roles">
        <legend>Người trong bảng ({picked.size}/{workers.length})</legend>
        {groups.map((g) => {
          const ids = g.items.map((w) => w.worker_id);
          const all = ids.every((id) => picked.has(id));
          return (
            <div key={g.team ?? 'none'}>
              <label className="check"><input type="checkbox" checked={all} onChange={(e) => toggleGroup(ids, e.target.checked)} /> <strong>{g.team ? `Tổ ${g.team}` : 'Chưa vào tổ'}</strong> ({ids.length})</label>
              {g.items.map((w) => (
                <label key={w.worker_id} className="check sub"><input type="checkbox" checked={picked.has(w.worker_id)} onChange={() => toggle(w.worker_id)} /> {w.name}</label>
              ))}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="roles">
        <legend>Kiểu ghi trên giấy</legend>
        {(Object.keys(MODE_LABEL) as SheetMode[]).map((m) => (
          <label key={m} className="check"><input type="radio" name="sheet-mode" checked={mode === m} onChange={() => setMode(m)} /> {MODE_LABEL[m]}</label>
        ))}
      </fieldset>

      <div className="pair">
        <label>Ca mặc định: giờ vào<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Giờ ra<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label>Nghỉ giữa ca (phút)<input inputMode="numeric" value={brk} onChange={(e) => setBrk(e.target.value)} /></label>
      <label>Ghi chú in trên đầu bảng (không bắt buộc)<input value={note} maxLength={300} placeholder="Ví dụ: Đợt thu hoạch tuần 2" onChange={(e) => setNote(e.target.value)} /></label>

      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="button" className="primary" onClick={next}>Xem trước bảng</button>
        <button type="button" className="secondary" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
