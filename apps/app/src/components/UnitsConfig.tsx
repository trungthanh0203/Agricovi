import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { parseItems } from '../lib/config';
import { createUnit } from '../lib/inventory';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';
import { Collapsible } from './Collapsible';

/**
 * Cấu hình "Đơn vị tính riêng" (trước đây ở Kho và đơn vị): đơn vị có sẵn dùng chung không sửa; cơ sở thêm đơn vị riêng
 * (nhập nhiều đơn vị cách nhau bằng dấu phẩy). Đơn vị đã tạo gắn với vật tư và tồn kho nên chỉ thêm, không xóa/sửa. Cần mạng.
 */
export function UnitsConfig() {
  const { active } = useOrgs();
  const online = useOnline();
  const units = useTable('units');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!active) return null;
  const canWrite = canPerm(active.perms, 'inventory', 'edit');
  const shared = units.filter((u) => !u.organization_id).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const own = units.filter((u) => u.organization_id === active.id).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  async function add() {
    if (!active) return;
    const names = parseItems(text).filter((n) => !units.some((u) => (u.organization_id === active.id || !u.organization_id) && u.name.toLowerCase() === n.toLowerCase()));
    if (names.length === 0) return setMsg({ ok: false, text: 'Hãy nhập tên đơn vị mới (chưa có trong danh sách).' });
    if (names.some((n) => n.length > 30)) return setMsg({ ok: false, text: 'Tên đơn vị tối đa 30 ký tự.' });
    setBusy(true); setMsg(null);
    try {
      for (const n of names) await createUnit(active.id, n);
      setText('');
      setMsg({ ok: true, text: `Đã thêm ${names.length} đơn vị.` });
    } catch (e) { setMsg({ ok: false, text: friendlyError(e) }); }
    setBusy(false);
  }

  return (
    <Collapsible title="Đơn vị tính riêng" summary={own.length > 0 ? own.map((u) => u.name).join(', ') : 'Chưa có'}>
      <div className="inline-form">
        <p className="muted">Đơn vị có sẵn (dùng chung, không sửa): {shared.map((u) => u.name).join(', ') || '—'}.</p>
        <p>Đơn vị riêng của cơ sở: <strong>{own.length > 0 ? own.map((u) => u.name).join(', ') : 'chưa có'}</strong></p>
        {canWrite ? (
          <>
            <label>
              Thêm đơn vị mới
              <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Ví dụ: Thùng, Can, Khay" />
              <small>Nhiều đơn vị thì cách nhau bằng dấu phẩy. Đơn vị đã tạo gắn với vật tư và tồn kho nên không xóa hay đổi tên được.</small>
            </label>
            {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
            {!online && <p className="msg warn" role="status">Cần có mạng để thêm.</p>}
            <div className="btnrow"><button className="primary" disabled={busy || !online || !text.trim()} onClick={() => void add()}>Thêm</button></div>
          </>
        ) : <p className="muted">Bạn chỉ được xem. Người có quyền Kho mới thêm được đơn vị.</p>}
      </div>
    </Collapsible>
  );
}
