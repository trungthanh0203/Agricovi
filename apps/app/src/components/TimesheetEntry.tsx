import { numberToInput } from '../lib/format';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import {
  DOW, fetchExisting, hhmm, listDays, markSheetEntered, recordTimesheet,
  type CellOut, type Existing, type ExistingAbsence, type ExistingWork, type SaveResult, type Sheet, type SheetDay, type SheetWorker,
} from '../lib/timesheets';
import { OFF_LABEL, cellLabel, parseCell, personTotals, totalText, type Parsed } from '../lib/timesheetCells';
import { MAX_PHOTOS, SCAN_MAX_ROWS, getScanUsage, prepareImage, scanTimesheet, type ScanUsage } from '../lib/timesheetScan';
import { mapScan, type MapOut } from '../lib/timesheetScanMap';
import { Collapsible } from './Collapsible';
import { t as tx } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const STATUS_TEXT: Record<string, string> = { get confirmed() { return tx`đã xác nhận`; }, get needs_confirmation() { return tx`chờ xác nhận`; }, get open() { return tx`đang trong ca`; } };
const KIND_LETTER: Record<string, string> = { annual: 'P', sick: 'Ô', family: 'V', unpaid: 'K', no_notice: 'K', other: 'K' };
const hoursText = (min: number) => numberToInput(Math.round(min / 6) / 10);
const key = (w: string, d: string) => `${w}|${d}`;

/**
 * Nhập số liệu theo bảng giấy đã in (D200, lớp A): lưới giống hệt tờ giấy (cùng người, cùng ngày, cùng ca và kiểu ghi, đọc từ bảng đã lưu).
 * Mỗi ô là ô gõ chữ như viết trên giấy; ô đã có dữ liệu trong hệ thống khóa lại; máy chủ tự suy ra giờ và báo ô nào không ghi được.
 * Nhập dở rồi Lưu nhiều lần được. Cần mạng.
 */
