import { useEffect, useMemo, useRef, useState } from 'react';
import { SupplierForm } from './PartnersSection';
import { friendlyError } from '../lib/errors';
import { createMaterial } from '../lib/inventory';
import { matchMaterial, matchSupplier, unitsDiffer, type AliasLike } from '../lib/invoiceMatch';
import { getScanUsage, loadAliases, MAX_PHOTOS, prepareImage, scanInvoice, type InvoiceDraft, type ScanUsage } from '../lib/invoiceScan';
import { createSupplier, type Partner } from '../lib/partners';
import { parseNumber } from '../lib/inventory';
import { useConfig } from '../lib/config';
import { todayLocal } from '../lib/hooks';
import type { MaterialRow, UnitRow } from '../lib/db';

/** Kết quả đã được người dùng kiểm tra, trả về cho màn Nhập kho để điền vào phiếu */
export interface ScanApply {
  partnerId: string;
  invoiceNo: string;
  billDate: string;
  total: number | null;
  lines: { materialId: string; qty: string; cost: string }[];
  /** Cặp "tên trên phiếu → vật tư" để học cho lần sau (lưu sau khi hóa đơn đã lưu thành công) */
  aliasItems: { name: string; materialId: string }[];
}

interface Photo { id: string; preview: string; data: string }
interface RevLine { key: string; ten: string; unit: string | null; qty: string; price: string; materialId: string; via: 'alias' | 'name' | null; include: boolean; factor: string; newOpen: boolean; warn: boolean }

/**
 * "📷 Chụp phiếu": chọn ảnh (tối đa 3) → đọc → MÀN KIỂM TRA: nhà cung cấp (có sẵn hoặc thêm mới), số hóa đơn, ngày, tổng tiền, từng dòng hàng
 * (ghép với vật tư có sẵn hoặc thêm vật tư mới, quy đổi đơn vị nếu khác) → "Điền vào phiếu nhập". Ảnh không được lưu. Kết quả chỉ là bản nháp.
 */
