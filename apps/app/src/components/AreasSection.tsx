import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ImagePicker, Thumb } from './ImagePicker';
import { db, type AreaRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createArea, updateArea, type FarmInput } from '../lib/production';
import { canPerm } from '../lib/permissions';

const fmtSize = (a: AreaRow) => (a.area_size != null ? `${a.area_size.toLocaleString('vi-VN')} ${a.area_unit === 'ha' ? 'ha' : 'm²'}` : '');

/**
 * Trang trại của cơ sở (trồng trọt hoặc chăn nuôi): bảng gọn kèm tên, vị trí, diện tích, đặc điểm, hình ảnh;
 * thêm bằng biểu mẫu, sửa bằng ✎, dừng/dùng lại bằng ⏸/▶. Cần mạng để thêm/sửa (D24).
 */
export function AreasSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const canManage = canPerm(active.perms, 'declare', 'edit');
  const rows = areas
    .filter((a) => a.organization_id === active.id && (showOff || a.is_active !== false))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const editRow = areas.find((a) => a.id === editing) ?? null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(friendlyError(err)); throw err; } finally { setBusy(false); }
  }

  return (
    <>
      {!online && canManage && <p className="msg warn" role="status">Đang offline: thêm và sửa trang trại cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && !adding && !editRow && (
        <button className="secondary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm trang trại</button>
      )}
      {canManage && adding && (
        <FarmForm title="Thêm trang trại" busy={busy || !online} onClose={() => setAdding(false)}
          onSave={(f) => run(async () => { await createArea(active.id, f); setAdding(false); })} />
      )}

      <table className="grid">
        <thead><tr><th>Trang trại ({rows.length})</th><th className="num">Diện tích</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Chưa có trang trại nào.{canManage ? ' Hãy thêm trang trại đầu tiên ở nút trên.' : ''}</td></tr>}
          {rows.map((a) => (
            <tr key={a.id} className={a.is_active === false ? 'off' : ''}>
              <td>
                <Thumb src={a.image} />{a.name}
                {a.location && <span className="sub">📍 {a.location}</span>}
                {a.description && <span className="sub">{a.description}</span>}
                {a.is_active === false && <span className="sub">Đã dừng</span>}
              </td>
              <td className="num">{fmtSize(a) || '—'}</td>
              {canManage && (
                <td className="act">
                  <button className="icon" disabled={busy || !online} aria-label={a.is_active === false ? `Dùng lại ${a.name}` : `Dừng ${a.name}`}
                    onClick={() => void run(() => updateArea(a.id, { is_active: a.is_active === false })).catch(() => undefined)}>{a.is_active === false ? '▶' : '⏸'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${a.name}`} onClick={() => { setAdding(false); setEditing(editing === a.id ? null : a.id); }}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả trang trại đã dừng</label>
      <p className="muted">Trang trại đã dừng vẫn giữ lịch sử nhưng không chọn được để tạo vụ mới.</p>

      {canManage && editRow && (
        <FarmForm key={editRow.id} title={`Sửa trang trại: ${editRow.name}`} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateArea(editRow.id, f); setEditing(null); })} />
      )}
    </>
  );
}

function FarmForm({ title, initial, busy, onSave, onClose }: {
  title: string; initial?: AreaRow; busy: boolean; onSave: (f: FarmInput) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [size, setSize] = useState(initial?.area_size != null ? String(initial.area_size) : '');
  const [unit, setUnit] = useState<'m2' | 'ha'>(initial?.area_unit ?? 'm2');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Tên trang trại<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label>Vị trí<input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="Xã, huyện, tỉnh hoặc mô tả đường đi" /></label>
        <div className="pair">
          <label>Diện tích<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
          <label>Đơn vị
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}>
              <option value="m2">m²</option>
              <option value="ha">ha</option>
            </select>
          </label>
        </div>
        <label>Đặc điểm<textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Loại đất/ao/chuồng, nguồn nước, nhà màng…" /></label>
        <ImagePicker value={image} onChange={setImage} />
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên trang trại.');
            const n = size.trim() === '' ? null : Number(size.replace(',', '.'));
            if (n !== null && (Number.isNaN(n) || n < 0)) return setErr('Diện tích phải là số không âm.');
            setErr(null);
            void onSave({ name, location, area_size: n, area_unit: unit, description: desc, image }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
