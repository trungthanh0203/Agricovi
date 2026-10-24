import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { CycleCalendar } from '../components/CycleCalendar';
import { Collapsible } from '../components/Collapsible';
import { CycleQr } from '../components/CycleQr';
import { IncidentsSection } from '../components/IncidentsSection';
import { PublishCycle } from '../components/PublishCycle';
import { cycleCode } from '../lib/qr';
import { useCatalog } from '../lib/catalog';
import { cycleProgress, stageColor, stageDelayDays, STAGE_STATUS_LABEL_VI } from '../lib/cycles';
import { db, type NoteRow, type StageRow } from '../lib/db';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useOrgs } from '../lib/orgs';
import {
  addCycleStage, addNote, advanceStage, deleteCycleStage, deleteNote, refreshCycle, setNoteDone, updateCycleStage,
} from '../lib/production';
import { canManageProduction, isOwner } from '../lib/roles';

export interface LogPreset { cycleId: string; workTypeId?: string | null; stageId?: string | null }

/**
 * Chi tiết một vụ: các giai đoạn theo quy trình đã chọn (kế hoạch và thực tế), tiến độ, và xem dạng lịch.
 * Người quản lý bấm Bắt đầu / Hoàn thành, sửa/thêm/xóa giai đoạn của vụ này; mọi người ghi việc thẳng vào giai đoạn đang làm
 * và thêm ghi chú cho từng ngày ở dạng lịch (hiện nhắc ở Trang chủ).
 */
