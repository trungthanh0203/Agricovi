import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { clip, labelStep, niceScale } from '../../lib/chartMath';

export interface ChartSeries { label: string; /** tên biến màu, ví dụ 'ok' -> var(--c-ok) */ tone: string }

interface Props {
  kind: 'bar' | 'line';
  /** Nhãn đầy đủ của từng điểm (hiện ở dòng đọc số khi chạm) */
  labels: string[];
  /** Nhãn ngắn trên trục X */
  shortLabels?: string[];
  series: ChartSeries[];
  /** values[chỉ số chuỗi][chỉ số điểm] */
  values: number[][];
  /** Định dạng số đầy đủ (dòng đọc số, bảng thay thế) */
  format: (n: number) => string;
  /** Định dạng số rút gọn cho trục Y */
  axisFormat: (n: number) => string;
  ariaLabel: string;
  height?: number;
}

const M = { left: 46, right: 10, top: 12, bottom: 28 };

/**
 * Cột nhóm hoặc đường theo thời gian/hạng mục (SVG tự vẽ, không thư viện). Chạm (hoặc Enter) vào một cột để đọc số chính xác ở dòng bên dưới;
 * điểm đang chọn mặc định là điểm cuối. Màu có kèm tên chuỗi trong chú giải (không chỉ dựa vào màu). Nhiều điểm thì cuộn ngang bên trong khung.
 */
export function XYChart({ kind, labels, shortLabels, series, values, format, axisFormat, ariaLabel, height = 200 }: Props) {
  const uid = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const count = labels.length;
  const [sel, setSel] = useState<number>(Math.max(0, count - 1));
  const cur = Math.min(sel, Math.max(0, count - 1));
  // nhiều điểm thì cuộn tới điểm cuối (mới nhất), nơi điểm đang chọn mặc định nằm
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [count]);

  const all = values.flat();
  const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all), 4);
  const S = series.length;
  const groupW = kind === 'bar' ? Math.max(S * 15 + 14, 36) : 44;
  const plotW = Math.max(count * groupW, 280 - M.left - M.right);
  const W = M.left + plotW + M.right;
  const H = height;
  const plotH = H - M.top - M.bottom;
  const y = (v: number) => M.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
  const gw = plotW / Math.max(1, count);
  const cx = (i: number) => M.left + gw * i + gw / 2;
  const step = labelStep(count, Math.floor(plotW / 44));
  const short = shortLabels ?? labels;
  // nhãn trục X: mỗi `step` điểm một nhãn; điểm cuối cũng có nhãn nếu không đè lên nhãn trước
  const showLabel = (i: number) => i % step === 0 || (i === count - 1 && i - Math.floor(i / step) * step >= Math.ceil(step / 2));

  function onKey(e: KeyboardEvent<SVGGElement>, i: number) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i); }
    if (e.key === 'ArrowRight') setSel(Math.min(count - 1, i + 1));
    if (e.key === 'ArrowLeft') setSel(Math.max(0, i - 1));
  }

  return (
    <div className="xychart">
      <div className="chart-scroll" ref={scroller}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: W <= 360 ? '100%' : undefined }} role="img" aria-label={ariaLabel} preserveAspectRatio="xMinYMid meet">
          {/* lưới ngang và nhãn trục Y */}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-zero' : 'chart-grid'} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">{axisFormat(t)}</text>
            </g>
          ))}
          {/* điểm đang chọn */}
          <rect x={M.left + gw * cur} y={M.top} width={gw} height={plotH} className="chart-sel" />
          {kind === 'bar' && series.map((s, si) => values[si]!.map((v, i) => {
            const bw = Math.min(26, (gw * 0.76) / S);
            const x = cx(i) - (bw * S) / 2 + si * bw;
            const y0 = y(0);
            const y1 = y(v);
            return <rect key={`${si}-${i}`} x={x} y={Math.min(y0, y1)} width={Math.max(1, bw - 1)} height={Math.max(v === 0 ? 0 : 1, Math.abs(y0 - y1))} rx={2} style={{ fill: `var(--c-${s.tone})` }} opacity={i === cur ? 1 : 0.78} />;
          }))}
          {kind === 'line' && series.map((s, si) => (
            <g key={si}>
              <polyline fill="none" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: `var(--c-${s.tone})` }}
                points={values[si]!.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} />
              {values[si]!.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={i === cur ? 5 : 3} style={{ fill: `var(--c-${s.tone})` }} className="chart-dot" />)}
            </g>
          ))}
          {/* nhãn trục X */}
          {short.map((l, i) => showLabel(i) ? (
            <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className={i === cur ? 'chart-xlab on' : 'chart-xlab'}>{clip(l, 8)}</text>
          ) : null)}
          {/* vùng chạm cho từng điểm */}
          {labels.map((l, i) => (
            <g key={i} tabIndex={0} role="button" aria-pressed={i === cur} aria-label={`${l}: ${series.map((s, si) => `${s.label} ${format(values[si]![i]!)}`).join(', ')}`}
              onClick={() => setSel(i)} onKeyDown={(e) => onKey(e, i)} className="chart-hit">
              <rect x={M.left + gw * i} y={M.top} width={gw} height={plotH} fill="transparent" />
            </g>
          ))}
        </svg>
      </div>
      {/* chú giải kèm tên chuỗi và dòng đọc số của điểm đang chọn */}
      <ul className="chart-legend" aria-label="Chú giải" id={`${uid}-legend`}>
        {series.map((s) => <li key={s.label}><i style={{ background: `var(--c-${s.tone})` }} aria-hidden />{s.label}</li>)}
      </ul>
      <div className="chart-readout" aria-live="polite">
        <strong>{labels[cur]}</strong>
        {series.map((s, si) => (
          <span key={s.label}><i style={{ background: `var(--c-${s.tone})` }} aria-hidden />{s.label}: <b>{format(values[si]![cur] ?? 0)}</b></span>
        ))}
      </div>
    </div>
  );
}
