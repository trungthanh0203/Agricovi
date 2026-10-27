import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCatalog, workTypesForKind } from '../lib/catalog';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { parseNumber } from '../lib/inventory';
import { Collapsible } from './Collapsible';
import { TemplateMilestones } from './MilestonePanels';
import {
  addPhase, addStage, deletePhase, deleteStage, duplicateTemplate, flatOrder, IMPORTANCE_LABEL, loadTemplate, refreshCatalogCache, reorderStages,
  stageRanges, swapPhases, totalDays, updatePhase, updateStage, updateTemplate,
  type Importance, type PhaseRow, type StageRow, type TemplateRow,
} from '../lib/templates';

/** Màu cho thanh tổng quan (tên luôn hiện bằng chữ, màu chỉ để phân biệt) */
const COLORS = ['#2e7d32', '#1976d2', '#f9a825', '#8e24aa', '#00838f', '#c62828', '#6d4c41'];
const NO_PHASE = '';

interface Props { templateId: string; canEdit: boolean; onBack: () => void; onOpenOther: (id: string) => void }

/**
 * Trình soạn quy trình mẫu 2 cấp: QUY TRÌNH → CÔNG ĐOẠN (số thứ tự/mã, tên, mô tả) → VIỆC (chọn từ danh mục việc, số ngày, mức độ quan trọng, ghi chú).
 * Form thêm và form sửa cùng một chỗ (đầu mỗi khối). Mỗi việc là một hàng của bảng template_stages nên tạo vụ, lịch và tiến độ giữ nguyên;
 * thứ tự toàn bộ việc luôn được sắp lại theo thứ tự công đoạn (flatOrder). Mọi thay đổi lưu thẳng lên máy chủ (cần mạng).
 */
