import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { listMembers, type Member } from '../lib/members';
import type { MyOrg } from '../lib/orgs';
import { PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES, type PermLevel, type PermModule, type PermOverrides } from '../lib/permissions';
import {
  deletePosition, listMemberPositions, listPositions, savePosition, setMemberPositions, type PositionRow,
} from '../lib/positions';
import { assignableRoles, ROLE_LABEL, roleSummary } from '../lib/roles';
import { defaultPerm } from '../lib/permissions';
import type { MemberRole } from '@agriconnect/shared';

/** Mô tả ngắn các vai trò có sẵn của hệ thống (dùng như chức vụ có sẵn) */
const ROLE_DESC: Record<string, string> = {
  manager: 'Quản lý sản xuất: tạo vụ, quản lý giai đoạn, nhân sự, chấm công; xem kho, chi phí, doanh thu.',
  worker: 'Nhân viên sản xuất: ghi nhật ký, thu hoạch, xuất dùng vật tư và chấm công của mình.',
  inventory_finance: 'Kho & chi phí: nhập kho, điều chỉnh tồn, ghi chi phí và doanh thu.',
  cooperative_manager: 'Quản lý HTX: quản lý hộ thành viên và vụ ghi theo HTX.',
  profile_editor: 'Biên tập hồ sơ: soạn nội dung hồ sơ giới thiệu (chưa có màn hình riêng).',
};
const roleSummarize = (r: MemberRole) => {
  const parts = PERM_MODULES.filter((m) => defaultPerm([r], m) !== 'none').map((m) => `${PERM_MODULE_LABEL[m].split(' (')[0]}: ${PERM_LEVEL_LABEL[defaultPerm([r], m)].toLowerCase()}`);
  return parts.length ? parts.join(' · ') : 'Không có quyền theo mục';
};

const summarize = (p: PositionRow) => {
  const parts = PERM_MODULES.filter((m) => p.perms[m] && p.perms[m] !== 'none').map((m) => `${PERM_MODULE_LABEL[m].split(' (')[0]}: ${PERM_LEVEL_LABEL[p.perms[m] as PermLevel].toLowerCase()}`);
  if (p.can_manage_stages) parts.push('quản lý giai đoạn');
  parts.push(p.work_type_ids === null ? 'mọi loại việc' : `${p.work_type_ids.length} loại việc`);
  return parts.join(' · ');
};

