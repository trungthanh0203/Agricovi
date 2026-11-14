import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useCatalog } from '../lib/catalog';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { listCoopHouseholds, type CoopHousehold } from '../lib/members';
import { useOrgs } from '../lib/orgs';
import { listCustomers, type Customer } from '../lib/partners';
import { canPerm } from '../lib/permissions';
import {
  buildContractDoc, cancelContract, CONTRACT_KIND_LABEL, CONTRACT_STATUS_LABEL, deleteContractDraft, fetchContracts, markContractDone, markContractSigned, PAY_METHOD_LABEL, PRICE_MODE_LABEL, saveContract,
  type ContractKind, type PayMethod, type PriceMode, type TradeContract,
} from '../lib/tradeContracts';

interface Form {
  id: string | null; kind: ContractKind; cpOrg: string; partner: string; name: string; rep: string; phone: string; address: string; tax: string;
  cropId: string; product: string; qty: string; mode: PriceMode; price: string; quality: string; from: string; to: string; place: string; payDays: string; method: PayMethod; extra: string; validTo: string;
}
const money = (s: string) => Number(s.replace(/[.,\s]/g, ''));
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

/**
 * Hợp đồng bao tiêu / mua bán (mục 13 lát 2). Lập hợp đồng điền sẵn từ dữ liệu đã có (hộ thành viên, khách hàng, sản phẩm), in để ký tay, đánh dấu đã ký / hoàn thành / hủy.
 * HTX lập hợp đồng bao tiêu với hộ thành viên; cơ sở có quyền Doanh thu lập hợp đồng bán cho khách. Mẫu tham khảo, cần luật sư xem trước khi ký; chưa ký số.
 */
