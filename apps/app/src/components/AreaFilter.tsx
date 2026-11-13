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
    const counts = new Map<string, number>(); // số vụ của từng phân khu (gồm các ô bên trong)
    for (const id of usedAreaIds) { const t = topAreaIdOf(id, byId); if (t) counts.set(t, (counts.get(t) ?? 0) + 1); }
    return topAreas(areas).filter((a) => counts.has(a.id)).map((a) => ({ id: a.id, name: a.name, count: counts.get(a.id) ?? 0 }));
  }, [areas, usedAreaIds]);
  if (options.length < 2) return null;
  return (
    <div className="filters">
      <label>
        Phân khu
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Tất cả phân khu</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.count} vụ)</option>)}
        </select>
      </label>
    </div>
  );
}
