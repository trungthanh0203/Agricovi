import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { fetchLeadLinks, fetchLeads, LEAD_STATUS_LABEL, linkLeadToCustomer, setLeadStatus, type LeadStatus, type WebLead } from '../lib/webSite';

const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Khách tiềm năng từ website (G2-5 R2): yêu cầu báo giá khách gửi qua website tới cơ sở. Gọi điện, đánh dấu đã xử lý, thêm vào khách hàng
 * (nối khách trùng số điện thoại, không tạo trùng). Xử lý được cần quyền xử lý website; thêm khách cần thêm quyền sửa Doanh thu.
 */
export function WebLeadsTab() {
  const { active } = useOrgs();
  const online = useOnline();
  const [filter, setFilter] = useState<LeadStatus | 'all'>('new');
  const [rows, setRows] = useState<WebLead[] | null>(null);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgId = active?.id;

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const [l, k] = await Promise.all([fetchLeads(filter === 'all' ? null : filter), fetchLeadLinks(orgId).catch(() => new Map<string, string>())]);
      setRows(l.filter((x) => x.status !== 'spam'));
      setLinks(k);
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, filter]);
  useEffect(() => { void load(); }, [load]);

  if (!active || !orgId) return null;
  const canCustomer = canPerm(active.perms, 'sales', 'edit');
  // my_quote_requests trả yêu cầu của mọi cơ sở bạn xử lý; chỉ hiện của cơ sở đang chọn (máy chủ kiểm lại khi thêm khách)
  const shown = (rows ?? []).filter((r) => !r.org_name || r.org_name === active.name);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try { await fn(); setOk(done); await load(); } catch (e) { setError(friendlyError(e)); await load(); } finally { setBusy(false); }
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: cần có mạng để xem và xử lý yêu cầu.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}

      <div className="chips" role="tablist" aria-label="Lọc yêu cầu">
        {(['new', 'handled', 'all'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tất cả' : LEAD_STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {rows === null && !error && <p className="muted">{online ? 'Đang tải…' : 'Chưa tải được vì đang offline.'}</p>}
      {rows !== null && shown.length === 0 && <p className="muted">{filter === 'new' ? 'Chưa có yêu cầu mới từ website.' : 'Không có yêu cầu nào.'}</p>}

      {shown.map((r) => (
        <div className="card slim" key={r.id}>
          <div className="row">
            <strong className="grow">{r.sender_name}</strong>
            <span className={r.status === 'new' ? 'pill warn' : 'pill ok'}>{LEAD_STATUS_LABEL[r.status]}</span>
          </div>
          <p className="muted">
            {when(r.created_at)}{r.target_name ? ` · quan tâm: ${r.target_name}` : ''}{r.quantity_note ? ` · số lượng: ${r.quantity_note}` : ''}
          </p>
          <p>{r.message}</p>
          <p>
            {r.sender_phone && <a href={`tel:${r.sender_phone}`}>📞 {r.sender_phone}</a>}
            {r.sender_phone && r.sender_email ? ' · ' : ''}
            {r.sender_email && <a href={`mailto:${r.sender_email}`}>✉ {r.sender_email}</a>}
          </p>
          {r.note && <p className="muted">Ghi chú của bạn: {r.note}</p>}
          <div className="actions">
            {links.has(r.id) ? (
              <span className="pill ok">Đã là khách hàng</span>
            ) : canCustomer ? (
              <button className="secondary" disabled={busy || !online}
                onClick={() => void act(async () => {
                  const res = await linkLeadToCustomer(orgId, r.id);
                  if (res.created === false && !res.already) setOk('Đã nối vào khách hàng có sẵn (trùng số điện thoại).');
                }, 'Đã thêm vào khách hàng (Khai báo → Khách hàng).')}>Thêm vào khách hàng</button>
            ) : null}
            {r.status === 'new' ? (
              <button className="secondary" disabled={busy || !online} onClick={() => {
                const note = window.prompt('Ghi chú đã xử lý (không bắt buộc), ví dụ: đã gọi, hẹn giao thứ Bảy');
                if (note === null) return;
                void act(() => setLeadStatus(r.id, 'handled', note), 'Đã đánh dấu đã xử lý.');
              }}>Đã xử lý</button>
            ) : (
              <button className="secondary" disabled={busy || !online} onClick={() => void act(() => setLeadStatus(r.id, 'new', r.note ?? ''), 'Đã chuyển về Mới.')}>Chuyển về Mới</button>
            )}
          </div>
        </div>
      ))}
      <p className="muted">Thông tin người gửi là dữ liệu cá nhân, chỉ dùng để liên hệ báo giá. Khi khách yêu cầu xóa, hãy dùng "Ẩn danh" ở Khai báo → Khách hàng.</p>
    </>
  );
}
