import { useState } from 'react';
import { clean, Err, fmtDate, fmtDateTime, rpc, useLoad } from '@agriconnect/admin-kit';

/**
 * Yêu cầu xóa tài khoản (D220). Người dùng gửi yêu cầu trong app; hết thời gian chờ thì bấm Thực hiện: xóa tài khoản, cơ sở mà người này là chủ duy nhất
 * và dữ liệu liên quan (không hoàn tác được). Muốn xóa sớm (người dùng gọi điện đề nghị) thì ghi lý do.
 */
interface Req {
  id: string; label: string | null; full_name: string | null; reason: string | null; status: 'pending' | 'cancelled' | 'done';
  requested_at: string; scheduled_for: string; due: boolean; decided_at: string | null; summary: { orgs?: number; staff?: number } | null; orgs: string[];
}
const ST: Record<Req['status'], string> = { pending: 'Đang chờ', cancelled: 'Người dùng đã hủy', done: 'Đã xóa' };

export function DeletionRequestsPage() {
  const { data, error, reload } = useLoad(async () => (await rpc('admin_list_deletion_requests')) as Req[]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(r: Req) {
    let reason: string | null = null;
    if (!r.due) {
      reason = window.prompt('Chưa hết thời gian chờ. Ghi lý do xóa sớm (ít nhất 5 ký tự):');
      if (!reason) return;
    }
    const names = r.orgs.length ? `\nCơ sở sẽ bị xóa nếu người này là chủ duy nhất: ${r.orgs.join(', ')}` : '';
    if (!window.confirm(`XÓA VĨNH VIỄN tài khoản ${r.label ?? ''} (${r.full_name ?? 'không rõ tên'}) và dữ liệu liên quan? Không hoàn tác được.${names}`)) return;
    setBusy(true); setErr(null);
    try { await rpc('admin_execute_account_deletion', { p_id: r.id, p_reason: reason }); reload(); } catch (e) { setErr(clean(e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  }
  const rows = data ?? [];
  return (
    <>
      <Err e={error ?? err} />
      <section className="card">
        <p className="muted">Yêu cầu xóa tài khoản từ ứng dụng. Chỉ xóa khi đã hết thời gian chờ (hoặc có lý do xóa sớm). Người không đăng nhập được nhờ xóa qua điện thoại/Zalo: nhờ họ đăng nhập lại để gửi yêu cầu, hoặc xác minh rồi xử lý bằng script bảo trì.</p>
      </section>
      <section className="card">
        {data === null ? <p className="muted">Đang tải…</p> : rows.length === 0 ? <p className="muted">Chưa có yêu cầu nào.</p> : (
          <div className="tablewrap"><table className="grid">
            <thead><tr><th>Người dùng</th><th>Cơ sở (chủ)</th><th>Yêu cầu lúc</th><th>Xóa sau</th><th>Lý do</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.full_name ?? '—'}</strong><small>{r.label}</small></td>
                <td>{r.orgs.length ? r.orgs.join(', ') : '—'}</td>
                <td>{fmtDateTime(r.requested_at)}</td>
                <td>{fmtDate(r.scheduled_for)}{r.status === 'pending' && <small>{r.due ? 'đã đến hạn' : 'chưa đến hạn'}</small>}</td>
                <td>{r.reason ?? '—'}</td>
                <td>{ST[r.status]}{r.summary ? <small>{r.summary.orgs ?? 0} cơ sở, {r.summary.staff ?? 0} tài khoản nhân viên</small> : null}</td>
                <td>{r.status === 'pending' && <button className="secondary" disabled={busy} onClick={() => void run(r)}>Thực hiện xóa</button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
