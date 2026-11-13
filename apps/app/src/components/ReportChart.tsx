import { useState } from 'react';
import { ChartCard, DonutChart, HBarList, ProportionBar, XYChart } from './charts';
import { compactNumber } from '../lib/chartMath';
import { buildChartSpec, chartOptions, type ValueKind } from '../lib/reportChart';
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
  const [picked, setPicked] = useState('');
  const options = chartOptions(result);
  const measure = options.some((o) => o.key === picked) ? picked : options[0]?.key ?? '';
  const spec = buildChartSpec(result, measure);
  // các nút chọn số liệu luôn hiện, kể cả khi số đang chọn toàn bằng 0, để đổi sang số khác ngay không phải qua tab Bảng
  const chooser = options.length > 1 && (
    <div className="chips" role="group" aria-label="Chọn số liệu để vẽ">
      {options.map((o) => <button key={o.key} className={o.key === measure ? 'chip active' : 'chip'} aria-pressed={o.key === measure} onClick={() => setPicked(o.key)}>{o.label}</button>)}
    </div>
  );
  if (!spec) return <>{chooser}<p className="muted">{result.rows.length === 0 ? 'Không có số liệu trong khoảng này.' : 'Số liệu này đều bằng 0 nên chưa vẽ được. Hãy chọn số liệu khác ở trên, hoặc xem dạng bảng.'}</p></>;
  const range = `${result.from.split('-').reverse().join('/')} – ${result.to.split('-').reverse().join('/')}`;

  if (spec.kind === 'segments') {
    return (
      <>{chooser}<ChartCard title={spec.title} subtitle={range}
        table={{ columns: ['Mục', 'Trạng thái và số vụ'], rows: spec.items.map((i) => [i.label, i.segments.map((s) => `${s.label}: ${s.value}`).join(', ')]) }}>
        {spec.items.map((i) => (
          <div key={i.label} style={{ marginBottom: 10 }}>
            <strong>{i.label}</strong>
            <ProportionBar segments={i.segments} format={(n) => `${n} vụ`} ariaLabel={`Số vụ theo trạng thái: ${i.label}`} />
          </div>
        ))}
      </ChartCard></>
    );
  }
  if (spec.kind === 'bars') {
    const kinds = spec.series.map((s) => s.kind);
    const f = (n: number) => fmt(kinds[0]!, kinds[0] === 'money' ? '' : '')(n);
    return (
      <>{chooser}<ChartCard title={spec.title} subtitle={range}
        table={{ columns: ['Mục', ...spec.series.map((s) => s.label)], rows: spec.labels.map((l, i) => [l, ...spec.series.map((s, si) => fmt(s.kind, '')(spec.values[si]![i]!))]) }}>
        <XYChart kind="bar" labels={spec.labels} shortLabels={spec.shortLabels} format={f} axisFormat={compactNumber}
          series={spec.series.map((s) => ({ label: s.label, tone: s.tone }))} values={spec.values} ariaLabel={`${spec.title}, ${range}`} />
      </ChartCard></>
    );
  }
  const f = fmt(spec.valueKind, spec.unit);
  const table = { columns: ['Mục', 'Giá trị'], rows: spec.items.map((i) => [i.label, `${'note' in i && i.note ? '-' : ''}${fmtCell(i.value, spec.valueKind === 'money' ? 'money' : 'num')}`]) };
  if (spec.kind === 'donut') {
    return (
      <>{chooser}<ChartCard title={spec.title} subtitle={range} table={table}>
        <DonutChart items={spec.items} format={f} centerLabel="Tổng" ariaLabel={`${spec.title}, ${range}`} />
      </ChartCard></>
    );
  }
  return (
    <>{chooser}<ChartCard title={spec.title} subtitle={range} table={table}>
      <HBarList items={spec.items} format={f} tone={spec.tone} ariaLabel={`${spec.title}, ${range}`} />
    </ChartCard></>
  );
}
