import { useState } from 'react';
import { groupOthers, pct } from '../../lib/chartMath';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

interface Props {
  items: { label: string; value: number }[];
  /** Định dạng số của từng phần và tổng */
  format: (n: number) => string;
  /** Chữ nhỏ dưới tổng ở giữa vòng, ví dụ "Tổng chi phí" */
  centerLabel: string;
  ariaLabel: string;
}

/**
 * Vòng cơ cấu (SVG tự vẽ): tối đa 6 phần, phần nhỏ gộp thành "Khác"; mỗi phần có NHÃN TRỰC TIẾP kèm giá trị và % ở danh sách bên dưới
 * (không chỉ chú giải màu). Chạm vào một dòng để làm nổi bật phần tương ứng.
 */
export function DonutChart({ items, format, centerLabel, ariaLabel }: Props) {
  const slices = groupOthers(items, 6);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const [sel, setSel] = useState<number | null>(null);
  if (total <= 0) return <p className="muted">Chưa có số liệu để vẽ.</p>;

  const R = 46;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className="donut-svg">
        <g transform="rotate(-90 60 60)">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="16" className="donut-track" />
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const gap = slices.length > 1 ? Math.min(1.5, len * 0.3) : 0;
            const el = (
              <circle key={s.label} cx="60" cy="60" r={R} fill="none" strokeWidth={sel === i ? 20 : 16}
                strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`} strokeDashoffset={-acc}
                style={{ stroke: s.label === 'Khác' && slices.length > 1 && i === slices.length - 1 ? 'var(--c-other)' : COLORS[i % COLORS.length], transition: 'stroke-width .15s' }}
                opacity={sel === null || sel === i ? 1 : 0.45} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="60" y="58" textAnchor="middle" className="donut-total">{format(total)}</text>
        <text x="60" y="73" textAnchor="middle" className="donut-cap">{centerLabel}</text>
      </svg>
      <ul className="donut-list">
        {slices.map((s, i) => (
          <li key={s.label}>
            <button type="button" className={sel === i ? 'on' : ''} aria-pressed={sel === i} onClick={() => setSel(sel === i ? null : i)}>
              <i style={{ background: s.label === 'Khác' && slices.length > 1 && i === slices.length - 1 ? 'var(--c-other)' : COLORS[i % COLORS.length] }} aria-hidden />
              <span className="lbl">{s.label}</span>
              <span className="val">{format(s.value)}</span>
              <span className="pc">{pct(s.value, total).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