export function ContractsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id;
  const { cropTypes } = useCatalog();
  const [rows, setRows] = useState<TradeContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [view, setView] = useState<string | null>(null);        // hợp đồng đang xem/in
  const [signing, setSigning] = useState<{ id: string; date: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);
  const [households, setHouseholds] = useState<CoopHousehold[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const today = todayLocal();

  const canProcure = Boolean(active && active.type === 'cooperative' && canPerm(active.perms, 'coop', 'edit'));
  const canSale = Boolean(active && canPerm(active.perms, 'sales', 'edit'));
  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setRows(await fetchContracts(orgId)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!orgId || !navigator.onLine) return;
    if (canProcure) listCoopHouseholds(orgId).then(setHouseholds).catch(() => undefined);
    if (canSale) listCustomers(orgId).then(setCustomers).catch(() => undefined);
  }, [orgId, canProcure, canSale]);

  const current = useMemo(() => (rows ?? []).find((c) => c.id === view) ?? null, [rows, view]);
  if (!active || !orgId) return null;

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError(null);
    try { await fn(); await load(); return true; } catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(false); }
  }
  const blank = (kind: ContractKind): Form => ({
    id: null, kind, cpOrg: '', partner: '', name: '', rep: '', phone: '', address: '', tax: '', cropId: '', product: '', qty: '', mode: 'fixed', price: '', quality: '',
    from: '', to: '', place: '', payDays: '7', method: 'transfer', extra: '', validTo: '',
  });
  function toForm(c: TradeContract): Form {
    return {
      id: c.id, kind: c.kind, cpOrg: c.counterparty_org_id ?? '', partner: c.partner_id ?? '', name: c.counterparty_name, rep: c.counterparty_rep ?? '', phone: c.counterparty_phone ?? '', address: c.counterparty_address ?? '',
      tax: c.counterparty_tax_code ?? '', cropId: c.crop_type_id ?? '', product: c.product_name, qty: c.quantity_kg !== null ? String(c.quantity_kg) : '', mode: c.price_mode, price: c.unit_price !== null ? String(c.unit_price) : '',
      quality: c.quality_note ?? '', from: c.delivery_from ?? '', to: c.delivery_to ?? '', place: c.delivery_place ?? '', payDays: c.payment_days !== null ? String(c.payment_days) : '', method: c.payment_method, extra: c.extra_terms ?? '', validTo: c.valid_to ?? '',
    };
  }
  function pickHousehold(id: string) {
    const h = households.find((x) => x.household_org_id === id);
    setForm((f) => f && ({ ...f, cpOrg: id, name: h?.name ?? '', rep: h?.head_name ?? '', phone: h?.phone ?? '', address: [h?.address, h?.ward, h?.province].filter(Boolean).join(', ') }));
  }
  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    setForm((f) => f && ({ ...f, partner: id, name: c?.name ?? f.name, phone: c?.phone ?? '', address: [c?.address, c?.ward, c?.province].filter(Boolean).join(', '), tax: c?.tax_code ?? '' }));
  }
  function pickCrop(id: string) {
    const t = cropTypes.find((x) => x.id === id);
    setForm((f) => f && ({ ...f, cropId: id, product: t?.name ?? f.product }));
  }

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 2) return setError(form.kind === 'procure' ? 'Hãy chọn hộ thành viên.' : 'Hãy chọn hoặc nhập tên bên mua.');
    if (form.kind === 'procure' && !form.cpOrg) return setError('Hãy chọn hộ thành viên của HTX.');
    if (form.product.trim().length < 2) return setError('Hãy chọn hoặc nhập sản phẩm.');
    const price = form.price.trim() ? money(form.price) : null;
    if (form.mode !== 'market' && !(price && price > 0)) return setError('Giá cố định hoặc giá sàn cần có đơn giá lớn hơn 0.');
    const qty = form.qty.trim() ? Number(form.qty.replace(/\./g, '').replace(',', '.')) : null;
    if (qty !== null && !(qty > 0)) return setError('Khối lượng dự kiến phải lớn hơn 0.');
    const payDays = form.payDays.trim() === '' ? null : Number(form.payDays);
    if (payDays !== null && (!Number.isInteger(payDays) || payDays < 0 || payDays > 365)) return setError('Số ngày thanh toán từ 0 đến 365.');
    const ok = await run(() => saveContract(orgId!, {
      id: form.id, kind: form.kind, counterpartyOrgId: form.kind === 'procure' ? form.cpOrg : null, partnerId: form.kind === 'sale' && form.partner ? form.partner : null,
      name: form.name.trim(), rep: form.rep.trim(), phone: form.phone.trim(), address: form.address.trim(), taxCode: form.tax.trim(),
      cropId: form.cropId || null, product: form.product.trim(), cycleId: null, quantityKg: qty, priceMode: form.mode, unitPrice: form.mode === 'market' ? null : price, quality: form.quality.trim(),
      deliveryFrom: form.from || null, deliveryTo: form.to || null, place: form.place.trim(), payDays, payMethod: form.method, extra: form.extra.trim(), validTo: form.validTo || null,
    }));
    if (ok) setForm(null);
  }

  const doc = current ? buildContractDoc(current, active.name) : null;
  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: hợp đồng cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="no-print">
        <p className="muted">Lập hợp đồng điền sẵn từ thông tin đã có, in ra để hai bên ký tay. Đây là mẫu tham khảo: hãy nhờ luật sư hoặc cán bộ pháp chế xem trước khi ký. App chưa hỗ trợ ký số.</p>
        {!form && (
          <div className="btnrow">
            {canProcure && <button type="button" className="primary" disabled={!online} onClick={() => { setError(null); setForm(blank('procure')); }}>＋ Hợp đồng bao tiêu với hộ</button>}
            {canSale && <button type="button" className="secondary" disabled={!online} onClick={() => { setError(null); setForm(blank('sale')); }}>＋ Hợp đồng bán cho khách</button>}
          </div>
        )}

        {form && (
          <div className="inline-form">
            <p><strong>{form.id ? 'Sửa hợp đồng (bản nháp)' : CONTRACT_KIND_LABEL[form.kind]}</strong></p>
            {form.kind === 'procure' ? (
              <label>Hộ thành viên (bên bán)
                <select value={form.cpOrg} onChange={(e) => pickHousehold(e.target.value)}>
                  <option value="">— Chọn hộ —</option>
                  {households.map((h) => <option key={h.household_org_id} value={h.household_org_id}>{h.name}</option>)}
                </select>
              </label>
            ) : (
              <label>Khách hàng (bên mua)
                <select value={form.partner} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">— Chọn khách đã có, hoặc nhập tên bên dưới —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <div className="pair">
              <label>Tên bên kia<input value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Người đại diện<input value={form.rep} maxLength={120} onChange={(e) => setForm({ ...form, rep: e.target.value })} /></label>
            </div>
            <div className="pair">
              <label>Điện thoại<input value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              {form.kind === 'sale' && <label>Mã số thuế<input value={form.tax} maxLength={40} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>}
            </div>
            <label>Địa chỉ<input value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <p className="muted">Thông tin chưa có sẽ để dòng chấm trên bản in cho hai bên điền tay. App không tự lấy số CCCD hay địa chỉ cá nhân.</p>

            <div className="pair">
              <label>Sản phẩm
                <select value={form.cropId} onChange={(e) => pickCrop(e.target.value)}>
                  <option value="">— Chọn từ danh sách, hoặc nhập bên cạnh —</option>
                  {cropTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>Tên sản phẩm ghi trong hợp đồng<input value={form.product} maxLength={120} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Ví dụ: Sầu riêng Ri6 loại 1" /></label>
            </div>
            <div className="pair">
              <label>Khối lượng dự kiến (kg)<input inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Không bắt buộc" /></label>
              <label>Cách tính giá
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as PriceMode })}>
                  {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map((m) => <option key={m} value={m}>{PRICE_MODE_LABEL[m]}</option>)}
                </select>
              </label>
            </div>
            {form.mode !== 'market' && <label>Đơn giá (đồng/kg){form.mode === 'floor' ? ' — giá thấp nhất' : ''}<input inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>}
            <label>Yêu cầu chất lượng (không bắt buộc)<input value={form.quality} maxLength={1000} onChange={(e) => setForm({ ...form, quality: e.target.value })} placeholder="Ví dụ: loại 1, không sâu bệnh, đúng độ chín" /></label>
            <div className="pair">
              <label>Giao nhận từ ngày<input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
              <label>Đến ngày<input type="date" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
            </div>
            <label>Địa điểm giao nhận<input value={form.place} maxLength={300} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Ví dụ: kho HTX" /></label>
            <div className="pair">
              <label>Thanh toán sau (ngày) <span className="muted">· để trống = trả ngay</span><input inputMode="numeric" value={form.payDays} onChange={(e) => setForm({ ...form, payDays: e.target.value.replace(/\D/g, '') })} /></label>
              <label>Hình thức thanh toán
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PayMethod })}>
                  {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}
                </select>
              </label>
            </div>
            <label>Hợp đồng có hiệu lực đến ngày (không bắt buộc)<input type="date" value={form.validTo} min={form.from} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></label>
            <label>Điều khoản bổ sung (không bắt buộc, mỗi dòng một ý)<textarea rows={3} value={form.extra} maxLength={2000} onChange={(e) => setForm({ ...form, extra: e.target.value })} placeholder="Ví dụ: phạt vi phạm, thưởng giao sớm…" /></label>
            <div className="btnrow">
              <button type="button" className="primary" disabled={busy || !online} onClick={() => void save()}>{form.id ? 'Lưu thay đổi' : 'Lưu bản nháp'}</button>
              <button type="button" className="secondary" onClick={() => { setForm(null); setError(null); }}>Hủy</button>
            </div>
          </div>
        )}

        {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Cần có mạng.'}</p>}
        {rows !== null && rows.length === 0 && <p className="muted">Chưa có hợp đồng nào.</p>}
        {(rows ?? []).map((c) => (
          <div className={c.status === 'cancelled' ? 'card slim voided' : 'card slim'} key={c.id}>
            <div className="row">
              <strong className="grow">{c.contract_no} · {c.counterparty_name}</strong>
              <span className={`pill ${c.status === 'signed' || c.status === 'done' ? 'ok' : c.status === 'cancelled' ? 'err' : 'warn'}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
            </div>
            <p className="muted">
              {CONTRACT_KIND_LABEL[c.kind]} · {c.product_name}{c.quantity_kg ? ` · khoảng ${c.quantity_kg.toLocaleString('vi-VN')} kg` : ''} · {c.price_mode === 'market' ? 'giá thị trường' : `${c.price_mode === 'floor' ? 'giá sàn ' : ''}${vnd(c.unit_price ?? 0)}/kg`}
              {c.signed_on ? ` · ký ${fmtDate(c.signed_on)}` : ''}{c.valid_to ? ` · hiệu lực đến ${fmtDate(c.valid_to)}` : ''}
            </p>
            {c.cancel_reason && <p className="muted">Lý do hủy: {c.cancel_reason}</p>}
            {signing?.id !== c.id && cancelling?.id !== c.id && !form && (
              <div className="btnrow">
                <button type="button" className="secondary" onClick={() => setView(view === c.id ? null : c.id)}>{view === c.id ? 'Ẩn bản in' : 'Xem / In'}</button>
                {c.status === 'draft' && <button type="button" className="secondary" disabled={busy || !online} onClick={() => { setError(null); setForm(toForm(c)); }}>Sửa</button>}
                {c.status === 'draft' && <button type="button" className="primary" disabled={busy || !online} onClick={() => setSigning({ id: c.id, date: today })}>Đã ký</button>}
                {c.status === 'signed' && <button type="button" className="primary" disabled={busy || !online} onClick={() => void run(() => markContractDone(c.id))}>Đã hoàn thành</button>}
                {(c.status === 'draft' || c.status === 'signed') && <button type="button" className="link" disabled={busy || !online} onClick={() => setCancelling({ id: c.id, reason: '' })}>{c.status === 'draft' ? 'Xóa / hủy' : 'Hủy hợp đồng'}</button>}
              </div>
            )}
            {signing?.id === c.id && (
              <div className="inline-form">
                <label>Ngày ký<input type="date" value={signing.date} max={today} onChange={(e) => setSigning({ id: c.id, date: e.target.value })} /></label>
                <p className="muted">Sau khi đánh dấu đã ký sẽ không sửa được điều khoản; muốn đổi thì lập hợp đồng mới.</p>
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || !signing.date} onClick={() => void run(() => markContractSigned(c.id, signing.date)).then((ok) => { if (ok) setSigning(null); })}>Xác nhận đã ký</button>
                  <button type="button" className="secondary" onClick={() => setSigning(null)}>Không</button>
                </div>
              </div>
            )}
            {cancelling?.id === c.id && (
              <div className="inline-form">
                {c.status === 'draft' && <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => deleteContractDraft(c.id)).then((ok) => { if (ok) setCancelling(null); })}>Xóa bản nháp</button>}
                <label>Lý do hủy<input value={cancelling.reason} maxLength={300} onChange={(e) => setCancelling({ id: c.id, reason: e.target.value })} placeholder="Ví dụ: hai bên đổi thỏa thuận" /></label>
                <div className="btnrow">
                  <button type="button" className="primary" disabled={busy || cancelling.reason.trim().length < 3} onClick={() => void run(() => cancelContract(c.id, cancelling.reason)).then((ok) => { if (ok) setCancelling(null); })}>Xác nhận hủy</button>
                  <button type="button" className="secondary" onClick={() => setCancelling(null)}>Không</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {doc && <div className="btnrow"><button type="button" className="primary" onClick={() => window.print()}>In / Lưu PDF (A4 dọc)</button></div>}
        <Collapsible inline title="Lưu ý" summary="mẫu tham khảo">
          <p className="muted">Nội dung điều khoản do phần mềm lập sẵn theo thông tin đã nhập, không thay thế tư vấn pháp lý. Thông tin bên A (địa chỉ, mã số thuế, người đại diện) để dòng chấm để điền tay. Hợp đồng đã ký không sửa được điều khoản.</p>
        </Collapsible>
      </div>

      {doc && (
        <div id="print-root" className="contract-doc">
          <h2>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
          <p className="ct-center">Độc lập - Tự do - Hạnh phúc</p>
          <h2 className="ct-title">{doc.title}</h2>
          <p className="ct-center">{doc.number}</p>
          <p>{doc.intro}</p>
          {doc.parties.map((p) => (
            <div key={p.role}>
              <p><strong>{p.heading}</strong></p>
              {p.lines.map((l, i) => <p className="ct-line" key={i}>{l}</p>)}
            </div>
          ))}
          <p>Hai bên thỏa thuận ký hợp đồng với các điều khoản sau:</p>
          {doc.articles.map((a) => (
            <div key={a.title}>
              <p><strong>{a.title}</strong></p>
              {a.paras.map((t, i) => <p className="ct-para" key={i}>{t}</p>)}
            </div>
          ))}
          <p className="ct-center">{doc.closing}</p>
          <div className="logbook-sign"><span>ĐẠI DIỆN BÊN A<br />(ký, ghi rõ họ tên, đóng dấu nếu có)</span><span>ĐẠI DIỆN BÊN B<br />(ký, ghi rõ họ tên)</span></div>
          <p className="muted ct-note">{doc.note}</p>
        </div>
      )}
    </>
  );
}
