import { useEffect, useState } from 'react';
import { ChartCard, XYChart } from './charts';
import { compactNumber, monthShort } from '../lib/chartMath';
import { useOnline } from '../lib/hooks';
import { cachedPeriodSeries, fetchPeriodSeries, type PeriodSeries } from '../lib/periodSeries';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const kg = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`;
const stamp = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Xu hướng 6 tháng ở Trang chủ (G2-7): chi phí so với doanh thu, và thu hoạch. Số liệu tính ở máy chủ theo kỳ đầy đủ, chỉ hiện mục người dùng
 * có quyền xem. Mất mạng thì hiện bản đã lưu lần trước và nói rõ. Tải lười (không nằm trong gói tải đầu tiên của app).
 */
export default function HomeTrend({ orgId }: { orgId: string }) {
  const online = useOnline();
  const [s, setS] = useState<PeriodSeries | null>(() => cachedPeriodSeries(orgId));
  const [fresh, setFresh] = useState(false); // true = vừa tải từ máy chủ
  const [error, setError] = useState(false);

  useEffect(() => {
    setS(cachedPeriodSeries(orgId));
    setFresh(false);
    if (!navigator.onLine) return;
    let alive = true;
    fetchPeriodSeries(orgId).then((r) => { if (alive) { setS(r); setFresh(true); setError(false); } }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [orgId, online]);

  if (!s) return error ? <p className="muted">Chưa tải được xu hướng theo tháng.</p> : null;
  const labels = s.months;
  const short = labels.map(monthShort);
  const foot = `${fresh ? 'Cập nhật' : 'Bản đã lưu trên máy, cập nhật'} lúc ${stamp(s.generated_at)}`;

  const money2 = [
    ...(s.cost ? [{ label: 'Chi phí', tone: 'bad', v: s.cost }] : []),
    ...(s.revenue ? [{ label: 'Doanh thu', tone: 'ok', v: s.revenue }] : []),
  ];
  return (
    <>
      {money2.length > 0 && (
        <ChartCard title="Chi phí và doanh thu 6 tháng gần nhất" subtitle="Chi phí không gồm tiền mua vật tư (đã tính khi dùng)" footer={foot}
          table={{ columns: ['Tháng', ...money2.map((m) => m.label)], rows: labels.map((l, i) => [l, ...money2.map((m) => money(m.v[i] ?? 0))]) }}>
          <XYChart kind="bar" labels={labels} shortLabels={short} format={money} axisFormat={compactNumber}
            series={money2.map((m) => ({ label: m.label, tone: m.tone }))} values={money2.map((m) => m.v)} ariaLabel="Chi phí và doanh thu theo tháng" />
        </ChartCard>
      )}
      {s.harvest_kg && (
        <ChartCard title="Thu hoạch 6 tháng gần nhất" subtitle="Sau hao hụt" footer={foot}
          table={{ columns: ['Tháng', 'Thu hoạch (kg)'], rows: labels.map((l, i) => [l, kg(s.harvest_kg![i] ?? 0)]) }}>
          <XYChart kind="line" labels={labels} shortLabels={short} format={kg} axisFormat={compactNumber}
            series={[{ label: 'Thu hoạch sau hao hụt', tone: 'info' }]} values={[s.harvest_kg]} ariaLabel="Thu hoạch theo tháng" />
        </ChartCard>
      )}
    </>
  );
}
