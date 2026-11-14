import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { cycleTitle } from '../lib/cycles';
import { useCatalog } from '../lib/catalog';
import type { CycleRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { checkFeed, parseNormRows, type FeedPlan } from '../lib/feedNormLogic';
import type { GrowthRaw } from '../lib/growthLogic';
import { todayLocal } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { useTable } from '../lib/tables';

interface PlanRow extends FeedPlan { version: number }
type Line = { from_day: string; kg: string };

const num = (n: number | null, d = 1) => (n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d }));
const vn = (iso: string) => iso.split('-').reverse().join('/');
const COLUMNS = 'cycle_id, age_at_start, window_kind, tolerance_pct, norms, version';

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

/**
 * Định mức thức ăn theo ngày tuổi (mục 14 lát 4, D167). TÙY CHỌN: chưa đặt thì chỉ hiện một dòng "chưa đặt" và không đổi gì ở nơi khác.
 * Không có ô nhập hằng ngày mới: cám thực dùng lấy từ cái đã có (xuất kho nhóm Thức ăn, hoặc cám ghi tay), số con lấy từ hao hụt. Phần tính ở lib/feedNormLogic.ts.
 */
export function FeedNormPanel({ cycle, raw, canEdit }: { cycle: CycleRow; raw: GrowthRaw | null; canEdit: boolean }) {
  const events = useTable('countEvents');
  const harvests = useTable('harvests');
  const cycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const [plan, setPlan] = useState<PlanRow | null | undefined>(undefined); // undefined = đang tải
  const [withPlan, setWithPlan] = useState<string[]>([]);                   // các lứa khác đã có bảng (để chép)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ from_day: '0', kg: '' }]);
  const [unit, setUnit] = useState<'kg' | 'g'>('kg');
  const [age, setAge] = useState('0');
  const [win, setWin] = useState<'week' | 'all'>('week');
  const [tol, setTol] = useState('20');
  const [copyFrom, setCopyFrom] = useState('');
  const [reload, setReload] = useState(0);
  const today = todayLocal();

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void supabase.from('cycle_feed_plans').select(COLUMNS).limit(500).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { setPlan(null); if (!/does not exist|schema cache|could not find/i.test(e.message)) setError(friendlyError(e)); return; } // CSDL chưa cập nhật thì im lặng
      const rows = (data ?? []) as (PlanRow & { cycle_id: string })[];
      setPlan(rows.find((r) => r.cycle_id === cycle.id) ?? null);
      setWithPlan(rows.filter((r) => r.cycle_id !== cycle.id).map((r) => r.cycle_id));
    });
    return () => { live = false; };
  }, [cycle.id, reload]);

  // chuỗi cám theo ngày: cùng nguồn mà Tăng trọng/FCR đang dùng (kho nếu có cám xuất cho vụ, ngược lại cám ghi tay)
  const feed = useMemo(() => {
    if (!raw) return [];
    const stock = raw.feed.can_view && raw.feed.stock_by_date.reduce((n, x) => n + x.kg, 0) > 0;
    return stock ? raw.feed.stock_by_date : raw.feed.logs_by_date;
  }, [raw]);
  const check = useMemo(
    () => checkFeed(plan ?? null, cycle, events.filter((e) => e.cycle_id === cycle.id && !e.voided_at), harvests.filter((h) => h.cycle_id === cycle.id), feed, today),
    [plan, cycle, events, harvests, feed, today],
  );
  const others = useMemo(() => cycles.filter((c) => withPlan.includes(c.id) && c.owner_org_id === cycle.owner_org_id), [cycles, withPlan, cycle.owner_org_id]);

  function startEdit() {
    setError(null);
    if (plan) {
      setLines(plan.norms.map((n) => ({ from_day: String(n.from_day), kg: String(n.kg) })));
      setAge(String(plan.age_at_start)); setWin(plan.window_kind); setTol(String(plan.tolerance_pct));
    } else { setLines([{ from_day: '0', kg: '' }]); setAge('0'); setWin('week'); setTol('20'); }
    setUnit('kg'); setEditing(true);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); setReload((n) => n + 1); } catch (e) {
      setError(friendlyError(e));
      setReload((n) => n + 1); // lệch phiên bản hay lỗi khác: tải lại bản mới nhất
    } finally { setBusy(false); }
  }
  async function save() {
    const f = unit === 'g' ? 0.001 : 1;
    const parsed = parseNormRows(lines.map((l) => ({ from_day: l.from_day, kg: l.kg.trim() ? String(Number(l.kg.replace(',', '.')) * f) : '' })));
    if (!parsed.ok) return setError(parsed.error);
    const a = Number(age), t = Number(tol.replace(',', '.'));
    if (!Number.isInteger(a) || a < 0 || a > 3650) return setError('Tuổi con giống lúc nhập chuồng phải là số ngày nguyên từ 0 đến 3650.');
    if (!Number.isFinite(t) || t < 5 || t > 100) return setError('Ngưỡng lệch phải từ 5 đến 100 phần trăm.');
    await run(async () => {
      await rpc('set_cycle_feed_plan', { p_cycle: cycle.id, p_age: a, p_window: win, p_tol: t, p_norms: parsed.norms, p_version: plan?.version ?? 0 });
      setEditing(false);
    });
  }
  const label = (c: CycleRow) => `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')}${c.code ? ` (${c.code})` : ''}`;

  const summary = plan === undefined ? 'Đang tải…' : !plan ? 'chưa đặt (tùy chọn)'
    : check.todayKg !== null ? `hôm nay ~${num(check.todayKg, 0)} kg${check.diffPct !== null ? ` · ${check.diffPct > 0 ? '+' : ''}${num(check.diffPct, 0)}%` : ''}` : 'đã đặt';

  return (
    <Collapsible title="Định mức thức ăn" summary={summary} warn={check.state === 'high' || check.state === 'low'}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {plan === null && !editing && (
        <>
          <p className="muted">Không bắt buộc. Nhập định mức cám theo ngày tuổi để app tính "hôm nay nên cho bao nhiêu" và so với cám đã dùng. Không cần nhập thêm số liệu hằng ngày: app dùng cám đã xuất kho hoặc đã ghi, và số con còn lại.</p>
          {canEdit && (
            <div className="btnrow">
              <button className="secondary" disabled={busy} onClick={startEdit}>Đặt định mức</button>
            </div>
          )}
          {canEdit && others.length > 0 && (
            <div className="inline-form">
              <label>Hoặc chép từ lứa khác của cơ sở
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">Chọn lứa…</option>
                  {others.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                </select>
              </label>
              <div className="btnrow"><button className="secondary" disabled={busy || !copyFrom} onClick={() => void run(async () => { await rpc('copy_cycle_feed_plan', { p_from: copyFrom, p_to: cycle.id }); setCopyFrom(''); })}>Chép bảng này</button></div>
            </div>
          )}
        </>
      )}
      {plan && !editing && (
        <>
          <div className="card slim">
            <div className="row"><strong className="grow">Hôm nay{check.todayAge !== null ? ` (ngày tuổi ${check.todayAge})` : ''}</strong></div>
            {check.todayKg !== null
              ? <p>Nên cho khoảng <strong>{num(check.todayKg, 0)} kg</strong> ({num(check.todayNormKg, 2)} kg/con × {num(check.todayHeads, 0)} con).</p>
              : check.todayNormKg === null ? <p className="muted">Chưa có dòng định mức cho ngày tuổi này.</p>
              : <p className="muted">Chưa có số con. Hãy ghi số con ở mục "Số cây/con và hao hụt".</p>}
          </div>
          <div className="card slim">
            <div className="row"><strong className="grow">{plan.window_kind === 'week' ? '7 ngày gần đây' : 'Cả lứa'}</strong>{check.from && <span className="muted">{vn(check.from)} – {vn(check.to)}</span>}</div>
            {(check.state === 'ok' || check.state === 'high' || check.state === 'low') && (
              <>
                <div className="row"><span>Theo định mức</span><strong>{num(check.expectedKg, 0)} kg</strong></div>
                <div className="row"><span>Đã dùng (xuất kho hoặc ghi tay)</span><strong>{num(check.actualKg, 0)} kg</strong></div>
                {check.state === 'ok' && <p className="msg ok" role="status">Sát định mức ({check.diffPct !== null && check.diffPct > 0 ? '+' : ''}{num(check.diffPct, 0)}%).</p>}
                {check.state === 'high' && <p className="msg warn" role="status">Dùng nhiều hơn định mức khoảng {num(check.diffPct, 0)}%. Hãy xem có hao phí, rơi vãi hoặc số con trong app còn thấp hơn thực tế không.</p>}
                {check.state === 'low' && <p className="msg warn" role="status">Dùng ít hơn định mức khoảng {num(check.diffPct === null ? null : -check.diffPct, 0)}%. Hãy xem đàn có ăn kém hoặc bệnh không, hoặc cám chưa được ghi xuất kho.</p>}
              </>
            )}
            {check.state === 'no_feed' && <p className="muted">Chưa thấy cám được ghi trong kỳ này nên chưa so sánh. Xuất cám từ Kho cho lứa này (vật tư nhóm "Thức ăn") hoặc ghi cám đã dùng ở "Tăng trọng và FCR".</p>}
            {check.state === 'no_heads' && <p className="muted">Chưa có số con nên chưa so sánh. Hãy ghi số con ở "Số cây/con và hao hụt".</p>}
            {check.state === 'no_norm' && <p className="muted">Bảng định mức chưa có dòng cho các ngày tuổi trong kỳ này. Thêm dòng bắt đầu từ ngày tuổi nhỏ hơn.</p>}
            {check.coveredDays > 0 && check.coveredDays < check.periodDays && <p className="muted">Chỉ {check.coveredDays}/{check.periodDays} ngày trong kỳ có đủ định mức và số con; các ngày còn lại không tính.</p>}
            <p className="muted">Cám xuất kho là lúc lấy cho lứa, có thể chưa cho ăn hết ngay, nên xem theo kỳ chứ đừng so từng ngày. Số ước tính để theo dõi.</p>
          </div>
          <table className="grid">
            <thead><tr><th>Từ ngày tuổi</th><th className="num">kg/con/ngày</th></tr></thead>
            <tbody>{plan.norms.map((n) => <tr key={n.from_day}><td>{n.from_day}</td><td className="num">{num(n.kg, 3)}</td></tr>)}</tbody>
          </table>
          <p className="muted">Con giống nhập lúc {plan.age_at_start} ngày tuổi · so sánh {plan.window_kind === 'week' ? '7 ngày gần đây' : 'cả lứa'} · báo khi lệch quá {num(plan.tolerance_pct, 0)}%.</p>
          {canEdit && (
            <div className="btnrow">
              <button className="secondary" disabled={busy} onClick={startEdit}>Sửa định mức</button>
              <button className="link inline" disabled={busy} onClick={() => { if (window.confirm('Bỏ định mức thức ăn của lứa này? Số cám đã xuất/ghi không bị ảnh hưởng.')) void run(() => rpc('delete_cycle_feed_plan', { p_cycle: cycle.id })); }}>Bỏ định mức</button>
            </div>
          )}
        </>
      )}
      {editing && (
        <div className="inline-form">
          <p className="muted">Mỗi dòng: "từ ngày tuổi … trở đi, mỗi con ăn … mỗi ngày", áp dụng đến khi gặp dòng kế tiếp. Ví dụ: từ ngày 0: 0,3 kg; từ ngày 30: 1,2 kg. Số liệu do bạn hoặc kỹ thuật viên chốt theo giống và loại cám; app không đặt sẵn.</p>
          <label>Đơn vị nhập
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'kg' | 'g')}>
              <option value="kg">kg/con/ngày (heo, bò…)</option>
              <option value="g">g/con/ngày (gà, vịt, cá…)</option>
            </select>
          </label>
          {lines.map((l, i) => (
            <div className="pair" key={i}>
              <label>Từ ngày tuổi<input value={l.from_day} inputMode="numeric" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, from_day: e.target.value } : x)))} /></label>
              <label>{unit === 'kg' ? 'kg' : 'g'}/con/ngày<input value={l.kg} inputMode="decimal" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} /></label>
              {lines.length > 1 && <button type="button" className="link inline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Xóa dòng</button>}
            </div>
          ))}
          {lines.length < 30 && <button type="button" className="secondary" onClick={() => setLines([...lines, { from_day: '', kg: '' }])}>＋ Thêm dòng</button>}
          <label>Con giống nhập chuồng lúc mấy ngày tuổi?<input value={age} inputMode="numeric" onChange={(e) => setAge(e.target.value)} /></label>
          <label>So sánh cám đã dùng với định mức theo
            <select value={win} onChange={(e) => setWin(e.target.value as 'week' | 'all')}>
              <option value="week">7 ngày gần đây (nên chọn nếu xuất cám theo bao)</option>
              <option value="all">Cả lứa tính đến hôm nay</option>
            </select>
          </label>
          <label>Báo khi lệch quá (%)<input value={tol} inputMode="decimal" onChange={(e) => setTol(e.target.value)} /></label>
          <div className="btnrow">
            <button className="primary" disabled={busy} onClick={() => void save()}>Lưu</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </div>
      )}
    </Collapsible>
  );
}
