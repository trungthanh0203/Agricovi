import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { createCrop, listCrops, updateCrop, type CropRow } from '../lib/templates';

/** Cây trồng: một bảng gồm cây có sẵn và cây do cơ sở tự khai báo (thêm xong vào bảng ngay). Cần mạng để thêm/sửa. */
export function CropsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [name, setName] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try { setCrops(await listCrops(active.id)); } catch (e) { setError(friendlyError(e)); }
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const canManage = canManageProduction(active.roles);
  const rows = crops.filter((c) => showOff || c.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Hãy nhập tên cây trồng (ít nhất 2 ký tự).');
    void run(async () => { await createCrop(active!.id, name); setName(''); });
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (
        <form className="quickadd" onSubmit={onAdd} noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thêm cây mới: nhập tên" aria-label="Tên cây mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Cây trồng ({rows.length})</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={2} className="muted">{online ? 'Chưa có cây nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((c) => {
            const own = c.organization_id === active.id;
            return (
              <tr key={c.id} className={c.is_active ? '' : 'off'}>
                <td>
                  {editing === c.id ? (
                    <div className="quickadd">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Tên cây" />
                      <button className="primary" disabled={busy || !online || editName.trim().length < 2}
                        onClick={() => void run(async () => { await updateCrop(c.id, { name: editName }); setEditing(null); })}>Lưu</button>
                    </div>
                  ) : (
                    <>
                      {c.name}
                      {c.organization_id !== null && <span className="pill mine"> Riêng</span>}
                      {!c.is_active && <span className="sub">Ngừng dùng</span>}
                    </>
                  )}
                </td>
                {canManage && (
                  <td className="act">
                    {own && editing !== c.id && <button className="icon" aria-label={`Sửa ${c.name}`} onClick={() => { setEditing(c.id); setEditName(c.name); }}>✎</button>}
                    {own && editing === c.id && (
                      <>
                        <button className="icon" disabled={busy || !online} aria-label={c.is_active ? 'Ngừng dùng' : 'Dùng lại'}
                          onClick={() => void run(async () => { await updateCrop(c.id, { is_active: !c.is_active }); setEditing(null); })}>{c.is_active ? '⏸' : '▶'}</button>
                        <button className="icon" aria-label="Đóng" onClick={() => setEditing(null)}>✕</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả cây đã ngừng dùng</label>
      <p className="muted">Cây "Riêng" do cơ sở bạn khai báo (nút ⏸ là ngừng dùng). Cây đã có quy trình mẫu hoặc vụ thì không xóa được.</p>
    </>
  );
}