export function InvoiceScanner({ orgId, partners, mats, units, reloadPartners, onApply, onCancel }: {
  orgId: string; partners: Partner[]; mats: MaterialRow[]; units: UnitRow[];
  reloadPartners: () => Promise<void>; onApply: (r: ScanApply) => void; onCancel: () => void;
}) {
  const cfg = useConfig();
  const [stage, setStage] = useState<'pick' | 'reading' | 'review'>('pick');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [consent, setConsent] = useState(true); // mặc định đồng ý (D158); bỏ tích thì không đọc
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ScanUsage | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [partnerHow, setPartnerHow] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [billDate, setBillDate] = useState(todayLocal());
  const [totalText, setTotalText] = useState('');
  const [rev, setRev] = useState<RevLine[]>([]);
  const [aliases, setAliases] = useState<AliasLike[]>([]);

  useEffect(() => { void getScanUsage(orgId).then(setUsage); }, [orgId]);
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unitOf = (materialId: string) => units.find((u) => u.id === mats.find((m) => m.id === materialId)?.base_unit_id)?.name ?? '';
  const sortedMats = useMemo(() => [...mats].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [mats]);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setError(`Tối đa ${MAX_PHOTOS} ảnh cho một phiếu.`);
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const f of Array.from(list).slice(0, room)) added.push({ id: crypto.randomUUID(), preview: URL.createObjectURL(f), data: await prepareImage(f) });
      setPhotos((p) => [...p, ...added]);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function read() {
    setError(null);
    setStage('reading');
    try {
      const { draft: d, usage: u } = await scanInvoice(orgId, photos.map((p) => p.data));
      setUsage(u);
      // ghép nhà cung cấp, rồi tải bí danh của nhà cung cấp đó để ghép vật tư
      const ps = matchSupplier(d.nha_cung_cap, partners);
      const al = await loadAliases(orgId, ps?.id ?? null);
      setAliases(al);
      setPartnerId(ps?.id ?? '');
      setPartnerHow(ps ? (ps.via === 'tax' ? 'khớp mã số thuế' : ps.via === 'phone' ? 'khớp số điện thoại' : 'giống tên') : null);
      setInvoiceNo(d.ma_don ?? '');
      setBillDate(d.ngay && d.ngay <= todayLocal() ? d.ngay : todayLocal());
      setTotalText(d.tong_tien !== null ? String(d.tong_tien) : '');
      setRev(d.dong_hang.map((l) => {
        const m = matchMaterial(l.ten, mats, al, ps?.id ?? null);
        return {
          key: crypto.randomUUID(), ten: l.ten, unit: l.don_vi, materialId: m?.id ?? '', via: m?.via ?? null, include: true, factor: '', newOpen: false,
          qty: l.so_luong !== null ? String(l.so_luong).replace('.', ',') : '', price: l.don_gia !== null ? String(l.don_gia) : (l.so_luong && l.thanh_tien ? String(Math.round(l.thanh_tien / l.so_luong)) : ''),
          warn: l.so_luong === null || l.don_gia === null,
        };
      }));
      setDraft(d);
      setStage('review');
    } catch (e) {
      setError(friendlyError(e));
      setStage('pick');
    }
  }

  const setLine = (key: string, patch: Partial<RevLine>) => setRev((s) => s.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function apply() {
    setError(null);
    const picked = rev.filter((l) => l.include);
    if (picked.length === 0) return setError('Hãy giữ lại ít nhất một dòng hàng để nhập kho.');
    const out: ScanApply['lines'] = [];
    for (const [i, l] of picked.entries()) {
      const label = `Dòng "${l.ten}"`;
      if (!l.materialId) return setError(`${label}: hãy chọn vật tư, thêm vật tư mới, hoặc bỏ tích "Nhập dòng này".`);
      let qty = parseNumber(l.qty);
      let price = parseNumber(l.price);
      if (qty === null || Number.isNaN(qty) || qty <= 0) return setError(`${label}: hãy nhập số lượng lớn hơn 0.`);
      const stock = unitOf(l.materialId);
      if (unitsDiffer(l.unit, stock)) {
        const f = parseNumber(l.factor);
        if (f === null || Number.isNaN(f) || f <= 0) return setError(`${label}: đơn vị trên phiếu (${l.unit}) khác đơn vị kho (${stock}). Hãy nhập 1 ${l.unit} bằng bao nhiêu ${stock}.`);
        qty = Math.round(qty * f * 1000) / 1000;
        if (price !== null && !Number.isNaN(price)) price = Math.round(price / f);
      }
      if (price !== null && !Number.isNaN(price) && (!Number.isInteger(price) || price < 0)) return setError(`${label}: đơn giá phải là số tiền (đồng).`);
      out.push({ materialId: l.materialId, qty: String(qty).replace('.', ','), cost: price !== null && !Number.isNaN(price) ? String(price) : '' });
      void i;
    }
    const total = parseNumber(totalText);
    onApply({
      partnerId, invoiceNo: invoiceNo.trim(), billDate: billDate > todayLocal() ? todayLocal() : billDate,
      total: total !== null && !Number.isNaN(total) ? Math.round(total) : null,
      lines: out, aliasItems: picked.map((l) => ({ name: l.ten, materialId: l.materialId })),
    });
  }

  // ------------------------------------------------------------------ chọn ảnh
  if (stage === 'pick' || stage === 'reading') {
    const reading = stage === 'reading';
    const noQuota = usage !== null && usage.remaining <= 0;
    return (
      <section>
        <h1>📷 Chụp phiếu nhập hàng</h1>
        <p>Chụp hoặc chọn ảnh <strong>hóa đơn / phiếu giao hàng</strong> (tối đa {MAX_PHOTOS} ảnh; nhiều trang thì chụp từng trang). App đọc và <strong>điền sẵn</strong> vào phiếu nhập kho, bạn kiểm tra lại rồi mới lưu.</p>
        <p className="muted">Mẹo: đặt phiếu phẳng, đủ sáng, chụp thẳng và thấy hết chữ.</p>
        {usage && <p className={noQuota ? 'msg warn' : 'muted'} role="status">{usage.status === 'trial' ? 'Đang dùng thử: ' : ''}Còn <strong>{usage.remaining}</strong>/{usage.limit} lần đọc trong tháng này.</p>}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
        <div className="btnrow">
          <button type="button" className="secondary" disabled={busy || reading || photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()}>📷 Chụp ảnh</button>
          <button type="button" className="secondary" disabled={busy || reading || photos.length >= MAX_PHOTOS} onClick={() => gallery.current?.click()}>🖼 Chọn ảnh có sẵn</button>
        </div>
        {photos.length > 0 && (
          <div className="scan-thumbs">
            {photos.map((p, i) => (
              <figure key={p.id}>
                <img src={p.preview} alt={`Ảnh ${i + 1}`} />
                <button type="button" className="link inline" disabled={reading} onClick={() => { URL.revokeObjectURL(p.preview); setPhotos((s) => s.filter((x) => x.id !== p.id)); }}>Bỏ ảnh {i + 1}</button>
              </figure>
            ))}
          </div>
        )}
        {busy && <p className="muted" role="status">Đang xử lý ảnh…</p>}
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Tôi đồng ý gửi ảnh phiếu tới dịch vụ đọc ảnh (Cloudflare) để lấy chữ. Ảnh chỉ gửi khi bấm "Đọc phiếu" và <strong>không được lưu lại</strong>.</span>
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {reading && <p className="msg ok" role="status">Đang đọc phiếu… khoảng 10–30 giây, vui lòng đợi.</p>}
        <div className="btnrow">
          <button type="button" className="primary" disabled={photos.length === 0 || !consent || busy || reading || noQuota} onClick={() => void read()}>{reading ? 'Đang đọc…' : 'Đọc phiếu'}</button>
          <button type="button" className="secondary" disabled={reading} onClick={onCancel}>Hủy, nhập tay</button>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------ màn kiểm tra
  const supplierName = partners.find((p) => p.id === partnerId)?.name;
  const pseudo: Partner = {
    id: '', organization_id: orgId, name: draft?.nha_cung_cap.ten ?? '', phone: draft?.nha_cung_cap.dien_thoai ?? null, address: draft?.nha_cung_cap.dia_chi ?? null,
    province: null, ward: null, tax_code: draft?.nha_cung_cap.ma_so_thue ?? null, bank_account: null, goods: null, note: null, is_supplier: true, is_customer: false, is_active: true, version: 1,
  };
  return (
    <section>
      <h1>Kiểm tra phiếu đã đọc</h1>
      <p className="msg warn" role="status">Đây chỉ là <strong>bản nháp</strong>. Hãy so với phiếu thật, nhất là số lượng và số tiền, rồi sửa nếu cần.</p>
      {draft && draft.canh_bao.length > 0 && (
        <div className="msg warn" role="status"><strong>Cần chú ý:</strong><ul>{draft.canh_bao.map((w) => <li key={w}>{w}</li>)}</ul></div>
      )}
      {draft?.ghi_chu_khong_chac && <p className="muted">Ghi chú khi đọc: {draft.ghi_chu_khong_chac}</p>}

      <div className="card">
        <h2>Nhà cung cấp (bên bán)</h2>
        <p className="muted">Trên phiếu: <strong>{draft?.nha_cung_cap.ten ?? 'không đọc được'}</strong>{draft?.nha_cung_cap.ma_so_thue ? ` · MST ${draft.nha_cung_cap.ma_so_thue}` : ''}{draft?.nha_cung_cap.dien_thoai ? ` · ${draft.nha_cung_cap.dien_thoai}` : ''}</p>
        <label>
          Nhà cung cấp trong danh bạ
          <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setPartnerHow(null); }}>
            <option value="">— Chưa chọn —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {partnerId && partnerHow && <p className="msg ok" role="status">Đã ghép với "{supplierName}" ({partnerHow}).</p>}
        {!partnerId && !supplierForm && <button type="button" className="secondary" onClick={() => setSupplierForm(true)}>+ Thêm "{draft?.nha_cung_cap.ten ?? 'nhà cung cấp'}" vào danh bạ</button>}
        {supplierForm && (
          <SupplierForm title="Thêm nhà cung ứng" initial={pseudo} busy={busy} onClose={() => setSupplierForm(false)}
            onSave={async (f) => {
              setBusy(true);
              try { const nid = await createSupplier(orgId, f); await reloadPartners(); setPartnerId(nid); setPartnerHow(null); setSupplierForm(false); setAliases(await loadAliases(orgId, nid)); }
              catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
            }} />
        )}
        <div className="pair">
          <label>Số hóa đơn / mã đơn<input value={invoiceNo} maxLength={60} onChange={(e) => setInvoiceNo(e.target.value)} /></label>
          <label>Ngày mua<input type="date" value={billDate} max={todayLocal()} onChange={(e) => setBillDate(e.target.value)} /></label>
        </div>
        <label>Tổng tiền trên phiếu (đ)<input value={totalText} inputMode="numeric" onChange={(e) => setTotalText(e.target.value)} placeholder="Để trống: app tự cộng các dòng" /></label>
      </div>

      <h2>Hàng đã mua ({rev.length} dòng)</h2>
      {rev.length === 0 && <p className="msg warn">Không đọc được dòng hàng nào. Bạn có thể chụp lại rõ hơn hoặc nhập tay.</p>}
      {rev.map((l, idx) => {
        const stock = unitOf(l.materialId);
        const differ = l.materialId ? unitsDiffer(l.unit, stock) : false;
        return (
          <div className={`card scan-line${l.warn ? ' warn' : ''}${l.include ? '' : ' off'}`} key={l.key}>
            <label className="check">
              <input type="checkbox" checked={l.include} onChange={(e) => setLine(l.key, { include: e.target.checked })} />
              <span>Dòng {idx + 1}: <strong>{l.ten}</strong>{l.unit ? ` (${l.unit})` : ''}</span>
            </label>
            {l.include && (<>
              <label>
                Vật tư trong kho{l.via === 'alias' ? ' (đã nhớ từ lần trước)' : l.via === 'name' ? ' (gợi ý theo tên, hãy kiểm tra)' : ''}
                <select value={l.materialId} onChange={(e) => setLine(l.key, { materialId: e.target.value, via: null, factor: '' })}>
                  <option value="">— Chưa chọn vật tư —</option>
                  {sortedMats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              {!l.materialId && !l.newOpen && <button type="button" className="link" onClick={() => setLine(l.key, { newOpen: true })}>+ Thêm "{l.ten}" thành vật tư mới</button>}
              {l.newOpen && !l.materialId && (
                <NewMaterial name={l.ten} units={units} unitHint={l.unit} groups={cfg.materialGroups('')} busy={busy}
                  onClose={() => setLine(l.key, { newOpen: false })}
                  onCreate={async (v) => {
                    setBusy(true);
                    try { const id = await createMaterial(orgId, { name: v.name, category: '', unitId: v.unitId, threshold: null, ext: v.group ? { material_group: v.group } : {} }); setLine(l.key, { materialId: id, via: null, newOpen: false, factor: '' }); }
                    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
                  }} />
              )}
              <div className="pair">
                <label>Số lượng{l.unit ? ` (${l.unit})` : ''}<input value={l.qty} inputMode="decimal" onChange={(e) => setLine(l.key, { qty: e.target.value, warn: false })} /></label>
                <label>Đơn giá (đ){l.unit ? ` / ${l.unit}` : ''}<input value={l.price} inputMode="numeric" onChange={(e) => setLine(l.key, { price: e.target.value, warn: false })} /></label>
              </div>
              {differ && (
                <label>
                  Đơn vị phiếu ({l.unit}) khác đơn vị kho ({stock}): 1 {l.unit} = bao nhiêu {stock}?
                  <input value={l.factor} inputMode="decimal" onChange={(e) => setLine(l.key, { factor: e.target.value })} placeholder={`Ví dụ 25 (bao 25 ${stock})`} />
                </label>
              )}
            </>)}
          </div>
        );
      })}

      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy || rev.length === 0} onClick={apply}>Điền vào phiếu nhập</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setStage('pick'); setError(null); }}>Chụp lại</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Hủy, nhập tay</button>
      </div>
      <p className="muted">Chưa lưu gì cả. Bước tiếp theo bạn xem lại phiếu nhập kho rồi mới bấm Lưu.</p>
    </section>
  );
}

function NewMaterial({ name, units, unitHint, groups, busy, onCreate, onClose }: {
  name: string; units: UnitRow[]; unitHint: string | null; groups: { id: string; label: string }[]; busy: boolean;
  onCreate: (v: { name: string; unitId: string; group: string }) => Promise<void>; onClose: () => void;
}) {
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const guess = sorted.find((u) => unitHint && u.name.trim().toLowerCase() === unitHint.trim().toLowerCase())?.id ?? sorted[0]?.id ?? '';
  const [n, setN] = useState(name);
  const [unitId, setUnitId] = useState(guess);
  const [group, setGroup] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="inline-form">
      <label>Tên vật tư mới<input value={n} maxLength={120} onChange={(e) => setN(e.target.value)} /></label>
      <label>Nhóm vật tư
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">— Chưa phân nhóm —</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>
      <label>Đơn vị tính (đơn vị trong kho)
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{sorted.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => { if (n.trim().length < 2) return setErr('Hãy nhập tên vật tư (ít nhất 2 ký tự).'); if (!unitId) return setErr('Hãy chọn đơn vị tính.'); setErr(null); void onCreate({ name: n, unitId, group }); }}>Lưu vật tư</button>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}
