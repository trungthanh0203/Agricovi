import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SupplierForm } from './PartnersSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import {
  createSupplier, linesTotal, listSuppliers, recordPurchase, validatePurchase, type Partner, type PurchaseInput,
} from '../lib/partners';
import { useTable } from '../lib/tables';

const LAST_LOCATION_KEY = 'agriconnect.lastLocation';

interface DraftLine { key: string; id: string; materialId: string; qty: string; cost: string; lotNo: string; lotExpiry: string }
const newLine = (materialId = ''): DraftLine => ({ key: crypto.randomUUID(), id: crypto.randomUUID(), materialId, qty: '', cost: '', lotNo: '', lotExpiry: '' });

/**
 * Mua theo hóa đơn (G2-2): chọn nhà cung ứng, ghi số hóa đơn, nhiều dòng vật tư, số tiền đã trả và hạn thanh toán.
 * Một lần Lưu tạo hóa đơn + nhập kho các dòng + lần trả đầu cùng lúc (lỗi thì không lưu gì). Cần mạng; cần quyền sửa Chi phí và Kho.
 */
export function PurchaseEntry({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const online = useOnline();
  const materialsAll = useTable('materials');
  const locationsAll = useTable('locations');
  const units = useTable('units');
  const mats = useMemo(() => materialsAll.filter((m) => m.organization_id === orgId && m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [materialsAll, orgId]);
  const locs = useMemo(() => locationsAll.filter((l) => l.organization_id === orgId && l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [locationsAll, orgId]);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [quickAdd, setQuickAdd] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [billDate, setBillDate] = useState(todayLocal());
  const [due, setDue] = useState(''); // hạn trả nợ do người dùng tự nhập (không có giá trị mặc định)
  const [locationId, setLocationId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [totalText, setTotalText] = useState<string | null>(null); // null = tự cộng từ các dòng
  const [paidText, setPaidText] = useState('0');
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ partner: string; invoice: string; total: number; paid: number; due: string | null } | null>(null);

  const reloadPartners = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setPartners((await listSuppliers(orgId)).filter((p) => p.is_active)); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void reloadPartners(); }, [reloadPartners]);

  const remembered = (() => { try { return localStorage.getItem(LAST_LOCATION_KEY); } catch { return null; } })();
  const effLocation = locationId || (locs.find((l) => l.id === remembered)?.id ?? locs[0]?.id ?? '');
  const unitOf = (materialId: string) => units.find((u) => u.id === mats.find((m) => m.id === materialId)?.base_unit_id)?.name.toLowerCase() ?? '';

  const parsed = lines.map((l) => ({ ...l, quantity: parseNumber(l.qty), unitCost: parseNumber(l.cost) }));
  const lineValue = (l: { quantity: number | null; unitCost: number | null }) => (l.quantity !== null && l.unitCost !== null && !Number.isNaN(l.quantity) && !Number.isNaN(l.unitCost) ? Math.round(l.quantity * l.unitCost) : 0);
  const sum = parsed.reduce((s, l) => s + lineValue(l), 0);
  const typedTotal = totalText === null ? null : parseNumber(totalText);
  const total = typedTotal !== null && !Number.isNaN(typedTotal) ? typedTotal : sum;
  const paid = (() => { const n = parseNumber(paidText); return n === null || Number.isNaN(n) ? 0 : n; })();
  const owed = Math.max(0, total - paid);

  const changeBillDate = (v: string) => setBillDate(v);
  const setLine = (key: string, patch: Partial<DraftLine>) => setLines((s) => s.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: PurchaseInput = {
      id: draftId, orgId, partnerId, invoiceNo: invoice, billDate, dueDate: due || null, total, note, locationId: effLocation,
      lines: parsed.map((l) => ({ id: l.id, materialId: l.materialId, quantity: l.quantity ?? NaN, unitCost: l.unitCost ?? NaN, lotNo: l.lotNo, lotExpiry: l.lotExpiry || null })),
      paid, method,
    };
    const bad = validatePurchase(input, todayLocal());
    if (bad) return setError(bad);
    if (parsed.some((l) => l.lotExpiry && !l.lotNo.trim())) return setError('Đã nhập hạn dùng thì cần nhập cả số lô.');
    setBusy(true);
    try {
      await recordPurchase(input);
      try { localStorage.setItem(LAST_LOCATION_KEY, effLocation); } catch { /* bỏ qua */ }
      setSaved({ partner: partners.find((p) => p.id === partnerId)?.name ?? '', invoice: invoice.trim(), total, paid, due: due || null });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSaved(null);
    setDraftId(crypto.randomUUID());
    setInvoice('');
    setLines([newLine()]);
    setTotalText(null);
    setPaidText('0');
    setNote('');
    setError(null);
    setBillDate(todayLocal());
    setDue('');
  }

  if (saved) {
    const left = saved.total - saved.paid;
    return (
      <section>
        <h1>Đã lưu hóa đơn mua</h1>
        <div className="card">
          <p><strong>{saved.partner}</strong>{saved.invoice ? ` · hóa đơn ${saved.invoice}` : ''}</p>
          <p>Tổng tiền: <strong>{formatMoney(saved.total)}</strong> · Đã trả: {formatMoney(saved.paid)}</p>
          {left > 0 ? (
            <p className="msg warn" role="status">Còn nợ {formatMoney(left)}{saved.due ? `, hạn thanh toán ${fmtDate(saved.due)}` : ''}.</p>
          ) : (
            <p className="msg ok" role="status">Đã trả đủ.</p>
          )}
          <p className="muted">Các dòng vật tư đã được nhập vào kho.</p>
        </div>
        <button className="primary" onClick={again}>Nhập hóa đơn khác</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  if (mats.length === 0 || locs.length === 0) {
    return (
      <section>
        <h1>Mua theo hóa đơn</h1>
        <p className="msg warn">
          {mats.length === 0 ? 'Chưa có vật tư nào. ' : ''}{locs.length === 0 ? 'Chưa có kho nào. ' : ''}
          Hãy tạo trong tab Khai báo (Vật tư, Kho và đơn vị) rồi quay lại đây.
        </p>
        <button className="secondary" onClick={onClose}>Quay lại</button>
      </section>
    );
  }

  return (
    <section>
      <h1>Mua theo hóa đơn</h1>
      {!online && <p className="msg warn" role="status">Đang offline: lưu hóa đơn cần có mạng.</p>}
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        <label>
          Nhà cung ứng
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— Chọn nhà cung ứng —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {!quickAdd && <button type="button" className="link" onClick={() => setQuickAdd(true)}>+ Thêm nhà cung ứng mới</button>}
        {quickAdd && (
          <SupplierForm title="Thêm nhà cung ứng" busy={busy || !online} onClose={() => setQuickAdd(false)}
            onSave={async (f) => {
              try {
                const nid = await createSupplier(orgId, f);
                await reloadPartners();
                setPartnerId(nid);
                setQuickAdd(false);
              } catch (err) { setError(friendlyError(err)); }
            }} />
        )}

        <div className="pair">
          <label>Số hóa đơn<input value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} placeholder="Nếu có" /></label>
          <label>Ngày mua<input type="date" value={billDate} max={todayLocal()} onChange={(e) => changeBillDate(e.target.value)} /></label>
        </div>

        {locs.length > 1 && (
          <label>
            Nhập vào kho
            <select value={effLocation} onChange={(e) => setLocationId(e.target.value)}>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}

        <fieldset className="roles">
          <legend>Hàng đã mua</legend>
          {parsed.map((l) => (
            <div className="member" key={l.key}>
              <select aria-label="Vật tư" value={l.materialId} onChange={(e) => setLine(l.key, { materialId: e.target.value })}>
                <option value="">— Chọn vật tư —</option>
                {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="pair">
                <label>Số lượng{l.materialId ? ` (${unitOf(l.materialId)})` : ''}
                  <input value={lines.find((x) => x.key === l.key)!.qty} inputMode="decimal" onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                </label>
                <label>Đơn giá (đ){l.materialId && unitOf(l.materialId) ? ` / ${unitOf(l.materialId)}` : ''}
                  <input value={lines.find((x) => x.key === l.key)!.cost} inputMode="numeric" onChange={(e) => setLine(l.key, { cost: e.target.value })} />
                </label>
              </div>
              <div className="pair">
                <label>Số lô (nếu có)<input value={l.lotNo} maxLength={60} onChange={(e) => setLine(l.key, { lotNo: e.target.value })} /></label>
                <label>Hạn dùng<input type="date" value={l.lotExpiry} onChange={(e) => setLine(l.key, { lotExpiry: e.target.value })} /></label>
              </div>
              <div className="row">
                <span className="muted">Thành tiền: <strong>{formatMoney(lineValue(l))}</strong>{l.quantity ? ` (${formatQty(l.quantity)} ${unitOf(l.materialId)})` : ''}</span>
                {lines.length > 1 && <button type="button" className="link inline" aria-label="Xóa dòng" onClick={() => setLines((s) => s.filter((x) => x.key !== l.key))}>Xóa dòng</button>}
              </div>
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => setLines((s) => [...s, newLine()])}>+ Thêm dòng vật tư</button>
        </fieldset>

        <label>
          Tổng tiền hóa đơn (đ)
          <input value={totalText ?? String(sum)} inputMode="numeric" onChange={(e) => setTotalText(e.target.value)} />
          {totalText !== null && total !== sum && <small className="warn">Khác tổng các dòng ({formatMoney(sum)}). Chỉ sửa khi hóa đơn có thêm phí vận chuyển, chiết khấu…</small>}
          {totalText !== null && <button type="button" className="link inline" onClick={() => setTotalText(null)}>Tự cộng lại từ các dòng</button>}
        </label>

        <div className="pair">
          <label>Đã trả (đ)
            <input value={paidText} inputMode="numeric" onChange={(e) => setPaidText(e.target.value)} />
          </label>
          <label>Hình thức trả
            <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')}>
              <option value="cash">Tiền mặt</option>
              <option value="transfer">Chuyển khoản</option>
            </select>
          </label>
        </div>
        <div className="pair">
          <button type="button" className="secondary" onClick={() => setPaidText(String(total))}>Trả đủ</button>
          <button type="button" className="secondary" onClick={() => setPaidText('0')}>Chưa trả (nợ)</button>
        </div>
        <p className={owed > 0 ? 'msg warn' : 'msg ok'} role="status">{owed > 0 ? `Còn nợ nhà cung ứng: ${formatMoney(owed)}` : 'Đã trả đủ, không còn nợ.'}</p>

        <label>
          Hạn thanh toán (bạn nhập)
          <input type="date" value={due} min={billDate} onChange={(e) => setDue(e.target.value)} />
          <small>{owed > 0 && !due ? 'Còn nợ mà chưa nhập hạn: app sẽ không nhắc quá hạn cho hóa đơn này.' : 'Ngày phải trả hết nợ cho nhà cung ứng; để trống nếu không có hạn.'}</small>
        </label>
        <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>

        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={busy || !online}>{busy ? 'Đang lưu…' : 'Lưu hóa đơn'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
