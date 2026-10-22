import { useState } from 'react';
import { clean, Err, fmtDateTime, rpc, useLoad } from '@agriconnect/admin-kit';

// ============================================================ Duyệt tin giao thương
interface TradeRow {
  id: string; kind: string; title: string; status: string; review_note: string | null; category_name: string | null; product_name: string | null; quantity: number | null; unit: string;
  price_min: number | null; price_max: number | null; province: string; district: string | null; when_date: string | null; quality: string[]; description: string | null; images: string[];
  expires_at: string; created_at: string; poster_name: string | null; buyer_kind: string | null; company: string | null; org_name: string | null; poster_published: number; open_reports: number;
}
const TRADE_ST: Record<string, string> = { pending: 'Chờ duyệt', published: 'Đang hiển thị', rejected: 'Từ chối', hidden: 'Đã ẩn', closed: 'Đã đóng' };

export function SiteTradePage() {
  const [status, setStatus] = useState('pending');
  const { data, error, reload } = useLoad(() => rpc<TradeRow[]>('site_list_trade_posts', { p_status: status || null, p_limit: 200 }), [status]);
  const [err, setErr] = useState<string | null>(null);
  async function decide(p: TradeRow, decision: 'approve' | 'reject' | 'hide' | 'restore') {
    setErr(null);
    let reason = '';
    if (decision === 'reject' || decision === 'hide') {
      const r = window.prompt(decision === 'reject' ? 'Lý do từ chối (người đăng sẽ thấy, ít nhất 5 ký tự)?' : 'Lý do ẩn tin (ít nhất 5 ký tự)?');
      if (!r) return;
      reason = r;
    }
    try { await rpc('site_review_trade_post', { p_id: p.id, p_decision: decision, p_reason: reason }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Duyệt tin do người dùng đăng. Kiểm tra: đúng loại sản phẩm, không quảng cáo, không dấu hiệu lừa đảo (hệ thống đã chặn số điện thoại, email, đường dẫn trong nội dung). Người đã có tin được duyệt sẽ tự được duyệt tin sau, trừ khi vừa bị từ chối hoặc ẩn trong 30 ngày.</p>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TRADE_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="">Tất cả</option></select>
      </div>
      <Err e={error ?? err} />
      {(data ?? []).length === 0 && <p className="muted">Không có tin.</p>}
      {(data ?? []).map((p) => (
        <section className="card" key={p.id}>
          <h2>{p.title} <span className="badge">{TRADE_ST[p.status] ?? p.status}</span>{p.open_reports > 0 && <span className="badge bad">{p.open_reports} báo cáo</span>}</h2>
          <p className="muted">
            Người đăng: {p.poster_name ?? '—'}{p.company ? ` · ${p.company}` : ''}{p.org_name ? ` · cơ sở ${p.org_name}` : ''} · đã có {p.poster_published} tin được duyệt · đăng {fmtDateTime(p.created_at)} · hết hạn {fmtDateTime(p.expires_at)}
          </p>
          <p>
            {p.category_name}{p.product_name ? ` · ${p.product_name}` : ''} · {p.quantity} {p.unit} · {[p.district, p.province].filter(Boolean).join(', ')}
            {(p.price_min != null || p.price_max != null) && ` · giá ${p.price_min ?? ''}–${p.price_max ?? ''}`}{p.when_date && ` · ngày ${p.when_date}`}{p.quality.length > 0 && ` · ${p.quality.join(', ')}`}
          </p>
          {p.description && <p style={{ whiteSpace: 'pre-line' }}>{p.description}</p>}
          {p.images.map((s, i) => <img key={i} src={s} alt="" style={{ height: 90, borderRadius: 6, marginRight: 6 }} />)}
          {p.review_note && <p className="muted">Ghi chú kiểm duyệt: {p.review_note}</p>}
          <div className="acts">
            {(p.status === 'pending' || p.status === 'rejected' || p.status === 'hidden') && <button className="primary" onClick={() => void decide(p, 'approve')}>Duyệt và hiển thị</button>}
            {p.status === 'pending' && <button onClick={() => void decide(p, 'reject')}>Từ chối</button>}
            {p.status === 'published' && <button className="danger" onClick={() => void decide(p, 'hide')}>Ẩn tin</button>}
          </div>
        </section>
      ))}
    </>
  );
}

// ============================================================ Báo cáo vi phạm
interface ReportRow { id: string; target_type: string; target_id: string; reason: string; status: string; note: string | null; created_at: string; reporter: string | null; target_label: string | null; target_status: string | null }

export function SiteReportsPage() {
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useLoad(() => rpc<ReportRow[]>('site_list_reports', { p_status: status || null }), [status]);
  const [err, setErr] = useState<string | null>(null);
  async function handle(r: ReportRow, st: 'handled' | 'dismissed', action: string | null) {
    setErr(null);
    const note = window.prompt(action === 'block_user' ? 'Lý do khóa tài khoản (người dùng sẽ thấy)?' : action === 'hide_post' ? 'Lý do ẩn tin?' : 'Ghi chú xử lý (tùy chọn)', '');
    if (note === null) return;
    if (action && note.trim().length < 5) { setErr('Hãy ghi lý do (ít nhất 5 ký tự).'); return; }
    try { await rpc('site_handle_report', { p_id: r.id, p_status: st, p_note: note, p_action: action }); reload(); } catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  return (
    <>
      <p className="muted">Báo cáo do người dùng gửi từ trang chi tiết tin. Có thể ẩn tin, khóa người đăng, hoặc bỏ qua nếu báo cáo sai.</p>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Chưa xử lý</option><option value="handled">Đã xử lý</option><option value="dismissed">Đã bỏ qua</option><option value="">Tất cả</option></select>
      </div>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Thời gian</th><th>Đối tượng</th><th>Lý do</th><th>Người báo</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.created_at)}<small>{r.status === 'open' ? 'Chưa xử lý' : r.status === 'handled' ? 'Đã xử lý' : 'Đã bỏ qua'}</small></td>
              <td><strong>{r.target_label ?? '(đã xóa)'}</strong><small>{r.target_type === 'trade_post' ? `Tin giao thương${r.target_status ? ' · ' + (TRADE_ST[r.target_status] ?? r.target_status) : ''}` : 'Người dùng'}</small></td>
              <td>{r.reason}{r.note && <small>Xử lý: {r.note}</small>}</td>
              <td>{r.reporter ?? '—'}</td>
              <td className="acts">
                {r.status === 'open' && (
                  <>
                    {r.target_type === 'trade_post' && <button className="danger" onClick={() => void handle(r, 'handled', 'hide_post')}>Ẩn tin</button>}
                    <button className="danger" onClick={() => void handle(r, 'handled', 'block_user')}>Khóa người đăng</button>
                    <button onClick={() => void handle(r, 'handled', null)}>Đã xử lý</button>
                    <button onClick={() => void handle(r, 'dismissed', null)}>Bỏ qua</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">Không có báo cáo.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
