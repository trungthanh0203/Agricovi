import { useCallback, useEffect, useMemo, useState } from 'react';
import { PieceJobsSection } from './PieceJobsSection';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { fetchPayOverview } from '../lib/payBook';
import { rangeOf, shiftAnchor, type PayOverview } from '../lib/payBookLogic';

/**
 * Sản xuất → Phiếu khoán (mục 11), đứng sau Chấm công. Phiếu khoán là việc giao hằng ngày (lập phiếu, nghiệm thu) nên đặt cùng nhóm với Chấm công;
 * tiền khoán sau khi nghiệm thu tự vào Báo cáo → Bảng lương và chi phí nhân công của vụ. Xem theo tháng vì tiền khoán vào kỳ lương THÁNG của ngày làm.
 */
export function PieceworkSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const [anchor, setAnchor] = useState(todayLocal());
  const range = useMemo(() => rangeOf('month', anchor), [anchor]);
  const [ov, setOv] = useState<PayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try { setOv(await fetchPayOverview(orgId, range.from, range.to, null)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, range.from, range.to]);
  useEffect(() => { void load(); }, [load]);

  const people = useMemo(() => (ov?.workers ?? []).filter((r) => r.status === 'active').map((r) => ({ worker_id: r.worker_id, name: r.name })), [ov]);
  if (!orgId) return null;

  return (
    <div>
      <div className="range-nav">
        <button type="button" className="range-btn" onClick={() => setAnchor(shiftAnchor('month', anchor, -1))} aria-label="Tháng trước">‹</button>
        <div className="range-mid"><h2>{range.label}</h2><p className="muted">{fmtDate(range.from)} – {fmtDate(range.to)}</p></div>
        <button type="button" className="range-btn" onClick={() => setAnchor(shiftAnchor('month', anchor, 1))} disabled={range.to >= todayLocal()} aria-label="Tháng sau">›</button>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {!online && <p className="muted">Đang không có mạng: lập phiếu và nghiệm thu cần có mạng.</p>}
      <PieceJobsSection standalone orgId={orgId} range={range} people={people} online={online} onChanged={() => void load()} />
    </div>
  );
}
