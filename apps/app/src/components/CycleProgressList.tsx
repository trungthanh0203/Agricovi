import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { AreaFilter, topAreaIdOf } from './AreaFilter';
import { cycleProgress, sortByDue } from '../lib/cycles';
import { cachedCycleStats, fetchCycleStats, type CycleStats } from '../lib/cycleStats';
import { budgetTone, pctOf } from '../lib/cycleStatsLogic';
import { useOrgs } from '../lib/orgs';
import { shortMoney } from './HomeStats';
import { fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { useCycleTitle } from '../lib/useCycleTitle';

const kg = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`;

function Bar({ label, pct, text, tone }: { label: string; pct: number; text: string; tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="plan-line">
      <span>{label}: <strong>{pct}%</strong> <span className="muted">({text})</span></span>
      <div className="progress" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i style={{ width: `${Math.min(100, pct)}%`, background: `var(--c-${tone})` }} />
      </div>
    </div>
  );
}

/**
 * Tiến độ các vụ đang sản xuất (thanh phần trăm theo việc của quy trình mẫu), đặt ở Trang chủ. Mỗi vụ có thêm, nếu đã nhập kế hoạch và người xem có quyền:
 * thanh ngân sách đã dùng (cam/đỏ khi gần hoặc vượt), thanh sản lượng so với dự kiến, và lãi/lỗ tạm tính.
 */
export function CycleProgressList({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const titleOf = useCycleTitle();
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const areas = useTable('areas');
  const { active } = useOrgs();
  const [areaFilter, setAreaFilter] = useState('');
  const [stats, setStats] = useState<CycleStats | null>(null);
  useEffect(() => {
    if (!active) return;
    setStats(cachedCycleStats(active.id));
    if (!navigator.onLine) return;
    let alive = true;
    fetchCycleStats(active.id).then((s) => { if (alive) setStats(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const statById = useMemo(() => new Map((stats?.cycles ?? []).map((s) => [s.cycle_id, s])), [stats]);
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
          {(() => {
            const s = statById.get(c.id);
            if (!s) return null;
            const bp = pctOf(s.cost_total, s.budget_amount);
            const yp = pctOf(s.harvest_net, s.target_yield_kg);
            return (
              <>
                {bp !== null && s.budget_amount !== null && s.cost_total !== null && <Bar label="Ngân sách đã dùng" pct={bp} tone={budgetTone(bp)} text={`${shortMoney(s.cost_total)} / ${shortMoney(s.budget_amount)}`} />}
                {yp !== null && s.target_yield_kg !== null && s.harvest_net !== null && <Bar label="Sản lượng so với dự kiến" pct={yp} tone="ok" text={`${kg(s.harvest_net)} / ${kg(s.target_yield_kg)}`} />}
                {s.profit !== null && (
                  <p className="muted yield-line">
                    {s.profit >= 0 ? 'Lãi tạm tính' : 'Lỗ tạm tính'}: <span className={s.profit >= 0 ? 'pill ok' : 'pill err'}>{shortMoney(Math.abs(s.profit))} đ</span>
                  </p>
                )}
              </>
            );
          })()}
        </div>
      ))}
    </Collapsible>
  );
}
