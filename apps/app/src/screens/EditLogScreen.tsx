import { useState, type FormEvent } from 'react';
import { productKindOfArea, useCatalog, useKindWorkTypes } from '../lib/catalog';
import { useTable } from '../lib/tables';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FieldDef } from '../lib/db';
import { DynamicField } from '../components/DynamicField';
import { fieldsToData, initialValues, validateFields } from '../lib/fieldsLogic';
import { VoiceNote } from '../components/VoiceNote';
import { friendlyError } from '../lib/errors';
import { toLocalInput, useOnline } from '../lib/hooks';
import { editLog } from '../lib/production';

/** Sửa nhật ký đã ghi (FR-LOG-005). Không đổi được vụ hay loại việc: muốn đổi hãy hủy và ghi lại. */
export function EditLogScreen({ logId, onClose }: { logId: string; onClose: () => void }) {
  const log = useLiveQuery(() => db.logs.get(logId), [logId]);
  const { cropTypes } = useCatalog();
  const allCycles = useTable('cycles');
  const allAreas = useTable('areas');
  // biểu mẫu theo loại của vụ (hoặc của khu nếu việc ghi cho khu không gắn vụ)
  const logKind = log?.cycle_id
    ? cropTypes.find((c) => c.id === allCycles.find((x) => x.id === log.cycle_id)?.crop_type_id)?.kind
    : productKindOfArea(allAreas.find((a) => a.id === log?.area_id)?.kind);
  const workTypes = useKindWorkTypes(logKind);
  const [when, setWhen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();

  if (!log) return <p className="center muted">Đang tải…</p>;
  const workType = workTypes.find((w) => w.id === log.work_type_id);
  const schema: FieldDef[] = workType?.field_schema ?? [];

  const whenV = when ?? toLocalInput(new Date(log.performed_at));
  const valuesV = values ?? initialValues(schema, log.data);
  const noteV = note ?? log.note ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!noteV.trim()) return setError('Hãy nhập "Nội dung việc": gõ chữ hoặc bấm Nói để đọc nội dung đã làm.');
    const bad = validateFields(schema, valuesV);
    if (bad) return setError(bad);
    const data = fieldsToData(schema, valuesV, log!.data);
    setError(null);
    try {
      await editLog(logId, { performedAt: new Date(whenV).toISOString(), data, note: noteV });
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <main className="auth">
      <h1>Sửa nhật ký</h1>
      <p className="muted">{workType?.name ?? 'Việc'} — mọi thay đổi được lưu lịch sử.</p>
      <form onSubmit={onSubmit} noValidate>
        <label>
          Thời điểm làm
          <input type="datetime-local" value={whenV} onChange={(e) => setWhen(e.target.value)} />
        </label>
        {schema.map((f) => (
          <DynamicField key={f.key} def={f} value={valuesV[f.key] ?? ''} onChange={(v) => setValues({ ...valuesV, [f.key]: v })} />
        ))}
        <VoiceNote label="Nội dung việc (bắt buộc)" value={noteV} onChange={setNote} />
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Sửa nhật ký cần có mạng; hãy kết nối mạng rồi bấm Lưu thay đổi.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online}>Lưu thay đổi</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </main>
  );
}
