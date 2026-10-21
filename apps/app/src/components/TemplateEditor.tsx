import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { parseNumber } from '../lib/inventory';
import {
  addStage, createWorkType, deleteStage, duplicateTemplate, loadTemplate, refreshCatalogCache, reorderStages, stageRanges,
  totalDays, updateStage, updateTemplate, type StageRow, type TemplateRow,
} from '../lib/templates';

/** Màu cho thanh tổng quan các giai đoạn (tên luôn hiện bằng chữ, màu chỉ để phân biệt) */
const COLORS = ['#2e7d32', '#1976d2', '#f9a825', '#8e24aa', '#00838f', '#c62828', '#6d4c41'];

interface Props { templateId: string; canEdit: boolean; onBack: () => void; onOpenOther: (id: string) => void }

/**
 * Trình soạn quy trình mẫu dạng DANH SÁCH: mỗi dòng là một giai đoạn = một việc chọn từ danh mục + số ngày.
 * Đổi thứ tự bằng kéo thả (cầm ⠿) hoặc nút ↑ ↓. Mọi thay đổi lưu thẳng lên máy chủ (cần mạng).
 */
export function TemplateEditor({ templateId, canEdit, onBack, onOpenOther }: Props) {
  const online = useOnline();
  const { workTypes: allTypes } = useCatalog();
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null); // thứ tự tạm khi đang kéo
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [descr, setDescr] = useState('');
  const [newWt, setNewWt] = useState('');
  const [newDays, setNewDays] = useState('');
  const [newNote, setNewNote] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [defining, setDefining] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const dragId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadTemplate(templateId);
      setTpl(r.template);
      setStages(r.stages);
    } catch (e) { setError(friendlyError(e)); }
  }, [templateId]);
  useEffect(() => { void load(); void refreshCatalogCache().catch(() => undefined); }, [load]);

  // Việc chọn được: dùng chung hoặc của chính cơ sở của mẫu
  const types = useMemo(
    () => allTypes.filter((w) => w.is_active || stages.some((s) => s.work_type_id === w.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [allTypes, stages],
  );
  const shown = useMemo(
    () => (order ? order.map((id) => stages.find((s) => s.id === id)).filter((s): s is StageRow => Boolean(s)) : stages),
    [order, stages],
  );
  const ranges = useMemo(() => stageRanges(shown), [shown]);
  const days = totalDays(stages);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  // --- kéo thả ---
  function onHandleDown(e: RPointerEvent, id: string) {
    if (!editable) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragId.current = id;
    setOrder(stages.map((s) => s.id));
  }
  function onHandleMove(e: RPointerEvent) {
    const id = dragId.current;
    if (!id || !bodyRef.current) return;
    const others = ([...bodyRef.current.querySelectorAll('tr[data-id]')] as HTMLElement[]).filter((r) => r.dataset.id !== id);
    let idx = 0;
    for (const r of others) {
      const b = r.getBoundingClientRect();
      if (e.clientY > b.top + b.height / 2) idx += 1;
    }
    const next = others.map((r) => r.dataset.id as string);
    next.splice(idx, 0, id);
    setOrder(next);
  }
  async function onHandleUp() {
    const id = dragId.current;
    dragId.current = null;
    if (!id || !order) return setOrder(null);
    const changed = order.some((x, i) => x !== stages[i]?.id);
    if (changed) await run(() => reorderStages(templateId, order));
    setOrder(null);
  }
  const moveBy = (i: number, d: -1 | 1) => {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    void run(() => reorderStages(templateId, ids));
  };

  function onAdd() {
    const d = parseNumber(newDays);
    const wtId = newWt || types[0]?.id || '';
    if (!wtId) return setError('Hãy chọn một đầu việc.');
    if (d === null || !Number.isInteger(d) || d < 1) return setError('Số ngày phải là số nguyên từ 1 trở lên.');
    void run(async () => { await addStage(templateId, { work_type_id: wtId, duration_days: d, note: newNote }); setNewDays(''); setNewNote(''); });
  }

  if (!tpl) return <p className="muted">{error ?? 'Đang tải…'}</p>;
  const editable = canEdit && online && !busy;

  return (
    <>
      <button className="link" onClick={onBack}>← Danh sách quy trình</button>
      <div className="card">
        <div className="row">
          <h2 className="grow">{tpl.name}</h2>
          {!tpl.is_active && <span className="pill warn">Ngừng dùng</span>}
        </div>
        {tpl.note && <p>{tpl.note}</p>}
        <p className="muted">{stages.length} giai đoạn · tổng {days} ngày · bản {tpl.version}</p>
        {stages.length > 0 && (
          <div className="timeline" role="img" aria-label={`Tổng quan ${stages.length} giai đoạn, ${days} ngày`}>
            {shown.map((s, i) => <div key={s.id} className="seg" style={{ flexGrow: s.duration_days, background: COLORS[i % COLORS.length] }} title={`${s.name}: ${s.duration_days} ngày`} />)}
          </div>
        )}
        {canEdit && (
          <div className="actions">
            <button className="secondary" disabled={!online || busy} onClick={() => { setRenaming(!renaming); setName(tpl.name); setDescr(tpl.note ?? ''); }}>Đổi tên / mô tả</button>
            <button className="secondary" disabled={!online || busy} onClick={() => void run(async () => { onOpenOther(await duplicateTemplate(templateId, `${tpl.name} (bản sao)`)); })}>Nhân bản</button>
            <button className="secondary" disabled={!online || busy} onClick={() => void run(() => updateTemplate(templateId, { is_active: !tpl.is_active }))}>{tpl.is_active ? 'Ngừng dùng' : 'Dùng lại'}</button>
          </div>
        )}
        {renaming && (
          <div className="quickadd">
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên quy trình" />
            <input value={descr} onChange={(e) => setDescr(e.target.value)} placeholder="Mô tả" aria-label="Mô tả quy trình" />
            <button className="primary" disabled={busy || !online || name.trim().length < 2} onClick={() => void run(async () => { await updateTemplate(templateId, { name, note: descr }); setRenaming(false); })}>Lưu</button>
          </div>
        )}
      </div>

      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Sửa cần có mạng.</p>}
      {!canEdit && <p className="muted">Bạn chỉ xem được quy trình này.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <table className="grid">
        <thead>
          <tr>{canEdit && <th></th>}<th>#</th><th>Giai đoạn (việc)</th><th className="num">Ngày</th><th className="num">Từ–đến</th>{canEdit && <th></th>}</tr>
        </thead>
        <tbody ref={bodyRef}>
          {shown.length === 0 && <tr><td colSpan={6} className="muted">Chưa có giai đoạn nào. Chọn việc từ danh mục và số ngày ở dòng bên dưới rồi bấm Thêm.</td></tr>}
          {shown.map((s, i) => {
            const r = ranges.get(s.id);
            return (
              <tr key={s.id} data-id={s.id} className={dragId.current === s.id ? 'dragging' : ''}>
                {canEdit && (
                  <td>
                    <span className="handle" role="button" aria-label={`Kéo để đổi thứ tự: ${s.name}`}
                      onPointerDown={(e) => onHandleDown(e, s.id)} onPointerMove={onHandleMove} onPointerUp={() => void onHandleUp()} onPointerCancel={() => void onHandleUp()}>⠿</span>
                  </td>
                )}
                <td>{i + 1}</td>
                <td>
                  {s.name}
                  {s.note && <span className="sub">{s.note}</span>}
                </td>
                <td className="num">
                  {s.duration_days}
                </td>
                <td className="num muted">{r ? `${r.from}–${r.to}` : ''}</td>
                {canEdit && (
                  <td className="act">
                    <button className="icon" disabled={!editable} aria-label={`Sửa giai đoạn ${i + 1}`} onClick={() => setEditId(editId === s.id ? null : s.id)}>✎</button>{' '}
                    <button className="icon" disabled={!editable || i === 0} aria-label="Lên" onClick={() => moveBy(i, -1)}>↑</button>{' '}
                    <button className="icon" disabled={!editable || i === shown.length - 1} aria-label="Xuống" onClick={() => moveBy(i, 1)}>↓</button>{' '}
                    <button className="icon" disabled={!editable} aria-label={`Xóa giai đoạn ${i + 1}`}
                      onClick={() => { if (window.confirm(`Xóa giai đoạn "${s.name}"?`)) void run(() => deleteStage(s.id)); }}>✕</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canEdit && editId && stages.find((s) => s.id === editId) && (
        <StageEditForm key={editId} stage={stages.find((s) => s.id === editId)!} types={types} busy={busy || !online}
          onClose={() => setEditId(null)}
          onSave={(v) => run(async () => { await updateStage(editId, v); setEditId(null); })} />
      )}

      {canEdit && (
        <>
          <div className="quickadd">
            <select value={newWt || types[0]?.id || ''} onChange={(e) => setNewWt(e.target.value)} aria-label="Đầu việc">
              {types.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Mô tả giai đoạn (không bắt buộc)" aria-label="Mô tả giai đoạn" />
            <input value={newDays} inputMode="numeric" onChange={(e) => setNewDays(e.target.value)} placeholder="Số ngày" aria-label="Số ngày" style={{ maxWidth: 110 }} />
            <button className="primary" disabled={busy || !online} onClick={onAdd}>Thêm</button>
          </div>
          <button className="link" onClick={() => setDefining(!defining)}>{defining ? 'Đóng' : 'Thiếu đầu việc? Định nghĩa việc mới'}</button>
          {defining && (
            <div className="quickadd">
              <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Tên việc mới" aria-label="Tên việc mới" />
              <button className="secondary" disabled={busy || !online || newTypeName.trim().length < 2}
                onClick={() => void run(async () => { await createWorkType(tpl.organization_id, newTypeName, []); await refreshCatalogCache(); setNewTypeName(''); setDefining(false); })}>Thêm vào danh mục</button>
            </div>
          )}
        </>
      )}
      <p className="muted">Sửa mẫu không đổi các vụ đã tạo trước đó. Cầm ⠿ kéo để đổi thứ tự, hoặc dùng nút ↑ ↓.</p>
    </>
  );
}

/** Sửa một giai đoạn: đổi việc, mô tả, số ngày rồi bấm Lưu (không lưu tự động để tránh nhầm) */
function StageEditForm({ stage, types, busy, onSave, onClose }: {
  stage: StageRow; types: { id: string; name: string }[]; busy: boolean;
  onSave: (v: { work_type_id?: string; duration_days: number; note: string }) => Promise<void>; onClose: () => void;
}) {
  const [wt, setWt] = useState(stage.work_type_id ?? '');
  const [note, setNote] = useState(stage.note ?? '');
  const [days, setDays] = useState(String(stage.duration_days));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>Sửa giai đoạn: {stage.name}</h2>
      <div className="inline-form">
        <label>Đầu việc
          <select value={wt} onChange={(e) => setWt(e.target.value)}>
            {!stage.work_type_id && <option value="">{stage.name} (tên cũ)</option>}
            {types.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label>Mô tả<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        <label>Số ngày<input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            const d = parseNumber(days);
            if (d === null || !Number.isInteger(d) || d < 1) return setErr('Số ngày phải là số nguyên từ 1 trở lên.');
            setErr(null);
            void onSave({ ...(wt && wt !== stage.work_type_id ? { work_type_id: wt } : {}), duration_days: d, note }).catch(() => undefined);
          }}>Lưu thay đổi</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
