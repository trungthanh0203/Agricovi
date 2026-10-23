import { useCallback, useEffect, useState } from 'react';
import { OrderSaleForm } from './OrderSaleForm';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import {
  fetchOrder, fetchOrderOrgs, fetchOrders, ORDER_ACTION_LABEL, ORDER_PAYMENT_LABEL, ORDER_STATUS_LABEL, orderAction, quoteOrder, setOrderPayment, validateQuote,
  type OrderAction, type OrderPayment, type OrderStatus, type WebOrderDetail, type WebOrderSummary,
} from '../lib/webSite';

const FILTERS: { id: OrderStatus | 'open' | 'all'; label: string }[] = [
  { id: 'open', label: 'Cần xử lý' },
  { id: 'placed', label: 'Chờ báo giá' },
  { id: 'accepted', label: 'Đã chốt' },
  { id: 'shipped', label: 'Đang giao' },
  { id: 'delivered', label: 'Đã giao' },
  { id: 'completed', label: 'Hoàn tất' },
  { id: 'all', label: 'Tất cả' },
];
const OPEN: OrderStatus[] = ['placed', 'quoted', 'accepted', 'preparing', 'shipped', 'delivered'];
const statusPill = (s: OrderStatus) => (s === 'placed' ? 'pill warn' : s === 'cancelled' || s === 'rejected' ? 'pill err' : s === 'completed' ? 'pill ok' : 'pill');
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Đơn đặt hàng từ website (G2-5 R3): xem, báo giá, từ chối, chuẩn bị, giao, hủy, ghi nhận thanh toán ngay trong app.
 * Mọi thao tác gọi hàm của website; máy chủ quyết định thao tác nào được phép ở trạng thái hiện tại và kiểm quyền.
 */
