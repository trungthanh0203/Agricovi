import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { FieldDef } from '../lib/db';
import { Collapsible } from './Collapsible';
import { RowMenu } from './RowMenu';
import { checkSchemaDraft, FIELD_TYPES, FIELD_TYPE_LABEL } from '../lib/fieldsLogic';
import { fieldsForKind, useCatalog, type EffWorkType } from '../lib/catalog';
import { useConfig } from '../lib/config';
import { useTable } from '../lib/tables';
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
      <legend>Các việc chi tiết (nếu có)</legend>
      {fields.map((f, i) => (
        <div className="quickadd" key={f.key}>
          <label className="check"><input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked || undefined })} /><span>Bắt buộc</span></label>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Tên trường, ví dụ: Độ Brix" aria-label="Tên trường" />
          <select value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldDef['type'] })} aria-label="Kiểu">
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select>
          {(f.type === 'select' || f.type === 'multiselect') && (
            <input value={(f.options ?? []).join(', ')} aria-label="Các lựa chọn" placeholder="Lựa chọn, cách nhau bằng dấu phẩy"
              onChange={(e) => set(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          )}
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

/** Chọn MỘT "Đối tượng sản xuất" cho việc: cùng tên việc nhưng khác đối tượng thì cách làm khác nhau nên tách riêng từng việc; dùng chung cho thêm mới và sửa */
function AppliesPicker({ value, onChange, groups }: { value: string[]; onChange: (v: string[]) => void; groups: { id: string; label: string }[] }) {
  return (
    <fieldset className="roles">
      <legend>Đối tượng áp dụng (chọn một)</legend>
      {groups.map((g) => (
        <label className="check" key={g.id}>
          <input type="radio" name="applies-one" checked={value[0] === g.id} onChange={() => onChange([g.id])} /> {g.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Vật tư sử dụng gợi ý cho việc: chọn từ danh mục vật tư của cơ sở; khi Ghi việc sẽ có sẵn các dòng này để nhập số lượng */
function MaterialsPicker({ ids, onChange, materials }: { ids: string[]; onChange: (v: string[]) => void; materials: { id: string; name: string }[] }) {
  const left = materials.filter((m) => !ids.includes(m.id));
  return (
    <fieldset className="roles">
      <legend>Vật tư sử dụng (không bắt buộc)</legend>
      {ids.length === 0 && <p className="muted">Chưa chọn vật tư nào.</p>}
      {ids.map((id) => (
        <div className="note-row" key={id}>
          <span className="grow">{materials.find((m) => m.id === id)?.name ?? 'Vật tư đã xóa'}</span>
          <button type="button" className="icon" aria-label="Bỏ vật tư" onClick={() => onChange(ids.filter((x) => x !== id))}>✕</button>
        </div>
      ))}
      {left.length > 0 ? (
        <select value="" aria-label="Thêm vật tư" onChange={(e) => { if (e.target.value) onChange([...ids, e.target.value]); }}>
          <option value="">Chọn để thêm vật tư</option>
          {left.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      ) : ids.length === 0 && <p className="muted">Chưa có vật tư trong danh mục (thêm ở Khai báo → Vật tư).</p>}
    </fieldset>
  );
}

const cleanFields =(fields: FieldDef[]) => fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() }));

/**
 * Danh mục công việc: MỘT bảng gồm việc có sẵn và việc cơ sở tự định nghĩa (việc mới vào bảng ngay).
 * Việc có sẵn cũng sửa/dừng được cho riêng cơ sở (bản chỉnh, D32): đổi tên, thêm trường ghi, dừng, khôi phục mặc định.
 * Cần mạng để thêm/sửa.
 */
export function WorkTypesSection() {
  const { active } = useOrgs();
  const online = useOnline();
  const { workTypes } = useCatalog();
  const cfg = useConfig();
  const rawTypes = useTable('workTypes');
  const [editKind, setEditKind] = useState(''); // loại vụ đang sửa biểu mẫu ('' = mọi loại)
  const [editApplies, setEditApplies] = useState<string[]>([]); // việc riêng của cơ sở: áp dụng cho loại nào (rỗng = mọi loại)
  const [name, setName] = useState('');
  const [filterKind, setFilterKind] = useState(''); // lọc danh sách theo đối tượng sản xuất ('' = tất cả)
  const [addApplies, setAddApplies] = useState<string[]>([]);
  const [addFields, setAddFields] = useState<FieldDef[]>([]);
  const [addMaterials, setAddMaterials] = useState<string[]>([]);
  const [editMaterials, setEditMaterials] = useState<string[]>([]);
  const materials = useLiveQuery(() => (active ? db.materials.where('organization_id').equals(active.id).toArray() : []), [active?.id], [])
    .filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
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
  const groups = cfg.productGroups();
  const rank = (t: EffWorkType) => { const k = t.applies_to?.[0]; const n = k ? groups.findIndex((g) => g.id === k) : -1; return n < 0 ? 999 : n; };
  const rows = workTypes.filter((t) => (showOff || t.is_active) && (!t.applies_to || t.applies_to.length === 0 || t.applies_to.some((k) => cfg.kindOn(k))) && (!filterKind || !t.applies_to || t.applies_to.length === 0 || t.applies_to.includes(filterKind))).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'vi'));
  const editingRow = workTypes.find((t) => t.id === editing) ?? null;
  const unset = workTypes.filter((t) => !t.shared && t.is_active && (!t.applies_to || t.applies_to.length === 0));
  /** Các việc chi tiết của một việc theo đối tượng áp dụng của nó (kể cả biểu mẫu chuẩn có sẵn) */
  const fieldsOf = (t: EffWorkType): FieldDef[] => { const raw = rawTypes.find((r) => r.id === t.id); return raw ? fieldsForKind(raw, org, t.applies_to?.[0]) : t.field_schema; };

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
    const kind = addApplies[0] || filterKind;
    if (!kind) return setError('Hãy chọn đối tượng sản xuất mà việc này áp dụng.');
    const f = cleanFields(addFields);
    const bad = checkSchemaDraft(f);
    if (bad) return setError(bad);
    void run(async () => { await createWorkType(org, name, f, desc, [kind], addMaterials); setName(''); setDesc(''); setAddFields([]); setAddApplies([]); setAddMaterials([]); });
  }

  async function save(t: EffWorkType) {
    const f = cleanFields(editFields);
    const bad = checkSchemaDraft(f);
    if (bad) throw new Error(bad);
    if (editName.trim().length < 2) throw new Error('Tên việc cần ít nhất 2 ký tự.');
    const matChanged = JSON.stringify([...editMaterials].sort()) !== JSON.stringify([...(t.material_ids ?? [])].sort());
    if (t.shared && editKind) {
      // việc có sẵn chỉ áp dụng cho MỘT đối tượng: biểu mẫu lưu theo đối tượng đó; tên và mô tả lưu riêng cho cơ sở
      const named = editName.trim() !== t.name || editDesc.trim() !== (t.description ?? '');
      if (named || matChanged) {
        await saveOverride(org, 'work_type', t.id, {
          ...(named ? { display_name: editName.trim() === t.base_name ? null : editName, description: editDesc } : {}),
          ...(matChanged ? { material_ids: editMaterials } : {}),
        }, '');
      }
      await saveOverride(org, 'work_type', t.id, { field_schema: f }, editKind);
    } else if (t.shared) {
      await saveOverride(org, 'work_type', t.id, {
        display_name: editName.trim() === t.base_name ? null : editName,
        description: editDesc,
        field_schema: JSON.stringify(f) === JSON.stringify(t.field_schema) && !t.overridden ? null : f,
        ...(matChanged ? { material_ids: editMaterials } : {}),
      });
    } else {
      await updateWorkType(t.id, { name: editName, description: editDesc, field_schema: f, applies_to: editApplies, material_ids: editMaterials });
    }
    setEditing(null);
  }

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}


      {canManage && unset.length > 0 && !editingRow && (
        <p className="msg warn" role="status">
          Có {unset.length} việc riêng chưa chọn Đối tượng áp dụng ({unset.slice(0, 3).map((t) => t.name).join(', ')}{unset.length > 3 ? '…' : ''}). Bấm ✎ ở từng việc để chọn, nếu không việc sẽ hiện ở mọi loại vụ.
        </p>
      )}
      <h2 className="sect band">{editingRow ? 'Sửa việc' : 'Thêm việc'}</h2>
      {editingRow && (
        <div className="card">
          <h2>Sửa việc: {editingRow.name}</h2>
          <div className="inline-form">
            <label>Tên việc<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
            <label>Mô tả<input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></label>
            {editingRow.shared ? (
              <p>Đối tượng áp dụng: <strong>{(editingRow.applies_to ?? []).map((k) => cfg.groupLabel(k, null)).join(', ') || 'Tất cả'}</strong> <small className="muted">(việc có sẵn, không đổi đối tượng; muốn khác hãy thêm việc riêng)</small></p>
            ) : (
              <AppliesPicker value={editApplies} onChange={setEditApplies} groups={groups} />
            )}
            <FieldsEditor fields={editFields} onChange={setEditFields} />
            <MaterialsPicker ids={editMaterials} onChange={setEditMaterials} materials={materials} />
            <div className="btnrow">
              <button className="primary" disabled={busy || !online} onClick={() => void run(() => save(editingRow))}>Lưu thay đổi</button>
              {editingRow.shared && editingRow.overridden && (
                <button className="secondary" disabled={busy || !online} onClick={() => void run(async () => { await clearOverride(org, 'work_type', editingRow.id, editKind); setEditing(null); })}>Khôi phục mặc định</button>
              )}
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {canManage && !editingRow && (
        <div className="card slim">
        <Collapsible inline title="＋ Thêm việc mới">
          <form className="inline-form" onSubmit={onAdd} noValidate>
            <label>Tên việc<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Phun thuốc" /></label>
            <label>Mô tả<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Làm thế nào, lưu ý…" /></label>
            <AppliesPicker value={addApplies.length > 0 ? addApplies : filterKind ? [filterKind] : []} onChange={setAddApplies} groups={groups} />
            <FieldsEditor fields={addFields} onChange={setAddFields} />
            <MaterialsPicker ids={addMaterials} onChange={setAddMaterials} materials={materials} />
            <div className="btnrow"><button type="submit" className="primary" disabled={busy || !online}>Thêm</button></div>
          </form>
        </Collapsible>
        </div>
      )}

      <h2 className="sect band">Danh sách việc</h2>
      {groups.length > 1 && (
        <div className="row">
          <label htmlFor="wt-view" className="grow" style={{ margin: 0 }}>Xem theo</label>
          <select id="wt-view" value={filterKind} onChange={(e) => setFilterKind(e.target.value)} style={{ flex: '0 1 60%' }}>
            <option value="">Tất cả</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      )}

      <table className="grid">
        <thead><tr><th>Việc ({rows.length})</th><th>Đối tượng áp dụng</th><th>Thông tin cần ghi</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">{online ? 'Chưa có việc nào.' : 'Cần mạng để tải danh sách.'}</td></tr>}
          {rows.map((t) => (
            <tr key={t.id} className={t.is_active ? '' : 'off'}>
              <td>
                {t.name}
                {t.description && <span className="sub">{t.description}</span>}
                {(t.material_ids ?? []).length > 0 && <span className="sub">Vật tư: {(t.material_ids ?? []).map((id) => materials.find((m) => m.id === id)?.name ?? '…').join(', ')}</span>}
                {!t.shared && <span className="pill mine"> Riêng</span>}
                {t.shared && t.overridden && <span className="pill warn"> Đã chỉnh</span>}
                {t.shared && !t.overridden && <span className="sub">Có sẵn</span>}
                {!t.is_active && <span className="sub">Đã dừng</span>}
              </td>
              <td className="muted">{t.applies_to && t.applies_to.length > 0 ? t.applies_to.map((k) => cfg.groupLabel(k, null)).join(', ') : t.shared ? 'Tất cả' : <span className="pill warn">Chưa chọn</span>}</td>
              <td className="muted">{fieldsOf(t).length > 0 ? fieldsOf(t).map((f) => f.label).join(', ') : '—'}</td>
              {canManage && (
                <td className="act">
                  <RowMenu label={t.name} items={[
                    { label: 'Chỉnh sửa', icon: '✎', onClick: () => { setEditing(editing === t.id ? null : t.id); setEditName(t.name); setEditDesc(t.description ?? ''); setEditFields(fieldsOf(t)); setEditKind(t.shared ? t.applies_to?.[0] ?? '' : ''); setEditApplies(t.applies_to ?? []); setEditMaterials(t.material_ids ?? []);  } },
                    { label: t.is_active ? 'Dừng việc này' : 'Dùng lại', icon: t.is_active ? '⏸' : '▶', disabled: busy || !online, onClick: () => void run(() => setActiveFlag(t)) },
                  ]} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả việc đã dừng</label>
      <p className="muted">Bấm ⏸ để dừng (không chọn được cho việc mới, lịch sử vẫn giữ) và ▶ để dùng lại; ✎ để đổi tên hoặc thêm thông tin cần ghi. Việc có sẵn chỉnh ở đây chỉ áp dụng cho cơ sở của bạn.</p>
    </>
  );
}
