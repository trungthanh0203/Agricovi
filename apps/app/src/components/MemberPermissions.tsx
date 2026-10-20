import { useState } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import { setMemberPermissions } from '../lib/members';
import {
  defaultPerm, effectivePerm, PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES,
  type PermLevel, type PermModule, type PermOverrides,
} from '../lib/permissions';

/** Giá trị trong ô chọn: '' = theo vai trò (mặc định) */
type Choice = '' | PermLevel;

/**
 * Chủ cơ sở cấp quyền xem và nhập liệu theo từng mục (kho, thu hoạch, chi phí, doanh thu, tổng kết vụ) cho một người.
 * "Theo vai trò" = chưa cấp riêng, người đó có quyền như vai trò hiện tại của họ.
 */
export function MemberPermissions({ orgId, userId, roles, overrides, onSaved }: {
  orgId: string;
  userId: string;
  roles: MemberRole[];
  overrides: PermOverrides;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<PermModule, Choice>>(() =>
    Object.fromEntries(PERM_MODULES.map((m) => [m, (overrides[m] ?? '') as Choice])) as Record<PermModule, Choice>,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const perms: PermOverrides = {};
      for (const m of PERM_MODULES) if (draft[m]) perms[m] = draft[m] as PermLevel;
      await setMemberPermissions(orgId, userId, perms);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-form">
      <p className="muted">Chọn người này được thấy và nhập liệu những mục nào (kho, thu hoạch, chi phí, doanh thu, tổng kết, khai báo). Cấp riêng ở đây sẽ đè lên vai trò và chức vụ. Để "Theo vai trò" nếu không muốn cấp riêng.</p>
      {PERM_MODULES.map((m) => {
        const dflt = PERM_LEVEL_LABEL[defaultPerm(roles, m)];
        const now = PERM_LEVEL_LABEL[effectivePerm(roles, draft[m] ? { [m]: draft[m] as PermLevel } : {}, m)];
        return (
          <label key={m}>
            {PERM_MODULE_LABEL[m]}
            <select value={draft[m]} disabled={busy} onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [m]: e.target.value as Choice })); }}>
              <option value="">Theo vai trò ({dflt.toLowerCase()})</option>
              <option value="none">{PERM_LEVEL_LABEL.none}</option>
              <option value="view">{PERM_LEVEL_LABEL.view}</option>
              {m !== 'summary' && <option value="edit">{PERM_LEVEL_LABEL.edit}</option>}
            </select>
            <small>Hiện tại: {now}</small>
          </label>
        );
      })}
      {error && <p className="msg error" role="alert">{error}</p>}
      {saved && <p className="msg ok" role="status">Đã lưu quyền. Người này thấy thay đổi khi mở lại app.</p>}
      <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu quyền'}</button>
    </div>
  );
}
