import { useEffect, useState } from 'react';
import { Collapsible } from './Collapsible';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { MODE_LABEL, modeOf } from '../lib/herd';
import { formatMoney } from '../lib/inventory';
import { closeCyclePeriod, fetchHerdBalance, fetchPeriodsReport, openCyclePeriod, setOrchardParams, type CyclePeriod, type HerdGroupBalance, type PeriodSummary } from '../lib/periods';
import { listTemplates, type TemplateRow } from '../lib/templates';
import type { CycleRow } from '../lib/db';

const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d }));
const ageText = (planting: string | null | undefined, today: string): string | null => {
  if (!planting) return null;
  const months = Math.max(0, Math.floor((new Date(today).getTime() - new Date(planting).getTime()) / (30.4375 * 864e5)));
  return `${Math.floor(months / 12)} năm ${months % 12} tháng`;
};

/**
 * Vườn cây lâu năm và đàn nuôi liên tục (migration 0182): kỳ hiện tại (đóng / mở kỳ mới), tuổi cây và thông số khấu hao,
 * tổng kết theo kỳ, biến động đàn theo nhóm. Vụ theo mùa không dùng khối này. Cần mạng (số liệu do máy chủ tính).
 */
export function CyclePeriods({ cycle, periods, reload, canManage, online, today, busy, run }: {
  cycle: CycleRow; periods: CyclePeriod[] | null; reload: () => Promise<void>; canManage: boolean; online: boolean; today: string; busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const mode = modeOf(cycle);
  const open = periods?.find((p) => p.status === 'open') ?? null;
  const last = periods && periods.length > 0 ? periods[periods.length - 1]! : null;
  const closed = cycle.status === 'ended' || cycle.status === 'cancelled';

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  useEffect(() => {
    if (!online || !canManage) return;
    let alive = true;
    listTemplates(cycle.owner_org_id).then((r) => { if (alive) setTemplates(r.filter((t) => t.is_active && t.crop_type_id === cycle.crop_type_id && t.template_stages.length > 0)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [cycle.owner_org_id, cycle.crop_type_id, online, canManage]);

  const [endDate, setEndDate] = useState(today);
  const [label, setLabel] = useState('');
  const [start, setStart] = useState(last?.end_date ? addDays(last.end_date, 1) : today);
  const [tpl, setTpl] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (last?.end_date) setStart(addDays(last.end_date, 1) > today ? addDays(last.end_date, 1) : today); }, [last?.end_date, today]);
  useEffect(() => { if (!tpl && templates.length > 0) setTpl(templates.find((t) => t.id === cycle.template_id)?.id ?? templates[0]!.id); }, [templates, cycle.template_id, tpl]);

  const [report, setReport] = useState<PeriodSummary[] | null>(null);
  const [repErr, setRepErr] = useState<string | null>(null);
  const reloadReport = () => { if (online) fetchPeriodsReport(cycle.id).then((r) => { setReport(r); setRepErr(null); }).catch((e) => setRepErr(friendlyError(e))); };
  useEffect(() => { reloadReport(); }, [cycle.id, periods, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const [balFrom, setBalFrom] = useState(open?.start_date ?? cycle.start_date ?? today);
  const [balTo, setBalTo] = useState(today);
  const [bal, setBal] = useState<HerdGroupBalance[] | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  useEffect(() => { if (open?.start_date) setBalFrom(open.start_date); }, [open?.start_date]);
  useEffect(() => {
    if (mode !== 'herd' || !online) return;
    fetchHerdBalance(cycle.id, balFrom, balTo).then((r) => { setBal(r); setBalErr(null); }).catch((e) => setBalErr(friendlyError(e)));
  }, [mode, cycle.id, balFrom, balTo, online]);

  const [plant, setPlant] = useState(cycle.planting_date ?? '');
  const [mat, setMat] = useState(String(cycle.maturity_years ?? 3));
  const [am, setAm] = useState(String(cycle.amort_years ?? 15));

  if (mode === 'batch') return null;
  const age = mode === 'perennial' ? ageText(cycle.planting_date, today) : null;
  const construction = mode === 'perennial' && cycle.planting_date ? today < addDays(cycle.planting_date, Math.round((cycle.maturity_years ?? 3) * 365)) : false;
  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await run(fn); await reload(); } catch (e) { setError(friendlyError(e)); } };

  return (
    <>
      <div className="card slim">
        <div className="row"><strong className="grow">{MODE_LABEL[mode]}</strong>{mode === 'perennial' && <span className={construction ? 'pill warn' : 'pill ok'}>{construction ? 'Kiến thiết cơ bản' : 'Kinh doanh'}</span>}</div>
        {age && <p className="muted">Tuổi cây: <strong>{age}</strong> (trồng {fmtDate(cycle.planting_date)})</p>}
        {periods === null ? <p className="muted">Đang tải kỳ…</p> : open ? (
          <>
            <p>Kỳ hiện tại: <strong>{open.label}</strong> · từ {fmtDate(open.start_date)}{open.end_date ? ` đến ${fmtDate(open.end_date)} (dự kiến)` : ''}</p>
            {canManage && !closed && (
              <div className="inline-form">
                <label>Đóng kỳ vào ngày<input type="date" value={endDate} min={open.start_date} max={today} onChange={(e) => setEndDate(e.target.value)} /></label>
                <div className="btnrow">
                  <button type="button" className="secondary" disabled={!online || busy}
                    onClick={() => { if (window.confirm(`Đóng kỳ "${open.label}"? Các việc chưa bắt đầu của kỳ này sẽ bị bỏ. Việc đang làm phải bấm Xong trước.`)) void act(() => closeCyclePeriod(cycle.id, open.id, endDate)); }}>Đóng kỳ này</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="msg warn">Chưa có kỳ đang mở. Mở kỳ mới để có các việc cần làm.</p>
        )}
        {error && <p className="msg error" role="alert">{error}</p>}
      </div>

      {!open && periods !== null && canManage && !closed && (
        <Collapsible inline title="＋ Mở kỳ mới" defaultOpen>
          <div className="inline-form">
            <label>Tên kỳ<input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={mode === 'herd' ? 'Ví dụ: Quý 2/2027' : 'Ví dụ: Mùa 2027'} /></label>
            <label>Bắt đầu từ ngày<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Quy trình
              <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.template_stages.length} việc)</option>)}
              </select>
            </label>
            <div className="btnrow">
              <button type="button" className="primary" disabled={!online || busy || !label.trim() || !tpl}
                onClick={() => void act(() => openCyclePeriod(cycle.id, label, start, tpl)).then(() => setLabel(''))}>Mở kỳ</button>
            </div>
          </div>
        </Collapsible>
      )}

      {mode === 'perennial' && canManage && !closed && (
        <Collapsible inline title="＋ Thông số vườn cây (ngày trồng, năm kiến thiết, năm khấu hao)" summary={`khấu hao ${cycle.amort_years ?? 15} năm`}>
          <div className="inline-form">
            <label>Ngày trồng<input type="date" value={plant} max={today} onChange={(e) => setPlant(e.target.value)} /></label>
            <div className="pair">
              <label>Số năm kiến thiết<input value={mat} inputMode="decimal" onChange={(e) => setMat(e.target.value)} /></label>
              <label>Số năm khấu hao<input value={am} inputMode="numeric" onChange={(e) => setAm(e.target.value)} /></label>
            </div>
            <p className="muted">Chi phí tích "Chi phí đầu tư vườn cây" khi ghi chi phí sẽ được khấu hao đều theo số năm khấu hao, bắt đầu sau thời gian kiến thiết.</p>
            <div className="btnrow">
              <button type="button" className="primary" disabled={!online || busy || !plant}
                onClick={() => void act(() => setOrchardParams(cycle.id, plant, Number(mat.replace(',', '.')) || 3, Math.max(1, Math.round(Number(am.replace(',', '.')) || 15))))}>Lưu</button>
            </div>
          </div>
        </Collapsible>
      )}

      <Collapsible title="Tổng kết theo kỳ" summary={report ? `${report.length} kỳ` : online ? 'đang tải…' : 'cần có mạng'}>
        {repErr && <p className="msg error" role="alert">{repErr}</p>}
        {report && report.length === 0 && <p className="muted">Chưa có kỳ nào.</p>}
        {report && report.length > 0 && (
          <table className="grid">
            <thead><tr><th>Kỳ</th><th>Thu hoạch (kg)</th><th>Doanh thu</th><th>Chi phí{mode === 'perennial' ? ' + khấu hao' : ''}</th><th>Lãi / lỗ</th>{mode === 'perennial' ? <th>kg/cây</th> : <th>Chi phí/đầu</th>}</tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.period_id}>
                  <td>{r.label}<span className="sub">{fmtDate(r.start)} – {r.end ? fmtDate(r.end) : 'nay'}{r.status === 'open' ? ' · đang mở' : ''}{mode === 'perennial' && r.age_years != null ? ` · ${fmt(r.age_years, 1)} tuổi` : ''}</span></td>
                  <td>{fmt(r.harvest_net, 1)}</td>
                  <td>{formatMoney(r.revenue)}</td>
                  <td>{formatMoney(r.total_cost)}{mode === 'perennial' && r.depreciation > 0 ? <span className="sub">gồm khấu hao {formatMoney(r.depreciation)}</span> : null}</td>
                  <td>{formatMoney(r.profit)}</td>
                  <td>{mode === 'perennial' ? fmt(r.yield_per_plant, 2) : formatMoney(r.cost_per_head ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {mode === 'perennial' && report && report.some((r) => r.capital_total > 0) && <p className="muted">Chi phí đầu tư vườn cây đã ghi: {formatMoney(Math.max(...report.map((r) => r.capital_total)))}. Chi phí đầu tư không tính vào chi phí kỳ mà khấu hao dần.</p>}
        <p className="muted">Số liệu của khoảng ngày từng kỳ. Tiền công tính theo kỳ lương kết thúc trong kỳ.</p>
      </Collapsible>

      {mode === 'herd' && (
        <Collapsible title="Biến động đàn" summary={bal ? `${bal.reduce((n, g) => n + g.closing, 0)} đầu cuối kỳ` : undefined}>
          <div className="pair">
            <label>Từ ngày<input type="date" value={balFrom} max={balTo} onChange={(e) => setBalFrom(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={balTo} min={balFrom} max={today} onChange={(e) => setBalTo(e.target.value)} /></label>
          </div>
          {balErr && <p className="msg error" role="alert">{balErr}</p>}
          {bal && bal.length === 0 && <p className="muted">Chưa có số đầu nào.</p>}
          {bal && bal.length > 0 && (
            <table className="grid">
              <thead><tr><th>Nhóm</th><th>Đầu kỳ</th><th>Nhập</th><th>Sinh</th><th>Chuyển vào</th><th>Chuyển ra</th><th>Chết</th><th>Loại</th><th>Xuất</th><th>Cuối kỳ</th></tr></thead>
              <tbody>
                {bal.map((g) => <tr key={g.group || '_'}><td>{g.group || 'Chưa chia nhóm'}</td><td>{g.opening}</td><td>{g.in}</td><td>{g.born}</td><td>{g.move_in}</td><td>{g.move_out}</td><td>{g.dead}</td><td>{g.culled}</td><td>{g.out}</td><td><strong>{g.closing}</strong></td></tr>)}
                <tr><td><strong>Cộng</strong></td>{(['opening', 'in', 'born', 'move_in', 'move_out', 'dead', 'culled', 'out', 'closing'] as const).map((k) => <td key={k}><strong>{bal.reduce((n, g) => n + g[k], 0)}</strong></td>)}</tr>
              </tbody>
            </table>
          )}
          <p className="muted">Số tồn đầu nhập khi tạo đàn tính vào cột Nhập của kỳ đầu. Phiếu thu hoạch/xuất ghi số con chưa được tính vào bảng này, hãy ghi thêm sự kiện "Xuất" ở mục số đầu theo nhóm.</p>
        </Collapsible>
      )}
    </>
  );
}
