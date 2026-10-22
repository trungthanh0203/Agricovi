import { useState } from 'react';
import { clean, Err, fmtDateTime, rpc, useLoad } from '@agriconnect/admin-kit';

// ============================================================ Duyệt gian hàng vật tư
interface ShopRow {
  id: string; slug: string; name: string; description: string | null; province: string; district: string | null; address: string | null; phone: string | null; license_no: string;
  license_issuer: string | null; license_image: string | null; license_verified: boolean; status: string; review_note: string | null; created_at: string;
  owner_name: string | null; owner_email: string | null; published_materials: number; review_materials: number; open_reports: number;
}
const SHOP_ST: Record<string, string> = { pending: 'Chờ duyệt', active: 'Đang hoạt động', rejected: 'Từ chối', suspended: 'Tạm khóa' };

export function SiteShopsPage() {
  const [status, setStatus] = useState('pending');
  const { data, error, reload } = useLoad(() => rpc<ShopRow[]>('site_list_shops', { p_status: status || null }), [status]);
  const [err, setErr] = useState<string | null>(null);
  async function decide(s: ShopRow, decision: 'approve' | 'reject' | 'suspend' | 'restore') {
    setErr(null);
    let reason = '', verified = false;
    if (decision === 'reject' || decision === 'suspend') {
      const r = window.prompt(decision === 'reject' ? 'Lý do từ chối (chủ gian hàng sẽ thấy, ít nhất 5 ký tự)?' : 'Lý do tạm khóa (ít nhất 5 ký tự)? Vật tư của gian hàng sẽ biến khỏi website.');
      if (!r) return;
      reason = r;
    }
    if (decision === 'approve') verified = window.confirm('Bạn đã đối chiếu số giấy phép và muốn đánh dấu "Đã kiểm tra giấy phép"? (OK = có, Hủy = duyệt nhưng chưa đánh dấu)');
    try { await rpc('site_review_shop', { p_id: s.id, p_decision: decision, p_reason: reason, p_license_verified: verified }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Người bán vật tư tự đăng ký gian hàng. Hãy kiểm tra: số giấy phép kinh doanh (và ảnh nếu có), ngành nghề phù hợp, không có dấu hiệu giả mạo. Gian hàng chỉ đăng được vật tư sau khi được duyệt; tạm khóa thì mọi vật tư của gian hàng biến khỏi website. Chưa nhận thuốc bảo vệ thực vật, thuốc thú y.</p>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(SHOP_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="">Tất cả</option></select>
      </div>
      <Err e={error ?? err} />
      {(data ?? []).length === 0 && <p className="muted">Không có gian hàng.</p>}
      {(data ?? []).map((s) => (
        <section className="card" key={s.id}>
          <h2>{s.name} <span className="badge">{SHOP_ST[s.status] ?? s.status}</span>{s.license_verified && <span className="badge ok">Đã kiểm tra giấy phép</span>}{s.open_reports > 0 && <span className="badge bad">{s.open_reports} báo cáo</span>}</h2>
          <p className="muted">Chủ: {s.owner_name ?? '—'} · {s.owner_email ?? '—'} · đăng ký {fmtDateTime(s.created_at)} · {s.published_materials} vật tư đang hiển thị, {s.review_materials} chờ duyệt</p>
          <p>📍 {[s.address, s.district, s.province].filter(Boolean).join(', ')}{s.phone && ` · 📞 ${s.phone}`}</p>
          {s.description && <p style={{ whiteSpace: 'pre-line' }}>{s.description}</p>}
          <p><strong>Giấy phép:</strong> {s.license_no}{s.license_issuer ? ` · ${s.license_issuer}` : ''}</p>
          {s.license_image && <p><img src={s.license_image} alt="Giấy phép" style={{ maxWidth: 360, borderRadius: 6 }} /></p>}
          {s.review_note && <p className="muted">Ghi chú kiểm duyệt: {s.review_note}</p>}
          <div className="acts">
            {(s.status === 'pending' || s.status === 'rejected') && <button className="primary" onClick={() => void decide(s, 'approve')}>Duyệt gian hàng</button>}
            {s.status === 'pending' && <button onClick={() => void decide(s, 'reject')}>Từ chối</button>}
            {s.status === 'active' && <button className="danger" onClick={() => void decide(s, 'suspend')}>Tạm khóa</button>}
            {s.status === 'suspended' && <button className="primary" onClick={() => void decide(s, 'restore')}>Mở lại</button>}
          </div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Duyệt vật tư của gian hàng
interface ShopMatRow {
  id: string; name: string; brand: string | null; summary: string | null; ingredients: string | null; usage: string | null; safety: string | null; unit: string | null; price_from: number | null;
  price_note: string | null; image: string | null; status: string; review_note: string | null; updated_at: string; category_name: string | null; shop_name: string; shop_status: string; license_verified: boolean; open_reports: number;
}
const MAT_ST: Record<string, string> = { review: 'Chờ duyệt', published: 'Đang hiển thị', draft: 'Nháp / bị từ chối', hidden: 'Đã ẩn' };

export function SiteShopMaterialsPage() {
  const [status, setStatus] = useState('review');
  const { data, error, reload } = useLoad(() => rpc<ShopMatRow[]>('site_list_shop_materials', { p_status: status || null }), [status]);
  const [err, setErr] = useState<string | null>(null);
  async function decide(m: ShopMatRow, decision: 'approve' | 'reject' | 'hide') {
    setErr(null);
    let reason = '';
    if (decision !== 'approve') {
      const r = window.prompt(decision === 'reject' ? 'Lý do từ chối (chủ gian hàng sẽ thấy, ít nhất 5 ký tự)?' : 'Lý do ẩn vật tư (ít nhất 5 ký tự)?');
      if (!r) return;
      reason = r;
    }
    try { await rpc('site_review_shop_material', { p_id: m.id, p_decision: decision, p_reason: reason }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Vật tư do gian hàng đăng. Kiểm tra: đúng nhóm (không phải thuốc BVTV/thú y), thông tin không sai lệch hoặc gây hiểu nhầm, không quảng cáo quá mức. Sửa giá và đơn vị của vật tư đã đăng áp dụng ngay; sửa nội dung phải duyệt lại.</p>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(MAT_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="">Tất cả</option></select>
      </div>
      <Err e={error ?? err} />
      {(data ?? []).length === 0 && <p className="muted">Không có vật tư.</p>}
      {(data ?? []).map((m) => (
        <section className="card" key={m.id}>
          <h2>{m.name} <span className="badge">{MAT_ST[m.status] ?? m.status}</span>{m.open_reports > 0 && <span className="badge bad">{m.open_reports} báo cáo</span>}</h2>
          <p className="muted">Gian hàng: {m.shop_name}{m.license_verified ? ' (đã kiểm tra giấy phép)' : ''}{m.shop_status !== 'active' ? ` — ${SHOP_ST[m.shop_status] ?? m.shop_status}` : ''} · {m.category_name ?? 'chưa có danh mục'} · cập nhật {fmtDateTime(m.updated_at)}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {m.image && <img src={m.image} alt="" style={{ height: 110, borderRadius: 6 }} />}
            <div>
              <p>{m.brand && `${m.brand} · `}{m.unit && `ĐVT ${m.unit} · `}{m.price_from ? `Từ ${Math.round(m.price_from).toLocaleString('vi-VN')}đ` : m.price_note ?? ''}</p>
              {m.summary && <p>{m.summary}</p>}
              {m.ingredients && <p><strong>Thành phần:</strong> {m.ingredients}</p>}
              {m.usage && <p><strong>Hướng dẫn:</strong> {m.usage}</p>}
              {m.safety && <p><strong>An toàn:</strong> {m.safety}</p>}
              {m.review_note && <p className="muted">Ghi chú kiểm duyệt: {m.review_note}</p>}
            </div>
          </div>
          <div className="acts">
            {(m.status === 'review' || m.status === 'hidden') && <button className="primary" onClick={() => void decide(m, 'approve')}>Duyệt và hiển thị</button>}
            {m.status === 'review' && <button onClick={() => void decide(m, 'reject')}>Từ chối</button>}
            {m.status === 'published' && <button className="danger" onClick={() => void decide(m, 'hide')}>Ẩn vật tư</button>}
          </div>
        </section>
      ))}
    </>
  );
}
