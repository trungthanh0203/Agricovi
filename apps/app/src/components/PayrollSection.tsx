import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Collapsible } from './Collapsible';
import { downloadCsv } from '../lib/summary';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { isOwner } from '../lib/roles';
import {
  addAdjustment, ADJ_KIND_LABEL, buildPayrollCsv, computePayroll, createPeriod, deleteAdjustment, fmtVnd, listPeriods, listWorkers, loadStatements, lockPayroll,
  PERIOD_STATUS_LABEL, unlockPayroll, type AdjustmentRow, type LineRow, type PayrollResult, type PeriodRow, type StatementRow, type WorkerLite,
} from '../lib/work';

/**
 * Tiền công theo kỳ (D42, D86): tạo kỳ → "Tính tiền công" từ công ĐÃ XÁC NHẬN (theo giờ) và lương cố định theo tháng của từng người →
 * thêm thưởng / phạt / tạm ứng (có lý do) → chủ khóa kỳ (chốt số). Thực nhận = công + lương tháng + thưởng − phạt − tạm ứng.
 * Mỗi dòng ghi rõ cách tính. Thiếu đơn giá thì báo, không tự tính 0.
 */
export function PayrollSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState(() => todayLocal().slice(0, 8) + '01');
  const [end, setEnd] = useState(todayLocal());

  const orgId = active?.id;
  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { const [p, w] = await Promise.all([listPeriods(orgId), listWorkers(orgId)]); setPeriods(p); setWorkers(w); } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const open = periods.find((p) => p.id === openId) ?? null;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (end < start) return setError('Ngày kết thúc không thể trước ngày bắt đầu.');
    setBusy(true);
    setError(null);
    createPeriod(active!.id, start, end)
      .then((id) => { setOpenId(id); setStart(addDays(end, 1)); return load(); })
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setBusy(false));
  }

  if (open) return <PeriodView period={open} workers={workers} isOwner={isOwner(active.roles)} onBack={() => { setOpenId(null); void load(); }} onChanged={() => void load()} />;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Tính tiền công cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      <Collapsible inline title="＋ Tạo kỳ trả công" summary="ví dụ tháng này">
        <form className="inline-form" onSubmit={onCreate} noValidate>
          <div className="pair">
            <label>Từ ngày<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <button type="submit" className="secondary" disabled={busy || !online}>Tạo kỳ</button>
        </form>
      </Collapsible>
      <table className="grid">
        <thead><tr><th>Kỳ ({periods.length})</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {periods.length === 0 && <tr><td colSpan={3} className="muted">Chưa có kỳ trả công nào.</td></tr>}
          {periods.map((p) => (
            <tr key={p.id}>
              <td>{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</td>
              <td><span className={p.status === 'locked' ? 'pill ok' : 'pill warn'}>{PERIOD_STATUS_LABEL[p.status]}</span></td>
              <td className="act"><button className="secondary" style={{ minHeight: 40, width: 'auto', margin: 0, padding: '0 12px' }} onClick={() => setOpenId(p.id)}>Mở</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Quy trình: chấm công → tổ trưởng/quản lý xác nhận → chủ đặt cách trả công cho từng người (hồ sơ nhân sự) → tính tiền công → nhập thưởng/phạt/tạm ứng nếu có → chủ khóa kỳ.</p>
    </>
  );
}

function PeriodView({ period, workers, isOwner: owner, onBack, onChanged }: {
  period: PeriodRow; workers: WorkerLite[]; isOwner: boolean; onBack: () => void; onChanged: () => void;
}) {
  const online = useOnline();
  const [data, setData] = useState<{ statements: StatementRow[]; lines: LineRow[]; adjustments: AdjustmentRow[] } | null>(null);
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(period.status);
  const [adjW, setAdjW] = useState('');
  const [adjKind, setAdjKind] = useState<AdjustmentRow['kind']>('bonus');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const locked = status === 'locked';
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.full_name ?? '—';

  const reload = useCallback(async () => {
    try { setData(await loadStatements(period.id)); } catch (e) { setError(friendlyError(e)); }
  }, [period.id]);
  useEffect(() => { void reload(); }, [reload]);

  const total = useMemo(() => (data?.statements ?? []).reduce((s, x) => s + (locked ? x.total_approved ?? x.total_estimated : x.total_estimated), 0), [data, locked]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await reload(); onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <button className="link" onClick={onBack}>← Danh sách kỳ</button>
      <div className="card">
        <div className="row"><h2 className="grow">{fmtDate(period.start_date)} – {fmtDate(period.end_date)}</h2><span className={locked ? 'pill ok' : 'pill warn'}>{PERIOD_STATUS_LABEL[status]}</span></div>
        <div className="kpis"><div className="kpi info"><span className="kpi-label">Tổng tiền công kỳ này</span><strong className="kpi-value">{fmtVnd(total)}</strong><span className="kpi-note">{locked ? 'đã duyệt (khóa)' : 'dự tính, chưa khóa'}</span></div></div>
        {!locked && (
          <button className="primary" disabled={busy || !online} onClick={() => void run(async () => { setResult(await computePayroll(period.id)); })}>Tính tiền công</button>
        )}
        {owner && !locked && data && data.statements.length > 0 && (
          <button className="secondary" disabled={busy || !online} onClick={() => {
            if (window.confirm('Khóa kỳ này? Sau khi khóa, công, sản lượng và khoản cộng/trừ trong kỳ không sửa được nữa (chủ có thể mở khóa kèm lý do).'))
              void run(async () => { await lockPayroll(period.id); setStatus('locked'); });
          }}>Khóa kỳ (chốt số)</button>
        )}
        {owner && locked && (
          <button className="secondary" disabled={busy || !online} onClick={() => {
            const r = window.prompt('Lý do mở khóa kỳ này (ít nhất 5 ký tự)?');
            if (r) void run(async () => { await unlockPayroll(period.id, r); setStatus('draft'); });
          }}>Mở khóa kỳ</button>
        )}
        {data && data.statements.length > 0 && (
          <button className="secondary" onClick={() => downloadCsv(`tien-cong-${period.start_date}_${period.end_date}.csv`, buildPayrollCsv({ start_date: period.start_date, end_date: period.end_date, status }, workers, data.statements, data.lines, data.adjustments))}>Xuất CSV</button>
        )}
        {!owner && !locked && <p className="muted">Chỉ chủ cơ sở được khóa kỳ.</p>}
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}
      {result && (
        <div className={result.missing_rate_hours > 0 ? 'msg warn' : 'msg ok'} role="status">
          Đã tính {result.lines} dòng cho {result.workers} người{result.salary_lines ? ` (có ${result.salary_lines} dòng lương cố định)` : ''}.
          {result.missing_rate_hours > 0 && ` Có ${result.missing_rate_hours} ca công chưa có cách trả công. Hãy nhờ chủ đặt ở Tổ chức → Nhân sự (bấm vào người → Trả công), rồi tính lại.`}
        </div>
      )}

      {(data?.statements ?? []).length === 0 && <p className="muted">Chưa có bảng lương. Bấm "Tính tiền công" (chỉ công đã xác nhận và người đã có cách trả công mới được tính).</p>}
      {(data?.statements ?? []).map((s) => {
        const lines = data!.lines.filter((l) => l.statement_id === s.id);
        const adj = data!.adjustments.filter((a) => a.worker_id === s.worker_id);
        return (
          <Collapsible key={s.id} title={nameOf(s.worker_id)} summary={fmtVnd(locked ? s.total_approved ?? s.total_estimated : s.total_estimated)}>
            {lines.map((l) => <p key={l.id} className="muted">{l.explanation} = <strong>{fmtVnd(l.amount)}</strong></p>)}
            {adj.map((a) => (
              <p key={a.id} className="muted">{ADJ_KIND_LABEL[a.kind]}: {a.kind === 'bonus' ? '+' : '−'}{fmtVnd(a.amount)} — {a.reason}
                {!locked && owner && <> <button className="link inline" disabled={busy || !online} onClick={() => { if (window.confirm('Xóa khoản này? Sau đó bấm Tính tiền công lại.')) void run(() => deleteAdjustment(a.id)); }}>Xóa</button></>}
              </p>
            ))}
            <p><strong>Thực nhận: {fmtVnd(locked ? s.total_approved ?? s.total_estimated : s.total_estimated)}</strong>
              <span className="sub">= công và lương {fmtVnd(lines.reduce((t, l) => t + l.amount, 0))}{adj.some((a) => a.kind === 'bonus') ? ` + thưởng ${fmtVnd(adj.filter((a) => a.kind === 'bonus').reduce((t, a) => t + a.amount, 0))}` : ''}{adj.some((a) => a.kind === 'deduction') ? ` − phạt ${fmtVnd(adj.filter((a) => a.kind === 'deduction').reduce((t, a) => t + a.amount, 0))}` : ''}{adj.some((a) => a.kind === 'advance') ? ` − tạm ứng ${fmtVnd(adj.filter((a) => a.kind === 'advance').reduce((t, a) => t + a.amount, 0))}` : ''}</span></p>
          </Collapsible>
        );
      })}

      {!locked && (
        <Collapsible inline title="＋ Thưởng / phạt / tạm ứng" summary="điều chỉnh tiền của một người">
          <form className="inline-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            const a = Number(adjAmt.replace(/[.,\s]/g, ''));
            if (!adjW) return setError('Hãy chọn người.');
            if (!adjAmt.trim() || Number.isNaN(a) || a <= 0) return setError('Số tiền phải lớn hơn 0.');
            if (adjReason.trim().length < 3) return setError('Hãy ghi lý do.');
            void run(async () => { await addAdjustment(period.organization_id, period.id, adjW, adjKind, a, adjReason); setAdjAmt(''); setAdjReason(''); });
          }}>
            <label>Người<select value={adjW} onChange={(e) => setAdjW(e.target.value)}><option value="">— Chọn người —</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}</select></label>
            <div className="pair">
              <label>Loại<select value={adjKind} onChange={(e) => setAdjKind(e.target.value as AdjustmentRow['kind'])}>{(Object.keys(ADJ_KIND_LABEL) as AdjustmentRow['kind'][]).map((k) => <option key={k} value={k}>{ADJ_KIND_LABEL[k]}</option>)}</select></label>
              <label>Số tiền (đồng)<input value={adjAmt} inputMode="numeric" onChange={(e) => setAdjAmt(e.target.value)} /></label>
            </div>
            <label>Lý do<input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} /></label>
            <div className="btnrow">
              <button type="submit" className="primary" disabled={busy || !online}>Thêm (rồi bấm Tính tiền công lại)</button>
              <button type="button" className="secondary" onClick={() => { setAdjAmt(''); setAdjReason(''); setError(null); }}>Hủy</button>
            </div>
          </form>
        </Collapsible>
      )}
    </>
  );
}

