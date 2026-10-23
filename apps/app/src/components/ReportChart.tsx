import { ChartCard, DonutChart, HBarList, XYChart } from './charts';
import { compactNumber } from '../lib/chartMath';
import { buildChartSpec, type ValueKind } from '../lib/reportChart';
import { fmtCell, type ReportResult } from '../lib/reports';

const fmt = (kind: ValueKind, unit: string) => (n: number) => {
  if (kind === 'money') return `${Math.round(n).toLocaleString('vi-VN')} đ`;
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
};

/**
 * Biểu đồ của một kết quả Báo cáo theo nhu cầu (G2-7). Loại biểu đồ chọn theo loại báo cáo và cách nhóm (lib/reportChart.ts);
 * luôn kèm bản bảng thay thế ở mục "Xem dạng bảng". Báo cáo không vẽ được (không có số liệu dương) thì báo rõ, không vẽ bừa.
 */
export function ReportChart({ result }: { result: ReportResult }) {
  const spec = buildChartSpec(result);
  if (!spec) return <p className="muted">Chưa có đủ số liệu để vẽ biểu đồ cho báo cáo này. Hãy xem dạng bảng.</p>;
  const range = `${result.from.split('-').reverse().join('/')} – ${result.to.split('-').reverse().join('/')}`;

  if (spec.kind === 'bars') {
    const kinds = spec.series.map((s) => s.kind);
    const f = (n: number) => fmt(kinds[0]!, kinds[0] === 'money' ? '' : '')(n);
    return (
      <ChartCard title={spec.title} subtitle={range}
        table={{ columns: ['Mục', ...spec.series.map((s) => s.label)], rows: spec.labels.map((l, i) => [l, ...spec.series.map((s, si) => fmt(s.kind, '')(spec.values[si]![i]!))]) }}>
        <XYChart kind="bar" labels={spec.labels} shortLabels={spec.shortLabels} format={f} axisFormat={compactNumber}
          series={spec.series.map((s) => ({ label: s.label, tone: s.tone }))} values={spec.values} ariaLabel={`${spec.title}, ${range}`} />
      </ChartCard>
    );
  }
  const f = fmt(spec.valueKind, spec.unit);
  const table = { columns: ['Mục', 'Giá trị'], rows: spec.items.map((i) => [i.label, fmtCell(i.value, spec.valueKind === 'money' ? 'money' : 'num')]) };
  if (spec.kind === 'donut') {
    return (
      <ChartCard title={spec.title} subtitle={range} table={table}>
        <DonutChart items={spec.items} format={f} centerLabel="Tổng" ariaLabel={`${spec.title}, ${range}`} />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={spec.title} subtitle={range} table={table}>
      <HBarList items={spec.items} format={f} tone={result.type === 'expenses' || result.type === 'purchases' ? 'bad' : result.type === 'sales' || result.type === 'customers' ? 'ok' : 'info'} ariaLabel={`${spec.title}, ${range}`} />
    </ChartCard>
  );
}