/**
 * Chức vụ (D44, chỉ chủ): tự đặt tên và chọn quyền từng mục, loại việc được làm, quyền quản lý giai đoạn; gán cho từng người.
 * Quyền của một người = lớn nhất của vai trò và các chức vụ giữ; chủ cấp riêng (ở Nhân sự) đè lên. Người chưa có chức vụ: như cũ.
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
  const holders = (id: string) => people.filter((m) => (held.get(m.user_id) ?? []).includes(id)).length;
  const editRow = positions.find((p) => p.id === editing) ?? null;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Tạo và gán chức vụ cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {!editing && <button className="secondary" disabled={!online} onClick={() => setEditing('new')}>+ Thêm chức vụ</button>}
      {editing && (
        <PositionForm key={editing} org={org} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await savePosition(org.id, editRow?.id ?? null, f); setEditing(null); })} />
      )}

      <table className="grid">
        <thead><tr><th>Chức vụ ({assignableRoles(org.type).length + positions.length})</th><th className="num">Người</th><th></th></tr></thead>
        <tbody>
          {assignableRoles(org.type).map((r) => (
            <tr key={r}>
              <td>{ROLE_LABEL[r]}<span className="pill"> Có sẵn</span><span className="sub">{ROLE_DESC[r]}</span><span className="sub">{roleSummarize(r)}</span></td>
              <td className="num">{people.filter((m) => m.roles.includes(r)).length}</td>
              <td className="act muted">gán ở Nhân sự</td>
            </tr>
          ))}
          {positions.length === 0 && <tr><td colSpan={3} className="muted">Chức vụ tự tạo: ví dụ "Kỹ thuật viên" được sửa Khai báo, "Tổ trưởng thu hoạch" chỉ ghi việc thu hoạch. Bấm "+ Thêm chức vụ".</td></tr>}
          {positions.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'off'}>
              <td>{p.name}{p.description && <span className="sub">{p.description}</span>}<span className="sub">{summarize(p)}{p.is_active ? '' : ' · đã dừng'}</span></td>
              <td className="num">{holders(p.id)}</td>
              <td className="act">
                <button className="icon" disabled={busy || !online} aria-label={p.is_active ? `Dừng ${p.name}` : `Dùng lại ${p.name}`}
                  onClick={() => void run(() => savePosition(org.id, p.id, { name: p.name, description: p.description ?? '', perms: p.perms, workTypeIds: p.work_type_ids, canManageStages: p.can_manage_stages, isActive: !p.is_active })).catch(() => undefined)}>{p.is_active ? '⏸' : '▶'}</button>{' '}
                <button className="icon" aria-label={`Sửa ${p.name}`} onClick={() => setEditing(editing === p.id ? null : p.id)}>✎</button>{' '}
                <button className="icon" disabled={busy || !online} aria-label={`Xóa ${p.name}`} onClick={() => {
                  if (window.confirm(`Xóa chức vụ "${p.name}"? Những người đang giữ chức vụ này sẽ mất các quyền do chức vụ cấp.`)) void run(() => deletePosition(p.id)).catch(() => undefined);
                }}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {positions.some((p) => p.is_active) && people.length > 0 && (
        <>
          <h2 className="sect">Gán chức vụ cho người</h2>
          {people.map((m) => {
            const mine = held.get(m.user_id) ?? [];
            return (
              <div className="member" key={m.user_id}>
                <strong>{m.is_staff ? m.full_name : m.email}</strong> <span className="muted">· {roleSummary(m.roles)}</span>
                <div className="chips">
                  {positions.filter((p) => p.is_active || mine.includes(p.id)).map((p) => {
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
      <p className="muted">Quyền hiệu lực của một người là mức cao nhất giữa vai trò và các chức vụ họ giữ. Phần chủ cấp riêng ở Nhân sự sẽ đè lên. Chức vụ chọn "chỉ những việc đã chọn" thì người giữ chỉ ghi được các loại việc đó (quản lý và chủ luôn ghi mọi loại).</p>
    </>
  );
}

function PositionForm({ org, initial, busy, onSave, onClose }: {
  org: MyOrg; initial: PositionRow | null; busy: boolean;
  onSave: (f: { name: string; description: string; perms: PermOverrides; workTypeIds: string[] | null; canManageStages: boolean; isActive: boolean }) => Promise<unknown>;
  onClose: () => void;
}) {
  const { workTypes } = useCatalog();
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [perms, setPerms] = useState<PermOverrides>(initial?.perms ?? {});
  const [limited, setLimited] = useState(initial ? initial.work_type_ids !== null : false);
  const [wts, setWts] = useState<string[]>(initial?.work_type_ids ?? []);
  const [stages, setStages] = useState(initial?.can_manage_stages ?? false);
  const [err, setErr] = useState<string | null>(null);
  const toggleWt = (id: string) => setWts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  void org;
  return (
    <div className="card">
      <h2>{initial ? `Sửa chức vụ: ${initial.name}` : 'Thêm chức vụ'}</h2>
      <div className="inline-form">
        <label>Tên chức vụ<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kỹ thuật viên" /></label>
        <label>Mô tả (người này làm được gì)<input value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} /></label>
        <fieldset className="roles">
          <legend>Quyền theo mục (cộng thêm vào vai trò của người giữ)</legend>
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
            if (name.trim().length < 2) return setErr('Tên chức vụ cần ít nhất 2 ký tự.');
            if (limited && wts.length === 0) return setErr('Hãy chọn ít nhất một loại việc, hoặc chọn "Mọi loại việc".');
            setErr(null);
            const clean: PermOverrides = {};
            for (const m of PERM_MODULES) if (perms[m] && perms[m] !== 'none') clean[m] = perms[m];
            void onSave({ name, description: desc, perms: clean, workTypeIds: limited ? wts : null, canManageStages: stages, isActive: initial?.is_active ?? true }).catch(() => undefined);
          }}>Lưu chức vụ</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
