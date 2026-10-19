import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocationRow, type MaterialRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import {
  createLocation, createMaterial, createUnit, formatQty, parseNumber, updateLocation, updateMaterial,
} from '../lib/inventory';

/** Danh mục vật tư, kho, đơn vị. Chỉ thay đổi khi có mạng (quyết định D22). */
export function CatalogSection({ orgId, canWrite }: { orgId: string; canWrite: boolean }) {
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useLiveQuery(() => db.units.toArray(), [], []);
  const orgUnits = units.filter((u) => u.organization_id === orgId);
  const allUnits = [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMat, setEditMat] = useState<string | null>(null);
  const [editLoc, setEditLoc] = useState<string | null>(null);

  const [mName, setMName] = useState('');
  const [mCat, setMCat] = useState('');
  const [mUnit, setMUnit] = useState('');
  const [mThr, setMThr] = useState('');
  const [lName, setLName] = useState('');
  const [uName, setUName] = useState('');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function thr(raw: string): number | null | undefined {
    const v = parseNumber(raw);
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      setError('Mức cảnh báo phải là số không âm.');
      return undefined;
    }
    return v;
  }

  function onAddMaterial(e: FormEvent) {
    e.preventDefault();
    if (mName.trim().length < 2) return setError('Hãy nhập tên vật tư.');
    const unitId = mUnit || allUnits[0]?.id;
    if (!unitId) return setError('Chưa tải được danh sách đơn vị. Hãy kết nối mạng rồi thử lại.');
    const t = thr(mThr);
    if (t === undefined) return;
    void run(async () => {
      await createMaterial(orgId, { name: mName, category: mCat, unitId, threshold: t });
      setMName(''); setMCat(''); setMThr('');
    });
  }

  return (
    <div>
      {!navigator.onLine && <p className="msg warn">Đang offline: chỉ xem được danh mục. Cần có mạng để thêm hoặc sửa.</p>}
      {!canWrite && <p className="muted">Chỉ chủ cơ sở và vai trò "Kho & chi phí" thay đổi được danh mục.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <div className="card">
        <h2>Vật tư</h2>
        {materials.length === 0 && <p className="muted">Chưa có vật tư nào.</p>}
        {[...materials].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((m) => (
          <MaterialItem key={m.id} m={m} unitName={units.find((u) => u.id === m.base_unit_id)?.name ?? ''}
            editing={editMat === m.id} canWrite={canWrite && navigator.onLine} busy={busy}
            onEdit={() => setEditMat(editMat === m.id ? null : m.id)}
            onSave={(c) => run(async () => { await updateMaterial(m.id, c); setEditMat(null); })}
            onThrError={setError} />
        ))}
        {canWrite && (
          <form className="inline-form" onSubmit={onAddMaterial} noValidate>
            <h3 className="sub">Thêm vật tư</h3>
            <label>
              Tên vật tư
              <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Ví dụ: Phân NPK 20-20-15" />
            </label>
            <label>
              Nhóm (không bắt buộc)
              <input value={mCat} onChange={(e) => setMCat(e.target.value)} placeholder="Phân bón, thuốc BVTV, giống…" />
            </label>
            <label>
              Đơn vị tính
              <select value={mUnit || allUnits[0]?.id || ''} onChange={(e) => setMUnit(e.target.value)}>
                {allUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label>
              Báo "sắp hết" khi tồn còn từ mức này trở xuống (không bắt buộc)
              <input value={mThr} inputMode="decimal" onChange={(e) => setMThr(e.target.value)} />
            </label>
            <button type="submit" className="secondary" disabled={busy || !navigator.onLine}>Thêm vật tư</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Kho</h2>
        {locations.length === 0 && <p className="muted">Chưa có kho nào. Hãy tạo kho đầu tiên (ví dụ "Kho chính") để nhập vật tư.</p>}
        {[...locations].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((l) => (
          <LocationItem key={l.id} l={l} editing={editLoc === l.id} canWrite={canWrite && navigator.onLine} busy={busy}
            onEdit={() => setEditLoc(editLoc === l.id ? null : l.id)}
            onSave={(c) => run(async () => { await updateLocation(l.id, c); setEditLoc(null); })} />
        ))}
        {canWrite && (
          <form className="inline-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (lName.trim().length < 2) return setError('Hãy nhập tên kho.');
            void run(async () => { await createLocation(orgId, lName); setLName(''); });
          }}>
            <h3 className="sub">Thêm kho</h3>
            <label>
              Tên kho
              <input value={lName} onChange={(e) => setLName(e.target.value)} placeholder="Kho chính" />
            </label>
            <button type="submit" className="secondary" disabled={busy || !navigator.onLine}>Thêm kho</button>
          </form>
        )}
      </div>

      {canWrite && (
        <div className="card">
          <h2>Đơn vị riêng</h2>
          <p className="muted">Đã có sẵn: kg, g, lít, ml, bao, chai, gói, cái, cây. Chỉ thêm nếu bạn cần đơn vị khác.</p>
          {orgUnits.map((u) => <p key={u.id} className="member">{u.name}</p>)}
          <form className="inline-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (uName.trim().length < 1) return setError('Hãy nhập tên đơn vị.');
            void run(async () => { await createUnit(orgId, uName); setUName(''); });
          }}>
            <label>
              Tên đơn vị mới
              <input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="Ví dụ: Thùng" />
            </label>
            <button type="submit" className="secondary" disabled={busy || !navigator.onLine}>Thêm đơn vị</button>
          </form>
        </div>
      )}
    </div>
  );
}

