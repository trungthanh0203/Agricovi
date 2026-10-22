import { useState } from 'react';
import { clean, Err, fmtDateTime, rpc, useLoad } from '@agriconnect/admin-kit';

// ============================================================ Đánh giá nhà cung cấp (W7, D69)
interface ReviewRow {
  id: string; stars: number; comment: string | null; reply: string | null; status: string; hidden_reason: string | null; flagged: boolean; flag_reason: string | null;
  created_at: string; order_code: string; supplier_name: string; buyer_name: string | null;
}

export function SiteReviewsPage() {
  const [filter, setFilter] = useState('flagged');
  const { data, error, reload } = useLoad(() => rpc<ReviewRow[]>('site_list_reviews', { p_filter: filter }), [filter]);
  const [err, setErr] = useState<string | null>(null);
  async function setHidden(r: ReviewRow, hidden: boolean) {
    setErr(null);
    let reason = '';
    if (hidden) {
      const t = window.prompt('Lý do ẩn đánh giá (người đánh giá sẽ thấy, ít nhất 5 ký tự)?');
      if (!t) return;
      reason = t;
    }
    try { await rpc('site_set_review_hidden', { p_id: r.id, p_hidden: hidden, p_reason: reason }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Đánh giá do người mua đã hoàn tất đơn gửi. Chỉ ẩn khi nhận xét sai sự thật rõ ràng, xúc phạm, quảng cáo hoặc chứa thông tin liên hệ; không ẩn chỉ vì đánh giá thấp. Mọi lần ẩn/hiện đều được ghi nhật ký.</p>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="flagged">Nhà cung cấp báo không đúng</option><option value="hidden">Đang bị ẩn</option><option value="all">Tất cả</option>
        </select>
      </div>
      <Err e={error ?? err} />
      {(data ?? []).length === 0 && <p className="muted">Không có đánh giá.</p>}
      {(data ?? []).map((r) => (
        <section className="card" key={r.id}>
          <h2>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)} <span className="badge">{r.status === 'hidden' ? 'Đang ẩn' : 'Đang hiển thị'}</span>{r.flagged && <span className="badge bad">Bị báo không đúng</span>}</h2>
          <p className="muted">Nhà cung cấp: {r.supplier_name} · người mua: {r.buyer_name ?? '—'} · đơn {r.order_code} · {fmtDateTime(r.created_at)}</p>
          {r.comment && <p style={{ whiteSpace: 'pre-line' }}>{r.comment}</p>}
          {r.reply && <p className="muted">Nhà cung cấp trả lời: {r.reply}</p>}
          {r.flag_reason && <p className="muted">Lý do nhà cung cấp báo: {r.flag_reason}</p>}
          {r.hidden_reason && <p className="muted">Lý do ẩn: {r.hidden_reason}</p>}
          <div className="acts">
            {r.status === 'visible' ? <button className="danger" onClick={() => void setHidden(r, true)}>Ẩn đánh giá</button> : <button className="primary" onClick={() => void setHidden(r, false)}>Hiện lại</button>}
          </div>
        </section>
      ))}
    </>
  );
}
