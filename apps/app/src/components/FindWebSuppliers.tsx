import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { addSupplierFromWeb, findWebShops, type WebShop } from '../lib/partners';
import { PROVINCES, formatAddr } from '../lib/vnAddress';

/**
 * "Tìm trên website": gian hàng vật tư đang hoạt động trên website, lọc theo tỉnh/thành phố và từ khóa. Bấm "Thêm vào nhà cung ứng" thì
 * thông tin gian hàng (tên, điện thoại, địa chỉ, loại hàng) được sao sang nhà cung ứng của cơ sở và mở sẵn form sửa để bạn thêm ghi chú.
 */
export function FindWebSuppliers({ orgId, defaultProvince, onAdded }: { orgId: string; defaultProvince?: string; onAdded: (partnerId: string, status: string) => void }) {
  const [province, setProvince] = useState(defaultProvince && PROVINCES.includes(defaultProvince) ? defaultProvince : '');
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ total: number; rows: WebShop[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(offset = 0) {
    setBusy(true); setError(null);
    try {
      const r = await findWebShops(orgId, q, province, offset);
      setRes(offset > 0 && res ? { total: r.total, rows: [...res.rows, ...r.rows] } : r);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function add(s: WebShop) {
    setBusy(true); setError(null);
    try { const r = await addSupplierFromWeb(orgId, s.id); onAdded(r.id, r.status); } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  return (
    <div className="inline-form">
      <p className="muted">Gian hàng vật tư đã đăng ký và được duyệt trên website. Bấm "Thêm vào nhà cung ứng" để sao thông tin sang danh sách của bạn, rồi chỉ cần thêm ghi chú.</p>
      <label>Tỉnh/thành phố
        <select value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">Tất cả khu vực</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>Tìm theo tên gian hàng hoặc vật tư<input value={q} maxLength={80} placeholder="Ví dụ: phân NPK, chế phẩm sinh học" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} /></label>
      <div className="btnrow"><button type="button" className="primary" disabled={busy} onClick={() => void search()}>{busy ? 'Đang tìm…' : 'Tìm gian hàng'}</button></div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {res && <p className="muted">{res.total === 0 ? 'Không tìm thấy gian hàng phù hợp. Thử bỏ bớt bộ lọc.' : `${res.total} gian hàng`}</p>}
      {res?.rows.map((s) => (
        <div className="card slim" key={s.id}>
          <strong>{s.name}</strong>{s.license_verified && <span className="pill ok"> ✔ Đã kiểm tra giấy phép</span>}
          <p className="muted">{formatAddr({ address: s.address, ward: s.ward, province: s.province })}</p>
          {s.phone && <p className="muted">Điện thoại: <a href={`tel:${s.phone}`}>{s.phone}</a></p>}
          {s.materials.length > 0 && <p className="muted">Bán: {s.materials.join(', ')}{s.material_count > s.materials.length ? ` … (${s.material_count} vật tư)` : ''}</p>}
          <div className="btnrow">
            {s.added_partner_id
              ? <button type="button" className="secondary" disabled>Đã có trong nhà cung ứng</button>
              : <button type="button" className="primary" disabled={busy} onClick={() => void add(s)}>Thêm vào nhà cung ứng</button>}
          </div>
        </div>
      ))}
      {res && res.rows.length < res.total && <div className="btnrow"><button type="button" className="secondary" disabled={busy} onClick={() => void search(res.rows.length)}>Xem thêm</button></div>}
    </div>
  );
}