export function TemplateEditor({ templateId, canEdit, onBack, onOpenOther }: Props) {
  const online = useOnline();
  const { workTypes: allTypes, cropTypes } = useCatalog();
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [descr, setDescr] = useState('');
  const [editPhase, setEditPhase] = useState<string | null>(null);
  const [editStage, setEditStage] = useState<string | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadTemplate(templateId);
      setTpl(r.template);
      setStages(r.stages);
      setPhases(r.phases);
    } catch (e) { setError(friendlyError(e)); }
  }, [templateId]);
  useEffect(() => { void load(); void refreshCatalogCache().catch(() => undefined); }, [load]);

  const cropKind = cropTypes.find((c) => c.id === tpl?.crop_type_id)?.kind;
  // Việc chọn được: theo đối tượng sản xuất của quy trình (cây trồng / vật nuôi / thủy sản); việc đang dùng trong mẫu vẫn hiện dù đã dừng
  const types = useMemo(
    () => workTypesForKind(allTypes.filter((w) => w.is_active || stages.some((s) => s.work_type_id === w.id)), cropKind)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [allTypes, stages, cropKind],
  );
  const orderedPhases = useMemo(() => [...phases].sort((a, b) => a.seq - b.seq), [phases]);
  const ranges = useMemo(() => stageRanges([...stages].sort((a, b) => a.seq - b.seq)), [stages]);
  const days = totalDays(stages);
  const inPhase = (phaseId: string | null) => stages.filter((s) => (s.phase_id ?? null) === phaseId).sort((a, b) => a.seq - b.seq);
  const orphans = stages.filter((s) => !s.phase_id || !phases.some((p) => p.id === s.phase_id)).sort((a, b) => a.seq - b.seq);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  /** Sắp lại thứ tự toàn bộ việc theo công đoạn rồi lưu (gọi sau mọi thay đổi cấu trúc) */
  async function resequence() {
    const r = await loadTemplate(templateId);
    const ids = flatOrder(r.phases, r.stages);
    if (ids.some((id, i) => r.stages.slice().sort((a, b) => a.seq - b.seq)[i]?.id !== id)) await reorderStages(templateId, ids);
  }

  if (!tpl) return <p className="muted">{error ?? 'Đang tải…'}</p>;
  const editable = canEdit && online && !busy;
  const phaseNo = (p: PhaseRow, i: number) => p.code?.trim() || String(i + 1);
  const phaseDays = (id: string | null) => inPhase(id).reduce((n, s) => n + s.duration_days, 0);

  function stageCard(s: StageRow, label: string, list: StageRow[], idx: number, phaseId: string | null) {
    const r = ranges.get(s.id);
    const imp = (s.importance ?? 'normal') as Importance;
    const move = (d: -1 | 1) => {
      const ids = list.map((x) => x.id);
      [ids[idx], ids[idx + d]] = [ids[idx + d]!, ids[idx]!];
      // đổi chỗ hai việc kề nhau trong cùng nhóm: gán lại thứ tự cho cả quy trình
      void run(async () => {
        const all = flatOrder(phases, stages).filter((id) => !ids.includes(id));
        const firstOfGroup = flatOrder(phases, stages).findIndex((id) => ids.includes(id));
        all.splice(firstOfGroup < 0 ? all.length : firstOfGroup, 0, ...ids);
        await reorderStages(templateId, all);
      });
    };
    return (
      <div className="card slim" key={s.id}>
        <div className="row">
          <span className="grow"><strong>{label} {s.name}</strong></span>
          {canEdit && (
            <span>
              <button className="icon" disabled={!editable} aria-label={`Sửa việc ${label}`} onClick={() => { setEditStage(editStage === s.id ? null : s.id); setEditPhase(null); }}>✎</button>{' '}
              <button className="icon" disabled={!editable || idx === 0} aria-label="Lên" onClick={() => move(-1)}>↑</button>{' '}
              <button className="icon" disabled={!editable || idx === list.length - 1} aria-label="Xuống" onClick={() => move(1)}>↓</button>{' '}
              <button className="icon" disabled={!editable} aria-label={`Xóa việc ${label}`}
                onClick={() => { if (window.confirm(`Xóa việc "${s.name}" khỏi quy trình?`)) void run(() => deleteStage(s.id)); }}>✕</button>
            </span>
          )}
        </div>
        <p className="muted">
          {s.duration_days} ngày{r ? ` (ngày ${r.from}–${r.to})` : ''} · Quan trọng: {IMPORTANCE_LABEL[imp]}
        </p>
        {s.note && <p>{s.note}</p>}
        {canEdit && editStage === s.id && (
          <StageForm key={s.id} title={`Sửa việc: ${s.name}`} stage={s} phaseId={phaseId} phases={orderedPhases} types={types} busy={busy || !online}
            onClose={() => setEditStage(null)}
            onSave={(v) => run(async () => { await updateStage(s.id, { ...v.fields, phase_id: v.phaseId }); await resequence(); setEditStage(null); })} />
        )}
      </div>
    );
  }

  return (
    <>
      <button className="link" onClick={onBack}>← Danh sách quy trình</button>
      <div className="card">
        <div className="row">
          <h2 className="grow">{tpl.name}</h2>
          {!tpl.is_active && <span className="pill warn">Ngừng dùng</span>}
        </div>
        {tpl.note && <p>{tpl.note}</p>}
        <p className="muted">{phases.length} công đoạn · {stages.length} việc · tổng {days} ngày · bản {tpl.version}</p>
        {stages.length > 0 && (
          <div className="timeline" role="img" aria-label={`Tổng quan ${stages.length} việc, ${days} ngày`}>
            {[...stages].sort((a, b) => a.seq - b.seq).map((s, i) => <div key={s.id} className="seg" style={{ flexGrow: s.duration_days, background: COLORS[i % COLORS.length] }} title={`${s.name}: ${s.duration_days} ngày`} />)}
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

      {canEdit && (editPhase && phases.find((p) => p.id === editPhase)
        ? (
          <PhaseForm key={editPhase} title="Sửa công đoạn" phase={phases.find((p) => p.id === editPhase)!} busy={busy || !online}
            onClose={() => setEditPhase(null)}
            onSave={(v) => run(async () => { await updatePhase(editPhase, v); setEditPhase(null); })} />
        )
        : (
          <Collapsible inline title="＋ Thêm công đoạn">
            <PhaseForm title="" phase={null} busy={busy || !online}
              onSave={(v) => run(async () => { const id = await addPhase(templateId, { ...v, name: v.name ?? '' }); setOpenPhase(id); })} />
          </Collapsible>
        ))}

      {orderedPhases.length === 0 && orphans.length === 0 && <p className="muted">Chưa có công đoạn nào. Bấm "＋ Thêm công đoạn", rồi thêm các việc vào công đoạn.</p>}

      {orderedPhases.map((p, i) => {
        const list = inPhase(p.id);
        return (
          <Collapsible key={p.id} title={`${phaseNo(p, i)}. ${p.name}`} summary={`${list.length} việc · ${phaseDays(p.id)} ngày`} defaultOpen={openPhase === p.id}>
            {p.description && <p className="muted">{p.description}</p>}
            {canEdit && (
              <div className="actions">
                <button className="secondary" disabled={!editable} onClick={() => { setEditPhase(p.id); setEditStage(null); }}>Sửa công đoạn</button>
                <button className="secondary" disabled={!editable || i === 0} onClick={() => void run(async () => { await swapPhases(p, orderedPhases[i - 1]!); await resequence(); })}>↑ Lên</button>
                <button className="secondary" disabled={!editable || i === orderedPhases.length - 1} onClick={() => void run(async () => { await swapPhases(p, orderedPhases[i + 1]!); await resequence(); })}>↓ Xuống</button>
                <button className="secondary" disabled={!editable}
                  onClick={() => { if (window.confirm(`Xóa công đoạn "${p.name}"? Các việc bên trong không bị xóa, chỉ thành "chưa xếp công đoạn".`)) void run(async () => { await deletePhase(p.id); await resequence(); }); }}>Xóa công đoạn</button>
              </div>
            )}
            {canEdit && editStage === null && (
              <Collapsible inline title="＋ Thêm việc vào công đoạn này">
                <StageForm title="" stage={null} phaseId={p.id} phases={orderedPhases} types={types} busy={busy || !online}
                  onSave={(v) => run(async () => {
                    await addStage(templateId, { work_type_id: v.fields.work_type_id!, duration_days: v.fields.duration_days!, note: v.fields.note ?? '', importance: v.fields.importance, phase_id: v.phaseId });
                    await resequence();
                    setOpenPhase(p.id);
                  })} />
              </Collapsible>
            )}
            {list.length === 0 && <p className="muted">Công đoạn này chưa có việc nào.</p>}
            {list.map((s, j) => stageCard(s, `${phaseNo(p, i)}.${j + 1}`, list, j, p.id))}
          </Collapsible>
        );
      })}

      {orphans.length > 0 && (
        <Collapsible title="Việc chưa xếp công đoạn" summary={`${orphans.length} việc · ${phaseDays(null) || orphans.reduce((n, s) => n + s.duration_days, 0)} ngày`} defaultOpen>
          <p className="muted">Các việc này còn từ quy trình cũ. Bấm ✎ rồi chọn công đoạn để xếp vào.</p>
          {orphans.map((s, j) => stageCard(s, `${j + 1}.`, orphans, j, null))}
        </Collapsible>
      )}

      <p className="muted">Thiếu việc trong danh sách? Thêm ở Khai báo → Việc. Việc hiện ra theo đối tượng sản xuất của quy trình. Sửa mẫu không đổi các vụ đã tạo trước đó.</p>
      <TemplateMilestones templateId={templateId} kind={cropKind} canEdit={editable} />
    </>
  );
}

/** Thêm / sửa một công đoạn: chỉ số thứ tự (mã), tên và mô tả */
function PhaseForm({ title, phase, busy, onSave, onClose }: {
  title: string; phase: PhaseRow | null; busy: boolean;
  onSave: (v: { code: string; name: string; description: string }) => Promise<void>; onClose?: () => void;
}) {
  const [code, setCode] = useState(phase?.code ?? '');
  const [name, setName] = useState(phase?.name ?? '');
  const [description, setDescription] = useState(phase?.description ?? '');
  const [err, setErr] = useState<string | null>(null);
  const body = (
    <div className="inline-form">
      <label>Số thứ tự (mã)<input value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} placeholder="Ví dụ: 1" /></label>
      <label>Tên công đoạn<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chuẩn bị" /></label>
      <label>Mô tả<input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={() => {
          if (name.trim().length < 2) return setErr('Hãy nhập tên công đoạn (ít nhất 2 ký tự).');
          setErr(null);
          void onSave({ code, name, description }).then(() => { if (!phase) { setCode(''); setName(''); setDescription(''); } }).catch(() => undefined);
        }}>{phase ? 'Lưu thay đổi' : 'Thêm'}</button>
        {onClose && <button type="button" className="secondary" onClick={onClose}>Hủy</button>}
      </div>
    </div>
  );
  return title ? <div className="card"><h2>{title}</h2>{body}</div> : body;
}

