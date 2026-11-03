import { useMemo } from 'react';
import type { AreaRow } from '../lib/db';
import { topAreas } from '../lib/areas';

/** Phân khu (cấp 1) của một khu/ô: ô sản xuất thuộc phân khu cha; khu không có cha thì chính nó */
export const topAreaIdOf = (areaId: string, areaById: Map<string, AreaRow>): string | undefined => {
  const a = areaById.get(areaId);
  return a ? (a.parent_id ?? a.id) : undefined;
};

/** Bộ lọc theo phân khu cho danh sách vụ (D154). Chỉ hiện khi có từ 2 phân khu trở lên có vụ. */
export function AreaFilter({ areas, usedAreaIds, value, onChange }: { areas: AreaRow[]; usedAreaIds: string[]; value: string; onChange: (id: string) => void }) {
  const options = useMemo(() => {
    const byId = new Map(areas.map((a) => [a.id, a]));
    const tops = new Set(usedAreaIds.map((id) => topAreaIdOf(id, byId)).filter((x): x is string => !!x));
    return topAreas(areas).filter((a) => tops.has(a.id));
  }, [areas, usedAreaIds]);
  if (options.length < 2) return null;
  return (
    <div className="filters">
      <label>
        Phân khu
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Tất cả phân khu</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
    </div>
  );
}
