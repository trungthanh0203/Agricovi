import { useEffect, useState } from 'react';
import { KpiTile, shortMoney } from './HomeStats';
import { useAuth } from '../lib/auth';
import { todayLocal, useOnline } from '../lib/hooks';
import { cachedOverview, fetchPayOverview } from '../lib/payBook';
import { hoursText, rangeOf, type PayRow } from '../lib/payBookLogic';

/** Thẻ "Lương tháng này" ở Trang chủ (D88): thực nhận (đã chốt + dự tính), giờ công và số ngày của CHÍNH MÌNH; bấm để mở Bảng lương. Tải lười; ẩn nếu chưa có hồ sơ chấm công. */
export default function HomePay({ orgId, onOpen }: { orgId: string; onOpen: () => void }) {
  const online = useOnline();
  const { session } = useAuth();
  const uid = session?.user.id;
  const r = rangeOf('month', todayLocal());
  const mine = (rows: PayRow[] | undefined) => rows?.find((x) => x.user_id === uid) ?? null;
  const [row, setRow] = useState<PayRow | null>(() => mine(cachedOverview(orgId, r.from, r.to, null)?.workers));

  useEffect(() => {
    setRow(mine(cachedOverview(orgId, r.from, r.to, null)?.workers));
    if (!navigator.onLine) return;
    let alive = true;
    fetchPayOverview(orgId, r.from, r.to, null).then((o) => { if (alive) setRow(mine(o.workers)); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, online, uid]);

  if (!row) return null;
  return (
    <>
      <h2 className="sect">Lương tháng này</h2>
      <div className="kpis">
        <KpiTile label="Thực nhận" value={shortMoney(row.net)} tone="info" title={`${Math.round(row.net).toLocaleString('vi-VN')} đ`} note={`đã chốt ${shortMoney(row.net_locked)} · còn lại là ước tính`} onClick={onOpen} />
        <KpiTile label="Giờ công" value={hoursText(row.hours)} note={`${row.days} ngày${row.pending_hours > 0 ? ` · chờ xác nhận ${hoursText(row.pending_hours)}` : ''}`} onClick={onOpen} />
      </div>
    </>
  );
}
