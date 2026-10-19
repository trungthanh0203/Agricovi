import type { MemberRole } from '@agriconnect/shared';
import { assignableRoles, ROLE_LABEL } from '../lib/roles';

/** Chọn một hoặc nhiều vai trò (một người có thể kiêm nhiều vai trò). Chủ cơ sở không nằm trong danh sách. */
export function RolePicker({
  orgType, value, onChange, disabled,
}: { orgType: 'household' | 'cooperative'; value: MemberRole[]; onChange: (v: MemberRole[]) => void; disabled?: boolean }) {
  const toggle = (r: MemberRole) =>
    onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <fieldset className="roles">
      <legend>Vai trò (chọn một hoặc nhiều)</legend>
      {assignableRoles(orgType).map((r) => (
        <label key={r} className="check">
          <input type="checkbox" checked={value.includes(r)} disabled={disabled} onChange={() => toggle(r)} />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </fieldset>
  );
}
