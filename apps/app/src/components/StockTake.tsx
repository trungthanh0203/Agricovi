import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { formatMoney, formatQty } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { supabase } from '../lib/supabase';
import {
  lineDiff, normalizeLine, overTolerance, parseCount, stocktakeTotals, type StocktakeHead, type StocktakeLine,
} from '../lib/stocktakeLogic';

const vn = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const STATUS_LABEL = { draft: 'Đang đếm', done: 'Đã chốt', cancelled: 'Đã hủy' } as const;

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Kiểm kho (D168): mỗi đợt kiểm một kho. Mở đợt (app chụp tồn sổ sách) → đếm từng vật tư → chốt. Chốt KHÔNG sửa tồn trực tiếp mà thêm giao dịch
 * "Điều chỉnh" cho dòng lệch, nên lịch sử kho vẫn chỉ thêm. Cần mạng (ghi thẳng lên máy chủ, D24). Quyền: sửa mục Kho.
 */
export function StockTake({ orgId, canWrite, onClose }: { orgId: string; canWrite: boolean; onClose: () => void }) {
  const online = useOnline();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!online) return <section><h1>Kiểm kho</h1><p className="msg warn" role="status">Kiểm kho cần có mạng. Hãy kết nối Internet rồi thử lại.</p><button className="secondary" onClick={onClose}>Quay lại Kho</button></section>;
  if (openId) return <StockTakeDetail id={openId} canWrite={canWrite} onBack={() => setOpenId(null)} />;
  return <StockTakeList orgId={orgId} canWrite={canWrite} onOpen={setOpenId} onClose={onClose} />;
}

function StockTakeList({ orgId, canWrite, onOpen, onClose }: { orgId: string; canWrite: boolean; onOpen: (id: string) => void; onClose: () => void }) {
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const [rows, setRows] = useState<(StocktakeHead & { id: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [loc, setLoc] = useState('');
  const [blind, setBlind] = useState(false);
  const [tol, setTol] = useState('20');
  const [note, setNote] = useState('');
  const [reload, setReload] = useState(0);
  const locs = useMemo(() => locations.filter((l) => l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [locations]);
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void supabase.from('stocktakes').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(30).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { setRows([]); setError(/does not exist|schema cache|could not find/i.test(e.message) ? 'Cơ sở dữ liệu chưa được cập nhật lên bản có Kiểm kho. Hãy nhờ người cài đặt chạy "npx supabase db push".' : friendlyError(e)); return; }
      setRows((data ?? []) as (StocktakeHead & { id: string })[]);
    });
    return () => { live = false; };
  }, [orgId, reload]);

  async function start() {
    const t = Number(tol.replace(',', '.'));
    if (!loc) return setError('Hãy chọn kho cần kiểm.');
    if (!Number.isFinite(t) || t < 1 || t > 100) return setError('Ngưỡng lệch phải từ 1 đến 100 phần trăm.');
    setBusy(true); setError(null);
    try {
      const s = await rpc<{ id: string }>('start_stocktake', { p_location: loc, p_blind: blind, p_tolerance: t, p_note: note.trim() || null });
      setForm(false); setNote(''); onOpen(s.id);
    } catch (e) { setError(friendlyError(e)); setReload((n) => n + 1); } finally { setBusy(false); }
  }

  return (
    <section>
      <h1>Kiểm kho</h1>
      <p className="muted">Đếm hàng thực tế rồi so với sổ kho. Khi chốt, chỗ nào lệch app thêm một dòng "Điều chỉnh" có lý do; lịch sử cũ giữ nguyên.</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {canWrite && !form && <button className="primary" onClick={() => { setForm(true); setError(null); }}>Mở đợt kiểm kho mới</button>}
      {canWrite && form && (
        <div className="inline-form">
          <label>Kho cần kiểm
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">Chọn kho…</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Đếm mù (ẩn số sổ sách khi đếm, để khỏi đoán theo)</label>
          <label>Báo cần ghi chú khi lệch quá (%)<input value={tol} inputMode="decimal" onChange={(e) => setTol(e.target.value)} /></label>
          <label>Ghi chú đợt (không bắt buộc)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Kiểm cuối tháng 11" /></label>
          <div className="btnrow">
            <button className="primary" disabled={busy} onClick={() => void start()}>Bắt đầu đếm</button>
            <button type="button" className="secondary" onClick={() => setForm(false)}>Hủy</button>
          </div>
        </div>
      )}
      {rows === null ? <p className="muted">Đang tải…</p> : rows.length === 0 ? <p className="muted">Chưa có đợt kiểm kho nào.</p> : (
        rows.map((s) => (
          <div className="card slim" key={s.id}>
            <div className="row"><strong className="grow">{locName(s.location_id)} · {vn(s.created_at)}</strong><span className={s.status === 'draft' ? 'pill warn' : s.status === 'done' ? 'pill ok' : 'pill'}>{STATUS_LABEL[s.status]}</span></div>
            <p className="muted">{s.created_by_name ?? ''}{s.blind ? ' · đếm mù' : ''}{s.note ? ` · ${s.note}` : ''}</p>
            <button className="secondary" onClick={() => onOpen(s.id)}>{s.status === 'draft' ? 'Tiếp tục đếm' : 'Xem biên bản'}</button>
          </div>
        ))
      )}
      <button className="secondary" onClick={onClose}>Quay lại Kho</button>
    </section>
  );
}

