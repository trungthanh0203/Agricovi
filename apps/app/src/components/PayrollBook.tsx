import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { KpiTile, shortMoney } from './HomeStats';
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
import { downloadCsv } from '../lib/summary';
import { ADJ_KIND_LABEL, fmtVnd } from '../lib/work';

const PayCharts = lazy(() => import('./PayCharts')); // biểu đồ tải lười

const MODES: { id: RangeMode; label: string }[] = [
  { id: 'month', label: 'Tháng' }, { id: 'quarter', label: 'Quý' }, { id: 'year', label: 'Năm' },
];
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '…');
const stamp = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const pillOf = (s: PayItem['status']) => (s === 'locked' ? 'pill ok' : s === 'estimate' || s === 'calculated' || s === 'pending' || s === 'open' ? 'pill warn' : 'pill err');

/**
 * Bảng lương (D87): mỗi người xem lương và công của CHÍNH MÌNH (tổng thực nhận, giờ công, từng ngày vào ca/ra ca, lương cố định, thưởng/phạt/tạm ứng).
 * Chủ và người có quyền Tiền công chọn xem một người, tất cả, hoặc theo phòng/tổ. Số "ước tính" tính theo đơn giá hiện hành, có thể đổi tới khi chủ tính và khóa kỳ.
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
  const [onlyTodo, setOnlyTodo] = useState(false); // lọc "Cần xử lý"
  const [tick, setTick] = useState(0); // tăng lên để tải lại sau khi chốt lương / nhập thưởng phạt
  const [settle, setSettle] = useState<SettleState | null>(null);

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
    if (ov.can_see_all) setView('all');
    else { setView('person'); setPick(ov.workers[0]?.worker_id ?? null); }
  }, [ov, view]);
  useEffect(() => { if (view === 'person' && !pick && ov?.workers.length === 1) setPick(ov.workers[0]!.worker_id); }, [view, pick, ov]);

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
          {([['all', 'Tất cả'], ['team', 'Phòng / Tổ'], ['person', 'Một người']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'chip active' : 'chip'} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      )}
      {view === 'person' && canSeeAll && (
        <label className="inline-form">Chọn người
          <select value={pick ?? ''} onChange={(e) => setPick(e.target.value || null)}>
            <option value="">— Chọn người —</option>
            {rows.map((r) => <option key={r.worker_id} value={r.worker_id}>{r.name}{r.team_name ? ` · ${r.team_name}` : ''}</option>)}
          </select>
        </label>
      )}
      {!online && <p className="muted">Đang offline: hiện bản đã xem lần trước (nếu có).</p>}
      {fromCache && online && <p className="muted">Chưa tải được bản mới, đang hiện bản đã lưu.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
    </div>
  );

  // ---------------------------------------------------------------- một người
  if (view === 'person') {
    return (
      <>
        {header}
        {settle && <PaySettleBar orgId={orgId} state={settle} onChanged={refreshAll} onGo={onGo} />}
        {canSeeAll && pick && <button className="link" onClick={() => setView('all')}>← Danh sách tất cả</button>}
        {!pick && <p className="muted">{rows.length === 0 ? 'Chưa có hồ sơ chấm công nên chưa có bảng lương. Hồ sơ được tạo khi bạn chấm công lần đầu.' : 'Hãy chọn một người để xem.'}</p>}
        {person && <PersonView row={person} detail={detail} range={range} orgName={active.name} label={range.label} adjust={settle && settle.can_edit && settle.status !== 'locked' && !settle.overlap_legacy ? { orgId, month: range.from, onChanged: refreshAll } : null} />}
        {person && <Suspense fallback={null}><PayCharts orgId={orgId} worker={canSeeAll ? person.worker_id : null} items={detail?.items ?? null} from={range.from} to={range.to} /></Suspense>}
      </>
    );
  }

  // ---------------------------------------------------------------- tất cả / theo tổ
  const csv = () => downloadCsv(`bang-luong-${range.from}_${range.to}.csv`, buildPayBookCsv(rows, range));
  const line = (r: PayRow) => {
    const ps = personState(r);
    return (
      <button key={r.worker_id} className="member row member-btn" onClick={() => open(r.worker_id)}>
        <span className="grow"><strong>{r.name}</strong><span className="sub">{hoursText(r.hours)} · {r.days} ngày{ps.reasons.length > 0 ? ` · ${ps.reasons.join(' · ')}` : ''}</span></span>
        <span className="num"><strong>{fmtVnd(r.net)}</strong><span className={ps.cls === 'ok' ? 'pill ok' : ps.cls === 'warn' ? 'pill warn' : 'pill'}>{ps.label}</span></span>
        <span className="menu-go" aria-hidden>›</span>
      </button>
    );
  };
  const todoCount = rows.filter((r) => personState(r).needs).length;
  const shownRows = onlyTodo ? rows.filter((r) => personState(r).needs) : rows;
  const total = sumRows(rows);
  const pneedle = pq.trim().toLowerCase();
  const foundRows = pneedle ? shownRows.filter((r) => r.name.toLowerCase().includes(pneedle)) : shownRows;
  const pageRows = foundRows.slice(0, pn);
  return (
    <>
      {header}
      {settle && <PaySettleBar orgId={orgId} state={settle} onChanged={refreshAll} onGo={onGo} />}
      {rows.length === 0 && <p className="muted">{busy ? 'Đang tải…' : 'Chưa có người nào.'}</p>}
      {rows.length > 0 && (
        <div className="kpis">
          <KpiTile label="Tổng thực nhận" value={shortMoney(total.net)} tone="info" title={fmtVnd(total.net)} note={`đã chốt ${shortMoney(total.net_locked)}`} />
          <KpiTile label="Giờ công" value={hoursText(total.hours)} note={`${rows.length} người`} />
          <KpiTile label="Lương và công" value={shortMoney(total.hourly + total.salary)} title={fmtVnd(total.hourly + total.salary)} note="giờ + lương cố định" />
          <KpiTile label="Thưởng − phạt − tạm ứng" value={shortMoney(total.bonus - total.deduction - total.advance)} tone={total.bonus - total.deduction - total.advance < 0 ? 'warn' : 'ok'} />
        </div>
      )}
      {rows.length > 0 && <Suspense fallback={null}><PayCharts orgId={orgId} worker={null} items={null} from={range.from} to={range.to} /></Suspense>}
      {rows.length > 0 && (
        <div className="chips" role="tablist" aria-label="Lọc danh sách">
          <button role="tab" aria-selected={!onlyTodo} className={!onlyTodo ? 'chip active' : 'chip'} onClick={() => setOnlyTodo(false)}>Tất cả ({rows.length})</button>
          <button role="tab" aria-selected={onlyTodo} className={onlyTodo ? 'chip active' : 'chip'} onClick={() => setOnlyTodo(true)}>Cần xử lý ({todoCount})</button>
        </div>
      )}
      {onlyTodo && shownRows.length === 0 && <p className="muted">Không có ai cần xử lý.</p>}
      {view === 'team' ? groupByTeam(shownRows).map((g) => (
        <Collapsible key={g.team} title={g.team} summary={`${g.rows.length} người · ${hoursText(g.total.hours)} · ${fmtVnd(g.total.net)}`}>
          {g.rows.map(line)}
        </Collapsible>
      )) : (
        <>
          {rows.length > 8 && <div className="filters"><label>Tìm người<input type="search" value={pq} placeholder="Tên" onChange={(e) => { setPq(e.target.value); setPn(50); }} /></label></div>}
          {pneedle && foundRows.length === 0 && <p className="muted">Không tìm thấy ai.</p>}
          {pageRows.map(line)}
          {foundRows.length > pn && <div className="btnrow"><button type="button" className="secondary" onClick={() => setPn((x) => x + 50)}>Xem thêm ({foundRows.length - pn} người nữa)</button></div>}
        </>
      )}
      {rows.length > 0 && <button className="secondary" onClick={csv}>Xuất CSV</button>}
      {ov && <p className="muted">Tính lúc {stamp(ov.generated_at)}. Số "ước tính" theo đơn giá hiện hành; chốt khi chủ khóa kỳ lương. Chủ chốt lương ngay ở đầu trang khi xem một tháng.</p>}
    </>
  );
}

function PersonView({ row, detail, range, adjust, orgName, label }: {
  row: PayRow; detail: PayDetail | null; range: { from: string; to: string }; orgName: string; label: string; adjust: { orgId: string; month: string; onChanged: () => void } | null;
}) {
  const [form, setForm] = useState<{ id: string | null; kind: 'bonus' | 'deduction' | 'advance'; amount: string; reason: string } | null>(null);
  const [shareNote, setShareNote] = useState('');
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
  const others = items.filter((i) => i.kind === 'salary' || i.kind === 'bonus' || i.kind === 'deduction' || i.kind === 'advance').sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <h2 className="sect">{row.name}{row.team_name ? ` · ${row.team_name}` : ''}</h2>
      <div className="kpis">
        <KpiTile label="Thực nhận" value={shortMoney(row.net)} tone="info" title={fmtVnd(row.net)} note={`đã chốt ${shortMoney(row.net_locked)} · dự tính ${shortMoney(open)}`} />
        <KpiTile label="Giờ công" value={hoursText(row.hours)} note={`${row.days} ngày`} />
        <KpiTile label="Tiền công theo giờ" value={shortMoney(row.hourly)} title={fmtVnd(row.hourly)} />
        <KpiTile label="Lương cố định" value={shortMoney(row.salary)} title={fmtVnd(row.salary)} />
        <KpiTile label="Thưởng" value={shortMoney(row.bonus)} tone={row.bonus > 0 ? 'ok' : 'neutral'} />
        <KpiTile label="Phạt / khấu trừ" value={shortMoney(row.deduction)} tone={row.deduction > 0 ? 'bad' : 'neutral'} />
        <KpiTile label="Tạm ứng" value={shortMoney(row.advance)} tone={row.advance > 0 ? 'warn' : 'neutral'} />
        {row.pending_hours > 0 && <KpiTile label="Chờ xác nhận" value={hoursText(row.pending_hours)} tone="warn" note="chưa tính tiền" />}
      </div>
      {row.no_rate_days > 0 && <p className="msg warn" role="status">Có {row.no_rate_days} ngày công chưa có cách trả công nên chưa tính được tiền. Nhờ chủ cơ sở đặt ở hồ sơ nhân sự → Trả công.</p>}

      <Collapsible title="Công từng ngày" summary={`${days.length} dòng`} defaultOpen>
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

      <Collapsible title="Lương cố định, thưởng, phạt, tạm ứng" summary={`${others.length} khoản`} defaultOpen={others.length > 0 || !!adjust}>
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
            <span className="grow"><strong>{i.kind === 'salary' ? `Lương cố định tháng ${i.label ?? ''}` : ADJ_KIND_LABEL[i.kind as 'bonus' | 'deduction' | 'advance']}</strong>
              <span className="sub">{i.kind === 'salary' ? '' : `${fmtDate(i.date)} — ${i.label ?? ''}`}</span>
              {adjust && i.id && i.kind !== 'salary' && (
                <span className="sub">
                  <button type="button" className="link inline" disabled={aBusy} onClick={() => { setAError(null); setForm({ id: i.id, kind: i.kind as 'bonus' | 'deduction' | 'advance', amount: String(Math.abs(i.amount)), reason: i.label ?? '' }); }}>Sửa</button>
                  <button type="button" className="link inline" disabled={aBusy} onClick={() => void remove(i.id!)}>Xóa</button>
                </span>
              )}</span>
            <span className="num"><strong>{i.amount < 0 ? '−' : '+'}{fmtVnd(Math.abs(i.amount))}</strong><span className={pillOf(i.status)}>{PAY_STATUS_LABEL[i.status]}</span></span>
          </div>
        ))}
      </Collapsible>
      <button type="button" className="secondary" onClick={() => void share()}>Chia sẻ phiếu lương</button>
      {shareNote && <p className="muted" role="status">{shareNote}</p>}
      <p className="muted">{fmtDate(range.from)} – {fmtDate(range.to)}. "Ước tính" theo đơn giá hiện hành, có thể đổi tới khi chủ tính và khóa kỳ lương.{detail ? ` Tính lúc ${stamp(detail.generated_at)}.` : ''}</p>
    </>
  );
}