export function CycleDetailScreen({ cycleId, onClose, onLog, openQr, openCalendar, notice }: { cycleId: string; onClose: () => void; onLog: (p: LogPreset) => void; openQr?: boolean; openCalendar?: boolean; notice?: string | null }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const cycle = useLiveQuery(() => db.cycles.get(cycleId), [cycleId]);
  const stages = useLiveQuery(() => db.stages.where('cycle_id').equals(cycleId).sortBy('seq'), [cycleId], []);
  const logs = useLiveQuery(() => db.logs.where('cycle_id').equals(cycleId).toArray(), [cycleId], []);
  const notes = useLiveQuery(() => db.notes.where('cycle_id').equals(cycleId).toArray(), [cycleId], []);
  const area = useLiveQuery(async () => (cycle ? db.areas.get(cycle.area_id) : undefined), [cycle?.area_id]);
  const { cropTypes, workTypes } = useCatalog();
  const [view, setView] = useState<'list' | 'calendar'>(openCalendar ? 'calendar' : 'list');
  const [noticeOpen, setNoticeOpen] = useState(Boolean(notice));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const today = todayLocal();

  // mở màn này là làm mới giai đoạn từ máy chủ (người khác có thể vừa đổi)
  useEffect(() => { if (navigator.onLine) void refreshCycle(cycleId).catch(() => undefined); }, [cycleId]);

  const prog = useMemo(() => cycleProgress(stages, today), [stages, today]);
  const logCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (!l.voided_at && l.stage_id) m.set(l.stage_id, (m.get(l.stage_id) ?? 0) + 1);
    return m;
  }, [logs]);

  if (!cycle) return <div className="auth"><button className="link" onClick={onClose}>← Quay lại</button><p className="muted">Đang tải vụ…</p></div>;

  const canManage = canManageProduction(active?.roles) || Boolean(active?.canManageStages);
  const isActive = cycle.status === 'active';
  const closed = cycle.status === 'ended' || cycle.status === 'cancelled';
  const canEditStages = canManage && !closed;
  const crop = cropTypes.find((c) => c.id === cycle.crop_type_id)?.name ?? '—';

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }
  const act = (stageId: string, action: 'start' | 'complete' | 'reopen') => run(() => advanceStage(stageId, action)).catch(() => undefined);
  const lastEnd = stages.reduce<string>((m, s) => (s.planned_end && s.planned_end > m ? s.planned_end : m), cycle.start_date ?? today);

  return (
    <div className="auth wide">
      <button className="link" onClick={onClose}>← Quay lại</button>
      {notice && noticeOpen && (
        <div className="msg ok" role="status">
          <p style={{ margin: 0 }}>{notice}</p>
          <button className="link" onClick={() => setNoticeOpen(false)}>Đã hiểu</button>
        </div>
      )}
      <div className="row">
        <h1 className="grow">{cycle.name || crop}</h1>
        <span className="pill">{CYCLE_STATUS_LABEL_VI[cycle.status]}</span>
      </div>
      <p className="muted">
        {cycle.name ? `${crop} · ` : ''}Trang trại: {area?.name ?? '—'}
        {cycle.start_date && ` · Bắt đầu ${fmtDate(cycle.start_date)}`}
        {cycle.expected_end_date && ` · Dự kiến xong ${fmtDate(cycle.expected_end_date)}`}
      </p>
      <p className="muted">Mã vụ: <strong>{cycleCode(cycleId)}</strong></p>
      <p className="muted">Quy trình: {cycle.template_name ?? 'không có (vụ cũ)'}{cycle.template_version ? ` · bản ${cycle.template_version}` : ''}</p>
      {cycle.note && <p>{cycle.note}</p>}
      {isOwner(active?.roles) && cycle.owner_org_id === active?.id && (
        <Collapsible title="Mở công khai website" summary="chủ cơ sở tự chọn công khai">
          <PublishCycle cycleId={cycleId} />
        </Collapsible>
      )}
      <Collapsible title="Mã QR của vụ" summary="tên vụ, nơi trồng, thời gian, vật tư đã dùng" defaultOpen={openQr}>
        <CycleQr cycleId={cycleId} label={cycle.name || crop} />
      </Collapsible>

      {active && <IncidentsSection cycleId={cycleId} orgId={active.id} stages={stages} canManage={canManage} userId={session?.user.id} online={online} today={today} />}

      {prog.total > 0 ? (
        <div className="card slim">
          <div className="row">
            <strong>Tiến độ: {prog.done}/{prog.total} giai đoạn</strong>
            <span className="grow" />
            {prog.delay > 0 ? <span className="pill warn">Trễ {prog.delay} ngày</span> : prog.current ? <span className="pill ok">Đúng tiến độ</span> : <span className="pill ok">Hoàn tất</span>}
          </div>
          <div className="progress" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${prog.percent}%` }} /></div>
          {prog.current && <p className="muted">Hiện tại: <strong>{prog.current.name}</strong> ({STAGE_STATUS_LABEL_VI[prog.current.status].toLowerCase()}, kế hoạch {fmtDate(prog.current.planned_start)} – {fmtDate(prog.current.planned_end)})</p>}
        </div>
      ) : (
        <p className="msg warn">Vụ này chưa có giai đoạn nào.{canEditStages ? ' Bấm "+ Thêm giai đoạn" bên dưới để thêm.' : ''}</p>
      )}

      {!isActive && prog.total > 0 && !closed && <p className="muted">Chỉ vụ đang sản xuất mới bắt đầu/hoàn thành giai đoạn và ghi việc được.</p>}
      {!online && canManage && <p className="msg warn" role="status">Đang offline: đổi giai đoạn và ghi chú cần có mạng. Ghi việc vẫn dùng được.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      <div className="chips" role="tablist" aria-label="Cách xem">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'chip active' : 'chip'} onClick={() => setView('list')}>Danh sách</button>
        <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'chip active' : 'chip'} onClick={() => setView('calendar')}>Lịch</button>
      </div>

      {view === 'calendar' ? (
        <CycleCalendar
          stages={stages} logs={logs} today={today} notes={notes}
          canAdd={online && !closed} userId={session?.user.id} canManage={canManage} busy={busy || !online}
          onAddNote={(date, text) => run(() => addNote(cycle, session!.user.id, date, text))}
          onToggleNote={(n: NoteRow) => void run(() => setNoteDone(n.id, !n.done)).catch(() => undefined)}
          onDeleteNote={(n: NoteRow) => { if (window.confirm('Xóa ghi chú này?')) void run(() => deleteNote(n.id)).catch(() => undefined); }}
        />
      ) : (
        <>
          <table className="grid">
            <thead><tr><th>Giai đoạn</th><th>Kế hoạch</th><th>Thực tế</th><th></th></tr></thead>
            <tbody>
              {stages.length === 0 && <tr><td colSpan={4} className="muted">Chưa có giai đoạn.</td></tr>}
              {stages.map((s, i) => {
                const late = stageDelayDays(s, today);
                return (
                  <tr key={s.id}>
                    <td>
                      <i className="swatch" style={{ background: stageColor(i) }} />{s.name}
                      {s.note && <span className="sub">{s.note}</span>}
                      <span className="sub">
                        {STAGE_STATUS_LABEL_VI[s.status]}{late > 0 && s.status !== 'pending' ? ` · trễ ${late} ngày` : ''}
                        {late > 0 && s.status === 'pending' ? ` · chưa bắt đầu, trễ ${late} ngày` : ''}
                        {logCount.get(s.id) ? ` · ${logCount.get(s.id)} việc đã ghi` : ''}
                      </span>
                    </td>
                    <td>{fmtDate(s.planned_start)}<span className="sub">→ {fmtDate(s.planned_end)}</span></td>
                    <td>{s.actual_start ? fmtDate(s.actual_start) : '—'}<span className="sub">{s.actual_end ? `→ ${fmtDate(s.actual_end)}` : ''}</span></td>
                    <td className="act">
                      {isActive && s.status === 'in_progress' && (
                        <button className="secondary" style={{ minHeight: 40, width: 'auto', margin: 0, padding: '0 10px' }}
                          onClick={() => onLog({ cycleId, workTypeId: s.work_type_id, stageId: s.id })}>Ghi việc</button>
                      )}
                      {canManage && isActive && (
                        <>
                          {s.status === 'pending' && <button className="primary" style={{ minHeight: 40, width: 'auto', margin: '0 0 0 4px', padding: '0 10px' }} disabled={busy || !online} onClick={() => void act(s.id, 'start')}>Bắt đầu</button>}
                          {s.status === 'in_progress' && <button className="primary" style={{ minHeight: 40, width: 'auto', margin: '0 0 0 4px', padding: '0 10px' }} disabled={busy || !online} onClick={() => void act(s.id, 'complete')}>Xong</button>}
                          {s.status === 'done' && <button className="icon" disabled={busy || !online} aria-label={`Mở lại ${s.name}`} title="Mở lại" onClick={() => void act(s.id, 'reopen')}>↺</button>}
                        </>
                      )}
                      {canEditStages && (
                        <button className="icon" aria-label={`Sửa giai đoạn ${s.name}`} onClick={() => { setAdding(false); setEditing(editing === s.id ? null : s.id); }}>✎</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {editing && stages.find((s) => s.id === editing) && (
            <StageForm
              key={editing} title="Sửa giai đoạn" stage={stages.find((s) => s.id === editing)!} busy={busy || !online}
              workTypes={workTypes.filter((w) => w.is_active || w.id === stages.find((s) => s.id === editing)!.work_type_id)}
              canDelete={stages.find((s) => s.id === editing)!.status === 'pending'}
              onClose={() => setEditing(null)}
              onSave={(v) => run(async () => {
                await updateCycleStage(cycleId, editing, { name: v.name, work_type_id: v.workTypeId, planned_start: v.start, planned_end: v.end, note: v.note });
                setEditing(null);
              })}
              onDelete={() => {
                if (!window.confirm('Xóa giai đoạn này khỏi vụ?')) return;
                void run(async () => { await deleteCycleStage(cycleId, editing); setEditing(null); }).catch(() => undefined);
              }}
            />
          )}

          {canEditStages && !adding && !editing && (
            <button className="secondary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm giai đoạn</button>
          )}
          {canEditStages && adding && (
            <StageForm
              title="Thêm giai đoạn vào cuối quy trình của vụ" busy={busy || !online} workTypes={workTypes.filter((w) => w.is_active)}
              defaults={{ start: addDays(lastEnd, 1), end: addDays(lastEnd, 3) }}
              onClose={() => setAdding(false)}
              onSave={(v) => run(async () => {
                await addCycleStage(cycleId, { workTypeId: v.workTypeId, name: v.name, start: v.start, end: v.end, note: v.note });
                setAdding(false);
              })}
            />
          )}
          {canEditStages && <p className="muted">Sửa ở đây chỉ đổi vụ này, không đổi quy trình mẫu.</p>}
        </>
      )}

      {isActive && (
        <button className="secondary" onClick={() => onLog({ cycleId, stageId: prog.current?.status === 'in_progress' ? prog.current.id : null })}>Ghi việc cho vụ này</button>
      )}
    </div>
  );
}

/** Biểu mẫu thêm/sửa một giai đoạn của vụ: việc (từ danh mục), tên, ngày kế hoạch, ghi chú */
function StageForm({ title, stage, defaults, workTypes, busy, canDelete, onSave, onDelete, onClose }: {
  title: string;
  stage?: StageRow;
  defaults?: { start: string; end: string };
  workTypes: { id: string; name: string }[];
  busy: boolean;
  canDelete?: boolean;
  onSave: (v: { name: string; workTypeId: string | null; start: string; end: string; note: string }) => Promise<unknown>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [wt, setWt] = useState(stage?.work_type_id ?? '');
  const [name, setName] = useState(stage?.name ?? '');
  const [start, setStart] = useState(stage?.planned_start ?? defaults?.start ?? '');
  const [end, setEnd] = useState(stage?.planned_end ?? defaults?.end ?? '');
  const [note, setNote] = useState(stage?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Đầu việc
          <select value={wt} onChange={(e) => { setWt(e.target.value); if (!name.trim() || workTypes.some((w) => w.name === name)) setName(workTypes.find((w) => w.id === e.target.value)?.name ?? name); }}>
            <option value="">— Không chọn —</option>
            {workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label>Tên giai đoạn<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <div className="pair">
          <label>Từ ngày<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label>Ghi chú / mô tả<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên giai đoạn hoặc chọn việc.');
            if (!start || !end) return setErr('Hãy chọn ngày bắt đầu và kết thúc.');
            if (end < start) return setErr('Ngày kết thúc không thể trước ngày bắt đầu.');
            setErr(null);
            void onSave({ name, workTypeId: wt || null, start, end, note }).catch(() => undefined);
          }}>Lưu</button>
          {canDelete && onDelete && <button className="secondary" disabled={busy} onClick={onDelete}>Xóa giai đoạn</button>}
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
