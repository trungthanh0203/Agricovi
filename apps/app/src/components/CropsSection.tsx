import { useEffect, useState, type FormEvent } from 'react';
import { useCatalog, type EffCrop } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { clearOverride, createCrop, refreshCatalogCache, saveOverride, updateCrop } from '../lib/templates';

/**
 * Cây trồng: MỘT bảng gồm cây có sẵn và cây cơ sở tự khai báo (thêm xong vào bảng ngay).
 * Cây có sẵn cũng đổi tên/dừng được cho riêng cơ sở (bản chỉnh, D32). Cần mạng để thêm/sửa.
 */
export function CropsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const { cropTypes } = useCatalog();
  const [name, setName] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [desc, setDesc] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (navigator.onLine) void refreshCatalogCache().catch((e) => setError(friendlyError(e))); }, []);

  if (!active) return null;
  const org = active.id;
  const canManage = canManageProduction(active.roles);
  const rows = cropTypes.filter((c) => showOff || c.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const toggle = (c: EffCrop) => (c.shared ? saveOverride(org, 'crop_type', c.id, { is_active: !c.is_active }) : updateCrop(c.id, { is_active: !c.is_active }));
  const rename = (c: EffCrop) => {
    if (editName.trim().length < 2) throw new Error('Tên cây cần ít nhất 2 ký tự.');
    return c.shared
      ? saveOverride(org, 'crop_type', c.id, { display_name: editName.trim() === c.base_name ? null : editName, description: editDesc })
      : updateCrop(c.id, { name: editName, description: editDesc });
  };

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Hãy nhập tên cây trồng (ít nhất 2 ký tự).');
    void run(async () => { await createCrop(org, name, desc); setName(''); setDesc(''); });
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (
        <form className="quickadd" onSubmit={onAdd} noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thêm cây mới: nhập tên" aria-label="Tên cây mới" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (giống, đặc điểm…)" aria-label="Mô tả cây mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Cây trồng ({rows.length})</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={2} className="muted">{online ? 'Chưa có cây nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((c) => (
            <tr key={c.id} className={c.is_active ? '' : 'off'}>
              <td>
                {editing === c.id ? (
                  <div className="quickadd">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Tên cây" />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Mô tả" aria-label="Mô tả cây" />
                    <button className="primary" disabled={busy || !online} onClick={() => void run(async () => { await rename(c); setEditing(null); })}>Lưu</button>
                  </div>
                ) : (
                  <>
                    {c.name}
                    {c.description && <span className="sub">{c.description}</span>}
                    {!c.shared && <span className="pill mine"> Riêng</span>}
                    {c.shared && c.overridden && <span className="pill warn"> Đã chỉnh</span>}
                    {c.shared && !c.overridden && <span className="sub">Có sẵn</span>}
                    {!c.is_active && <span className="sub">Đã dừng</span>}
                  </>
                )}
              </td>
              {canManage && (
                <td className="act">
                  {editing === c.id ? (
                    <>
                      {c.shared && c.overridden && (
                        <button className="icon" disabled={busy || !online} aria-label="Khôi phục mặc định" title="Khôi phục mặc định"
                          onClick={() => void run(async () => { await clearOverride(org, 'crop_type', c.id); setEditing(null); })}>↺</button>
                      )}{' '}
                      <button className="icon" aria-label="Đóng" onClick={() => setEditing(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="icon" disabled={busy || !online} aria-label={c.is_active ? `Dừng ${c.name}` : `Dùng lại ${c.name}`} onClick={() => void run(() => toggle(c))}>{c.is_active ? '⏸' : '▶'}</button>{' '}
                      <button className="icon" aria-label={`Sửa ${c.name}`} onClick={() => { setEditing(c.id); setEditName(c.name); setEditDesc(c.description ?? ''); }}>✎</button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả cây đã dừng</label>
      <p className="muted">⏸ dừng (không chọn được cho quy trình/vụ mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ đổi tên, ↺ khôi phục tên mặc định. Cây có sẵn chỉnh ở đây chỉ áp dụng cho cơ sở của bạn.</p>
    </>
  );
}
