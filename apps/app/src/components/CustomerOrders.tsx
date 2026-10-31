import { useEffect, useMemo, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { fmtDate } from '../lib/dates';
import { formatMoney, formatQty } from '../lib/inventory';
import { fetchReceivables, listSaleReceipts, RECEIVABLE_STATUS_LABEL, type ReceivableSale, type SaleReceipt } from '../lib/partners';
import { KpiTile } from './HomeStats';
import { useShowMore } from './ShowMore';

/**
 * Lịch sử mua hàng và công nợ của MỘT khách (D146): tổng đã mua, đã thu, còn nợ; từng đơn (ngày, phiếu, số lượng, tiền, đã thu, còn nợ, hạn)
 * và bấm vào đơn để xem từng lần khách trả tiền. Xem ở Khai báo → Khách hàng. Thu tiền thì vào Công nợ → Phải thu.
 */
export function CustomerOrders({ orgId, partnerId, name, onClose }: { orgId: string; partnerId: string; name: string; onClose: () => void }) {
  const [rows, setRows] = useState<ReceivableSale[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, SaleReceipt[]>>({});

  useEffect(() => {
    let live = true;
    setRows(null);
    fetchReceivables(orgId, false)
      .then((all) => { if (live) setRows(all.filter((r) => r.partner_id === partnerId).sort((a, b) => b.sold_date.localeCompare(a.sold_date))); })
      .catch((e) => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [orgId, partnerId]);

  const total = useMemo(() => (rows ?? []).reduce((t, r) => ({ bought: t.bought + r.total_amount, paid: t.paid + r.collected, owe: t.owe + r.remaining, qty: t.qty + r.quantity }), { bought: 0, paid: 0, owe: 0, qty: 0 }), [rows]);
  const { visible, more } = useShowMore(rows ?? [], partnerId);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!receipts[id]) {
      try { const r = await listSaleReceipts(id); setReceipts((m) => ({ ...m, [id]: r })); } catch (e) { setErr(friendlyError(e)); }
    }
  }

  return (
    <div className="card">
      <div className="row">
        <strong>Đơn hàng và công nợ: {name}</strong>
        <button type="button" className="link" onClick={onClose}>Đóng</button>
      </div>
      {err && <p className="msg error" role="alert">{err}</p>}
      {rows === null && !err && <p className="muted">Đang tải…</p>}
      {rows !== null && rows.length === 0 && <p className="muted">Khách này chưa có đơn nào. Khi ghi bán hàng và chọn khách này, đơn sẽ hiện ở đây.</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <div className="kpis">
            <KpiTile label="Đã mua" value={formatMoney(total.bought)} note={`${rows.length} đơn · ${formatQty(total.qty)} kg`} />
            <KpiTile label="Đã thu" value={formatMoney(total.paid)} tone="ok" />
            <KpiTile label="Còn nợ" value={formatMoney(total.owe)} tone={total.owe > 0 ? 'bad' : 'neutral'} />
          </div>
          {visible.map((r) => (
            <div className="card slim" key={r.sale_id}>
              <div className="row">
                <strong>{fmtDate(r.sold_date)}{r.invoice_no ? ` · ${r.invoice_no}` : ''}</strong>
                <span className={r.status === 'overdue' ? 'pill err' : r.status === 'paid' ? 'pill ok' : 'pill warn'}>{RECEIVABLE_STATUS_LABEL[r.status]}</span>
              </div>
              <p>{formatQty(r.quantity)} kg · {formatMoney(r.total_amount)}</p>
              <p className="muted">Đã thu {formatMoney(r.collected)} · {r.remaining > 0 ? `còn nợ ${formatMoney(r.remaining)}${r.due_date ? ` (hạn ${fmtDate(r.due_date)})` : ''}` : 'đã thu đủ'}</p>
              <button type="button" className="link" aria-expanded={open === r.sale_id} onClick={() => void toggle(r.sale_id)}>
                {open === r.sale_id ? 'Ẩn các lần thu tiền' : 'Xem các lần thu tiền'}
              </button>
              {open === r.sale_id && (() => {
                const list = receipts[r.sale_id]?.filter((x) => !x.voided_at);
                if (!list) return <p className="muted">Đang tải…</p>;
                if (list.length === 0) return <p className="muted">Chưa thu lần nào.</p>;
                return list.map((x) => (
                  <p key={x.id} className="muted">{fmtDate(x.received_on)} · {formatMoney(x.amount)} · {x.method === 'transfer' ? 'chuyển khoản' : 'tiền mặt'}{x.note ? ` · ${x.note}` : ''}</p>
                ));
              })()}
            </div>
          ))}
          {more}
          <p className="muted">Muốn ghi thu tiền: vào Công nợ → Phải thu.</p>
        </>
      )}
    </div>
  );
}
