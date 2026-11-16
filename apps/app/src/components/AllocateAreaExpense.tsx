import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { syncFinanceDown, EXPENSE_CATEGORY_LABEL } from '../lib/finance';
import { formatMoney } from '../lib/inventory';
import { supabase } from '../lib/supabase';
import { todayLocal } from '../lib/hooks';
import { addDays, fmtDate } from '../lib/dates';
import { areaPath } from '../lib/areas';
import type { AreaRow } from '../lib/db';

interface Share { cycle_id: string; name: string; area_m2: number; days: number; amount: number }
interface Preview { shares: Share[]; skipped: { cycle_id: string; name: string; reason: string }[] }

/**
 * Chia chi phí chung (điện, nước, thuê đất, khấu hao, quản lý…) cho các vụ theo diện tích × số ngày trong kỳ, ở một trong ba phạm vi (D175):
 * cả cơ sở, một phân khu (gồm các ô con) hoặc một ô. Mỗi vụ nhận một khoản chi phí loại "phân bổ" kèm cách chia ở ghi chú.
 * Xem trước rồi mới ghi; bấm lặp không nhân đôi.
 */
export function AllocateAreaExpense({ orgId, areas, onDone }: { orgId: string; areas: AreaRow[]; onDone: (msg: string) => void }) {
  const [areaId, setAreaId] = useState('');   // '' = cả cơ sở
  const [from, setFrom] = useState(addDays(todayLocal(), -29));
  const [to, setTo] = useState(todayLocal());
  const [category, setCategory] = useState('utility');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [op, setOp] = useState(() => crypto.randomUUID());   // mã thao tác: bấm Ghi lặp không nhân đôi
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = Number(amount.replace(/[.,\s]/g, '')) || 0;
  const reset = () => { setPv(null); setOp(crypto.randomUUID()); };

  async function preview() {
    setError(null);
    if (amt <= 0) return setError('Hãy nhập số tiền lớn hơn 0.');
    if (to < from) return setError('Ngày kết thúc không thể trước ngày bắt đầu.');
    if (to > todayLocal()) return setError('Ngày kết thúc không được ở tương lai.');
    setBusy(true);
    try {
      const { data, error: e } = await supabase!.rpc('preview_shared_expense', { p_org: orgId, p_area: areaId || null, p_from: from, p_to: to, p_amount: amt });
      if (e) throw new Error(e.message);
      setPv(data as Preview);
    } catch (e) { setError(friendlyError(e)); setPv(null); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase!.rpc('allocate_shared_expense', { p_org: orgId, p_area: areaId || null, p_from: from, p_to: to, p_amount: amt, p_category: category, p_note: note.trim() || null, p_op: op });
      if (e) throw new Error(e.message);
      const r = data as { created: number; already: boolean };
      await syncFinanceDown().catch(() => undefined);
      reset(); setAmount(''); setNote('');
      onDone(r.already ? 'Khoản chia này đã được ghi trước đó.' : `Đã chia chi phí chung cho ${r.created} vụ (loại "phân bổ").`);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (areas.length === 0) return <p className="muted">Chưa có vụ nào để chia chi phí.</p>;
  return (
    <div className="inline-form">
      <p className="muted">Dùng cho chi phí chung (điện, nước, thuê đất, khấu hao, quản lý…): chia cho các vụ chạy trong phạm vi đã chọn theo diện tích × số ngày trong kỳ.</p>
      <label>Phạm vi chia
        <select value={areaId} onChange={(e) => { setAreaId(e.target.value); reset(); }}>
          <option value="">Cả cơ sở (mọi vụ)</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.parent_id ? `Ô ${areaPath(a.id, areas)}` : `Phân khu ${a.name}${areas.some((x) => x.parent_id === a.id) ? ' (gồm các ô con)' : ''}`}</option>)}
        </select>
      </label>
      <div className="pair">
        <label>Từ ngày<input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); reset(); }} /></label>
        <label>Đến ngày<input type="date" value={to} min={from} max={todayLocal()} onChange={(e) => { setTo(e.target.value); reset(); }} /></label>
      </div>
      <div className="pair">
        <label>Nhóm chi phí
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(EXPENSE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Tổng số tiền (đồng)<input value={amount} inputMode="numeric" onChange={(e) => { setAmount(e.target.value); reset(); }} /></label>
      </div>
      <label>Ghi chú (không bắt buộc)<input value={note} maxLength={150} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: tiền điện bơm nước tháng 10" /></label>
      {error && <p className="msg error" role="alert">{error}</p>}
      <div className="btnrow"><button type="button" className="secondary" disabled={busy} onClick={() => void preview()}>Xem cách chia</button></div>
      {pv && (
        <div className="card slim">
          {pv.shares.length === 0 ? (
            <p className="msg warn">Trong kỳ {fmtDate(from)} – {fmtDate(to)}, ô không có vụ nào có diện tích (của vụ hoặc của ô) để chia.</p>
          ) : (
            <>
              <table className="grid">
                <thead><tr><th>Vụ</th><th>Diện tích</th><th>Ngày</th><th>Được chia</th></tr></thead>
                <tbody>{pv.shares.map((s) => <tr key={s.cycle_id}><td>{s.name}</td><td>{Math.round(s.area_m2).toLocaleString('vi-VN')} m²</td><td>{s.days}</td><td>{formatMoney(s.amount)}</td></tr>)}</tbody>
              </table>
              <p className="muted">Tổng {formatMoney(pv.shares.reduce((t, s) => t + Number(s.amount), 0))}. Mỗi vụ nhận một khoản chi phí loại "phân bổ" kèm cách chia ở ghi chú.</p>
            </>
          )}
          {pv.skipped.length > 0 && <p className="msg warn">Chưa được chia vì chưa có diện tích (của vụ hoặc của ô): {pv.skipped.map((s) => s.name).join(', ')}. Khai diện tích ở Sửa vụ hoặc ở ô rồi chia lại.</p>}
          {pv.shares.length > 0 && <div className="btnrow"><button type="button" className="primary" disabled={busy} onClick={() => void save()}>Ghi nhận chi phí cho các vụ</button></div>}
        </div>
      )}
    </div>
  );
}
