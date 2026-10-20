import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createArea } from '../lib/production';
import { canManageProduction } from '../lib/roles';

/** Khu trồng của cơ sở (tab Khai báo). Thêm khu trồng cần mạng (D24). */
export function AreasSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const mine = areas.filter((a) => a.organization_id === active.id).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const canManage = canManageProduction(active.roles);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 1) return setError('Hãy nhập tên khu trồng.');
    setError(null);
    setBusy(true);
    try {
      await createArea(active!.id, name);
      setName('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted">Khu trồng là nơi diễn ra các vụ: nhà màng, ruộng, vườn… Mỗi vụ được tạo trên một khu trồng.</p>
      {!online && canManage && <p className="msg warn" role="status">Đang offline: thêm khu trồng cần có mạng.</p>}
      {mine.length === 0 && <p className="muted">Chưa có khu trồng nào.{canManage ? ' Hãy thêm khu trồng đầu tiên bên dưới.' : ''}</p>}
      {mine.map((a) => (
        <div className="card slim" key={a.id}><span>{a.name}</span></div>
      ))}
      {canManage && (
        <form onSubmit={onAdd} className="inline-form" noValidate>
          <label>
            Tên khu trồng mới
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nhà màng số 1" />
          </label>
          {error && <p className="msg error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={!online || busy}>Thêm khu trồng</button>
        </form>
      )}
    </>
  );
}
