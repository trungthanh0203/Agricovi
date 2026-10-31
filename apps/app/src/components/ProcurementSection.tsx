import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile, shortMoney } from './HomeStats';
import { PayForm, pillClass } from './PayablesSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline, todayLocal } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { coopHouseholdOverview, listCoopHouseholds, listProcurementItems, type CoopHousehold, type HouseholdCycleOverview, type ProcurementRow } from '../lib/members';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import {
  createProcurementReceipt, fetchProcurementLedger, listProcurementPayments, payProcurement, PROC_STATUS_LABEL, voidProcurementPayment, voidProcurementReceipt,
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
      {adding && canEdit && <NewReceiptForm coopId={orgId} busy={busy} onCancel={() => setAdding(false)}
        onSave={async (r) => { const done = await act(() => createProcurementReceipt(r), 'Đã lập phiếu thu mua.'); if (done) setAdding(false); return done; }} />}

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
            {g.lines.map((l) => <ReceiptCard key={l.receipt_id} line={l} as={as} canEdit={canEdit} busy={busy || !online}
              onPay={(i) => act(() => payProcurement(l.receipt_id, i), `Đã ghi trả ${formatMoney(i.amount)} cho ${g.name}.`)}
              onVoidPayment={(id, r) => act(() => voidProcurementPayment(id, r), 'Đã hủy lần trả tiền, số còn phải trả được tính lại.')}
              onVoid={(r) => act(() => voidProcurementReceipt(l.receipt_id, r), 'Đã hủy phiếu thu mua.')} />)}
          </Collapsible>
        );
      })}
      <label className="check"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Hiện cả phiếu đã thanh toán đủ</label>
    </>
  );
}

function ReceiptCard({ line: l, as, canEdit, busy, onPay, onVoidPayment, onVoid }: {
  line: ProcLine; as: 'coop' | 'household'; canEdit: boolean; busy: boolean;
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

function NewReceiptForm({ coopId, busy, onSave, onCancel }: {
  coopId: string; busy: boolean; onCancel: () => void; onSave: (r: import('../lib/procurement').NewReceipt) => Promise<boolean>;
}) {
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
    if (!q || q <= 0) return setErr('Hãy nhập khối lượng (kg) lớn hơn 0.');
    if (p === null || p < 0) return setErr('Hãy nhập đơn giá (đồng/kg).');
    if (date > todayLocal()) return setErr('Ngày thu mua không được sau ngày hôm nay.');
    if (due && due < date) return setErr('Hạn trả tiền không được trước ngày thu mua.');
    void onSave({ id: draftId, coopId, householdId: hh, cycleId: cycle || null, cropId: crop || null, date, quantity: q, unitPrice: Math.round(p), dueDate: due || null, invoiceNo: invoice.trim(), note: note.trim() });
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
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={submit}>Lưu phiếu</button>
        <button type="button" className="secondary" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
