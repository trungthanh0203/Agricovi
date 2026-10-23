import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile, shortMoney } from './HomeStats';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import {
  editBill, fetchPayables, listBillPayments, PAYABLE_STATUS_LABEL, payBill, payPartner, summarizePayables, validatePay, voidBill, voidPayment,
  type BillPayment, type PayableBill, type PayInput,
} from '../lib/partners';
import { canPerm } from '../lib/permissions';

export const pillClass = (s: PayableBill['status']) => (s === 'overdue' ? 'pill err' : s === 'due_soon' ? 'pill warn' : s === 'paid' ? 'pill ok' : 'pill');

/**
 * Công nợ phải trả (G2-2, P3): tổng nợ, hóa đơn quá hạn/sắp đến hạn, theo từng nhà cung ứng. Trả tiền cho một hóa đơn hoặc cho cả nhà cung ứng
 * (tự trừ vào hóa đơn cũ nhất trước), xem/hủy lần trả, sửa số hóa đơn/hạn, hủy hóa đơn. Xem cần quyền xem Chi phí; ghi cần quyền sửa Chi phí.
 */
export function PayablesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [rows, setRows] = useState<PayableBill[] | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgId = active?.id;

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchPayables(orgId, !showPaid)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, showPaid]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; bills: PayableBill[] }>();
    for (const b of rows ?? []) {
      const g = m.get(b.partner_id) ?? { id: b.partner_id, name: b.partner_name, bills: [] };
      g.bills.push(b);
      m.set(b.partner_id, g);
    }
    return [...m.values()];
  }, [rows]);

  if (!active || !orgId) return null;
  const canEdit = canPerm(active.perms, 'expenses', 'edit');
  const sum = summarizePayables(rows ?? []);

  /** Chạy một thao tác ghi: báo kết quả rồi tải lại. Lỗi xung đột/quyền hiện rõ, không mất dữ liệu đang nhập. */
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
        <KpiTile label="Tổng còn nợ" value={shortMoney(sum.owed)} title={formatMoney(sum.owed)} tone={sum.owed > 0 ? 'warn' : 'ok'} note={sum.owed > 0 ? 'đồng' : 'không còn nợ'} />
        <KpiTile label="Quá hạn" value={String(sum.overdueCount)} tone={sum.overdueCount > 0 ? 'bad' : 'ok'} note={sum.overdueCount > 0 ? `${shortMoney(sum.overdueAmount)} đồng` : 'không có'} />
        <KpiTile label="Sắp đến hạn (7 ngày)" value={String(sum.soonCount)} tone={sum.soonCount > 0 ? 'warn' : 'ok'} note={sum.soonCount > 0 ? `${shortMoney(sum.soonAmount)} đồng` : 'không có'} />
      </div>

      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && groups.length === 0 && (
        <div className="card">
          <p>{showPaid ? 'Chưa có hóa đơn mua nào.' : 'Hiện không còn khoản nợ nào.'}</p>
          <p className="muted">Hóa đơn được tạo ở Sản xuất → Kho → Mua theo hóa đơn.</p>
        </div>
      )}

      {groups.map((g) => {
        const open = g.bills.reduce((s, b) => s + b.remaining, 0);
        const late = g.bills.filter((b) => b.status === 'overdue').length;
        return (
          <Collapsible key={g.id} title={g.name}
            summary={`Còn nợ ${formatMoney(open)}${late > 0 ? ` · ${late} hóa đơn quá hạn` : ''}`} warn={late > 0} defaultOpen={late > 0}>
            {canEdit && open > 0 && (
              <PayForm label="Trả cho nhà cung ứng" hint="Tự trừ vào hóa đơn cũ nhất trước" max={open} busy={busy || !online}
                onSave={(i) => act(() => payPartner(g.id, i), `Đã ghi trả ${formatMoney(i.amount)} cho ${g.name}.`)} />
            )}
            {g.bills.map((b) => (
              <BillCard key={b.bill_id} bill={b} canEdit={canEdit} busy={busy || !online}
                onPay={(i) => act(() => payBill(b.bill_id, i), `Đã ghi trả ${formatMoney(i.amount)}${b.invoice_no ? ` cho hóa đơn ${b.invoice_no}` : ''}.`)}
                onEdit={(c) => act(() => editBill(b, c), 'Đã lưu thay đổi hóa đơn.')}
                onVoid={(r) => act(() => voidBill(b, r), 'Đã hủy hóa đơn. Hàng đã nhập vẫn còn trong kho.')}
                onVoidPayment={(id, r) => act(() => voidPayment(id, r), 'Đã hủy lần trả tiền, số nợ được tính lại.')} />
            ))}
          </Collapsible>
        );
      })}

      <label className="check"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Hiện cả hóa đơn đã trả đủ</label>
      <p className="muted">Tiền trả nợ không phải chi phí: tiền mua vật tư đã được tính khi dùng, nên báo cáo chi phí và giá thành không đổi.</p>
    </>
  );
}

