import { useCallback, useEffect, useState } from 'react';
import type { MemberRole } from '@agriconnect/shared';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { listMembers, type Member } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import { PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES, type PermLevel, type PermModule, type PermOverrides } from '../lib/permissions';
import {
  addBuiltinRoles, deletePosition, listMemberPositions, listPositions, savePosition, setMemberPositions, type PositionRow,
} from '../lib/positions';
import { assignableRoles, ROLE_LABEL, roleSummary } from '../lib/roles';

const summarize = (p: PositionRow) => {
  const parts = PERM_MODULES.filter((m) => p.perms[m] && p.perms[m] !== 'none').map((m) => `${PERM_MODULE_LABEL[m].split(' (')[0]}: ${PERM_LEVEL_LABEL[p.perms[m] as PermLevel].toLowerCase()}`);
  if (p.can_manage_stages) parts.push('quản lý giai đoạn');
  parts.push(p.work_type_ids === null ? 'mọi loại việc' : `${p.work_type_ids.length} loại việc`);
  return parts.join(' · ');
};

/**
 * Vai trò của cơ sở (D44, D49, chỉ chủ): MỘT danh mục gồm vai trò có sẵn (Quản lý, Nhân viên sản xuất, Kho & chi phí…) và vai trò chủ tự tạo.
 * Cả hai đều sửa quyền từng mục, loại việc được làm, quyền quản lý giai đoạn; xóa được (vai trò có sẵn chỉ xóa khi không ai giữ).
 * Quyền của một người = lớn nhất giữa các vai trò họ giữ; chủ cấp riêng (ở Nhân sự) đè lên. Các nơi chọn vai trò đều lấy từ danh mục này.
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
  const holders = (p: PositionRow) => p.is_builtin
    ? people.filter((m) => m.roles.includes(p.base_role)).length
    : people.filter((m) => (held.get(m.user_id) ?? []).includes(p.id)).length;
  const editRow = positions.find((p) => p.id === editing) ?? null;
  const sorted = [...positions].sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name, 'vi'));
  const missing = assignableRoles(org.type).filter((r) => !positions.some((p) => p.is_builtin && p.base_role === r));
  const custom = positions.filter((p) => !p.is_builtin && p.is_active);

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Tạo, sửa và gán vai trò cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {!editing && <button className="secondary" disabled={!online} onClick={() => setEditing('new')}>+ Thêm vai trò</button>}
      {!editing && missing.length > 0 && (
        <button className="link" disabled={busy || !online} onClick={() => void run(() => addBuiltinRoles(org.id)).catch(() => undefined)}>
          Thêm lại vai trò có sẵn đã xóa ({missing.map((r) => ROLE_LABEL[r]).join(', ')})
        </button>
      )}
      {editing && (
        <RoleForm key={editing} initial={editRow} orgType={org.type} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await savePosition(org.id, editRow?.id ?? null, f); setEditing(null); })} />
      )}

      <table className="grid">
        <thead><tr><th>Vai trò ({positions.length})</th><th className="num">Người</th><th></th></tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={3} className="muted">{online ? 'Chưa có vai trò nào. Bấm "+ Thêm vai trò".' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {sorted.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'off'}>
              <td>
                {p.name}{p.is_builtin ? <span className="pill"> Có sẵn</span> : <span className="pill mine"> Riêng</span>}
                {p.description && <span className="sub">{p.description}</span>}
                <span className="sub">{summarize(p)}{p.is_active ? '' : ' · đã dừng'}{!p.is_builtin ? ` · dựa trên ${ROLE_LABEL[p.base_role] ?? p.base_role}` : ''}</span>
              </td>
              <td className="num">{holders(p)}</td>
              <td className="act">
                {!p.is_builtin && (
                  <>
                    <button className="icon" disabled={busy || !online} aria-label={p.is_active ? `Dừng ${p.name}` : `Dùng lại ${p.name}`}
                      onClick={() => void run(() => savePosition(org.id, p.id, { name: p.name, description: p.description ?? '', perms: p.perms, workTypeIds: p.work_type_ids, canManageStages: p.can_manage_stages, isActive: !p.is_active, baseRole: p.base_role })).catch(() => undefined)}>{p.is_active ? '⏸' : '▶'}</button>{' '}
                  </>
                )}
                <button className="icon" aria-label={`Sửa ${p.name}`} onClick={() => setEditing(editing === p.id ? null : p.id)}>✎</button>{' '}
                <button className="icon" disabled={busy || !online} aria-label={`Xóa ${p.name}`} onClick={() => {
                  const msg = p.is_builtin
                    ? `Xóa vai trò có sẵn "${p.name}"? Chỉ xóa được khi không ai đang giữ; có thể thêm lại sau.`
                    : `Xóa vai trò "${p.name}"? Những người đang giữ sẽ mất các quyền do vai trò này cấp.`;
                  if (window.confirm(msg)) void run(() => deletePosition(p.id)).catch(() => undefined);
                }}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {custom.length > 0 && people.length > 0 && (
        <>
          <h2 className="sect">Gán vai trò riêng cho người</h2>
          {people.map((m) => {
            const mine = held.get(m.user_id) ?? [];
            return (
              <div className="member" key={m.user_id}>
                <strong>{m.is_staff ? m.full_name : m.email}</strong> <span className="muted">· {roleSummary(m.roles)}</span>
                <div className="chips">
                  {custom.map((p) => {
                    const on = mine.includes(p.id);
                    return (
                      <button key={p.id} className={on ? 'chip active' : 'chip'} aria-pressed={on} disabled={busy || !online}
                        onClick={() => void run(() => setMemberPositions(org.id, m.user_id, on ? mine.filter((x) => x !== p.id) : [...mine, p.id])).catch(() => undefined)}>
                        {on ? '✔ ' : ''}{p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
      <p className="muted">Vai trò có sẵn gán ở mục Nhân sự (Đổi vai trò). Quyền của một người là mức cao nhất giữa các vai trò họ giữ; phần chủ cấp riêng ở Nhân sự đè lên. Vai trò chọn "chỉ những việc được chọn" thì người giữ chỉ ghi được các loại việc đó (quản lý và chủ luôn ghi mọi loại). Vai trò riêng "dựa trên" một vai trò có sẵn để giữ các thao tác gốc của vai trò đó.</p>
    </>
  );
}

function RoleForm({ initial, orgType, busy, onSave, onClose }: {
  initial: PositionRow | null; orgType: 'household' | 'cooperative'; busy: boolean;
  onSave: (f: { name: string; description: string; perms: PermOverrides; workTypeIds: string[] | null; canManageStages: boolean; isActive: boolean; baseRole: MemberRole }) => Promise<unknown>;
  onClose: () => void;
}) {
  const { workTypes } = useCatalog();
  const builtin = Boolean(initial?.is_builtin);
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [base, setBase] = useState<MemberRole>(initial?.base_role ?? 'worker');
  const [perms, setPerms] = useState<PermOverrides>(initial?.perms ?? {});
  const [limited, setLimited] = useState(initial ? initial.work_type_ids !== null : false);
  const [wts, setWts] = useState<string[]>(initial?.work_type_ids ?? []);
  const [stages, setStages] = useState(initial?.can_manage_stages ?? false);
  const [err, setErr] = useState<string | null>(null);
  const toggleWt = (id: string) => setWts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className="card">
      <h2>{initial ? `Sửa vai trò: ${initial.name}` : 'Thêm vai trò'}</h2>
      <div className="inline-form">
        <label>Tên vai trò<input value={name} maxLength={60} disabled={builtin} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kỹ thuật viên" />{builtin && <small>Tên vai trò có sẵn giữ nguyên.</small>}</label>
        <label>Mô tả (người này làm được gì)<input value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} /></label>
        {!builtin && (
          <label>Dựa trên vai trò
            <select value={base} onChange={(e) => setBase(e.target.value as MemberRole)}>
              {assignableRoles(orgType).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <small>Người giữ vai trò này tự có thêm vai trò nền để dùng các thao tác gốc (ví dụ ghi nhật ký).</small>
          </label>
        )}
        <fieldset className="roles">
          <legend>Quyền theo mục</legend>
          {PERM_MODULES.map((m: PermModule) => (
            <label key={m}>{PERM_MODULE_LABEL[m]}
              <select value={perms[m] ?? 'none'} onChange={(e) => setPerms((cur) => ({ ...cur, [m]: e.target.value as PermLevel }))}>
                <option value="none">{PERM_LEVEL_LABEL.none}</option>
                <option value="view">{PERM_LEVEL_LABEL.view}</option>
                {m !== 'summary' && <option value="edit">{PERM_LEVEL_LABEL.edit}</option>}
              </select>
            </label>
          ))}
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
            if (name.trim().length < 2) return setErr('Tên vai trò cần ít nhất 2 ký tự.');
            if (limited && wts.length === 0) return setErr('Hãy chọn ít nhất một loại việc, hoặc chọn "Mọi loại việc".');
            setErr(null);
            const clean: PermOverrides = {};
            for (const m of PERM_MODULES) if (perms[m]) clean[m] = perms[m];
            void onSave({ name, description: desc, perms: clean, workTypeIds: limited ? wts : null, canManageStages: stages, isActive: initial?.is_active ?? true, baseRole: base }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
