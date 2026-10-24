import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { daysLeft, listLicenses } from '../lib/licenses';
import { hasRole } from '../lib/roles';
import { listAdjustments, listAttendance, listWorkers } from '../lib/work';
import { cycleProgress } from '../lib/cycles';
import { addDays } from '../lib/dates';
import { todayLocal, toLocalInput } from '../lib/hooks';
import { formatQty } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useAuth } from '../lib/auth';
import { useTable } from '../lib/tables';
import { fetchPayables, fetchReceivables, summarizePayables } from '../lib/partners';

const HomeTrend = lazy(() => import('./HomeTrend')); // biểu đồ tải lười, không làm nặng gói đầu
const HomeWeekly = lazy(() => import('./HomeWeekly'));
const HomePay = lazy(() => import('./HomePay'));

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
  const logs = useTable('logs');
  const cycles = useTable('cycles');
  const stages = useTable('stages');
  const harvests = useTable('harvests');
  const expenses = useTable('expenses');
  const sales = useTable('sales');
  const balances = useTable('balances');
  const materials = useTable('materials');
  const [stamp] = useState(() => new Date()); // mốc để tải lại các số cần mạng khi mở Trang chủ
  const [pendingAtt, setPendingAtt] = useState(0);
  const [pendingAdj, setPendingAdj] = useState(0);
  const [openShiftAt, setOpenShiftAt] = useState<string | null>(null);
  const [licSoon, setLicSoon] = useState(0);
  const [licExpired, setLicExpired] = useState(0);
  const [debt, setDebt] = useState<ReturnType<typeof summarizePayables> | null>(null);
  const [recv, setRecv] = useState<ReturnType<typeof summarizePayables> | null>(null);

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
      // hóa đơn mua quá hạn / sắp đến hạn (chỉ người có quyền xem Chi phí; lỗi thì bỏ qua)
      if (canPerm(active?.perms, 'expenses')) {
        try {
          const p = summarizePayables(await fetchPayables(orgId, true));
          if (alive) setDebt(p);
        } catch { /* bỏ qua */ }
      }
      // khoản phải thu từ khách quá hạn / sắp đến hạn (chỉ người có quyền xem Doanh thu; lỗi thì bỏ qua)
      if (canPerm(active?.perms, 'sales')) {
        try {
          const rows = await fetchReceivables(orgId, true);
          if (alive) setRecv(summarizePayables(rows.map((r) => ({ ...r, bill_id: r.sale_id, paid: r.collected })) as never));
        } catch { /* bỏ qua */ }
      }
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
    const month = today.slice(0, 7);
    const mine = logs.filter((l) => !l.voided_at && l.cycle_id && cycleIds.has(l.cycle_id));
    return {
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

  return (
    <>
      {(canConfirmAtt || openShiftAt || licSoon + licExpired > 0 || (debt !== null && debt.overdueCount + debt.soonCount > 0) || (recv !== null && recv.overdueCount + recv.soonCount > 0)) && (
        <>
          <h2 className="sect">Tôi cần làm</h2>
          <div className="kpis">
            {openShiftAt && <KpiTile label="Bạn đang trong ca" value={new Date(openShiftAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} tone="info" note="bấm để Ra ca" onClick={() => onGo('production', 'attendance')} />}
            {canConfirmAtt && <KpiTile label="Chờ xác nhận chấm công" value={String(pendingAtt)} tone={pendingAtt > 0 ? 'warn' : 'ok'} note={pendingAtt > 0 ? 'bấm để xem và xác nhận' : 'đã xong'} onClick={() => onGo('production', 'attendance')} />}
            {isAdminRole && pendingAdj > 0 && <KpiTile label="Yêu cầu sửa công" value={String(pendingAdj)} tone="warn" note="chờ duyệt" onClick={() => onGo('production', 'attendance')} />}
            {debt !== null && debt.overdueCount > 0 && <KpiTile label="Hóa đơn mua quá hạn" value={String(debt.overdueCount)} tone="bad" note={`${shortMoney(debt.overdueAmount)} đồng`} onClick={() => onGo('reports', 'payables')} />}
            {debt !== null && debt.soonCount > 0 && <KpiTile label="Hóa đơn mua sắp đến hạn" value={String(debt.soonCount)} tone="warn" note={`${shortMoney(debt.soonAmount)} đồng · trong 7 ngày`} onClick={() => onGo('reports', 'payables')} />}
            {recv !== null && recv.overdueCount > 0 && <KpiTile label="Khoản phải thu quá hạn" value={String(recv.overdueCount)} tone="bad" note={`${shortMoney(recv.overdueAmount)} đồng`} onClick={() => onGo('reports', 'payables')} />}
            {recv !== null && recv.soonCount > 0 && <KpiTile label="Khoản phải thu sắp đến hạn" value={String(recv.soonCount)} tone="warn" note={`${shortMoney(recv.soonAmount)} đồng · trong 7 ngày`} onClick={() => onGo('reports', 'payables')} />}
            {licExpired > 0 && <KpiTile label="Giấy phép đã hết hạn" value={String(licExpired)} tone="bad" note="xem ở Tài khoản" onClick={() => onGo('profile')} />}
            {licSoon > 0 && <KpiTile label="Giấy phép sắp hết hạn" value={String(licSoon)} tone="warn" note="trong 30 ngày" onClick={() => onGo('profile')} />}
          </div>
        </>
      )}

      <Suspense fallback={null}><HomePay orgId={active.id} onOpen={() => onGo('reports', 'paybook')} /></Suspense>

      <h2 className="sect">Của cơ sở</h2>
      <div className="kpis">
        <KpiTile label="Vụ đang sản xuất" value={String(running.length)} tone="info" />
        <KpiTile label="Việc ghi hôm nay" value={String(stat.orgToday)} tone={stat.orgToday > 0 ? 'ok' : 'neutral'} note="của cả cơ sở" />
        <KpiTile label="Vụ trễ tiến độ" value={String(late.length)} tone={late.length > 0 ? 'warn' : 'ok'} note={late.length > 0 ? 'cần xem lại' : 'đúng tiến độ'} />
        {canStock && <KpiTile label="Vật tư cần chú ý" value={String(stockAlerts.length)} tone={stockAlerts.some((a) => a.state === 'neg') ? 'bad' : stockAlerts.length > 0 ? 'warn' : 'ok'} note={stockAlerts.length > 0 ? 'sắp hết hoặc tồn âm' : 'ổn'} />}
        {canHarvest && <KpiTile label="Thu hoạch tháng này" value={`${formatQty(stat.harvestKg)} kg`} tone="ok" note="sau hao hụt" />}
        {canExpense && <KpiTile label="Chi phí đã ghi tháng này" value={shortMoney(stat.spent)} tone="bad" title={fullMoney(stat.spent)} note="đồng" />}
        {canSale && <KpiTile label="Doanh thu tháng này" value={shortMoney(stat.earned)} tone="ok" title={fullMoney(stat.earned)} note="đồng" />}
      </div>
      {hasRole(active.roles, 'manager') && <Suspense fallback={null}><HomeWeekly orgId={active.id} onOpen={() => onGo('reports', 'weekly')} /></Suspense>}
      {(canExpense || canSale || canHarvest) && <Suspense fallback={null}><HomeTrend orgId={active.id} /></Suspense>}
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
    </>
  );
}
