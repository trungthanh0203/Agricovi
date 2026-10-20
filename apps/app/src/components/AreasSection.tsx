import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createArea, updateArea } from '../lib/production';
import { canManageProduction } from '../lib/roles';

/** Khu trồng của cơ sở: bảng gọn, thêm nhanh một dòng, đổi tên, dừng/dùng lại. Cần mạng để thêm/sửa (D24). */
export function AreasSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const [name, setName] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [desc, setDesc] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const canManage = canManageProduction(active.roles);
  const rows = areas
    .filter((a) => a.organization_id === active.id && (showOff || a.is_active !== false))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 1) return setError('Hãy nhập tên khu trồng.');
    void run(async () => { await createArea(active!.id, name, desc); setName(''); setDesc(''); });
  }

  return (
    <>
      {!online && canManage && <p className="msg warn" role="status">Đang offline: thêm và sửa khu trồng cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (
        <form className="quickadd" onSubmit={onAdd} noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thêm khu trồng mới: nhập tên" aria-label="Tên khu trồng mới" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (diện tích, vị trí…)" aria-label="Mô tả khu trồng mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Khu trồng ({rows.length})</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={2} className="muted">Chưa có khu trồng nào.{canManage ? ' Hãy thêm khu trồng đầu tiên ở ô trên.' : ''}</td></tr>}
          {rows.map((a) => (
            <tr key={a.id} className={a.is_active === false ? 'off' : ''}>
              <td>
                {editing === a.id ? (
                  <div className="quickadd">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Tên khu trồng" />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Mô tả" aria-label="Mô tả khu trồng" />
                    <button className="primary" disabled={busy || !online || editName.trim().length < 1}
                      onClick={() => void run(async () => { await updateArea(a.id, { name: editName, description: editDesc }); setEditing(null); })}>Lưu</button>
                  </div>
                ) : (
                  <>{a.name}{a.description && <span className="sub">{a.description}</span>}{a.is_active === false && <span className="sub">Đã dừng</span>}</>
                )}
              </td>
              {canManage && (
                <td className="act">
                  {editing === a.id ? (
                    <button className="icon" aria-label="Đóng" onClick={() => setEditing(null)}>✕</button>
                  ) : (
                    <>
                      <button className="icon" disabled={busy || !online} aria-label={a.is_active === false ? `Dùng lại ${a.name}` : `Dừng ${a.name}`}
                        onClick={() => void run(() => updateArea(a.id, { is_active: a.is_active === false }))}>{a.is_active === false ? '▶' : '⏸'}</button>{' '}
                      <button className="icon" aria-label={`Sửa ${a.name}`} onClick={() => { setEditing(a.id); setEditName(a.name); setEditDesc(a.description ?? ''); }}>✎</button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả khu trồng đã dừng</label>
      <p className="muted">Khu trồng đã dừng vẫn giữ lịch sử nhưng không chọn được để tạo vụ mới.</p>
    </>
  );
}
