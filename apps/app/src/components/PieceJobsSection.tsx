import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useCatalog } from '../lib/catalog';
import { cycleTitle } from '../lib/cycles';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import {
  cancelPieceJob, confirmPieceJob, createPieceJob, equalPcts, fetchPieceJobs, modeText, previewShares, resultText, statusText, updatePieceJob,
  type PieceJob, type PieceList,
} from '../lib/pieceJobs';
import { useTable } from '../lib/tables';
import { fmtVnd } from '../lib/work';

interface Form {
  id: string | null; title: string; cycleId: string; date: string; mode: 'output' | 'lump'; unit: string; price: string; lump: string;
  picked: string[]; split: 'equal' | 'pct'; pcts: Record<string, string>; note: string;
}
const blank = (): Form => ({ id: null, title: '', cycleId: '', date: todayLocal(), mode: 'output', unit: 'kg', price: '', lump: '', picked: [], split: 'equal', pcts: {}, note: '' });
const money = (s: string) => Number(s.replace(/[.,\s]/g, ''));
const UNITS = ['kg', 'thùng', 'cây', 'quả', 'bó', 'm²'];

/**
 * Phiếu khoán trong Bảng lương (mục 11). Lập phiếu = giao khoán (việc, vụ, đơn giá hoặc trọn gói, những người nhận); nghiệm thu = nhập sản lượng thực tế,
 * tiền tự cộng vào "thực nhận" của từng người trong tháng và vào chi phí nhân công của vụ. Người chỉ có tên trong phiếu thì thấy phần của mình ở Bảng lương.
 */
