import { useEffect, useState, type FormEvent } from 'react';
import type { FieldDef } from '../lib/db';
import { Collapsible } from './Collapsible';
import { FIELD_PACKS, planPackApply, type FieldPack } from '../lib/fieldPacks';
import { checkSchemaDraft, FIELD_TYPES, FIELD_TYPE_LABEL } from '../lib/fieldsLogic';
import { useCatalog, type EffWorkType } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { clearOverride, createWorkType, newFieldKey, refreshCatalogCache, saveOverride, updateWorkType } from '../lib/templates';

/** Nhập các trường dữ liệu của một loại việc (form động, D96). Khóa trường giữ nguyên khi sửa nhãn để nhật ký cũ vẫn hiện đúng. */
function FieldsEditor({ fields, onChange }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void }) {
  const set = (i: number, patch: Partial<FieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const numOrUndef = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() === '' || Number.isNaN(n) ? undefined : n; };
  return (
    <fieldset className="roles">
      <legend>Thông tin cần ghi khi làm việc này</legend>
      {fields.map((f, i) => (
        <div className="quickadd" key={f.key}>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Tên trường, ví dụ: Độ Brix" aria-label="Tên trường" />
          <select value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldDef['type'] })} aria-label="Kiểu">
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select>
          {(f.type === 'select' || f.type === 'multiselect') && (
            <input value={(f.options ?? []).join(', ')} aria-label="Các lựa chọn" placeholder="Lựa chọn, cách nhau bằng dấu phẩy"
              onChange={(e) => set(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          )}
          <label className="check"><input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked || undefined })} /><span>Bắt buộc ghi</span></label>
          {(f.type === 'number' || f.type === 'text') && (
            <input value={f.unit ?? ''} maxLength={20} onChange={(e) => set(i, { unit: e.target.value || undefined })} placeholder="Đơn vị (ml, lít, kg…)" aria-label="Đơn vị" />
          )}
          {f.type === 'number' && (
            <div className="pair">
              <input value={f.min ?? ''} inputMode="decimal" onChange={(e) => set(i, { min: numOrUndef(e.target.value) })} placeholder="Nhỏ nhất" aria-label="Giá trị nhỏ nhất" />
              <input value={f.max ?? ''} inputMode="decimal" onChange={(e) => set(i, { max: numOrUndef(e.target.value) })} placeholder="Lớn nhất" aria-label="Giá trị lớn nhất" />
            </div>
          )}
          <button type="button" className="icon" aria-label="Xóa trường" onClick={() => onChange(fields.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...fields, { key: newFieldKey(), label: '', type: 'text' }])}>+ Thêm trường</button>
    </fieldset>
  );
}

const cleanFields = (fields: FieldDef[]) => fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() }));

/**
 * Danh mục công việc: MỘT bảng gồm việc có sẵn và việc cơ sở tự định nghĩa (việc mới vào bảng ngay).
 * Việc có sẵn cũng sửa/dừng được cho riêng cơ sở (bản chỉnh, D32): đổi tên, thêm trường ghi, dừng, khôi phục mặc định.
 * Cần mạng để thêm/sửa.
 */
