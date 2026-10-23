import { useEffect, useState } from 'react';
import { KpiTile, shortMoney } from './HomeStats';
import { useOnline } from '../lib/hooks';
import { attentionCount, delta, deltaText, deltaTone, weekLabel, type WeeklyReport } from '../lib/weekly';
import { cachedWeekly, fetchWeekly } from '../lib/weeklyApi';

/** Thẻ gọn "Tuần vừa qua" ở Trang chủ cho chủ/quản lý (D80): doanh thu, chi phí, số điểm cần chú ý; bấm để mở Báo cáo tuần. Tải lười. */
export default function HomeWeekly({ orgId, onOpen }: { orgId: string; onOpen: () => void }) {
  const online = useOnline();
  const [r, setR] = useState<WeeklyReport | null>(() => cachedWeekly(orgId));

  useEffect(() => {
    setR(cachedWeekly(orgId));
    if (!navigator.onLine) return;
    let alive = true;
    fetchWeekly(orgId).then((x) => { if (alive) setR(x); }).catch(() => { /* giữ bản đã lưu */ });
    return () => { alive = false; };
  }, [orgId, online]);

  if (!r) return null;
  const n = attentionCount(r.attention);
  const c = r.cur, p = r.prev;
  return (
    <>
      <h2 className="sect">Tuần vừa qua · {weekLabel(r.week_start, r.week_end)}</h2>
      <div className="kpis">
        {c.revenue !== null && p.revenue !== null && <KpiTile label="Doanh thu tuần" value={shortMoney(c.revenue)} tone={deltaTone('revenue', delta(c.revenue, p.revenue))} note={deltaText(delta(c.revenue, p.revenue), shortMoney(p.revenue))} onClick={onOpen} />}
        {c.cost !== null && p.cost !== null && <KpiTile label="Chi phí tuần" value={shortMoney(c.cost)} tone={deltaTone('cost', delta(c.cost, p.cost))} note={deltaText(delta(c.cost, p.cost), shortMoney(p.cost))} onClick={onOpen} />}
        <KpiTile label="Việc đã ghi tuần" value={String(c.logs)} tone={deltaTone('logs', delta(c.logs, p.logs))} note={deltaText(delta(c.logs, p.logs), String(p.logs))} onClick={onOpen} />
        <KpiTile label="Cần chú ý" value={String(n)} tone={n > 0 ? 'warn' : 'ok'} note={n > 0 ? 'bấm để xem báo cáo tuần' : 'không có gì gấp'} onClick={onOpen} />
      </div>
    </>
  );
}
