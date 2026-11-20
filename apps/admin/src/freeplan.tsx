import { useState } from 'react';
import { downloadCsv, Err, fmtDate, rpc, useLoad } from '@agriconnect/admin-kit';

/**
 * Khách tiềm năng của gói Khởi đầu (miễn phí 12 tháng, D219): cơ sở đã dùng hết số vụ, sắp hết hạn hoặc đã hết hạn.
 * Mục đích: chủ động gọi/Zalo đúng lúc họ cần mở rộng.
 */
interface Lead {
  id: string; name: string; type: string; phone: string | null; period_end: string; days_left: number; expired: boolean;
  full_trial_used: boolean; cycles_used: number; max_cycles: number; last_activity: string | null; pending_orders: number;
}
const FILTERS: { id: string; label: string }[] = [
  { id: 'used', label: 'Đã dùng hết số vụ' },
  { id: 'expiring', label: 'Sắp hết hạn (30 ngày)' },
  { id: 'expired', label: 'Đã hết hạn' },
  { id: '', label: 'Tất cả' },
];

export function FreePlanLeadsPage({ onOpenOrg }: { onOpenOrg: (id: string) => void }) {
  const [filter, setFilter] = useState('used');
  const { data, error } = useLoad(async () => (await rpc('admin_free_plan_leads', { p_filter: filter || null })) as Lead[], [filter]);
  const rows = data ?? [];
  const csv = () => downloadCsv('khach-tiem-nang.csv', [['Cơ sở', 'Loại', 'Điện thoại', 'Hết hạn', 'Số vụ', 'Hoạt động gần nhất'],
    ...rows.map((r) => [r.name, r.type === 'cooperative' ? 'HTX' : 'Hộ', r.phone ?? '', fmtDate(r.period_end), `${r.cycles_used}/${r.max_cycles}`, r.last_activity ? fmtDate(r.last_activity) : ''])]);
  return (
    <>
      <Err e={error} />
      <section className="card">
        <p className="muted">Cơ sở đang dùng gói Khởi đầu miễn phí. Gọi hoặc nhắn Zalo cho nhóm "Đã dùng hết số vụ" trước: họ đã thật sự dùng và sắp cần thêm.</p>
        <div className="filters">
          {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'primary' : 'secondary'} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          <button className="secondary" disabled={rows.length === 0} onClick={csv}>Xuất CSV</button>
        </div>
      </section>
      <section className="card">
        {data === null || data === undefined ? <p className="muted">Đang tải…</p> : rows.length === 0 ? <p className="muted">Chưa có cơ sở nào trong nhóm này.</p> : (
          <div className="tablewrap"><table className="grid">
            <thead><tr><th>Cơ sở</th><th>Điện thoại</th><th>Hạn</th><th>Số vụ</th><th>Hoạt động gần nhất</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong><small>{r.type === 'cooperative' ? 'HTX' : 'Hộ'}{r.full_trial_used ? ' · đã nâng cấp thử' : ''}{r.pending_orders > 0 ? ` · ${r.pending_orders} đơn mua đang chờ` : ''}</small></td>
                <td>{r.phone ?? '—'}</td>
                <td>{fmtDate(r.period_end)}<small>{r.expired ? 'đã hết hạn' : `còn ${r.days_left} ngày`}</small></td>
                <td>{r.cycles_used}/{r.max_cycles}</td>
                <td>{r.last_activity ? fmtDate(r.last_activity) : '—'}</td>
                <td><button className="secondary" onClick={() => onOpenOrg(r.id)}>Mở</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
