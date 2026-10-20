import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from './Collapsible';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { parseNumber } from '../lib/inventory';
import {
  addStage, addTask, deleteStage, deleteTask, describeSchedule, loadTemplate, moveStage, refreshCatalogCache, stageRanges,
  totalDays, updateStage, updateTask, updateTemplate, type StageRow, type TaskInput, type TaskRow, type TemplateRow,
} from '../lib/templates';

/** Màu cho thanh tổng quan các giai đoạn (chữ luôn có tên, màu chỉ để phân biệt) */
const COLORS = ['#2e7d32', '#1976d2', '#f9a825', '#8e24aa', '#00838f', '#c62828', '#6d4c41'];

interface Props { templateId: string; canEdit: boolean; onBack: () => void }

/** Trình soạn một quy trình mẫu: giai đoạn (thứ tự, số ngày) và việc trong từng giai đoạn. Mọi thay đổi lưu thẳng lên máy chủ. */
export function TemplateEditor({ templateId, canEdit, onBack }: Props) {
  const online = useOnline();
  const workTypes = useLiveQuery(() => db.workTypes.toArray(), [], []);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [sName, setSName] = useState('');
  const [sDays, setSDays] = useState('');
  const [sNote, setSNote] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await loadTemplate(templateId);
      setTpl(r.template);
      setStages(r.stages);
      setTasks(r.tasks);
    } catch (e) { setError(friendlyError(e)); }
  }, [templateId]);
  useEffect(() => { void load(); void refreshCatalogCache().catch(() => undefined); }, [load]);

  const ranges = useMemo(() => stageRanges(stages), [stages]);
  const days = totalDays(stages);
  const wtName = (id: string) => workTypes.find((w) => w.id === id)?.name ?? '—';

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function onAddStage() {
    const d = parseNumber(sDays);
    if (sName.trim().length < 1) return setError('Hãy nhập tên giai đoạn.');
    if (d === null || !Number.isInteger(d) || d < 1) return setError('Số ngày của giai đoạn phải là số nguyên từ 1 trở lên.');
    void run(async () => { await addStage(templateId, { name: sName, duration_days: d, note: sNote }); setSName(''); setSDays(''); setSNote(''); });
  }

  if (!tpl) return <p className="muted">{error ?? 'Đang tải…'}</p>;
  const editable = canEdit && online;

  return (
    <>
      <button className="link" onClick={onBack}>← Quay lại danh sách mẫu</button>
      <div className="card">
        <div className="row">
          <h2 className="grow">{tpl.name}</h2>
          {canEdit && <button className="link inline" onClick={() => { setRenaming(!renaming); setName(tpl.name); }}>{renaming ? 'Đóng' : 'Đổi tên'}</button>}
        </div>
        <p className="muted">{stages.length} giai đoạn · tổng {days} ngày · bản {tpl.version}</p>
        {renaming && (
          <div className="inline-form">
            <label>Tên quy trình<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <button className="primary" disabled={busy || !online || name.trim().length < 2}
              onClick={() => void run(async () => { await updateTemplate(templateId, { name }); setRenaming(false); })}>Lưu tên</button>
          </div>
        )}
        {stages.length > 0 && (
          <div className="timeline" role="img" aria-label={`Tổng quan ${stages.length} giai đoạn, ${days} ngày`}>
            {stages.map((s, i) => (
              <div key={s.id} className="seg" style={{ flexGrow: s.duration_days, background: COLORS[i % COLORS.length] }} title={`${s.name}: ${s.duration_days} ngày`} />
            ))}
          </div>
        )}
        <p className="muted">Mẫu này chỉ ảnh hưởng các vụ tạo SAU khi sửa; vụ đang chạy giữ nguyên bản đã lấy lúc tạo.</p>
      </div>

      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Sửa cần có mạng.</p>}
      {!canEdit && <p className="muted">Bạn chỉ xem được quy trình này.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {stages.length === 0 && <p className="muted">Chưa có giai đoạn nào. Hãy thêm giai đoạn đầu tiên bên dưới.</p>}

      {stages.map((s, i) => {
        const r = ranges.get(s.id)!;
        const list = tasks.filter((t) => t.stage_id === s.id);
        return (
          <Collapsible key={s.id} title={`${i + 1}. ${s.name}`} summary={`Ngày ${r.from}–${r.to} (${s.duration_days} ngày) · ${list.length} việc`}>
            {s.note && <p className="muted">{s.note}</p>}
            {list.length === 0 && <p className="muted">Chưa có việc nào trong giai đoạn này.</p>}
            {list.map((t) => (
              <TaskItem key={t.id} task={t} stage={s} wtName={wtName(t.work_type_id)} editable={editable} busy={busy}
                workTypes={workTypes.filter((w) => w.organization_id === null || w.organization_id === tpl.organization_id)}
                onSave={(v) => run(() => updateTask(t.id, v))} onDelete={() => run(() => deleteTask(t.id))} />
            ))}
            {canEdit && (
              <Collapsible inline title="＋ Thêm việc vào giai đoạn">
                <TaskForm stage={s} workTypes={workTypes.filter((w) => w.organization_id === null || w.organization_id === tpl.organization_id)}
                  busy={busy || !online} submitLabel="Thêm việc" onSubmit={(v) => run(() => addTask(s.id, v))} />
              </Collapsible>
            )}
            {canEdit && (
              <StageTools stage={s} first={i === 0} last={i === stages.length - 1} busy={busy || !online}
                onSave={(v) => run(() => updateStage(s.id, v))}
                onMove={(d) => run(() => moveStage(s.id, d))}
                onDelete={() => { if (window.confirm(`Xóa giai đoạn "${s.name}" và các việc trong đó?`)) void run(() => deleteStage(s.id)); }} />
            )}
          </Collapsible>
        );
      })}

      {canEdit && (
        <Collapsible inline title="＋ Thêm giai đoạn" defaultOpen={stages.length === 0}>
          <div className="inline-form">
            <label>Tên giai đoạn<input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Ví dụ: Ra hoa" /></label>
            <label>Kéo dài bao nhiêu ngày<input value={sDays} inputMode="numeric" onChange={(e) => setSDays(e.target.value)} /></label>
            <label>Ghi chú (không bắt buộc)<input value={sNote} onChange={(e) => setSNote(e.target.value)} /></label>
            <button className="primary" disabled={busy || !online} onClick={onAddStage}>Thêm giai đoạn</button>
          </div>
        </Collapsible>
      )}
    </>
  );
}

