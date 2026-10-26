import { useEffect, useState } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { listPositions, type PositionRow } from '../lib/positions';
import { ROLE_LABEL } from '../lib/roles';

/**
 * Chọn CHỨC VỤ cho một người (D84): mỗi người đúng một chức vụ; vai trò (Quản lý/Nhân viên) và quyền lấy theo chức vụ.
 * Chưa chọn thì tự chọn chức vụ "Nhân viên" (nếu có). Cần mạng để tải danh sách chức vụ của cơ sở.
 */
export function PositionPicker({ orgId, value, onChange, disabled }: {
  orgId: string;
  value: string;
  onChange: (positionId: string, role: MemberRole) => void;
  disabled?: boolean;
}) {
  const [list, setList] = useState<PositionRow[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!navigator.onLine) { setError(true); return; }
    let alive = true;
    void listPositions(orgId).then((r) => {
      if (!alive) return;
      const act = r.filter((p) => p.is_active);
      setList(act);
      if (!value && act.length > 0) {
        const def = act.find((p) => p.base_role === 'worker' && p.name === ROLE_LABEL.worker) ?? act.find((p) => p.base_role === 'worker') ?? act[0]!;
        onChange(def.id, def.base_role);
      }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (error) return <p className="muted">Cần có mạng để chọn chức vụ.</p>;
  if (!list) return <p className="muted">Đang tải chức vụ…</p>;
  if (list.length === 0) return <p className="msg warn">Chưa có chức vụ nào. Hãy tạo chức vụ ở mục Khai báo → Chức vụ trước.</p>;
  const cur = list.find((p) => p.id === value);
  return (
    <label>
      Chức vụ
      <select value={value} disabled={disabled} onChange={(e) => { const p = list.find((x) => x.id === e.target.value); if (p) onChange(p.id, p.base_role); }}>
        {list.map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.base_role] ?? p.base_role})</option>)}
      </select>
      {cur?.description && <small>{cur.description}</small>}
    </label>
  );
}
