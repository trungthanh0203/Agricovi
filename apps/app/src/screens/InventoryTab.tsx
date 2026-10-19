import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Collapsible } from '../components/Collapsible';
import { CatalogSection } from '../components/CatalogSection';
import { ExpenseSection } from '../components/ExpenseSection';
import { HarvestSection } from '../components/HarvestSection';
import { SalesSection } from '../components/SalesSection';
import { SummarySection } from '../components/SummarySection';
import { StockEntry } from '../components/StockEntry';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import {
  fetchRecentTransactions, formatMoney, formatQty, pendingDeltas, syncInventoryDown, TXN_TYPE_LABEL, type TxnHistoryRow,
} from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { authorLabel, hasRole } from '../lib/roles';

type View = 'stock' | 'harvest' | 'expense' | 'sales' | 'summary' | 'catalog' | 'receipt' | 'adjustment';

/** Tab "Vật tư & chi phí": Tồn kho (C1), Thu hoạch (C4), Chi phí và Doanh thu (C3), Danh mục. Tổng kết vụ (C5). */
export function InventoryTab() {
  const { active } = useOrgs();
  const canViewStock = hasRole(active?.roles, 'manager', 'inventory_finance');
  // chi phí và doanh thu: chủ, quản lý, Kho & chi phí, Quản lý HTX xem được (nhân viên, tổ trưởng thì không)
  const canViewMoney = hasRole(active?.roles, 'manager', 'inventory_finance', 'cooperative_manager');
  // người không xem được tồn kho (nhân viên) mở thẳng mục Thu hoạch
  const [view, setView] = useState<View>(canViewStock ? 'stock' : 'harvest');
  if (!active) return null;

  const canWrite = hasRole(active.roles, 'inventory_finance');

  if (view === 'receipt' || view === 'adjustment') {
    return <StockEntry orgId={active.id} mode={view} onClose={() => setView('stock')} />;
  }

  return (
    <section>
      <h1>Vật tư & chi phí</h1>
      <div className="chips" role="tablist" aria-label="Mục vật tư">
        <button role="tab" aria-selected={view === 'stock'} className={view === 'stock' ? 'chip active' : 'chip'} onClick={() => setView('stock')}>Tồn kho</button>
        <button role="tab" aria-selected={view === 'harvest'} className={view === 'harvest' ? 'chip active' : 'chip'} onClick={() => setView('harvest')}>Thu hoạch</button>
        {canViewMoney && <button role="tab" aria-selected={view === 'expense'} className={view === 'expense' ? 'chip active' : 'chip'} onClick={() => setView('expense')}>Chi phí</button>}
        {canViewMoney && <button role="tab" aria-selected={view === 'sales'} className={view === 'sales' ? 'chip active' : 'chip'} onClick={() => setView('sales')}>Doanh thu</button>}
        {canViewMoney && <button role="tab" aria-selected={view === 'summary'} className={view === 'summary' ? 'chip active' : 'chip'} onClick={() => setView('summary')}>Tổng kết</button>}
        <button role="tab" aria-selected={view === 'catalog'} className={view === 'catalog' ? 'chip active' : 'chip'} onClick={() => setView('catalog')}>Danh mục</button>
      </div>

      {view === 'harvest' ? (
        <HarvestSection />
      ) : view === 'expense' && canViewMoney ? (
        <ExpenseSection />
      ) : view === 'sales' && canViewMoney ? (
        <SalesSection />
      ) : view === 'summary' && canViewMoney ? (
        <SummarySection />
      ) : view === 'catalog' ? (
        <CatalogSection orgId={active.id} canWrite={canWrite} />
      ) : canViewStock ? (
        <StockList orgId={active.id} canWrite={canWrite} onReceipt={() => setView('receipt')} onAdjust={() => setView('adjustment')} />
      ) : (
        <div className="card">
          <p>Vai trò của bạn không xem được tồn kho và chi phí.</p>
          <p className="muted">Khi dùng vật tư, hãy chọn vật tư trong màn hình "Ghi việc vừa làm".</p>
        </div>
      )}
    </section>
  );
}

