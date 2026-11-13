import { useEffect, useMemo, useState } from 'react';
import { ChartCard, DonutChart, HBarList } from './charts';
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
  if (!active) return null;
  if (!mine.some((a) => a.parent_id) || rows.length === 0) return <p className="muted">Chưa có phân khu nào có vụ để tổng hợp. Phân khu chia ô sản xuất và có vụ sẽ hiện ở đây.</p>;
  const money = Boolean(stats?.can_money);
  const kg = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`);
  const kg0 = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`;
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
  const byCost = rows.filter((r) => (r.cost ?? 0) > 0).map((r) => ({ label: r.area.name, value: r.cost ?? 0 }));
  const byRevenue = rows.filter((r) => (r.revenue ?? 0) > 0).map((r) => ({ label: r.area.name, value: r.revenue ?? 0 })).sort((a, b) => b.value - a.value);
  const byProfit = rows.filter((r) => r.profit != null && r.profit !== 0)
    .map((r) => ({ label: r.area.name, value: Math.abs(r.profit ?? 0), tone: (r.profit ?? 0) >= 0 ? 'ok' : 'bad', note: (r.profit ?? 0) >= 0 ? 'lãi' : 'lỗ' }))
    .sort((a, b) => b.value - a.value);
  const byHarvest = rows.filter((r) => (r.harvest ?? 0) > 0).map((r) => ({ label: r.area.name, value: r.harvest ?? 0 })).sort((a, b) => b.value - a.value);
  const byCycles = rows.map((r) => ({ label: r.area.name, value: r.cycles, note: r.running > 0 ? `${r.running} đang chạy` : undefined })).sort((a, b) => b.value - a.value);
  return (
    <>
      <ChartCard title="Số vụ theo phân khu" subtitle="Gồm cả vụ đã kết thúc">
        <HBarList items={byCycles} format={(n) => `${n} vụ`} ariaLabel="Số vụ theo phân khu" />
      </ChartCard>
      {money && byProfit.length > 0 && (
        <ChartCard title="Lãi / lỗ tạm tính theo phân khu" subtitle="Thanh xanh là lãi, thanh đỏ là lỗ">
          <HBarList items={byProfit} format={formatMoney} ariaLabel="Lãi lỗ theo phân khu" />
        </ChartCard>
      )}
      {money && byRevenue.length > 0 && (
        <ChartCard title="Doanh thu theo phân khu">
          <HBarList items={byRevenue} format={formatMoney} tone="ok" ariaLabel="Doanh thu theo phân khu" />
        </ChartCard>
      )}
      {money && byCost.length > 0 && (
        <ChartCard title="Chi phí chiếm bao nhiêu ở mỗi phân khu" subtitle="Phần nào tốn nhiều tiền nhất">
          <DonutChart items={byCost} format={formatMoney} centerLabel="Tổng chi phí" ariaLabel="Cơ cấu chi phí theo phân khu" />
        </ChartCard>
      )}
      {byHarvest.length > 0 && (
        <ChartCard title="Sản lượng thu hoạch theo phân khu">
          <HBarList items={byHarvest} format={kg0} tone="info" ariaLabel="Sản lượng theo phân khu" />
        </ChartCard>
      )}
      <div className="card">
        <h2>Bảng số liệu</h2>
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
      <p className="muted">Số tạm tính, cộng từ các vụ của từng khu (cả vụ đã kết thúc). Muốn xem chi tiết một vụ, chuyển sang tab "Tổng hợp vụ chi tiết".</p>
      </div>
    </>
  );
}
