import { useEffect, useState } from 'react';
import { ImagePicker, Thumb } from './ImagePicker';
import { useCatalog, type EffCrop } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import {
  clearOverride, createCrop, PRODUCT_KIND_LABEL, refreshCatalogCache, saveOverride, updateCrop, type ProductKind,
} from '../lib/templates';

/**
 * Sản phẩm (cây trồng, vật nuôi hoặc khác): MỘT bảng gồm mục có sẵn và mục cơ sở tự khai báo.
 * Có sẵn cũng đổi tên/mô tả/hình ảnh/dừng được cho riêng cơ sở (bản chỉnh, D32). Cần mạng để thêm/sửa.
 */
export function CropsSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const { cropTypes } = useCatalog();
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (navigator.onLine) void refreshCatalogCache().catch((e) => setError(friendlyError(e))); }, []);

  if (!active) return null;
  const org = active.id;
  const canManage = canPerm(active.perms, 'declare', 'edit');
  const rows = cropTypes.filter((c) => showOff || c.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const editRow = cropTypes.find((c) => c.id === editing) ?? null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }

  const toggle = (c: EffCrop) => (c.shared ? saveOverride(org, 'crop_type', c.id, { is_active: !c.is_active }) : updateCrop(c.id, { is_active: !c.is_active }));

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && !adding && !editRow && (
        <button className="secondary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm sản phẩm</button>
      )}
      {canManage && adding && (
        <ProductForm title="Thêm sản phẩm" busy={busy || !online} onClose={() => setAdding(false)}
          onSave={(f) => run(async () => { await createCrop(org, f); setAdding(false); })} />
      )}

      <table className="grid">
        <thead><tr><th>Sản phẩm ({rows.length})</th><th>Loại</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">{online ? 'Chưa có sản phẩm nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((c) => (
            <tr key={c.id} className={c.is_active ? '' : 'off'}>
              <td>
                <Thumb src={c.image} />{c.name}
                {!c.shared && <span className="pill mine"> Riêng</span>}
                {c.shared && c.overridden && <span className="pill warn"> Đã chỉnh</span>}
                {c.description && <span className="sub">{c.description}</span>}
                {c.shared && !c.overridden && <span className="sub">Có sẵn</span>}
                {!c.is_active && <span className="sub">Đã dừng</span>}
              </td>
              <td className="muted">{PRODUCT_KIND_LABEL[c.kind ?? 'crop']}</td>
              {canManage && (
                <td className="act">
                  <button className="icon" disabled={busy || !online} aria-label={c.is_active ? `Dừng ${c.name}` : `Dùng lại ${c.name}`} onClick={() => void run(() => toggle(c)).catch(() => undefined)}>{c.is_active ? '⏸' : '▶'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${c.name}`} onClick={() => { setAdding(false); setEditing(editing === c.id ? null : c.id); }}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả sản phẩm đã dừng</label>
      <p className="muted">⏸ dừng (không chọn được cho quy trình/vụ mới, lịch sử vẫn giữ), ▶ dùng lại, ✎ sửa. Mục có sẵn chỉnh ở đây chỉ áp dụng cho cơ sở của bạn.</p>

      {canManage && editRow && (
        <ProductForm key={editRow.id} title={`Sửa sản phẩm: ${editRow.name}`} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onReset={editRow.shared && editRow.overridden ? () => run(async () => { await clearOverride(org, 'crop_type', editRow.id); setEditing(null); }) : undefined}
          onSave={(f) => run(async () => {
            if (editRow.shared) {
              await saveOverride(org, 'crop_type', editRow.id, {
                display_name: f.name.trim() === editRow.base_name ? null : f.name, description: f.description, image: f.image,
              });
            } else {
              await updateCrop(editRow.id, { name: f.name, kind: f.kind, description: f.description, image: f.image });
            }
            setEditing(null);
          })} />
      )}
    </>
  );
}

function ProductForm({ title, initial, busy, onSave, onReset, onClose }: {
  title: string; initial?: EffCrop; busy: boolean;
  onSave: (f: { name: string; kind: ProductKind; description: string; image: string }) => Promise<unknown>;
  onReset?: () => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ProductKind>(initial?.kind ?? 'crop');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [err, setErr] = useState<string | null>(null);
  const kindLocked = Boolean(initial?.shared); // mục có sẵn dùng chung luôn là cây trồng
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Tên sản phẩm<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label>Loại
          <select value={kind} disabled={kindLocked} onChange={(e) => setKind(e.target.value as ProductKind)}>
            {(Object.keys(PRODUCT_KIND_LABEL) as ProductKind[]).map((k) => <option key={k} value={k}>{PRODUCT_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Mô tả<textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Giống, đặc điểm, thời gian sinh trưởng…" /></label>
        <ImagePicker value={image} onChange={setImage} />
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Tên sản phẩm cần ít nhất 2 ký tự.');
            setErr(null);
            void onSave({ name, kind, description: desc, image }).catch(() => undefined);
          }}>Lưu</button>
          {onReset && <button className="secondary" disabled={busy} onClick={() => void onReset().catch(() => undefined)}>Khôi phục mặc định</button>}
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
