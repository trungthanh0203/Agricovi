import { useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { ADJ_KIND_LABEL, fmtVnd, loadStatements, type AdjustmentRow, type LineRow, type MyPay } from '../lib/work';

/**
 * Phiếu lương của chính mình theo kỳ (D86): bấm một kỳ để xem từng dòng công/lương, thưởng, phạt, tạm ứng (có lý do) và THỰC NHẬN.
 * Số "Dự tính" có thể đổi đến khi chủ khóa kỳ. Tải khi mở để không tốn dữ liệu.
 */
export function MyPayslip({ pay, workerId }: { pay: MyPay; workerId: string }) {
  const [data, setData] = useState<{ lines: LineRow[]; adj: AdjustmentRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (data || !navigator.onLine) return;
    try {
      const r = await loadStatements(pay.periodId);
      const st = r.statements.find((s) => s.worker_id === workerId);
      setData({ lines: r.lines.filter((l) => l.statement_id === st?.id), adj: r.adjustments.filter((a) => a.worker_id === workerId) });
    } catch (e) { setError(friendlyError(e)); }
  }
  const sum = (k: AdjustmentRow['kind']) => (data?.adj ?? []).filter((a) => a.kind === k).reduce((t, a) => t + a.amount, 0);

  return (
    <details className="fold inline" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load(); }}>
      <summary>
        <span className="fold-title">{fmtDate(pay.start)} – {fmtDate(pay.end)}</span>
        <span className="fold-sum"><strong>{fmtVnd(pay.total)}</strong> {pay.approved ? '· đã chốt' : '· dự tính'}</span>
      </summary>
      <div className="fold-body">
        {error && <p className="msg error" role="alert">{error}</p>}
        {!data && !error && <p className="muted">{navigator.onLine ? 'Đang tải…' : 'Cần có mạng để xem chi tiết.'}</p>}
        {data && (
          <>
            {data.lines.map((l) => <p key={l.id} className="muted">{l.explanation} = <strong>{fmtVnd(l.amount)}</strong></p>)}
            {data.adj.map((a) => <p key={a.id} className="muted">{ADJ_KIND_LABEL[a.kind]}: {a.kind === 'bonus' ? '+' : '−'}{fmtVnd(a.amount)} — {a.reason}</p>)}
            <p><strong>Thực nhận: {fmtVnd(pay.total)}</strong>
              <span className="sub">= công và lương {fmtVnd(data.lines.reduce((t, l) => t + l.amount, 0))}{sum('bonus') > 0 ? ` + thưởng ${fmtVnd(sum('bonus'))}` : ''}{sum('deduction') > 0 ? ` − phạt ${fmtVnd(sum('deduction'))}` : ''}{sum('advance') > 0 ? ` − tạm ứng ${fmtVnd(sum('advance'))}` : ''}</span></p>
          </>
        )}
      </div>
    </details>
  );
}
