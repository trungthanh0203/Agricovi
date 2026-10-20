import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { CycleCalendar } from '../components/CycleCalendar';
import { useCatalog } from '../lib/catalog';
import { cycleProgress, stageColor, stageDelayDays, STAGE_STATUS_LABEL_VI } from '../lib/cycles';
import { db } from '../lib/db';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { advanceStage, refreshCycle } from '../lib/production';
import { canManageProduction } from '../lib/roles';

export interface LogPreset { cycleId: string; workTypeId?: string | null; stageId?: string | null }

/**
 * Chi tiết một vụ: các giai đoạn theo quy trình đã chọn (kế hoạch và thực tế), tiến độ, và xem dạng lịch.
 * Người quản lý bấm Bắt đầu / Hoàn thành từng giai đoạn; mọi người ghi việc thẳng vào giai đoạn đang làm.
 */
export function CycleDetailScreen({ cycleId, onClose, onLog }: { cycleId: string; onClose: () => void; onLog: (p: LogPreset) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const cycle = useLiveQuery(() => db.cycles.get(cycleId), [cycleId]);
  const stages = useLiveQuery(() => db.stages.where('cycle_id').equals(cycleId).sortBy('seq'), [cycleId], []);
  const logs = useLiveQuery(() => db.logs.where('cycle_id').equals(cycleId).toArray(), [cycleId], []);
  const area = useLiveQuery(async () => (cycle ? db.areas.get(cycle.area_id) : undefined), [cycle?.area_id]);
  const { cropTypes } = useCatalog();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayLocal();

  // mở màn này là làm mới giai đoạn từ máy chủ (người khác có thể vừa đổi)
  useEffect(() => { if (navigator.onLine) void refreshCycle(cycleId).catch(() => undefined); }, [cycleId]);

  const prog = useMemo(() => cycleProgress(stages, today), [stages, today]);
  const logCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (!l.voided_at && l.stage_id) m.set(l.stage_id, (m.get(l.stage_id) ?? 0) + 1);
    return m;
  }, [logs]);

  if (!cycle) return <main className="auth"><button className="link" onClick={onClose}>← Quay lại</button><p className="muted">Đang tải vụ…</p></main>;

  const canManage = canManageProduction(active?.roles);
  const isActive = cycle.status === 'active';
  const crop = cropTypes.find((c) => c.id === cycle.crop_type_id)?.name ?? '—';

  async function act(stageId: string, action: 'start' | 'complete' | 'reopen') {
    setBusy(true);
    setError(null);
    try { await advanceStage(stageId, action); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <main className="auth wide">
      <button className="link" onClick={onClose}>← Quay lại</button>
      <div className="row">
        <h1 className="grow">{cycle.name || crop}</h1>
        <span className="pill">{CYCLE_STATUS_LABEL_VI[cycle.status]}</span>
      </div>
      <p className="muted">
        {cycle.name ? `${crop} · ` : ''}Khu trồng: {area?.name ?? '—'}
        {cycle.start_date && ` · Bắt đầu ${fmtDate(cycle.start_date)}`}
        {cycle.expected_end_date && ` · Dự kiến xong ${fmtDate(cycle.expected_end_date)}`}
      </p>
      <p className="muted">Quy trình: {cycle.template_name ?? 'không có (vụ cũ)'}{cycle.template_version ? ` · bản ${cycle.template_version}` : ''}</p>

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
        <p className="msg warn">Vụ này tạo trước khi có quy trình mẫu nên không có giai đoạn. Các vụ mới sẽ luôn có.</p>
      )}

      {!isActive && prog.total > 0 && <p className="muted">Chỉ vụ đang sản xuất mới bắt đầu/hoàn thành giai đoạn và ghi việc được.</p>}
      {!online && canManage && <p className="msg warn" role="status">Đang offline: đổi giai đoạn cần có mạng. Ghi việc vẫn dùng được.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {prog.total > 0 && (
        <>
          <div className="chips" role="tablist" aria-label="Cách xem">
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'chip active' : 'chip'} onClick={() => setView('list')}>Danh sách</button>
            <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'chip active' : 'chip'} onClick={() => setView('calendar')}>Lịch</button>
          </div>

          {view === 'calendar' ? (
            <CycleCalendar stages={stages} logs={logs} today={today} />
          ) : (
            <table className="grid">
              <thead><tr><th>Giai đoạn</th><th>Kế hoạch</th><th>Thực tế</th><th></th></tr></thead>
              <tbody>
                {stages.map((s, i) => {
                  const late = stageDelayDays(s, today);
                  return (
                    <tr key={s.id}>
                      <td>
                        <i className="swatch" style={{ background: stageColor(i) }} />{s.name}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {isActive && (
        <button className="secondary" onClick={() => onLog({ cycleId, stageId: prog.current?.status === 'in_progress' ? prog.current.id : null })}>Ghi việc cho vụ này</button>
      )}
    </main>
  );
}
