import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FieldDef } from '../lib/db';
import { toLocalInput } from '../lib/hooks';
import { editLog } from '../lib/production';

/** Sửa nhật ký đã ghi (FR-LOG-005). Không đổi được vụ hay loại việc: muốn đổi hãy hủy và ghi lại. */
export function EditLogScreen({ logId, onClose }: { logId: string; onClose: () => void }) {
  const log = useLiveQuery(() => db.logs.get(logId), [logId]);
  const workTypes = useLiveQuery(() => db.workTypes.toArray(), [], []);
  const [when, setWhen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!log) return <p className="center muted">Đang tải…</p>;
  const workType = workTypes.find((w) => w.id === log.work_type_id);
  const schema: FieldDef[] = workType?.field_schema ?? [];

  const whenV = when ?? toLocalInput(new Date(log.performed_at));
  const valuesV = values ?? Object.fromEntries(schema.map((f) => [f.key, log.data[f.key] === undefined ? '' : String(log.data[f.key])]));
  const noteV = note ?? log.note ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    for (const f of schema) {
      const raw = valuesV[f.key];
      if (f.type === 'number' && raw && Number.isNaN(Number(raw))) return setError(`"${f.label}" phải là số.`);
    }
    const data: Record<string, unknown> = { ...log!.data };
    for (const f of schema) {
      const raw = valuesV[f.key];
      if (raw === undefined || raw === '') delete data[f.key];
      else data[f.key] = f.type === 'number' ? Number(raw) : raw;
    }
    await editLog(logId, { performedAt: new Date(whenV).toISOString(), data, note: noteV });
    onClose();
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
          <label key={f.key}>
            {f.label}
            {f.type === 'select' && f.options?.length ? (
              <select value={valuesV[f.key] ?? ''} onChange={(e) => setValues({ ...valuesV, [f.key]: e.target.value })}>
                <option value="">— Chọn —</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={valuesV[f.key] ?? ''} inputMode={f.type === 'number' ? 'decimal' : undefined}
                onChange={(e) => setValues({ ...valuesV, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        <label>
          Ghi chú
          <input value={noteV} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!navigator.onLine && <p className="msg warn">Đang offline. Thay đổi sẽ lưu trên điện thoại và gửi sau; nếu người khác đã sửa bản ghi này, bạn sẽ được hỏi cách giải quyết.</p>}
        <button type="submit" className="primary">Lưu thay đổi</button>
        <button type="button" className="link" onClick={onClose}>Hủy</button>
      </form>
    </main>
  );
}
