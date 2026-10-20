import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Collapsible } from './Collapsible';
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
      <legend>Thông tin cần ghi khi làm việc này (không bắt buộc)</legend>
      {fields.map((f, i) => (
        <div className="member" key={f.key}>
          <label>Tên trường<input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Ví dụ: Độ Brix" /></label>
          <label>
            Kiểu
            <select value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldDef['type'] })}>
              {(Object.keys(TYPE_LABEL) as FieldDef['type'][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          {f.type === 'select' && (
            <label>
              Các lựa chọn (cách nhau bằng dấu phẩy)
              <input value={(f.options ?? []).join(', ')} onChange={(e) => set(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Rải gốc, Phun lá" />
            </label>
          )}
          <button type="button" className="link inline" onClick={() => onChange(fields.filter((_, j) => j !== i))}>Xóa trường</button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...fields, { key: newFieldKey(), label: '', type: 'text' }])}>+ Thêm trường</button>
    </fieldset>
  );
}

const cleanFields = (fields: FieldDef[]) => fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() }));

/** Danh mục công việc: việc có sẵn (chỉ xem) và việc cơ sở tự định nghĩa thêm. Cần mạng để thêm/sửa. */
export function WorkTypesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const [types, setTypes] = useState<WorkTypeFull[]>([]);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
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
  const shared = types.filter((t) => t.organization_id === null);
  const own = types.filter((t) => t.organization_id !== null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Hãy nhập tên loại việc (ít nhất 2 ký tự).');
    const f = cleanFields(fields);
    if (f.some((x) => x.type === 'select' && (x.options ?? []).length === 0)) return setError('Trường "Chọn trong danh sách" cần có ít nhất một lựa chọn.');
    void run(async () => { await createWorkType(active!.id, name, f); setName(''); setFields([]); });
  }

  return (
    <>
      <p className="muted">Danh mục việc dùng khi dựng quy trình mẫu và khi ghi việc hằng ngày. Có sẵn các việc thông dụng; thiếu việc nào thì bạn tự định nghĩa thêm.</p>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <Collapsible title="Việc có sẵn" summary={`${shared.length} việc`}>
        {shared.map((t) => (
          <div className="member" key={t.id}>
            <strong>{t.name}</strong>
            {t.field_schema.length > 0 && <p className="muted">Ghi: {t.field_schema.map((f) => f.label).join(', ')}</p>}
          </div>
        ))}
      </Collapsible>

      <h2 className="sect">Việc của cơ sở ({own.length})</h2>
      {own.length === 0 && <p className="muted">Chưa có việc nào do cơ sở định nghĩa.</p>}
      {own.map((t) => (
        <div className="card slim" key={t.id}>
          <div className="row">
            <strong className="grow">{t.name}</strong>
            {!t.is_active && <span className="pill warn">Ngừng dùng</span>}
            {canManage && t.organization_id === active.id && (
              <button className="link inline" onClick={() => { setEditing(editing === t.id ? null : t.id); setEditName(t.name); setEditFields(t.field_schema); }}>{editing === t.id ? 'Đóng' : 'Sửa'}</button>
            )}
          </div>
          {t.field_schema.length > 0 && <p className="muted">Ghi: {t.field_schema.map((f) => f.label).join(', ')}</p>}
          {editing === t.id && (
            <div className="inline-form">
              <label>Tên việc<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
              <FieldsEditor fields={editFields} onChange={setEditFields} />
              <button className="primary" disabled={busy || !online || editName.trim().length < 2}
                onClick={() => void run(async () => { await updateWorkType(t.id, { name: editName, field_schema: cleanFields(editFields) }); setEditing(null); })}>Lưu thay đổi</button>
              <button className="secondary" disabled={busy || !online}
                onClick={() => void run(async () => { await updateWorkType(t.id, { is_active: !t.is_active }); setEditing(null); })}>
                {t.is_active ? 'Ngừng dùng việc này' : 'Dùng lại việc này'}
              </button>
              <small className="muted">Việc đã được dùng trong nhật ký hoặc quy trình mẫu không xóa được, chỉ ngừng dùng.</small>
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <Collapsible inline title="＋ Định nghĩa việc mới" defaultOpen={own.length === 0}>
          <form className="inline-form" onSubmit={onAdd} noValidate>
            <label>Tên việc<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Kiểm tra độ ngọt" /></label>
            <FieldsEditor fields={fields} onChange={setFields} />
            <button type="submit" className="primary" disabled={busy || !online}>Thêm việc</button>
          </form>
        </Collapsible>
      )}
    </>
  );
}
