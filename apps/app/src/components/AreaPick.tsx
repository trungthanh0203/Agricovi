import { useState } from 'react';
import { areaFamily } from '../lib/payFilter';
import { useTable } from '../lib/tables';

/**
 * Chọn phân khu TRƯỚC, rồi mới chọn vụ (biểu mẫu Ghi chi phí, Thu hoạch, Bán hàng; D214).
 * Mặc định chưa chọn ('' = "Chọn phân khu"); "Tất cả phân khu" là một mục trong danh sách. Danh sách vụ chỉ hiện sau khi đã chọn, và chỉ gồm các vụ
 * của phân khu đó (kể cả vụ ở các ô sản xuất bên trong). Cơ sở chưa có phân khu nào thì bỏ bước này. `enabled` = false (đang sửa) cũng bỏ bước này.
 */
export function useAreaPick(orgId: string | undefined, enabled: boolean) {
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const cycleRows = useTable('cycles');
  const tops = areas.filter((a) => !a.parent_id).sort((x, y) => x.name.localeCompare(y.name, 'vi'));
  const [sel, setSel] = useState('');
  const need = enabled && tops.length > 0;
  const fam = need && sel && sel !== 'all' ? areaFamily(sel, areas) : null;
  /** Chỉ giữ các vụ thuộc phân khu đã chọn; chưa chọn phân khu thì không có vụ nào */
  function apply<T extends { id: string }>(list: T[]): T[] {
    if (!need) return list;
    if (sel === '') return [];
    if (!fam) return list;
    return list.filter((c) => { const a = cycleRows.find((x) => x.id === c.id)?.area_id; return !!a && fam.has(a); });
  }
  return { sel, setSel, tops, need, pending: need && sel === '', apply };
}

export function AreaPickField({ pick, onPick, empty }: { pick: ReturnType<typeof useAreaPick>; onPick?: () => void; empty?: boolean }) {
  if (!pick.need) return null;
  return (
    <label>Phân khu
      <select value={pick.sel} onChange={(e) => { pick.setSel(e.target.value); onPick?.(); }}>
        <option value="" disabled>Chọn phân khu</option>
        <option value="all">Tất cả phân khu</option>
        {pick.tops.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {pick.pending && <small>Chọn phân khu trước, rồi mới chọn vụ.</small>}
      {empty && !pick.pending && <small>Phân khu này chưa có vụ phù hợp.</small>}
    </label>
  );
}