function BillCard({ bill: b, canEdit, busy, onPay, onEdit, onVoid, onVoidPayment }: {
  bill: PayableBill; canEdit: boolean; busy: boolean;
  onPay: (i: PayInput) => Promise<boolean>;
  onEdit: (c: { invoice_no: string; due_date: string }) => Promise<boolean>;
  onVoid: (reason: string) => Promise<boolean>;
  onVoidPayment: (id: string, reason: string) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<null | 'pay' | 'payments' | 'edit'>(null);
  const [payments, setPayments] = useState<BillPayment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    try { setPayments(await listBillPayments(b.bill_id)); setErr(null); } catch (e) { setErr(friendlyError(e)); }
  }, [b.bill_id]);
  useEffect(() => { if (panel === 'payments') void loadPayments(); }, [panel, loadPayments, b.paid]);

  return (
    <div className="card slim">
      <div className="row">
        <strong className="grow">{b.invoice_no ? `Hóa đơn ${b.invoice_no}` : 'Hóa đơn không số'}</strong>
        <span className={pillClass(b.status)}>{PAYABLE_STATUS_LABEL[b.status]}</span>
      </div>
      <p className="muted">
        Mua {fmtDate(b.bill_date)} · {b.due_date ? `Hạn ${fmtDate(b.due_date)}` : 'Không có hạn'}
      </p>
      <p>Tổng {formatMoney(b.total_amount)} · Đã trả {formatMoney(b.paid)} · <strong>Còn nợ {formatMoney(b.remaining)}</strong></p>
      <div className="actions">
        {canEdit && b.remaining > 0 && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>Trả tiền</button>}
        <button className="secondary" onClick={() => setPanel(panel === 'payments' ? null : 'payments')}>Các lần trả</button>
        {canEdit && <button className="secondary" disabled={busy} onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>Sửa</button>}
      </div>

      {panel === 'pay' && (
        <PayForm label="Trả tiền hóa đơn này" max={b.remaining} busy={busy} onSave={async (i) => { const ok = await onPay(i); if (ok) setPanel(null); return ok; }} />
      )}

      {panel === 'payments' && (
        <div>
          {err && <p className="msg error" role="alert">{err}</p>}
          {payments === null && !err && <p className="muted">Đang tải…</p>}
          {payments !== null && payments.length === 0 && <p className="muted">Chưa có lần trả nào.</p>}
          {payments?.map((p) => (
            <p key={p.id} className={p.voided_at ? 'muted' : ''}>
              {fmtDate(p.paid_on)} · {formatMoney(p.amount)} · {p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}{p.note ? ` · ${p.note}` : ''}
              {p.voided_at ? <span className="pill err"> Đã hủy: {p.void_reason}</span> : canEdit && (
                <button className="link inline" disabled={busy} onClick={() => {
                  const r = window.prompt('Lý do hủy lần trả này? (ví dụ: ghi nhầm số tiền)');
                  if (r && r.trim()) void onVoidPayment(p.id, r.trim()).then(() => loadPayments());
                }}>Hủy lần trả</button>
              )}
            </p>
          ))}
        </div>
      )}

      {panel === 'edit' && canEdit && (
        <EditBill bill={b} busy={busy} onClose={() => setPanel(null)}
          onSave={async (c) => { const ok = await onEdit(c); if (ok) setPanel(null); return ok; }}
          onVoid={async () => {
            const r = window.prompt('Lý do hủy hóa đơn này? (hàng đã nhập kho sẽ KHÔNG bị trừ khỏi kho; muốn bỏ hãy điều chỉnh tồn kho)');
            if (r && r.trim()) { const ok = await onVoid(r.trim()); if (ok) setPanel(null); }
          }} />
      )}
    </div>
  );
}

/** Biểu mẫu trả tiền: số tiền (mặc định = số còn nợ), ngày trả, hình thức, ghi chú */
export function PayForm({ label, hint, max, busy, onSave, amountLabel = 'Số tiền trả (đ)', dateLabel = 'Ngày trả', submitLabel = 'Ghi trả tiền' }: {
  label: string; hint?: string; max: number; busy: boolean; onSave: (i: PayInput) => Promise<boolean>; amountLabel?: string; dateLabel?: string; submitLabel?: string;
}) {
  const [amount, setAmount] = useState(String(max));
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [opKey, setOpKey] = useState(() => crypto.randomUUID()); // mã lần ghi: bấm lặp không ghi hai lần
  return (
    <div className="inline-form">
      <strong>{label}</strong>
      {hint && <small className="muted">{hint}</small>}
      <div className="pair">
        <label>{amountLabel}<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></label>
        <label>{dateLabel}<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <label>Hình thức
        <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')}>
          <option value="cash">Tiền mặt</option>
          <option value="transfer">Chuyển khoản</option>
        </select>
      </label>
      <label>Ghi chú<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => {
          const n = parseNumber(amount);
          const i: PayInput = { amount: n === null ? NaN : n, paidOn: date, method, note, opId: opKey };
          const bad = validatePay(i, max, todayLocal());
          if (bad) return setErr(bad);
          setErr(null);
          void onSave(i).then((ok) => { if (ok) setOpKey(crypto.randomUUID()); });
        }}>{submitLabel}</button>
      </div>
    </div>
  );
}

function EditBill({ bill, busy, onSave, onClose, onVoid }: {
  bill: PayableBill; busy: boolean; onSave: (c: { invoice_no: string; due_date: string }) => Promise<boolean>; onClose: () => void; onVoid: () => Promise<void>;
}) {
  const [invoice, setInvoice] = useState(bill.invoice_no ?? '');
  const [due, setDue] = useState(bill.due_date ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="inline-form">
      <strong>Sửa hóa đơn</strong>
      <small className="muted">Không sửa được tổng tiền, ngày mua và dòng hàng. Muốn đổi những mục đó, hãy hủy hóa đơn rồi nhập lại.</small>
      <label>Số hóa đơn<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></label>
      <label>Hạn thanh toán<input type="date" value={due} min={bill.bill_date} onChange={(e) => setDue(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => {
          if (due && due < bill.bill_date) return setErr('Hạn thanh toán không được trước ngày mua.');
          setErr(null);
          void onSave({ invoice_no: invoice, due_date: due });
        }}>Lưu</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
      <button type="button" className="link" disabled={busy} onClick={() => void onVoid()}>Hủy hóa đơn này…</button>
    </div>
  );
}
