import { useState } from 'react';
import { Collapsible } from './Collapsible';
import { AreaFilter, topAreaIdOf } from './AreaFilter';
import { cycleProgress, sortByDue } from '../lib/cycles';
import { fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { useCycleTitle } from '../lib/useCycleTitle';

/** Tiến độ các vụ đang sản xuất (thanh phần trăm theo việc của quy trình mẫu), đặt ở đầu Trang chủ */
export function CycleProgressList({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const titleOf = useCycleTitle();
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const areas = useTable('areas');
  const [areaFilter, setAreaFilter] = useState('');
  const today = todayLocal();
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const running = cycles.filter((c) => c.status === 'active' && cycleIds.has(c.id));
  // vụ trễ ngày hoặc sắp đến hạn lên trước (D154)
  const progress = sortByDue(running.filter((c) => !areaFilter || topAreaIdOf(c.area_id, areaById) === areaFilter), (id) => stages.filter((s) => s.cycle_id === id))
    .map((c) => ({ c, p: cycleProgress(stages.filter((s) => s.cycle_id === c.id), today) }));
  if (running.length === 0) return null;
  return (
    <Collapsible title="Tiến độ các vụ đang chạy" summary={`${running.length} vụ${progress.some(({ p }) => p.delay > 0) ? ` · ${progress.filter(({ p }) => p.delay > 0).length} vụ trễ` : ''}`} warn={progress.some(({ p }) => p.delay > 0)}>
      <AreaFilter areas={areas} usedAreaIds={running.map((c) => c.area_id)} value={areaFilter} onChange={setAreaFilter} />
      {progress.length === 0 && <p className="muted">Không có vụ đang chạy ở phân khu này.</p>}
      {progress.map(({ c, p }) => (
        <div className="card slim" key={c.id}>
          <div className="row">
            <strong className="grow">{titleOf(c)}</strong>
            <button className="secondary mini" onClick={() => onOpenCycle(c.id)}>Quản lý vụ</button>
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
    </Collapsible>
  );
}
