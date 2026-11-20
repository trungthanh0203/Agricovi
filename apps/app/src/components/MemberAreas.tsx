import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { setMemberAreas } from '../lib/members';
import { useTable } from '../lib/tables';
import { orderedAreas } from '../lib/areas';

/**
 * Chọn phân khu làm việc: "Tất cả" (null) hoặc một số phân khu/ô sản xuất. Dùng ở hồ sơ nhân sự và khi tạo tài khoản nhân viên.
 * Mỗi phân khu là một khung riêng: tick phân khu = gồm TẤT CẢ ô sản xuất bên trong (máy chủ tự hiểu, D136), các ô hiện dưới dạng chữ mờ;
 * không tick phân khu thì mới hiện từng ô để chọn riêng. `nested` = true khi nơi dùng hiểu phân khu cha gồm ô con (nhân sự).
 */
export function AreaChoice({ orgId, value, onChange, nested = true }: { orgId: string; value: string[] | null | undefined; onChange: (v: string[] | null) => void; nested?: boolean }) {
  const areas = orderedAreas(useTable('areas').filter((a) => a.organization_id === orgId));
  const all = value === null;
  const unset = value === undefined;   // thêm mới: chưa chọn gì (bắt buộc chọn Tất cả hoặc từng phân khu)
  const picked = value ?? [];
  const ids = new Set(areas.map((a) => a.id));
  const kids = (id: string) => areas.filter((a) => a.parent_id === id);
  const tops = nested ? areas.filter((a) => !a.parent_id || !ids.has(a.parent_id)) : areas;
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  // tick phân khu cha thì bỏ tick các ô con (đã được gồm sẵn)
  const toggleParent = (id: string) => {
    if (picked.includes(id)) return onChange(picked.filter((x) => x !== id));
    const childIds = new Set(kids(id).map((k) => k.id));
    onChange([...picked.filter((x) => !childIds.has(x)), id]);
  };
  const nCell = picked.filter((id) => areas.find((a) => a.id === id)?.parent_id).length;
  const nTop = picked.length - nCell;
  return (
    <>
      <label className="check"><input type="radio" checked={all} onChange={() => onChange(null)} /> Tất cả phân khu</label>
      <label className="check"><input type="radio" checked={!all && !unset} onChange={() => onChange(picked)} /> Chỉ những phân khu được chọn</label>
      {!all && !unset && (
        <div className="area-pick">
          {tops.map((a) => {
            const ch = nested ? kids(a.id) : [];
            const on = picked.includes(a.id);
            return (
              <div className={'area-box' + (on ? ' on' : '')} key={a.id}>
                <label className="check area-head"><input type="checkbox" checked={on} onChange={() => (ch.length > 0 ? toggleParent(a.id) : toggle(a.id))} />
                  <span><strong>{a.name}</strong>{ch.length > 0 && <small> · {ch.length} ô sản xuất</small>}</span></label>
                {ch.length > 0 && (on
                  ? <p className="area-all muted">✓ Gồm tất cả {ch.length} ô: {ch.map((k) => k.name).join(', ')}</p>
                  : <div className="area-cells">{ch.map((k) => (
                      <label className="check" key={k.id}><input type="checkbox" checked={picked.includes(k.id)} onChange={() => toggle(k.id)} /> {k.name}</label>
                    ))}</div>)}
              </div>
            );
          })}
          {areas.length === 0 && <p className="muted">Chưa có phân khu nào. Khai báo phân khu trước.</p>}
          {areas.length > 0 && <p className="muted area-sum">{picked.length === 0 ? 'Chưa chọn gì.' : `Đã chọn ${nTop} phân khu${nCell ? ` và ${nCell} ô sản xuất riêng` : ''}.`}{nested && areas.some((a) => a.parent_id) ? ' Tick phân khu = gồm mọi ô bên trong; muốn chọn riêng từng ô thì để trống phân khu.' : ''}</p>}
        </div>
      )}
    </>
  );
}

/**
 * Phân khu được giao cho một người (D83): "Tất cả" hoặc chọn một số phân khu (một người làm được nhiều phân khu).
 * Người bị giới hạn chỉ thấy và ghi vụ, nhật ký, thu hoạch của các phân khu đó; máy chủ ép, không chỉ ẩn trên màn hình.
 */
export function MemberAreas({ orgId, userId, initial, onSaved }: { orgId: string; userId: string; initial: string[] | null; onSaved: () => void }) {
  const areas = orderedAreas(useTable('areas').filter((a) => a.organization_id === orgId));
  const [saved, setSaved] = useState<string[] | null>(initial);
  const [all, setAll] = useState(initial === null);
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const save = async () => {
    if (!all && picked.length === 0) return setMsg({ ok: false, text: 'Hãy chọn ít nhất một phân khu, hoặc chọn "Tất cả phân khu".' });
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
      <AreaChoice orgId={orgId} value={all ? null : picked} onChange={(v) => { setAll(v === null); if (v) setPicked(v); }} />
      {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role="status">{msg.text}</p>}
      <div className="btnrow">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Lưu</button>
        <button type="button" className="secondary" onClick={() => { setAll(saved === null); setPicked(saved ?? []); setMsg(null); }}>Hủy</button>
      </div>
    </div>
  );
}