export function WebOrdersTab() {
  const online = useOnline();
  const [filter, setFilter] = useState<OrderStatus | 'open' | 'all'>('open');
  const { active } = useOrgs();
  const [rows, setRows] = useState<WebOrderSummary[] | null>(null);
  const [orgOf, setOrgOf] = useState<Record<string, string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [r, m] = await Promise.all([fetchOrders(filter === 'open' || filter === 'all' ? null : filter), fetchOrderOrgs().catch(() => null)]);
      setRows(r);
      setOrgOf(m);
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  if (openId) return <OrderDetail id={openId} onBack={() => { setOpenId(null); void load(); }} />;

  // chỉ đơn của cơ sở đang chọn (nếu máy chủ chưa có hàm chia theo cơ sở thì hiện hết)
  const shown = (rows ?? []).filter((o) => (filter !== 'open' || OPEN.includes(o.status)) && (!orgOf || !active || orgOf[o.id] === active.id));
  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: cần có mạng để xem và xử lý đơn.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="chips" role="tablist" aria-label="Lọc đơn theo trạng thái">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'chip active' : 'chip'} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && shown.length === 0 && <p className="muted">Không có đơn nào ở mục này.</p>}
      {shown.map((o) => (
        <button key={o.id} className="card slim ordercard" onClick={() => setOpenId(o.id)}>
          <div className="row">
            <strong className="grow">{o.code}</strong>
            <span className={statusPill(o.status)}>{ORDER_STATUS_LABEL[o.status]}</span>
          </div>
          <p className="muted">{o.recipient} · {when(o.created_at)}</p>
          <p>{o.item_names ?? ''}{o.total != null ? ` · ${formatMoney(o.total)}` : ''}</p>
          {o.payment_status !== 'unpaid' && <span className={o.payment_status === 'paid' ? 'pill ok' : 'pill warn'}>{ORDER_PAYMENT_LABEL[o.payment_status]}</span>}
        </button>
      ))}
    </>
  );
}

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const online = useOnline();
  const [o, setO] = useState<WebOrderDetail | null>(null);
  const { active } = useOrgs();
  const [panel, setPanel] = useState<null | 'quote' | 'payment' | 'sale'>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setO(await fetchOrder(id)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setOk(null);
    try { await fn(); setOk(done); await load(); return true; } catch (e) { setError(friendlyError(e)); await load(); return false; } finally { setBusy(false); }
  }

  if (!o) {
    return (
      <>
        <button className="link" onClick={onBack}>← Danh sách đơn</button>
        {error ? <p className="msg error" role="alert">{error}</p> : <p className="muted">Đang tải…</p>}
      </>
    );
  }

  const simple = (a: Exclude<OrderAction, 'quote' | 'payment'>, needReason: boolean, done: string) => () => {
    let note = '';
    if (needReason) {
      const r = window.prompt(`Lý do (ít nhất 5 ký tự) — ${ORDER_ACTION_LABEL[a]}:`);
      if (!r || r.trim().length < 5) { if (r !== null) setError('Hãy ghi lý do ít nhất 5 ký tự.'); return; }
      note = r.trim();
    } else if (!window.confirm(`${ORDER_ACTION_LABEL[a]}?`)) return;
    void act(() => orderAction(o.id, a, note), done);
  };

  return (
    <>
      <button className="link" onClick={onBack}>← Danh sách đơn</button>
      {!online && <p className="msg warn" role="status">Đang offline: cần có mạng để xử lý đơn.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}

      <div className="card">
        <div className="row">
          <h2 className="grow">{o.code}</h2>
          <span className={statusPill(o.status)}>{ORDER_STATUS_LABEL[o.status]}</span>
        </div>
        <p>Người nhận: <strong>{o.recipient}</strong> · <a href={`tel:${o.recipient_phone}`}>📞 {o.recipient_phone}</a></p>
        <p className="muted">{o.address}{o.district ? `, ${o.district}` : ''}, {o.province}</p>
        {o.desired_date && <p className="muted">Muốn nhận ngày {fmtDate(o.desired_date)}</p>}
        {o.buyer_note && <p>Ghi chú của người mua: {o.buyer_note}</p>}
        {o.seller_note && <p className="muted">Ghi chú của bạn: {o.seller_note}</p>}
        {o.cancel_reason && <p className="msg warn">Lý do: {o.cancel_reason}</p>}
        <p>Thanh toán: <span className={o.payment_status === 'paid' ? 'pill ok' : o.payment_status === 'partial' ? 'pill warn' : 'pill'}>{ORDER_PAYMENT_LABEL[o.payment_status]}</span></p>
      </div>

      <h2 className="sect">Hàng đặt</h2>
      <table className="grid">
        <thead><tr><th>Hàng</th><th className="num">Đặt</th><th className="num">Đơn giá</th></tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}{i.agreed_quantity != null && i.agreed_quantity !== i.quantity && <span className="sub">Chốt {formatQty(i.agreed_quantity)} {i.unit ?? ''}</span>}</td>
              <td className="num">{formatQty(i.quantity)} {i.unit ?? ''}</td>
              <td className="num">{i.unit_price != null ? formatMoney(i.unit_price) : i.list_price != null ? `${formatMoney(i.list_price)} (niêm yết)` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{o.shipping_fee > 0 && <>Phí giao: {formatMoney(o.shipping_fee)} · </>}{o.total != null && <strong>Tổng: {formatMoney(o.total)}</strong>}{o.deliver_date ? ` · giao dự kiến ${fmtDate(o.deliver_date)}` : ''}</p>

      <div className="actions">
        {o.actions.includes('quote') && <button className="primary" disabled={busy || !online} onClick={() => setPanel(panel === 'quote' ? null : 'quote')}>{o.status === 'quoted' ? 'Báo giá lại' : 'Báo giá'}</button>}
        {o.actions.includes('prepare') && <button className="primary" disabled={busy || !online} onClick={simple('prepare', false, 'Đơn đang được chuẩn bị.')}>Bắt đầu chuẩn bị</button>}
        {o.actions.includes('ship') && <button className="primary" disabled={busy || !online} onClick={simple('ship', false, 'Đơn đã được giao đi.')}>Giao đi</button>}
        {o.actions.includes('deliver') && <button className="primary" disabled={busy || !online} onClick={simple('deliver', false, 'Đã báo giao tới người mua; chờ người mua xác nhận.')}>Đã giao tới người mua</button>}
        {o.actions.includes('payment') && <button className="secondary" disabled={busy || !online} onClick={() => setPanel(panel === 'payment' ? null : 'payment')}>Ghi nhận thanh toán</button>}
        {(o.status === 'delivered' || o.status === 'completed') && canPerm(active?.perms, 'sales', 'edit') && (
          <button className="primary" disabled={busy || !online} onClick={() => setPanel(panel === 'sale' ? null : 'sale')}>Ghi doanh thu</button>
        )}
        {o.actions.includes('reject') && <button className="secondary" disabled={busy || !online} onClick={simple('reject', true, 'Đã từ chối đơn.')}>Từ chối đơn</button>}
        {o.actions.includes('seller_cancel') && <button className="secondary" disabled={busy || !online} onClick={simple('seller_cancel', true, 'Đã hủy đơn.')}>Hủy đơn</button>}
      </div>

      {panel === 'quote' && (
        <QuoteForm order={o} busy={busy || !online}
          onSave={async (i) => { const done = await act(() => quoteOrder(o.id, i), 'Đã gửi báo giá cho người mua.'); if (done) setPanel(null); return done; }} />
      )}
      {panel === 'sale' && <OrderSaleForm orderId={o.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); setOk('Đã ghi doanh thu cho đơn này.'); }} />}
      {panel === 'payment' && (
        <PaymentForm order={o} busy={busy || !online}
          onSave={async (s, n) => { const done = await act(() => setOrderPayment(o.id, s, n), 'Đã ghi nhận thanh toán.'); if (done) setPanel(null); return done; }} />
      )}

      {o.events.length > 0 && (
        <details className="fold">
          <summary><span className="fold-title">Lịch sử đơn</span><span className="fold-sum">{o.events.length} mục</span></summary>
          <div className="fold-body">
            {o.events.map((e, k) => (
              <p key={k} className="muted">{when(e.at)} · {e.role === 'seller' ? 'Bạn' : e.role === 'buyer' ? 'Người mua' : 'Hệ thống'}: {e.kind}{e.note ? ` — ${e.note}` : ''}</p>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/** Báo giá: đơn giá từng dòng, số lượng chốt (không vượt số đặt), phí giao, ngày giao, ghi chú */
function QuoteForm({ order, busy, onSave }: { order: WebOrderDetail; busy: boolean; onSave: (i: Parameters<typeof quoteOrder>[1]) => Promise<boolean> }) {
  const [rows, setRows] = useState(() => order.items.map((i) => ({ id: i.id, price: String(i.unit_price ?? i.list_price ?? ''), qty: String(i.agreed_quantity ?? i.quantity) })));
  const [ship, setShip] = useState(String(order.shipping_fee || 0));
  const [date, setDate] = useState(order.deliver_date ?? order.desired_date ?? '');
  const [note, setNote] = useState(order.seller_note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const set = (id: string, patch: Partial<{ price: string; qty: string }>) => setRows((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const parsed = rows.map((r) => ({ id: r.id, unitPrice: parseNumber(r.price) ?? NaN, quantity: parseNumber(r.qty) ?? NaN }));
  const goods = parsed.reduce((s, r) => s + (Number.isFinite(r.unitPrice) && Number.isFinite(r.quantity) ? r.unitPrice * r.quantity : 0), 0);
  const shipN = parseNumber(ship) ?? 0;
  return (
    <div className="card">
      <h2>Báo giá</h2>
      <div className="inline-form">
        {order.items.map((i) => {
          const r = rows.find((x) => x.id === i.id)!;
          return (
            <div className="member" key={i.id}>
              <strong>{i.name}</strong> <span className="muted">(đặt {formatQty(i.quantity)} {i.unit ?? ''}{i.list_price != null ? `, niêm yết ${formatMoney(i.list_price)}` : ''})</span>
              <div className="pair">
                <label>Đơn giá (đ){i.unit ? ` / ${i.unit}` : ''}<input value={r.price} inputMode="numeric" onChange={(e) => set(i.id, { price: e.target.value })} /></label>
                <label>Số lượng chốt<input value={r.qty} inputMode="decimal" onChange={(e) => set(i.id, { qty: e.target.value })} /></label>
              </div>
            </div>
          );
        })}
        <div className="pair">
          <label>Phí giao hàng (đ)<input value={ship} inputMode="numeric" onChange={(e) => setShip(e.target.value)} /></label>
          <label>Giao dự kiến<input type="date" value={date} min={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label>Ghi chú cho người mua<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Không ghi số điện thoại hoặc đường dẫn" /></label>
        <p className="msg ok" role="status">Tạm tính: {formatMoney(goods + (Number.isFinite(shipN) ? shipN : 0))} (hàng {formatMoney(goods)} + giao {formatMoney(Number.isFinite(shipN) ? shipN : 0)})</p>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy} onClick={() => {
            const ordered = new Map(order.items.map((i) => [i.id, i.quantity]));
            const input = { items: parsed, shipping: shipN, note, deliverDate: date || null };
            const bad = validateQuote(input, ordered, todayLocal());
            if (bad) return setErr(bad);
            setErr(null);
            void onSave(input);
          }}>Gửi báo giá</button>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ order, busy, onSave }: { order: WebOrderDetail; busy: boolean; onSave: (s: OrderPayment, note: string) => Promise<boolean> }) {
  const [status, setStatus] = useState<OrderPayment>(order.payment_status);
  const [note, setNote] = useState('');
  return (
    <div className="card">
      <h2>Ghi nhận thanh toán</h2>
      <div className="inline-form">
        <label>Tình trạng
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderPayment)}>
            {(Object.keys(ORDER_PAYMENT_LABEL) as OrderPayment[]).map((p) => <option key={p} value={p}>{ORDER_PAYMENT_LABEL[p]}</option>)}
          </select>
        </label>
        <label>Ghi chú<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đã nhận chuyển khoản" /></label>
        <small className="muted">Thanh toán diễn ra ngoài hệ thống; đây chỉ là ghi nhận của bạn.</small>
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy} onClick={() => void onSave(status, note)}>Lưu</button>
        </div>
      </div>
    </div>
  );
}
