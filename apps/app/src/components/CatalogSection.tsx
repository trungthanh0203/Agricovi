import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MaterialRow } from '../lib/db';
import { type MaterialExt } from '../lib/inventory';
import { ImagePicker, Thumb } from './ImagePicker';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import {
  createLocation, createMaterial, createUnit, formatQty, parseNumber, updateLocation, updateMaterial,
} from '../lib/inventory';
import { useTable } from '../lib/tables';

/**
 * Danh mục vật tư, kho, đơn vị riêng: các bảng gọn, thêm nhanh một dòng, đổi tên, dừng/dùng lại.
 * Chỉ thay đổi khi có mạng (D22, D24). Đơn vị có sẵn (kg, lít, bao…) dùng chung, không sửa.
 */
export function CatalogSection({ orgId, canWrite, part }: { orgId: string; canWrite: boolean; part: 'materials' | 'places' }) {
  const online = useOnline();
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useTable('units');
  const orgUnits = units.filter((u) => u.organization_id === orgId);
  const allUnits = [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '';

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const [editMat, setEditMat] = useState<string | null>(null);
  const [editLoc, setEditLoc] = useState<string | null>(null);

  const [mName, setMName] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [lDesc, setLDesc] = useState('');
  const [mUnit, setMUnit] = useState('');
  const [lName, setLName] = useState('');
  const [uName, setUName] = useState('');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const mats = materials.filter((m) => showOff || m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locs = locations.filter((l) => showOff || l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const writable = canWrite && online;

  function onAddMaterial(e: FormEvent) {
    e.preventDefault();
    if (mName.trim().length < 2) return setError('Hãy nhập tên vật tư.');
    const unitId = mUnit || allUnits[0]?.id;
    if (!unitId) return setError('Chưa tải được danh sách đơn vị. Hãy kết nối mạng rồi thử lại.');
    void run(async () => { await createMaterial(orgId, { name: mName, category: '', unitId, threshold: null, description: mDesc }); setMName(''); setMDesc(''); });
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được danh mục. Thêm và sửa cần có mạng.</p>}
      {!canWrite && <p className="muted">Bạn chỉ được xem danh mục. Chủ cơ sở cấp quyền nhập liệu kho cho từng người.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {part === 'materials' && (<>
      <h2 className="sect">Vật tư ({mats.length})</h2>
      {canWrite && (
        <form className="quickadd" onSubmit={onAddMaterial} noValidate>
          <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Thêm vật tư mới: nhập tên" aria-label="Tên vật tư mới" />
          <input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="Mô tả (nhãn hiệu, công dụng…)" aria-label="Mô tả vật tư mới" />
          <select value={mUnit || allUnits[0]?.id || ''} onChange={(e) => setMUnit(e.target.value)} aria-label="Đơn vị tính" style={{ maxWidth: 130 }}>
            {allUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}
      <table className="grid">
        <thead><tr><th>Vật tư</th><th>Danh mục</th><th className="num">Báo sắp hết ≤</th>{canWrite && <th></th>}</tr></thead>
        <tbody>
          {mats.length === 0 && <tr><td colSpan={4} className="muted">Chưa có vật tư nào.</td></tr>}
          {mats.map((m) => (
            <tr key={m.id} className={m.is_active ? '' : 'off'}>
              <td><Thumb src={m.image} />{m.name}{m.description && <span className="sub">{m.description}</span>}<span className="sub">{unitName(m.base_unit_id)}{m.is_active ? '' : ' · đã dừng'}</span></td>
              <td className="muted">{m.category ?? '—'}{m.brand ? <span className="sub">{m.brand}</span> : null}</td>
              <td className="num">{m.reorder_threshold != null ? formatQty(m.reorder_threshold) : '—'}</td>
              {canWrite && (
                <td className="act">
                  <button className="icon" disabled={busy || !writable} aria-label={m.is_active ? `Dừng ${m.name}` : `Dùng lại ${m.name}`}
                    onClick={() => void run(() => updateMaterial(m.id, { is_active: !m.is_active }))}>{m.is_active ? '⏸' : '▶'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${m.name}`} onClick={() => setEditMat(editMat === m.id ? null : m.id)}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editMat && mats.concat(materials).find((m) => m.id === editMat) && (
        <MaterialEditor key={editMat} m={materials.find((x) => x.id === editMat)!} busy={busy || !writable}
          onSave={(c) => void run(async () => { await updateMaterial(editMat, c); setEditMat(null); })} onClose={() => setEditMat(null)} />
      )}

      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả vật tư đã dừng</label>
      <p className="muted">⏸ dừng (không chọn được cho giao dịch mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ sửa. Vật tư đã có lịch sử thì không xóa được, chỉ dừng.</p>
      </>)}

      {part === 'places' && (<>
      <h2 className="sect">Kho ({locs.length})</h2>
      {canWrite && (
        <form className="quickadd" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (lName.trim().length < 2) return setError('Hãy nhập tên kho.');
          void run(async () => { await createLocation(orgId, lName, lDesc); setLName(''); setLDesc(''); });
        }}>
          <input value={lName} onChange={(e) => setLName(e.target.value)} placeholder="Thêm kho mới: nhập tên (ví dụ Kho chính)" aria-label="Tên kho mới" />
          <input value={lDesc} onChange={(e) => setLDesc(e.target.value)} placeholder="Mô tả (vị trí, loại hàng chứa…)" aria-label="Mô tả kho mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}
      <table className="grid">
        <thead><tr><th>Kho</th>{canWrite && <th></th>}</tr></thead>
        <tbody>
          {locs.length === 0 && <tr><td colSpan={2} className="muted">Chưa có kho nào{canWrite ? ' — hãy thêm kho đầu tiên ở ô trên.' : '.'}</td></tr>}
          {locs.map((l) => (
            <tr key={l.id} className={l.is_active ? '' : 'off'}>
              <td>
                {editLoc === l.id ? (
                  <LocationRename name={l.name} description={l.description ?? ''} busy={busy || !writable} onSave={(n, d) => void run(async () => { await updateLocation(l.id, { name: n, description: d }); setEditLoc(null); })} />
                ) : (<>{l.name}{l.description && <span className="sub">{l.description}</span>}{!l.is_active && <span className="sub">Đã dừng</span>}</>)}
              </td>
              {canWrite && (
                <td className="act">
                  {editLoc === l.id ? (
                    <button className="icon" aria-label="Đóng" onClick={() => setEditLoc(null)}>✕</button>
                  ) : (
                    <>
                      <button className="icon" disabled={busy || !writable} aria-label={l.is_active ? `Dừng ${l.name}` : `Dùng lại ${l.name}`}
                        onClick={() => void run(() => updateLocation(l.id, { is_active: !l.is_active }))}>{l.is_active ? '⏸' : '▶'}</button>{' '}
                      <button className="icon" aria-label={`Sửa ${l.name}`} onClick={() => setEditLoc(l.id)}>✎</button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả kho đã dừng</label>

      {canWrite && (
        <>
          <h2 className="sect">Đơn vị riêng ({orgUnits.length})</h2>
          <form className="quickadd" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (uName.trim().length < 1) return setError('Hãy nhập tên đơn vị.');
            void run(async () => { await createUnit(orgId, uName); setUName(''); });
          }}>
            <input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="Thêm đơn vị mới (ví dụ Thùng)" aria-label="Tên đơn vị mới" />
            <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
          </form>
          <p className="muted">Đã có sẵn: kg, g, lít, ml, bao, chai, gói, cái, cây (dùng chung, không sửa).{orgUnits.length > 0 ? ` Đơn vị riêng: ${orgUnits.map((u) => u.name).join(', ')}.` : ''}</p>
        </>
      )}
      <p className="muted">⏸ dừng (không chọn được cho giao dịch mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ sửa. Kho đã có lịch sử thì không xóa được, chỉ dừng.</p>
      </>)}
    </>
  );
}

function LocationRename({ name, description, busy, onSave }: { name: string; description: string; busy: boolean; onSave: (n: string, d: string) => void }) {
  const [v, setV] = useState(name);
  const [d, setD] = useState(description);
  return (
    <div className="quickadd">
      <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Tên kho" />
      <input value={d} onChange={(e) => setD(e.target.value)} placeholder="Mô tả" aria-label="Mô tả kho" />
      <button className="primary" disabled={busy || v.trim().length < 2} onClick={() => onSave(v, d)}>Lưu</button>
    </div>
  );
}

function MaterialEditor({ m, busy, onSave, onClose }: {
  m: MaterialRow; busy: boolean;
  onSave: (c: { name: string; description: string; category: string | null; threshold: number | null; ext: MaterialExt }) => void; onClose: () => void;
}) {
  const [name, setName] = useState(m.name);
  const [cat, setCat] = useState(m.category ?? '');
  const [desc, setDesc] = useState(m.description ?? '');
  const [ext, setExt] = useState({
    image: m.image ?? '', brand: m.brand ?? '', usage_guide: m.usage_guide ?? '', usage_method: m.usage_method ?? '', safety_warning: m.safety_warning ?? '',
    quality_specs: m.quality_specs ?? '', limit_elements: m.limit_elements ?? '', withdrawal_days: m.withdrawal_days == null ? '' : String(m.withdrawal_days),
  });
  const setE = (k: keyof typeof ext) => (e: { target: { value: string } }) => setExt((x) => ({ ...x, [k]: e.target.value }));
  const [thr, setThr] = useState(m.reorder_threshold == null ? '' : String(m.reorder_threshold));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>Sửa vật tư: {m.name}</h2>
      <div className="inline-form">
        <label>Tên<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Mô tả<input value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <ImagePicker value={ext.image} onChange={(v) => setExt((x) => ({ ...x, image: v }))} />
        <label>Thương hiệu / xuất xứ<input value={ext.brand} onChange={setE('brand')} /></label>
        <label>Nhóm (phân bón, thuốc BVTV, giống…)<input value={cat} onChange={(e) => setCat(e.target.value)} /></label>
        <label>Báo "sắp hết" khi tồn ≤ (để trống nếu không báo)<input value={thr} inputMode="decimal" onChange={(e) => setThr(e.target.value)} /></label>
        <details className="fold">
          <summary>Thông tin mở rộng (không bắt buộc)</summary>
          <label>Hướng dẫn sử dụng<textarea rows={3} value={ext.usage_guide} onChange={setE('usage_guide')} /></label>
          <label>Phương thức sử dụng<textarea rows={3} value={ext.usage_method} onChange={setE('usage_method')} /></label>
          <label>Cảnh báo an toàn<textarea rows={3} value={ext.safety_warning} onChange={setE('safety_warning')} /></label>
          <label>Chỉ tiêu chất lượng<textarea rows={3} value={ext.quality_specs} onChange={setE('quality_specs')} /></label>
          <label>Hàm lượng yếu tố hạn chế<textarea rows={3} value={ext.limit_elements} onChange={setE('limit_elements')} /></label>
          <label>Thời gian cách ly (số ngày)<input value={ext.withdrawal_days} inputMode="numeric" onChange={setE('withdrawal_days')} /></label>
        </details>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            const days = ext.withdrawal_days.trim() === '' ? null : Number(ext.withdrawal_days);
            if (days !== null && (!Number.isInteger(days) || days < 0)) return setErr('Thời gian cách ly phải là số ngày nguyên, không âm.');
            const v = parseNumber(thr);
            if (name.trim().length < 2) return setErr('Hãy nhập tên vật tư.');
            if (v !== null && (Number.isNaN(v) || v < 0)) return setErr('Mức cảnh báo phải là số không âm.');
            setErr(null);
            onSave({ name, description: desc, category: cat.trim() || null, threshold: v, ext: { ...ext, withdrawal_days: days } });
          }}>Lưu thay đổi</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
