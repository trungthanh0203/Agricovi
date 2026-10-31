import { exportFinanceCsv, useFinanceTotals, type ExpenseTotals, type SaleTotals } from '../lib/financeTotals';
import { LoadOlder, useShowMore } from './ShowMore';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { Collapsible } from './Collapsible';
import { CustomerForm } from './CustomersSection';
import { useAuth } from '../lib/auth';
import { db, type SaleRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { editSale, recordSale, validateSale, voidSale } from '../lib/finance';
import { WithdrawalNotice, useWithdrawalBlocked } from './WithdrawalNotice';
import { validReason } from '../lib/withdrawalLogic';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { createCustomer, listCustomers, recordSaleWithCustomer, validateSaleCredit, type Customer } from '../lib/partners';
import { fmtDate } from '../lib/dates';
import { putLocal } from '../lib/serverWrite';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';
import { CycleWord } from './CycleWord';
import { areaPath, areaName } from '../lib/areas';
import { cycleTitle, formCycles } from '../lib/cycles';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/** Doanh thu bán hàng theo vụ (kg). Chỉ chủ và Kho & chi phí ghi/sửa/hủy; người khác chỉ xem. */
export function SalesSection() {
  const { session } = useAuth();
  const { active } = useOrgs();
  const online = useOnline();
  const sales = useTable('sales');
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();

  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [cycleFilter, setCycleFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const canWrite = canPerm(active?.perms, 'sales', 'edit');
  const ownCycles = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id), [cycles, active]);
  const cycleLabel = (id: string | null) => {
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')} · ${areaName(c.area_id, areas)}`;
  };

  const list = useMemo(
    () => sales
      .filter((s) => s.organization_id === active?.id)
      .filter((s) => !cycleFilter || s.cycle_id === cycleFilter)
      .filter((s) => (showVoided ? true : !s.voided_at))
      .sort((a, b) => b.sold_date.localeCompare(a.sold_date) || (b.received_at ?? '').localeCompare(a.received_at ?? '')),
    [sales, active, cycleFilter, showVoided],
  );
  const { visible: listShown, more: listMore } = useShowMore(list, `${cycleFilter}|${showVoided}`);
  const valid = list.filter((s) => !s.voided_at);
  // tổng tính ở máy chủ trên TOÀN BỘ lần bán (D142); chưa có thì tạm dùng số trên máy
  const srv = useFinanceTotals<SaleTotals>('sales', active?.id, cycleFilter, `${sales.length}|${sales.filter((s) => s.voided_at).length}`);
  const qty = srv ? Number(srv.quantity) : valid.reduce((s, r) => s + r.quantity, 0);
  const revenue = srv ? Number(srv.amount) : valid.reduce((s, r) => s + r.amount, 0);
  const totalN = srv ? srv.n : valid.length;
  const [csvBusy, setCsvBusy] = useState(false);

  async function confirmVoid(id: string) {
    if (reason.trim().length < 3) return setMsg('Hãy ghi lý do hủy (ít nhất 3 ký tự).');
    try {
      await voidSale(id, reason);
      setVoiding(null);
      setReason('');
      setMsg(null);
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  if (!active) return null;

  if (mode.kind !== 'list') {
    return (
      <SaleForm
        cycles={ownCycles.filter((c) => c.status !== 'cancelled')}
        cycleLabel={cycleLabel}
        editing={mode.kind === 'edit' ? sales.find((s) => s.id === mode.id) ?? null : null}
        userId={session?.user.id ?? ''}
        onClose={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <>
      {canWrite ? (
        <button className="primary" onClick={() => setMode({ kind: 'new' })} disabled={ownCycles.length === 0 || !online}>Ghi bán hàng</button>
      ) : (
        <p className="muted">Bạn chỉ được xem doanh thu. Chủ cơ sở cấp quyền nhập liệu cho từng người.</p>
      )}
      {canWrite && ownCycles.length === 0 && <p className="msg warn">Chưa có vụ nào. Hãy tạo vụ ở màn hình Sản xuất trước.</p>}

      <Collapsible inline title="Bộ lọc" summary={`${cycleFilter ? cycleLabel(cycleFilter) : 'Tất cả vụ'}${showVoided ? ' · cả khoản đã hủy' : ''}`}>
      <div className="filters">
          <label>
            <CycleWord cap />
            <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
              <option value="">Tất cả vụ</option>
              {ownCycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
            Hiện cả khoản đã hủy
          </label>
        </div>
      </Collapsible>

      <div className="card slim">
        <div className="row"><span>Đã bán</span><strong>{formatQty(qty)} kg</strong></div>
        <div className="row"><span>Doanh thu đã ghi</span><strong>{formatMoney(revenue)}</strong></div>
        {qty > 0 && <div className="row"><span>Giá bán trung bình</span><strong>{formatMoney(Math.round(revenue / qty))}/kg</strong></div>}
        <p className="muted">{totalN} lần bán chưa hủy (tính trên toàn bộ). Đây là doanh thu đã ghi nhận, chưa phải lợi nhuận.</p>
      </div>

      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Ghi, sửa và hủy cần có mạng.</p>}
      {msg && <p className="msg warn" role="status">{msg}</p>}
      {list.length === 0 && <p className="muted">Chưa ghi lần bán nào.</p>}

      {listShown.map((s) => (
        <div className={s.voided_at ? 'card slim voided' : 'card slim'} key={s.id}>
          <div className="row">
            <strong>{formatMoney(s.amount)}</strong>
            <span className="muted">{new Date(`${s.sold_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>
          </div>
          <p>{formatQty(s.quantity)} kg{s.quantity > 0 ? ` · ${formatMoney(Math.round(s.amount / s.quantity))}/kg` : ''}</p>
          <p className="muted">{cycleLabel(s.cycle_id)}</p>
          {s.buyer_note && <p>{s.buyer_note}</p>}
          <div className="badges">
            {s.version > 1 && !s.voided_at && <span className="pill">Đã chỉnh sửa</span>}
            {s.voided_at && <span className="pill err">Đã hủy</span>}
          </div>
          {s.voided_at && s.void_reason && <p className="muted">Lý do hủy: {s.void_reason}</p>}

          {canWrite && online && !s.voided_at && voiding !== s.id && (
            <div className="actions">
              <button className="secondary" onClick={() => setMode({ kind: 'edit', id: s.id })}>Sửa</button>
              <button className="secondary" onClick={() => { setVoiding(s.id); setReason(''); setMsg(null); }}>Hủy khoản bán</button>
            </div>
          )}
          {voiding === s.id && (
            <div className="inline-form">
              <label>
                Lý do hủy
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: ghi nhầm vụ" />
              </label>
              <p className="muted">Khoản bán không bị xóa, chỉ được đánh dấu đã hủy và không khôi phục được.</p>
              <div className="actions">
                <button className="secondary" onClick={() => void confirmVoid(s.id)}>Xác nhận hủy</button>
                <button className="link" onClick={() => setVoiding(null)}>Không hủy</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {listMore}
      <LoadOlder kind="sales" online={online} loaded={sales.length} />
      <button type="button" className="secondary" disabled={!online || csvBusy} onClick={async () => { setCsvBusy(true); try { await exportFinanceCsv('sales', active.id, cycleFilter, (id) => cycleLabel(id)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Không xuất được.'); } finally { setCsvBusy(false); } }}>{csvBusy ? 'Đang xuất…' : 'Xuất CSV tất cả'}</button>
    </>
  );
}

function SaleForm({ cycles, cycleLabel, editing, userId, onClose }: {
  cycles: { id: string; status: keyof typeof CYCLE_STATUS_LABEL_VI }[];
  cycleLabel: (id: string | null) => string;
  editing: SaleRow | null;
  userId: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const allCycles = useTable('cycles');
  const remembered = (() => { try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; } })();
  const [showAllCycles, setShowAllCycles] = useState(false);
  const ordered = [...formCycles(cycles, showAllCycles, editing?.cycle_id)].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));

  const [cycleId, setCycleId] = useState('');
  const [date, setDate] = useState(editing?.sold_date ?? todayLocal());
  const [qty, setQty] = useState(editing ? String(editing.quantity) : '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [buyer, setBuyer] = useState(editing?.buyer_note ?? '');
  const [wReason, setWReason] = useState('');
  // Khách hàng và công nợ phải thu (G2-4): chỉ khi ghi lần bán mới
  const { active } = useOrgs();
  const orgId = active?.id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [quickAdd, setQuickAdd] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [collectMode, setCollectMode] = useState<'full' | 'none' | 'part'>('full');
  const [partText, setPartText] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [due, setDue] = useState(''); // hạn thu tiền do người dùng tự nhập
  const [saved, setSaved] = useState<{ customer: string; amount: number; collected: number; due: string | null } | null>(null);
  const reloadCustomers = useCallback(async () => {
    if (!orgId || editing || !navigator.onLine) return;
    try { setCustomers((await listCustomers(orgId)).filter((c) => c.is_active)); } catch { /* không có quyền hoặc máy chủ chưa cập nhật: bán như thường, không chọn khách */ }
  }, [orgId, editing]);
  useEffect(() => { void reloadCustomers(); }, [reloadCustomers]);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  const effCycle = editing ? editing.cycle_id : cycleId || (ordered.find((c) => c.id === remembered)?.id ?? ordered[0]?.id ?? '');
  const q = parseNumber(qty);
  const a = parseNumber(amount);
  const inWithdrawal = useWithdrawalBlocked(effCycle, date);
  const perKg = q && q > 0 && a !== null && !Number.isNaN(a) ? Math.round(a / q) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bad = validateSale(q, a);
    if (bad) return setError(bad);
    const cycle = allCycles.find((c) => c.id === effCycle);
    if (!cycle) return setError('Hãy chọn vụ.');
    if (inWithdrawal && !editing && !validReason(wReason)) return setError('Vụ còn trong thời gian cách ly: hãy ghi lý do vẫn bán vào ngày này (ít nhất 3 ký tự), hoặc đổi sang ngày đã hết cách ly.');
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        await editSale(editing.id, { date, quantity: q!, amount: a!, buyerNote: buyer });
        onClose();
        return;
      }
      if (partnerId) {
        const partName = customers.find((c) => c.id === partnerId)?.name ?? '';
        const part = parseNumber(partText);
        const collected = collectMode === 'full' ? a! : collectMode === 'none' ? 0 : part === null || Number.isNaN(part) ? NaN : part;
        const credit = {
          id: draftId, orgId: cycle.owner_org_id, cycleId: cycle.id, date, quantity: q!, amount: a!, buyerNote: buyer.trim() || partName, partnerId,
          invoiceNo: invoice, dueDate: due || null, collected, method, withdrawalReason: inWithdrawal ? wReason : undefined,
        };
        const badCredit = validateSaleCredit(credit, todayLocal());
        if (badCredit) { setError(badCredit); return; }
        const row = await recordSaleWithCustomer(credit);
        await putLocal('sales_records', row);
        setSaved({ customer: partName, amount: a!, collected, due: due || null });
        setSavedId(draftId);
        return;
      }
      setSavedId(await recordSale({ id: draftId, cycle, date, quantity: q!, amount: a!, buyerNote: buyer, userId, withdrawalReason: inWithdrawal ? wReason : undefined }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSavedId(null);
    setDraftId(crypto.randomUUID());
    setQty('');
    setAmount('');
    setBuyer('');
    setInvoice('');
    setCollectMode('full');
    setPartText('');
    setDue('');
    setSaved(null);
    setWReason('');
    setError(null);
  }

  if (savedId) {
    return (
      <section>
        <h1>Đã ghi bán hàng</h1>
        <p className="msg ok" role="status">Đã lưu lên máy chủ.</p>
        {saved && (saved.amount - saved.collected > 0
          ? <p className="msg warn" role="status">{saved.customer} còn nợ {formatMoney(saved.amount - saved.collected)}{saved.due ? `, hạn thu ${fmtDate(saved.due)}` : ''}. Xem ở Báo cáo → Công nợ → Phải thu.</p>
          : <p className="msg ok" role="status">{saved.customer} đã thanh toán đủ.</p>)}
        <button className="primary" onClick={again}>Ghi thêm lần bán</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  return (
    <section>
      <h1>{editing ? 'Sửa khoản bán' : 'Ghi bán hàng'}</h1>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        {editing ? (
          <p className="muted">{cycleLabel(editing.cycle_id)} — không đổi được vụ; muốn đổi hãy hủy khoản bán và ghi lại. Mọi thay đổi được lưu lịch sử.</p>
        ) : (
          <>
          <label>
            <CycleWord cap />
            <select value={effCycle} onChange={(e) => setCycleId(e.target.value)}>
              {ordered.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
          {(cycles.length > ordered.length || showAllCycles) && (
            <label className="check"><input type="checkbox" checked={showAllCycles} onChange={(e) => setShowAllCycles(e.target.checked)} /> Hiện cả vụ không còn sản xuất</label>
          )}
          </>
        )}
        <label>
          Ngày bán
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <WithdrawalNotice cycleId={effCycle} date={date} reason={wReason} onReason={setWReason} />
        <label>
          Số lượng bán (kg)
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Số tiền thu được (đồng)
          <input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
          {perKg !== null && <small>Tương đương {formatMoney(perKg)}/kg.</small>}
        </label>
        <label>
          Người mua, ghi chú (không bắt buộc)
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </label>
        {!editing && (customers.length > 0 || quickAdd) && (
          <fieldset className="roles">
            <legend>Khách hàng và công nợ (không bắt buộc)</legend>
            <label>
              Khách hàng
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— Bán lẻ, không ghi khách (thu tiền ngay) —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {!quickAdd && <button type="button" className="link" onClick={() => setQuickAdd(true)}>+ Thêm khách hàng mới</button>}
            {quickAdd && orgId && (
              <CustomerForm title="Thêm khách hàng" busy={busy || !online} onClose={() => setQuickAdd(false)}
                onSave={async (f) => {
                  try { const nid = await createCustomer(orgId, f); await reloadCustomers(); setPartnerId(nid); setQuickAdd(false); } catch (err) { setError(friendlyError(err)); }
                }} />
            )}
            {partnerId && (
              <>
                <label>Số phiếu bán (nếu có)<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></label>
                <div className="pair">
                  <button type="button" className={collectMode === 'full' ? 'primary' : 'secondary'} onClick={() => setCollectMode('full')}>Thu đủ ngay</button>
                  <button type="button" className={collectMode === 'none' ? 'primary' : 'secondary'} onClick={() => setCollectMode('none')}>Chưa thu (nợ)</button>
                </div>
                <button type="button" className={collectMode === 'part' ? 'primary' : 'secondary'} onClick={() => setCollectMode('part')}>Thu một phần</button>
                {collectMode === 'part' && <label>Đã thu (đ)<input value={partText} inputMode="numeric" onChange={(e) => setPartText(e.target.value)} /></label>}
                {collectMode !== 'none' && (
                  <label>Hình thức thu
                    <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')}>
                      <option value="cash">Tiền mặt</option>
                      <option value="transfer">Chuyển khoản</option>
                    </select>
                  </label>
                )}
                {(() => {
                  const part = parseNumber(partText);
                  const got = collectMode === 'full' ? (a ?? 0) : collectMode === 'none' ? 0 : part === null || Number.isNaN(part) ? 0 : part;
                  const owed = Math.max(0, (a ?? 0) - got);
                  return <p className={owed > 0 ? 'msg warn' : 'msg ok'} role="status">{owed > 0 ? `Khách còn nợ: ${formatMoney(owed)}` : 'Khách đã thanh toán đủ, không còn nợ.'}</p>;
                })()}
                <label>
                  Hạn thu tiền (bạn nhập)
                  <input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} />
                  <small>Ngày khách phải trả hết nợ; để trống nếu không có hạn (app sẽ không nhắc quá hạn).</small>
                </label>
              </>
            )}
          </fieldset>
        )}
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Cần có mạng để lưu; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>{editing ? 'Lưu thay đổi' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
