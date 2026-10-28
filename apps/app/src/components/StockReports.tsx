import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { buildStockCsv, fetchMaterialUse, fetchStockPeriod, useTotals, type PeriodRow, type UseRow } from '../lib/stockReports';
import { downloadCsv } from '../lib/summary';

type Which = 'period' | 'use';
const monthStart = () => `${todayLocal().slice(0, 7)}-01`;

/**
 * Báo cáo kho (K7): "Nhập – xuất – tồn" theo kỳ và "Vật tư dùng theo vụ". Tính ở máy chủ, chỉ đọc, cần có mạng.
 * Chọn kỳ rồi bấm Xem; xuất được file CSV mở bằng Excel.
 */
export function StockReports({ orgId }: { orgId: string }) {
  const online = useOnline();
  const { active } = useOrgs();
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []).filter((l) => l.is_active);
  const [which, setWhich] = useState<Which>('period');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [loc, setLoc] = useState('');
  const [period, setPeriod] = useState<PeriodRow[] | null>(null);
  const [use, setUse] = useState<UseRow[] | null>(null);
  const [shown, setShown] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (!from || !to) return setError('Hãy chọn từ ngày và đến ngày.');
    if (to < from) return setError('Đến ngày không được trước từ ngày.');
    setBusy(true);
    try {
      if (which === 'period') { setPeriod(await fetchStockPeriod(orgId, from, to, loc || null)); setUse(null); }
      else { setUse(await fetchMaterialUse(orgId, from, to)); setPeriod(null); }
      setShown({ from, to });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  function exportCsv() {
    if (!shown) return;
    const org = active?.name ?? '';
    if (which === 'period' && period) {
      downloadCsv(`nhap-xuat-ton-${shown.from}-${shown.to}.csv`, buildStockCsv('Nhập - xuất - tồn kho', org, shown.from, shown.to,
        ['Vật tư', 'Đơn vị', 'Tồn đầu kỳ', 'Nhập', 'Xuất', 'Điều chỉnh', 'Tồn cuối kỳ'], period.map((r) => [r.material_name, r.unit_name, r.opening, r.receipts, r.issues, r.adjustments, r.closing])));
    } else if (which === 'use' && use) {
      const t = useTotals(use);
      downloadCsv(`vat-tu-theo-vu-${shown.from}-${shown.to}.csv`, buildStockCsv('Vật tư dùng theo vụ', org, shown.from, shown.to,
        ['Vụ', 'Phân khu', 'Vật tư', 'Đơn vị', 'Số lượng', 'Giá vốn (đ)'], use.map((r) => [r.cycle_name, r.area_name, r.material_name, r.unit_name, r.quantity, r.cost]), ['Tổng', '', '', '', '', t.cost]));
    }
  }

  const t = use ? useTotals(use) : null;
  return (
    <div className="inline-form">
      <div className="chips" role="tablist" aria-label="Loại báo cáo kho">
        <button role="tab" aria-selected={which === 'period'} className={which === 'period' ? 'chip active' : 'chip'} onClick={() => { setWhich('period'); setShown(null); }}>Nhập – xuất – tồn</button>
        <button role="tab" aria-selected={which === 'use'} className={which === 'use' ? 'chip active' : 'chip'} onClick={() => { setWhich('use'); setShown(null); }}>Vật tư dùng theo vụ</button>
      </div>
      <div className="pair">
        <label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {which === 'period' && locations.length > 1 && (
        <label>Kho
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">Tất cả kho</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
      {!online && <p className="msg warn" role="status">Cần có mạng để xem báo cáo kho.</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy || !online} onClick={() => void run()}>{busy ? 'Đang tính…' : 'Xem báo cáo'}</button>
        {shown && <button className="secondary" onClick={exportCsv}>Xuất CSV</button>}
      </div>

      {shown && which === 'period' && period && (
        <>
          <p className="muted">Kỳ {fmtDate(shown.from)} – {fmtDate(shown.to)}{loc ? ` · ${locations.find((l) => l.id === loc)?.name ?? ''}` : ''}. Tồn cuối kỳ = tồn đầu kỳ + nhập − xuất + điều chỉnh (gồm chuyển kho, trả về kho, kiểm kê).</p>
          <div className="tablewrap">
            <table className="grid">
              <thead><tr><th>Vật tư</th><th className="num">Đầu kỳ</th><th className="num">Nhập</th><th className="num">Xuất</th><th className="num">Điều chỉnh</th><th className="num">Cuối kỳ</th></tr></thead>
              <tbody>
                {period.length === 0 && <tr><td colSpan={6} className="muted">Không có giao dịch kho nào.</td></tr>}
                {period.map((r) => (
                  <tr key={r.material_id}>
                    <td>{r.material_name}<span className="sub">{r.unit_name}</span></td>
                    <td className="num">{formatQty(r.opening)}</td><td className="num">{formatQty(r.receipts)}</td><td className="num">{formatQty(r.issues)}</td>
                    <td className="num">{formatQty(r.adjustments)}</td><td className="num"><strong>{formatQty(r.closing)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {shown && which === 'use' && use && t && (
        <>
          <p className="muted">Kỳ {fmtDate(shown.from)} – {fmtDate(shown.to)}. Số lượng là lượng đã xuất cho vụ trừ lượng đã trả về kho; giá vốn theo bình quân gia quyền.</p>
          <div className="tablewrap">
            <table className="grid">
              <thead><tr><th>Vụ</th><th>Vật tư</th><th className="num">Số lượng</th><th className="num">Giá vốn</th></tr></thead>
              <tbody>
                {use.length === 0 && <tr><td colSpan={4} className="muted">Chưa có vật tư nào xuất cho vụ trong kỳ.</td></tr>}
                {use.map((r) => (
                  <tr key={`${r.cycle_id}|${r.material_id}`}>
                    <td>{r.cycle_name}<span className="sub">{r.area_name}</span></td>
                    <td>{r.material_name}</td>
                    <td className="num">{formatQty(r.quantity)} {r.unit_name}</td>
                    <td className="num">{formatMoney(r.cost)}{r.cost_unknown > 0 ? ' *' : ''}</td>
                  </tr>
                ))}
              </tbody>
              {use.length > 0 && <tfoot><tr><td colSpan={3}><strong>Tổng giá vốn</strong></td><td className="num"><strong>{formatMoney(t.cost)}</strong></td></tr></tfoot>}
            </table>
          </div>
          {t.unknown > 0 && <p className="msg warn">* Có {t.unknown} lần xuất chưa có giá nhập nên chưa tính giá vốn. Hãy ghi giá khi nhập kho để báo cáo đủ.</p>}
        </>
      )}
    </div>
  );
}
