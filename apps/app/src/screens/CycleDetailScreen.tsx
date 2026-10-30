import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { CycleCalendar } from '../components/CycleCalendar';
import { Collapsible } from '../components/Collapsible';
import { CycleCounts } from '../components/CycleCounts';
import { CycleGrowth } from '../components/CycleGrowth';
import { CycleMilestones } from '../components/MilestonePanels';
import { IncidentsSection } from '../components/IncidentsSection';
import { useTable } from '../lib/tables';
import { withdrawalMessage } from '../lib/withdrawalLogic';
import { cycleCode } from '../lib/qr';
import { useCatalog } from '../lib/catalog';
import { cycleProgress, stageColor, stageDelayDays, STAGE_STATUS_LABEL_VI } from '../lib/cycles';
import { db, type NoteRow, type StageRow } from '../lib/db';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useOrgs } from '../lib/orgs';
import { ModelPicker } from '../components/ModelPicker';
import { dueToday, stageLogProgress } from '../lib/dueTasks';
import { RowMenu } from '../components/RowMenu';
import { toLocalInput } from '../lib/hooks';
import type { TabId } from '../lib/tabs';
import { effectiveModel, featuresOf, modelName } from '../lib/models';
import {
  addCycleStage, addNote, advanceStage, deleteCycleStage, deleteCyclePhase, deleteNote, refreshCycle, setCycleStatus, setNoteDone, updateCyclePhase, updateCycleStage,
} from '../lib/production';
import { canManageProduction, isOwner } from '../lib/roles';
import { nurseryLoggable, predecessorOf } from '../lib/nursery';
import { areaPath } from '../lib/areas';

export interface LogPreset { cycleId: string; workTypeId?: string | null; stageId?: string | null; areaId?: string; copyFromLogId?: string }

/**
 * Chi tiết một vụ: các việc theo quy trình đã chọn (kế hoạch và thực tế), tiến độ, và xem dạng lịch.
 * Người quản lý bấm Bắt đầu / Hoàn thành, sửa/thêm/xóa việc của vụ này; mọi người ghi việc thẳng vào việc đang làm
 * và thêm ghi chú cho từng ngày ở dạng lịch (hiện nhắc ở Trang chủ).
 */
