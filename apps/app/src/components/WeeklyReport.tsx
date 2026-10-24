import { useCallback, useEffect, useState } from 'react';
import { ChartCard, XYChart } from './charts';
import { KpiTile, shortMoney } from './HomeStats';
import { compactNumber } from '../lib/chartMath';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import type { ReportSection } from '../lib/tabs';
import { addDaysIso, attentionCount, buildWeeklyText, delta, deltaText, deltaTone, weekLabel, type MetricKey, type WeeklyReport as Report } from '../lib/weekly';
import { cachedWeekly, fetchWeekly } from '../lib/weeklyApi';

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const stamp = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Báo cáo tuần (G2-7, D80): chủ và quản lý xem tóm tắt một tuần (thứ Hai – Chủ nhật), so với tuần trước, số liệu từng ngày, điểm cần chú ý.
 * Máy chủ tính khi mở và chỉ trả mục người xem có quyền. Mất mạng thì hiện bản tuần vừa qua đã lưu lần trước.
 */
export function WeeklyReport({ onSection }: { onSection: (s: ReportSection) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const [weekStart, setWeekStart] = useState<string | null>(null); // null = tuần vừa qua
  const [r, setR] = useState<Report | null>(() => (orgId ? cachedWeekly(orgId) : null));
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    setBusy(true); setError('');
    try { setR(await fetchWeekly(orgId, weekStart)); setFresh(true); } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo tuần.'); }
    setBusy(false);
  }, [orgId, weekStart]);

  useEffect(() => { void load(); }, [load, online]);

  if (!active) return null;
  if (!r) {
    return <div className="card"><p className="muted">{error || (online ? 'Đang tải báo cáo tuần…' : 'Cần có mạng để xem báo cáo tuần lần đầu.')}</p></div>;
  }

  const thisMonday = r.week_start;
  const goPrev = () => setWeekStart(addDaysIso(thisMonday, -7));
  const goNext = () => setWeekStart(r.is_current_week ? null : addDaysIso(thisMonday, 7));
  const isDefault = weekStart === null;

  const tile = (key: MetricKey, label: string, fmtBig: (n: number) => string, fmtFull: (n: number) => string, unit?: string) => {
    const c = r.cur[key], p = r.prev[key];
    if (c === null || p === null) return null;
    const d = delta(c, p);
    return <KpiTile key={key} label={label} value={fmtBig(c)} title={fmtFull(c)} tone={deltaTone(key, d)} note={`${unit ? `${unit} · ` : ''}${deltaText(d, fmtBig(p))}`} />;
  };

  const share = async () => {
    const text = buildWeeklyText(r, active.name);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setNote('Đã chép tóm tắt, dán vào Zalo hoặc tin nhắn để gửi.');
    } catch { /* người dùng đóng hộp chia sẻ */ }
  };

  const labels = r.daily.map((d) => DOW[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7]!);
  const full = r.daily.map((d) => d.date.split('-').reverse().slice(0, 2).join('/'));
  const money2 = [
    ...(r.daily.every((d) => d.cost !== null) ? [{ label: 'Chi phí', tone: 'bad', v: r.daily.map((d) => d.cost ?? 0) }] : []),
    ...(r.daily.every((d) => d.revenue !== null) ? [{ label: 'Doanh thu', tone: 'ok', v: r.daily.map((d) => d.revenue ?? 0) }] : []),
  ];
  const a = r.attention;
  const foot = `${fresh ? 'Tính' : 'Bản đã lưu trên máy, tính'} lúc ${stamp(r.generated_at)}`;

  return (
    <div>
      <div className="card">
        <div className="btnrow">
          <button type="button" className="secondary" onClick={goPrev} disabled={busy}>‹ Tuần trước</button>
          <button type="button" className="secondary" onClick={goNext} disabled={busy || r.is_current_week}>Tuần sau ›</button>
        </div>
        <h2 style={{ marginTop: 8 }}>{weekLabel(r.week_start, r.week_end)}</h2>
        <p className="muted">
          {r.is_current_week ? 'Tuần này (chưa kết thúc, số liệu còn thay đổi).' : isDefault ? 'Tuần vừa qua.' : 'Tuần đã chọn.'}
          {!isDefault && <> <button type="button" className="link inline" onClick={() => setWeekStart(null)}>Về tuần vừa qua</button></>}
          {isDefault && <> <button type="button" className="link inline" onClick={() => setWeekStart(addDaysIso(r.week_start, 7))}>Xem tuần này</button></>}
        </p>
        {!online && <p className="muted">Đang không có mạng — chỉ xem được bản đã lưu.</p>}
        {error && <p className="err">{error}</p>}
      </div>

      <div className="kpis">
        {tile('logs', 'Việc đã ghi', (n) => String(n), (n) => String(n))}
        {tile('harvest_kg', 'Thu hoạch', (n) => `${num(n)} kg`, (n) => `${num(n)} kg`, 'sau hao hụt')}
        {tile('revenue', 'Doanh thu', shortMoney, money, 'đồng')}
        {tile('cost', 'Chi phí', shortMoney, money, 'đồng')}
        {tile('labor_hours', 'Giờ công', (n) => `${num(n)} giờ`, (n) => `${num(n)} giờ`, 'đã xác nhận')}
        {tile('collected', 'Đã thu nợ', shortMoney, money, 'đồng')}
        {tile('paid_out', 'Đã trả nợ', shortMoney, money, 'đồng')}
        {tile('web_orders', 'Đơn từ website', (n) => String(n), (n) => String(n))}
      </div>

      {money2.length > 0 && (
        <ChartCard title="Chi phí và doanh thu từng ngày" subtitle="Chi phí không gồm tiền mua vật tư (đã tính khi dùng)" footer={foot}
          table={{ columns: ['Ngày', ...money2.map((m) => m.label)], rows: full.map((l, i) => [l, ...money2.map((m) => money(m.v[i] ?? 0))]) }}>
          <XYChart kind="bar" labels={full} shortLabels={labels} format={money} axisFormat={compactNumber}
            series={money2.map((m) => ({ label: m.label, tone: m.tone }))} values={money2.map((m) => m.v)} ariaLabel="Chi phí và doanh thu từng ngày trong tuần" />
        </ChartCard>
      )}
      <ChartCard title="Việc đã ghi từng ngày" footer={foot}
        table={{ columns: ['Ngày', 'Số việc'], rows: full.map((l, i) => [l, String(r.daily[i]?.logs ?? 0)]) }}>
        <XYChart kind="bar" labels={full} shortLabels={labels} format={(n) => `${n} việc`} axisFormat={compactNumber}
          series={[{ label: 'Việc đã ghi', tone: 'info' }]} values={[r.daily.map((d) => d.logs)]} ariaLabel="Số việc đã ghi từng ngày trong tuần" />
      </ChartCard>

      <div className={`card ${attentionCount(a) > 0 ? 'alert-warn' : ''}`}>
        <h2>Cần chú ý lúc này</h2>
        {attentionCount(a) === 0 && <p className="muted">Không có gì cần xử lý gấp.</p>}
        {a.overdue_payables && a.overdue_payables.count > 0 && (
          <p><span className="pill err">Quá hạn</span> {a.overdue_payables.count} hóa đơn mua ({money(a.overdue_payables.amount)}) <button type="button" className="link inline" onClick={() => onSection('payables')}>Xem công nợ</button></p>
        )}
        {a.overdue_receivables && a.overdue_receivables.count > 0 && (
          <p><span className="pill err">Quá hạn</span> {a.overdue_receivables.count} khoản phải thu ({money(a.overdue_receivables.amount)}) <button type="button" className="link inline" onClick={() => onSection('payables')}>Xem công nợ</button></p>
        )}
        {!!a.low_stock && <p><span className="pill warn">Kho</span> {a.low_stock} vật tư sắp hết hoặc đã hết</p>}
        {a.late_cycles > 0 && <p><span className="pill warn">Tiến độ</span> {a.late_cycles} vụ trễ tiến độ</p>}
        {a.open_incidents > 0 && <p><span className="pill warn">Sự cố</span> {a.open_incidents} sự cố đang mở{a.overdue_actions > 0 ? `, ${a.overdue_actions} việc khắc phục quá hạn` : ''}</p>}
        {a.pending_attendance > 0 && <p><span className="pill warn">Chấm công</span> {a.pending_attendance} ca công chờ xác nhận</p>}
        {!!a.web_orders_waiting && (
          <p><span className="pill warn">Website</span> {a.web_orders_waiting} đơn chờ báo giá <button type="button" className="link inline" onClick={() => onSection('website')}>Xem đơn</button></p>
        )}
      </div>

      <div className="btnrow">
        <button type="button" onClick={() => void share()}>Chia sẻ tóm tắt</button>
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}
