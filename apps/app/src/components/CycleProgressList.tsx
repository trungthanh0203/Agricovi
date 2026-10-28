import { cycleProgress } from '../lib/cycles';
import { fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';

/** Tiến độ các vụ đang sản xuất (thanh phần trăm theo việc của quy trình mẫu), đặt ở đầu Trang chủ */
export function CycleProgressList({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const today = todayLocal();
  const progress = cycles
    .filter((c) => c.status === 'active' && cycleIds.has(c.id))
    .map((c) => ({ c, p: cycleProgress(stages.filter((s) => s.cycle_id === c.id), today) }));
  if (progress.length === 0) return null;
  return (
    <>
      <h2 className="sect">Tiến độ các vụ đang chạy</h2>
      {progress.map(({ c, p }) => (
        <div className="card slim" key={c.id}>
          <div className="row">
            <strong className="grow">{c.name || c.template_name || 'Vụ'}</strong>
            <button className="secondary mini" onClick={() => onOpenCycle(c.id)}>Quy trình &amp; Lịch</button>
          </div>
          {p.total > 0 ? (
            <>
              <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${p.percent}%` }} /></div>
              <div className="progline">
                <span className="muted">{p.done}/{p.total} việc{p.current ? ` · Hiện tại: ${p.current.name} (đến ${fmtDate(p.current.planned_end)})` : ' · Đã hoàn tất'}</span>
                {p.delay > 0 ? <span className="pill warn">Trễ {p.delay} ngày</span> : <span className="pill ok">Đúng tiến độ</span>}
              </div>
            </>
          ) : (
            <div className="progline">
              <span className="muted">Chưa có việc.</span>
              {p.delay > 0 ? <span className="pill warn">Trễ {p.delay} ngày</span> : <span className="pill ok">Đúng tiến độ</span>}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
