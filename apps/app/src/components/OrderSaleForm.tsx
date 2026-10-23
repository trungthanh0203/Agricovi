import { useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { createCustomer, listCustomers, type Customer } from '../lib/partners';
import { putLocal } from '../lib/serverWrite';
import { useTable } from '../lib/tables';
import { fetchOrderContext, normPhone, recordOrderSale, type OrderContext } from '../lib/webSite';

interface Line { itemId: string; name: string; unit: string | null; cycleId: string; qty: string; amount: string }

/**
 * Ghi doanh thu cho đơn đã giao/hoàn tất (G2-5 R4). Điền sẵn từ đơn: vụ (theo sản phẩm niêm yết), số kg, số tiền, khách (nối khách trùng
 * số điện thoại hoặc tạo từ người nhận), số phiếu = mã đơn, số đã thu theo tình trạng thanh toán. Mỗi vụ là một lần bán. Phí giao mặc định không cộng.
 * Chỉ người có quyền sửa Doanh thu dùng (máy chủ kiểm lại).
 */
export function OrderSaleForm({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const online = useOnline();
  const cyclesAll = useTable('cycles');
  const [ctx, setCtx] = useState<OrderContext | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [partnerId, setPartnerId] = useState(''); // '' = tạo khách mới từ người nhận
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [mode, setMode] = useState<'full' | 'none' | 'part'>('full');
  const [partText, setPartText] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer'>('transfer');
  const [due, setDue] = useState(''); // hạn thu tiền do người dùng tự nhập
  const [withShip, setWithShip] = useState(false);
  const [again, setAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number; collected: number; count: number } | null>(null);
  const saleIds = useRef(new Map<string, string>()); // mã lần bán theo vụ: thử lại không tạo trùng

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const c = await fetchOrderContext(orderId);
        const cust = await listCustomers(c.organization_id).catch(() => [] as Customer[]);
        if (!alive) return;
        setCtx(c);
        setCustomers(cust.filter((x) => x.is_active));
        setInvoice(c.code);
        setLines(c.items.map((i) => {
          const q = i.agreed_quantity ?? i.quantity;
          const isKg = (i.unit ?? i.listing_unit ?? '').toLowerCase() === 'kg';
          return { itemId: i.id, name: i.name, unit: i.unit, cycleId: i.cycle_id ?? '', qty: isKg ? String(q) : '', amount: i.unit_price != null ? String(Math.round(i.unit_price * q)) : '' };
        }));
        const hit = cust.find((x) => x.is_active && normPhone(x.phone) !== '' && normPhone(x.phone) === normPhone(c.recipient_phone));
        setPartnerId(hit?.id ?? '');
        setMode(c.payment_status === 'paid' ? 'full' : c.payment_status === 'partial' ? 'part' : 'none');
        setAgain(false);
      } catch (e) { if (alive) setError(friendlyError(e)); }
    })();
    return () => { alive = false; };
  }, [orderId]);

  const cycles = useMemo(() => cyclesAll.filter((c) => c.owner_org_id === ctx?.organization_id), [cyclesAll, ctx]);
  const cycleName = (id: string) => { const c = cycles.find((x) => x.id === id); return c ? (c.name || c.template_name || 'Vụ') : '—'; };

  if (!ctx) {
    return (
      <div className="card">
        {error ? <p className="msg error" role="alert">{error}</p> : <p className="muted">Đang tải…</p>}
        <button className="secondary" onClick={onClose}>Đóng</button>
      </div>
    );
  }

  const goods = lines.reduce((s, l) => s + (parseNumber(l.amount) || 0), 0);
  const total = goods + (withShip ? ctx.shipping_fee : 0);
  const part = parseNumber(partText);
  const collectedTotal = mode === 'full' ? total : mode === 'none' ? 0 : part === null || Number.isNaN(part) ? 0 : part;
  const owed = Math.max(0, total - collectedTotal);

  async function submit() {
    setError(null);
    if (!ctx) return;
    if (ctx.sales.length > 0 && !again) return setError('Đơn này đã được ghi doanh thu trước đó. Hãy tích ô xác nhận nếu vẫn muốn ghi thêm (ví dụ đơn có hàng của vụ khác).');
    // gom theo vụ: mỗi vụ một lần bán
    const groups = new Map<string, { qty: number; amount: number }>();
    for (const l of lines) {
      const q = parseNumber(l.qty);
      const a = parseNumber(l.amount);
      if (!l.cycleId) return setError(`Hãy chọn vụ cho dòng "${l.name}".`);
      if (q === null || Number.isNaN(q) || q <= 0) return setError(`Hãy nhập số kg (lớn hơn 0) cho dòng "${l.name}".`);
      if (a === null || Number.isNaN(a) || a < 0 || !Number.isInteger(a)) return setError(`Số tiền của dòng "${l.name}" phải là số đồng không có phần lẻ.`);
      const g = groups.get(l.cycleId) ?? { qty: 0, amount: 0 };
      g.qty += q;
      g.amount += a;
      groups.set(l.cycleId, g);
    }
    if (withShip && ctx.shipping_fee > 0) { const first = groups.values().next().value as { qty: number; amount: number }; first.amount += ctx.shipping_fee; }
    if (!Number.isInteger(collectedTotal) || collectedTotal < 0 || collectedTotal > total) return setError('Số tiền đã thu phải là số đồng không âm và không lớn hơn tổng tiền.');
    if (date > todayLocal()) return setError('Ngày bán không được sau ngày hôm nay.');
    if (due && due < date) return setError('Hạn thu tiền không được trước ngày bán.');
    setBusy(true);
    try {
      let pid = partnerId;
      if (!pid) pid = await createCustomer(ctx.organization_id, { name: ctx.recipient, phone: ctx.recipient_phone, note: `Từ đơn website ${ctx.code}` });
      let left = collectedTotal;
      let sold = 0;
      for (const [cycleId, g] of groups) {
        const take = Math.min(left, g.amount);
        left -= take;
        let sid = saleIds.current.get(cycleId);
        if (!sid) { sid = crypto.randomUUID(); saleIds.current.set(cycleId, sid); }
        const row = await recordOrderSale({
          orderId, saleId: sid, orgId: ctx.organization_id, cycleId, date, quantity: g.qty, amount: g.amount, partnerId: pid,
          invoiceNo: groups.size > 1 ? `${invoice}-${sold + 1}` : invoice, dueDate: due || null, collected: take, method,
        });
        await putLocal('sales_records', row);
        sold++;
      }
      setDone({ total, collected: collectedTotal, count: groups.size });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <h2>Đã ghi doanh thu</h2>
        <p className="msg ok" role="status">Đã ghi {done.count} lần bán, tổng {formatMoney(done.total)}, đã thu {formatMoney(done.collected)}.</p>
        {done.total - done.collected > 0 && <p className="msg warn" role="status">Khách còn nợ {formatMoney(done.total - done.collected)}. Xem ở Báo cáo → Công nợ → Phải thu.</p>}
        <button className="primary" onClick={onDone}>Xong</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Ghi doanh thu cho đơn {ctx.code}</h2>
      {ctx.sales.length > 0 && (
        <div className="msg warn" role="alert">
          <p style={{ margin: 0 }}>Đơn này đã được ghi doanh thu {ctx.sales.length} lần. Ghi thêm có thể làm doanh thu bị tính hai lần.</p>
          <label className="check"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Tôi hiểu, vẫn ghi thêm</label>
        </div>
      )}
      <div className="inline-form">
        <label>Ngày bán<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>

        {lines.map((l) => (
          <div className="member" key={l.itemId}>
            <strong>{l.name}</strong>{l.unit && <span className="muted"> (đơn đặt tính theo {l.unit})</span>}
            <label>Vụ
              <select value={l.cycleId} onChange={(e) => setLines((s) => s.map((x) => (x.itemId === l.itemId ? { ...x, cycleId: e.target.value } : x)))}>
                <option value="">— Chọn vụ —</option>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name || c.template_name || 'Vụ'}</option>)}
              </select>
            </label>
            <div className="pair">
              <label>Số kg<input value={l.qty} inputMode="decimal" onChange={(e) => setLines((s) => s.map((x) => (x.itemId === l.itemId ? { ...x, qty: e.target.value } : x)))} /></label>
              <label>Số tiền (đ)<input value={l.amount} inputMode="numeric" onChange={(e) => setLines((s) => s.map((x) => (x.itemId === l.itemId ? { ...x, amount: e.target.value } : x)))} /></label>
            </div>
            {!l.cycleId && <small className="warn">Không suy ra được vụ từ sản phẩm niêm yết, hãy chọn vụ đã sản xuất hàng này.</small>}
          </div>
        ))}
        {ctx.shipping_fee > 0 && (
          <label className="check"><input type="checkbox" checked={withShip} onChange={(e) => setWithShip(e.target.checked)} /> Cộng phí giao hàng {formatMoney(ctx.shipping_fee)} vào doanh thu</label>
        )}

        <label>Khách hàng
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">+ Tạo khách mới từ người nhận ({ctx.recipient})</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{normPhone(c.phone) === normPhone(ctx.recipient_phone) ? ' (trùng số điện thoại)' : ''}</option>)}
          </select>
        </label>
        <label>Số phiếu<input value={invoice} maxLength={50} onChange={(e) => setInvoice(e.target.value)} /></label>

        <div className="pair">
          <button type="button" className={mode === 'full' ? 'primary' : 'secondary'} onClick={() => setMode('full')}>Thu đủ</button>
          <button type="button" className={mode === 'none' ? 'primary' : 'secondary'} onClick={() => setMode('none')}>Chưa thu (nợ)</button>
        </div>
        <button type="button" className={mode === 'part' ? 'primary' : 'secondary'} onClick={() => setMode('part')}>Thu một phần</button>
        {mode === 'part' && <label>Đã thu (đ)<input value={partText} inputMode="numeric" onChange={(e) => setPartText(e.target.value)} /></label>}
        {mode !== 'none' && (
          <label>Hình thức thu
            <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')}>
              <option value="transfer">Chuyển khoản</option>
              <option value="cash">Tiền mặt</option>
            </select>
          </label>
        )}
        <label>
          Hạn thu tiền (bạn nhập)
          <input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} />
          <small>Để trống nếu không có hạn (app sẽ không nhắc quá hạn).</small>
        </label>

        <p className={owed > 0 ? 'msg warn' : 'msg ok'} role="status">
          Tổng ghi doanh thu: <strong>{formatMoney(total)}</strong>{lines.length > 0 && ` (${formatQty(lines.reduce((s, l) => s + (parseNumber(l.qty) || 0), 0))} kg)`} · {owed > 0 ? `khách còn nợ ${formatMoney(owed)}` : 'khách đã thanh toán đủ'}
        </p>
        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy || !online} onClick={() => void submit()}>{busy ? 'Đang lưu…' : 'Ghi doanh thu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
        <small className="muted">Vụ: {lines.map((l) => cycleName(l.cycleId)).join(', ')}. Mỗi vụ được ghi thành một lần bán.</small>
      </div>
    </div>
  );
}

