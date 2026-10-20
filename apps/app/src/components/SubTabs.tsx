import type { Section } from '../lib/tabs';

/**
 * Thanh chuyển mục con trong một tab, một hàng vuốt ngang. Ẩn khi chỉ có một mục (không cần chuyển).
 * `value` không còn hợp lệ (ví dụ quyền bị rút) thì người gọi dùng mục đầu tiên, xem `pickSection`.
 */
export function SubTabs<Id extends string>({ items, value, onChange, label }: {
  items: Section<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  label: string;
}) {
  if (items.length < 2) return null;
  return (
    <div className="chips" role="tablist" aria-label={label}>
      {items.map((x) => (
        <button key={x.id} role="tab" aria-selected={value === x.id} className={value === x.id ? 'chip active' : 'chip'} onClick={() => onChange(x.id)}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** Mục đang chọn nếu còn hợp lệ, không thì mục đầu tiên */
export function pickSection<Id extends string>(items: Section<Id>[], wanted: string | undefined): Id | null {
  return (items.find((x) => x.id === wanted) ?? items[0])?.id ?? null;
}
