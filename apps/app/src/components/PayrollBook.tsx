import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { shortMoney } from './HomeStats';
import { fetchAbsences } from '../lib/absences';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import {
  addPayAdjustment, cachedDetail, cachedOverview, deletePayAdjustment, fetchPayDetail, fetchPayOverview, fetchSettleState, updatePayAdjustment, type SettleState,
} from '../lib/payBook';
import type { TabId } from '../lib/tabs';
import { PaySettleBar } from './PaySettleBar';
import {
  buildPayBookCsv, buildPayslipText, groupByTeam, hoursText, PAY_STATUS_LABEL, personState, rangeOf, shiftAnchor, sumRows,
  type PayDetail, type PayItem, type PayOverview, type PayRow, type RangeMode,
} from '../lib/payBookLogic';
import {
  calendarCells, compareWithPrev, filterCounts, filterRows, rowStatus, singleRate, sortRows, SORT_LABEL, statement,
  type DayState, type RowFilter, type SortKey,
} from '../lib/payView';
import { downloadCsv } from '../lib/summary';
import { ADJ_KIND_LABEL, fmtVnd } from '../lib/work';

const PayCharts = lazy(() => import('./PayCharts')); // biểu đồ tải lười

const MODES: { id: RangeMode; label: string }[] = [
  { id: 'month', label: 'Tháng' }, { id: 'quarter', label: 'Quý' }, { id: 'year', label: 'Năm' },
];
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

/**
 * Bảng lương (D87, giao diện mới D207): mỗi người xem lương và công của CHÍNH MÌNH dưới dạng PHIẾU LƯƠNG (thực nhận lớn, Thu nhập − Khấu trừ, lịch công).
 * Chủ và người có quyền Tiền công xem một người (mặc định), theo phòng/tổ, hoặc tất cả dưới dạng BẢNG có bộ lọc, sắp xếp, cột thêm và dòng tổng.
 * Số "ước tính" tính theo đơn giá hiện hành, có thể đổi tới khi chủ tính và khóa kỳ.
 */
