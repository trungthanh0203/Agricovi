import { ChartCard, XYChart } from './charts';
import { compactNumber, dayShort } from '../lib/chartMath';
import type { PayItem } from '../lib/payBookLogic';

const hrs = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ`;

/**
 * Biểu đồ Bảng lương (D88): giờ công từng ngày trong kỳ khi đang xem MỘT người (chỉ công đã xác nhận). Luôn có bản bảng thay thế.
 * (Biểu đồ "Thực nhận 6 tháng gần nhất" đã bỏ theo yêu cầu 20/11/2026.)
 */
export default function PayCharts({ items, from, to }: { items: PayItem[] | null; from: string; to: string }) {
  const byDay = new Map<string, number>();
  for (const i of items ?? []) if (i.kind === 'hours') byDay.set(i.date, (byDay.get(i.date) ?? 0) + i.minutes / 60);
  const days = [...byDay.keys()].sort();
  const spanOk = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 <= 62; // kỳ tháng/quý mới vẽ theo ngày
  if (!items || !spanOk || days.length === 0) return null;
  return (
    <ChartCard title="Giờ công từng ngày" subtitle="Chỉ công đã xác nhận" table={{ columns: ['Ngày', 'Giờ công'], rows: days.map((d) => [d, hrs(byDay.get(d) ?? 0)]) }}>
      <XYChart kind="bar" labels={days} shortLabels={days.map(dayShort)} format={hrs} axisFormat={compactNumber}
        series={[{ label: 'Giờ công', tone: 'ok' }]} values={[days.map((d) => byDay.get(d) ?? 0)]} ariaLabel="Giờ công từng ngày" />
    </ChartCard>
  );
}
