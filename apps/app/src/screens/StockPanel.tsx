import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ExpiringLots } from '../components/ExpiringLots';
import { PurchaseEntry } from '../components/PurchaseEntry';
import { StockEntry } from '../components/StockEntry';
import { StockIssue, StockReturn, StockTransfer } from '../components/StockMove';
import { StockReports } from '../components/StockReports';
import { Thumb } from '../components/ImagePicker';
import { useConfig } from '../lib/config';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import {
  fetchTransactions, formatMoney, formatQty, ISSUE_KIND_LABEL, pendingDeltas, syncInventoryDown, TXN_TYPE_LABEL, type TxnFilter, type TxnHistoryRow,
} from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { authorLabel } from '../lib/roles';
import { useTable } from '../lib/tables';

type Mode = 'list' | 'receipt' | 'adjustment' | 'purchase' | 'issue' | 'transfer' | 'return';

/**
 * Kho (mục con của Sản xuất): tồn kho dạng lưới có tìm kiếm và bộ lọc, sổ kho từng vật tư (nhập – xuất – điều chỉnh kèm tồn sau mỗi dòng),
 * giao dịch có lọc, nhập kho, điều chỉnh, mua theo hóa đơn. Danh mục vật tư/kho nằm ở tab Khai báo.
 */
export function StockPanel() {
  const { active } = useOrgs();
  const [mode, setMode] = useState<Mode>('list');
  if (!active) return null;
  const canWrite = canPerm(active.perms, 'inventory', 'edit');
  // mua có hóa đơn tạo cả hóa đơn (quyền sửa Chi phí) lẫn nhập kho (quyền sửa Kho)
  const canPurchase = canWrite && canPerm(active.perms, 'expenses', 'edit');
  if (mode === 'purchase') return <PurchaseEntry orgId={active.id} canInvoice={canPurchase} onClose={() => setMode('list')} />;
  if (mode === 'issue') return <StockIssue orgId={active.id} onClose={() => setMode('list')} />;
  if (mode === 'transfer') return <StockTransfer orgId={active.id} onClose={() => setMode('list')} />;
  if (mode === 'return') return <StockReturn orgId={active.id} onClose={() => setMode('list')} />;
  if (mode !== 'list') return <StockEntry orgId={active.id} mode={mode} onClose={() => setMode('list')} />;
  return <StockList orgId={active.id} canWrite={canWrite} onReceipt={() => setMode('purchase')} onAdjust={() => setMode('adjustment')} onIssue={() => setMode('issue')} onTransfer={() => setMode('transfer')} onReturn={() => setMode('return')} />;
}

