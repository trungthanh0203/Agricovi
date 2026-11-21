import { useKeptState } from '../lib/keptState';
import { useCatalog } from '../lib/catalog';
import { cycleKind, KIND_ORDER, KIND_STYLE, type KindKey } from '../lib/kindStyle';
import { diffDays, fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { useCycleTitle } from '../lib/useCycleTitle';

const PAGE = 15; // số dòng mỗi trang

/**
 * Nhắc việc hôm nay: các việc theo KẾ HOẠCH của vụ đang sản xuất mà hôm nay đang trong khoảng thời gian làm
 * (từ ngày bắt đầu đến ngày kết thúc dự kiến), cộng việc đã quá hạn mà chưa xong. Việc đã xong thì không hiện.
 * Bấm vào dòng để mở vụ đó. Mỗi dòng có biểu tượng và vạch màu theo loại sản phẩm (cây trồng, vật nuôi, thủy sản); khi cơ sở có từ hai loại thì có thanh chọn loại
 * (không có mục "Tất cả"; mặc định là loại của việc trễ nhất). Vẫn xếp theo số ngày trễ.
 */
export function TodayPlan({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const titleOf = useCycleTitle();
  const [page, setPage] = useKeptState('home|today.page', 0);   // giữ lại khi mở một vụ rồi Quay lại (D225)
  const [picked, setPicked] = useKeptState<KindKey | null>('home|today.kind', null);
  const { cropTypes } = useCatalog();
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const today = todayLocal();
  const running = cycles.filter((c) => c.status === 'active' && cycleIds.has(c.id));
  const runningById = new Map(running.map((c) => [c.id, c]));
  const all = stages
    .filter((s) => s.status !== 'done' && runningById.has(s.cycle_id) && s.planned_end && (s.planned_start ?? s.planned_end) <= today)
    .map((s) => ({ s, late: diffDays(s.planned_end!.slice(0, 10), today) })) // late > 0: đã quá hạn
    .filter((x) => x.late <= 15) // việc trễ quá 15 ngày coi như bỏ dở, không nhắc mỗi ngày
    .sort((a, b) => b.late - a.late || a.s.seq - b.s.seq);
  if (running.length === 0) return null;
  const kindOf = (cycleId: string) => cycleKind(runningById.get(cycleId)?.crop_type_id, cropTypes);
  const kindCount = new Map<KindKey, number>();
  for (const x of all) kindCount.set(kindOf(x.s.cycle_id), (kindCount.get(kindOf(x.s.cycle_id)) ?? 0) + 1);
  const runningKinds = new Set(running.map((c) => cycleKind(c.crop_type_id, cropTypes)));
  const kinds = KIND_ORDER.filter((k) => runningKinds.has(k));
  const multi = kinds.length >= 2;
  // loại đang chọn: lựa chọn của người dùng nếu còn hợp lệ, không thì loại của việc trễ nhất (đầu danh sách), không có việc thì loại đầu tiên
  const curKind: KindKey | null = !multi ? null : picked && kinds.includes(picked) ? picked : all[0] ? kindOf(all[0].s.cycle_id) : (kinds[0] ?? null);
  const items = curKind ? all.filter((x) => kindOf(x.s.cycle_id) === curKind) : all;
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = items.slice(cur * PAGE, (cur + 1) * PAGE);
  return (
    <div className="card">
      <h2>Nhắc việc hôm nay ({multi ? all.length : items.length})</h2>
      {multi && (
        <div className="chips" role="tablist" aria-label="Loại sản phẩm">
          {kinds.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={curKind === k} className={curKind === k ? 'chip active' : 'chip'} onClick={() => { setPicked(k); setPage(0); }}>
              {KIND_STYLE[k].icon} {KIND_STYLE[k].label} ({kindCount.get(k) ?? 0})
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && <p className="muted">Hôm nay không có việc nào theo kế hoạch.</p>}
      {shown.map(({ s, late }) => {
        const c = runningById.get(s.cycle_id)!;
        return (
          <div className={`note-row kind-row kind-${cycleKind(c.crop_type_id, cropTypes)}`} key={s.id}>
            <button type="button" className="link grow" style={{ textAlign: 'left' }} onClick={() => onOpenCycle(c.id)}>
              <span aria-hidden>{KIND_STYLE[cycleKind(c.crop_type_id, cropTypes)].icon} </span>{s.name}
              <small className="muted"> — {titleOf(c)} · {s.planned_start ? `${fmtDate(s.planned_start)} – ` : 'đến '}{fmtDate(s.planned_end!)}</small>
              <small className="kind-tag"> · {KIND_STYLE[cycleKind(c.crop_type_id, cropTypes)].label}</small>
            </button>
            {late > 0 ? <span className="pill err">Trễ {late} ngày</span> : late === 0 ? <span className="pill warn">Hạn hôm nay</span> : <span className="pill">Đang làm</span>}
          </div>
        );
      })}
      {items.length > PAGE && (
        <div className="btnrow pager">
          <button type="button" className="secondary" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Trước</button>
          <span className="muted">Trang {cur + 1}/{pages} · {items.length} việc</span>
          <button type="button" className="secondary" disabled={cur + 1 >= pages} onClick={() => setPage(cur + 1)}>Sau ›</button>
        </div>
      )}
    </div>
  );
}
