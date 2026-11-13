import { useEffect, useMemo, useState } from 'react';
import { ChartCard, HBarList, ProportionBar } from './charts';
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
  const [measure, setMeasure] = useState('profit');
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
  const measures = [
    { key: 'profit', label: 'Lãi / lỗ', money: true },
    { key: 'compare', label: 'Doanh thu và chi phí', money: true },
    { key: 'harvest', label: 'Thu hoạch', money: false },
    { key: 'cycles', label: 'Số vụ', money: false },
  ].filter((m) => money || !m.money);
  const cur = measures.find((m) => m.key === measure) ?? measures[0]!;
  const valueOf = (r: (typeof rows)[number]): number => Number((r as unknown as Record<string, number | null>)[cur.key] ?? 0);
  const items = rows.map((r) => ({ r, v: valueOf(r) })).filter((x) => x.v !== 0)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .map(({ r, v }) => ({
      label: r.area.name, value: Math.abs(v),
      note: [cur.key === 'profit' ? (v >= 0 ? 'lãi' : 'lỗ') : '', `${r.cycles} vụ`].filter(Boolean).join(' · '),
      tone: cur.key === 'profit' ? (v >= 0 ? 'ok' : 'bad') : 'info',
    }));
  const fmtVal = cur.key === 'harvest' ? kg0 : formatMoney;
  const cmp = [...rows].filter((r) => (r.cost ?? 0) > 0 || (r.revenue ?? 0) > 0).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)).slice(0, 8);
  // số vụ chia khúc theo trạng thái (đang chạy, chuẩn bị, tạm dừng, đã kết thúc), mỗi phân khu một thanh
  const STATUS = [
    { key: 'active', label: 'Đang chạy', tone: 'ok' }, { key: 'preparing', label: 'Chuẩn bị', tone: 'info' },
    { key: 'paused', label: 'Tạm dừng', tone: 'warn' }, { key: 'ended', label: 'Đã kết thúc', tone: 'other' },
  ];
  const statusOf = (ids: Set<string>) => STATUS.map((st) => ({ label: st.label, tone: st.tone, value: cycles.filter((c) => c.owner_org_id === active.id && ids.has(c.area_id) && c.status === st.key).length }));
  const zoneIds = (r: (typeof rows)[number]) => new Set([r.area.id, ...mine.filter((a) => a.parent_id === r.area.id).map((a) => a.id)]);
  const subtitle = cur.key === 'profit' ? 'Xanh là lãi, đỏ là lỗ; chữ nhỏ ghi số vụ' : cur.key === 'compare' ? 'Mỗi phân khu hai thanh: doanh thu (xanh) dài hơn chi phí (đỏ) là có lãi' : cur.key === 'cycles' ? 'Mỗi thanh là một phân khu, chia khúc theo trạng thái của vụ' : 'Chữ nhỏ ghi số vụ của phân khu';
  return (
    <>
      <ChartCard title={`${cur.label} theo phân khu`} subtitle={subtitle}>
        <div className="chips" role="group" aria-label="Chọn số liệu để vẽ">
          {measures.map((m) => <button key={m.key} className={m.key === cur.key ? 'chip active' : 'chip'} aria-pressed={m.key === cur.key} onClick={() => setMeasure(m.key)}>{m.label}</button>)}
        </div>
        {cur.key === 'cycles' ? (
          <>
            {[{ name: 'Tất cả phân khu', ids: new Set(rows.flatMap((r) => [...zoneIds(r)])) }, ...rows.map((r) => ({ name: r.area.name, ids: zoneIds(r) }))].map((z) => (
              <div key={z.name} style={{ marginBottom: 10 }}>
                <strong>{z.name}</strong>
                <ProportionBar segments={statusOf(z.ids).filter((x) => x.value > 0)} format={(n) => `${n} vụ`} ariaLabel={`Số vụ theo trạng thái: ${z.name}`} />
              </div>
            ))}
          </>
        ) : cur.key === 'compare' ? (
          cmp.length === 0 ? <p className="muted">Chưa có chi phí hay doanh thu để vẽ.</p> : (
            <HBarList format={formatMoney} ariaLabel="Doanh thu và chi phí theo phân khu"
              items={cmp.flatMap((r) => [{ label: `${r.area.name} — Doanh thu`, value: r.revenue ?? 0, tone: 'ok' }, { label: `${r.area.name} — Chi phí`, value: r.cost ?? 0, tone: 'bad' }])} />
          )
        ) : (
          <HBarList items={items} format={fmtVal} ariaLabel={`${cur.label} theo phân khu`} />
        )}
      </ChartCard>
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
