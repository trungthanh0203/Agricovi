import { useEffect, useState, type ReactNode } from 'react';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';

const ORDER = ['active', 'preparing', 'paused', 'ended'] as const;
const CHIP_LABEL: Record<(typeof ORDER)[number], string> = { active: 'Đang sản xuất', preparing: 'Chuẩn bị', paused: 'Tạm dừng', ended: 'Kết thúc' };

/**
 * Bộ chọn vụ có lọc theo trạng thái: một hàng nút (Tất cả, Đang sản xuất, Chuẩn bị, Tạm dừng, Kết thúc, kèm số vụ; trạng thái không có vụ thì ẩn)
 * và dropdown chỉ liệt kê các vụ thuộc nhóm đang lọc, nên danh sách ngắn, dễ nhìn. Mặc định "Tất cả". Vụ đang chọn luôn có trong dropdown dù không thuộc nhóm lọc.
 */
export function CycleSelect({ label, cycles, value, onChange, labelOf, emptyLabel, leading, showStatus = true, noAll, defaultStatus }: {
  label: ReactNode;
  cycles: { id: string; status: string }[];
  value: string;
  onChange: (id: string) => void;
  labelOf: (id: string) => string;
  /** Có thì thêm lựa chọn rỗng đầu danh sách (ví dụ "Tất cả các vụ") */
  emptyLabel?: string;
  /** Các lựa chọn đặc biệt đứng đầu danh sách (ví dụ "Tất cả", "Chi phí chung") khi cần nhiều hơn một */
  leading?: { value: string; label: string }[];
  /** Ghi trạng thái cuối tên vụ (khi đang xem "Tất cả") */
  showStatus?: boolean;
  /** Bỏ nút "Tất cả": luôn lọc theo một trạng thái, mặc định `defaultStatus` (nếu không có vụ thì lấy nhóm đầu tiên có vụ) */
  noAll?: boolean;
  defaultStatus?: (typeof ORDER)[number];
}) {
  const [filter, setFilter] = useState<'all' | (typeof ORDER)[number]>('all');
  const count = (st: string) => cycles.filter((c) => c.status === st).length;
  const chips = ORDER.filter((st) => count(st) > 0);
  const f: 'all' | (typeof ORDER)[number] = noAll
    ? (filter !== 'all' && count(filter) > 0 ? filter : (defaultStatus && count(defaultStatus) > 0 ? defaultStatus : chips[0] ?? 'all'))
    : (filter === 'all' || count(filter) > 0 ? filter : 'all');
  // noAll: vụ đang chọn không thuộc nhóm đang lọc (ví dụ vừa mở màn) thì chuyển sang vụ đầu của nhóm
  useEffect(() => {
    if (!noAll || f === 'all') return;
    const cur = cycles.find((c) => c.id === value);
    if (cur?.status === f) return;
    const first = cycles.find((c) => c.status === f);
    if (first) onChange(first.id);
  }, [noAll, f, value, cycles]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = f === 'all' ? cycles : cycles.filter((c) => c.status === f);
  // đổi nhóm lọc: nếu vụ đang chọn không thuộc nhóm mới thì bỏ chọn (về "Tất cả"/lựa chọn rỗng nếu có, không thì vụ đầu của nhóm) để danh sách và lựa chọn khớp nhau
  function pick(next: 'all' | (typeof ORDER)[number]) {
    setFilter(next);
    const cur = cycles.find((c) => c.id === value);
    if (next === 'all' || !cur || cur.status === next) return;
    if (emptyLabel !== undefined || leading?.some((o) => o.value === '')) onChange('');
    else { const first = cycles.find((c) => c.status === next); if (first) onChange(first.id); }
  }
  const current = cycles.find((c) => c.id === value);
  const list = current && !shown.some((c) => c.id === value) ? [current, ...shown] : shown;
  return (
    <>
      {chips.length > 1 && (
        <div className="chips" role="group" aria-label="Lọc vụ theo trạng thái">
          {!noAll && <button type="button" className={f === 'all' ? 'chip active' : 'chip'} aria-pressed={f === 'all'} onClick={() => pick('all')}>Tất cả ({cycles.length})</button>}
          {chips.map((st) => (
            <button type="button" key={st} className={f === st ? 'chip active' : 'chip'} aria-pressed={f === st} onClick={() => pick(st)}>{CHIP_LABEL[st]} ({count(st)})</button>
          ))}
        </div>
      )}
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {leading?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {list.map((c) => <option key={c.id} value={c.id}>{labelOf(c.id)}{showStatus && f === 'all' ? ` (${CYCLE_STATUS_LABEL_VI[c.status as keyof typeof CYCLE_STATUS_LABEL_VI] ?? c.status})` : ''}</option>)}
        </select>
      </label>
    </>
  );
}
