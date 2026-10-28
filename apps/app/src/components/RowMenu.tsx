import { useEffect, useState } from 'react';

export interface MenuItem { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }

/**
 * Nút ⋮ cho một dòng của danh sách/lưới: bấm mở bảng "Tuỳ chọn" trượt từ dưới lên, liệt kê các chức năng của dòng (Chỉnh sửa, Xóa…).
 * Dùng cho mọi lưới có nhiều nút chức năng trên một dòng, nhường chỗ cho nội dung (xem docs/PLAN_MENU_DONG.md).
 * Chọn một mục thì đóng bảng rồi chạy chức năng; bấm nền, nút ✕, "Đóng" hoặc phím Esc để đóng.
 */
export function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const shown = items.filter((i) => i.label);
  if (shown.length === 0) return null;
  return (
    <>
      <button type="button" className="icon rowmenu-btn" aria-label={`Tùy chọn: ${label}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>⋮</button>
      {open && (
        <>
          <div className="sheet-back" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Tùy chọn: ${label}`}>
            <div className="sheet-head">
              <strong className="grow">Tuỳ chọn</strong>
              <button type="button" className="sheet-x" aria-label="Đóng" onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="sheet-sub">{label}</p>
            {shown.map((it) => (
              <button key={it.label} type="button" className={it.danger ? 'sheet-item danger' : 'sheet-item'} disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}>
                <span aria-hidden>{it.icon ?? '•'}</span>
                <span className="grow">{it.label}{it.hint && <small className="muted"> {it.hint}</small>}</span>
              </button>
            ))}
            <button type="button" className="sheet-item" onClick={() => setOpen(false)}><span aria-hidden>✕</span><span className="grow">Đóng</span></button>
          </div>
        </>
      )}
    </>
  );
}
