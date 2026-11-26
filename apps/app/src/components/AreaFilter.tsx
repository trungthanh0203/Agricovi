import { useMemo } from 'react';
import type { AreaRow } from '../lib/db';
import { topAreas } from '../lib/areas';
import { t as tx } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** Phân khu (cấp 1) của một khu/ô: ô sản xuất thuộc phân khu cha; khu không có cha thì chính nó */
export const topAreaIdOf = (areaId: string, areaById: Map<string, AreaRow>): string | undefined => {
  const a = areaById.get(areaId);
  return a ? (a.parent_id ?? a.id) : undefined;
};

/** Các phân khu (cấp 1) có vụ, kèm số vụ (gồm các ô bên trong) */
export function areaFilterOptions(areas: AreaRow[], usedAreaIds: string[]) {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const counts = new Map<string, number>();
  for (const id of usedAreaIds) { const t = topAreaIdOf(id, byId); if (t) counts.set(t, (counts.get(t) ?? 0) + 1); }
  return topAreas(areas).filter((a) => counts.has(a.id)).map((a) => ({ id: a.id, name: a.name, count: counts.get(a.id) ?? 0 }));
}

/** Bộ lọc hiện (từ 2 phân khu có vụ) mà người dùng chưa chọn gì ('' = "Chọn phân khu"): chưa tải/hiện danh sách */
export const areaFilterPending = (optionCount: number, value: string) => optionCount >= 2 && value === '';
/** Mã phân khu cần lọc; '' hoặc 'all' = không lọc */
export const areaFilterId = (value: string) => (value === 'all' ? '' : value);

/**
 * Bộ lọc theo phân khu cho danh sách vụ (D154, D212). Mặc định "Chọn phân khu" (chưa hiện gì); "Tất cả phân khu" là một mục trong danh sách.
 * Chỉ hiện khi có từ 2 phân khu có vụ trở lên.
 */
export function AreaFilter({ areas, usedAreaIds, value, onChange }: { areas: AreaRow[]; usedAreaIds: string[]; value: string; onChange: (id: string) => void }) {
  const options = useMemo(() => areaFilterOptions(areas, usedAreaIds), [areas, usedAreaIds]);
  if (options.length < 2) return null;
  return (
    <div className="filters">
      <label>
        {tx`Phân khu`}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>{tx`Chọn phân khu`}</option>
          <option value="all">{tx`Tất cả phân khu`}</option>
          {options.map((a) => <option key={a.id} value={a.id}><Trans>{a.name} ({a.count} vụ)</Trans></option>)}
        </select>
      </label>
    </div>
  );
}
