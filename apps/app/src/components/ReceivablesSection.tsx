import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { ChartCard, ProportionBar } from './charts';
import { KpiTile, shortMoney } from './HomeStats';
import { PayForm, pillClass } from './PayablesSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { formatMoney, formatQty } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import {
  collectPartner, collectSale, editSaleCredit, fetchReceivables, listSaleReceipts, RECEIVABLE_STATUS_LABEL, summarizePayables, voidSaleCredit,
  voidSaleReceipt, type PayInput, type ReceivableSale, type SaleReceipt,
} from '../lib/partners';
import { canPerm } from '../lib/permissions';
import { putLocal } from '../lib/serverWrite';

/**
 * Công nợ PHẢI THU (G2-4): các lần bán có chọn khách mà khách chưa trả đủ. Tổng còn phải thu, quá hạn, sắp đến hạn; theo từng khách.
 * Thu tiền một lần bán hoặc thu chung của khách (tự trừ vào lần bán cũ nhất trước), xem/hủy lần thu, sửa số phiếu và hạn, hủy lần bán.
 * Xem cần quyền xem Doanh thu; ghi cần quyền sửa Doanh thu.
 */
export function ReceivablesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [rows, setRows] = useState<ReceivableSale[] | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgId = active?.id;

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchReceivables(orgId, !showPaid)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, showPaid]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sales: ReceivableSale[] }>();
    for (const b of rows ?? []) {
      const g = m.get(b.partner_id) ?? { id: b.partner_id, name: b.partner_name, sales: [] };
      g.sales.push(b);
      m.set(b.partner_id, g);
    }
    return [...m.values()];
  }, [rows]);

  if (!active || !orgId) return null;
  const canEdit = canPerm(active.perms, 'sales', 'edit');
  // dùng lại bộ tổng hợp của công nợ phải trả (cùng dạng: còn lại, trạng thái)
  const sum = summarizePayables((rows ?? []).map((r) => ({ ...r, bill_id: r.sale_id, paid: r.collected })) as never);
  const aging = [
    { label: 'Quá hạn', value: sum.overdueAmount, tone: 'bad' },
    { label: 'Sắp đến hạn (7 ngày)', value: sum.soonAmount, tone: 'warn' },
    { label: 'Còn hạn hoặc không có hạn', value: Math.max(0, sum.owed - sum.overdueAmount - sum.soonAmount), tone: 'ok' },
  ];

  async function act(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setOk(null);
    try { await fn(); setOk(done); await load(); return true; } catch (e) { setError(friendlyError(e)); await load(); return false; } finally { setBusy(false); }
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: công nợ cần có mạng để xem và ghi.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}

      <div className="kpis">
        <KpiTile label="Tổng còn phải thu" value={shortMoney(sum.owed)} title={formatMoney(sum.owed)} tone={sum.owed > 0 ? 'warn' : 'ok'} note={sum.owed > 0 ? 'đồng' : 'không còn nợ'} />
        <KpiTile label="Quá hạn" value={String(sum.overdueCount)} tone={sum.overdueCount > 0 ? 'bad' : 'ok'} note={sum.overdueCount > 0 ? `${shortMoney(sum.overdueAmount)} đồng` : 'không có'} />
        <KpiTile label="Sắp đến hạn (7 ngày)" value={String(sum.soonCount)} tone={sum.soonCount > 0 ? 'warn' : 'ok'} note={sum.soonCount > 0 ? `${shortMoney(sum.soonAmount)} đồng` : 'không có'} />
      </div>


      {(rows ?? []).some((r) => r.remaining > 0) && (
        <ChartCard title="Tuổi nợ" subtitle="Số tiền còn lại theo tình trạng hạn" footer="Lần bán chưa nhập hạn được tính là còn hạn."
          table={{ columns: ['Tình trạng', 'Số tiền'], rows: aging.map((a) => [a.label, formatMoney(a.value)]) }}>
          <ProportionBar segments={aging} format={formatMoney} ariaLabel="Tuổi nợ" />
        </ChartCard>
      )}
      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && groups.length === 0 && (
        <div className="card">
          <p>{showPaid ? 'Chưa có lần bán nào ghi khách hàng.' : 'Hiện không có khách nào còn nợ.'}</p>
          <p className="muted">Khi ghi bán hàng ở Báo cáo → Doanh thu, chọn khách hàng và nhập số đã thu thì khoản chưa thu sẽ hiện ở đây.</p>
        </div>
      )}

      {groups.map((g) => {
        const open = g.sales.reduce((s, b) => s + b.remaining, 0);
        const late = g.sales.filter((b) => b.status === 'overdue').length;
        return (
          <Collapsible key={g.id} title={g.name}
            summary={`Còn phải thu ${formatMoney(open)}${late > 0 ? ` · ${late} lần bán quá hạn` : ''}`} warn={late > 0} defaultOpen={late > 0}>
            {canEdit && open > 0 && (
              <PayForm label="Thu của khách" hint="Tự trừ vào lần bán cũ nhất trước" max={open} busy={busy || !online}
                amountLabel="Số tiền thu (đ)" dateLabel="Ngày thu" submitLabel="Ghi thu tiền"
                onSave={(i) => act(() => collectPartner(g.id, i), `Đã ghi thu ${formatMoney(i.amount)} của ${g.name}.`)} />
            )}
            {g.sales.map((b) => (
              <SaleCard key={b.sale_id} sale={b} canEdit={canEdit} busy={busy || !online}
                onCollect={(i) => act(() => collectSale(b.sale_id, i), `Đã ghi thu ${formatMoney(i.amount)}${b.invoice_no ? ` cho phiếu ${b.invoice_no}` : ''}.`)}
                onEdit={(c) => act(() => editSaleCredit(b, c), 'Đã lưu thay đổi lần bán.')}
                onVoid={(r) => act(async () => { const row = await voidSaleCredit(b, r); await putLocal('sales_records', row); }, 'Đã hủy lần bán.')}
                onVoidReceipt={(id, r) => act(() => voidSaleReceipt(id, r), 'Đã hủy lần thu tiền, số còn phải thu được tính lại.')} />
            ))}
          </Collapsible>
        );
      })}

      <label className="check"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Hiện cả các lần bán đã thu đủ</label>
      <p className="muted">Tiền thu nợ không phải doanh thu mới: doanh thu đã được tính lúc bán, nên báo cáo doanh thu và tổng kết vụ không đổi.</p>
    </>
  );
}

