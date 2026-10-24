import { useEffect, useState } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { listPositions, type PositionRow } from '../lib/positions';
import { assignableRoles, ROLE_LABEL } from '../lib/roles';

/**
 * Chọn vai trò (Quản lý, Nhân viên) và chức vụ của người (D83). Chức vụ chỉ cộng thêm quyền, KHÔNG đổi vai trò chính.
 * Chủ cơ sở không nằm trong danh sách. Chưa tải được danh mục (offline) thì dùng danh sách vai trò có sẵn.
 */
export function RolePicker({
  orgType, orgId, value, onChange, positionIds, onPositionsChange, disabled,
}: {
  orgType: 'household' | 'cooperative';
  orgId: string;
  value: MemberRole[];
  onChange: (v: MemberRole[]) => void;
  /** Có thì cho chọn cả vai trò tự tạo */
  positionIds?: string[];
  onPositionsChange?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<PositionRow[] | null>(null);
  useEffect(() => {
    if (!navigator.onLine) return;
    let alive = true;
    void listPositions(orgId).then((r) => { if (alive) setCatalog(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId]);

  const builtin = assignableRoles(orgType).filter((r) => !catalog || catalog.some((p) => p.is_builtin && p.base_role === r));
  const custom = onPositionsChange ? (catalog ?? []).filter((p) => !p.is_builtin && p.is_active) : [];
  const toggle = (r: MemberRole) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  const toggleCustom = (p: PositionRow) => {
    const on = (positionIds ?? []).includes(p.id);
    onPositionsChange?.(on ? (positionIds ?? []).filter((x) => x !== p.id) : [...(positionIds ?? []), p.id]);
  };
  return (
    <fieldset className="roles">
      <legend>Vai trò và chức vụ</legend>
      {builtin.map((r) => (
        <label key={r} className="check">
          <input type="checkbox" checked={value.includes(r)} disabled={disabled} onChange={() => toggle(r)} />
          {catalog?.find((p) => p.is_builtin && p.base_role === r)?.name ?? ROLE_LABEL[r]}
        </label>
      ))}
      {custom.map((p) => (
        <label key={p.id} className="check">
          <input type="checkbox" checked={(positionIds ?? []).includes(p.id)} disabled={disabled} onChange={() => toggleCustom(p)} />
          {p.name} <span className="muted">(chức vụ)</span>
        </label>
      ))}
    </fieldset>
  );
}
