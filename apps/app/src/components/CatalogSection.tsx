import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocationRow, type MaterialRow, type UnitRow } from '../lib/db';
import { type MaterialExt } from '../lib/inventory';
import { ImagePicker, Thumb } from './ImagePicker';
import { AreaChoice } from './MemberAreas';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import {
  createLocation, createMaterial, formatQty, parseNumber, updateLocation, updateMaterial,
} from '../lib/inventory';
import { useConfig } from '../lib/config';
import { useTable } from '../lib/tables';

/**
 * Danh mục vật tư và kho: bảng gọn, thêm/sửa ở một biểu mẫu đầy đủ, dừng/dùng lại.
 * Chỉ thay đổi khi có mạng (D22, D24). Đơn vị tính riêng nằm ở tab Cấu hình.
 */
export function CatalogSection({ orgId, canWrite, part }: { orgId: string; canWrite: boolean; part: 'materials' | 'places' }) {
  const online = useOnline();
  const cfg = useConfig();
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useTable('units');
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const allUnits = [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '';

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const [formMat, setFormMat] = useState<string | 'new' | null>(null);
  const [formLoc, setFormLoc] = useState<string | 'new' | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const mats = materials.filter((m) => showOff || m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locs = locations.filter((l) => showOff || l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const writable = canWrite && online;
  const areaText = (l: LocationRow) => (!l.area_ids || l.area_ids.length === 0 ? 'Tất cả' : l.area_ids.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean).join(', '));

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được danh mục. Thêm và sửa cần có mạng.</p>}
      {!canWrite && <p className="muted">Bạn chỉ được xem danh mục. Chủ cơ sở cấp quyền nhập liệu kho cho từng người.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {part === 'materials' && formMat !== null && (
        <MaterialForm key={formMat} m={formMat === 'new' ? null : materials.find((x) => x.id === formMat) ?? null} units={allUnits} busy={busy || !writable}
          onClose={() => setFormMat(null)}
          onSave={(v) => run(async () => {
            if (formMat === 'new') await createMaterial(orgId, { name: v.name, description: v.description, category: v.category ?? '', unitId: v.unitId, threshold: v.threshold, ext: v.ext });
            else await updateMaterial(formMat, { name: v.name, description: v.description, category: v.category, threshold: v.threshold, ext: v.ext });
            setFormMat(null);
          })} />
      )}

      {part === 'materials' && formMat === null && (<>
      <h2 className="sect">Vật tư ({mats.length})</h2>
      {canWrite && <button className="secondary" disabled={!writable} onClick={() => setFormMat('new')}>+ Thêm vật tư</button>}
      <div className="tablewrap">
      <table className="grid">
        <thead><tr><th>Tên vật tư</th><th>Nhóm vật tư</th><th>Nhà sản xuất</th><th className="num">Báo sắp hết ≤</th>{canWrite && <th></th>}</tr></thead>
        <tbody>
          {mats.length === 0 && <tr><td colSpan={5} className="muted">Chưa có vật tư nào.</td></tr>}
          {mats.map((m) => (
            <tr key={m.id} className={m.is_active ? '' : 'off'}>
              <td><Thumb src={m.image} />{m.name}{m.is_active ? '' : <span className="sub">Đã dừng</span>}</td>
              <td className="muted">{cfg.materialGroupLabel(m.material_group, m.group_item)}</td>
              <td className="muted">{m.manufacturer ?? ''}</td>
              <td className="num">{m.reorder_threshold != null ? `${formatQty(m.reorder_threshold)} ${unitName(m.base_unit_id)}` : '—'}</td>
              {canWrite && (
                <td className="act">
                  <button className="icon" disabled={busy || !writable} aria-label={m.is_active ? `Dừng ${m.name}` : `Dùng lại ${m.name}`}
                    onClick={() => void run(() => updateMaterial(m.id, { is_active: !m.is_active }))}>{m.is_active ? '⏸' : '▶'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${m.name}`} onClick={() => setFormMat(m.id)}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả vật tư đã dừng</label>
      <p className="muted">⏸ dừng (không chọn được cho giao dịch mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ sửa. Vật tư đã có lịch sử thì không xóa được, chỉ dừng. Muốn thêm đơn vị tính riêng: tab Cấu hình.</p>
      </>)}

      {part === 'places' && formLoc !== null && (
        <LocationForm key={formLoc} l={formLoc === 'new' ? null : locations.find((x) => x.id === formLoc) ?? null} busy={busy || !writable} onClose={() => setFormLoc(null)}
          onSave={(v) => run(async () => {
            if (formLoc === 'new') await createLocation(orgId, v.name, v.description, v.areaIds);
            else await updateLocation(formLoc, { name: v.name, description: v.description, area_ids: v.areaIds });
            setFormLoc(null);
          })} orgId={orgId} />
      )}

      {part === 'places' && formLoc === null && (<>
      <h2 className="sect">Kho ({locs.length})</h2>
      {canWrite && <button className="secondary" disabled={!writable} onClick={() => setFormLoc('new')}>+ Thêm kho</button>}
      <div className="tablewrap">
      <table className="grid">
        <thead><tr><th>Tên kho</th><th>Mô tả</th><th>Trang trại</th>{canWrite && <th></th>}</tr></thead>
        <tbody>
          {locs.length === 0 && <tr><td colSpan={4} className="muted">Chưa có kho nào{canWrite ? ' — hãy thêm kho đầu tiên.' : '.'}</td></tr>}
          {locs.map((l) => (
            <tr key={l.id} className={l.is_active ? '' : 'off'}>
              <td>{l.name}{!l.is_active && <span className="sub">Đã dừng</span>}</td>
              <td>{l.description ?? ''}</td>
              <td>{areaText(l)}</td>
              {canWrite && (
                <td className="act">
                  <button className="icon" disabled={busy || !writable} aria-label={l.is_active ? `Dừng ${l.name}` : `Dùng lại ${l.name}`}
                    onClick={() => void run(() => updateLocation(l.id, { is_active: !l.is_active }))}>{l.is_active ? '⏸' : '▶'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${l.name}`} onClick={() => setFormLoc(l.id)}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả kho đã dừng</label>
      <p className="muted">⏸ dừng (không chọn được cho giao dịch mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ sửa. Kho đã có lịch sử thì không xóa được, chỉ dừng. Kho gắn với trang trại nào thì khi ghi việc ở trang trại đó sẽ được gợi ý trước.</p>
      </>)}
    </>
  );
}

function LocationForm({ l, orgId, busy, onSave, onClose }: {
  l: LocationRow | null; orgId: string; busy: boolean;
  onSave: (v: { name: string; description: string; areaIds: string[] | null }) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(l?.name ?? '');
  const [desc, setDesc] = useState(l?.description ?? '');
  const [areaSel, setAreaSel] = useState<string[] | null>(l?.area_ids && l.area_ids.length > 0 ? l.area_ids : null); // null = tất cả
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{l ? `Sửa kho: ${l.name}` : 'Thêm kho'}</h2>
      <div className="inline-form">
        <label>Tên kho<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kho chính" /></label>
        <label>Mô tả (không bắt buộc)<textarea rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Vị trí, loại hàng chứa…" /></label>
        <fieldset className="roles">
          <legend>Dùng cho trang trại</legend>
          <AreaChoice orgId={orgId} value={areaSel} onChange={setAreaSel} />
        </fieldset>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Hãy nhập tên kho (ít nhất 2 ký tự).');
            if (areaSel && areaSel.length === 0) return setErr('Hãy chọn ít nhất một trang trại, hoặc chọn "Tất cả trang trại".');
            setErr(null);
            void onSave({ name, description: desc, areaIds: areaSel }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/** Một biểu mẫu đầy đủ cho cả thêm mới và sửa vật tư (đơn vị tính chỉ chọn lúc thêm mới) */
function MaterialForm({ m, units, busy, onSave, onClose }: {
  m: MaterialRow | null; units: UnitRow[]; busy: boolean;
  onSave: (v: { name: string; description: string; category: string | null; threshold: number | null; unitId: string; ext: MaterialExt }) => Promise<unknown>; onClose: () => void;
}) {
  const cfg = useConfig();
  const [name, setName] = useState(m?.name ?? '');
  const [cat, setCat] = useState(m?.category ?? '');
  const [desc, setDesc] = useState(m?.description ?? '');
  const [unitId, setUnitId] = useState(m?.base_unit_id ?? units[0]?.id ?? '');
  const [ext, setExt] = useState({
    image: m?.image ?? '', brand: m?.brand ?? '', material_group: m?.material_group ? cfg.choiceOf('material_groups', m.material_group, m.group_item) : '', active_ingredient: m?.active_ingredient ?? '', // material_group ở đây là mã mục đang chọn
    registration_no: m?.registration_no ?? '', manufacturer: m?.manufacturer ?? '', usage_guide: m?.usage_guide ?? '', usage_method: m?.usage_method ?? '', safety_warning: m?.safety_warning ?? '',
    quality_specs: m?.quality_specs ?? '', limit_elements: m?.limit_elements ?? '', withdrawal_days: m?.withdrawal_days == null ? '' : String(m.withdrawal_days),
  });
  const setE = (k: keyof typeof ext) => (e: { target: { value: string } }) => setExt((x) => ({ ...x, [k]: e.target.value }));
  const [thr, setThr] = useState(m?.reorder_threshold == null ? '' : String(m.reorder_threshold));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{m ? `Sửa vật tư: ${m.name}` : 'Thêm vật tư'}</h2>
      <div className="inline-form">
        <label>Tên vật tư<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label>Nhóm vật tư
          <select value={ext.material_group} onChange={setE('material_group')}>
            <option value="">— Chưa phân nhóm —</option>
            {cfg.materialGroups(ext.material_group).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <label>Đơn vị tính
          {m ? <input value={units.find((u) => u.id === m.base_unit_id)?.name ?? ''} disabled /> : (
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {m ? <small>Đơn vị tính không đổi được sau khi tạo (để tồn kho không bị sai).</small> : <small>Chọn đúng ngay từ đầu, không đổi được sau này. Muốn thêm đơn vị riêng: tab Cấu hình.</small>}
        </label>
        <label>Mô tả<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Nhãn hiệu, công dụng…" /></label>
        <ImagePicker value={ext.image} onChange={(v) => setExt((x) => ({ ...x, image: v }))} store="materials" />
        <label>Xuất xứ / thương hiệu<input value={ext.brand} onChange={setE('brand')} /></label>
        <label>Nhà sản xuất<input value={ext.manufacturer} maxLength={200} onChange={setE('manufacturer')} /></label>
        <label>Số đăng ký lưu hành<input value={ext.registration_no} maxLength={80} onChange={setE('registration_no')} /></label>
        <details className="fold">
          <summary>Thông tin tùy chọn (không bắt buộc)</summary>
          <label>Hoạt chất / thành phần<input value={ext.active_ingredient} maxLength={300} onChange={setE('active_ingredient')} /></label>
          <label>Báo "sắp hết" khi tồn ≤ (để trống nếu không báo)<input value={thr} inputMode="decimal" onChange={(e) => setThr(e.target.value)} /></label>
          <label>Thời gian cách ly (số ngày)<input value={ext.withdrawal_days} inputMode="numeric" onChange={setE('withdrawal_days')} /></label>
          <label>Ghi chú loại (tùy ý)<input value={cat} onChange={(e) => setCat(e.target.value)} /></label>
          <label>Hướng dẫn sử dụng<textarea rows={3} value={ext.usage_guide} onChange={setE('usage_guide')} /></label>
          <label>Phương thức sử dụng<textarea rows={3} value={ext.usage_method} onChange={setE('usage_method')} /></label>
          <label>Cảnh báo an toàn<textarea rows={3} value={ext.safety_warning} onChange={setE('safety_warning')} /></label>
          <label>Chỉ tiêu chất lượng<textarea rows={3} value={ext.quality_specs} onChange={setE('quality_specs')} /></label>
          <label>Hàm lượng yếu tố hạn chế<textarea rows={3} value={ext.limit_elements} onChange={setE('limit_elements')} /></label>
        </details>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            const days = ext.withdrawal_days.trim() === '' ? null : Number(ext.withdrawal_days);
            if (days !== null && (!Number.isInteger(days) || days < 0)) return setErr('Thời gian cách ly phải là số ngày nguyên, không âm.');
            const v = parseNumber(thr);
            if (name.trim().length < 2) return setErr('Hãy nhập tên vật tư.');
            if (!m && !unitId) return setErr('Chưa có đơn vị tính. Hãy kết nối mạng để tải danh sách đơn vị rồi thử lại.');
            if (v !== null && (Number.isNaN(v) || v < 0)) return setErr('Mức cảnh báo phải là số không âm.');
            setErr(null);
            const r = ext.material_group ? cfg.resolve('material_groups', ext.material_group) : { base: '', item: null };
            const groupItem = r.item ?? (m?.group_item ? null : undefined); // chỉ gửi cột mới khi cần (chưa db push thì vẫn lưu được mục có sẵn)
            void onSave({ name, description: desc, category: cat.trim() || null, threshold: v, unitId, ext: { ...ext, material_group: r.base, ...(groupItem !== undefined ? { group_item: groupItem } : {}), withdrawal_days: days } }).catch(() => undefined);
          }}>{m ? 'Lưu thay đổi' : 'Thêm vật tư'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
