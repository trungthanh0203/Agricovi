import { pct } from '../../lib/chartMath';

interface Seg { label: string; value: number; tone: string }

/**
 * Thanh chia phần nằm ngang (ví dụ tuổi nợ: quá hạn · sắp đến hạn · còn hạn). Mỗi phần có NHÃN, giá trị và % ở chú giải bên dưới,
 * màu theo nghĩa (đỏ/cam/xanh), không chỉ dựa vào màu.
 */
export function ProportionBar({ segments, format, ariaLabel }: { segments: Seg[]; format: (n: number) => string; ariaLabel: string }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return <p className="muted">Không có khoản nào còn nợ.</p>;
  return (
    <div className="propbar">
      <div className="pb-track" role="img" aria-label={ariaLabel}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <i key={s.label} style={{ width: `${Math.max(2, (s.value / total) * 100)}%`, background: `var(--c-${s.tone})` }} title={`${s.label}: ${format(s.value)}`} />
        ))}
      </div>
      <ul className="pb-legend">
        {segments.map((s) => (
          <li key={s.label} className={s.value > 0 ? '' : 'zero'}>
            <i style={{ background: `var(--c-${s.tone})` }} aria-hidden />
            <span className="lbl">{s.label}</span>
            <span className="val">{format(s.value)}</span>
            <span className="pc">{pct(s.value, total).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
