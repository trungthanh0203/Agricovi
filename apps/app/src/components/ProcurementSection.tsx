import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile, shortMoney } from './HomeStats';
import { Img, ImagePicker } from './ImagePicker';
import { PayForm, pillClass } from './PayablesSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline, todayLocal } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { coopHouseholdOverview, listCoopHouseholds, listProcurementItems, type CoopHousehold, type HouseholdCycleOverview, type ProcurementRow } from '../lib/members';
import { useOrgs } from '../lib/orgs';
import { downloadCsv } from '../lib/summary';
import { canPerm } from '../lib/permissions';
import type { TabId } from '../lib/tabs';
import { contractPriceFor, fetchContracts, type TradeContract } from '../lib/tradeContracts';
import {
  createProcurementReceipt, createReceiptFromHarvest, fetchProcurementLedger, fetchUnpurchasedHarvests, type UnpurchasedHarvest, listProcurementPayments, payProcurement, PROC_STATUS_LABEL,
  setProcurementAttachment, voidProcurementPayment, voidProcurementReceipt, type ProcLine, type ProcPayment,
} from '../lib/procurement';

/**
 * Thu mua từ hộ (D149, sửa ở D162). HTX (as="coop"): lập phiếu thu mua của hộ thành viên, ghi trả tiền, hủy kèm lý do; công nợ HTX còn phải trả hộ.
 * Hộ (as="household"): chỉ xem các phiếu HTX đã mua và còn phải thu. Hai bên cùng thấy một sổ nên tiền không lệch.
 * Hai nơi dùng: view="entry" ở Sản xuất → Thu mua từ hộ (LẬP phiếu, việc hằng ngày ở điểm thu mua) và view="ledger" ở Báo cáo → Công nợ (THEO DÕI tiền: chưa trả, quá hạn, trả tiền).
 */
