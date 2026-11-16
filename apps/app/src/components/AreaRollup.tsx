import { useEffect, useMemo, useState } from 'react';
import { AreaFilter, topAreaIdOf } from './AreaFilter';
import { cachedCycleStats, STATS_MAX_CYCLES, type CycleStats } from '../lib/cycleStats';
import { CycleStatsLoader } from './CycleStatsLoader';
import { rollupByArea } from '../lib/areas';
import { formatMoney } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

/**
 * Tổng hợp theo phân khu (D125): chi phí, thu hoạch, doanh thu, lãi lỗ tạm tính cộng từ các vụ của phân khu và mọi ô sản xuất bên trong.
 * Số lấy từ thống kê tóm tắt của máy chủ (cùng nguồn với thẻ vụ); phần tiền chỉ hiện với người có quyền xem tiền. Chỉ hiện khi cơ sở có chia ô sản xuất.
 */
export function AreaRollup() {
  const { active } = useOrgs();
  const areas = useTable('areas');
  const cycles = useTable('cycles');
  const [status, setStatus] = useState<'all' | 'active' | 'preparing' | 'paused' | 'ended'>('all'); // lọc vụ theo trạng thái cho cả biểu đồ và bảng
  const [areaFilter, setAreaFilter] = useState('');   // lọc theo một phân khu ('' = tất cả)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});   // phân khu đang mở danh sách ô sản xuất (mặc định đóng, trừ khi đang lọc đúng phân khu đó)
  const [stats, setStats] = useState<CycleStats | null>(null);
  useEffect(() => {
    if (!active) return;
    setStats(cachedCycleStats(active.id));   // số liệu tải theo vụ đang xem (CycleStatsLoader, D173)
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = useMemo(() => areas.filter((a) => a.organization_id === active?.id), [areas, active?.id]);
  const orgCycles = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id && c.status !== 'cancelled'), [cycles, active?.id]);
  const statusCycles = useMemo(() => orgCycles.filter((c) => status === 'all' || c.status === status), [orgCycles, status]);
  // chỉ tải số liệu cho các vụ đang xem (đúng trạng thái và phân khu đã chọn); quá nhiều vụ thì yêu cầu chọn hẹp lại (D173)
  const areaById = useMemo(() => new Map(mine.map((a) => [a.id, a])), [mine]);
  const wantCycles = useMemo(() => (areaFilter && mine.some((a) => a.id === areaFilter) ? statusCycles.filter((c) => topAreaIdOf(c.area_id, areaById) === areaFilter) : statusCycles), [statusCycles, areaFilter, areaById, mine]);
  const tooMany = wantCycles.length > STATS_MAX_CYCLES;
  const allRows = useMemo(() => rollupByArea(mine, tooMany ? [] : statusCycles, stats?.cycles ?? []), [mine, statusCycles, stats, tooMany]);
  const rows = useMemo(() => (areaFilter && allRows.some((r) => r.area.id === areaFilter) ? allRows.filter((r) => r.area.id === areaFilter) : allRows), [allRows, areaFilter]);
  if (!active) return null;
  if (!mine.some((a) => a.parent_id) || orgCycles.length === 0) return <p className="muted">Chưa có phân khu nào có vụ để tổng hợp. Phân khu chia ô sản xuất và có vụ sẽ hiện ở đây.</p>;
  const money = Boolean(stats?.can_money);
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
  const stChips = [{ k: 'all', l: 'Tất cả' }, { k: 'active', l: 'Đang sản xuất' }, { k: 'preparing', l: 'Chuẩn bị' }, { k: 'paused', l: 'Tạm dừng' }, { k: 'ended', l: 'Kết thúc' }] as const;
  const stCount = (k: string) => (k === 'all' ? orgCycles.length : orgCycles.filter((c) => c.status === k).length);
  const statusChips = (
    <div className="chips" role="group" aria-label="Lọc vụ theo trạng thái">
      {stChips.filter((x) => x.k === 'all' || stCount(x.k) > 0).map((x) => (
        <button key={x.k} type="button" className={status === x.k ? 'chip active' : 'chip'} aria-pressed={status === x.k} onClick={() => setStatus(x.k)}>{x.k === 'all' ? 'Tất cả vụ' : x.l} ({stCount(x.k)})</button>
      ))}
    </div>
  );
  return (
    <>
      {statusChips}
      <AreaFilter areas={mine} usedAreaIds={statusCycles.map((c) => c.area_id)} value={areaFilter} onChange={setAreaFilter} />
      {!tooMany && <CycleStatsLoader orgId={active.id} ids={wantCycles.map((c) => c.id)} refreshKey={wantCycles.map((c) => `${c.id}:${c.version}:${c.status}`).join(',')} onData={setStats} />}
      {tooMany && <p className="msg warn" role="status">Có {wantCycles.length} vụ nên chưa tải số liệu. Hãy chọn một phân khu hoặc một trạng thái (ví dụ "Đang sản xuất") để xem.</p>}
      {rows.length === 0 && !tooMany && <p className="muted">Không có vụ nào ở trạng thái này.</p>}
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
      <p className="muted">Số tạm tính, cộng từ các vụ của từng khu (cả vụ đã kết thúc). Muốn xem chi tiết một vụ, chuyển sang tab "Tổng hợp vụ chi tiết".</p>
      </div>
    </>
  );
}