export function PieceJobsSection({ orgId, range, people, online, onChanged }: {
  orgId: string; range: { from: string; to: string }; people: { worker_id: string; name: string }[]; online: boolean; onChanged: () => void;
}) {
  const cycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const [data, setData] = useState<PieceList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; qty: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);

  const mine = useMemo(() => cycles.filter((c) => c.owner_org_id === orgId && c.status !== 'cancelled' && c.status !== 'ended'), [cycles, orgId]);
  const cycleName = (id: string | null) => { const c = cycles.find((x) => x.id === id); return c ? cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '') : ''; };

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setData(await fetchPieceJobs(orgId, range.from, range.to)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, range.from, range.to]);
  useEffect(() => { void load(); }, [load]);

  const jobs = data?.jobs ?? [];
  const drafts = jobs.filter((j) => j.status === 'draft').length;
  if (data && jobs.length === 0 && !data.can_edit) return null; // người không có quyền lập và chưa có phiếu nào: không hiện thêm gì
  const canEdit = Boolean(data?.can_edit);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); onChanged(); return true; } catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(false); }
  }

  function toForm(j: PieceJob): Form {
    return {
      id: j.id, title: j.title, cycleId: j.cycle_id ?? '', date: j.work_date, mode: j.pay_mode, unit: j.unit ?? 'kg', price: j.unit_price !== null ? String(j.unit_price) : '', lump: j.lump_amount !== null ? String(j.lump_amount) : '',
      picked: j.shares.map((s) => s.worker_id), split: j.shares.every((s) => Math.abs(s.pct - j.shares[0]!.pct) < 0.02) ? 'equal' : 'pct',
      pcts: Object.fromEntries(j.shares.map((s) => [s.worker_id, String(s.pct)])), note: j.note ?? '',
    };
  }

  async function save() {
    if (!form) return;
    if (form.title.trim().length < 2) return setError('Hãy ghi việc khoán (ví dụ: Hái dưa lô A).');
    if (form.picked.length === 0) return setError('Hãy chọn ít nhất một người nhận khoán.');
    const price = money(form.price), lump = money(form.lump);
    if (form.mode === 'output' && (!form.unit.trim() || !(price > 0))) return setError('Khoán theo sản lượng cần đơn vị và đơn giá lớn hơn 0.');
    if (form.mode === 'lump' && !(lump > 0)) return setError('Khoán trọn gói cần số tiền lớn hơn 0.');
    let workers: { worker_id: string; pct: number | null }[];
    if (form.split === 'equal') workers = form.picked.map((w) => ({ worker_id: w, pct: null }));
    else {
      workers = form.picked.map((w) => ({ worker_id: w, pct: Number((form.pcts[w] ?? '').replace(',', '.')) }));
      const sum = workers.reduce((s, w) => s + (w.pct ?? 0), 0);
      if (workers.some((w) => !(w.pct! > 0)) || Math.abs(sum - 100) > 0.01) return setError(`Tổng phần chia phải bằng 100% (hiện là ${Math.round(sum * 100) / 100}%).`);
    }
    const input = { cycleId: form.cycleId || null, title: form.title.trim(), date: form.date, mode: form.mode, unit: form.unit.trim(), price: form.mode === 'output' ? price : null, lump: form.mode === 'lump' ? lump : null, workers, note: form.note };
    if (await run(() => (form.id ? updatePieceJob(form.id, input) : createPieceJob(orgId, input)))) setForm(null);
  }

  const togglePick = (id: string) => setForm((f) => (f ? { ...f, picked: f.picked.includes(id) ? f.picked.filter((x) => x !== id) : [...f.picked, id] } : f));

  return (
    <Collapsible title="Phiếu khoán" summary={jobs.length === 0 ? 'chưa có' : `${jobs.length} phiếu${drafts > 0 ? ` · ${drafts} chờ nghiệm thu` : ''}`} warn={drafts > 0} defaultOpen={drafts > 0}>
      <p className="muted">Trả công theo việc (theo kg, thùng… hoặc trọn gói), có thể giao cho nhiều người. Nghiệm thu xong, tiền tự vào lương tháng của từng người và vào chi phí nhân công của vụ. Giờ công và lương cố định vẫn tính như cũ.</p>
      {error && <p className="msg error" role="alert">{error}</p>}

      {canEdit && !form && <div className="btnrow"><button type="button" className="secondary" disabled={!online} onClick={() => { setError(null); setForm(blank()); }}>＋ Lập phiếu khoán</button></div>}
      {canEdit && form && (
        <div className="inline-form">
          <p><strong>{form.id ? 'Sửa phiếu khoán' : 'Phiếu khoán mới'}</strong></p>
          <label>Việc khoán<input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Hái dưa lô A" /></label>
          <div className="pair">
            <label>Vụ (không bắt buộc)
              <select value={form.cycleId} onChange={(e) => setForm({ ...form, cycleId: e.target.value })}>
                <option value="">Không gắn vụ</option>
                {mine.map((c) => <option key={c.id} value={c.id}>{cycleName(c.id)}</option>)}
              </select>
            </label>
            <label>Ngày làm<input type="date" value={form.date} max={todayLocal()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          </div>
          <div className="chips" role="tablist" aria-label="Cách khoán">
            <button type="button" role="tab" aria-selected={form.mode === 'output'} className={form.mode === 'output' ? 'chip active' : 'chip'} onClick={() => setForm({ ...form, mode: 'output' })}>Theo sản lượng</button>
            <button type="button" role="tab" aria-selected={form.mode === 'lump'} className={form.mode === 'lump' ? 'chip active' : 'chip'} onClick={() => setForm({ ...form, mode: 'lump' })}>Trọn gói</button>
          </div>
          {form.mode === 'output' ? (
            <div className="pair">
              <label>Đơn giá (đồng)<input value={form.price} inputMode="numeric" onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Ví dụ: 2000" /></label>
              <label>Tính theo<input value={form.unit} list="piece-units" maxLength={20} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                <datalist id="piece-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
              </label>
            </div>
          ) : (
            <label>Số tiền trọn gói (đồng)<input value={form.lump} inputMode="numeric" onChange={(e) => setForm({ ...form, lump: e.target.value })} placeholder="Ví dụ: 3000000" /></label>
          )}
          <fieldset className="inline-form">
            <legend>Người nhận khoán</legend>
            {people.length === 0 && <p className="muted">Chưa có người nào trong danh sách nhân sự.</p>}
            {people.map((p) => (
              <label className="check" key={p.worker_id}>
                <input type="checkbox" checked={form.picked.includes(p.worker_id)} onChange={() => togglePick(p.worker_id)} /> {p.name}
                {form.split === 'pct' && form.picked.includes(p.worker_id) && (
                  <input className="pct-input" inputMode="decimal" aria-label={`Phần chia của ${p.name} (%)`} value={form.pcts[p.worker_id] ?? ''} placeholder="%" onChange={(e) => setForm({ ...form, pcts: { ...form.pcts, [p.worker_id]: e.target.value } })} />
                )}
              </label>
            ))}
            {form.picked.length > 1 && (
              <label className="check"><input type="checkbox" checked={form.split === 'pct'} onChange={(e) => setForm({ ...form, split: e.target.checked ? 'pct' : 'equal', pcts: e.target.checked ? Object.fromEntries(form.picked.map((w, i) => [w, String(equalPcts(form.picked.length)[i])])) : form.pcts })} /> Chia theo phần trăm (mặc định chia đều)</label>
            )}
          </fieldset>
          <label>Ghi chú (không bắt buộc)<input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !online} onClick={() => void save()}>{form.id ? 'Lưu thay đổi' : 'Lưu phiếu'}</button>
            <button type="button" className="secondary" onClick={() => { setForm(null); setError(null); }}>Hủy</button>
          </div>
        </div>
      )}

      {data && jobs.length === 0 && <p className="muted">Chưa có phiếu khoán nào trong kỳ này.</p>}
      {jobs.map((j) => {
        const st = statusText(j);
        const q = confirming?.id === j.id ? Number(confirming.qty.replace(',', '.')) : NaN;
        const total = j.pay_mode === 'lump' ? j.lump_amount ?? 0 : Number.isFinite(q) && q > 0 ? Math.round((j.unit_price ?? 0) * q) : 0;
        const prev = total > 0 ? previewShares(total, j.shares.map((s) => s.pct)) : [];
        return (
          <div className={j.status === 'cancelled' ? 'card slim voided' : 'card slim'} key={j.id}>
            <div className="row">
              <strong className="grow">{j.title}</strong>
              <span className={`pill ${st.tone}`}>{st.label}</span>
            </div>
            <p className="muted">
              {fmtDate(j.work_date)}{j.cycle_id ? ` · ${cycleName(j.cycle_id)}` : ''} · {modeText(j)}{resultText(j) ? ` · làm được ${resultText(j)}` : ''}
              {data?.can_see_all && j.total_amount !== null ? ` · tổng ${fmtVnd(j.total_amount)}` : ''}
            </p>
            <p className="muted">{j.shares.map((s) => `${s.name}${j.shares.length > 1 ? ` ${Math.round(s.pct * 100) / 100}%` : ''}${s.amount !== null ? ` = ${fmtVnd(s.amount)}` : ''}`).join(' · ')}</p>
            {j.note && <p className="muted">{j.note}</p>}
            {j.status === 'cancelled' && j.cancel_reason && <p className="muted">Lý do hủy: {j.cancel_reason}</p>}

            {canEdit && j.status === 'draft' && confirming?.id !== j.id && cancelling?.id !== j.id && !form && (
              <div className="btnrow">
                <button type="button" className="primary" disabled={busy || !online} onClick={() => { setError(null); setConfirming({ id: j.id, qty: '' }); }}>Nghiệm thu</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => { setError(null); setForm(toForm(j)); }}>Sửa</button>
                <button type="button" className="link" disabled={busy || !online} onClick={() => setCancelling({ id: j.id, reason: '' })}>Hủy phiếu</button>
              </div>
            )}
            {canEdit && j.status === 'confirmed' && cancelling?.id !== j.id && (
              <div className="btnrow"><button type="button" className="link" disabled={busy || !online || j.pay_state === 'locked'} title={j.pay_state === 'locked' ? 'Kỳ lương đã chốt' : ''} onClick={() => setCancelling({ id: j.id, reason: '' })}>Hủy phiếu (gỡ khỏi lương)</button></div>
            )}

            {canEdit && confirming?.id === j.id && (
              <div className="inline-form">
                {j.pay_mode === 'output' && (
                  <label>Sản lượng thực tế ({j.unit})<input value={confirming.qty} inputMode="decimal" onChange={(e) => setConfirming({ id: j.id, qty: e.target.value })} placeholder={`Số ${j.unit} đã làm xong`} /></label>
                )}
                {prev.length > 0 && (
                  <p className="msg ok" role="status">Tổng {fmtVnd(total)}: {j.shares.map((s, i) => `${s.name} ${fmtVnd(prev[i]!)}`).join(' · ')}. Tiền vào lương tháng {j.work_date.slice(5, 7)}/{j.work_date.slice(0, 4)}.</p>
                )}
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || !online || (j.pay_mode === 'output' && !(q > 0))}
                    onClick={() => void run(() => confirmPieceJob(j.id, j.pay_mode === 'output' ? q : null)).then((ok) => { if (ok) setConfirming(null); })}>Xác nhận nghiệm thu</button>
                  <button type="button" className="secondary" onClick={() => setConfirming(null)}>Không</button>
                </div>
              </div>
            )}
            {canEdit && cancelling?.id === j.id && (
              <div className="inline-form">
                <label>Lý do hủy<input value={cancelling.reason} maxLength={300} onChange={(e) => setCancelling({ id: j.id, reason: e.target.value })} placeholder="Ví dụ: ghi nhầm sản lượng" /></label>
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || cancelling.reason.trim().length < 3} onClick={() => void run(() => cancelPieceJob(j.id, cancelling.reason)).then((ok) => { if (ok) setCancelling(null); })}>Xác nhận hủy</button>
                  <button type="button" className="secondary" onClick={() => setCancelling(null)}>Không hủy</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Collapsible>
  );
}