export function ProcurementSection({ as, view = 'ledger', onGo }: { as: 'coop' | 'household'; view?: 'ledger' | 'entry'; onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id;
  const [rows, setRows] = useState<ProcLine[] | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entry = view === 'entry';

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchProcurementLedger(orgId, as, entry ? false : !showPaid)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, as, showPaid, entry]);
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
  // màn lập phiếu: các phiếu mới nhất của mọi hộ (không gom theo hộ)
  const recent = useMemo(() => [...(rows ?? [])].sort((a, b) => b.receipt_date.localeCompare(a.receipt_date) || a.partner_name.localeCompare(b.partner_name, 'vi')).slice(0, 15), [rows]);

  if (!active || !orgId) return null;
  const canEdit = as === 'coop' && canPerm(active.perms, 'coop', 'edit');
  const owed = (rows ?? []).reduce((s, r) => s + r.remaining, 0);
  const overdue = (rows ?? []).filter((r) => r.status === 'overdue').reduce((s, r) => s + r.remaining, 0);
  const total = (rows ?? []).reduce((s, r) => s + r.total_amount, 0);

  async function act(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true); setError(null); setOk(null);
    try { await fn(); setOk(done); await load(); return true; } catch (e) { setError(friendlyError(e)); await load(); return false; } finally { setBusy(false); }
  }
  const card = (l: ProcLine, name: string) => (
    <ReceiptCard key={l.receipt_id} line={l} as={as} ownName={active.name} canEdit={canEdit} busy={busy || !online}
      onPay={(i) => act(() => payProcurement(l.receipt_id, i), `Đã ghi trả ${formatMoney(i.amount)} cho ${name}.`)}
      onVoidPayment={(id, r) => act(() => voidProcurementPayment(id, r), 'Đã hủy lần trả tiền, số còn phải trả được tính lại.')}
      onVoid={(r) => act(() => voidProcurementReceipt(l.receipt_id, r), 'Đã hủy phiếu thu mua.')}
      onAttach={(img) => act(() => setProcurementAttachment(l.receipt_id, img), img ? 'Đã đính ảnh chứng từ.' : 'Đã gỡ ảnh chứng từ.')} />
  );

  return (
    <>
      <p className="muted">
        {entry
          ? 'Lập phiếu khi hộ giao hàng: chọn hộ, chọn các phiếu thu hoạch của hộ, nhập số HTX cân thực tế và đơn giá. Theo dõi tiền còn phải trả, quá hạn và ghi trả tiền ở Báo cáo → Công nợ.'
          : as === 'coop'
            ? 'Theo dõi tiền HTX còn phải trả hộ thành viên, ghi trả tiền, hủy phiếu. Số tiền này là giao dịch giữa HTX và hộ, không tính vào chi phí/doanh thu của vụ. Hộ cũng thấy phiếu của mình.'
            : 'Các phiếu HTX đã mua sản phẩm của hộ và số tiền HTX còn phải trả cho hộ. Chỉ HTX ghi phiếu và ghi trả tiền; hộ chỉ xem để đối chiếu.'}
      </p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      {entry && canEdit && <button className="primary" disabled={!online || adding} onClick={() => setAdding(true)}>+ Lập phiếu thu mua</button>}
      {entry && adding && canEdit && <NewReceiptForm coopId={orgId} busy={busy} onCancel={() => setAdding(false)} onRun={act} onDone={() => setAdding(false)} />}
      {!entry && canEdit && onGo && (
        <p className="muted">Lập phiếu thu mua mới ở <button type="button" className="link inline" onClick={() => onGo('production', 'procure')}>Sản xuất → Thu mua từ hộ</button>.</p>
      )}

      {!entry && rows !== null && rows.length > 0 && (
        <div className="kpis">
          <KpiTile label={as === 'coop' ? 'HTX còn phải trả' : 'HTX còn phải trả hộ'} value={shortMoney(owed)} title={formatMoney(owed)} tone={owed > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Quá hạn" value={shortMoney(overdue)} title={formatMoney(overdue)} tone={overdue > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Tổng giá trị phiếu" value={shortMoney(total)} title={formatMoney(total)} />
        </div>
      )}
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Cần có mạng để xem phiếu thu mua.'}</p>}
      {rows !== null && rows.length === 0 && <p className="muted">{entry ? 'Chưa có phiếu thu mua nào.' : showPaid ? 'Chưa có phiếu thu mua nào.' : 'Không còn khoản nào chưa thanh toán.'}</p>}

      {entry && recent.length > 0 && (
        <>
          <h2 className="sect">Phiếu mới lập</h2>
          {recent.map((l) => (<div key={l.receipt_id}><p className="muted"><strong>{l.partner_name}</strong></p>{card(l, l.partner_name)}</div>))}
        </>
      )}
      {!entry && groups.map((g) => {
        const open = g.lines.reduce((s, l) => s + l.remaining, 0);
        const late = g.lines.filter((l) => l.status === 'overdue').length;
        return (
          <Collapsible key={g.id} title={g.name} summary={`Còn ${as === 'coop' ? 'phải trả' : 'phải thu'} ${formatMoney(open)}${late > 0 ? ` · ${late} phiếu quá hạn` : ''}`} warn={late > 0} defaultOpen={late > 0}>
            {g.lines.map((l) => card(l, g.name))}
          </Collapsible>
        );
      })}
      {!entry && <label className="check"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Hiện cả phiếu đã thanh toán đủ</label>}
      {!entry && rows !== null && rows.length > 0 && (
        <button type="button" className="secondary" onClick={() => exportCsv(rows, as)}>Xuất CSV</button>
      )}
      <p className="muted">Báo cáo tổng hợp theo hộ, sản phẩm, tháng: vào Báo cáo → "Thu mua / bán cho HTX".</p>
    </>
  );
}

