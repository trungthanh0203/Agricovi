import { useEffect, useState } from 'react';
import { ChartCard, XYChart } from './charts';
import { compactNumber, dayShort, monthShort } from '../lib/chartMath';
import { cachedSeries, fetchPaySeries, type PaySeries } from '../lib/payBook';
import type { PayItem } from '../lib/payBookLogic';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const hrs = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ`;

/**
 * Biểu đồ Bảng lương (D88): thực nhận 6 tháng gần nhất (một người hoặc cả cơ sở), và giờ công từng ngày trong kỳ (khi đang xem một người).
 * Luôn có bản bảng thay thế. Tải lười cùng tab Báo cáo.
 */
export default function PayCharts({ orgId, worker, items, from, to }: { orgId: string; worker: string | null; items: PayItem[] | null; from: string; to: string }) {
  const [s, setS] = useState<PaySeries | null>(() => cachedSeries(orgId, worker));
  useEffect(() => {
    setS(cachedSeries(orgId, worker));
    if (!navigator.onLine) return;
    let alive = true;
    fetchPaySeries(orgId, worker, 6).then((r) => { if (alive) setS(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, worker]);

  // giờ công từng ngày trong kỳ đang xem (chỉ công đã xác nhận)
  const byDay = new Map<string, number>();
  for (const i of items ?? []) if (i.kind === 'hours') byDay.set(i.date, (byDay.get(i.date) ?? 0) + i.minutes / 60);
  const days = [...byDay.keys()].sort();
  const spanOk = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 <= 62; // kỳ tháng/quý mới vẽ theo ngày

  return (
    <>
      {s && s.months.length > 0 && (
        <ChartCard title="Thực nhận 6 tháng gần nhất" subtitle="Gồm lương cố định, tiền công giờ, thưởng, trừ phạt và tạm ứng; tháng chưa chốt là ước tính"
          table={{ columns: ['Tháng', 'Thực nhận', 'Giờ công'], rows: s.months.map((m) => [m.month, money(m.net), hrs(m.hours)]) }}>
          <XYChart kind="bar" labels={s.months.map((m) => m.month)} shortLabels={s.months.map((m) => monthShort(m.month))} format={money} axisFormat={compactNumber}
            series={[{ label: 'Thực nhận', tone: 'info' }]} values={[s.months.map((m) => m.net)]} ariaLabel="Thực nhận theo tháng" />
        </ChartCard>
      )}
      {items && spanOk && days.length > 0 && (
        <ChartCard title="Giờ công từng ngày" subtitle="Chỉ công đã xác nhận" table={{ columns: ['Ngày', 'Giờ công'], rows: days.map((d) => [d, hrs(byDay.get(d) ?? 0)]) }}>
          <XYChart kind="bar" labels={days} shortLabels={days.map(dayShort)} format={hrs} axisFormat={compactNumber}
            series={[{ label: 'Giờ công', tone: 'ok' }]} values={[days.map((d) => byDay.get(d) ?? 0)]} ariaLabel="Giờ công từng ngày" />
        </ChartCard>
      )}
    </>
  );
}
