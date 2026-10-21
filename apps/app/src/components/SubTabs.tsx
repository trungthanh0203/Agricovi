import type { Section } from '../lib/tabs';

/** Biểu tượng cho từng mục (menu dọc) */
const ICONS: Record<string, string> = {
  cycles: '🌱', harvest: '🧺', stock: '📦', attendance: '⏱',
  areas: '🏡', crops: '🌾', worktypes: '🧰', templates: '📋', materials: '🧪', places: '🏬', rates: '💵',
  members: '👥', positions: '🛡️', teams: '🧑‍🤝‍🧑', coop: '🤝',
  expense: '💸', sales: '💰', summary: '📊', payroll: '🧾', custom: '🔎',
};

/**
 * Menu dọc của một tab (D51): mỗi chức năng là một dòng có biểu tượng, bấm để vào; trong chức năng có thanh "‹ Menu" để quay lại.
 * `value` null = đang ở menu. Chỉ có một mục thì không cần menu (người gọi tự mở mục đó, xem `pickSection`). Chỉ phần đang mở mới được dựng,
 * nên không làm chậm việc tải.
 */
export function SubTabs<Id extends string>({ items, value, onChange, onBack, label }: {
  items: Section<Id>[];
  value: Id | null;
  onChange: (id: Id) => void;
  onBack: () => void;
  label: string;
}) {
  if (items.length < 2) return null;
  if (value === null) {
    return (
      <nav className="menu" aria-label={label}>
        {items.map((x) => (
          <button key={x.id} className="menu-item" onClick={() => onChange(x.id)}>
            <span className="menu-ico" aria-hidden>{ICONS[x.id] ?? '•'}</span>
            <span className="menu-label">{x.label}</span>
            <span className="menu-go" aria-hidden>›</span>
          </button>
        ))}
      </nav>
    );
  }
  const cur = items.find((x) => x.id === value);
  return (
    <div className="menubar">
      <button className="menu-back" onClick={onBack} aria-label={`Quay lại menu ${label}`}>‹ Menu</button>
      <strong className="menu-cur">{ICONS[value] ?? ''} {cur?.label}</strong>
    </div>
  );
}

/** Mục đang mở: đúng mục được chọn; nếu chỉ có một mục thì mở luôn; còn lại (null) là đang ở menu */
export function pickSection<Id extends string>(items: Section<Id>[], wanted: string | undefined): Id | null {
  const hit = items.find((x) => x.id === wanted);
  if (hit) return hit.id;
  return items.length === 1 ? items[0]!.id : null;
}