type Draft = Record<string, { counted: string; note: string }>;

function StockTakeDetail({ id, canWrite, onBack }: { id: string; canWrite: boolean; onBack: () => void }) {
  const { active } = useOrgs();
  const materials = useLiveQuery(() => (active ? db.materials.where('organization_id').equals(active.id).toArray() : []), [active?.id], []);
  const locations = useLiveQuery(() => (active ? db.locations.where('organization_id').equals(active.id).toArray() : []), [active?.id], []);
  const [head, setHead] = useState<StocktakeHead | null>(null);
  const [lines, setLines] = useState<StocktakeLine[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [addMat, setAddMat] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    void rpc<{ stocktake: StocktakeHead; lines: StocktakeLine[] }>('get_stocktake', { p_id: id }).then((j) => {
      if (!live) return;
      const ls = j.lines.map(normalizeLine);
      setHead(j.stocktake); setLines(ls);
      setDraft(Object.fromEntries(ls.map((l) => [l.id, { counted: l.counted_qty === null ? '' : String(l.counted_qty), note: l.note ?? '' }])));
    }).catch((e) => { if (live) setError(friendlyError(e)); });
    return () => { live = false; };
  }, [id, reload]);

  const isDraft = head?.status === 'draft';
  const editable = isDraft && canWrite;
  const locName = locations.find((l) => l.id === head?.location_id)?.name ?? '—';
  const changed = lines.filter((l) => {
    const d = draft[l.id]; if (!d) return false;
    return d.counted !== (l.counted_qty === null ? '' : String(l.counted_qty)) || d.note !== (l.note ?? '');
  });
  const countedNow = lines.filter((l) => { const p = parseCount(draft[l.id]?.counted ?? ''); return p !== null && p !== 'bad'; }).length;
  const shown = lines.filter((l) => (!q.trim() || `${l.material_name} ${l.lot_no ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyOpen || !(draft[l.id]?.counted ?? '').trim()));

  async function save(): Promise<boolean> {
    if (changed.length === 0) return true;
    const payload = [];
    for (const l of changed) {
      const d = draft[l.id]!; const p = parseCount(d.counted);
      if (p === 'bad') { setError(`Số đếm của "${l.material_name}" chưa đúng: nhập số không âm.`); return false; }
      payload.push({ id: l.id, version: l.version, counted: p, note: d.note });
    }
    setBusy(true); setError(null); setInfo(null);
    try { await rpc('set_stocktake_counts', { p_stocktake: id, p_lines: payload }); setReload((n) => n + 1); return true; }
    catch (e) { setError(friendlyError(e)); setReload((n) => n + 1); return false; }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!(await save())) return;
    if (!window.confirm('Chốt kiểm kho? Các dòng lệch sẽ được ghi thành giao dịch "Điều chỉnh" và không sửa lại được. Dòng chưa đếm giữ nguyên.')) return;
    setBusy(true); setError(null);
    try { await rpc('finish_stocktake', { p_stocktake: id }); setInfo('Đã chốt kiểm kho. Số tồn đã khớp số đếm.'); setReload((n) => n + 1); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function cancel() {
    const reason = window.prompt('Lý do hủy đợt kiểm kho (ít nhất 3 ký tự):');
    if (reason === null) return;
    setBusy(true); setError(null);
    try { await rpc('cancel_stocktake', { p_stocktake: id, p_reason: reason }); onBack(); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function addLine() {
    if (!addMat) return;
    setBusy(true); setError(null);
    try { await rpc('add_stocktake_line', { p_stocktake: id, p_material: addMat }); setAddMat(''); setReload((n) => n + 1); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (!head) return <section><h1>Kiểm kho</h1>{error ? <p className="msg error" role="alert">{error}</p> : <p className="muted">Đang tải…</p>}<button className="secondary" onClick={onBack}>Quay lại</button></section>;

  const totals = stocktakeTotals(lines);
  const addable = materials.filter((m) => m.is_active && !lines.some((l) => l.material_id === m.id && l.lot_id === null)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  return (
    <section>
      <div className="no-print">
        <h1>Kiểm kho: {locName}</h1>
        <p className="muted">{STATUS_LABEL[head.status]} · mở {vn(head.created_at)}{head.created_by_name ? ` bởi ${head.created_by_name}` : ''}{head.blind && isDraft ? ' · đếm mù' : ''}{head.note ? ` · ${head.note}` : ''}</p>
        {head.status === 'cancelled' && <p className="msg warn" role="status">Đợt đã hủy: {head.cancel_reason}</p>}
        {error && <p className="msg error" role="alert">{error}</p>}
        {info && <p className="msg ok" role="status">{info}</p>}
      </div>

      {isDraft && (
        <div className="no-print">
          <p className="muted">Đã đếm {countedNow}/{lines.length} dòng. Dòng để trống là chưa đếm và sẽ không bị điều chỉnh. Lệch quá {head.tolerance_pct}% cần ghi chú lý do.</p>
          <div className="filters">
            <label>Tìm vật tư<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên hoặc số lô" /></label>
            <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Chỉ hiện dòng chưa đếm</label>
          </div>
          {shown.map((l) => {
            const d = draft[l.id] ?? { counted: '', note: '' };
            const p = parseCount(d.counted);
            const diff = p === null || p === 'bad' ? null : lineDiff(l.book_qty, p);
            const over = p !== null && p !== 'bad' && overTolerance(l.book_qty, p, head.tolerance_pct);
            return (
              <div className="card slim" key={l.id}>
                <div className="row"><strong className="grow">{l.material_name}{l.lot_no ? ` · lô ${l.lot_no}` : ''}</strong>{l.expiry_date && <span className="muted">HSD {vn(l.expiry_date)}</span>}</div>
                {l.book_qty !== null && <p className="muted">Sổ sách: {formatQty(l.book_qty)} {l.unit}</p>}
                <div className="pair">
                  <label>Đếm thực tế ({l.unit})<input value={d.counted} inputMode="decimal" disabled={!editable} onChange={(e) => setDraft({ ...draft, [l.id]: { ...d, counted: e.target.value } })} /></label>
                  {diff !== null && <span className={diff === 0 ? 'pill ok' : 'pill warn'}>{diff === 0 ? 'Khớp' : diff > 0 ? `Thừa ${formatQty(diff)}` : `Thiếu ${formatQty(-diff)}`}</span>}
                </div>
                {(over || d.note) && <label>Ghi chú lý do{over ? ' (bắt buộc)' : ''}<input value={d.note} maxLength={300} disabled={!editable} onChange={(e) => setDraft({ ...draft, [l.id]: { ...d, note: e.target.value } })} placeholder="Ví dụ: hao hụt, rơi vãi, quên ghi xuất" /></label>}
                {!over && !d.note && editable && p !== null && <button className="link inline" onClick={() => setDraft({ ...draft, [l.id]: { ...d, note: ' ' } })}>＋ Ghi chú</button>}
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted">Không có dòng nào khớp bộ lọc.</p>}
          {editable && (
            <div className="inline-form">
              <label>Thêm vật tư chưa có trong kho này
                <select value={addMat} onChange={(e) => setAddMat(e.target.value)}>
                  <option value="">Chọn vật tư…</option>
                  {addable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <div className="btnrow"><button className="secondary" disabled={busy || !addMat} onClick={() => void addLine()}>Thêm dòng</button></div>
            </div>
          )}
          {editable && (
            <div className="btnrow">
              <button className="secondary" disabled={busy || changed.length === 0} onClick={() => void save()}>Lưu số đã nhập{changed.length ? ` (${changed.length})` : ''}</button>
              <button className="primary" disabled={busy || countedNow === 0} onClick={() => void finish()}>Chốt kiểm kho</button>
              <button className="link inline" disabled={busy} onClick={() => void cancel()}>Hủy đợt</button>
            </div>
          )}
          {!canWrite && <p className="muted">Bạn chỉ xem được. Cần quyền sửa Kho để đếm và chốt.</p>}
        </div>
      )}

      {head.status === 'done' && (
        <>
          <div className="no-print btnrow"><button className="primary" onClick={() => window.print()}>In / Lưu PDF (biên bản)</button></div>
          <div id="print-root" className="statement">
            <h2>BIÊN BẢN KIỂM KÊ KHO</h2>
            <p><strong>Kho:</strong> {locName} · <strong>Cơ sở:</strong> {active?.name}</p>
            <p><strong>Mở đợt:</strong> {vn(head.created_at)}{head.created_by_name ? ` (${head.created_by_name})` : ''} · <strong>Chốt:</strong> {head.finished_at ? vn(head.finished_at) : ''}{head.finished_by_name ? ` (${head.finished_by_name})` : ''}</p>
            <p>Đã đếm {totals.counted}/{totals.total} dòng, lệch {totals.diffLines} dòng.{totals.net !== null ? ` Thiếu ${formatMoney(totals.shortage ?? 0)}, thừa ${formatMoney(totals.surplus ?? 0)} (ước theo giá nhập bình quân).` : ''}</p>
            <table className="grid">
              <thead><tr><th>Vật tư / lô</th><th className="num">Sổ sách</th><th className="num">Đếm</th><th className="num">Lệch</th><th className="num">Giá trị lệch</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {lines.filter((l) => l.counted_qty !== null).map((l) => {
                  const adj = l.adjust_qty ?? 0;
                  return (
                    <tr key={l.id}>
                      <td>{l.material_name}{l.lot_no ? ` · lô ${l.lot_no}` : ''}</td>
                      <td className="num">{formatQty(l.book_at_finish ?? 0)} {l.unit}</td>
                      <td className="num">{formatQty(l.counted_qty ?? 0)} {l.unit}</td>
                      <td className="num">{adj === 0 ? '0' : `${adj > 0 ? '+' : ''}${formatQty(adj)}`}</td>
                      <td className="num">{adj !== 0 && l.unit_cost_est !== null ? formatMoney(Math.round(adj * l.unit_cost_est)) : ''}</td>
                      <td>{l.note ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted">Giá trị lệch là ước tính theo đơn giá nhập bình quân của vật tư; để trống nếu chưa có giá nhập.</p>
            <div className="logbook-sign"><span>Người kiểm kê</span><span>Thủ kho</span><span>Chủ cơ sở / Quản lý</span></div>
          </div>
        </>
      )}
      <div className="no-print"><button className="secondary" onClick={onBack}>Quay lại danh sách</button></div>
    </section>
  );
}