function ReceiptCard({ line: l, as, ownName, canEdit, busy, onPay, onVoidPayment, onVoid, onAttach }: {
  line: ProcLine; as: 'coop' | 'household'; ownName: string; canEdit: boolean; busy: boolean;
  onPay: (i: import('../lib/partners').PayInput) => Promise<boolean>; onVoidPayment: (id: string, reason: string) => Promise<boolean>; onVoid: (reason: string) => Promise<boolean>;
  onAttach: (img: string | null) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<'pay' | 'history' | 'photo' | null>(null);
  const [pays, setPays] = useState<ProcPayment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loadPays = useCallback(async () => { try { setPays(await listProcurementPayments(l.receipt_id)); setErr(null); } catch (e) { setErr(friendlyError(e)); } }, [l.receipt_id]);
  useEffect(() => { if (panel === 'history') void loadPays(); }, [panel, loadPays]);
  const diff = l.harvest_qty != null ? l.quantity - l.harvest_qty : 0;
  return (
    <div className="card slim">
      <div className="row">
        <strong className="grow">{l.invoice_no ? `Phiếu ${l.invoice_no}` : 'Phiếu thu mua'} · {fmtDate(l.receipt_date)}</strong>
        <span className={pillClass(l.status)}>{PROC_STATUS_LABEL[l.status]}</span>
      </div>
      <p className="muted">{l.crop_name ? `${l.crop_name} · ` : ''}{formatQty(l.quantity)} kg × {formatMoney(l.unit_price)}/kg{l.due_date ? ` · hạn trả ${fmtDate(l.due_date)}` : ''}</p>
      {l.harvest_qty != null && Math.abs(diff) > 0.05 && (
        <p className="muted">Hộ ghi {formatQty(l.harvest_qty)} kg, HTX cân {formatQty(l.quantity)} kg ({diff > 0 ? '+' : '−'}{formatQty(Math.abs(diff))} kg).</p>
      )}
      {l.note && <p className="muted">{l.note}</p>}
      <p>Tổng {formatMoney(l.total_amount)} · Đã trả {formatMoney(l.paid)} · <strong>Còn {as === 'coop' ? 'phải trả' : 'phải thu'} {formatMoney(l.remaining)}</strong></p>
      <div className="actions">
        {canEdit && l.remaining > 0 && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>Ghi trả tiền</button>}
        <button className="secondary" onClick={() => setPanel(panel === 'history' ? null : 'history')}>Các lần trả</button>
        {as === 'coop' && (l.attachment || canEdit) && <button className="secondary" onClick={() => setPanel(panel === 'photo' ? null : 'photo')}>{l.attachment ? '🖼 Ảnh chứng từ' : '＋ Ảnh chứng từ'}</button>}
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
      {panel === 'photo' && (
        <div>
          {l.attachment && <Img value={l.attachment} size="f" alt="Ảnh chứng từ" className="proc-photo" />}
          {canEdit && <ImagePicker store="receipts" label={l.attachment ? 'Đổi ảnh chứng từ' : 'Chụp / chọn ảnh chứng từ (phiếu cân, biên nhận)'} value={l.attachment ?? ''} disabled={busy} onChange={(v) => void onAttach(v || null)} />}
          <p className="muted">Ảnh chỉ HTX xem được, dùng để đối chiếu khi cần; số liệu trên phiếu vẫn là số đã nhập.</p>
        </div>
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

interface Pick { qty: string; price: string; keep: boolean; /** đơn giá lấy từ hợp đồng (số hợp đồng) để nhắc người lập phiếu */ contractNo?: string }
const netOf = (h: UnpurchasedHarvest) => Math.max(h.quantity - h.loss_quantity, 0);
const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam

function NewReceiptForm({ coopId, busy, onRun, onDone, onCancel }: {
  coopId: string; busy: boolean; onCancel: () => void; onDone: () => void; onRun: (fn: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'manual' | 'harvest'>('harvest');   // mặc định lập từ phiếu thu hoạch của hộ
  const [harvests, setHarvests] = useState<UnpurchasedHarvest[] | null>(null);
  const [harvShared, setHarvShared] = useState(true);
  const [picked, setPicked] = useState<Record<string, Pick>>({});
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
  const [image, setImage] = useState('');
  const [contracts, setContracts] = useState<TradeContract[]>([]);   // hợp đồng bao tiêu đã ký: gợi ý đơn giá
  const [err, setErr] = useState<string | null>(null);
  const [draftId] = useState(() => crypto.randomUUID());   // bấm Lưu lặp không lập hai phiếu

  useEffect(() => {
    listCoopHouseholds(coopId).then((h) => setHouseholds(h)).catch((e) => setErr(friendlyError(e)));
    listProcurementItems(coopId).then((r) => setItems(r.filter((x) => x.is_active))).catch(() => undefined);
    fetchContracts(coopId).then(setContracts).catch(() => undefined);   // chưa có hợp đồng hoặc chưa db push 0202: bỏ qua
  }, [coopId]);
  useEffect(() => {
    setCycles([]); setCycle('');
    if (!hh) return;
    coopHouseholdOverview(coopId, hh).then((d) => setCycles(d.cycles)).catch(() => setCycles([]));   // chỉ có khi hộ cho xem sản xuất
  }, [coopId, hh]);

  useEffect(() => {
    setHarvests(null); setPicked({});
    if (!hh || mode !== 'harvest') return;
    fetchUnpurchasedHarvests(coopId, hh).then((d) => { setHarvests(d.harvests); setHarvShared(d.shared); }).catch((e) => setErr(friendlyError(e)));
  }, [coopId, hh, mode]);

  const refPrice = (cropTypeId: string) => items.find((x) => x.crop_type_id === cropTypeId)?.ref_price_per_kg ?? null;
  function pickCrop(id: string) {
    setCrop(id);
    const r = refPrice(id);
    if (r != null && !price) setPrice(String(r));
  }
  function togglePick(h: UnpurchasedHarvest, on: boolean) {
    setPicked((s) => {
      const n = { ...s };
      if (!on) { delete n[h.id]; return n; }
      const first = Object.values(s)[0];
      const ref = refPrice(h.crop_type_id);
      const ct = contractPriceFor(contracts, hh, h.crop_type_id, todayLocal());   // hợp đồng đã ký ưu tiên hơn giá tham khảo
      n[h.id] = { qty: String(netOf(h)), price: ct ? String(ct.price) : ref != null ? String(ref) : first?.price ?? '', keep: false, contractNo: ct?.contractNo };
      return n;
    });
  }
  const setPick = (id: string, patch: Partial<Pick>) => setPicked((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));
  const q = parseNumber(qty), p = parseNumber(price);
  const amount = q && p ? Math.round(q * p) : 0;
  const chosen = (harvests ?? []).filter((h) => picked[h.id]);
  const sum = chosen.reduce((t, h) => { const x = picked[h.id]!; const a = parseNumber(x.qty), b = parseNumber(x.price); return { kg: t.kg + (a ?? 0), money: t.money + (a && b ? Math.round(a * b) : 0) }; }, { kg: 0, money: 0 });

  function submit() {
    setErr(null);
    if (!hh) return setErr('Hãy chọn hộ bán.');
    if (date > todayLocal()) return setErr('Ngày thu mua không được sau ngày hôm nay.');
    if (due && due < date) return setErr('Hạn trả tiền không được trước ngày thu mua.');
    if (mode === 'harvest') {
      if (chosen.length === 0) return setErr('Hãy chọn ít nhất một phiếu thu hoạch.');
      for (const h of chosen) {
        const x = picked[h.id]!;
        const a = parseNumber(x.qty), b = parseNumber(x.price);
        const label = `${fmtDate(h.harvested_at)} · ${h.crop_name}`;
        if (a === null || a <= 0) return setErr(`Phiếu ${label}: hãy nhập số kg HTX cân thực tế (lớn hơn 0).`);
        if (b === null || b < 0) return setErr(`Phiếu ${label}: hãy nhập đơn giá (đồng/kg).`);
        if (date < dayOf(h.harvested_at)) return setErr(`Ngày thu mua không được trước ngày thu hoạch (${fmtDate(h.harvested_at)}).`);
      }
      void onRun(async () => {
        for (const h of chosen) {
          if (!ids.current.has(h.id)) ids.current.set(h.id, crypto.randomUUID());
          const x = picked[h.id]!;
          await createReceiptFromHarvest({
            id: ids.current.get(h.id)!, coopId, harvestId: h.id, unitPrice: Math.round(parseNumber(x.price)!), dueDate: due || null, invoiceNo: invoice.trim(), note: note.trim(),
            quantity: parseNumber(x.qty)!, close: !x.keep, date, attachment: image || null,
          });
        }
      }, `Đã lập ${chosen.length} phiếu thu mua từ phiếu thu hoạch.`).then((ok) => { if (ok) onDone(); });
      return;
    }
    if (!q || q <= 0) return setErr('Hãy nhập khối lượng (kg) lớn hơn 0.');
    if (p === null || p < 0) return setErr('Hãy nhập đơn giá (đồng/kg).');
    void onRun(async () => {
      await createProcurementReceipt({ id: draftId, coopId, householdId: hh, cycleId: cycle || null, cropId: crop || null, date, quantity: q, unitPrice: Math.round(p), dueDate: due || null, invoiceNo: invoice.trim(), note: note.trim() });
      if (image) await setProcurementAttachment(draftId, image);
    }, 'Đã lập phiếu thu mua.').then((ok) => { if (ok) onDone(); });
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
          {harvests !== null && harvShared && harvests.length === 0 && <p className="muted">Hộ không còn phiếu thu hoạch nào chưa thu mua xong.</p>}
          {(harvests ?? []).map((h) => {
            const x = picked[h.id];
            const a = x ? parseNumber(x.qty) : null;
            const net = netOf(h);
            return (
              <div key={h.id}>
                <label className="check">
                  <input type="checkbox" checked={Boolean(x)} onChange={(e) => togglePick(h, e.target.checked)} />
                  {fmtDate(h.harvested_at)} · {h.crop_name} · hộ ghi {formatQty(h.quantity)} kg{h.loss_quantity > 0 ? ` (hao hụt ${formatQty(h.loss_quantity)}, còn ${formatQty(net)})` : ''}{h.grade ? ` · loại ${h.grade}` : ''}{h.lot_code ? ` · lô ${h.lot_code}` : ''} · {h.cycle_name}{h.purchased_qty > 0 ? ` · đã mua ${formatQty(h.purchased_qty)} kg` : ''}
                </label>
                {x && (
                  <div className="inline-form">
                    <div className="pair">
                      <label>Số kg HTX cân thực tế<input inputMode="decimal" value={x.qty} onChange={(e) => setPick(h.id, { qty: e.target.value })} /></label>
                      <label>Đơn giá (đ/kg){x.contractNo ? <span className="muted"> · theo hợp đồng {x.contractNo}</span> : refPrice(h.crop_type_id) != null && <span className="muted"> · giá tham khảo {formatMoney(refPrice(h.crop_type_id)!)}</span>}<input inputMode="numeric" value={x.price} onChange={(e) => setPick(h.id, { price: e.target.value })} /></label>
                    </div>
                    {a !== null && a > 0 && Math.abs(a - net) > 0.05 && <p className="muted">Hộ ghi còn {formatQty(net)} kg, HTX cân {formatQty(a)} kg ({a > net ? '+' : '−'}{formatQty(Math.abs(a - net))} kg).</p>}
                    <label className="check"><input type="checkbox" checked={x.keep} onChange={(e) => setPick(h.id, { keep: e.target.checked })} /> Hộ còn hàng, chưa mua hết (giữ lại để mua tiếp sau)</label>
                  </div>
                )}
              </div>
            );
          })}
          {chosen.length > 0 && <p><strong>{chosen.length} phiếu · {formatQty(sum.kg)} kg{sum.money > 0 ? ` · thành tiền ${formatMoney(sum.money)}` : ''}</strong></p>}
          <div className="pair">
            <label>Ngày thu mua<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Hạn trả tiền<input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} /></label>
          </div>
          <label>Số phiếu<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} placeholder="Để trống: tự đánh số (TM-năm-0001)" /></label>
          <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
          <ImagePicker store="receipts" label="Ảnh chứng từ: phiếu cân, biên nhận (không bắt buộc)" value={image} onChange={setImage} disabled={busy} />
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
      <label>Số phiếu<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} placeholder="Để trống: tự đánh số (TM-năm-0001)" /></label>
      <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: loại A, đã cân tại kho HTX" /></label>
      <ImagePicker store="receipts" label="Ảnh chứng từ: phiếu cân, biên nhận (không bắt buộc)" value={image} onChange={setImage} disabled={busy} />
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
