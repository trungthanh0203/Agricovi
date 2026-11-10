import { useEffect, useState, type ReactNode } from 'react';
import { downloadCsv, Err, rpc, useLoad } from '@agriconnect/admin-kit';

/**
 * Hoạt động người dùng (D160): mỗi ngày có tài khoản nào dùng hệ thống, từ lúc nào đến lúc nào, ở thiết bị nào, vào chức năng nào.
 * Số liệu do app ghi ngầm (một tín hiệu ~60 giây); dữ liệu chi tiết từng phiên giữ 10 ngày, tổng hợp theo ngày giữ 1 năm.
 * Một tài khoản đăng nhập được nhiều máy nên mỗi thiết bị có mã riêng và được liệt kê riêng.
 */
const PAGE = 30;
const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—');
const dayText = (iso: string) => iso.split('-').reverse().join('/');

/** Thời gian: "1 giờ 05 phút", "35 phút", "dưới 1 phút" */
export function dur(sec: number): string {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return s <= 0 ? '0 phút' : 'dưới 1 phút';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút`;
}

const TAB_LABEL: Record<string, string> = { home: 'Trang chủ', production: 'Sản xuất', declare: 'Khai báo', reports: 'Báo cáo', config: 'Cấu hình', guide: 'Hướng dẫn', account: 'Tài khoản' };
const SUB_LABEL: Record<string, string> = {
  cycles: 'Vụ', stock: 'Kho', expense: 'Chi phí', attendance: 'Chấm công', harvest: 'Thu hoạch', sales: 'Doanh thu', log: 'Ghi việc', logs: 'Nhật ký việc',
  weekly: 'Báo cáo tuần', custom: 'Báo cáo tổng hợp', summary: 'Tổng kết vụ', payables: 'Công nợ', paybook: 'Sổ lương', logbook: 'Sổ nhật ký', checklist: 'Bảng kiểm',
  website: 'Website', commerce: 'Hồ sơ thương mại', stats: 'Thống kê tổng hợp', areas: 'Phân khu', partners: 'Nhà cung ứng', customers: 'Khách hàng', materials: 'Vật tư',
  places: 'Kho và đơn vị', members: 'Nhân sự', templates: 'Quy trình mẫu', licenses: 'Giấy phép',
};
const OVERLAY_LABEL: Record<string, string> = { overlay_log: 'Ghi việc vừa làm', overlay_cycle: 'Tạo vụ', overlay_logs: 'Nhật ký việc', overlay_detail: 'Chi tiết vụ', overlay_model: 'Chọn cách quản lý vụ' };
export function screenLabel(code: string): string {
  if (OVERLAY_LABEL[code]) return OVERLAY_LABEL[code]!;
  const [tab, sub] = code.split('/');
  const t = TAB_LABEL[tab ?? ''] ?? tab ?? code;
  return sub ? `${t} › ${SUB_LABEL[sub] ?? sub}` : t;
}

interface Summary { day: string; accounts: number; devices: number; sessions: number; seconds: number; logins: number; online_now: number }
type Row = [string, string | null, string | null, string | null, string | null, string | null, number, number, number, string | null, string | null];
interface DeviceRow { device_id: string; label: string | null; sessions: number; logins: number; seconds: number; first_at: string; last_at: string; ip: string | null; country: string | null; city: string | null; screens: Record<string, number>; org: string | null }
interface SessionRow { id: string; device_id: string; label: string | null; started_at: string; last_seen_at: string; ended_at: string | null; seconds: number; ip: string | null; country: string | null; city: string | null; colo: string | null; standalone: boolean; version: string | null; screens: Record<string, number> }
interface DayDetail { user: { id: string; name: string | null; email: string | null }; day: string; overlap: boolean; devices: DeviceRow[]; sessions: SessionRow[] }

const where = (ip: string | null, country: string | null, city: string | null, colo?: string | null) =>
  [ip, [city, country].filter(Boolean).join(', ') || null, colo ? `trạm ${colo}` : null].filter(Boolean).join(' · ') || '—';

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function ScreenBars({ screens }: { screens: Record<string, number> }) {
  const list = Object.entries(screens).sort((a, b) => b[1] - a[1]);
  const max = list[0]?.[1] ?? 1;
  if (list.length === 0) return <p className="muted">Chưa ghi nhận chức năng nào.</p>;
  return (
    <table className="list"><tbody>
      {list.map(([k, v]) => (
        <tr key={k}><td style={{ width: '40%' }}>{screenLabel(k)}</td>
          <td><div style={{ background: 'var(--info, #2f7dd1)', height: 8, borderRadius: 4, width: `${Math.max(3, Math.round((v / max) * 100))}%` }} /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{dur(v)}</td></tr>
      ))}
    </tbody></table>
  );
}

function AccountDetail({ userId, day, onClose }: { userId: string; day: string; onClose: () => void }) {
  const { data, error, loading } = useLoad(() => rpc<DayDetail>('admin_usage_account_day', { p_user: userId, p_day: day }), [userId, day]);
  const total: Record<string, number> = {};
  for (const d of data?.devices ?? []) for (const [k, v] of Object.entries(d.screens ?? {})) total[k] = (total[k] ?? 0) + Number(v);
  return (
    <section className="card">
      <div className="toolbar"><h2 style={{ margin: 0 }}>{data?.user.name ?? 'Tài khoản'}{data?.user.email ? ` · ${data.user.email}` : ''} · {dayText(day)}</h2><button onClick={onClose}>Đóng</button></div>
      <Err e={error} />
      {loading && <p className="muted">Đang tải…</p>}
      {data && (<>
        {data.overlap && <p className="msg warn" role="status">Trong ngày này tài khoản có lúc <strong>dùng cùng lúc trên nhiều thiết bị</strong>.</p>}
        <h3>Thiết bị ({data.devices.length})</h3>
        <div className="tablewrap"><table className="list">
          <thead><tr><th>Thiết bị</th><th>Cơ sở</th><th>Từ → đến</th><th>Số phiên</th><th>Thời gian dùng</th><th>IP · vị trí (lần cuối)</th></tr></thead>
          <tbody>{data.devices.map((d) => (
            <tr key={d.device_id}><td>{d.label ?? d.device_id.slice(0, 8)}</td><td>{d.org ?? '—'}</td><td>{hhmm(d.first_at)} → {hhmm(d.last_at)}</td><td>{d.sessions}</td><td>{dur(d.seconds)}</td><td>{where(d.ip, d.country, d.city)}</td></tr>
          ))}</tbody>
        </table></div>
        <h3>Từng phiên</h3>
        {data.sessions.length === 0
          ? <p className="muted">Không còn dữ liệu từng phiên cho ngày này (chỉ giữ chi tiết 10 ngày gần nhất); xem tổng hợp ở bảng thiết bị.</p>
          : <div className="tablewrap"><table className="list">
              <thead><tr><th>Bắt đầu</th><th>Kết thúc</th><th>Thời gian</th><th>Thiết bị</th><th>IP · vị trí</th><th>Phiên bản</th></tr></thead>
              <tbody>{data.sessions.map((s) => (
                <tr key={s.id}><td>{hhmm(s.started_at)}</td><td>{s.ended_at ? hhmm(s.ended_at) : `${hhmm(s.last_seen_at)}${Date.now() - new Date(s.last_seen_at).getTime() < 120_000 ? ' (đang dùng)' : ''}`}</td>
                  <td>{dur(s.seconds)}</td><td>{s.label ?? '—'}{s.standalone ? ' · app cài' : ' · trình duyệt'}</td><td>{where(s.ip, s.country, s.city, s.colo)}</td><td>{s.version ?? '—'}</td></tr>
              ))}</tbody>
            </table></div>}
        <h3>Thời gian ở từng chức năng</h3>
        <ScreenBars screens={total} />
      </>)}
    </section>
  );
}

function AccountsTab() {
  const [day, setDay] = useState(todayVN());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(4);
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const isToday = day === todayVN();
  useEffect(() => { if (!isToday) return; const t = window.setInterval(() => setTick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, [isToday]); // hôm nay: tự làm mới mỗi phút

  const { data: sum } = useLoad(() => rpc<Summary>('admin_usage_summary', { p_day: day }), [day, tick]);
  const { data, error, loading } = useLoad(() => rpc<{ total: number; rows: Row[] }>('admin_usage_accounts', { p_day: day, p_search: search.trim() || null, p_sort: sort, p_desc: desc, p_limit: PAGE, p_offset: page * PAGE }), [day, search, sort, desc, page, tick]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const col = (i: number) => { if (sort === i) setDesc((d) => !d); else { setSort(i); setDesc(i >= 3); } setPage(0); };
  const head = (label: string, i: number) => <th aria-sort={sort === i ? (desc ? 'descending' : 'ascending') : 'none'}><button type="button" className="sorthead" onClick={() => col(i)}>{label}{sort === i ? (desc ? ' ▼' : ' ▲') : ''}</button></th>;
  const live = (iso: string | null) => isToday && !!iso && Date.now() - new Date(iso).getTime() < 120_000;

  async function exportCsv() {
    const all = await rpc<{ rows: Row[] }>('admin_usage_accounts', { p_day: day, p_search: search.trim() || null, p_sort: sort, p_desc: desc, p_limit: 100, p_offset: 0 });
    downloadCsv(`hoat-dong-${day}.csv`, [['Tài khoản', 'Email / đăng nhập', 'Cơ sở', 'Vào lúc', 'Thấy lần cuối', 'Số phiên', 'Thời gian dùng (giây)', 'Số thiết bị', 'Chức năng dùng nhiều'],
      ...all.rows.map((r) => [r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], (r[9] ?? '').split(', ').map(screenLabel).join('; ')])]);
  }

  return (
    <>
      <div className="toolbar">
        <label>Ngày <input type="date" value={day} max={todayVN()} onChange={(e) => { setDay(e.target.value || todayVN()); setPage(0); setOpen(null); }} /></label>
        <input placeholder="Tìm tên, email, cơ sở…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <button onClick={() => void exportCsv()} disabled={total === 0}>Tải CSV (tối đa 100 dòng)</button>
        {isToday && <small className="muted">Tự làm mới mỗi phút</small>}
      </div>
      <div className="kpis compact">
        <Tile label="Tài khoản đã dùng" value={sum ? sum.accounts : '…'} />
        <Tile label="Đang dùng ngay" value={sum ? sum.online_now : '…'} note="báo trong 2 phút qua" />
        <Tile label="Số phiên" value={sum ? sum.sessions : '…'} />
        <Tile label="Tổng thời gian" value={sum ? dur(sum.seconds) : '…'} />
        <Tile label="Lượt đăng nhập" value={sum ? sum.logins : '…'} />
        <Tile label="Thiết bị" value={sum ? sum.devices : '…'} />
      </div>
      <Err e={error} />
      <div className="tablewrap">
        <table className="list">
          <thead><tr>{head('Tài khoản', 1)}{head('Cơ sở', 2)}{head('Vào lúc', 3)}{head('Thấy lần cuối', 4)}{head('Số phiên', 5)}{head('Thời gian dùng', 6)}{head('Thiết bị', 7)}<th>Chức năng dùng nhiều</th></tr></thead>
          <tbody>
            {data && data.rows.length === 0 && <tr><td colSpan={8} className="muted">{loading ? 'Đang tải…' : 'Không có tài khoản nào dùng trong ngày này (dữ liệu chỉ có từ ngày bật theo dõi).'}</td></tr>}
            {(data?.rows ?? []).map((r) => (
              <tr key={r[0]} className="linkish" onClick={() => setOpen(r[0])} style={{ cursor: 'pointer' }}>
                <td><strong>{r[1] ?? '—'}</strong><br /><small className="muted">{r[2]}</small></td>
                <td>{r[3] ?? '—'}</td><td>{hhmm(r[4])}</td><td>{hhmm(r[5])}{live(r[5]) && <span className="badge ok"> ● đang dùng</span>}</td>
                <td>{Number(r[6])}</td><td>{dur(r[7])}</td><td>{Number(r[8]) > 1 ? <strong>{Number(r[8])}</strong> : Number(r[8])}</td>
                <td>{(r[9] ?? '').split(', ').filter(Boolean).map(screenLabel).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && total > PAGE && (
        <div className="toolbar pager">
          <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>‹ Trước</button>
          <span className="muted">Trang {page + 1}/{pages} · {total.toLocaleString('vi-VN')} tài khoản</span>
          <button disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}>Sau ›</button>
        </div>
      )}
      {open && <AccountDetail userId={open} day={day} onClose={() => setOpen(null)} />}
    </>
  );
}

function ScreensTab() {
  const [days, setDays] = useState(7);
  const { data, error, loading } = useLoad(() => rpc<{ screen: string; users: number; seconds: number }[]>('admin_usage_screens', { p_days: days }), [days]);
  return (
    <>
      <div className="toolbar">
        <label>Trong <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>hôm nay</option><option value={7}>7 ngày</option><option value={30}>30 ngày</option><option value={365}>1 năm</option></select></label>
        <small className="muted">Cho biết chức năng nào được dùng nhiều, bao nhiêu tài khoản, tổng thời gian.</small>
      </div>
      <Err e={error} />
      <div className="tablewrap"><table className="list">
        <thead><tr><th>Chức năng</th><th>Số tài khoản</th><th>Tổng thời gian</th><th>Trung bình / tài khoản</th></tr></thead>
        <tbody>
          {data && data.length === 0 && <tr><td colSpan={4} className="muted">{loading ? 'Đang tải…' : 'Chưa có dữ liệu.'}</td></tr>}
          {(data ?? []).map((r) => <tr key={r.screen}><td>{screenLabel(r.screen)}</td><td>{Number(r.users)}</td><td>{dur(r.seconds)}</td><td>{dur(Number(r.seconds) / Math.max(1, Number(r.users)))}</td></tr>)}
        </tbody>
      </table></div>
    </>
  );
}

export function ActivityPage() {
  const [tab, setTab] = useState<'accounts' | 'screens'>('accounts');
  return (
    <>
      <div className="toolbar">
        <button className={tab === 'accounts' ? 'primary' : ''} onClick={() => setTab('accounts')}>Theo tài khoản</button>
        <button className={tab === 'screens' ? 'primary' : ''} onClick={() => setTab('screens')}>Chức năng được dùng</button>
      </div>
      {tab === 'accounts' ? <AccountsTab /> : <ScreensTab />}
      <p className="muted">Số liệu do app ghi ngầm khi người dùng đang mở; chi tiết từng phiên giữ 10 ngày, tổng hợp theo ngày giữ 1 năm. IP và vị trí lấy theo kết nối của người dùng, vị trí chỉ mang tính tham khảo.</p>
    </>
  );
}