function SaleCard({ sale: b, canEdit, busy, onCollect, onEdit, onVoid, onVoidReceipt }: {
  sale: ReceivableSale; canEdit: boolean; busy: boolean;
  onCollect: (i: PayInput) => Promise<boolean>;
  onEdit: (c: { invoice_no: string; due_date: string }) => Promise<boolean>;
  onVoid: (reason: string) => Promise<boolean>;
  onVoidReceipt: (id: string, reason: string) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<null | 'collect' | 'receipts' | 'edit'>(null);
  const [receipts, setReceipts] = useState<SaleReceipt[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    try { setReceipts(await listSaleReceipts(b.sale_id)); setErr(null); } catch (e) { setErr(friendlyError(e)); }
  }, [b.sale_id]);
  useEffect(() => { if (panel === 'receipts') void loadReceipts(); }, [panel, loadReceipts, b.collected]);

  return (
    <div className="card slim">
      <div className="row">
        <strong className="grow">{b.invoice_no ? `Phiếu ${b.invoice_no}` : 'Phiếu không số'}</strong>
        <span className={pillClass(b.status)}>{RECEIVABLE_STATUS_LABEL[b.status]}</span>
      </div>
      <p className="muted">Bán {fmtDate(b.sold_date)} · {formatQty(b.quantity)} kg · {b.due_date ? `Hạn thu ${fmtDate(b.due_date)}` : 'Không có hạn'}</p>
      <p>Tổng {formatMoney(b.total_amount)} · Đã thu {formatMoney(b.collected)} · <strong>Còn phải thu {formatMoney(b.remaining)}</strong></p>
      <div className="actions">
        {canEdit && b.remaining > 0 && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'collect' ? null : 'collect')}>Thu tiền</button>}
        <button className="secondary" onClick={() => setPanel(panel === 'receipts' ? null : 'receipts')}>Các lần thu</button>
        {canEdit && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>Sửa</button>}
      </div>

      {panel === 'collect' && (
        <PayForm label="Thu tiền lần bán này" max={b.remaining} busy={busy} amountLabel="Số tiền thu (đ)" dateLabel="Ngày thu" submitLabel="Ghi thu tiền"
          onSave={async (i) => { const ok = await onCollect(i); if (ok) setPanel(null); return ok; }} />
      )}

      {panel === 'receipts' && (
        <div>
          {err && <p className="msg error" role="alert">{err}</p>}
          {receipts === null && !err && <p className="muted">Đang tải…</p>}
          {receipts !== null && receipts.length === 0 && <p className="muted">Chưa có lần thu nào.</p>}
          {receipts?.map((p) => (
            <p key={p.id} className={p.voided_at ? 'muted' : ''}>
              {fmtDate(p.received_on)} · {formatMoney(p.amount)} · {p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}{p.note ? ` · ${p.note}` : ''}
              {p.voided_at ? <span className="pill err"> Đã hủy: {p.void_reason}</span> : canEdit && (
                <button className="link inline" disabled={busy} onClick={() => {
                  const r = window.prompt('Lý do hủy lần thu này? (ví dụ: ghi nhầm số tiền)');
                  if (r && r.trim()) void onVoidReceipt(p.id, r.trim()).then(() => loadReceipts());
                }}>Hủy lần thu</button>
              )}
            </p>
          ))}
        </div>
      )}

      {panel === 'edit' && canEdit && (
        <EditSale sale={b} busy={busy} onClose={() => setPanel(null)}
          onSave={async (c) => { const ok = await onEdit(c); if (ok) setPanel(null); return ok; }}
          onVoid={async () => {
            const r = window.prompt('Lý do hủy lần bán này? (chỉ hủy được khi chưa còn lần thu nào chưa hủy)');
            if (r && r.trim()) { const ok = await onVoid(r.trim()); if (ok) setPanel(null); }
          }} />
      )}
    </div>
  );
}

function EditSale({ sale, busy, onSave, onClose, onVoid }: {
  sale: ReceivableSale; busy: boolean; onSave: (c: { invoice_no: string; due_date: string }) => Promise<boolean>; onClose: () => void; onVoid: () => Promise<void>;
}) {
  const [invoice, setInvoice] = useState(sale.invoice_no ?? '');
  const [due, setDue] = useState(sale.due_date ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="inline-form">
      <strong>Sửa lần bán</strong>
      <small className="muted">Ở đây chỉ sửa số phiếu và hạn thu. Muốn đổi số lượng hoặc số tiền, vào Báo cáo → Doanh thu (số tiền không được thấp hơn số đã thu).</small>
      <label>Số phiếu bán<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></label>
      <label>Hạn thu tiền<input type="date" value={due} min={sale.sold_date} onChange={(e) => setDue(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => {
          if (due && due < sale.sold_date) return setErr('Hạn thu tiền không được trước ngày bán.');
          setErr(null);
          void onSave({ invoice_no: invoice, due_date: due });
        }}>Lưu</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
      <button type="button" className="link" disabled={busy} onClick={() => void onVoid()}>Hủy lần bán này…</button>
    </div>
  );
}
