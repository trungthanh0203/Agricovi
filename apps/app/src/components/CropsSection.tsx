import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { createCrop, listCrops, updateCrop, type CropRow } from '../lib/templates';

/** Cây trồng: cây có sẵn của nền tảng (chỉ xem) và cây do cơ sở tự khai báo. Cần mạng để thêm/sửa. */
export function CropsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [name, setName] = useState('');
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
  const shared = crops.filter((c) => c.organization_id === null);
  const own = crops.filter((c) => c.organization_id !== null);

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
      <p className="muted">Mỗi quy trình mùa vụ mẫu thuộc về một cây trồng. Chọn cây có sẵn hoặc tự thêm cây của cơ sở bạn.</p>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <h2 className="sect">Cây có sẵn</h2>
      {shared.length === 0 && <p className="muted">{online ? 'Chưa có.' : 'Cần mạng để tải danh sách.'}</p>}
      {shared.map((c) => <div className="card slim" key={c.id}><span>{c.name}</span> <span className="pill">Có sẵn</span></div>)}

      <h2 className="sect">Cây của cơ sở ({own.length})</h2>
      {own.length === 0 && <p className="muted">Chưa có cây nào do cơ sở khai báo.</p>}
      {own.map((c) => (
        <div className="card slim" key={c.id}>
          <div className="row">
            <strong className="grow">{c.name}</strong>
            {!c.is_active && <span className="pill warn">Ngừng dùng</span>}
            {canManage && c.organization_id === active.id && (
              <button className="link inline" onClick={() => { setEditing(editing === c.id ? null : c.id); setEditName(c.name); }}>{editing === c.id ? 'Đóng' : 'Sửa'}</button>
            )}
          </div>
          {editing === c.id && (
            <div className="inline-form">
              <label>Tên cây<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
              <button className="primary" disabled={busy || !online || editName.trim().length < 2}
                onClick={() => void run(async () => { await updateCrop(c.id, { name: editName }); setEditing(null); })}>Lưu tên</button>
              <button className="secondary" disabled={busy || !online}
                onClick={() => void run(async () => { await updateCrop(c.id, { is_active: !c.is_active }); setEditing(null); })}>
                {c.is_active ? 'Ngừng dùng cây này' : 'Dùng lại cây này'}
              </button>
              <small className="muted">Cây đã có quy trình mẫu hoặc vụ thì không xóa được, chỉ ngừng dùng.</small>
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <form className="inline-form" onSubmit={onAdd} noValidate>
          <label>
            Thêm cây trồng mới
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Ớt chuông" />
          </label>
          <button type="submit" className="primary" disabled={busy || !online}>Thêm cây</button>
        </form>
      )}
    </>
  );
}
