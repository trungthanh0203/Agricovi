import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { cycleCountUnit } from '../lib/countUnit';
import { AREA_UNITS, fmtArea, getAreaUnit } from '../lib/areaUnits';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { ChartCard, DonutChart, HBarList } from './charts';
import { friendlyError } from '../lib/errors';
import { formatMoney } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { countPendingForSummary, downloadCsv, fetchCycleSummary, getCachedSummary } from '../lib/summary';
import { buildSummaryCsv, canCompare, summaryNotes, vnNumber, type CycleSummary } from '../lib/summaryReport';
import { useTable } from '../lib/tables';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/**
 * Tổng kết vụ (v1.1 mục 4.5): chi phí tách theo bản chất, sản lượng, doanh thu đã ghi, cảnh báo thiếu dữ liệu.
 * Tính trên máy chủ nên cần mạng; mất mạng thì xem bản đã tải lần gần nhất và nói rõ là có thể cũ.
 */
export function SummarySection() {
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  const outbox = useTable('outbox');

  // chỉ vụ do cơ sở này sở hữu (quyền xem tổng kết theo chủ vụ)
  const own = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id), [cycles, active]);
  const ordered = useMemo(() => [...own].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')), [own]);
  const label = useCallback((id: string) => {
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''} · ${areas.find((a) => a.id === c.area_id)?.name ?? ''}`;
  }, [cycles, areas, cropTypes]);

  const remembered = (() => { try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; } })();
  const [picked, setPicked] = useState('');
  const cycleId = picked || (ordered.find((c) => c.id === remembered)?.id ?? ordered[0]?.id ?? '');
  // diện tích và năng suất (D94): theo đơn vị người dùng chọn (m² thì tính trên 1.000 m²)
  const cycleRow = cycles.find((c) => c.id === cycleId) ?? null;
  const areaM2 = cycleRow?.planted_area_m2 ?? null;
  const cnt = cycleCountUnit(cycleRow, cropTypes);
  const areaUnit = getAreaUnit();
  const unitDef = AREA_UNITS.find((u) => u.id === areaUnit) ?? AREA_UNITS[0]!;
  const f = unitDef.id === 'm2' ? 1 : unitDef.m2 / 1000;
  const perLabel = unitDef.id === 'm2' ? '1.000 m²' : unitDef.short;

  const [summary, setSummary] = useState<CycleSummary | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!cycleId) return;
    setError(null);
    setLoading(true);
    try {
      if (navigator.onLine) {
        try {
          const s = await fetchCycleSummary(cycleId);
          setSummary(s);
          setFetchedAt(s.updated_at);
          setFromCache(false);
          return;
        } catch (e) {
          // lỗi mạng thì rơi về bản đã tải; lỗi quyền/khác thì báo thẳng
          const msg = friendlyError(e);
          if (!/kết nối mạng/.test(msg)) {
            setSummary(null);
            setError(msg);
            return;
          }
        }
      }
      const cached = await getCachedSummary(cycleId);
      setSummary(cached?.data ?? null);
      setFetchedAt(cached?.fetched_at ?? null);
      setFromCache(true);
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => { void load(); }, [load]);
  // số bản ghi chờ gửi cập nhật theo hàng đợi; gửi xong thì tính lại tổng kết
  const prevPending = useRef(0);
  useEffect(() => {
    void countPendingForSummary().then((n) => {
      setPending(n);
      if (prevPending.current > 0 && n === 0) void load(); // vừa gửi xong: tính lại để số liệu có cả các bản ghi đó
      prevPending.current = n;
    });
  }, [outbox, load]);

  if (!active) return null;
  if (ordered.length === 0) return <p className="muted">Chưa có vụ trồng nào của cơ sở này để tổng kết.</p>;

  const notes = summary ? summaryNotes(summary, pending) : [];
  const compare = summary ? canCompare(summary) : false;
  // các khoản cấu thành tổng chi phí (cho vòng cơ cấu): cộng lại đúng bằng tổng chi phí đã ghi
  const costParts = summary ? [
    { label: 'Thực chi không phải vật tư', value: summary.cash_paid_other },
    { label: 'Vật tư đã dùng (từ kho)', value: summary.material_used_cost },
    { label: 'Vật tư đã dùng (ghi tay)', value: summary.material_used_manual },
    { label: 'Phân bổ / ước tính', value: summary.allocated_or_estimated },
    { label: 'Nhân công (kỳ đã khóa)', value: summary.labor_cost ?? 0 },
    { label: 'Nhân công (dự tính)', value: summary.labor_estimated ?? 0 },
  ].filter((p) => p.value > 0) : [];

  return (
    <>
      <label>
        Vụ trồng
        <select value={cycleId} onChange={(e) => setPicked(e.target.value)}>
          {ordered.map((c) => <option key={c.id} value={c.id}>{label(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
        </select>
      </label>

      <div className="actions">
        <button className="secondary" disabled={loading || !navigator.onLine} onClick={() => void load()}>
          {loading ? 'Đang tính…' : 'Tính lại'}
        </button>
        <button className="secondary" disabled={!summary}
          onClick={() => summary && downloadCsv(`tong-ket-vu-${new Date().toISOString().slice(0, 10)}.csv`, buildSummaryCsv({ cycleLabel: label(cycleId), summary, pendingCount: pending }))}>
          Xuất CSV
        </button>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}
      {!summary && !error && !loading && (
        <p className="msg warn">{navigator.onLine ? 'Chưa có số liệu.' : 'Đang offline và chưa có bản tổng kết nào được tải về. Hãy kết nối mạng một lần để xem.'}</p>
      )}

      {summary && (
        <>
          <p className="muted" role="status">
            {fromCache ? 'Bản đã tải lúc ' : 'Cập nhật lúc '}
            {fetchedAt ? new Date(fetchedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            {fromCache ? ' (đang offline, số liệu có thể cũ).' : '.'}
          </p>

          {notes.map((n, i) => (
            <p key={i} className={n.level === 'warn' ? 'msg warn' : 'msg'} role="status">{n.text}</p>
          ))}

          <div className="card">
            <h2>Chi phí đã ghi</h2>
            <Row k="Thực chi không phải vật tư" v={formatMoney(summary.cash_paid_other)} />
            <Row k="Vật tư đã dùng (từ kho)" v={formatMoney(summary.material_used_cost)} />
            <Row k="Vật tư đã dùng (ghi tay)" v={formatMoney(summary.material_used_manual)} />
            <Row k="Phân bổ / ước tính" v={formatMoney(summary.allocated_or_estimated)} />
            <Row k="Nhân công (kỳ đã khóa)" v={formatMoney(summary.labor_cost ?? 0)} />
            {(summary.labor_estimated ?? 0) > 0 && <Row k="Nhân công (kỳ chưa khóa, dự tính)" v={formatMoney(summary.labor_estimated ?? 0)} />}
            <div className="row member"><strong>Tổng chi phí đã ghi</strong><strong>{formatMoney(summary.total_cost)}</strong></div>
            <p className="muted">
              Tiền mua vật tư ({formatMoney(summary.cash_paid_material)}) không cộng vào tổng vì chi phí vật tư đã tính khi dùng.
              Giá vốn vật tư dùng = giá nhập bình quân các lần nhập có ghi giá.
            </p>
          </div>

          {summary.total_cost > 0 && (
            <ChartCard title="Cơ cấu chi phí đã ghi" subtitle="Tổng = các khoản ở trên cộng lại" footer="Tiền mua vật tư không cộng vào tổng vì đã tính khi dùng."
              table={{ columns: ['Khoản', 'Số tiền'], rows: costParts.map((p) => [p.label, formatMoney(p.value)]) }}>
              <DonutChart items={costParts} format={formatMoney} centerLabel="Tổng chi phí" ariaLabel="Cơ cấu chi phí của vụ" />
            </ChartCard>
          )}

          <div className="card">
            <h2>Sản lượng và doanh thu</h2>
            <Row k="Tổng thu hoạch" v={`${vnNumber(summary.harvested_gross_qty)} kg`} />
            <Row k="Hao hụt" v={`${vnNumber(summary.harvest_loss_qty)} kg`} />
            <Row k="Thu hoạch sau hao hụt" v={`${vnNumber(summary.harvested_net_qty)} kg`} />
            <Row k="Đã bán" v={`${vnNumber(summary.sold_qty)} kg`} />
            <Row k="Doanh thu đã ghi" v={formatMoney(summary.revenue_recorded)} />
          </div>

          {areaM2 ? (
            <div className="card">
              <h2>Diện tích và năng suất</h2>
              <Row k="Diện tích trồng" v={fmtArea(areaM2, areaUnit)} />
              {cycleRow?.plant_count ? <Row k={`Số ${cnt}`} v={`${cycleRow.plant_count.toLocaleString('vi-VN')} (${Math.round((cycleRow.plant_count / areaM2) * 1000).toLocaleString('vi-VN')} ${cnt}/1.000 m²)`} /> : null}
              {cycleRow?.variety_name ? <Row k="Giống" v={cycleRow.variety_name} /> : null}
              <Row k={`Năng suất (kg / ${perLabel})`} v={vnNumber((summary.harvested_net_qty / areaM2) * 1000 * f)} />
              <Row k={`Chi phí đã ghi / ${perLabel}`} v={formatMoney(Math.round((summary.total_cost / areaM2) * 1000 * f))} />
              <Row k={`Doanh thu đã ghi / ${perLabel}`} v={formatMoney(Math.round((summary.revenue_recorded / areaM2) * 1000 * f))} />
              {compare && <Row k={summary.revenue_recorded - summary.total_cost >= 0 ? `Lãi / ${perLabel}` : `Lỗ / ${perLabel}`} v={formatMoney(Math.abs(Math.round(((summary.revenue_recorded - summary.total_cost) / areaM2) * 1000 * f)))} />}
              {cycleRow?.plant_count ? <Row k={`Thu hoạch mỗi ${cnt}`} v={`${vnNumber(summary.harvested_net_qty / cycleRow.plant_count)} kg`} /> : null}
            </div>
          ) : null}

          <div className="card">
            <h2>Giá thành mỗi kg</h2>
            {summary.cost_per_kg !== null ? (
              <>
                <p><strong>{formatMoney(summary.cost_per_kg)}/kg</strong>{summary.has_estimated_cost ? ' (có khoản ước tính/phân bổ)' : ''}</p>
                <p className="muted">= Tổng chi phí đã ghi ÷ thu hoạch sau hao hụt.</p>
              </>
            ) : (
              <p className="muted">Chưa tính được: cần có thu hoạch và đủ giá vốn cho mọi lần dùng vật tư.</p>
            )}
            <div className="row member">
              <span>Doanh thu trừ chi phí đã ghi</span>
              <strong>{compare ? formatMoney(summary.revenue_recorded - summary.total_cost) : 'Chưa đủ dữ liệu'}</strong>
            </div>
            {(summary.revenue_recorded > 0 || summary.total_cost > 0) && (
              <HBarList ariaLabel="So sánh doanh thu và chi phí đã ghi" format={formatMoney}
                items={[{ label: 'Doanh thu đã ghi', value: summary.revenue_recorded, tone: 'ok' }, { label: 'Chi phí đã ghi', value: summary.total_cost, tone: 'bad' }]} />
            )}
            <p className="muted">Đây là chênh lệch theo số đã ghi, chưa phải lợi nhuận chính thức.</p>
          </div>
        </>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="row member"><span>{k}</span><strong>{v}</strong></div>;
}
