import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import {
  DOW, fetchExisting, hhmm, listDays, markSheetEntered, recordTimesheet,
  type CellOut, type Existing, type SaveResult, type Sheet,
} from '../lib/timesheets';
import { OFF_LABEL, cellLabel, parseCell, personTotals, totalText, type Parsed } from '../lib/timesheetCells';
import { Collapsible } from './Collapsible';

const STATUS_TEXT: Record<string, string> = { confirmed: 'đã xác nhận', needs_confirmation: 'chờ xác nhận', open: 'đang trong ca' };
const KIND_LETTER: Record<string, string> = { annual: 'P', sick: 'Ô', family: 'V', unpaid: 'K', no_notice: 'K', other: 'K' };
const hoursText = (min: number) => `${String(Math.round(min / 6) / 10).replace('.', ',')}`;
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

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setExisting(await fetchExisting(sheet.id)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [sheet.id]);
  useEffect(() => { void load(); }, [load]);

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

  async function save() {
    setError(null); setMsg(null); setResult(null);
    if (invalid > 0) return setError(`Còn ${invalid} ô sai ký hiệu (tô đỏ). Hãy sửa rồi lưu.`);
    const cells: CellOut[] = [];
    for (const w of sheet.workers) for (const d of days) {
      if (locked(w.worker_id, d.date)) continue;
      const p = parsed(w.worker_id, d.date);
      if (p.kind === 'empty' || p.kind === 'none' || p.kind === 'error') continue;
      cells.push({ w: w.worker_id, d: d.date, k: p.kind, ...(p.kind === 'hours' ? { h: p.hours } : {}) });
    }
    if (cells.length === 0) return setError('Chưa có ô nào để lưu. Gõ ký hiệu vào các ô rồi bấm Lưu.');
    setBusy(true);
    try {
      const r = await recordTimesheet(sheet.id, cells);
      setResult(r);
      const bad = Object.fromEntries(r.skipped.map((s) => [key(s.w, s.d), s.reason]));
      setProblems(bad);
      // ô đã lưu hoặc đã có từ trước thì bỏ chữ đã gõ (sẽ hiện thành ô khóa); ô bị bỏ qua giữ lại để sửa
      setText((t) => { const n = { ...t }; for (const c of cells) { const k = key(c.w, c.d); if (!bad[k]) delete n[k]; } return n; });
      setMsg(`Đã lưu ${r.saved} ô${r.unchanged ? `, ${r.unchanged} ô đã có từ trước` : ''}${r.skipped.length ? `. ${r.skipped.length} ô chưa lưu được (xem bên dưới)` : ''}.`);
      await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function toggleEntered() {
    setBusy(true); setError(null);
    try { const s = await markSheetEntered(cur.id, cur.version, cur.status !== 'entered'); setCur(s); onChanged(s); setMsg(s.status === 'entered' ? 'Đã đánh dấu bảng nhập xong.' : 'Đã bỏ đánh dấu nhập xong.'); }
    catch (e) { setError(/CONFLICT/.test(String((e as Error).message)) ? 'Bảng vừa được người khác sửa. Hãy mở lại bảng.' : friendlyError(e)); }
    finally { setBusy(false); }
  }
  function back() {
    if (filled > 0 && !window.confirm(`Còn ${filled} ô gõ chưa lưu. Thoát thì các ô này sẽ mất. Thoát không?`)) return;
    onBack();
  }

  const nameOf = new Map(sheet.workers.map((w) => [w.worker_id, w.name]));
  const hours = sheet.mode === 'hours';

  return (
    <div className="ts-entry">
      <div className="menubar">
        <button className="menu-back" onClick={back} aria-label="Quay lại danh sách bảng">‹ Bảng giấy</button>
        <strong className="menu-cur">{sheet.code}</strong>
      </div>
      <p>{orgName} · {fmtDate(sheet.from_date)} – {fmtDate(sheet.to_date)} · {sheet.workers.length} người{sheet.note ? ` · ${sheet.note}` : ''}</p>
      {!online && <p className="msg warn" role="status">Đang offline: lưu số liệu cần có mạng. Bạn vẫn gõ được, nhớ bấm Lưu khi có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}

      <Collapsible title="Cách ghi" summary={hours ? 'kiểu ghi số giờ' : 'kiểu đánh dấu ca'}>
        <ul className="ts-legend">
          <li>Ca mặc định: <strong>{hhmm(sheet.shift_start)} – {hhmm(sheet.shift_end)}</strong>, nghỉ giữa ca {sheet.break_minutes} phút (đủ ca = {hoursText(fullNet)} giờ làm).</li>
          {hours
            ? <li>Gõ <b>số giờ</b> làm cả ngày, ví dụ <b>8</b> hoặc <b>6,5</b>. Gõ <b>x</b> nếu trên giấy chỉ tick đủ ca.</li>
            : <li>Gõ <b>x</b> (✓) = đủ ca · <b>0,5</b> (½) = nửa ca · <b>số giờ</b> (ví dụ 6,5) nếu làm khác ca mặc định.</li>}
          <li>Nghỉ: <b>p</b> = P {OFF_LABEL.P.toLowerCase()} · <b>o</b> = Ô {OFF_LABEL.O.toLowerCase()} · <b>v</b> = V {OFF_LABEL.V.toLowerCase()} · <b>k</b> = K {OFF_LABEL.K.toLowerCase()}.</li>
          <li>Gõ <b>-</b> nếu trên giấy gạch ngang (không làm việc). <b>Để trống</b> nếu trên giấy chưa ghi: ô trống không được lưu.</li>
          <li>Ô có nền xám đã có dữ liệu trong hệ thống nên khóa lại; muốn sửa hãy dùng Bảng công hoặc Nghỉ phép. Ô tô đỏ là ký hiệu sai hoặc chưa lưu được.</li>
          <li>Giấy không có giờ vào/ra cụ thể nên công được tạo theo ca mặc định hoặc số giờ bạn gõ; ghi chú của ca ghi rõ mã bảng.</li>
        </ul>
      </Collapsible>

      {existing === null ? <p className="muted">{online ? 'Đang tải dữ liệu đã có…' : 'Cần mạng để tải dữ liệu đã có.'}</p> : (
        <div className="table-scroll ts-scroll">
          <table className="grid ts-entry-table">
            <thead>
              <tr>
                <th className="sticky">Họ tên</th>
                {days.map((d) => <th key={d.date} className={d.dow === 0 ? 'sun' : undefined}><b>{d.day}</b><small>{DOW[d.dow]}</small></th>)}
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {sheet.workers.map((w) => {
                const cells = days.filter((d) => !locked(w.worker_id, d.date)).map((d) => parsed(w.worker_id, d.date));
                const exMin = days.reduce((s, d) => s + (work.get(key(w.worker_id, d.date))?.minutes ?? 0), 0);
                const exOff = days.reduce((s, d) => s + (absent.has(key(w.worker_id, d.date)) ? 1 : 0), 0);
                const tot = personTotals(cells, fullNet, exMin, exOff);
                return (
                  <tr key={w.worker_id}>
                    <td className="sticky">
                      <strong>{w.name}</strong>{w.team ? <small> · {w.team}</small> : null}
                      <span className="ts-rowact">
                        <button type="button" className="link" onClick={() => fillRow(w.worker_id)}>✓ trừ CN</button>
                        <button type="button" className="link" onClick={() => clearRow(w.worker_id)}>Xóa</button>
                      </span>
                    </td>
                    {days.map((d) => {
                      const k = key(w.worker_id, d.date);
                      const wk = work.get(k), ab = absent.get(k);
                      if (wk || ab) {
                        const title = wk ? `Đã có công ${hoursText(wk.minutes)} giờ (${STATUS_TEXT[wk.status] ?? wk.status})${wk.mine ? ' từ bảng này' : ''}` : `Đã có ghi nghỉ${ab?.mine ? ' từ bảng này' : ''}`;
                        return <td key={d.date} className={`lock${d.dow === 0 ? ' sun' : ''}`} title={title}>{wk ? hoursText(wk.minutes) : KIND_LETTER[ab!.kind] ?? 'N'}</td>;
                      }
                      const p = parsed(w.worker_id, d.date);
                      const bad = p.kind === 'error' ? p.message : problems[k];
                      return (
                        <td key={d.date} className={d.dow === 0 ? 'sun' : undefined}>
                          <input ref={(el) => { if (el) refs.current.set(k, el); else refs.current.delete(k); }}
                            className={bad ? 'cell bad' : 'cell'} value={text[k] ?? ''} maxLength={6} autoComplete="off" spellCheck={false} aria-label={`${w.name} ngày ${d.day}`} title={bad}
                            onChange={(e) => setCell(w.worker_id, d.date, e.target.value)} onBlur={() => normalize(w.worker_id, d.date)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); move(w.worker_id, d.date, 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(w.worker_id, d.date, -1); } }} />
                        </td>
                      );
                    })}
                    <td className="ts-total">{tot.invalid > 0 ? <span className="pill err">{tot.invalid} sai</span> : totalText(tot, sheet.mode, fullNet)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result && result.skipped.length > 0 && (
        <div className="card alert-warn">
          <h2>{result.skipped.length} ô chưa lưu được</h2>
          {result.skipped.slice(0, 30).map((s, i) => <p key={i}><strong>{nameOf.get(s.w) ?? 'Người làm'}</strong> ngày {fmtDate(s.d)}: {s.reason}</p>)}
          {result.skipped.length > 30 && <p className="muted">… và {result.skipped.length - 30} ô nữa.</p>}
          <p className="muted">Các ô này vẫn giữ chữ bạn gõ (tô đỏ) để sửa hoặc xóa.</p>
        </div>
      )}

      <p className="muted">Đang gõ {filled} ô chưa lưu{invalid > 0 ? `, ${invalid} ô sai` : ''}. Công do chủ nhập được xác nhận luôn; công do quản lý hoặc tổ trưởng nhập chờ xác nhận.</p>
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || !online || filled === 0} onClick={() => void save()}>{busy ? 'Đang lưu…' : `Lưu ${filled > 0 ? filled + ' ô' : ''}`.trim()}</button>
        <button type="button" className="secondary" disabled={busy || !online} onClick={() => void toggleEntered()}>{cur.status === 'entered' ? 'Bỏ đánh dấu nhập xong' : 'Đánh dấu đã nhập xong'}</button>
      </div>
    </div>
  );
}
