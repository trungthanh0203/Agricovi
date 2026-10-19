import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { formatMoney } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { countPendingForSummary, downloadCsv, fetchCycleSummary, getCachedSummary } from '../lib/summary';
import { buildSummaryCsv, canCompare, summaryNotes, vnNumber, type CycleSummary } from '../lib/summaryReport';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/**
 * Tổng kết vụ (v1.1 mục 4.5): chi phí tách theo bản chất, sản lượng, doanh thu đã ghi, cảnh báo thiếu dữ liệu.
 * Tính trên máy chủ nên cần mạng; mất mạng thì xem bản đã tải lần gần nhất và nói rõ là có thể cũ.
 */
export function SummarySection() {
  const { active } = useOrgs();
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);
  const outbox = useLiveQuery(() => db.outbox.toArray(), [], []);

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
            <div className="row member"><strong>Tổng chi phí đã ghi</strong><strong>{formatMoney(summary.total_cost)}</strong></div>
            <p className="muted">
              Tiền mua vật tư ({formatMoney(summary.cash_paid_material)}) không cộng vào tổng vì chi phí vật tư đã tính khi dùng.
              Giá vốn vật tư dùng = giá nhập bình quân các lần nhập có ghi giá.
            </p>
          </div>

          <div className="card">
            <h2>Sản lượng và doanh thu</h2>
            <Row k="Tổng thu hoạch" v={`${vnNumber(summary.harvested_gross_qty)} kg`} />
            <Row k="Hao hụt" v={`${vnNumber(summary.harvest_loss_qty)} kg`} />
            <Row k="Thu hoạch sau hao hụt" v={`${vnNumber(summary.harvested_net_qty)} kg`} />
            <Row k="Đã bán" v={`${vnNumber(summary.sold_qty)} kg`} />
            <Row k="Doanh thu đã ghi" v={formatMoney(summary.revenue_recorded)} />
          </div>

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