export function TimesheetEntry({ sheet, orgName, onBack, onChanged }: { sheet: Sheet; orgName: string; onBack: () => void; onChanged: (s: Sheet) => void }) {
  const online = useOnline();
  const days = useMemo(() => listDays(sheet.from_date, sheet.to_date), [sheet.from_date, sheet.to_date]);
  const fullNet = useMemo(() => {
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return Math.max(0, mins(sheet.shift_end) - mins(sheet.shift_start) - sheet.break_minutes);
  }, [sheet]);
  const [text, setText] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<Existing | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});     // ô không ghi được lần lưu trước: lý do
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const [cur, setCur] = useState(sheet);
  const [warn, setWarn] = useState<Set<string>>(new Set());            // ô AI không chắc (tô vàng) cho tới khi người dùng sửa
  const [scanBusy, setScanBusy] = useState(false);
  const [scanOut, setScanOut] = useState<{ map: MapOut; filled: number; kept: number; notes: string[] } | null>(null);
  const [usage, setUsage] = useState<ScanUsage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setExisting(await fetchExisting(sheet.id)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [sheet.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void getScanUsage(sheet.organization_id).then(setUsage).catch(() => undefined); }, [sheet.organization_id]);

  const work = useMemo(() => new Map((existing?.work ?? []).map((x) => [key(x.w, x.d), x])), [existing]);
  const absent = useMemo(() => new Map((existing?.absences ?? []).map((x) => [key(x.w, x.d), x])), [existing]);
  const locked = (w: string, d: string) => work.has(key(w, d)) || absent.has(key(w, d));
  const parsed = (w: string, d: string): Parsed => parseCell(text[key(w, d)] ?? '', sheet.mode);

  // ô đang gõ chưa lưu (bỏ ô khóa): filled = ô có ký hiệu hợp lệ sẽ được lưu; invalid = ô sai ký hiệu
  const typed = Object.entries(text).filter(([k, v]) => v.trim() !== '' && !locked(k.split('|')[0]!, k.split('|')[1]!)).map(([k, v]) => parseCell(v, sheet.mode));
  const filled = typed.filter((p) => p.kind !== 'error' && p.kind !== 'none' && p.kind !== 'empty').length;
  const invalid = typed.filter((p) => p.kind === 'error').length;

  function setCell(w: string, d: string, v: string) {
    setText((t) => ({ ...t, [key(w, d)]: v }));
    if (warn.has(key(w, d))) setWarn((s) => { const n = new Set(s); n.delete(key(w, d)); return n; });
    if (problems[key(w, d)]) setProblems((p) => { const n = { ...p }; delete n[key(w, d)]; return n; });
    setMsg(null);
  }
  function normalize(w: string, d: string) {
    const p = parseCell(text[key(w, d)] ?? '', sheet.mode);
    if (p.kind !== 'error') setText((t) => ({ ...t, [key(w, d)]: cellLabel(p) }));
  }
  function fillRow(w: string) {
    setText((t) => {
      const n = { ...t };
      for (const d of days) if (d.dow !== 0 && !locked(w, d.date) && (n[key(w, d.date)] ?? '').trim() === '') n[key(w, d.date)] = '✓';
      return n;
    });
    setMsg(null);
  }
  function clearRow(w: string) {
    setText((t) => { const n = { ...t }; for (const d of days) if (!locked(w, d.date)) delete n[key(w, d.date)]; return n; });
  }
  function move(w: string, d: string, step: 1 | -1) {
    const i = sheet.workers.findIndex((x) => x.worker_id === w);
    for (let j = i + step; j >= 0 && j < sheet.workers.length; j += step) {
      const el = refs.current.get(key(sheet.workers[j]!.worker_id, d));
      if (el) { el.focus(); el.select(); return; }
    }
  }

  /** Đọc ảnh bảng giấy: điền vào các ô còn TRỐNG và chưa khóa; không đụng ô đã gõ hay đã có; ô AI không chắc tô vàng. Không bao giờ tự lưu. */
  async function onPhotos(files: FileList | null) {
    const list = files ? Array.from(files).slice(0, MAX_PHOTOS) : [];
    if (fileRef.current) fileRef.current.value = '';
    if (list.length === 0) return;
    setError(null); setMsg(null); setScanOut(null); setScanBusy(true);
    try {
      const images = await Promise.all(list.map((f) => prepareImage(f)));
      const { result, usage: u } = await scanTimesheet(sheet, images);
      setUsage(u);
      const map = mapScan(result, sheet.workers, days.map((d) => d.date), sheet.code);
      if (map.codeMismatch && !window.confirm(tx`Ảnh có mã bảng ${map.codeMismatch}, khác bảng đang nhập (${sheet.code}). Vẫn điền số liệu từ ảnh này?`)) return;
      let filledN = 0, keptN = 0;
      const nextWarn = new Set(warn);
      const next = { ...text };
      for (const [k, raw] of Object.entries(map.fill)) {
        const [w, d] = k.split('|') as [string, string];
        if (locked(w, d) || (next[k] ?? '').trim() !== '') { keptN += 1; continue; }
        const p = parseCell(raw, sheet.mode);
        next[k] = p.kind === 'error' ? raw : cellLabel(p);
        filledN += 1;
        if (map.uncertain.includes(k)) nextWarn.add(k);
      }
      setText(next); setWarn(nextWarn);
      setScanOut({ map, filled: filledN, kept: keptN, notes: result.canh_bao });
      setMsg(tx`Đã điền ${filledN} ô từ ảnh. Hãy xem lại toàn bộ rồi bấm Lưu: ảnh chưa được lưu gì.`);
    } catch (e) { setError(friendlyError(e)); } finally { setScanBusy(false); }
  }

  async function save() {
    setError(null); setMsg(null); setResult(null);
    if (invalid > 0) return setError(tx`Còn ${invalid} ô sai ký hiệu (tô đỏ). Hãy sửa rồi lưu.`);
    const cells: CellOut[] = [];
    for (const w of sheet.workers) for (const d of days) {
      if (locked(w.worker_id, d.date)) continue;
      const p = parsed(w.worker_id, d.date);
      if (p.kind === 'empty' || p.kind === 'none' || p.kind === 'error') continue;
      cells.push({ w: w.worker_id, d: d.date, k: p.kind, ...(p.kind === 'hours' ? { h: p.hours } : {}) });
    }
    if (cells.length === 0) return setError(tx`Chưa có ô nào để lưu. Gõ ký hiệu vào các ô rồi bấm Lưu.`);
    setBusy(true);
    try {
      const r = await recordTimesheet(sheet.id, cells);
      setResult(r);
      const bad = Object.fromEntries(r.skipped.map((s) => [key(s.w, s.d), s.reason]));
      setProblems(bad);
      // ô đã lưu hoặc đã có từ trước thì bỏ chữ đã gõ (sẽ hiện thành ô khóa); ô bị bỏ qua giữ lại để sửa
      setText((t) => { const n = { ...t }; for (const c of cells) { const k = key(c.w, c.d); if (!bad[k]) delete n[k]; } return n; });
      setWarn((s) => { const n = new Set(s); for (const c of cells) n.delete(key(c.w, c.d)); return n; });
      setMsg(tx`Đã lưu ${r.saved} ô${r.unchanged ? tx`, ${r.unchanged} ô đã có từ trước` : ''}${r.skipped.length ? tx`. ${r.skipped.length} ô chưa lưu được (xem bên dưới)` : ''}.`);
      await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function toggleEntered() {
    setBusy(true); setError(null);
    try { const s = await markSheetEntered(cur.id, cur.version, cur.status !== 'entered'); setCur(s); onChanged(s); setMsg(s.status === 'entered' ? tx`Đã đánh dấu bảng nhập xong.` : tx`Đã bỏ đánh dấu nhập xong.`); }
    catch (e) { setError(/CONFLICT/.test(String((e as Error).message)) ? tx`Bảng vừa được người khác sửa. Hãy mở lại bảng.` : friendlyError(e)); }
    finally { setBusy(false); }
  }
  function back() {
    if (filled > 0 && !window.confirm(tx`Còn ${filled} ô gõ chưa lưu. Thoát thì các ô này sẽ mất. Thoát không?`)) return;
    onBack();
  }

  const nameOf = new Map(sheet.workers.map((w) => [w.worker_id, w.name]));
  const hours = sheet.mode === 'hours';

  // Bảng 200 người × 31 ngày có hơn 6000 ô: mỗi hàng là một thành phần ghi nhớ (memo), chỉ hàng nào đổi mới vẽ lại khi gõ một ô.
  // Hàm xử lý giữ cố định (đọc bản mới nhất qua `act`) để so sánh hàng không bị coi là đổi.
  const act = useRef({ setCell, normalize, fillRow, clearRow, move });
  act.current = { setCell, normalize, fillRow, clearRow, move };
  const onCell = useCallback((w: string, d: string, v: string) => act.current.setCell(w, d, v), []);
  const onBlurCell = useCallback((w: string, d: string) => act.current.normalize(w, d), []);
  const onFill = useCallback((w: string) => act.current.fillRow(w), []);
  const onClear = useCallback((w: string) => act.current.clearRow(w), []);
  const onMove = useCallback((w: string, d: string, step: 1 | -1) => act.current.move(w, d, step), []);
  const register = useCallback((k: string, el: HTMLInputElement | null) => { if (el) refs.current.set(k, el); else refs.current.delete(k); }, []);
  const lockBy = useMemo(() => {
    const m = new Map<string, Map<string, LockCell>>();
    const cell = (w: string, d: string) => { let r = m.get(w); if (!r) { r = new Map(); m.set(w, r); } let c = r.get(d); if (!c) { c = {}; r.set(d, c); } return c; };
    for (const x of existing?.work ?? []) cell(x.w, x.d).wk = x;
    for (const x of existing?.absences ?? []) cell(x.w, x.d).ab = x;
    return m;
  }, [existing]);

  return (
    <div className="ts-entry">
      <div className="menubar">
        <button className="menu-back" onClick={back} aria-label={tx`Quay lại danh sách bảng`}>{tx`‹ Bảng giấy`}</button>
        <strong className="menu-cur">{sheet.code}</strong>
      </div>
      <p>{orgName} · {fmtDate(sheet.from_date)} – {fmtDate(sheet.to_date)} · {sheet.workers.length}{' '}{tx`người`}{sheet.note ? ` · ${sheet.note}` : ''}</p>
      {!online && <p className="msg warn" role="status">{tx`Đang offline: lưu số liệu cần có mạng. Bạn vẫn gõ được, nhớ bấm Lưu khi có mạng.`}</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}

      <Collapsible title={tx`Cách ghi`} summary={hours ? tx`kiểu ghi số giờ` : tx`kiểu đánh dấu ca`}>
        <ul className="ts-legend">
          <li>{tx`Ca mặc định:`}{' '}<strong>{hhmm(sheet.shift_start)} – {hhmm(sheet.shift_end)}</strong>{tx`, nghỉ giữa ca`}{' '}{sheet.break_minutes}{' '}{tx`phút (đủ ca =`}{' '}{hoursText(fullNet)}{' '}{tx`giờ làm).`}</li>
          {hours
            ? <li><Trans>Gõ <b>số giờ</b> làm cả ngày, ví dụ <b>8</b> hoặc <b>6,5</b>. Gõ <b>x</b> nếu trên giấy chỉ tick đủ ca.</Trans></li>
            : <li><Trans>Gõ <b>x</b> (✓) = đủ ca · <b>0,5</b> (½) = nửa ca · <b>số giờ</b> (ví dụ 6,5) nếu làm khác ca mặc định.</Trans></li>}
          <li>{tx`Nghỉ:`}{' '}<b>p</b> = P {OFF_LABEL.P.toLowerCase()} · <b>o</b>{' '}{tx`= Ô`}{' '}{OFF_LABEL.O.toLowerCase()} · <b>v</b> = V {OFF_LABEL.V.toLowerCase()} · <b>k</b> = K {OFF_LABEL.K.toLowerCase()}.</li>
          <li><Trans>Gõ <b>-</b> nếu trên giấy gạch ngang (không làm việc). <b>Để trống</b> nếu trên giấy chưa ghi: ô trống không được lưu.</Trans></li>
          <li>{tx`Ô có nền xám đã có dữ liệu trong hệ thống nên khóa lại; muốn sửa hãy dùng Bảng công hoặc Nghỉ phép. Ô tô đỏ là ký hiệu sai hoặc chưa lưu được.`}</li>
          <li>{tx`Giấy không có giờ vào/ra cụ thể nên công được tạo theo ca mặc định hoặc số giờ bạn gõ; ghi chú của ca ghi rõ mã bảng.`}</li>
        </ul>
      </Collapsible>

      <div className="card slim ts-scan">
        <p><strong>{tx`📷 Đọc từ ảnh bảng giấy`}</strong> <span className="muted">{tx`(không bắt buộc)`}</span></p>
        <p className="muted"><Trans>Chụp bảng đã ghi (1–{MAX_PHOTOS} ảnh, chụp thẳng, đủ sáng, thấy cả tên và các cột ngày). Ứng dụng điền sẵn vào các ô còn trống; ô AI không chắc tô vàng. Ảnh không được lưu; bạn phải xem lại rồi bấm Lưu.</Trans></p>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPhotos(e.target.files)} />
        <div className="btnrow">
          <button type="button" className="secondary" disabled={scanBusy || busy || !online || existing === null || sheet.workers.length > SCAN_MAX_ROWS || (usage !== null && usage.remaining <= 0)} onClick={() => fileRef.current?.click()}>{scanBusy ? tx`Đang đọc ảnh…` : tx`📷 Chụp / chọn ảnh bảng`}</button>
        </div>
        {sheet.workers.length > SCAN_MAX_ROWS && <p className="muted"><Trans>Bảng có hơn {SCAN_MAX_ROWS} người nên chưa đọc ảnh được; hãy lập bảng riêng cho từng tổ.</Trans></p>}
        {usage && <p className="muted">{usage.remaining > 0 ? tx`Còn ${usage.remaining}/${usage.limit} lượt đọc ảnh tháng này (mỗi lần đọc tính một lượt, dùng chung với đọc hóa đơn).` : tx`Tháng này đã hết lượt đọc ảnh theo gói. Bạn vẫn nhập tay được.`}</p>}
        {scanOut && (
          <div>
            <p>{tx`Đọc được`}{' '}<strong>{scanOut.map.rowsMatched}</strong>{' '}{tx`hàng, điền`}{' '}<strong>{scanOut.filled}</strong>{' '}{tx`ô`}{scanOut.kept ? tx`, giữ nguyên ${scanOut.kept} ô đã gõ hoặc đã có` : ''}; <strong>{warn.size}</strong>{' '}{tx`ô tô vàng cần xem kỹ.`}</p>
            {scanOut.map.nameMismatch.map((m) => <p key={m.stt} className="msg warn"><Trans>Hàng {m.stt}: tên đọc được “{m.read}” khác “{m.expected}”. Cả hàng tô vàng, hãy đối chiếu.</Trans></p>)}
            {scanOut.map.unmatched.map((m) => <p key={m.stt} className="msg warn">{tx`Có một hàng không ghép được vào bảng (STT`}{' '}{m.stt}{m.read ? tx`, tên “${m.read}”` : ''}{tx`); không điền.`}</p>)}
            {scanOut.notes.map((n, i) => <p key={i} className="msg warn">{n}</p>)}
          </div>
        )}
      </div>

      {existing === null ? <p className="muted">{online ? tx`Đang tải dữ liệu đã có…` : tx`Cần mạng để tải dữ liệu đã có.`}</p> : (
        <div className="table-scroll ts-scroll">
          <table className="grid ts-entry-table">
            <thead>
              <tr>
                <th className="sticky">{tx`Họ tên`}</th>
                {days.map((d) => <th key={d.date} className={d.dow === 0 ? 'sun' : undefined}><b>{d.day}</b><small>{DOW[d.dow]}</small></th>)}
                <th>{tx`Tổng`}</th>
              </tr>
            </thead>
            <tbody>
              {sheet.workers.map((w) => (
                <EntryRow key={w.worker_id} w={w} days={days} mode={sheet.mode} fullNet={fullNet} lock={lockBy.get(w.worker_id)}
                  texts={days.map((d) => text[key(w.worker_id, d.date)] ?? '')}
                  warns={days.map((d) => warn.has(key(w.worker_id, d.date)))}
                  probs={days.map((d) => problems[key(w.worker_id, d.date)])}
                  onCell={onCell} onBlurCell={onBlurCell} onFill={onFill} onClear={onClear} onMove={onMove} register={register} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.skipped.length > 0 && (
        <div className="card alert-warn">
          <h2><Trans>{result.skipped.length} ô chưa lưu được</Trans></h2>
          {result.skipped.slice(0, 30).map((s, i) => <p key={i}><strong>{nameOf.get(s.w) ?? tx`Người làm`}</strong>{' '}{tx`ngày`}{' '}{fmtDate(s.d)}: {s.reason}</p>)}
          {result.skipped.length > 30 && <p className="muted">{tx`… và`}{' '}{result.skipped.length - 30}{' '}{tx`ô nữa.`}</p>}
          <p className="muted">{tx`Các ô này vẫn giữ chữ bạn gõ (tô đỏ) để sửa hoặc xóa.`}</p>
        </div>
      )}

      <p className="muted">{tx`Đang gõ`}{' '}{filled}{' '}{tx`ô chưa lưu`}{invalid > 0 ? tx`, ${invalid} ô sai` : ''}{tx`. Công do chủ nhập được xác nhận luôn; công do quản lý hoặc tổ trưởng nhập chờ xác nhận.`}</p>
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !online || filled === 0} onClick={() => void save()}>{busy ? tx`Đang lưu…` : tx`Lưu ${filled > 0 ? filled + tx` ô` : ''}`.trim()}</button>
        <button type="button" className="secondary" disabled={busy || !online} onClick={() => void toggleEntered()}>{cur.status === 'entered' ? tx`Bỏ đánh dấu nhập xong` : tx`Đánh dấu đã nhập xong`}</button>
      </div>
    </div>
  );
}

interface LockCell { wk?: ExistingWork; ab?: ExistingAbsence }
const sameArr = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

interface RowProps {
  w: SheetWorker; days: SheetDay[]; mode: 'shift' | 'hours'; fullNet: number; lock: Map<string, LockCell> | undefined;
  texts: string[]; warns: boolean[]; probs: (string | undefined)[];
  onCell: (w: string, d: string, v: string) => void; onBlurCell: (w: string, d: string) => void; onFill: (w: string) => void; onClear: (w: string) => void;
  onMove: (w: string, d: string, step: 1 | -1) => void; register: (k: string, el: HTMLInputElement | null) => void;
}
/** Một hàng của lưới (một người): chỉ vẽ lại khi chữ, màu hoặc ô khóa của CHÍNH người này đổi */
const EntryRow = memo(function EntryRow({ w, days, mode, fullNet, lock, texts, warns, probs, onCell, onBlurCell, onFill, onClear, onMove, register }: RowProps) {
  const wid = w.worker_id;
  const parsedCells = days.map((d, i) => (lock?.get(d.date) ? null : parseCell(texts[i] ?? '', mode)));
  let exMin = 0, exOff = 0;
  for (const d of days) { const c = lock?.get(d.date); if (c?.wk) exMin += c.wk.minutes; else if (c?.ab) exOff += 1; }
  const tot = personTotals(parsedCells.filter((p): p is Parsed => p !== null), fullNet, exMin, exOff);
  return (
    <tr>
      <td className="sticky">
        <strong>{w.name}</strong>{w.team ? <small> · {w.team}</small> : null}
        <span className="ts-rowact">
          <button type="button" className="link" onClick={() => onFill(wid)}>{tx`✓ trừ CN`}</button>
          <button type="button" className="link" onClick={() => onClear(wid)}>{tx`Xóa`}</button>
        </span>
      </td>
      {days.map((d, i) => {
        const c = lock?.get(d.date);
        if (c?.wk || c?.ab) {
          const wk = c.wk, ab = c.ab;
          const title = wk ? tx`Đã có công ${hoursText(wk.minutes)} giờ (${STATUS_TEXT[wk.status] ?? wk.status})${wk.mine ? tx` từ bảng này` : ''}` : tx`Đã có ghi nghỉ${ab?.mine ? tx` từ bảng này` : ''}`;
          return <td key={d.date} className={`lock${d.dow === 0 ? ' sun' : ''}`} title={title}>{wk ? hoursText(wk.minutes) : KIND_LETTER[ab!.kind] ?? 'N'}</td>;
        }
        const p = parsedCells[i]!;
        const bad = p.kind === 'error' ? p.message : probs[i];
        const k = key(wid, d.date);
        return (
          <td key={d.date} className={d.dow === 0 ? 'sun' : undefined}>
            <input ref={(el) => register(k, el)} className={bad ? 'cell bad' : warns[i] ? 'cell warn' : 'cell'} value={texts[i] ?? ''} maxLength={6} autoComplete="off" spellCheck={false}
              aria-label={tx`${w.name} ngày ${d.day}`} title={bad ?? (warns[i] ? tx`AI không chắc ô này: hãy đối chiếu với tờ giấy.` : undefined)}
              onChange={(e) => onCell(wid, d.date, e.target.value)} onBlur={() => onBlurCell(wid, d.date)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); onMove(wid, d.date, 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); onMove(wid, d.date, -1); } }} />
          </td>
        );
      })}
      <td className="ts-total">{tot.invalid > 0 ? <span className="pill err">{tot.invalid} sai</span> : totalText(tot, mode, fullNet)}</td>
    </tr>
  );
}, (a, b) => a.w === b.w && a.days === b.days && a.mode === b.mode && a.fullNet === b.fullNet && a.lock === b.lock
  && sameArr(a.texts, b.texts) && sameArr(a.warns, b.warns) && sameArr(a.probs, b.probs)
  && a.onCell === b.onCell && a.onBlurCell === b.onBlurCell && a.onFill === b.onFill && a.onClear === b.onClear && a.onMove === b.onMove && a.register === b.register);
