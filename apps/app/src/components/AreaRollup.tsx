import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { cachedCycleStats, fetchCycleStats, type CycleStats } from '../lib/cycleStats';
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
  const [stats, setStats] = useState<CycleStats | null>(null);
  useEffect(() => {
    if (!active) return;
    setStats(cachedCycleStats(active.id));
    if (!navigator.onLine) return;
    let alive = true;
    fetchCycleStats(active.id).then((s) => { if (alive) setStats(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = useMemo(() => areas.filter((a) => a.organization_id === active?.id), [areas, active?.id]);
  const rows = useMemo(() => rollupByArea(mine, cycles.filter((c) => c.owner_org_id === active?.id), stats?.cycles ?? []), [mine, cycles, stats, active?.id]);
  if (!active || !mine.some((a) => a.parent_id) || rows.length === 0) return null;
  const money = Boolean(stats?.can_money);
  const kg = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`);
  const vnd = (v: number | null) => (v == null ? '—' : formatMoney(v));
  const cells = (r: (typeof rows)[number]) => (
    <>
      <td className="num">{r.cycles}{r.running > 0 ? ` (${r.running} đang chạy)` : ''}</td>
      {money && <td className="num">{vnd(r.cost)}</td>}
      <td className="num">{kg(r.harvest)}</td>
      {money && <td className="num">{vnd(r.revenue)}</td>}
      {money && <td className="num">{vnd(r.profit)}</td>}
    </>
  );
  return (
    <Collapsible title="Tổng hợp theo phân khu" summary={`${rows.length} phân khu`}>
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Phân khu</th><th className="num">Vụ</th>{money && <th className="num">Chi phí</th>}<th className="num">Thu hoạch</th>{money && <th className="num">Doanh thu</th>}{money && <th className="num">Lãi / lỗ</th>}</tr></thead>
          <tbody>
            {rows.flatMap((r) => [
              <tr key={r.area.id}><td><strong>{r.area.name}</strong></td>{cells(r)}</tr>,
              ...r.cells.filter((c) => c.cycles > 0).map((c) => <tr key={c.area.id}><td style={{ paddingLeft: 24 }}>↳ {c.area.name}</td>{cells(c)}</tr>),
            ])}
          </tbody>
        </table>
      </div>
      <p className="muted">Số tạm tính, cộng từ các vụ của từng khu (cả vụ đã kết thúc). Muốn xem chi tiết một vụ, chọn vụ ở bên dưới.</p>
    </Collapsible>
  );
}
