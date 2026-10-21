import { useEffect, useMemo, useState } from 'react';
import { daysLeft, listLicenses } from '../lib/licenses';
import { hasRole } from '../lib/roles';
import { listAdjustments, listAttendance, listWorkers } from '../lib/work';
import { useLiveQuery } from 'dexie-react-hooks';
import { cycleProgress } from '../lib/cycles';
import { addDays, fmtDate } from '../lib/dates';
import { db } from '../lib/db';
import { todayLocal, toLocalInput } from '../lib/hooks';
import { formatQty } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { syncDown } from '../lib/production';
import { useAuth } from '../lib/auth';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** Thẻ số: nhãn nhỏ, số lớn, ghi chú/đơn vị. Màu có nghĩa cố định và luôn kèm chữ (docs/DESIGN_DASHBOARD.md). */
export function KpiTile({ label, value, note, tone = 'neutral', title, onClick }: { label: string; value: string; note?: string; tone?: Tone; title?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {note && <span className="kpi-note">{note}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={`kpi ${tone}`} title={title} onClick={onClick}>{inner}</button>
    : <div className={`kpi ${tone}`} title={title}>{inner}</div>;
}

/** Tiền rút gọn: 1,2 triệu · 3,4 tỷ (chạm vào thẻ để xem đủ số) */
export function shortMoney(n: number): string {
  const a = Math.abs(n);
  const f = (x: number) => x.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (a >= 1e9) return `${f(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${f(n / 1e6)} triệu`;
  if (a >= 1e3) return `${f(n / 1e3)} nghìn`;
  return f(n);
}
const fullMoney = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

/**
 * Thống kê Trang chủ (D41): của TÔI (việc đã ghi) và của CƠ SỞ (vụ, tiến độ, thu hoạch, chi, thu, tồn kho, cảnh báo).
 * Tính trên dữ liệu đã tải về máy (nhật ký 200 bản ghi gần nhất, thu hoạch/chi/thu 200 bản ghi gần nhất), nên xem được cả khi offline.
 * Phần tiền, thu hoạch, kho chỉ hiện với người có quyền xem mục đó.
 */
export function HomeStats({ cycleIds, onGo }: { cycleIds: Set<string>; onGo: (tab: 'production' | 'reports' | 'profile', section?: string) => void }) {
  const { active } = useOrgs();
  const { session } = useAuth();
  const uid = session?.user.id;
  const logs = useLiveQuery(() => db.logs.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const stages = useLiveQuery(() => db.stages.toArray(), [], []);
  const harvests = useLiveQuery(() => db.harvests.toArray(), [], []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const sales = useLiveQuery(() => db.sales.toArray(), [], []);
  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const materials = useLiveQuery(() => db.materials.toArray(), [], []);
  const [stamp, setStamp] = useState(() => new Date());
  const [pendingAtt, setPendingAtt] = useState(0);
  const [pendingAdj, setPendingAdj] = useState(0);
  const [openShiftAt, setOpenShiftAt] = useState<string | null>(null);
  const [licSoon, setLicSoon] = useState(0);
  const [licExpired, setLicExpired] = useState(0);
  const [busy, setBusy] = useState(false);

  const today = todayLocal();

  // Chấm công chờ xác nhận, yêu cầu sửa công, ca đang mở của tôi, giấy phép sắp hết hạn (cần mạng; lỗi thì bỏ qua)
  const orgId = active?.id;
  useEffect(() => {
    if (!orgId || !uid || !navigator.onLine) return;
    let alive = true;
    void (async () => {
      try {
        const att = await listAttendance(orgId, addDays(todayLocal(), -31));
        const w = await listWorkers(orgId);
        const me = w.find((x) => x.user_id === uid);
        if (!alive) return;
        setPendingAtt(att.filter((a) => a.ended_at && a.status === 'needs_confirmation' && a.worker_id !== me?.id).length);
        setOpenShiftAt(att.find((a) => !a.ended_at && a.worker_id === me?.id && a.status !== 'rejected')?.started_at ?? null);
      } catch { /* bỏ qua */ }
      try {
        const adj = await listAdjustments(orgId);
        if (alive) setPendingAdj(adj.filter((x) => x.status === 'pending').length);
      } catch { /* bỏ qua */ }
      try {
        const lic = await listLicenses(orgId);
        if (alive) {
          setLicSoon(lic.filter((l) => { const d = daysLeft(l.expires_date); return d !== null && d >= 0 && d <= 30; }).length);
          setLicExpired(lic.filter((l) => { const d = daysLeft(l.expires_date); return d !== null && d < 0; }).length);
        }
      } catch { /* bỏ qua */ }
    })();
    return () => { alive = false; };
  }, [orgId, uid, stamp]);

  const stat = useMemo(() => {
    const day = (iso: string) => toLocalInput(new Date(iso)).slice(0, 10);
    const week = addDays(today, -6);
    const month = today.slice(0, 7);
    const mine = logs.filter((l) => !l.voided_at && l.cycle_id && cycleIds.has(l.cycle_id));
    const myLogs = mine.filter((l) => l.created_by === uid || l.performed_by === uid);
    return {
      myToday: myLogs.filter((l) => day(l.performed_at) === today).length,
      myWeek: myLogs.filter((l) => day(l.performed_at) >= week).length,
      orgToday: mine.filter((l) => day(l.performed_at) === today).length,
      harvestKg: harvests.filter((h) => !h.voided_at && cycleIds.has(h.cycle_id) && day(h.harvested_at).startsWith(month))
        .reduce((s, h) => s + Number(h.quantity) - Number(h.loss_quantity ?? 0), 0),
      spent: expenses.filter((e) => !e.voided_at && e.organization_id === active?.id && e.expense_date.startsWith(month)).reduce((s, e) => s + Number(e.amount), 0),
      earned: sales.filter((s) => !s.voided_at && s.organization_id === active?.id && s.sold_date.startsWith(month)).reduce((s, x) => s + Number(x.amount), 0),
    };
  }, [logs, harvests, expenses, sales, cycleIds, uid, today, active?.id]);

  if (!active) return null;
  const running = cycles.filter((c) => c.status === 'active' && cycleIds.has(c.id));
  const progress = running.map((c) => ({ c, p: cycleProgress(stages.filter((s) => s.cycle_id === c.id), today) }));
  const late = progress.filter((x) => x.p.delay > 0);

  // Tồn kho: cộng theo vật tư; âm hoặc ≤ mức "sắp hết"
  const canStock = canPerm(active.perms, 'inventory');
  const stockAlerts = canStock
    ? materials.filter((m) => m.organization_id === active.id && m.is_active).map((m) => {
      const total = balances.filter((b) => b.material_id === m.id).reduce((s, b) => s + b.balance, 0);
      const has = balances.some((b) => b.material_id === m.id);
      const state: 'neg' | 'low' | null = !has ? null : total < 0 ? 'neg' : m.reorder_threshold != null && total <= m.reorder_threshold ? 'low' : null;
      return state ? { m, total, state } : null;
    }).filter((x): x is { m: (typeof materials)[number]; total: number; state: 'neg' | 'low' } => x !== null)
    : [];

  const isAdminRole = hasRole(active.roles, 'manager');
  const canConfirmAtt = isAdminRole || pendingAtt > 0; // tổ trưởng chỉ thấy khi có người trong tổ chờ xác nhận
  const canHarvest = canPerm(active.perms, 'harvest');
  const canExpense = canPerm(active.perms, 'expenses');
  const canSale = canPerm(active.perms, 'sales');

  async function reload() {
    setBusy(true);
    try { await syncDown(); setStamp(new Date()); } catch { /* offline: giữ số cũ */ } finally { setBusy(false); }
  }

  return (
    <>
      <h2 className="sect">Của tôi</h2>
      <div className="kpis">
        <KpiTile label="Việc tôi ghi hôm nay" value={String(stat.myToday)} tone={stat.myToday > 0 ? 'ok' : 'neutral'} note={stat.myToday > 0 ? 'đã ghi' : 'chưa ghi việc nào'} />
        <KpiTile label="Việc tôi ghi 7 ngày qua" value={String(stat.myWeek)} tone="info" />
      </div>

      {(canConfirmAtt || openShiftAt || licSoon + licExpired > 0) && (
        <>
          <h2 className="sect">Cần làm</h2>
          <div className="kpis">
            {openShiftAt && <KpiTile label="Bạn đang trong ca" value={new Date(openShiftAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} tone="info" note="bấm để Ra ca" onClick={() => onGo('production', 'attendance')} />}
            {canConfirmAtt && <KpiTile label="Chờ xác nhận chấm công" value={String(pendingAtt)} tone={pendingAtt > 0 ? 'warn' : 'ok'} note={pendingAtt > 0 ? 'bấm để xem và xác nhận' : 'đã xong'} onClick={() => onGo('production', 'attendance')} />}
            {isAdminRole && pendingAdj > 0 && <KpiTile label="Yêu cầu sửa công" value={String(pendingAdj)} tone="warn" note="chờ duyệt" onClick={() => onGo('production', 'attendance')} />}
            {licExpired > 0 && <KpiTile label="Giấy phép đã hết hạn" value={String(licExpired)} tone="bad" note="xem ở Hồ sơ" onClick={() => onGo('profile')} />}
            {licSoon > 0 && <KpiTile label="Giấy phép sắp hết hạn" value={String(licSoon)} tone="warn" note="trong 30 ngày" onClick={() => onGo('profile')} />}
          </div>
        </>
      )}

      <h2 className="sect">{active.name}</h2>
      <div className="kpis">
        <KpiTile label="Vụ đang sản xuất" value={String(running.length)} tone="info" />
        <KpiTile label="Việc ghi hôm nay" value={String(stat.orgToday)} tone={stat.orgToday > 0 ? 'ok' : 'neutral'} note="của cả cơ sở" />
        <KpiTile label="Vụ trễ tiến độ" value={String(late.length)} tone={late.length > 0 ? 'warn' : 'ok'} note={late.length > 0 ? 'cần xem lại' : 'đúng tiến độ'} />
        {canStock && <KpiTile label="Vật tư cần chú ý" value={String(stockAlerts.length)} tone={stockAlerts.some((a) => a.state === 'neg') ? 'bad' : stockAlerts.length > 0 ? 'warn' : 'ok'} note={stockAlerts.length > 0 ? 'sắp hết hoặc tồn âm' : 'ổn'} />}
        {canHarvest && <KpiTile label="Thu hoạch tháng này" value={`${formatQty(stat.harvestKg)} kg`} tone="ok" note="sau hao hụt" />}
        {canExpense && <KpiTile label="Chi phí đã ghi tháng này" value={shortMoney(stat.spent)} tone="bad" title={fullMoney(stat.spent)} note="đồng" />}
        {canSale && <KpiTile label="Doanh thu tháng này" value={shortMoney(stat.earned)} tone="ok" title={fullMoney(stat.earned)} note="đồng" />}
      </div>
      <p className="muted">
        Cập nhật lúc {stamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · số liệu từ dữ liệu đã tải về máy{' '}
        <button className="link inline" disabled={busy || !navigator.onLine} onClick={() => void reload()}>{busy ? 'Đang tải…' : 'Tải lại'}</button>
      </p>

      {progress.length > 0 && (
        <>
          <h2 className="sect">Tiến độ các vụ đang chạy</h2>
          {progress.map(({ c, p }) => (
            <div className="card slim" key={c.id}>
              <div className="row">
                <strong className="grow">{c.name || c.template_name || 'Vụ'}</strong>
                {p.delay > 0 ? <span className="pill warn">Trễ {p.delay} ngày</span> : <span className="pill ok">Đúng tiến độ</span>}
              </div>
              {p.total > 0 ? (
                <>
                  <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${p.percent}%` }} /></div>
                  <p className="muted">{p.done}/{p.total} giai đoạn{p.current ? ` · Hiện tại: ${p.current.name} (đến ${fmtDate(p.current.planned_end)})` : ' · Đã hoàn tất'}</p>
                </>
              ) : <p className="muted">Chưa có giai đoạn.</p>}
            </div>
          ))}
          <button className="secondary" onClick={() => onGo('production', 'cycles')}>Mở màn Sản xuất</button>
        </>
      )}

      {(stockAlerts.length > 0) && (
        <div className="card alert-warn">
          <h2>Cảnh báo kho</h2>
          {stockAlerts.slice(0, 6).map((a) => (
            <p key={a.m.id}>
              <span className={a.state === 'neg' ? 'pill err' : 'pill warn'}>{a.state === 'neg' ? 'Tồn âm' : 'Sắp hết'}</span>{' '}
              {a.m.name}: {formatQty(a.total)}
            </p>
          ))}
          {stockAlerts.length > 6 && <p className="muted">… và {stockAlerts.length - 6} vật tư khác (xem ở Sản xuất → Kho).</p>}
        </div>
      )}
      {(canExpense || canSale) && <button className="link" onClick={() => onGo('reports')}>Xem báo cáo chi tiết</button>}
    </>
  );
}
