import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { setMemberAreas } from '../lib/members';
import { useTable } from '../lib/tables';

/** Chọn trang trại làm việc: "Tất cả" (null) hoặc một số trang trại. Dùng ở hồ sơ nhân sự và khi tạo tài khoản nhân viên. */
export function AreaChoice({ orgId, value, onChange }: { orgId: string; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const all = value === null;
  const picked = value ?? [];
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <>
      <label className="check"><input type="radio" checked={all} onChange={() => onChange(null)} /> Tất cả trang trại</label>
      <label className="check"><input type="radio" checked={!all} onChange={() => onChange(picked)} /> Chỉ những trang trại được chọn</label>
      {!all && areas.map((a) => <label className="check" key={a.id}><input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} /> {a.name}</label>)}
      {!all && areas.length === 0 && <p className="muted">Chưa có trang trại nào. Khai báo trang trại trước.</p>}
    </>
  );
}

/**
 * Trang trại được giao cho một người (D83): "Tất cả" hoặc chọn một số trang trại (một người làm được nhiều trang trại).
 * Người bị giới hạn chỉ thấy và ghi vụ, nhật ký, thu hoạch của các trang trại đó; máy chủ ép, không chỉ ẩn trên màn hình.
 */
export function MemberAreas({ orgId, userId, initial, onSaved }: { orgId: string; userId: string; initial: string[] | null; onSaved: () => void }) {
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const [saved, setSaved] = useState<string[] | null>(initial);
  const [all, setAll] = useState(initial === null);
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const save = async () => {
    if (!all && picked.length === 0) return setMsg({ ok: false, text: 'Hãy chọn ít nhất một trang trại, hoặc chọn "Tất cả trang trại".' });
    if (!navigator.onLine) return setMsg({ ok: false, text: 'Cần có mạng để lưu.' });
    setBusy(true); setMsg(null);
    try {
      await setMemberAreas(orgId, userId, all ? null : picked);
      setSaved(all ? null : picked);
      setMsg({ ok: true, text: 'Đã lưu. Người này sẽ thấy theo phạm vi mới khi mở lại app.' });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: friendlyError(e) }); }
    setBusy(false);
  };
  return (
    <div className="inline-form">
      <label className="check"><input type="radio" checked={all} onChange={() => setAll(true)} /> Tất cả trang trại</label>
      <label className="check"><input type="radio" checked={!all} onChange={() => setAll(false)} /> Chỉ những trang trại được chọn</label>
      {!all && areas.map((a) => (
        <label className="check" key={a.id}><input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} /> {a.name}</label>
      ))}
      {!all && areas.length === 0 && <p className="muted">Chưa có trang trại nào. Khai báo trang trại trước.</p>}
      {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role="status">{msg.text}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Lưu</button>
        <button type="button" className="secondary" onClick={() => { setAll(saved === null); setPicked(saved ?? []); setMsg(null); }}>Hủy</button>
      </div>
    </div>
  );
}
