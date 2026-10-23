import { cycleProgress } from '../lib/cycles';
import { fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';

/** Tiến độ các vụ đang sản xuất (thanh phần trăm theo giai đoạn của quy trình mẫu), đặt ở đầu Trang chủ */
export function CycleProgressList({ cycleIds }: { cycleIds: Set<string> }) {
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
            {p.delay > 0 ? <span className="pill warn">Trễ {p.delay} ngày</span> : <span className="pill ok">Đúng tiến độ</span>}
          </div>
          {p.total > 0 ? (
            <>
              <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${p.percent}%` }} /></div>
              <p className="muted">{p.done}/{p.total} giai đoạn{p.current ? ` · Hiện tại: ${p.current.name} (đến ${fmtDate(p.current.planned_end)})` : ' · Đã hoàn tất'}</p>
            </>
          ) : <p className="muted">Chưa có giai đoạn.</p>}
        </div>
      ))}
    </>
  );
}
