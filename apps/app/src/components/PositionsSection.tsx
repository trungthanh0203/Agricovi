import { useCallback, useEffect, useState } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { listMembers, type Member } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import { defaultPerm, PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES, type PermLevel, type PermModule, type PermOverrides } from '../lib/permissions';
import { addBuiltinRoles, deletePosition, listMemberPositions, listPositions, savePosition, type PositionRow } from '../lib/positions';
import { ROLE_LABEL } from '../lib/roles';

const RANK: Record<PermLevel, number> = { none: 0, view: 1, edit: 2 };

/** Quyền thấp nhất của một vai trò (Nhân viên/Quản lý); chức vụ chỉ được CỘNG THÊM quyền trên mức này */
const floor = (role: MemberRole, m: PermModule): PermLevel => defaultPerm([role], m);
const level = (p: PermOverrides, role: MemberRole, m: PermModule): PermLevel => {
  const v = p[m] ?? 'none';
  return RANK[v] >= RANK[floor(role, m)] ? v : floor(role, m);
};

const summarize = (p: PositionRow) => {
  const extra = PERM_MODULES.filter((m) => RANK[level(p.perms, p.base_role, m)] > RANK[floor(p.base_role, m)])
    .map((m) => `${PERM_MODULE_LABEL[m].split(' (')[0]}: ${PERM_LEVEL_LABEL[level(p.perms, p.base_role, m)].toLowerCase()}`);
  const parts = extra.length > 0 ? [`thêm ${extra.join(', ')}`] : ['quyền cơ bản'];
  if (p.can_manage_stages) parts.push('quản lý giai đoạn');
  if (p.work_type_ids !== null) parts.push(`${p.work_type_ids.length} loại việc`);
  return parts.join(' · ');
};

/**
 * Chức vụ của cơ sở (D84, chỉ chủ). Mỗi chức vụ CÓ MỘT VAI TRÒ: Nhân viên (mặc định) hoặc Quản lý; chọn Quản lý thì chủ chọn thêm các quyền.
 * Quyền của một chức vụ = quyền cơ bản của vai trò + phần chủ chọn thêm. Mỗi người giữ đúng một chức vụ (gán ở mục Nhân sự).
 * Xóa chức vụ chỉ được khi không ai giữ.
 */
export function PositionsSection({ org }: { org: MyOrg }) {
  const online = useOnline();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [held, setHeld] = useState<Map<string, string[]>>(new Map());
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [p, m, h] = await Promise.all([listPositions(org.id), listMembers(org.id), listMemberPositions(org.id)]);
      setPositions(p); setMembers(m); setHeld(h);
    } catch (e) { setError(friendlyError(e)); }
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }
  const people = members.filter((m) => !m.roles.includes('owner'));
  const holders = (p: PositionRow) => people.filter((m) => (held.get(m.user_id) ?? []).includes(p.id)).length;
  const editRow = positions.find((p) => p.id === editing) ?? null;
  const sorted = [...positions].sort((a, b) => Number(b.base_role === 'manager') - Number(a.base_role === 'manager') || a.name.localeCompare(b.name, 'vi'));

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Tạo, sửa và xóa chức vụ cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {!editing && <button className="secondary" disabled={!online} onClick={() => setEditing('new')}>+ Thêm chức vụ</button>}
      {!editing && (
        <button className="link" disabled={busy || !online} onClick={() => void run(() => addBuiltinRoles(org.id)).catch(() => undefined)}>
          Thêm lại chức vụ có sẵn đã xóa (Quản lý, Nhân viên, Thủ kho và kế toán…)
        </button>
      )}
      {editing && (
        <RoleForm key={editing} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await savePosition(org.id, editRow?.id ?? null, f); setEditing(null); })} />
      )}

      <table className="grid">
        <thead><tr><th>Chức vụ ({positions.length})</th><th className="num">Người</th><th></th></tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={3} className="muted">{online ? 'Chưa có chức vụ nào. Bấm "+ Thêm chức vụ".' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {sorted.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'off'}>
              <td>
                {p.name} <span className={p.base_role === 'manager' ? 'pill warn' : 'pill'}>{ROLE_LABEL[p.base_role] ?? p.base_role}</span>
                {p.description && <span className="sub">{p.description}</span>}
                <span className="sub">{summarize(p)}{p.is_active ? '' : ' · đã dừng'}</span>
              </td>
              <td className="num">{holders(p)}</td>
              <td className="act">
                <button className="icon" disabled={busy || !online} aria-label={p.is_active ? `Dừng ${p.name}` : `Dùng lại ${p.name}`}
                  onClick={() => void run(() => savePosition(org.id, p.id, { name: p.name, description: p.description ?? '', perms: p.perms, workTypeIds: p.work_type_ids, canManageStages: p.can_manage_stages, isActive: !p.is_active, baseRole: p.base_role })).catch(() => undefined)}>{p.is_active ? '⏸' : '▶'}</button>{' '}
                <button className="icon" aria-label={`Sửa ${p.name}`} onClick={() => setEditing(editing === p.id ? null : p.id)}>✎</button>{' '}
                <button className="icon" disabled={busy || !online} aria-label={`Xóa ${p.name}`} onClick={() => {
                  if (window.confirm(`Xóa chức vụ "${p.name}"? Chỉ xóa được khi không ai đang giữ.`)) void run(() => deletePosition(p.id)).catch(() => undefined);
                }}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Chủ cơ sở có toàn quyền, không cần chức vụ. Mỗi chức vụ có một vai trò (Nhân viên hoặc Quản lý) và các quyền cơ bản của vai trò đó; bạn chọn thêm quyền khi cần. Gán chức vụ cho từng người ở mục Nhân sự. Chức vụ chọn "chỉ những việc được chọn" thì người giữ chỉ ghi được các loại việc đó.</p>
    </>
  );
}