export function WorkTypesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const { workTypes } = useCatalog();
  const [name, setName] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [desc, setDesc] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editFields, setEditFields] = useState<FieldDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (navigator.onLine) void refreshCatalogCache().catch((e) => setError(friendlyError(e))); }, []);

  if (!active) return null;
  const org = active.id;
  const canManage = canPerm(active.perms, 'declare', 'edit');
  const rows = workTypes.filter((t) => showOff || t.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const editingRow = workTypes.find((t) => t.id === editing) ?? null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const setActiveFlag = (t: EffWorkType) =>
    t.shared ? saveOverride(org, 'work_type', t.id, { is_active: !t.is_active }) : updateWorkType(t.id, { is_active: !t.is_active });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Hãy nhập tên việc (ít nhất 2 ký tự).');
    void run(async () => { await createWorkType(org, name, [], desc); setName(''); setDesc(''); });
  }

  /** Áp dụng bộ mẫu: đặt trường cho từng loại việc theo gói (việc có sẵn thì thành "bản chỉnh" của cơ sở, việc riêng thì sửa trực tiếp) */
  async function applyPack(pack: FieldPack) {
    const { steps, missing } = planPackApply(pack, workTypes);
    if (steps.length === 0) throw new Error('Chưa tải được danh sách việc để áp dụng bộ mẫu. Hãy kết nối mạng rồi thử lại.');
    const lost = steps.reduce((n, s) => n + s.replaces, 0);
    const text = `Áp dụng bộ mẫu "${pack.name}" cho ${steps.length} việc: ${steps.map((s) => s.name).join(', ')}.` +
      (lost > 0 ? ` Có ${lost} trường tự thêm trước đây sẽ bị thay (nhật ký cũ vẫn giữ nguyên số liệu).` : '') + (missing.length ? ` Không tìm thấy việc: ${missing.join(', ')}.` : '') + ' Tiếp tục?';
    if (!window.confirm(text)) return;
    for (const s of steps) {
      if (s.shared) await saveOverride(org, 'work_type', s.id, { field_schema: s.fields });
      else await updateWorkType(s.id, { field_schema: s.fields });
    }
  }

  async function save(t: EffWorkType) {
    const f = cleanFields(editFields);
    const bad = checkSchemaDraft(f);
    if (bad) throw new Error(bad);
    if (editName.trim().length < 2) throw new Error('Tên việc cần ít nhất 2 ký tự.');
    if (t.shared) {
      await saveOverride(org, 'work_type', t.id, {
        display_name: editName.trim() === t.base_name ? null : editName,
        description: editDesc,
        field_schema: JSON.stringify(f) === JSON.stringify(t.field_schema) && !t.overridden ? null : f,
      });
    } else {
      await updateWorkType(t.id, { name: editName, description: editDesc, field_schema: f });
    }
    setEditing(null);
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (
        <form className="quickadd" onSubmit={onAdd} noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thêm việc mới: nhập tên" aria-label="Tên việc mới" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (làm thế nào, lưu ý…)" aria-label="Mô tả việc mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}

      {canManage && (
        <Collapsible inline title="Bộ mẫu theo loại hình" summary="đặt sẵn các thông tin cần ghi">
          <p className="muted">Chọn một bộ mẫu để tự điền các thông tin cần ghi cho từng việc, sau đó sửa lại cho đúng với cơ sở của bạn. Đây là bản dự kiến.</p>
          {FIELD_PACKS.map((p) => (
            <div className="note-row" key={p.id}>
              <span className="grow"><strong>{p.name}</strong><small className="muted"> — {p.description}</small></span>
              <button className="secondary" disabled={busy || !online} onClick={() => void run(() => applyPack(p))}>Áp dụng</button>
            </div>
          ))}
        </Collapsible>
      )}

      <table className="grid">
        <thead><tr><th>Việc ({rows.length})</th><th>Thông tin cần ghi</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">{online ? 'Chưa có việc nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((t) => (
            <tr key={t.id} className={t.is_active ? '' : 'off'}>
              <td>
                {t.name}
                {t.description && <span className="sub">{t.description}</span>}
                {!t.shared && <span className="pill mine"> Riêng</span>}
                {t.shared && t.overridden && <span className="pill warn"> Đã chỉnh</span>}
                {t.shared && !t.overridden && <span className="sub">Có sẵn</span>}
                {!t.is_active && <span className="sub">Đã dừng</span>}
              </td>
              <td className="muted">{t.field_schema.length > 0 ? t.field_schema.map((f) => f.label).join(', ') : '—'}</td>
              {canManage && (
                <td className="act">
                  <button className="icon" disabled={busy || !online} aria-label={t.is_active ? `Dừng ${t.name}` : `Dùng lại ${t.name}`} onClick={() => void run(() => setActiveFlag(t))}>{t.is_active ? '⏸' : '▶'}</button>{' '}
                  <button className="icon" aria-label={`Sửa ${t.name}`} onClick={() => { setEditing(editing === t.id ? null : t.id); setEditName(t.name); setEditDesc(t.description ?? ''); setEditFields(t.field_schema); }}>✎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả việc đã dừng</label>
      <p className="muted">Bấm ⏸ để dừng (không chọn được cho việc mới, lịch sử vẫn giữ) và ▶ để dùng lại; ✎ để đổi tên hoặc thêm thông tin cần ghi. Việc có sẵn chỉnh ở đây chỉ áp dụng cho cơ sở của bạn.</p>

      {editingRow && (
        <div className="card">
          <h2>Sửa việc: {editingRow.name}</h2>
          <div className="inline-form">
            <label>Tên việc<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
            <label>Mô tả<input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></label>
            <FieldsEditor fields={editFields} onChange={setEditFields} />
            <div className="btnrow">
              <button className="primary" disabled={busy || !online} onClick={() => void run(() => save(editingRow))}>Lưu thay đổi</button>
              {editingRow.shared && editingRow.overridden && (
                <button className="secondary" disabled={busy || !online} onClick={() => void run(async () => { await clearOverride(org, 'work_type', editingRow.id); setEditing(null); })}>Khôi phục mặc định</button>
              )}
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
