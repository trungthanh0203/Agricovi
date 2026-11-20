import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { shortMoney } from './HomeStats';
import { fetchAbsences } from '../lib/absences';
import { areaPath } from '../lib/areas';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { fetchMemberAreas } from '../lib/members';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import {
  addPayAdjustment, cachedDetail, cachedOverview, deletePayAdjustment, fetchPayDetail, fetchPayOverview, fetchSettleState, settleMonth, updatePayAdjustment, type SettleState,
} from '../lib/payBook';
import { useTable } from '../lib/tables';
import type { TabId } from '../lib/tabs';
import { loadTeams } from '../lib/teams';
import { PaySettleBar } from './PaySettleBar';
import {
  buildPayBookCsv, buildPayslipText, groupByTeam, hoursText, PAY_STATUS_LABEL, personState, rangeOf, sumRows,
  type PayDetail, type PayItem, type PayOverview, type PayRow,
} from '../lib/payBookLogic';
import { checkRange, isFullMonth, prevRangeOf, workerInArea, workersForArea, type WorkerInfo } from '../lib/payFilter';
import {
  calendarCells, compareWithPrev, filterCounts, filterRows, rowStatus, singleRate, sortRows, SORT_LABEL, statement,
  type DayState, type RowFilter, type SortKey,
} from '../lib/payView';
import { downloadCsv } from '../lib/summary';
import { ADJ_KIND_LABEL, fmtVnd } from '../lib/work';

const PayCharts = lazy(() => import('./PayCharts')); // biểu đồ tải lười

const FILTERS: { id: RowFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'todo', label: 'Cần xử lý' }, { id: 'open', label: 'Chưa chốt' }, { id: 'locked', label: 'Đã chốt' },
];
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '…');
const stamp = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const pillOf = (s: PayItem['status']) => (s === 'locked' ? 'pill ok' : s === 'estimate' || s === 'calculated' || s === 'pending' || s === 'open' ? 'pill warn' : 'pill err');
const money = (n: number) => fmtVnd(Math.round(n));

type MiniTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
/** Số liệu tổng hợp thu nhỏ: nhãn nhỏ, số vừa, nhiều ô trên một hàng (không tốn diện tích như ô số lớn) */
function MiniStat({ label, value, tone = 'neutral', title }: { label: string; value: string; tone?: MiniTone; title?: string }) {
  return <div className={`mini-kpi ${tone}`} title={title}><span>{label}</span><strong>{value}</strong></div>;
}

interface Applied { area: string; worker: string; from: string; to: string; month: boolean; whole: boolean }

/**
 * Bảng lương (D87; phiếu lương và bảng tổng hợp D207; bộ lọc D208). Chọn Phân khu, Nhân viên, Từ ngày, Đến ngày rồi bấm "Tính lương": kết quả CHỈ hiện sau khi bấm.
 * Khi kỳ là đúng một tháng, lọc Tất cả và người dùng có quyền sửa Tiền công, bấm Tính lương cũng tính và lưu bảng lương tháng (như nút cũ "Tính lương tháng này").
 * Chọn một nhân viên thì ra phiếu lương của người đó; Tất cả thì ra bảng tổng hợp, bấm một dòng để mở phiếu. Số "ước tính" theo đơn giá hiện hành, đổi được tới khi chủ khóa kỳ.
 */