function useStockData(orgId: string) {
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useTable('units');
  const balances = useLiveQuery(() => db.balances.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const outbox = useLiveQuery(() => db.outbox.where('table').equals('inventory_transactions').toArray(), [], []);
  const pending = useMemo(() => pendingDeltas(outbox), [outbox]);
  const unitOf = (unitId: string) => units.find((u) => u.id === unitId)?.name.toLowerCase() ?? '';
  const matName = (id: string) => materials.find((m) => m.id === id)?.name ?? '—';
  const matUnit = (id: string) => unitOf(materials.find((m) => m.id === id)?.base_unit_id ?? '');
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';
  return { materials, locations, balances, outbox, pending, unitOf, matName, matUnit, locName };
}

type View = 'stock' | 'txns' | 'report';

function StockList({ orgId, canWrite, onReceipt, onAdjust, onIssue, onTransfer, onReturn }: { orgId: string; canWrite: boolean; onReceipt: () => void; onAdjust: () => void; onIssue: () => void; onTransfer: () => void; onReturn: () => void; onPurchase?: () => void }) {
  const d = useStockData(orgId);
  const [view, setView] = useState<View>('stock');
  const [ledgerOf, setLedgerOf] = useState<string | null>(null);
  const pendingCount = [...d.pending.keys()].length;

  useEffect(() => { if (navigator.onLine) void syncInventoryDown().catch(() => undefined); }, [orgId, d.outbox.length]);

  if (ledgerOf) return <Ledger orgId={orgId} materialId={ledgerOf} d={d} onBack={() => setLedgerOf(null)} />;

  return (
    <>
      {canWrite && (
        <div className="actions">
          <button className="primary" onClick={onReceipt}>Nhập kho</button>
          <button className="secondary" onClick={onIssue}>Xuất kho</button>
          <button className="secondary" onClick={onTransfer}>Chuyển kho</button>
          <button className="secondary" onClick={onReturn}>Trả về kho</button>
          <button className="secondary" onClick={onAdjust}>Điều chỉnh tồn</button>
        </div>
      )}
      {pendingCount > 0 && <p className="msg warn" role="status">Có giao dịch kho chưa gửi lên máy chủ; số tồn dưới đây đã tính cả các giao dịch này.</p>}
      <div className="seg" role="tablist" aria-label="Chế độ xem kho">
        <button role="tab" aria-selected={view === 'stock'} className={view === 'stock' ? 'on' : ''} onClick={() => setView('stock')}>Tồn kho</button>
        <button role="tab" aria-selected={view === 'txns'} className={view === 'txns' ? 'on' : ''} onClick={() => setView('txns')}>Giao dịch</button>
        <button role="tab" aria-selected={view === 'report'} className={view === 'report' ? 'on' : ''} onClick={() => setView('report')}>Báo cáo</button>
      </div>
      {view === 'stock'
        ? <StockGrid orgId={orgId} canWrite={canWrite} d={d} onLedger={setLedgerOf} />
        : view === 'txns' ? <TxnList orgId={orgId} d={d} refreshKey={d.outbox.length} /> : <StockReports orgId={orgId} />}
    </>
  );
}

type Data = ReturnType<typeof useStockData>;

function StockGrid({ canWrite, d, onLedger }: { orgId: string; canWrite: boolean; d: Data; onLedger: (id: string) => void }) {
  const cfg = useConfig();
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [group, setGroup] = useState('');
  const [low, setLow] = useState(false);
  const [neg, setNeg] = useState(false);

  const items = d.materials
    .filter((m) => m.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((m) => {
      const locIds = new Set<string>([
        ...d.balances.filter((b) => b.material_id === m.id).map((b) => b.location_id),
        ...[...d.pending.keys()].filter((k) => k.endsWith(`|${m.id}`)).map((k) => k.split('|')[0]!),
      ]);
      const perLoc = [...locIds].map((lid) => {
        const b = d.balances.find((x) => x.material_id === m.id && x.location_id === lid);
        return { locationId: lid, qty: (b?.balance ?? 0) + (d.pending.get(`${lid}|${m.id}`) ?? 0), missingCost: b?.receipts_missing_cost ?? 0 };
      });
      const shown = loc ? perLoc.filter((p) => p.locationId === loc) : perLoc;
      const total = shown.reduce((s, p) => s + p.qty, 0);
      const missingCost = shown.reduce((s, p) => s + p.missingCost, 0);
      const mine = d.balances.filter((b) => b.material_id === m.id && (!loc || b.location_id === loc));
      const lastReceipt = mine.reduce<string | null>((mx, b) => (b.last_receipt_date && (!mx || b.last_receipt_date > mx) ? b.last_receipt_date : mx), null);
      return { m, perLoc: shown, total, missingCost, lastReceipt };
    });

  const needle = q.trim().toLowerCase();
  const rows = items.filter(({ m, total }) => {
    if (needle && !`${m.name} ${m.manufacturer ?? ''} ${m.brand ?? ''}`.toLowerCase().includes(needle)) return false;
    if (group && cfg.choiceOf('material_groups', m.material_group, m.group_item) !== group) return false;
    if (loc && !items.find((x) => x.m.id === m.id)?.perLoc.length) return false;
    const isLow = m.reorder_threshold != null && total >= 0 && total <= m.reorder_threshold;
    if (low && !isLow) return false;
    if (neg && total >= 0) return false;
    return true;
  });
  const lowCount = items.filter(({ m, total }) => m.reorder_threshold != null && total >= 0 && total <= m.reorder_threshold).length;
  const negCount = items.filter(({ total }) => total < 0).length;

  return (
    <>
      <div className="filters">
        <label>Tìm vật tư<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, nhà sản xuất…" /></label>
        {d.locations.filter((l) => l.is_active).length > 1 && (
          <label>Kho
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">Tất cả kho</option>
              {d.locations.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label>Nhóm vật tư
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Tất cả nhóm</option>
            {cfg.materialGroups(group).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="check"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Sắp hết ({lowCount})</label>
        <label className="check"><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} /> Tồn âm ({negCount})</label>
      </div>

      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Vật tư</th><th>Nhóm</th><th className="num">Tồn</th><th>Nhập cuối</th></tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="muted">
                {d.materials.length === 0
                  ? (canWrite ? 'Chưa có vật tư. Vào Khai báo → Vật tư và Kho để thêm (cần có mạng).' : 'Chưa có vật tư. Hãy nhờ chủ cơ sở hoặc người phụ trách Kho & chi phí thêm vật tư.')
                  : 'Không có vật tư phù hợp bộ lọc.'}
              </td></tr>
            )}
            {rows.map(({ m, perLoc, total, missingCost, lastReceipt }) => {
              const isLow = m.reorder_threshold != null && total >= 0 && total <= m.reorder_threshold;
              return (
                <tr key={m.id} className={total < 0 ? 'off' : ''}>
                  <td>
                    <button className="link" onClick={() => onLedger(m.id)} aria-label={`Xem sổ kho ${m.name}`}><Thumb src={m.image} />{m.name}</button>
                    {total < 0 && <span className="pill err">Tồn âm — cần kiểm kê</span>}
                    {isLow && <span className="pill warn">Sắp hết</span>}
                    {missingCost > 0 && <span className="pill warn">{missingCost} lần nhập chưa ghi giá</span>}
                    {!loc && perLoc.length > 1 && perLoc.map((p) => <span className="sub" key={p.locationId}>{d.locName(p.locationId)}: {formatQty(p.qty)} {d.unitOf(m.base_unit_id)}</span>)}
                  </td>
                  <td className="muted">{cfg.materialGroupLabel(m.material_group, m.group_item)}</td>
                  <td className="num"><strong>{formatQty(total)}</strong> {d.unitOf(m.base_unit_id)}</td>
                  <td className="muted">{lastReceipt ? new Date(lastReceipt).toLocaleDateString('vi-VN') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Bấm tên vật tư để xem sổ kho (nhập, xuất, điều chỉnh và tồn sau mỗi lần).</p>
      <ExpiringLots />
    </>
  );
}

const typeText = (h: TxnHistoryRow) => {
  if (h.transfer_id) return h.quantity_delta > 0 ? 'Chuyển kho (nhận)' : 'Chuyển kho (đi)';
  if (h.issue_kind) return `Xuất kho: ${ISSUE_KIND_LABEL[h.issue_kind] ?? h.issue_kind}`;
  return h.txn_type === 'adjustment' ? `Điều chỉnh ${h.quantity_delta > 0 ? 'tăng' : 'giảm'}` : TXN_TYPE_LABEL[h.txn_type] ?? h.txn_type;
};

function detailText(h: TxnHistoryRow, locName: (id: string) => string): string {
  return [
    locName(h.location_id),
    h.unit_cost != null ? `giá ${formatMoney(h.unit_cost)}` : h.txn_type === 'receipt' ? 'chưa ghi giá' : '',
    h.purchase_bills?.partners?.name ? `mua của ${h.purchase_bills.partners.name}${h.purchase_bills.invoice_no ? ` (HĐ ${h.purchase_bills.invoice_no})` : ''}` : '',
    h.material_lots ? `lô ${h.material_lots.lot_no}${h.material_lots.expiry_date ? ` (hạn ${new Date(h.material_lots.expiry_date).toLocaleDateString('vi-VN')})` : ''}` : '',
    h.activity_log_id ? 'dùng khi ghi việc' : '',
    authorLabel(h.author_name, h.author_roles) ?? '',
    h.reason ? `lý do: ${h.reason}` : '',
  ].filter(Boolean).join(' · ');
}

/** Sổ kho của MỘT vật tư: mọi lần nhập – xuất – điều chỉnh, mới nhất trên cùng, kèm tồn sau mỗi dòng (tính lùi từ tồn hiện tại) */
function Ledger({ orgId, materialId, d, onBack }: { orgId: string; materialId: string; d: Data; onBack: () => void }) {
  const [loc, setLoc] = useState('');
  const [rows, setRows] = useState<TxnHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = d.materials.find((x) => x.id === materialId);
  const unit = d.matUnit(materialId);

  useEffect(() => {
    if (!navigator.onLine) { setRows([]); return; }
    setRows(null);
    fetchTransactions(orgId, { materialId, locationId: loc || undefined, limit: 500 }).then(setRows).catch((e) => setError(friendlyError(e)));
  }, [orgId, materialId, loc, d.outbox.length]);

  // tồn hiện tại theo máy chủ (không gồm phần chờ gửi) để tính lùi
  const current = d.balances.filter((b) => b.material_id === materialId && (!loc || b.location_id === loc)).reduce((s, b) => s + b.balance, 0);
  const withBalance = useMemo(() => {
    let after = current;
    return (rows ?? []).map((h) => { const r = { h, after }; after -= h.quantity_delta; return r; });
  }, [rows, current]);
  const activeLocs = d.locations.filter((l) => l.is_active);

  return (
    <>
      <div className="menubar">
        <button className="menu-back" onClick={onBack} aria-label="Quay lại tồn kho">‹ Tồn kho</button>
        <strong className="menu-cur">Sổ kho: {m?.name ?? '—'}</strong>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="card slim">
        <div className="row"><span>Tồn hiện tại{loc ? ` (${d.locName(loc)})` : ''}</span><strong>{formatQty(current)} {unit}</strong></div>
        {m?.reorder_threshold != null && <p className="muted">Báo sắp hết khi tồn ≤ {formatQty(m.reorder_threshold)} {unit}</p>}
      </div>
      {activeLocs.length > 1 && (
        <label>Kho
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">Tất cả kho</option>
            {activeLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      {!navigator.onLine && <p className="msg warn" role="status">Cần có mạng để xem sổ kho.</p>}
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Ngày / loại</th><th className="num">Số lượng</th><th className="num">Tồn sau</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={3} className="muted">Đang tải…</td></tr>}
            {rows !== null && rows.length === 0 && navigator.onLine && <tr><td colSpan={3} className="muted">Chưa có giao dịch nào.</td></tr>}
            {withBalance.map(({ h, after }) => (
              <tr key={h.id}>
                <td>{new Date(h.txn_date).toLocaleDateString('vi-VN')} · <strong>{typeText(h)}</strong><span className="sub">{detailText(h, d.locName)}</span></td>
                <td className={h.quantity_delta >= 0 ? 'num pos' : 'num neg'}>{h.quantity_delta > 0 ? '+' : ''}{formatQty(h.quantity_delta)}</td>
                <td className="num"><strong>{formatQty(after)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows !== null && rows.length >= 500 && <p className="muted">Chỉ hiện 500 giao dịch gần nhất.</p>}
      <p className="muted">Tồn sau tính theo số liệu trên máy chủ; giao dịch đang chờ gửi chưa nằm trong sổ.</p>
    </>
  );
}

/** Giao dịch kho có lọc theo loại, kho, vật tư và khoảng ngày (cần mạng) */
function TxnList({ orgId, d, refreshKey }: { orgId: string; d: Data; refreshKey: number }) {
  const [f, setF] = useState<TxnFilter>({});
  const [rows, setRows] = useState<TxnHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<TxnFilter>) => setF((cur) => ({ ...cur, ...p }));

  useEffect(() => {
    if (!navigator.onLine) { setRows([]); return; }
    setRows(null);
    setError(null);
    fetchTransactions(orgId, { ...f, limit: 200 }).then(setRows).catch((e) => setError(friendlyError(e)));
  }, [orgId, f, refreshKey]);

  return (
    <>
      <div className="filters">
        <label>Loại
          <select value={f.txnType ?? ''} onChange={(e) => set({ txnType: e.target.value || undefined })}>
            <option value="">Tất cả</option>
            <option value="receipt">Nhập kho</option>
            <option value="issue">Xuất kho (dùng, hao hụt, bán…)</option>
            <option value="adjustment">Điều chỉnh và chuyển kho</option>
          </select>
        </label>
        {d.locations.filter((l) => l.is_active).length > 1 && (
          <label>Kho
            <select value={f.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })}>
              <option value="">Tất cả kho</option>
              {d.locations.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label>Vật tư
          <select value={f.materialId ?? ''} onChange={(e) => set({ materialId: e.target.value || undefined })}>
            <option value="">Tất cả</option>
            {[...d.materials].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Từ ngày<input type="date" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label>Đến ngày<input type="date" value={f.to ?? ''} min={f.from} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {!navigator.onLine && <p className="msg warn" role="status">Cần có mạng để xem giao dịch.</p>}
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Ngày / vật tư</th><th>Loại</th><th className="num">Số lượng</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={3} className="muted">Đang tải…</td></tr>}
            {rows !== null && rows.length === 0 && navigator.onLine && <tr><td colSpan={3} className="muted">Không có giao dịch phù hợp.</td></tr>}
            {(rows ?? []).map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.txn_date).toLocaleDateString('vi-VN')} · <strong>{d.matName(h.material_id)}</strong><span className="sub">{detailText(h, d.locName)}</span></td>
                <td>{typeText(h)}</td>
                <td className={h.quantity_delta >= 0 ? 'num pos' : 'num neg'}>{h.quantity_delta > 0 ? '+' : ''}{formatQty(h.quantity_delta)} {d.matUnit(h.material_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows !== null && rows.length >= 200 && <p className="muted">Chỉ hiện 200 giao dịch gần nhất; thu hẹp bộ lọc để xem cũ hơn.</p>}
    </>
  );
}
