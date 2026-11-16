import { useEffect, useMemo, useState } from 'react';
import { AreaFilter } from './AreaFilter';
import { cachedAreaRollup, fetchAreaRollup, type AreaRollupData } from '../lib/areaRollup';
import { rollupFromServer } from '../lib/areas';
import { addDays } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import { formatMoney } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

type Status = 'all' | 'active' | 'preparing' | 'paused' | 'ended';
type Win = '12m' | 'all' | string;   // '12m', 'all' hoặc một năm (ví dụ '2026')

/**
 * Tổng hợp theo phân khu (D125): chi phí, thu hoạch, doanh thu, lãi lỗ tạm tính cộng từ các vụ của phân khu và mọi ô sản xuất bên trong.
 * Số do máy chủ cộng sẵn theo từng khu (get_area_rollup, D177), nên nhẹ dù cơ sở có hàng trăm vụ; phần tiền chỉ hiện với người có quyền xem tiền.
 * Mặc định xem vụ ĐANG SẢN XUẤT; vụ đã kết thúc tính theo khoảng thời gian đã chọn (mặc định 12 tháng gần đây). Chỉ hiện khi cơ sở có chia ô sản xuất.
 */
export function AreaRollup() {
  const { active } = useOrgs();
  const areas = useTable('areas');
  const cycles = useTable('cycles');
  const [pickedStatus, setStatus] = useState<Status | null>(null);   // null = tự chọn: Đang sản xuất nếu có, không thì Tất cả
  const [win, setWin] = useState<Win>('12m');   // khoảng thời gian cho vụ đã kết thúc
  const [areaFilter, setAreaFilter] = useState('');   // lọc theo một phân khu ('' = tất cả)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});   // phân khu đang mở danh sách ô sản xuất (mặc định đóng, trừ khi đang lọc đúng phân khu đó)
  const [data, setData] = useState<AreaRollupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(() => areas.filter((a) => a.organization_id === active?.id), [areas, active?.id]);
  const orgCycles = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id && c.status !== 'cancelled'), [cycles, active?.id]);
  const status: Status = pickedStatus ?? (orgCycles.some((c) => c.status === 'active') ? 'active' : 'all');
  const statusCycles = useMemo(() => orgCycles.filter((c) => status === 'all' || c.status === status), [orgCycles, status]);

  // khoảng thời gian áp cho vụ đã kết thúc: 12 tháng gần đây (mặc định), một năm, hoặc tất cả
  const today = todayLocal();
  const showWin = status === 'all' || status === 'ended';
  const { from, to } = useMemo(() => {
    if (!showWin || win === 'all') return { from: null as string | null, to: null as string | null };
    if (win === '12m') return { from: addDays(today, -365), to: null as string | null };
    return { from: `${win}-01-01`, to: `${win}-12-31` };
  }, [showWin, win, today]);
  const years = useMemo(() => {
    const thisYear = Number(today.slice(0, 4));
    const first = Math.min(thisYear, ...orgCycles.map((c) => Number((c.start_date ?? today).slice(0, 4))));
    return Array.from({ length: thisYear - first + 1 }, (_, i) => String(thisYear - i));
  }, [orgCycles, today]);

  // tải số liệu đã cộng sẵn cho bộ lọc đang chọn (nhẹ: vài chục dòng); mất mạng thì dùng bản đã lưu
  const key = `${status}|${from ?? ''}|${to ?? ''}`;
  useEffect(() => {
    if (!active) return;
    setData(cachedAreaRollup(active.id, key));
    if (!navigator.onLine) return;
    let alive = true;
    setLoading(true); setError(null);
    fetchAreaRollup(active.id, key, status === 'all' ? null : [status], from, to)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [active?.id, key, orgCycles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const allRows = useMemo(() => (data ? rollupFromServer(mine, data.rows) : []), [mine, data]);
  const rows = useMemo(() => (areaFilter && allRows.some((r) => r.area.id === areaFilter) ? allRows.filter((r) => r.area.id === areaFilter) : allRows), [allRows, areaFilter]);
  if (!active) return null;
  if (!mine.some((a) => a.parent_id) || orgCycles.length === 0) return <p className="muted">Chưa có phân khu nào có vụ để tổng hợp. Phân khu chia ô sản xuất và có vụ sẽ hiện ở đây.</p>;
  const money = Boolean(data?.can_money);
  const kg = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`);
  const vnd = (v: number | null) => (v == null ? '—' : formatMoney(v));
  const cycleText = (r: (typeof rows)[number]) => `${r.cycles} vụ${r.running > 0 ? ` (${r.running} đang chạy)` : ''}`;
  const isOpen = (id: string) => openMap[id] ?? (areaFilter === id);
  const cells = (r: (typeof rows)[number]) => (
    <>
      {money && <td className="num">{vnd(r.cost)}</td>}
      <td className="num">{kg(r.harvest)}</td>
      {money && <td className="num">{vnd(r.revenue)}</td>}
      {money && <td className="num">{vnd(r.profit)}</td>}
    </>
  );
  const stChips = [{ k: 'active', l: 'Đang sản xuất' }, { k: 'preparing', l: 'Chuẩn bị' }, { k: 'paused', l: 'Tạm dừng' }, { k: 'ended', l: 'Kết thúc' }, { k: 'all', l: 'Tất cả vụ' }] as const;
  const stCount = (k: string) => (k === 'all' ? orgCycles.length : orgCycles.filter((c) => c.status === k).length);
  const statusChips = (
    <div className="chips" role="group" aria-label="Lọc vụ theo trạng thái">
      {stChips.filter((x) => x.k === 'all' || stCount(x.k) > 0).map((x) => (
        <button key={x.k} type="button" className={status === x.k ? 'chip active' : 'chip'} aria-pressed={status === x.k} onClick={() => setStatus(x.k)}>{x.l} ({stCount(x.k)})</button>
      ))}
    </div>
  );
  return (
    <>
      {statusChips}
      {showWin && (
        <label className="filters">Vụ kết thúc tính theo
          <select value={win} onChange={(e) => setWin(e.target.value)}>
            <option value="12m">12 tháng gần đây</option>
            {years.map((y) => <option key={y} value={y}>Năm {y}</option>)}
            <option value="all">Tất cả thời gian</option>
          </select>
        </label>
      )}
      <AreaFilter areas={mine} usedAreaIds={statusCycles.map((c) => c.area_id)} value={areaFilter} onChange={setAreaFilter} />
      {loading && !data && <p className="muted" role="status">Đang tải số liệu…</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {!data && !loading && !error && !navigator.onLine && <p className="muted">Cần có mạng để xem số liệu lần đầu.</p>}
      {data && rows.length === 0 && !loading && <p className="muted">Không có vụ nào ở bộ lọc này.</p>}
      <div className="card">
        <h2>Bảng số liệu</h2>
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th className="fold-col">Phân khu / Vụ</th>{money && <th className="num">Chi phí</th>}<th className="num">Thu hoạch</th>{money && <th className="num">Doanh thu</th>}{money && <th className="num">Lãi / lỗ</th>}</tr></thead>
          <tbody>
            {rows.flatMap((r) => [
              <tr key={r.area.id}><td className={r.cells.some((c) => c.cycles > 0) ? 'fold-col has-fold' : 'fold-col'}>
                {r.cells.some((c) => c.cycles > 0) && (
                  <button type="button" className="icon fold-btn" aria-expanded={isOpen(r.area.id)}
                    aria-label={`${isOpen(r.area.id) ? 'Đóng' : 'Mở'} danh sách ${r.cells.filter((c) => c.cycles > 0).length} ô sản xuất của ${r.area.name}`}
                    onClick={() => setOpenMap((m) => ({ ...m, [r.area.id]: !isOpen(r.area.id) }))}>{isOpen(r.area.id) ? '▾' : '▸'}</button>
                )}
                <strong>{r.area.name}</strong>
                <div className="muted">{cycleText(r)}{r.cells.some((c) => c.cycles > 0) ? ` · ${r.cells.filter((c) => c.cycles > 0).length} ô sản xuất${isOpen(r.area.id) ? '' : ' (đang đóng, bấm ▸ để mở)'}` : ''}</div>
              </td>{cells(r)}</tr>,
              ...(isOpen(r.area.id) ? r.cells.filter((c) => c.cycles > 0) : []).map((c) => <tr key={c.area.id}><td className="fold-col" style={{ paddingLeft: 24 }}>↳ {c.area.name}<div className="muted">{cycleText(c)}</div></td>{cells(c)}</tr>),
            ])}
          </tbody>
        </table>
      </div>
      <p className="muted">Số tạm tính, cộng sẵn từ các vụ của từng khu (vụ đã kết thúc tính theo khoảng thời gian đã chọn). Muốn xem chi tiết một vụ, chuyển sang tab "Tổng hợp vụ chi tiết".</p>
      </div>
    </>
  );
}