export function PayrollBook({ onGo }: { onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const [mode, setMode] = useState<RangeMode>('month');
  const [anchor, setAnchor] = useState(todayLocal());
  const range = useMemo(() => rangeOf(mode, anchor), [mode, anchor]);
  const [view, setView] = useState<'person' | 'all' | 'team' | null>(null); // null = chưa biết quyền
  const [ov, setOv] = useState<PayOverview | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [pq, setPq] = useState(''); // ô tìm tên và hiện từng 50 người (D142)
  const [pn, setPn] = useState(50);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showCols, setShowCols] = useState(false);
  const [tick, setTick] = useState(0); // tăng lên để tải lại sau khi chốt lương / nhập thưởng phạt
  const [settle, setSettle] = useState<SettleState | null>(null);
  const [prev, setPrev] = useState<Map<string, number> | null>(null);   // thực nhận kỳ trước theo người, để so sánh

  const loadOverview = useCallback(async () => {
    if (!orgId) return;
    const cached = cachedOverview(orgId, range.from, range.to, null);
    if (!navigator.onLine) { if (cached) { setOv(cached); setFromCache(true); } return; }
    setBusy(true); setError(null);
    try { setOv(await fetchPayOverview(orgId, range.from, range.to, null)); setFromCache(false); } catch (e) { setError(friendlyError(e)); if (cached) { setOv(cached); setFromCache(true); } }
    setBusy(false);
  }, [orgId, range.from, range.to]);
  useEffect(() => { void loadOverview(); }, [loadOverview, online]);

  const canSeeAll = ov?.can_see_all ?? false;
  const refreshAll = () => { setTick((t) => t + 1); void loadOverview(); };
  useEffect(() => {
    setSettle(null);
    if (!orgId || !canSeeAll || mode !== 'month' || !online) return;
    let alive = true;
    fetchSettleState(orgId, range.from).then((s) => { if (alive) setSettle(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, canSeeAll, mode, range.from, online, tick]);
  useEffect(() => {
    if (!ov || view !== null) return;
    // mặc định xem MỘT người (người đầu danh sách); chủ muốn xem tất cả thì bấm "Tất cả" (đứng cuối)
    setView('person'); setPick(ov.workers[0]?.worker_id ?? null);
  }, [ov, view]);
  useEffect(() => { if (view === 'person' && !pick && ov?.workers.length === 1) setPick(ov.workers[0]!.worker_id); }, [view, pick, ov]);

  // thực nhận của kỳ trước (để hiện "tăng/giảm so với kỳ trước"); lỗi hoặc offline thì bỏ qua
  const prevRange = useMemo(() => rangeOf(mode, shiftAnchor(mode, anchor, -1)), [mode, anchor]);
  useEffect(() => {
    setPrev(null);
    if (!orgId || !online) return;
    let alive = true;
    fetchPayOverview(orgId, prevRange.from, prevRange.to, null).then((o) => { if (alive) setPrev(new Map(o.workers.map((w) => [w.worker_id, w.net]))); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, prevRange.from, prevRange.to, online, tick]);

  useEffect(() => {
    setDetail(null);
    if (!orgId || view !== 'person' || !pick) return;
    const cached = cachedDetail(orgId, pick, range.from, range.to);
    if (!navigator.onLine) { if (cached) setDetail(cached); return; }
    let alive = true;
    fetchPayDetail(orgId, pick, range.from, range.to).then((d) => { if (alive) setDetail(d); }).catch((e) => { if (alive) { setError(friendlyError(e)); if (cached) setDetail(cached); } });
    return () => { alive = false; };
  }, [orgId, view, pick, range.from, range.to, online, tick]);

  if (!active) return null;
  const rows = ov?.workers ?? [];
  const person = rows.find((r) => r.worker_id === pick) ?? null;
  const pickIndex = rows.findIndex((r) => r.worker_id === pick);
  const open = (id: string) => { setPick(id); setView('person'); };

  const header = (
    <div className="card">
      <div className="chips" role="tablist" aria-label="Kỳ xem">
        {MODES.map((m) => <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'chip active' : 'chip'} onClick={() => setMode(m.id)}>{m.label}</button>)}
      </div>
      <div className="range-nav">
        <button type="button" className="range-btn" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Kỳ trước">‹</button>
        <div className="range-mid"><h2>{range.label}</h2><p className="muted">{fmtDate(range.from)} – {fmtDate(range.to)}</p></div>
        <button type="button" className="range-btn" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} disabled={range.to >= todayLocal()} aria-label="Kỳ sau">›</button>
      </div>
      {canSeeAll && (
        <div className="chips" role="tablist" aria-label="Xem theo">
          {([['person', 'Một người'], ['team', 'Phòng / Tổ'], ['all', 'Tất cả']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'chip active' : 'chip'} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      )}
      {view === 'person' && canSeeAll && (
        <div className="person-pick">
          <button type="button" className="range-btn" disabled={pickIndex <= 0} onClick={() => setPick(rows[pickIndex - 1]!.worker_id)} aria-label="Người trước">‹</button>
          <select value={pick ?? ''} onChange={(e) => setPick(e.target.value || null)} aria-label="Chọn người">
            <option value="">— Chọn người —</option>
            {rows.map((r) => <option key={r.worker_id} value={r.worker_id}>{r.name}{r.team_name ? ` · ${r.team_name}` : ''}</option>)}
          </select>
          <button type="button" className="range-btn" disabled={pickIndex < 0 || pickIndex >= rows.length - 1} onClick={() => setPick(rows[pickIndex + 1]!.worker_id)} aria-label="Người sau">›</button>
        </div>
      )}
      {!online && <p className="muted">Đang offline: hiện bản đã xem lần trước (nếu có).</p>}
      {fromCache && online && <p className="muted">Chưa tải được bản mới, đang hiện bản đã lưu.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
    </div>
  );

  // ---------------------------------------------------------------- một người: phiếu lương
  if (view === 'person') {
    return (
      <>
        {header}
        {settle && <PaySettleBar orgId={orgId} state={settle} onChanged={refreshAll} onGo={onGo} />}
        {!pick && <p className="muted">{rows.length === 0 ? 'Chưa có hồ sơ chấm công nên chưa có bảng lương. Hồ sơ được tạo khi bạn chấm công lần đầu.' : 'Hãy chọn một người để xem.'}</p>}
        {person && <PersonView orgId={orgId} row={person} prevNet={prev?.get(person.worker_id) ?? null} detail={detail} range={range} orgName={active.name} label={range.label} adjust={settle && settle.can_edit && settle.status !== 'locked' && !settle.overlap_legacy ? { orgId, month: range.from, onChanged: refreshAll } : null} />}
        {person && <Suspense fallback={null}><PayCharts items={detail?.items ?? null} from={range.from} to={range.to} /></Suspense>}
        {canSeeAll && pick && <button className="link" onClick={() => setView('all')}>Xem tất cả mọi người →</button>}
      </>
    );
  }

  // ---------------------------------------------------------------- tất cả / theo tổ: bảng tổng hợp
  const csv = () => downloadCsv(`bang-luong-${range.from}_${range.to}.csv`, buildPayBookCsv(rows, range));
  const counts = filterCounts(rows);
  const pneedle = pq.trim().toLowerCase();
  const filtered = filterRows(rows, filter);
  const found = pneedle ? filtered.filter((r) => r.name.toLowerCase().includes(pneedle)) : filtered;
  const sorted = sortRows(found, sortKey);
  const pageRows = sorted.slice(0, pn);
  const all = sumRows(rows);
  const shownTotal = sumRows(sorted);
  return (
    <>
      {header}
      {settle && <PaySettleBar orgId={orgId} state={settle} onChanged={refreshAll} onGo={onGo} />}
      {rows.length === 0 && <p className="muted">{busy ? 'Đang tải…' : 'Chưa có người nào.'}</p>}
      {rows.length > 0 && (
        <>
          <div className="mini-kpis">
            <MiniStat label="Thực nhận" value={shortMoney(all.net)} tone="info" title={fmtVnd(all.net)} />
            <MiniStat label="Giờ công" value={hoursText(all.hours)} title={`${rows.length} người`} />
            <MiniStat label="Lương và công" value={shortMoney(all.hourly + all.salary + all.piece)} title={fmtVnd(all.hourly + all.salary + all.piece)} />
            <MiniStat label="Thưởng−phạt−ứng" value={shortMoney(all.bonus - all.deduction - all.advance)} tone={all.bonus - all.deduction - all.advance < 0 ? 'warn' : 'ok'} title="Thưởng trừ phạt trừ tạm ứng" />
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
      {rows.length > 0 && sorted.length > 0 && (view === 'team' ? groupByTeam(sorted).map((g) => (
        <Collapsible key={g.team} title={g.team} summary={`${g.rows.length} người · ${hoursText(g.total.hours)} · ${fmtVnd(g.total.net)}`} defaultOpen>
          <PayTable rows={g.rows} showCols={showCols} onOpen={open} total={sumRows(g.rows, `Tổng ${g.team}`)} />
        </Collapsible>
      )) : (
        <>
          <PayTable rows={pageRows} showCols={showCols} onOpen={open} total={shownTotal} totalCount={sorted.length} />
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
      {ov && <p className="muted">Tính lúc {stamp(ov.generated_at)}. Số "ước tính" theo đơn giá hiện hành; chốt khi chủ khóa kỳ lương. Chủ chốt lương ngay ở đầu trang khi xem một tháng.</p>}
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
