import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile, shortMoney } from './HomeStats';
import { PayForm, pillClass } from './PayablesSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline, todayLocal } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { coopHouseholdOverview, listCoopHouseholds, listProcurementItems, type CoopHousehold, type HouseholdCycleOverview, type ProcurementRow } from '../lib/members';
import { useOrgs } from '../lib/orgs';
import { downloadCsv } from '../lib/summary';
import { canPerm } from '../lib/permissions';
import {
  createProcurementReceipt, createReceiptFromHarvest, fetchProcurementLedger, fetchUnpurchasedHarvests, type UnpurchasedHarvest, listProcurementPayments, payProcurement, PROC_STATUS_LABEL, voidProcurementPayment, voidProcurementReceipt,
  type ProcLine, type ProcPayment,
} from '../lib/procurement';

/**
 * Thu mua từ hộ (D149). HTX (as="coop"): lập phiếu thu mua của hộ thành viên, ghi trả tiền, hủy kèm lý do; công nợ HTX còn phải trả hộ.
 * Hộ (as="household"): chỉ xem các phiếu HTX đã mua và còn phải thu. Hai bên cùng thấy một sổ nên tiền không lệch.
 */
export function ProcurementSection({ as }: { as: 'coop' | 'household' }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id;
  const [rows, setRows] = useState<ProcLine[] | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchProcurementLedger(orgId, as, !showPaid)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, as, showPaid]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; lines: ProcLine[] }>();
    for (const r of rows ?? []) {
      const g = m.get(r.partner_id) ?? { id: r.partner_id, name: r.partner_name, lines: [] };
      g.lines.push(r);
      m.set(r.partner_id, g);
    }
    return [...m.values()];
  }, [rows]);

  if (!active || !orgId) return null;
  const canEdit = as === 'coop' && canPerm(active.perms, 'coop', 'edit');
  const owed = (rows ?? []).reduce((s, r) => s + r.remaining, 0);
  const overdue = (rows ?? []).filter((r) => r.status === 'overdue').reduce((s, r) => s + r.remaining, 0);
  const total = (rows ?? []).reduce((s, r) => s + r.total_amount, 0);

  async function act(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true); setError(null); setOk(null);
    try { await fn(); setOk(done); await load(); return true; } catch (e) { setError(friendlyError(e)); await load(); return false; } finally { setBusy(false); }
  }

  return (
    <>
      <p className="muted">
        {as === 'coop'
          ? 'Phiếu thu mua: HTX mua sản phẩm của hộ thành viên. Số tiền này là giao dịch giữa HTX và hộ, không tính vào chi phí/doanh thu của vụ. Hộ cũng thấy phiếu của mình.'
          : 'Các phiếu HTX đã mua sản phẩm của hộ và số tiền HTX còn phải trả cho hộ. Chỉ HTX ghi phiếu và ghi trả tiền; hộ chỉ xem để đối chiếu.'}
      </p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      {canEdit && <button className="primary" disabled={!online || adding} onClick={() => setAdding(true)}>+ Lập phiếu thu mua</button>}
      {adding && canEdit && <NewReceiptForm coopId={orgId} busy={busy} onCancel={() => setAdding(false)} onRun={act} onDone={() => setAdding(false)} />}

      {rows !== null && rows.length > 0 && (
        <div className="kpis">
          <KpiTile label={as === 'coop' ? 'HTX còn phải trả' : 'HTX còn phải trả hộ'} value={shortMoney(owed)} title={formatMoney(owed)} tone={owed > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Quá hạn" value={shortMoney(overdue)} title={formatMoney(overdue)} tone={overdue > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Tổng giá trị phiếu" value={shortMoney(total)} title={formatMoney(total)} />
        </div>
      )}
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Cần có mạng để xem phiếu thu mua.'}</p>}
      {rows !== null && rows.length === 0 && <p className="muted">{showPaid ? 'Chưa có phiếu thu mua nào.' : 'Không còn khoản nào chưa thanh toán.'}</p>}

      {groups.map((g) => {
        const open = g.lines.reduce((s, l) => s + l.remaining, 0);
        const late = g.lines.filter((l) => l.status === 'overdue').length;
        return (
          <Collapsible key={g.id} title={g.name} summary={`Còn ${as === 'coop' ? 'phải trả' : 'phải thu'} ${formatMoney(open)}${late > 0 ? ` · ${late} phiếu quá hạn` : ''}`} warn={late > 0} defaultOpen={late > 0}>
            {g.lines.map((l) => <ReceiptCard key={l.receipt_id} line={l} as={as} ownName={active.name} canEdit={canEdit} busy={busy || !online}
              onPay={(i) => act(() => payProcurement(l.receipt_id, i), `Đã ghi trả ${formatMoney(i.amount)} cho ${g.name}.`)}
              onVoidPayment={(id, r) => act(() => voidProcurementPayment(id, r), 'Đã hủy lần trả tiền, số còn phải trả được tính lại.')}
              onVoid={(r) => act(() => voidProcurementReceipt(l.receipt_id, r), 'Đã hủy phiếu thu mua.')} />)}
          </Collapsible>
        );
      })}
      <label className="check"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Hiện cả phiếu đã thanh toán đủ</label>
      {rows !== null && rows.length > 0 && (
        <button type="button" className="secondary" onClick={() => exportCsv(rows, as)}>Xuất CSV</button>
      )}
      <p className="muted">Báo cáo tổng hợp theo hộ, sản phẩm, tháng: vào Báo cáo → "Thu mua / bán cho HTX".</p>
    </>
  );
}

