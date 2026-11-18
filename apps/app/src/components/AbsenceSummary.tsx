import { useCallback, useEffect, useMemo, useState } from 'react';
import { ABSENCE_KIND_LABEL, aggregateYear, fetchYearSummary, fmtDays, setAnnualLeaveDays, type AbsenceKind, type YearSummary } from '../lib/absences';
import { friendlyError } from '../lib/errors';
import type { WorkerLite } from '../lib/work';
import { Collapsible } from './Collapsible';

const KINDS = Object.keys(ABSENCE_KIND_LABEL) as AbsenceKind[];

/**
 * Chấm công → Nghỉ → Tổng hợp nghỉ trong năm (D190): mỗi người đã nghỉ bao nhiêu ngày, phép năm còn lại, nghỉ theo từng tháng.
 * Chủ đặt số ngày phép năm của cơ sở (mặc định 12). Tính theo ngày dương lịch; chưa nối bảng lương.
 */
export function AbsenceSummary({ orgId, workers, isOwner, online, refreshKey }: { orgId: string; workers: WorkerLite[]; isOwner: boolean; online: boolean; refreshKey: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<YearSummary | null>(null);
  const [allow, setAllow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const names = useMemo(() => new Map(workers.map((w) => [w.id, w.full_name])), [workers]);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { const s = await fetchYearSummary(orgId, year); setData(s); setAllow(String(s.allowance)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, year]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const rows = useMemo(() => (data ? aggregateYear(data) : []), [data]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  async function saveAllow() {
    const n = Number(allow);
    if (!Number.isInteger(n) || n < 0 || n > 60) return setError('Số ngày phép năm từ 0 đến 60.');
    setError(null); setMsg(null);
    try { await setAnnualLeaveDays(orgId, n); setMsg('Đã lưu số ngày phép năm.'); await load(); } catch (e) { setError(friendlyError(e)); }
  }

  return (
    <Collapsible title={`Tổng hợp nghỉ năm ${year}`} summary={data ? `${rows.length} người, ${fmtDays(total)}` : undefined}>
      <div className="inline-form">
        {error && <p className="msg error" role="alert">{error}</p>}
        {msg && <p className="msg ok" role="status">{msg}</p>}
        <div className="pair">
          <label>Năm<input type="number" value={year} min={2000} max={2100} onChange={(e) => e.target.value && setYear(Number(e.target.value))} /></label>
          <label>Số ngày phép năm mỗi người<input inputMode="numeric" value={allow} disabled={!isOwner || !online} onChange={(e) => setAllow(e.target.value)} /></label>
        </div>
        {isOwner && <button type="button" className="secondary" disabled={!online || !data || allow === String(data.allowance)} onClick={() => void saveAllow()}>Lưu số ngày phép năm</button>}
        {!isOwner && <p className="muted">Chỉ chủ cơ sở đổi số ngày phép năm.</p>}
        {data && rows.length === 0 && <p className="muted">Năm {year} chưa có ghi nghỉ nào.</p>}
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="grid">
              <thead><tr><th>Người</th><th>Phép năm còn lại</th>{KINDS.map((k) => <th key={k}>{ABSENCE_KIND_LABEL[k]}</th>)}<th>Tổng</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.workerId}>
                    <td>{names.get(r.workerId) ?? 'Người đã ngừng làm'}</td>
                    <td>{r.annualLeft < 0 ? <span className="pill err">vượt {fmtDays(-r.annualLeft)}</span> : fmtDays(r.annualLeft)}</td>
                    {KINDS.map((k) => <td key={k}>{r.byKind[k] ? fmtDays(r.byKind[k]) : '—'}</td>)}
                    <td><strong>{fmtDays(r.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <Collapsible inline title="Theo từng tháng" summary="số ngày nghỉ mỗi tháng">
            <div className="table-scroll">
              <table className="grid">
                <thead><tr><th>Người</th>{Array.from({ length: 12 }, (_, i) => <th key={i}>T{i + 1}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.workerId}>
                      <td>{names.get(r.workerId) ?? 'Người đã ngừng làm'}</td>
                      {r.months.map((m, i) => <td key={i}>{m ? m.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>
        )}
        <p className="muted">Tính theo ngày dương lịch (kể cả thứ bảy, chủ nhật); nửa ngày tính 0,5. Chưa tự trừ vào bảng lương.</p>
      </div>
    </Collapsible>
  );
}