function StockList({ orgId, canWrite, onReceipt, onAdjust }: { orgId: string; canWrite: boolean; onReceipt: () => void; onAdjust: () => void }) {
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useLiveQuery(() => db.units.toArray(), [], []);
  const balances = useLiveQuery(() => db.balances.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const outbox = useLiveQuery(() => db.outbox.where('table').equals('inventory_transactions').toArray(), [], []);
  const pending = useMemo(() => pendingDeltas(outbox), [outbox]);
  const pendingCount = [...pending.keys()].length;

  const [history, setHistory] = useState<TxnHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.onLine) return;
    void syncInventoryDown().catch(() => undefined);
    fetchRecentTransactions(orgId).then(setHistory).catch((e) => setError(friendlyError(e)));
  }, [orgId, outbox.length]);

  const items = materials
    .filter((m) => m.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((m) => {
      const locIds = new Set<string>([
        ...balances.filter((b) => b.material_id === m.id).map((b) => b.location_id),
        ...[...pending.keys()].filter((k) => k.endsWith(`|${m.id}`)).map((k) => k.split('|')[0]!),
      ]);
      const perLoc = [...locIds].map((lid) => {
        const b = balances.find((x) => x.material_id === m.id && x.location_id === lid);
        return { locationId: lid, qty: (b?.balance ?? 0) + (pending.get(`${lid}|${m.id}`) ?? 0), missingCost: b?.receipts_missing_cost ?? 0 };
      });
      const total = perLoc.reduce((s, p) => s + p.qty, 0);
      const missingCost = perLoc.reduce((s, p) => s + p.missingCost, 0);
      return { m, perLoc, total, missingCost };
    });

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';
  const matName = (id: string) => materials.find((m) => m.id === id)?.name ?? '—';
  const unitOf = (unitId: string) => units.find((u) => u.id === unitId)?.name.toLowerCase() ?? '';
  const matUnit = (id: string) => unitOf(materials.find((m) => m.id === id)?.base_unit_id ?? '');

  return (
    <>
      {canWrite && (
        <div className="actions">
          <button className="primary" onClick={onReceipt}>Nhập kho</button>
          <button className="secondary" onClick={onAdjust}>Điều chỉnh tồn</button>
        </div>
      )}
      {pendingCount > 0 && <p className="msg warn" role="status">Có giao dịch kho chưa gửi lên máy chủ; số tồn dưới đây đã tính cả các giao dịch này.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {items.length === 0 && (
        <div className="card">
          <p>Chưa có vật tư nào.</p>
          <p className="muted">{canWrite ? 'Vào mục "Danh mục" để thêm kho và vật tư (cần có mạng).' : 'Hãy nhờ chủ cơ sở hoặc người phụ trách Kho & chi phí thêm vật tư.'}</p>
        </div>
      )}

      {items.map(({ m, perLoc, total, missingCost }) => {
        const low = m.reorder_threshold != null && total >= 0 && total <= m.reorder_threshold;
        return (
          <div className={total < 0 ? 'card slim conflict' : 'card slim'} key={m.id}>
            <div className="row">
              <strong className="grow">{m.name}</strong>
              <strong>{formatQty(total)} {unitOf(m.base_unit_id)}</strong>
            </div>
            <div className="badges">
              {total < 0 && <span className="pill err">Tồn âm — cần kiểm kê</span>}
              {low && <span className="pill warn">Sắp hết</span>}
              {missingCost > 0 && <span className="pill warn">{missingCost} lần nhập chưa ghi giá</span>}
            </div>
            {perLoc.length > 1 && perLoc.map((p) => (
              <p className="muted" key={p.locationId}>{locName(p.locationId)}: {formatQty(p.qty)} {unitOf(m.base_unit_id)}</p>
            ))}
          </div>
        );
      })}

      <Collapsible title="Giao dịch gần đây" summary={!navigator.onLine ? 'Cần có mạng' : history ? `${history.length} giao dịch` : 'Đang tải…'}>
      {navigator.onLine && history && history.length === 0 && <p className="muted">Chưa có giao dịch nào.</p>}
      {(history ?? []).map((h) => (
        <div className="card slim" key={h.id}>
          <div className="row">
            <strong className="grow">
              {matName(h.material_id)} {formatQty(Math.abs(h.quantity_delta))} {matUnit(h.material_id)}
              {authorLabel(h.author_name, h.author_roles) ? ` - ${authorLabel(h.author_name, h.author_roles)}` : ''}
            </strong>
            <span className="pill">{h.txn_type === 'adjustment' ? `Điều chỉnh ${h.quantity_delta > 0 ? '(tăng)' : '(giảm)'}` : TXN_TYPE_LABEL[h.txn_type] ?? h.txn_type}</span>
          </div>
          <p className="muted">
            {new Date(h.txn_date).toLocaleDateString('vi-VN')} · {locName(h.location_id)}
            {h.unit_cost != null ? ` · giá ${formatMoney(h.unit_cost)}` : h.txn_type === 'receipt' ? ' · chưa ghi giá' : ''}
            {h.activity_log_id ? ' · dùng khi ghi việc' : ''}
            {h.reason ? ` — ${h.reason}` : ''}
          </p>
        </div>
      ))}
      </Collapsible>
    </>
  );
}