export function PayrollBook({ onGo }: { onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const today = todayLocal();
  const areasAll = useTable('areas').filter((x) => x.organization_id === orgId);
  const wantsAll = Boolean(active && canPerm(active.perms, 'payroll', 'view'));   // có quyền xem mọi người thì hiện bộ lọc Phân khu, Nhân viên
  // bộ lọc đang chọn ('' = chưa chọn, coi như Tất cả)
  const [areaSel, setAreaSel] = useState('');
  const [workerSel, setWorkerSel] = useState('');
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [people, setPeople] = useState<WorkerInfo[]>([]);
  const [teamArea, setTeamArea] = useState<Map<string, string | null>>(new Map());
  const [memberAreas, setMemberAreas] = useState<Record<string, string[] | null>>({});
  // kết quả đã tính
  const [applied, setApplied] = useState<Applied | null>(null);
  const [ov, setOv] = useState<PayOverview | null>(null);
  const [prev, setPrev] = useState<Map<string, number> | null>(null);
  const [settle, setSettle] = useState<SettleState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [listMode, setListMode] = useState<'list' | 'team'>('list');
  const [pq, setPq] = useState('');
  const [pn, setPn] = useState(50);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showCols, setShowCols] = useState(false);

  // người, tổ, phân khu được giao: để lọc theo phân khu và liệt kê nhân viên theo phân khu đã chọn
  useEffect(() => {
    if (!orgId || !wantsAll || !navigator.onLine) return;
    let alive = true;
    void loadTeams(orgId).then((t) => {
      if (!alive) return;
      const teamOf = new Map(t.members.map((m) => [m.worker_id, m.team_id]));
      setPeople(t.workers.map((w) => ({ id: w.id, name: w.full_name, userId: w.user_id, teamId: teamOf.get(w.id) ?? null, status: w.status })));
      setTeamArea(new Map(t.teams.map((x) => [x.id, x.area_id ?? null])));
    }).catch(() => undefined);
    void fetchMemberAreas(orgId).then((m) => { if (alive) setMemberAreas(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, wantsAll, online]);

  const areaOptions = useMemo(() => areasAll.filter((x) => !x.parent_id).sort((x, y) => areaPath(x.id, areasAll).localeCompare(areaPath(y.id, areasAll), 'vi')), [areasAll]);
  const needArea = wantsAll && areaOptions.length > 0;   // cơ sở chưa có phân khu nào thì không lọc theo phân khu
  const workerOptions = useMemo(() => workersForArea(people, areaSel === '' ? 'all' : areaSel, areasAll, memberAreas, teamArea), [people, areaSel, areasAll, memberAreas, teamArea]);

  function chooseArea(v: string) {
    setAreaSel(v);
    if (workerSel && workerSel !== 'all' && !workersForArea(people, v === '' ? 'all' : v, areasAll, memberAreas, teamArea).some((w) => w.id === workerSel)) setWorkerSel('');
  }

  /** Lấy kết quả theo bộ lọc `a`. persist = true: nếu là đúng một tháng, lọc Tất cả và có quyền sửa thì tính và lưu bảng lương tháng trước khi hiện */
  const compute = useCallback(async (a: Applied, persist: boolean) => {
    if (!orgId) return;
    setBusy(true); setError(null); setInfo(null);
    const cached = cachedOverview(orgId, a.from, a.to, null);
    try {
      if (!navigator.onLine) {
        if (!cached) throw new Error('OFFLINE: Tính lương cần có mạng. Hãy kết nối mạng rồi thử lại.');
        setOv(cached); setFromCache(true); setSettle(null); setPrev(null); setApplied(a); setOpenId(null);
        return;
      }
      let st: SettleState | null = null;
      if (a.month && wantsAll) {
        st = await fetchSettleState(orgId, a.from).catch(() => null);
        if (persist && a.whole && st && st.can_edit && st.status !== 'locked' && !st.overlap_legacy) {
          const r = await settleMonth(orgId, a.from);
          setInfo(`Đã tính ${r.lines} dòng cho ${r.workers} người, tổng ${fmtVnd(r.total)}.`);
          st = await fetchSettleState(orgId, a.from).catch(() => st);
        }
      }
      const pr = prevRangeOf(a.from, a.to);
      const [o, po] = await Promise.all([fetchPayOverview(orgId, a.from, a.to, null), fetchPayOverview(orgId, pr.from, pr.to, null).catch(() => null)]);
      setOv(o); setFromCache(false); setSettle(st); setPrev(po ? new Map(po.workers.map((w) => [w.worker_id, w.net])) : null);
      setApplied(a); setOpenId(null); setPn(50);
    } catch (e) {
      setError(friendlyError(e));
      if (cached) { setOv(cached); setFromCache(true); setApplied(a); }
    } finally { setBusy(false); }
  }, [orgId, wantsAll]);

  function calculate() {
    const bad = checkRange(from, to, today);
    if (bad) { setError(bad); return; }
    if (needArea && areaSel === '') { setError('Hãy chọn phân khu.'); return; }
    if (wantsAll && workerSel === '') { setError('Hãy chọn nhân viên (hoặc chọn Tất cả).'); return; }
    const area = areaSel === '' ? 'all' : areaSel;
    const worker = workerSel === '' ? 'all' : workerSel;
    void compute({ area, worker, from, to, month: isFullMonth(from, to), whole: worker === 'all' }, true);
  }
  const refreshAll = () => { if (applied) void compute(applied, false); };

  // phiếu lương của một người: chi tiết từng ngày
  const canSeeAll = ov?.can_see_all ?? false;
  const allRows = ov?.workers ?? [];
  const inFilter = (r: PayRow) => {
    if (!applied) return false;
    if (applied.worker !== 'all' && r.worker_id !== applied.worker) return false;
    if (applied.area === 'all') return true;
    const info = people.find((x) => x.id === r.worker_id);
    return info ? workerInArea(info, applied.area, areasAll, memberAreas, teamArea) : false;
  };
  const rows = !applied ? [] : canSeeAll ? allRows.filter(inFilter) : allRows;
  const targetId = !applied ? null : !canSeeAll ? (allRows[0]?.worker_id ?? null) : applied.worker !== 'all' ? applied.worker : openId;
  const person = rows.find((r) => r.worker_id === targetId) ?? null;
  useEffect(() => {
    setDetail(null);
    if (!orgId || !applied || !targetId) return;
    const cached = cachedDetail(orgId, targetId, applied.from, applied.to);
    if (!navigator.onLine) { if (cached) setDetail(cached); return; }
    let alive = true;
    fetchPayDetail(orgId, targetId, applied.from, applied.to).then((d) => { if (alive) setDetail(d); }).catch((e) => { if (alive) { setError(friendlyError(e)); if (cached) setDetail(cached); } });
    return () => { alive = false; };
  }, [orgId, applied, targetId, ov]);

  if (!active) return null;
  const stale = applied !== null && (applied.from !== from || applied.to !== to || applied.area !== (areaSel === '' ? 'all' : areaSel) || applied.worker !== (workerSel === '' ? 'all' : workerSel));
  const periodLabel = applied ? (applied.month ? rangeOf('month', applied.from).label : `${fmtDate(applied.from)} – ${fmtDate(applied.to)}`) : '';
  const range = applied ? { from: applied.from, to: applied.to } : { from, to };

  const filterCard = (
    <div className="card pay-filter">
      {wantsAll && (
        <>
          {needArea && (
            <label>Phân khu
              <select value={areaSel} onChange={(e) => chooseArea(e.target.value)}>
                <option value="" disabled>Chọn phân khu</option>
                {areaOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          {(!needArea || areaSel !== '') && <label>Nhân viên
            <select value={workerSel} onChange={(e) => setWorkerSel(e.target.value)}>
              <option value="" disabled>Chọn nhân viên</option>
              <option value="all">Tất cả</option>
              {workerOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>}
        </>
      )}
      <div className="pair">
        <label>Từ ngày<input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến ngày<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <button type="button" className="primary" disabled={busy || !online} onClick={calculate}>{busy ? 'Đang tính…' : 'Tính lương'}</button>
      {wantsAll && <p className="muted mini-note">Phân khu lọc theo nơi nhân viên được phân công (Nhân sự → phân khu làm việc, hoặc phân khu của tổ).</p>}
      {!online && <p className="muted">Đang offline: hiện bản đã tính lần trước (nếu có).</p>}
      {fromCache && online && <p className="muted">Chưa tải được bản mới, đang hiện bản đã lưu.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {info && <p className="msg ok" role="status">{info}</p>}
    </div>
  );

  if (!applied) {
    return (
      <>
        {filterCard}
        <p className="muted">Chọn bộ lọc rồi bấm Tính lương để xem bảng lương.</p>
      </>
    );
  }
  const stalePart = stale && <p className="msg warn" role="status">Bộ lọc đã đổi. Bấm Tính lương để cập nhật kết quả.</p>;
  const settleBar = settle && applied.month && applied.whole && canSeeAll
    ? <PaySettleBar orgId={orgId} state={settle} onChanged={refreshAll} onGo={onGo} hideCalc /> : null;
  const adjust = settle && applied.month && settle.can_edit && settle.status !== 'locked' && !settle.overlap_legacy ? { orgId, month: applied.from, onChanged: refreshAll } : null;

  // ---------------------------------------------------------------- một người: phiếu lương
  if (targetId) {
    return (
      <>
        {filterCard}
        {stalePart}
        {settleBar}
        {canSeeAll && openId && applied.worker === 'all' && <button className="link" onClick={() => setOpenId(null)}>‹ Quay lại danh sách</button>}
        {!person && <p className="muted">{busy ? 'Đang tính…' : 'Không có số liệu của người này trong khoảng ngày đã chọn.'}</p>}
        {person && <PersonView orgId={orgId} row={person} prevNet={prev?.get(person.worker_id) ?? null} detail={detail} range={range} orgName={active.name} label={periodLabel} adjust={adjust} />}
        {person && <Suspense fallback={null}><PayCharts items={detail?.items ?? null} from={range.from} to={range.to} /></Suspense>}
      </>
    );
  }

  // ---------------------------------------------------------------- nhiều người: bảng tổng hợp
  const csv = () => downloadCsv(`bang-luong-${range.from}_${range.to}.csv`, buildPayBookCsv(rows, range));
  const counts = filterCounts(rows);
  const pneedle = pq.trim().toLowerCase();
  const filtered = filterRows(rows, filter);
  const found = pneedle ? filtered.filter((r) => r.name.toLowerCase().includes(pneedle)) : filtered;
  const sorted = sortRows(found, sortKey);
  const pageRows = sorted.slice(0, pn);
  const all = sumRows(rows);
  const shownTotal = sumRows(sorted);
  const openRow = (id: string) => { setOpenId(id); };
  return (
    <>
      {filterCard}
      {stalePart}
      {settleBar}
      {rows.length === 0 && <p className="muted">{busy ? 'Đang tính…' : 'Không có người nào trong bộ lọc này.'}</p>}
      {rows.length > 0 && (
        <>
          <p className="muted mini-note">{periodLabel} · {rows.length} người</p>
          <div className="mini-kpis">
            <MiniStat label="Thực nhận" value={shortMoney(all.net)} tone="info" title={fmtVnd(all.net)} />
            <MiniStat label="Giờ công" value={hoursText(all.hours)} title={`${rows.length} người`} />
            <MiniStat label="Lương và công" value={shortMoney(all.hourly + all.salary + all.piece)} title={fmtVnd(all.hourly + all.salary + all.piece)} />
            <MiniStat label="Thưởng−phạt−ứng" value={shortMoney(all.bonus - all.deduction - all.advance)} tone={all.bonus - all.deduction - all.advance < 0 ? 'warn' : 'ok'} title="Thưởng trừ phạt trừ tạm ứng" />
          </div>
          <div className="chips" role="tablist" aria-label="Cách xem">
            <button role="tab" aria-selected={listMode === 'list'} className={listMode === 'list' ? 'chip active' : 'chip'} onClick={() => setListMode('list')}>Danh sách</button>
            <button role="tab" aria-selected={listMode === 'team'} className={listMode === 'team' ? 'chip active' : 'chip'} onClick={() => setListMode('team')}>Theo phòng / tổ</button>
          </div>
          <div className="chips" role="tablist" aria-label="Lọc danh sách">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'chip active' : 'chip'} onClick={() => { setFilter(f.id); setPn(50); }}>{f.label} ({counts[f.id]})</button>
            ))}
          </div>
          <div className="filters pay-tools">
            {rows.length > 8 && <label>Tìm người<input type="search" value={pq} placeholder="Tên" onChange={(e) => { setPq(e.target.value); setPn(50); }} /></label>}
            <label>Sắp xếp
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      {filter === 'todo' && sorted.length === 0 && rows.length > 0 && <p className="msg ok" role="status">Không có ai cần xử lý.</p>}
      {pneedle && sorted.length === 0 && <p className="muted">Không tìm thấy ai.</p>}
      {rows.length > 0 && sorted.length > 0 && (listMode === 'team' ? groupByTeam(sorted).map((g) => (
        <Collapsible key={g.team} title={g.team} summary={`${g.rows.length} người · ${hoursText(g.total.hours)} · ${fmtVnd(g.total.net)}`} defaultOpen>
          <PayTable rows={g.rows} showCols={showCols} onOpen={openRow} total={sumRows(g.rows, `Tổng ${g.team}`)} />
        </Collapsible>
      )) : (
        <>
          <PayTable rows={pageRows} showCols={showCols} onOpen={openRow} total={shownTotal} totalCount={sorted.length} />
          {sorted.length > pn && <div className="btnrow"><button type="button" className="secondary" onClick={() => setPn((x) => x + 50)}>Xem thêm ({sorted.length - pn} người nữa)</button></div>}
        </>
      ))}
      {rows.length > 0 && (
        <>
          <p className="muted mini-note"><span className="pay-dot locked" /> Đã chốt {shortMoney(shownTotal.net_locked)} · <span className="pay-dot open" /> Dự tính {shortMoney(shownTotal.net - shownTotal.net_locked)} · <span className="pay-dot attention">!</span> Cần xử lý</p>
          <div className="btnrow">
            <button type="button" className="secondary" onClick={() => setShowCols((v) => !v)}>{showCols ? 'Ẩn bớt cột' : 'Hiện thêm cột'}</button>
            <button type="button" className="secondary" onClick={csv}>Xuất CSV</button>
          </div>
        </>
      )}
      {ov && <p className="muted">Tính lúc {stamp(ov.generated_at)}. Số "ước tính" theo đơn giá hiện hành; chốt khi chủ khóa kỳ lương. {applied.month && applied.whole ? '' : 'Muốn tính và chốt lương tháng: chọn đúng một tháng (từ mùng 1 đến ngày cuối tháng), Phân khu và Nhân viên là Tất cả.'}</p>}
    </>
  );
}

/** Bảng tổng hợp: cột Người, Giờ, (Công, Thưởng, Trừ khi bấm Hiện thêm cột), Thực nhận, trạng thái; bấm dòng mở phiếu lương; dòng tổng dính ở cuối */
function PayTable({ rows, showCols, onOpen, total, totalCount }: { rows: PayRow[]; showCols: boolean; onOpen: (id: string) => void; total: PayRow; totalCount?: number }) {
  const dot = (r: PayRow) => {
    const s = rowStatus(r);
    return s === 'attention' ? <span className="pay-dot attention" title="Cần xử lý">!</span>
      : s === 'locked' ? <span className="pay-dot locked" title="Đã chốt" />
      : s === 'open' ? <span className="pay-dot open" title="Chưa chốt" /> : <span className="pay-dot none" title="Chưa có số liệu" />;
  };
  return (
    <div className="table-scroll pay-scroll">
      <table className={showCols ? 'pay-table wide' : 'pay-table'}>
        <thead>
          <tr>
            <th className="sticky">Người</th><th className="r">Giờ</th>
            {showCols && <><th className="r">Công</th><th className="r">Thưởng</th><th className="r">Trừ</th></>}
            <th className="r">Thực nhận</th><th className="c" aria-label="Trạng thái" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ps = personState(r);
            return (
              <tr key={r.worker_id} tabIndex={0} role="button" aria-label={`Mở phiếu lương ${r.name}`} onClick={() => onOpen(r.worker_id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.worker_id); } }}>
                <td className="sticky"><strong>{r.name}</strong><span className={ps.needs ? 'sub warn' : 'sub'}>{ps.needs ? ps.reasons.join(' · ') : (r.team_name ?? ps.label)}</span></td>
                <td className="r">{r.hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>
                {showCols && <><td className="r">{money(r.hourly + r.salary + r.piece)}</td><td className="r">{r.bonus ? money(r.bonus) : '—'}</td><td className="r">{r.deduction + r.advance ? money(r.deduction + r.advance) : '—'}</td></>}
                <td className="r"><strong>{money(r.net)}</strong></td>
                <td className="c">{dot(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky">{totalCount !== undefined ? `Tổng ${totalCount} người` : total.name}</td>
            <td className="r">{total.hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>
            {showCols && <><td className="r">{money(total.hourly + total.salary + total.piece)}</td><td className="r">{money(total.bonus)}</td><td className="r">{money(total.deduction + total.advance)}</td></>}
            <td className="r">{money(total.net)}</td><td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const CAL_LABEL: Record<DayState, string> = { full: 'Đủ công', part: 'Làm một phần', pending: 'Chờ xác nhận / đang trong ca', off: 'Nghỉ', none: 'Không có công' };
const DOW_HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function PersonView({ orgId, row, prevNet, detail, range, adjust, orgName, label }: {
  orgId: string; row: PayRow; prevNet: number | null; detail: PayDetail | null; range: { from: string; to: string }; orgName: string; label: string; adjust: { orgId: string; month: string; onChanged: () => void } | null;
}) {
  const [form, setForm] = useState<{ id: string | null; kind: 'bonus' | 'deduction' | 'advance'; amount: string; reason: string } | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [offDates, setOffDates] = useState<string[]>([]);
  // ngày nghỉ đã ghi (hiện màu "nghỉ" trong lịch); không tải được thì bỏ qua
  useEffect(() => {
    setOffDates([]);
    if (!navigator.onLine) return;
    let alive = true;
    fetchAbsences(orgId, range.from, range.to).then((list) => {
      if (!alive) return;
      const out: string[] = [];
      for (const a of list) {
        if (a.worker_id !== row.worker_id || a.status !== 'active') continue;
        const s = Date.parse(`${a.from_date < range.from ? range.from : a.from_date}T00:00:00Z`), e = Date.parse(`${a.to_date > range.to ? range.to : a.to_date}T00:00:00Z`);
        for (let t = s; t <= e; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
      }
      setOffDates(out);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, row.worker_id, range.from, range.to]);
  const share = async () => {
    const text = buildPayslipText(row, detail?.items ?? [], label, orgName);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setShareNote('Đã chép phiếu lương, dán vào Zalo hoặc tin nhắn để gửi.');
    } catch { /* người dùng đóng hộp chia sẻ */ }
  };
  const [aBusy, setABusy] = useState(false);
  const [aError, setAError] = useState<string | null>(null);
  const save = async () => {
    if (!adjust || !form) return;
    const a = Number(form.amount.replace(/[.,\s]/g, ''));
    if (!form.amount.trim() || Number.isNaN(a) || a <= 0) return setAError('Số tiền phải lớn hơn 0.');
    if (form.reason.trim().length < 3) return setAError('Hãy ghi lý do.');
    setABusy(true); setAError(null);
    try {
      if (form.id) await updatePayAdjustment(form.id, form.kind, a, form.reason); else await addPayAdjustment(adjust.orgId, row.worker_id, adjust.month, form.kind, a, form.reason);
      setForm(null); adjust.onChanged();
    } catch (e) { setAError(friendlyError(e)); }
    setABusy(false);
  };
  const remove = async (id: string) => {
    if (!adjust || !window.confirm('Xóa khoản này? Bảng lương sẽ tự tính lại.')) return;
    setABusy(true); setAError(null);
    try { await deletePayAdjustment(id); adjust.onChanged(); } catch (e) { setAError(friendlyError(e)); }
    setABusy(false);
  };
  const open = row.net - row.net_locked;
  const items = detail?.items ?? [];
  const days = items.filter((i) => i.kind === 'hours' || i.kind === 'pending' || i.kind === 'open' || i.kind === 'rejected');
  const others = items.filter((i) => i.kind === 'salary' || i.kind === 'piece' || i.kind === 'bonus' || i.kind === 'deduction' || i.kind === 'advance').sort((a, b) => b.date.localeCompare(a.date));
  const st = statement(row);
  const cmp = compareWithPrev(row.net, prevNet);
  const rate = singleRate(items);
  const cal = useMemo(() => calendarCells(range.from, range.to, items, offDates), [range.from, range.to, items, offDates]);
  const pill = row.net > 0 && open <= 0.5 ? { cls: 'pill ok', text: 'Đã chốt' } : row.net_locked > 0 ? { cls: 'pill warn', text: 'Chốt một phần' } : { cls: 'pill warn', text: 'Ước tính, chưa chốt' };
  const warnings: string[] = [];
  if (row.no_rate_days > 0) warnings.push(`${row.no_rate_days} ngày công chưa có cách trả công nên chưa tính tiền (nhờ chủ cơ sở đặt ở hồ sơ nhân sự → Trả công)`);
  if (row.pending_hours > 0) warnings.push(`${hoursText(row.pending_hours)} công chờ xác nhận nên chưa tính tiền`);
  if (row.n_open > 0) warnings.push('đang có ca chưa ra ca');
  if (st.gap !== 0) warnings.push('số thực nhận lệch so với phép tính các khoản, hãy tính lại kỳ lương');
  return (
    <>
      <div className="card payslip">
        <div className="payslip-top">
          <span className="muted">{row.name}{row.team_name ? ` · ${row.team_name}` : ''} · {label}</span>
          <span className={pill.cls}>{pill.text}</span>
        </div>
        <div className="payslip-label">Thực nhận</div>
        <div className="payslip-net">{money(row.net)}</div>
        <div className="payslip-sub">
          {cmp && <span className={cmp.tone === 'up' ? 'up' : cmp.tone === 'down' ? 'down' : 'muted'}>{cmp.tone === 'same' ? 'Bằng kỳ trước' : `${cmp.tone === 'up' ? 'Tăng' : 'Giảm'} ${Math.abs(cmp.pct)}% so với kỳ trước`}</span>}
          <span className="muted">{cmp ? ' · ' : ''}{row.days} ngày · {hoursText(row.hours)}</span>
        </div>
        {open > 0.5 && <p className="muted mini-note">Đã chốt {money(row.net_locked)} · dự tính {money(open)}</p>}

        {warnings.length > 0 && (
          <div className="payslip-warn" role="status">
            {warnings.map((w) => <p key={w}>⚠ {w}</p>)}
          </div>
        )}

        <table className="pay-statement">
          <tbody>
            <tr className="head"><td colSpan={2}>Thu nhập</td></tr>
            <tr><td>Công theo giờ<small>{hoursText(row.hours)}{rate === 'multi' ? ' (nhiều mức giá)' : rate ? ` × ${money(rate)}/giờ` : ''}</small></td><td className="r">{money(row.hourly)}</td></tr>
            {row.salary > 0 && <tr><td>Lương cố định</td><td className="r">{money(row.salary)}</td></tr>}
            {row.piece > 0 && <tr><td>Khoán</td><td className="r">{money(row.piece)}</td></tr>}
            {row.bonus > 0 && <tr><td>Thưởng</td><td className="r">{money(row.bonus)}</td></tr>}
            <tr className="sum"><td>Tổng thu</td><td className="r">{money(st.income)}</td></tr>
            <tr className="head"><td colSpan={2}>Khấu trừ</td></tr>
            {row.deduction > 0 && <tr><td>Phạt / khấu trừ</td><td className="r neg">− {money(row.deduction)}</td></tr>}
            {row.advance > 0 && <tr><td>Tạm ứng</td><td className="r neg">− {money(row.advance)}</td></tr>}
            {st.deduct === 0 && <tr><td className="muted">Không có khoản trừ</td><td className="r">0</td></tr>}
            <tr className="sum"><td>Tổng trừ</td><td className="r">{st.deduct > 0 ? `− ${money(st.deduct)}` : '0'}</td></tr>
            <tr className="net"><td>Thực nhận</td><td className="r">{money(row.net)}</td></tr>
          </tbody>
        </table>

        {cal.length > 0 && (
          <div className="pay-cal-wrap">
            <div className="pay-cal-title">Lịch công</div>
            <div className="pay-cal" role="img" aria-label="Lịch công theo ngày trong kỳ">
              {DOW_HEAD.map((d) => <span key={d} className="pay-cal-h">{d}</span>)}
              {cal.map((c, i) => c.date === null
                ? <span key={`b${i}`} />
                : <span key={c.date} className={`pay-cal-d ${c.state}`} title={`${fmtDate(c.date)}: ${CAL_LABEL[c.state]}${c.hours ? ` (${hoursText(c.hours)})` : ''}`}>{c.day}</span>)}
            </div>
            <p className="muted pay-cal-legend"><i className="full" /> Đủ công <i className="part" /> Một phần <i className="pending" /> Chờ xác nhận <i className="off" /> Nghỉ</p>
          </div>
        )}

        <div className="btnrow">
          <button type="button" className="secondary" onClick={() => void share()}>Gửi phiếu lương</button>
        </div>
        {shareNote && <p className="muted" role="status">{shareNote}</p>}
      </div>

      <Collapsible title="Công từng ngày" summary={`${days.length} dòng`}>
        {!detail && <p className="muted">Đang tải…</p>}
        {detail && days.length === 0 && <p className="muted">Không có ngày công trong kỳ này.</p>}
        {days.map((i, n) => (
          <div className="row member" key={`${i.id ?? n}`}>
            <span className="grow">
              <strong>{fmtDate(i.date)}</strong> · {time(i.started_at)}–{time(i.ended_at)}{i.break_minutes ? ` (nghỉ ${i.break_minutes} phút)` : ''}
              <span className="sub">{i.kind === 'hours' || i.kind === 'pending' ? hoursText(i.minutes / 60) : ''}{i.rate ? ` × ${fmtVnd(i.rate)}/giờ` : ''}</span>
            </span>
            <span className="num">{i.kind === 'hours' ? <strong>{fmtVnd(i.amount)}</strong> : null}<span className={pillOf(i.status)}>{PAY_STATUS_LABEL[i.status]}</span></span>
          </div>
        ))}
        <p className="muted">Công sai? Vào Sản xuất → Chấm công, chọn ngày đó và bấm đề nghị sửa công.</p>
      </Collapsible>

      <Collapsible title="Lương cố định, khoán, thưởng, phạt, tạm ứng" summary={`${others.length} khoản`} defaultOpen={others.length > 0 || !!adjust}>
        {adjust && !form && (
          <div className="chips">
            {(['bonus', 'deduction', 'advance'] as const).map((k) => (
              <button key={k} type="button" className="chip add" onClick={() => { setAError(null); setForm({ id: null, kind: k, amount: '', reason: '' }); }}>＋ {k === 'bonus' ? 'Thưởng' : k === 'deduction' ? 'Phạt' : 'Tạm ứng'}</button>
            ))}
          </div>
        )}
        {adjust && form && (
          <div className="inline-form">
            <div className="pair">
              <label>Loại
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'bonus' | 'deduction' | 'advance' })}>
                  <option value="bonus">Thưởng</option><option value="deduction">Phạt / khấu trừ</option><option value="advance">Tạm ứng</option>
                </select>
              </label>
              <label>Số tiền (đồng)<input value={form.amount} inputMode="numeric" onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            </div>
            <label>Lý do<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            {aError && <p className="msg error" role="alert">{aError}</p>}
            <div className="btnrow">
              <button type="button" className="primary" disabled={aBusy} onClick={() => void save()}>{form.id ? 'Lưu thay đổi' : 'Thêm và tính lại'}</button>
              <button type="button" className="secondary" onClick={() => { setForm(null); setAError(null); }}>Hủy</button>
            </div>
          </div>
        )}
        {aError && !form && <p className="msg error" role="alert">{aError}</p>}
        {detail && others.length === 0 && <p className="muted">Không có khoản nào trong kỳ này.</p>}
        {others.map((i, n) => (
          <div className="row member" key={`${i.id ?? n}`}>
            <span className="grow"><strong>{i.kind === 'salary' ? `Lương cố định tháng ${i.label ?? ''}` : ADJ_KIND_LABEL[i.kind as 'piece' | 'bonus' | 'deduction' | 'advance']}</strong>
              <span className="sub">{i.kind === 'salary' ? '' : `${fmtDate(i.date)} — ${i.label ?? ''}`}</span>
              {adjust && i.id && i.kind !== 'salary' && i.kind !== 'piece' && (
                <span className="sub">
                  <button type="button" className="link inline" disabled={aBusy} onClick={() => { setAError(null); setForm({ id: i.id, kind: i.kind as 'bonus' | 'deduction' | 'advance', amount: String(Math.abs(i.amount)), reason: i.label ?? '' }); }}>Sửa</button>
                  <button type="button" className="link inline" disabled={aBusy} onClick={() => void remove(i.id!)}>Xóa</button>
                </span>
              )}</span>
            <span className="num"><strong>{i.amount < 0 ? '−' : '+'}{fmtVnd(Math.abs(i.amount))}</strong><span className={pillOf(i.status)}>{PAY_STATUS_LABEL[i.status]}</span></span>
          </div>
        ))}
      </Collapsible>
      <p className="muted">{fmtDate(range.from)} – {fmtDate(range.to)}. "Ước tính" theo đơn giá hiện hành, có thể đổi tới khi chủ tính và khóa kỳ lương.{detail ? ` Tính lúc ${stamp(detail.generated_at)}.` : ''}</p>
    </>
  );
}