function RoleForm({ initial, busy, onSave, onClose }: {
  initial: PositionRow | null; busy: boolean;
  onSave: (f: { name: string; description: string; perms: PermOverrides; workTypeIds: string[] | null; canManageStages: boolean; isActive: boolean; baseRole: MemberRole }) => Promise<unknown>;
  onClose: () => void;
}) {
  const { workTypes } = useCatalog();
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [role, setRole] = useState<MemberRole>(initial?.base_role ?? 'worker'); // chức vụ mới mặc định vai trò Nhân viên
  const [perms, setPerms] = useState<PermOverrides>(initial?.perms ?? {});
  const [limited, setLimited] = useState(initial ? initial.work_type_ids !== null : false);
  const [wts, setWts] = useState<string[]>(initial?.work_type_ids ?? []);
  const [stages, setStages] = useState(initial?.can_manage_stages ?? role === 'manager');
  const [err, setErr] = useState<string | null>(null);
  const toggleWt = (id: string) => setWts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className="card">
      <h2>{initial ? `Sửa: ${initial.name}` : 'Thêm chức vụ'}</h2>
      <div className="inline-form">
        <label>Tên chức vụ<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kỹ thuật viên" /></label>
        <label>Mô tả (người này làm gì)<input value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} /></label>
        <label>Vai trò của chức vụ
          <select value={role} onChange={(e) => { const r = e.target.value as MemberRole; setRole(r); if (!initial) setStages(r === 'manager'); }}>
            <option value="worker">{ROLE_LABEL.worker} (quyền cơ bản của nhân viên)</option>
            <option value="manager">{ROLE_LABEL.manager} (điều hành sản xuất; chọn thêm quyền bên dưới)</option>
          </select>
        </label>
        <fieldset className="roles">
          <legend>Quyền thêm theo mục</legend>
          {PERM_MODULES.map((m: PermModule) => {
            const min = floor(role, m);
            return (
              <label key={m}>{PERM_MODULE_LABEL[m]}
                <select value={level(perms, role, m)} onChange={(e) => setPerms((cur) => ({ ...cur, [m]: e.target.value as PermLevel }))}>
                  <option value="none" disabled={RANK[min] > 0}>{PERM_LEVEL_LABEL.none}</option>
                  <option value="view" disabled={RANK[min] > 1}>{PERM_LEVEL_LABEL.view}</option>
                  {m !== 'summary' && <option value="edit">{PERM_LEVEL_LABEL.edit}</option>}
                </select>
              </label>
            );
          })}
          <small>Mức thấp nhất của từng mục do vai trò quyết định; bạn chỉ chọn thêm.</small>
        </fieldset>
        <label className="check"><input type="checkbox" checked={stages} onChange={(e) => setStages(e.target.checked)} /> Được bắt đầu/hoàn thành và sửa giai đoạn của vụ</label>
        <fieldset className="roles">
          <legend>Loại việc được ghi nhật ký</legend>
          <label className="check"><input type="radio" checked={!limited} onChange={() => setLimited(false)} /> Mọi loại việc</label>
          <label className="check"><input type="radio" checked={limited} onChange={() => setLimited(true)} /> Chỉ những việc được chọn</label>
          {limited && workTypes.filter((w) => w.is_active).map((w) => (
            <label className="check" key={w.id}><input type="checkbox" checked={wts.includes(w.id)} onChange={() => toggleWt(w.id)} /> {w.name}</label>
          ))}
        </fieldset>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Tên chức vụ cần ít nhất 2 ký tự.');
            if (limited && wts.length === 0) return setErr('Hãy chọn ít nhất một loại việc, hoặc chọn "Mọi loại việc".');
            setErr(null);
            const clean: PermOverrides = {};
            for (const m of PERM_MODULES) clean[m] = level(perms, role, m);
            void onSave({ name, description: desc, perms: clean, workTypeIds: limited ? wts : null, canManageStages: stages, isActive: initial?.is_active ?? true, baseRole: role }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