function MaterialItem({ m, unitName, editing, canWrite, busy, onEdit, onSave, onThrError }: {
  m: MaterialRow; unitName: string; editing: boolean; canWrite: boolean; busy: boolean;
  onEdit: () => void;
  onSave: (c: { name?: string; category?: string | null; threshold?: number | null; is_active?: boolean }) => void;
  onThrError: (msg: string) => void;
}) {
  const [name, setName] = useState(m.name);
  const [cat, setCat] = useState(m.category ?? '');
  const [thr, setThr] = useState(m.reorder_threshold == null ? '' : String(m.reorder_threshold));
  return (
    <div className="member">
      <div className="row">
        <span className="grow">
          <strong>{m.name}</strong> <span className="muted">· {unitName}{m.category ? ` · ${m.category}` : ''}</span>
          {m.reorder_threshold != null && <small className="muted"> · báo sắp hết ≤ {formatQty(m.reorder_threshold)}</small>}
        </span>
        {!m.is_active && <span className="pill warn">Ngừng dùng</span>}
        {canWrite && <button className="link inline" onClick={onEdit}>{editing ? 'Đóng' : 'Sửa'}</button>}
      </div>
      {editing && (
        <div className="inline-form">
          <label>Tên<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Nhóm<input value={cat} onChange={(e) => setCat(e.target.value)} /></label>
          <label>Báo "sắp hết" khi tồn ≤<input value={thr} inputMode="decimal" onChange={(e) => setThr(e.target.value)} /></label>
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return onThrError('Hãy nhập tên vật tư.');
            const v = parseNumber(thr);
            if (v !== null && (Number.isNaN(v) || v < 0)) return onThrError('Mức cảnh báo phải là số không âm.');
            onSave({ name, category: cat, threshold: v });
          }}>Lưu thay đổi</button>
          <button className="secondary" disabled={busy} onClick={() => onSave({ is_active: !m.is_active })}>
            {m.is_active ? 'Ngừng dùng vật tư này' : 'Dùng lại vật tư này'}
          </button>
          <small className="muted">Vật tư không xóa được vì còn lịch sử kho; chỉ ngừng dùng.</small>
        </div>
      )}
    </div>
  );
}

function LocationItem({ l, editing, canWrite, busy, onEdit, onSave }: {
  l: LocationRow; editing: boolean; canWrite: boolean; busy: boolean;
  onEdit: () => void; onSave: (c: { name?: string; is_active?: boolean }) => void;
}) {
  const [name, setName] = useState(l.name);
  return (
    <div className="member">
      <div className="row">
        <strong className="grow">{l.name}</strong>
        {!l.is_active && <span className="pill warn">Ngừng dùng</span>}
        {canWrite && <button className="link inline" onClick={onEdit}>{editing ? 'Đóng' : 'Sửa'}</button>}
      </div>
      {editing && (
        <div className="inline-form">
          <label>Tên kho<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="primary" disabled={busy || name.trim().length < 2} onClick={() => onSave({ name })}>Lưu thay đổi</button>
          <button className="secondary" disabled={busy} onClick={() => onSave({ is_active: !l.is_active })}>
            {l.is_active ? 'Ngừng dùng kho này' : 'Dùng lại kho này'}
          </button>
        </div>
      )}
    </div>
  );
}