function StageTools({ stage, first, last, busy, onSave, onMove, onDelete }: {
  stage: StageRow; first: boolean; last: boolean; busy: boolean;
  onSave: (v: { name: string; duration_days: number; note: string }) => void;
  onMove: (d: -1 | 1) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [days, setDays] = useState(String(stage.duration_days));
  const [note, setNote] = useState(stage.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Collapsible inline title="Sửa, dời hoặc xóa giai đoạn này">
      <div className="inline-form">
        <label>Tên giai đoạn<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Kéo dài bao nhiêu ngày<input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} /></label>
        <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <button className="primary" disabled={busy} onClick={() => {
          const d = parseNumber(days);
          if (name.trim().length < 1) return setErr('Hãy nhập tên giai đoạn.');
          if (d === null || !Number.isInteger(d) || d < 1) return setErr('Số ngày phải là số nguyên từ 1 trở lên.');
          setErr(null);
          onSave({ name, duration_days: d, note });
        }}>Lưu giai đoạn</button>
        <div className="actions">
          <button className="secondary" disabled={busy || first} onClick={() => onMove(-1)}>↑ Lên trước</button>
          <button className="secondary" disabled={busy || last} onClick={() => onMove(1)}>↓ Xuống sau</button>
          <button className="secondary" disabled={busy} onClick={onDelete}>Xóa giai đoạn</button>
        </div>
      </div>
    </Collapsible>
  );
}

type WT = { id: string; name: string };

function TaskForm({ stage, workTypes, initial, busy, submitLabel, onSubmit }: {
  stage: StageRow; workTypes: WT[]; initial?: TaskRow; busy: boolean; submitLabel: string; onSubmit: (v: TaskInput) => void;
}) {
  const [wt, setWt] = useState(initial?.work_type_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState(String(initial?.start_day ?? 1));
  const [every, setEvery] = useState(initial?.repeat_every_days ? String(initial.repeat_every_days) : '');
  const [required, setRequired] = useState(initial?.is_required ?? true);
  const [note, setNote] = useState(initial?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const effWt = wt || workTypes[0]?.id || '';
  const sorted = [...workTypes].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  function submit() {
    const s = parseNumber(start);
    const e = parseNumber(every);
    const chosen = sorted.find((w) => w.id === effWt);
    if (!chosen) return setErr('Hãy chọn loại việc.');
    if (s === null || !Number.isInteger(s) || s < 1) return setErr('Ngày bắt đầu phải là số nguyên từ 1 trở lên.');
    if (s > stage.duration_days) return setErr(`Giai đoạn này chỉ dài ${stage.duration_days} ngày nên việc không thể bắt đầu ở ngày ${s}.`);
    if (e !== null && (!Number.isInteger(e) || e < 1)) return setErr('"Lặp mỗi … ngày" phải là số nguyên từ 1 trở lên, hoặc để trống nếu chỉ làm một lần.');
    setErr(null);
    onSubmit({ work_type_id: effWt, title: title.trim() || chosen.name, start_day: s, repeat_every_days: e, is_required: required, note });
  }

  return (
    <div className="inline-form">
      <label>
        Loại việc
        <select value={effWt} onChange={(e) => setWt(e.target.value)}>
          {sorted.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <small>Thiếu loại việc? Thêm ở mục "Danh mục công việc".</small>
      </label>
      <label>Tên việc trong lịch (để trống thì lấy tên loại việc)<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Bắt đầu ở ngày thứ (1 đến {stage.duration_days})<input value={start} inputMode="numeric" onChange={(e) => setStart(e.target.value)} /></label>
      <label>Lặp mỗi … ngày (để trống nếu chỉ làm một lần)<input value={every} inputMode="numeric" onChange={(e) => setEvery(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Việc bắt buộc phải làm</label>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <button className="primary" disabled={busy} onClick={submit}>{submitLabel}</button>
    </div>
  );
}

function TaskItem({ task, stage, wtName, workTypes, editable, busy, onSave, onDelete }: {
  task: TaskRow; stage: StageRow; wtName: string; workTypes: WT[]; editable: boolean; busy: boolean;
  onSave: (v: TaskInput) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="member">
      <div className="row">
        <span className="grow">
          <strong>{task.title}</strong> <span className="muted">· {wtName} · {describeSchedule(task, stage.duration_days)}</span>
          {!task.is_required && <span className="pill"> Không bắt buộc</span>}
        </span>
        {editable && <button className="link inline" onClick={() => setOpen(!open)}>{open ? 'Đóng' : 'Sửa'}</button>}
      </div>
      {open && (
        <>
          <TaskForm stage={stage} workTypes={workTypes} initial={task} busy={busy} submitLabel="Lưu việc" onSubmit={(v) => { onSave(v); setOpen(false); }} />
          <button className="link" disabled={busy} onClick={() => { if (window.confirm('Xóa việc này khỏi giai đoạn?')) onDelete(); }}>Xóa việc này</button>
        </>
      )}
    </div>
  );
}