function ReceiptCard({ line: l, as, ownName, canEdit, busy, onPay, onVoidPayment, onVoid }: {
  line: ProcLine; as: 'coop' | 'household'; ownName: string; canEdit: boolean; busy: boolean;
  onPay: (i: import('../lib/partners').PayInput) => Promise<boolean>; onVoidPayment: (id: string, reason: string) => Promise<boolean>; onVoid: (reason: string) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [pays, setPays] = useState<ProcPayment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loadPays = useCallback(async () => { try { setPays(await listProcurementPayments(l.receipt_id)); setErr(null); } catch (e) { setErr(friendlyError(e)); } }, [l.receipt_id]);
  useEffect(() => { if (panel === 'history') void loadPays(); }, [panel, loadPays]);
  return (
    <div className="card slim">
      <div className="row">
        <strong className="grow">{l.invoice_no ? `Phiếu ${l.invoice_no}` : 'Phiếu thu mua'} · {fmtDate(l.receipt_date)}</strong>
        <span className={pillClass(l.status)}>{PROC_STATUS_LABEL[l.status]}</span>
      </div>
      <p className="muted">{l.crop_name ? `${l.crop_name} · ` : ''}{formatQty(l.quantity)} kg × {formatMoney(l.unit_price)}/kg{l.due_date ? ` · hạn trả ${fmtDate(l.due_date)}` : ''}</p>
      {l.note && <p className="muted">{l.note}</p>}
      <p>Tổng {formatMoney(l.total_amount)} · Đã trả {formatMoney(l.paid)} · <strong>Còn {as === 'coop' ? 'phải trả' : 'phải thu'} {formatMoney(l.remaining)}</strong></p>
      <div className="actions">
        {canEdit && l.remaining > 0 && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>Ghi trả tiền</button>}
        <button className="secondary" onClick={() => setPanel(panel === 'history' ? null : 'history')}>Các lần trả</button>
        <button className="secondary" onClick={() => printReceipt(l, as, ownName)}>In phiếu</button>
        {canEdit && l.paid === 0 && <button className="secondary" disabled={busy} onClick={() => {
          const r = window.prompt('Lý do hủy phiếu thu mua này? (ví dụ: nhập nhầm khối lượng)');
          if (r && r.trim()) void onVoid(r.trim());
        }}>Hủy phiếu</button>}
      </div>
      {panel === 'pay' && (
        <PayForm label="Trả tiền cho hộ" max={l.remaining} busy={busy} amountLabel="Số tiền trả (đ)" dateLabel="Ngày trả" submitLabel="Ghi trả tiền"
          onSave={async (i) => { const ok = await onPay(i); if (ok) setPanel(null); return ok; }} />
      )}
      {panel === 'history' && (
        <div>
          {err && <p className="msg error" role="alert">{err}</p>}
          {pays === null && !err && <p className="muted">Đang tải…</p>}
          {pays !== null && pays.length === 0 && <p className="muted">Chưa có lần trả nào.</p>}
          {pays?.map((p) => (
            <p key={p.id} className={p.voided_at ? 'muted' : ''}>
              {fmtDate(p.paid_on)} · {formatMoney(p.amount)} · {p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}{p.note ? ` · ${p.note}` : ''}
              {p.voided_at ? <span className="pill err"> Đã hủy: {p.void_reason}</span> : canEdit && (
                <button className="link inline" disabled={busy} onClick={() => {
                  const r = window.prompt('Lý do hủy lần trả này? (ví dụ: ghi nhầm số tiền)');
                  if (r && r.trim()) void onVoidPayment(p.id, r.trim()).then(() => loadPays());
                }}>Hủy lần trả</button>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function NewReceiptForm({ coopId, busy, onRun, onDone, onCancel }: {
  coopId: string; busy: boolean; onCancel: () => void; onDone: () => void; onRun: (fn: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'manual' | 'harvest'>('harvest');   // mặc định lập từ phiếu thu hoạch của hộ
  const [harvests, setHarvests] = useState<UnpurchasedHarvest[] | null>(null);
  const [harvShared, setHarvShared] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const ids = useRef(new Map<string, string>());   // mã phiếu cố định cho từng phiếu thu hoạch: bấm Lưu lặp không lập hai phiếu
  const [households, setHouseholds] = useState<CoopHousehold[]>([]);
  const [items, setItems] = useState<ProcurementRow[]>([]);
  const [cycles, setCycles] = useState<HouseholdCycleOverview[]>([]);
  const [hh, setHh] = useState('');
  const [crop, setCrop] = useState('');
  const [cycle, setCycle] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [due, setDue] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [draftId] = useState(() => crypto.randomUUID());   // bấm Lưu lặp không lập hai phiếu

  useEffect(() => {
    listCoopHouseholds(coopId).then((h) => setHouseholds(h)).catch((e) => setErr(friendlyError(e)));
    listProcurementItems(coopId).then((r) => setItems(r.filter((x) => x.is_active))).catch(() => undefined);
  }, [coopId]);
  useEffect(() => {
    setCycles([]); setCycle('');
    if (!hh) return;
    coopHouseholdOverview(coopId, hh).then((d) => setCycles(d.cycles)).catch(() => setCycles([]));   // chỉ có khi hộ cho xem sản xuất
  }, [coopId, hh]);

  useEffect(() => {
    setHarvests(null); setPicked(new Set());
    if (!hh || mode !== 'harvest') return;
    fetchUnpurchasedHarvests(coopId, hh).then((d) => { setHarvests(d.harvests); setHarvShared(d.shared); }).catch((e) => setErr(friendlyError(e)));
  }, [coopId, hh, mode]);

  function pickCrop(id: string) {
    setCrop(id);
    const it = items.find((x) => x.crop_type_id === id);
    if (it?.ref_price_per_kg != null && !price) setPrice(String(it.ref_price_per_kg));
  }
  const q = parseNumber(qty), p = parseNumber(price);
  const amount = q && p ? Math.round(q * p) : 0;

  function submit() {
    setErr(null);
    if (!hh) return setErr('Hãy chọn hộ bán.');
    if (mode === 'harvest') {
      if (picked.size === 0) return setErr('Hãy chọn ít nhất một phiếu thu hoạch.');
      if (p === null || p < 0) return setErr('Hãy nhập đơn giá (đồng/kg).');
      const chosen = (harvests ?? []).filter((h) => picked.has(h.id));
      void onRun(async () => {
        for (const h of chosen) {
          if (!ids.current.has(h.id)) ids.current.set(h.id, crypto.randomUUID());
          await createReceiptFromHarvest(ids.current.get(h.id)!, coopId, h.id, Math.round(p), due || null, invoice.trim(), note.trim());
        }
      }, `Đã lập ${chosen.length} phiếu thu mua từ phiếu thu hoạch.`).then((ok) => { if (ok) onDone(); });
      return;
    }
    if (!q || q <= 0) return setErr('Hãy nhập khối lượng (kg) lớn hơn 0.');
    if (p === null || p < 0) return setErr('Hãy nhập đơn giá (đồng/kg).');
    if (date > todayLocal()) return setErr('Ngày thu mua không được sau ngày hôm nay.');
    if (due && due < date) return setErr('Hạn trả tiền không được trước ngày thu mua.');
    void onRun(() => createProcurementReceipt({ id: draftId, coopId, householdId: hh, cycleId: cycle || null, cropId: crop || null, date, quantity: q, unitPrice: Math.round(p), dueDate: due || null, invoiceNo: invoice.trim(), note: note.trim() }),
      'Đã lập phiếu thu mua.').then((ok) => { if (ok) onDone(); });
  }

  return (
    <div className="inline-form">
      <strong>Lập phiếu thu mua</strong>
      <label>Hộ bán
        <select value={hh} onChange={(e) => setHh(e.target.value)}>
          <option value="">— Chọn hộ —</option>
          {households.map((h) => <option key={h.household_org_id} value={h.household_org_id}>{h.name}</option>)}
        </select>
      </label>
      <div className="chips" role="tablist" aria-label="Cách lập phiếu">
        <button type="button" role="tab" aria-selected={mode === 'harvest'} className={mode === 'harvest' ? 'chip active' : 'chip'} onClick={() => setMode('harvest')}>Từ phiếu thu hoạch của hộ</button>
        <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'chip active' : 'chip'} onClick={() => setMode('manual')}>Nhập tay</button>
      </div>
      {mode === 'harvest' && hh && (
        <>
          {harvests === null && !err && <p className="muted">Đang tải phiếu thu hoạch…</p>}
          {harvests !== null && !harvShared && <p className="msg warn" role="status">Hộ chưa cho HTX xem dữ liệu sản xuất nên chưa lấy được phiếu thu hoạch. Có thể lập phiếu bằng cách nhập tay.</p>}
          {harvests !== null && harvShared && harvests.length === 0 && <p className="muted">Hộ không còn phiếu thu hoạch nào chưa thu mua.</p>}
          {(harvests ?? []).map((h) => (
            <label key={h.id} className="check">
              <input type="checkbox" checked={picked.has(h.id)} onChange={(e) => setPicked((s0) => { const n = new Set(s0); if (e.target.checked) n.add(h.id); else n.delete(h.id); return n; })} />
              {fmtDate(h.harvested_at)} · {h.crop_name} · {formatQty(h.quantity)} kg{h.grade ? ` · loại ${h.grade}` : ''}{h.lot_code ? ` · lô ${h.lot_code}` : ''} · {h.cycle_name}
            </label>
          ))}
          {picked.size > 0 && (() => {
            const kg = (harvests ?? []).filter((h) => picked.has(h.id)).reduce((t, h) => t + h.quantity, 0);
            return <p><strong>{picked.size} phiếu · {formatQty(kg)} kg{p ? ` · thành tiền ${formatMoney(Math.round(kg * p))}` : ''}</strong></p>;
          })()}
          <label>Đơn giá (đ/kg, áp cho các phiếu đã chọn)<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <div className="pair">
            <label>Hạn trả tiền<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label>Số phiếu (nếu có)<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></label>
          </div>
          <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        </>
      )}
      {mode === 'manual' && <>
      <label>Sản phẩm
        <select value={crop} onChange={(e) => pickCrop(e.target.value)}>
          <option value="">— Không chọn —</option>
          {items.map((i) => <option key={i.crop_type_id} value={i.crop_type_id}>{i.crop_types?.name ?? ''}</option>)}
        </select>
      </label>
      {cycles.length > 0 && (
        <label>Vụ của hộ (để truy xuất nguồn gốc, có thể bỏ trống)
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="">— Không chọn —</option>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.crop}</option>)}
          </select>
        </label>
      )}
      <div className="pair">
        <label>Khối lượng (kg)<input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>Đơn giá (đ/kg)<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      </div>
      {amount > 0 && <p><strong>Thành tiền {formatMoney(amount)}</strong></p>}
      <div className="pair">
        <label>Ngày thu mua<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Hạn trả tiền<input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <label>Số phiếu (nếu có)<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></label>
      <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: loại A, đã cân tại kho HTX" /></label>
      </>}
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={submit}>Lưu phiếu</button>
        <button type="button" className="secondary" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = { overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', ok: 'Còn hạn', paid: 'Đã trả đủ' };

function exportCsv(rows: ProcLine[], as: 'coop' | 'household') {
  const cell = (v: string | number | null | undefined) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t; };
  const head = [as === 'coop' ? 'Hộ' : 'Hợp tác xã', 'Ngày', 'Số phiếu', 'Sản phẩm', 'Khối lượng (kg)', 'Đơn giá', 'Thành tiền', as === 'coop' ? 'Đã trả' : 'Đã nhận', as === 'coop' ? 'Còn phải trả' : 'Còn phải thu', 'Hạn trả', 'Tình trạng', 'Ghi chú'];
  const lines = rows.map((r) => [r.partner_name, r.receipt_date, r.invoice_no, r.crop_name, r.quantity, r.unit_price, r.total_amount, r.paid, r.remaining, r.due_date, STATUS_TEXT[r.status] ?? r.status, r.note].map(cell).join(','));
  downloadCsv('thu-mua.csv', '\uFEFF' + [head.map(cell).join(','), ...lines].join('\n'));
}

/** In phiếu thu mua: mở trang in đơn giản (bên mua, bên bán, khối lượng, đơn giá, thành tiền, đã trả, còn lại) */
function printReceipt(l: ProcLine, as: 'coop' | 'household', ownName: string) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const buyer = as === 'coop' ? ownName : l.partner_name;
  const seller = as === 'coop' ? l.partner_name : ownName;
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu thu mua</title>
<style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;color:#111}h1{text-align:center;font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 4px;border-bottom:1px solid #ccc}td:first-child{color:#555;width:42%}.sign{display:flex;justify-content:space-between;margin-top:48px;text-align:center}.sign div{width:45%}@media print{button{display:none}}</style></head><body>
<h1>PHIẾU THU MUA${l.invoice_no ? ' số ' + esc(l.invoice_no) : ''}</h1>
<table>
<tr><td>Bên mua (HTX)</td><td>${esc(buyer)}</td></tr>
<tr><td>Bên bán (hộ)</td><td>${esc(seller)}</td></tr>
<tr><td>Ngày thu mua</td><td>${fmtDate(l.receipt_date)}</td></tr>
<tr><td>Sản phẩm</td><td>${esc(l.crop_name ?? '')}</td></tr>
<tr><td>Khối lượng</td><td>${formatQty(l.quantity)} kg</td></tr>
<tr><td>Đơn giá</td><td>${formatMoney(l.unit_price)}/kg</td></tr>
<tr><td>Thành tiền</td><td><strong>${formatMoney(l.total_amount)}</strong></td></tr>
<tr><td>Đã thanh toán</td><td>${formatMoney(l.paid)}</td></tr>
<tr><td>Còn lại</td><td><strong>${formatMoney(l.remaining)}</strong>${l.due_date ? ' (hạn ' + fmtDate(l.due_date) + ')' : ''}</td></tr>
${l.note ? '<tr><td>Ghi chú</td><td>' + esc(l.note) + '</td></tr>' : ''}
</table>
<div class="sign"><div>Người bán<br><br><br><br>(ký, ghi họ tên)</div><div>Đại diện HTX<br><br><br><br>(ký, ghi họ tên)</div></div>
<p style="text-align:center;margin-top:32px"><button onclick="window.print()">In phiếu</button></p>
</body></html>`);
  w.document.close();
}
