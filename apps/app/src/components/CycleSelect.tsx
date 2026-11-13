import { useState, type ReactNode } from 'react';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';

const ORDER = ['active', 'preparing', 'paused', 'ended'] as const;
const CHIP_LABEL: Record<(typeof ORDER)[number], string> = { active: 'Đang sản xuất', preparing: 'Chuẩn bị', paused: 'Tạm dừng', ended: 'Kết thúc' };

/**
 * Bộ chọn vụ có lọc theo trạng thái: một hàng nút (Tất cả, Đang sản xuất, Chuẩn bị, Tạm dừng, Kết thúc, kèm số vụ; trạng thái không có vụ thì ẩn)
 * và dropdown chỉ liệt kê các vụ thuộc nhóm đang lọc, nên danh sách ngắn, dễ nhìn. Mặc định "Tất cả". Vụ đang chọn luôn có trong dropdown dù không thuộc nhóm lọc.
 */
export function CycleSelect({ label, cycles, value, onChange, labelOf, emptyLabel, showStatus = true }: {
  label: ReactNode;
  cycles: { id: string; status: string }[];
  value: string;
  onChange: (id: string) => void;
  labelOf: (id: string) => string;
  /** Có thì thêm lựa chọn rỗng đầu danh sách (ví dụ "Tất cả các vụ") */
  emptyLabel?: string;
  /** Ghi trạng thái cuối tên vụ (khi đang xem "Tất cả") */
  showStatus?: boolean;
}) {
  const [filter, setFilter] = useState<'all' | (typeof ORDER)[number]>('all');
  const count = (st: string) => cycles.filter((c) => c.status === st).length;
  const chips = ORDER.filter((st) => count(st) > 0);
  const f = filter === 'all' || count(filter) > 0 ? filter : 'all';
  const shown = f === 'all' ? cycles : cycles.filter((c) => c.status === f);
  const current = cycles.find((c) => c.id === value);
  const list = current && !shown.some((c) => c.id === value) ? [current, ...shown] : shown;
  return (
    <>
      {chips.length > 1 && (
        <div className="chips" role="group" aria-label="Lọc vụ theo trạng thái">
          <button type="button" className={f === 'all' ? 'chip active' : 'chip'} aria-pressed={f === 'all'} onClick={() => setFilter('all')}>Tất cả ({cycles.length})</button>
          {chips.map((st) => (
            <button type="button" key={st} className={f === st ? 'chip active' : 'chip'} aria-pressed={f === st} onClick={() => setFilter(st)}>{CHIP_LABEL[st]} ({count(st)})</button>
          ))}
        </div>
      )}
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {list.map((c) => <option key={c.id} value={c.id}>{labelOf(c.id)}{showStatus && f === 'all' ? ` (${CYCLE_STATUS_LABEL_VI[c.status as keyof typeof CYCLE_STATUS_LABEL_VI] ?? c.status})` : ''}</option>)}
        </select>
      </label>
    </>
  );
}
