import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { FieldDef } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { createWorkType, listWorkTypes, newFieldKey, updateWorkType, type WorkTypeFull } from '../lib/templates';

const TYPE_LABEL: Record<FieldDef['type'], string> = { number: 'Số', text: 'Chữ', select: 'Chọn trong danh sách' };

/** Nhập các trường dữ liệu của một loại việc (ví dụ "Độ Brix" kiểu Số). Khóa trường giữ nguyên khi sửa nhãn. */
function FieldsEditor({ fields, onChange }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void }) {
  const set = (i: number, patch: Partial<FieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <fieldset className="roles">
      <legend>Thông tin cần ghi khi làm việc này</legend>
      {fields.map((f, i) => (
        <div className="quickadd" key={f.key}>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Tên trường, ví dụ: Độ Brix" aria-label="Tên trường" />
          <select value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldDef['type'] })} aria-label="Kiểu">
            {(Object.keys(TYPE_LABEL) as FieldDef['type'][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          {f.type === 'select' && (
            <input value={(f.options ?? []).join(', ')} aria-label="Các lựa chọn" placeholder="Lựa chọn, cách nhau bằng dấu phẩy"
              onChange={(e) => set(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
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
 * Thêm nhanh ở dòng trên cùng; bấm "Sửa" để đổi tên hoặc thêm trường cần ghi. Cần mạng để thêm/sửa.
 */
export function WorkTypesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [types, setTypes] = useState<WorkTypeFull[]>([]);
  const [name, setName] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFields, setEditFields] = useState<FieldDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!active || !navigator.onLine) return;
    try { setTypes(await listWorkTypes(active.id)); } catch (e) { setError(friendlyError(e)); }
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return null;
  const canManage = canManageProduction(active.roles);
  const rows = types.filter((t) => showOff || t.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const editingRow = types.find((t) => t.id === editing) ?? null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Hãy nhập tên việc (ít nhất 2 ký tự).');
    void run(async () => { await createWorkType(active!.id, name, []); setName(''); });
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && (
        <form className="quickadd" onSubmit={onAdd} noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thêm việc mới: nhập tên" aria-label="Tên việc mới" />
          <button type="submit" className="primary" disabled={busy || !online}>Thêm</button>
        </form>
      )}

      <table className="grid">
        <thead><tr><th>Việc ({rows.length})</th><th>Thông tin cần ghi</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">{online ? 'Chưa có việc nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((t) => {
            const own = t.organization_id !== null;
            return (
              <tr key={t.id} className={t.is_active ? '' : 'off'}>
                <td>
                  {t.name}
                  {own && <span className="pill mine"> Riêng</span>}
                  {!t.is_active && <span className="sub">Ngừng dùng</span>}
                </td>
                <td className="muted">{t.field_schema.length > 0 ? t.field_schema.map((f) => f.label).join(', ') : '—'}</td>
                {canManage && (
                  <td className="act">
                    {own && t.organization_id === active.id && (
                      <button className="icon" aria-label={`Sửa ${t.name}`} onClick={() => { setEditing(editing === t.id ? null : t.id); setEditName(t.name); setEditFields(t.field_schema); }}>✎</button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả việc đã ngừng dùng</label>
      <p className="muted">Việc "Riêng" do cơ sở bạn định nghĩa; các việc còn lại có sẵn. Việc đã dùng trong nhật ký hoặc quy trình thì không xóa được, chỉ ngừng dùng.</p>

      {editingRow && (
        <div className="card">
          <h2>Sửa việc: {editingRow.name}</h2>
          <div className="inline-form">
            <label>Tên việc<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
            <FieldsEditor fields={editFields} onChange={setEditFields} />
            <button className="primary" disabled={busy || !online || editName.trim().length < 2}
              onClick={() => void run(async () => {
                const f = cleanFields(editFields);
                if (f.some((x) => x.type === 'select' && (x.options ?? []).length === 0)) throw new Error('Trường "Chọn trong danh sách" cần có ít nhất một lựa chọn.');
                await updateWorkType(editingRow.id, { name: editName, field_schema: f });
                setEditing(null);
              })}>Lưu thay đổi</button>
            <button className="secondary" disabled={busy || !online}
              onClick={() => void run(async () => { await updateWorkType(editingRow.id, { is_active: !editingRow.is_active }); setEditing(null); })}>
              {editingRow.is_active ? 'Ngừng dùng việc này' : 'Dùng lại việc này'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