/** Thêm / sửa một việc của công đoạn: việc (từ danh mục), công đoạn, mức độ quan trọng, số ngày, ghi chú. Không lưu tự động để tránh nhầm. */
function StageForm({ title, stage, phaseId, phases, types, busy, onSave, onClose }: {
  title: string; stage: StageRow | null; phaseId: string | null; phases: PhaseRow[]; types: { id: string; name: string }[]; busy: boolean;
  onSave: (v: { phaseId: string | null; fields: { work_type_id?: string; duration_days?: number; note?: string; importance?: Importance } }) => Promise<void>; onClose?: () => void;
}) {
  const [wt, setWt] = useState(stage?.work_type_id ?? '');
  const [phase, setPhase] = useState(phaseId ?? NO_PHASE);
  const [importance, setImportance] = useState<Importance>((stage?.importance ?? 'normal') as Importance);
  const [days, setDays] = useState(stage ? String(stage.duration_days) : '');
  const [note, setNote] = useState(stage?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const body = (
    <div className="inline-form">
      <label>Việc
        <select value={wt || (stage ? '' : types[0]?.id ?? '')} onChange={(e) => setWt(e.target.value)}>
          {stage && !stage.work_type_id && <option value="">{stage.name} (tên cũ)</option>}
          {types.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {stage && (
        <label>Công đoạn
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value={NO_PHASE}>— Chưa xếp công đoạn —</option>
            {phases.map((p, i) => <option key={p.id} value={p.id}>{p.code?.trim() || i + 1}. {p.name}</option>)}
          </select>
        </label>
      )}
      <div className="pair">
        <label>Mức độ quan trọng
          <select value={importance} onChange={(e) => setImportance(e.target.value as Importance)}>
            {(Object.keys(IMPORTANCE_LABEL) as Importance[]).map((k) => <option key={k} value={k}>{IMPORTANCE_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Số ngày<input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} /></label>
      </div>
      <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={() => {
          const d = parseNumber(days);
          const wtId = wt || (stage ? stage.work_type_id ?? '' : types[0]?.id ?? '');
          if (!wtId && !stage) return setErr('Hãy chọn một việc.');
          if (d === null || !Number.isInteger(d) || d < 1) return setErr('Số ngày phải là số nguyên từ 1 trở lên.');
          setErr(null);
          void onSave({
            phaseId: phase || null,
            fields: { ...(wtId && wtId !== stage?.work_type_id ? { work_type_id: wtId } : {}), duration_days: d, note, importance },
          }).then(() => { if (!stage) { setDays(''); setNote(''); } }).catch(() => undefined);
        }}>{stage ? 'Lưu thay đổi' : 'Thêm'}</button>
        {onClose && <button type="button" className="secondary" onClick={onClose}>Hủy</button>}
      </div>
    </div>
  );
  return title ? <div className="card"><h2>{title}</h2>{body}</div> : body;
}
