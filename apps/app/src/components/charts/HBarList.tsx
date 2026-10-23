interface Item { label: string; value: number; note?: string; /** màu riêng của thanh (mặc định theo `tone` của cả danh sách) */ tone?: string }

/**
 * Thanh ngang "Top N": tên bên trái, thanh theo tỉ lệ so với giá trị lớn nhất, SỐ ở cuối thanh (docs/DESIGN_DASHBOARD.md mục 1.8).
 * Dùng cho xếp hạng (khách, nhà cung ứng, vật tư, người…); giá trị lớn nhất trước.
 */
export function HBarList({ items, format, tone = 'info', ariaLabel }: { items: Item[]; format: (n: number) => string; tone?: string; ariaLabel: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max <= 0) return <p className="muted">Chưa có số liệu để vẽ.</p>;
  return (
    <ul className="hbars" aria-label={ariaLabel}>
      {items.map((i) => (
        <li key={i.label}>
          <span className="hb-label" title={i.label}>{i.label}{i.note && <small>{i.note}</small>}</span>
          <span className="hb-track" aria-hidden><i style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: `var(--c-${i.tone ?? tone})` }} /></span>
          <span className="hb-val">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
