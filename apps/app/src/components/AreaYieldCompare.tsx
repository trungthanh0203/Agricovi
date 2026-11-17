import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { AREA_UNITS, getAreaUnit } from '../lib/areaUnits';
import { fetchCycleStatsFor } from '../lib/cycleStats';
import type { CycleStat } from '../lib/cycleStatsLogic';
import { cycleTitle } from '../lib/cycles';
import { formatMoney } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';
import { compareRows, previousCycleIds, yieldChangePct } from '../lib/yieldCompare';
import { vnNumber } from '../lib/summaryReport';

/**
 * Tổng kết vụ → Chi tiết (H6): so năng suất, chi phí và lãi theo diện tích của vụ này với tối đa 3 vụ trước ở cùng nơi, cùng sản phẩm (trồng trọt).
 * Vụ chưa khai diện tích thì nhắc khai. Số lấy từ thống kê vụ của máy chủ nên cần mạng; không có số thì không hiện gì.
 */
export function AreaYieldCompare({ cycleId }: { cycleId: string }) {
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const cur = cycles.find((c) => c.id === cycleId) ?? null;
  const [stats, setStats] = useState<CycleStat[] | null>(null);
  const prevIds = useMemo(() => (cur ? previousCycleIds(cur, cycles.filter((c) => c.owner_org_id === active?.id)) : []), [cur, cycles, active?.id]);
  const key = `${cycleId}|${prevIds.join(',')}`;
  const hasArea = Boolean(cur?.planted_area_m2);
  useEffect(() => {
    setStats(null);
    if (!active || !cur || !hasArea || prevIds.length === 0 || !navigator.onLine) return;
    let alive = true;
    fetchCycleStatsFor(active.id, [cycleId, ...prevIds]).then((s) => { if (alive) setStats(s.cycles); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, active?.id, hasArea]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitId = getAreaUnit();
  const unit = AREA_UNITS.find((u) => u.id === unitId) ?? AREA_UNITS[0]!;
  const f = unit.id === 'm2' ? 1 : unit.m2 / 1000;
  const perLabel = unit.id === 'm2' ? '1.000 m²' : unit.short;
  if (!cur) return null;
  if (!hasArea) {
    return (
      <div className="card">
        <h2>Diện tích và năng suất</h2>
        <p className="muted">Chưa khai diện tích của vụ nên chưa tính được năng suất, chi phí và lãi theo diện tích. Khai ở Sản xuất → chọn vụ → Sửa thông tin vụ để thấy các chỉ số này và so với các vụ trước.</p>
      </div>
    );
  }
  const rows = stats ? compareRows(cycleId, stats, prevIds) : [];
  if (rows.length < 2) return null;     // không có vụ trước nào có số liệu để so
  const labelOf = (id: string) => {
    const c = cycles.find((x) => x.id === id);
    return c ? cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '') : '';
  };
  const pct = yieldChangePct(rows);
  const money = (v: number | null) => (v === null ? '—' : formatMoney(Math.round(v * f)));
  return (
    <div className="card">
      <h2>So với các vụ trước ở cùng nơi</h2>
      {pct !== null && <p>Năng suất vụ này <strong>{pct >= 0 ? `cao hơn ${pct}%` : `thấp hơn ${Math.abs(pct)}%`}</strong> so với vụ trước gần nhất.</p>}
      <div className="table-scroll">
        <table className="grid">
          <thead><tr><th>Vụ</th><th>Năng suất (kg/{perLabel})</th><th>Chi phí/{perLabel}</th><th>Lãi (lỗ)/{perLabel}</th><th>Giá thành/kg</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cycleId}>
                <td>{r.current ? 'Vụ này' : labelOf(r.cycleId)}</td>
                <td>{r.yieldPer1000 === null ? '—' : vnNumber(r.yieldPer1000 * f)}</td>
                <td>{money(r.costPer1000)}</td>
                <td>{r.profitPer1000 === null ? '—' : `${r.profitPer1000 < 0 ? '−' : ''}${formatMoney(Math.abs(Math.round(r.profitPer1000 * f)))}`}</td>
                <td>{r.costPerKg === null ? '—' : formatMoney(Math.round(r.costPerKg))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Chỉ so các vụ đã kết thúc, cùng sản phẩm và cùng nơi trồng, đã khai diện tích. Vụ này nếu còn đang chạy thì số là tạm tính.</p>
    </div>
  );
}