export function CycleDetailScreen({ cycleId, onClose, onLog, onGo, openQr, openCalendar, notice }: { cycleId: string; onClose: () => void; onLog: (p: LogPreset) => void; onGo?: (tab: TabId, section?: string) => void; openQr?: boolean; openCalendar?: boolean; notice?: string | null }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const online = useOnline();
  const cycle = useLiveQuery(() => db.cycles.get(cycleId), [cycleId]);
  const stages = useLiveQuery(() => db.stages.where('cycle_id').equals(cycleId).sortBy('seq'), [cycleId], []);
  const logs = useLiveQuery(() => db.logs.where('cycle_id').equals(cycleId).toArray(), [cycleId], []);
  const notes = useLiveQuery(() => db.notes.where('cycle_id').equals(cycleId).toArray(), [cycleId], []);
  const harvestsAll = useTable('harvests'); // phiếu thu hoạch của vụ (việc Thu hoạch tính cả phiếu này khi kiểm đã ghi đủ)
  const area = useLiveQuery(async () => (cycle ? db.areas.get(cycle.area_id) : undefined), [cycle?.area_id]);
  const allCycles = useTable('cycles');
  const allAreas = useTable('areas');
  const { cropTypes, workTypes } = useCatalog();
  const withdrawals = useTable('withdrawals');
  const [view, setView] = useState<'list' | 'calendar'>(openCalendar ? 'calendar' : 'list');
  const [noticeOpen, setNoticeOpen] = useState(Boolean(notice));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingPhase, setEditingPhase] = useState<string | null>(null); // tên công đoạn đang sửa
  const today = todayLocal();

  // mở màn này là làm mới việc từ máy chủ (người khác có thể vừa đổi)
  useEffect(() => { if (navigator.onLine) void refreshCycle(cycleId).catch(() => undefined); }, [cycleId]);

  const prog = useMemo(() => cycleProgress(stages, today), [stages, today]);
  const logCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (!l.voided_at && l.stage_id) m.set(l.stage_id, (m.get(l.stage_id) ?? 0) + 1);
    return m;
  }, [logs]);

  if (!cycle) return <div className="auth"><button className="link" onClick={onClose}>← Quay lại</button><p className="muted">Đang tải vụ…</p></div>;

  const canManage = canManageProduction(active?.roles) || Boolean(active?.canManageStages);
  // vụ có ghi việc hay không theo mô hình của CHÍNH vụ này (mô hình 1 chưa bật tùy chọn Ghi việc thì ẩn)
  const canLogHere = featuresOf(effectiveModel(cycle.mgmt_model, active?.mgmtModel), cycle.mgmt_options ?? []).logs !== 'off';
  const isActive = cycle.status === 'active';
  const nurseryLog = nurseryLoggable(cycle); // vụ Chuẩn bị đang ươm gối: ghi việc được (D124)
  const logOk = isActive || nurseryLog;
  const pre = predecessorOf(cycle, allCycles);
  const closed = cycle.status === 'ended' || cycle.status === 'cancelled';
  const canEditStages = canManage && !closed;
  const crop = cropTypes.find((c) => c.id === cycle.crop_type_id)?.name ?? '—';

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }
  const harvestCount = harvestsAll.filter((h) => h.cycle_id === cycleId && !h.voided_at).length;
  const progressOf = (s: StageRow) => stageLogProgress(s, logs, harvestCount, /^harvesting/.test(workTypes.find((w) => w.id === s.work_type_id)?.code ?? ''), today, (iso) => toLocalInput(new Date(iso)).slice(0, 10));
  const act = (stageId: string, action: 'start' | 'complete' | 'reopen'): Promise<void> => {
    if (action === 'complete') {
      // Xong chỉ khi đã Ghi việc đủ (máy chủ cũng kiểm lại)
      const st = stages.find((x) => x.id === stageId);
      const p = st ? progressOf(st) : null;
      if (st && p && p.logged < p.expected) {
        // chủ cơ sở có lối thoát: bấm Xong kèm lý do (máy chủ lưu lý do, người bấm, thời điểm)
        if (isOwner(active?.roles)) {
          const why = window.prompt(`Việc "${st.name}" mới ghi ${p.logged}/${p.expected} lần.\n\nChủ cơ sở có thể bấm Xong kèm lý do (ít nhất 3 ký tự), lý do được lưu lại. Bấm Hủy để quay lại ghi việc.`);
          if (why && why.trim().length >= 3) return run(() => advanceStage(stageId, action, undefined, why.trim())).catch(() => undefined);
          if (why !== null) setError('Lý do cần ít nhất 3 ký tự.');
          return Promise.resolve();
        }
        setError(`Việc "${st.name}" cần Ghi việc đủ ${p.expected} lần mới bấm Xong được (hiện đã ghi ${p.logged} lần). Hãy bấm Ghi việc để ghi phần còn thiếu rồi bấm Xong lại. Nếu không thể ghi bù, nhờ chủ cơ sở bấm Xong kèm lý do.`);
        return Promise.resolve();
      }
    }
    return run(() => advanceStage(stageId, action)).catch(() => undefined);
  };
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
        {cycle.name ? `${crop} · ` : ''}Khu: {areaPath(cycle.area_id, allAreas) || area?.name || '—'}
        {cycle.start_date && ` · Bắt đầu ${fmtDate(cycle.start_date)}`}
        {cycle.expected_end_date && ` · Dự kiến xong ${fmtDate(cycle.expected_end_date)}`}
      </p>
      <p className="muted">Mã vụ: <strong>{cycleCode(cycleId)}</strong></p>
      {pre && cycle.status === 'preparing' && (
        pre.ended
          ? (
            <div className="msg ok" role="status">
              <p style={{ margin: 0 }}>Vụ trước ({pre.pred.name || crop}) đã kết thúc. Có thể chuyển vụ này sang sản xuất.</p>
              {canManage && <button className="primary" disabled={busy || !online} onClick={() => void run(() => setCycleStatus(cycleId, 'active'))}>Bắt đầu sản xuất</button>}
            </div>
          )
          : <p className="msg warn" role="status">Nối tiếp sau vụ {pre.pred.name || crop} (đang {CYCLE_STATUS_LABEL_VI[pre.pred.status].toLowerCase()}). Khi vụ đó kết thúc, bạn sẽ chuyển vụ này sang sản xuất.</p>
      )}
      <p className="muted">Quy trình: {cycle.template_name ?? 'không có (vụ cũ)'}{cycle.template_version ? ` · bản ${cycle.template_version}` : ''}</p>
      {cycle.note && <p>{cycle.note}</p>}
      {canManage && cycle.owner_org_id === active?.id && (
        <Collapsible title="Cách quản lý vụ này" summary={modelName(cycle.mgmt_model, active?.mgmtModel)}>
          <ModelPicker cycleId={cycleId} onDone={() => undefined} />
        </Collapsible>
      )}

      {(() => {
        const w = withdrawals.find((x) => x.cycle_id === cycleId);
        if (!w) return null;
        const msg = withdrawalMessage(w.items, today);
        return msg
          ? <p className="msg warn" role="status">{msg}</p>
          : <p className="muted">Thuốc/phân đã dùng đều đã hết thời gian cách ly (mới nhất {w.safe_date.split('-').reverse().join('/')}).</p>;
      })()}

      {cycle && <CycleMilestones cycle={cycle} canManage={canManage} canMark={Boolean(session)} />}

      {active && <CycleCounts cycleId={cycleId} canManage={canManage} userId={session?.user.id} online={online} today={today} />}

      {active && !active.simple && <CycleGrowth cycleId={cycleId} />}

      {active && <IncidentsSection cycleId={cycleId} orgId={active.id} stages={stages} canManage={canManage} userId={session?.user.id} online={online} today={today} />}

      {logOk && (() => {
        const todayLogs = logs.filter((l) => !l.voided_at && toLocalInput(new Date(l.performed_at)).slice(0, 10) === today);
        const due = dueToday(stages, todayLogs, today, logs.filter((l) => !l.voided_at));
        if (due.length === 0) return null;
        return (
          <div className="card slim">
            <strong>Việc đến hạn hôm nay ({due.filter((d) => !d.doneToday).length}/{due.length} chưa ghi)</strong>
            {due.map(({ stage: s, doneToday }) => (
              <div className="row" key={s.id}>
                <span className="grow">
                  {s.phase_name ? `${s.phase_name} › ` : ''}{s.name}{' '}
                  <span className="sub">{s.repeat_every_days ? `Lặp mỗi ${s.repeat_every_days} ngày · ` : ''}{s.importance === 'high' ? 'Quan trọng · ' : ''}{s.note ?? ''}</span>{' '}
                  {s.guide && <span className="sub">Hướng dẫn: {s.guide}</span>}{' '}
                  {(s.materials ?? []).length > 0 && <span className="sub">Vật tư: {(s.materials ?? []).map((m) => `${m.name}${m.amount ? ` (${m.amount})` : ''}`).join('; ')}</span>}
                </span>
                {doneToday ? <span className="pill ok">Đã ghi</span>
                  : canLogHere && <button className="secondary" style={{ minHeight: 40, width: 'auto', margin: 0, padding: '0 10px' }} onClick={() => onLog({ cycleId, workTypeId: s.work_type_id, stageId: s.id })}>Ghi việc</button>}
              </div>
            ))}
          </div>
        );
      })()}

      {prog.total > 0 ? (
        <div className="card slim">
          <div className="row">
            <strong>Tiến độ: {prog.done}/{prog.total} việc</strong>
            <span className="grow" />
            {prog.delay > 0 ? <span className="pill warn">Trễ {prog.delay} ngày</span> : prog.current ? <span className="pill ok">Đúng tiến độ</span> : <span className="pill ok">Hoàn tất</span>}
          </div>
          <div className="progress" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${prog.percent}%` }} /></div>
          {prog.current && <p className="muted">Hiện tại: <strong>{prog.current.name}</strong> ({STAGE_STATUS_LABEL_VI[prog.current.status].toLowerCase()}, kế hoạch {fmtDate(prog.current.planned_start)} – {fmtDate(prog.current.planned_end)})</p>}
        </div>
      ) : (
        <p className="msg warn">Vụ này chưa có việc nào.{canEditStages ? ' Bấm "+ Thêm việc" bên dưới để thêm.' : ''}</p>
      )}

      {nurseryLog && <p className="msg ok" role="status">Vụ đang ươm gối: ghi việc ươm được. Bấm Bắt đầu / Xong từng việc sau khi chuyển sang sản xuất.</p>}
      {!logOk && prog.total > 0 && !closed && <p className="muted">Chỉ vụ đang sản xuất mới bắt đầu/hoàn thành việc và ghi việc được.</p>}
      {!online && canManage && <p className="msg warn" role="status">Đang offline: đổi việc và ghi chú cần có mạng. Ghi việc vẫn dùng được.</p>}
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
            <thead><tr><th>Việc</th><th>Kế hoạch</th><th>Thực tế</th><th></th></tr></thead>
            <tbody>
              {stages.length === 0 && <tr><td colSpan={4} className="muted">Chưa có việc nào.</td></tr>}
              {stages.map((s, i) => {
                const late = stageDelayDays(s, today);
                const newPhase = s.phase_name && s.phase_name !== stages[i - 1]?.phase_name; // quy trình có việc: tiêu đề nhóm
                return (
                  <Fragment key={s.id}>
                  {newPhase && (
                    <tr className="phase-row">
                      <td colSpan={3}><strong>{s.phase_code ? `${s.phase_code}. ` : ''}{s.phase_name}</strong></td>
                      <td className="act">
                        {canEditStages && (
                          <RowMenu label={`Công đoạn ${s.phase_name}`} items={[
                            { label: 'Sửa công đoạn', icon: '✎', disabled: !online, onClick: () => { setEditing(null); setAdding(false); setEditingPhase(s.phase_name!); } },
                            { label: 'Xóa công đoạn (giữ các việc)', icon: '🗑', danger: true, disabled: !online, onClick: () => {
                              if (window.confirm(`Xóa công đoạn "${s.phase_name}"? Các việc bên trong được giữ lại, chỉ bỏ khỏi công đoạn.`)) void run(() => deleteCyclePhase(cycleId, s.phase_name!, false)).catch(() => undefined);
                            } },
                            { label: 'Xóa công đoạn và các việc', icon: '🗑', danger: true, disabled: !online, onClick: () => {
                              if (window.confirm(`Xóa công đoạn "${s.phase_name}" cùng toàn bộ việc bên trong? Chỉ làm được khi mọi việc chưa bắt đầu và chưa có nhật ký.`)) void run(() => deleteCyclePhase(cycleId, s.phase_name!, true)).catch(() => undefined);
                            } },
                          ]} />
                        )}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>
                      <i className="swatch" style={{ background: stageColor(i) }} />{s.name}{s.duration_days ? ` (${s.duration_days} ngày)` : ''}
                      {s.note && <span className="sub">{s.note}</span>}
                      <span className="sub">
                        {s.importance === 'high' ? 'Quan trọng · ' : ''}{s.repeat_every_days ? `Lặp mỗi ${s.repeat_every_days} ngày · ` : ''}{STAGE_STATUS_LABEL_VI[s.status]}{late > 0 && s.status !== 'pending' ? ` · trễ ${late} ngày` : ''}
                        {late > 0 && s.status === 'pending' ? ` · chưa bắt đầu, trễ ${late} ngày` : ''}
                        {s.work_type_id && s.status !== 'pending' ? ` · Đã ghi ${progressOf(s).logged}/${progressOf(s).expected} lần` : logCount.get(s.id) ? ` · ${logCount.get(s.id)} việc đã ghi` : ''}{s.log_waived_reason ? ` · Xong khi chưa ghi đủ, lý do: ${s.log_waived_reason}` : ''}
                      </span>
                    </td>
                    <td>{fmtDate(s.planned_start)}<span className="sub">→ {fmtDate(s.planned_end)}</span></td>
                    <td>{s.actual_start ? fmtDate(s.actual_start) : '—'}<span className="sub">{s.actual_end ? `→ ${fmtDate(s.actual_end)}` : ''}</span></td>
                    <td className="act"><div className="stack">
                      {canLogHere && ((isActive && s.status === 'in_progress') || (nurseryLog && s.status !== 'done')) && (
                        <button className="secondary" style={{ minHeight: 40, width: '100%', margin: 0, padding: '0 8px' }}
                          onClick={() => onLog({ cycleId, workTypeId: s.work_type_id, stageId: s.id })}>Ghi việc</button>
                      )}
                      {canManage && isActive && (
                        <>
                          {s.status === 'pending' && <button className="primary" style={{ minHeight: 40, width: '100%', margin: 0, padding: '0 8px' }} disabled={busy || !online} onClick={() => void act(s.id, 'start')}>Bắt đầu</button>}
                          {s.status === 'in_progress' && <button className="primary" style={{ minHeight: 40, width: '100%', margin: 0, padding: '0 8px' }} disabled={busy || !online} onClick={() => void act(s.id, 'complete')}>Xong</button>}
                        </>
                      )}
                      <span className="iconline">
                        {canManage && isActive && s.status === 'done' && (
                          <button className="icon" disabled={busy || !online} aria-label={`Mở lại ${s.name}`} title="Mở lại" onClick={() => void act(s.id, 'reopen')}>↺</button>
                        )}
                        {canEditStages && (
                          <>
                            <button className="icon" disabled={!online} aria-label={`Sửa việc ${s.name}`} title="Chỉnh sửa" onClick={() => { setAdding(false); setEditingPhase(null); setEditing(editing === s.id ? null : s.id); }}>✎</button>
                            <button className="icon" disabled={busy || !online || s.status !== 'pending'} aria-label={`Xóa việc ${s.name}`} title={s.status !== 'pending' ? 'Chỉ xóa được việc chưa làm' : 'Xóa việc'}
                              onClick={() => { if (window.confirm(`Xóa việc "${s.name}" khỏi vụ?`)) void run(() => deleteCycleStage(cycleId, s.id)).catch(() => undefined); }}>🗑</button>
                          </>
                        )}
                      </span>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {editingPhase && stages.some((x) => x.phase_name === editingPhase) && (
            <PhaseEditForm
              key={editingPhase} name={editingPhase} code={stages.find((x) => x.phase_name === editingPhase)?.phase_code ?? ''} busy={busy || !online}
              onClose={() => setEditingPhase(null)}
              onSave={(code, name) => run(async () => { await updateCyclePhase(cycleId, editingPhase, code, name); setEditingPhase(null); })}
            />
          )}

          {editing && stages.find((s) => s.id === editing) && (
            <StageForm
              key={editing} title="Sửa việc" stage={stages.find((s) => s.id === editing)!} busy={busy || !online}
              phases={[...new Map(stages.filter((x) => x.phase_name).map((x) => [x.phase_name!, x.phase_code ?? ''])).entries()].map(([name, code]) => ({ name, code }))}
              workTypes={workTypes.filter((w) => w.is_active || w.id === stages.find((s) => s.id === editing)!.work_type_id)}
              canDelete={stages.find((s) => s.id === editing)!.status === 'pending'}
              onClose={() => setEditing(null)}
              onSave={(v) => run(async () => {
                await updateCycleStage(cycleId, editing, { name: v.name, work_type_id: v.workTypeId, planned_start: v.start, planned_end: v.end, note: v.note, ...(v.phase !== undefined ? { phase_name: v.phase.name, phase_code: v.phase.code } : {}) });
                setEditing(null);
              })}
              onDelete={() => {
                if (!window.confirm('Xóa việc này khỏi vụ?')) return;
                void run(async () => { await deleteCycleStage(cycleId, editing); setEditing(null); }).catch(() => undefined);
              }}
            />
          )}

          {canEditStages && !adding && !editing && (
            <button className="secondary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm việc</button>
          )}
          {canEditStages && adding && (
            <StageForm
              title="Thêm việc vào cuối quy trình của vụ" busy={busy || !online} workTypes={workTypes.filter((w) => w.is_active)}
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

      {logOk && canLogHere && (
        <button className="secondary" onClick={() => onLog({ cycleId, stageId: prog.current?.status === 'in_progress' ? prog.current.id : null })}>Ghi việc cho vụ này</button>
      )}
    </div>
  );
}

/** Biểu mẫu thêm/sửa một việc của vụ: việc (từ danh mục), tên, ngày kế hoạch, ghi chú */
function StageForm({ title, stage, defaults, workTypes, busy, canDelete, phases, onSave, onDelete, onClose }: {
  title: string;
  stage?: StageRow;
  defaults?: { start: string; end: string };
  workTypes: { id: string; name: string }[];
  busy: boolean;
  canDelete?: boolean;
  phases?: { name: string; code: string }[];
  onSave: (v: { name: string; workTypeId: string | null; start: string; end: string; note: string; phase?: { name: string; code: string } }) => Promise<unknown>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [wt, setWt] = useState(stage?.work_type_id ?? '');
  const [name, setName] = useState(stage?.name ?? '');
  const [start, setStart] = useState(stage?.planned_start ?? defaults?.start ?? '');
  const [end, setEnd] = useState(stage?.planned_end ?? defaults?.end ?? '');
  const [note, setNote] = useState(stage?.note ?? '');
  const [phaseName, setPhaseName] = useState(stage?.phase_name ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Việc
          <select value={wt} onChange={(e) => { setWt(e.target.value); if (!name.trim() || workTypes.some((w) => w.name === name)) setName(workTypes.find((w) => w.id === e.target.value)?.name ?? name); }}>
            <option value="">— Không chọn —</option>
            {workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label>Tên việc<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <div className="pair">
          <label>Từ ngày<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        {phases && phases.length > 0 && (
          <label>Công đoạn
            <select value={phaseName} onChange={(e) => setPhaseName(e.target.value)}>
              <option value="">— Chưa xếp công đoạn —</option>
              {phases.map((p) => <option key={p.name} value={p.name}>{p.code ? `${p.code}. ` : ''}{p.name}</option>)}
            </select>
          </label>
        )}
        <label>Ghi chú / mô tả<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên việc hoặc chọn việc.');
            if (!start || !end) return setErr('Hãy chọn ngày bắt đầu và kết thúc.');
            if (end < start) return setErr('Ngày kết thúc không thể trước ngày bắt đầu.');
            setErr(null);
            const ph = phases && phases.length > 0 && phaseName !== (stage?.phase_name ?? '') ? { name: phaseName, code: phases.find((p) => p.name === phaseName)?.code ?? '' } : undefined;
            void onSave({ name, workTypeId: wt || null, start, end, note, ...(ph ? { phase: ph } : {}) }).catch(() => undefined);
          }}>Lưu</button>
          {canDelete && onDelete && <button className="secondary" disabled={busy} onClick={onDelete}>Xóa việc</button>}
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/** Sửa số thứ tự (mã) và tên một công đoạn của vụ (áp cho mọi việc trong công đoạn) */
function PhaseEditForm({ name, code, busy, onSave, onClose }: { name: string; code: string; busy: boolean; onSave: (code: string, name: string) => Promise<unknown>; onClose: () => void }) {
  const [c, setC] = useState(code);
  const [n, setN] = useState(name);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>Sửa công đoạn</h2>
      <div className="inline-form">
        <label>Số thứ tự (mã)<input value={c} maxLength={20} onChange={(e) => setC(e.target.value)} /></label>
        <label>Tên công đoạn<input value={n} maxLength={120} onChange={(e) => setN(e.target.value)} /></label>
        <small className="muted">Chỉ đổi vụ này, không đổi quy trình mẫu.</small>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => { if (n.trim().length < 1) return setErr('Hãy nhập tên công đoạn.'); setErr(null); void onSave(c, n).catch(() => undefined); }}>Lưu thay đổi</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
