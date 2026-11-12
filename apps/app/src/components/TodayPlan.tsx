import { diffDays, fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { useCycleTitle } from '../lib/useCycleTitle';

/**
 * Nhắc việc hôm nay: các việc theo KẾ HOẠCH của vụ đang sản xuất mà hôm nay đang trong khoảng thời gian làm
 * (từ ngày bắt đầu đến ngày kết thúc dự kiến), cộng việc đã quá hạn mà chưa xong. Việc đã xong thì không hiện.
 * Bấm vào dòng để mở vụ đó.
 */
export function TodayPlan({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const titleOf = useCycleTitle();
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const today = todayLocal();
  const running = cycles.filter((c) => c.status === 'active' && cycleIds.has(c.id));
  const runningById = new Map(running.map((c) => [c.id, c]));
  const items = stages
    .filter((s) => s.status !== 'done' && runningById.has(s.cycle_id) && s.planned_end && (s.planned_start ?? s.planned_end) <= today)
    .map((s) => ({ s, late: diffDays(s.planned_end!.slice(0, 10), today) })) // late > 0: đã quá hạn
    .filter((x) => x.late <= 30) // việc trễ quá 30 ngày coi như bỏ dở, không nhắc mỗi ngày
    .sort((a, b) => b.late - a.late || a.s.seq - b.s.seq);
  if (running.length === 0) return null;
  return (
    <div className="card">
      <h2>Nhắc việc hôm nay ({items.length})</h2>
      {items.length === 0 && <p className="muted">Hôm nay không có việc nào theo kế hoạch.</p>}
      {items.map(({ s, late }) => {
        const c = runningById.get(s.cycle_id)!;
        return (
          <div className="note-row" key={s.id}>
            <button type="button" className="link grow" style={{ textAlign: 'left' }} onClick={() => onOpenCycle(c.id)}>
              {s.name}
              <small className="muted"> — {titleOf(c)} · {s.planned_start ? `${fmtDate(s.planned_start)} – ` : 'đến '}{fmtDate(s.planned_end!)}</small>
            </button>
            {late > 0 ? <span className="pill err">Trễ {late} ngày</span> : late === 0 ? <span className="pill warn">Hạn hôm nay</span> : <span className="pill">Đang làm</span>}
          </div>
        );
      })}
    </div>
  );
}
