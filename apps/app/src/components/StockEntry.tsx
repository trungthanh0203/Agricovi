import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { parseNumber, recordTransaction } from '../lib/inventory';
import { useTable } from '../lib/tables';

const LAST_LOCATION_KEY = 'agriconnect.lastLocation';

/** Nhập kho hoặc điều chỉnh tồn. Giao dịch chỉ thêm; điều chỉnh bắt buộc có lý do (v1.1 mục 4.4). Dùng được offline. */
export function StockEntry({ orgId, mode, onClose }: { orgId: string; mode: 'receipt' | 'adjustment'; onClose: () => void }) {
  const online = useOnline();
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useTable('units');

  const mats = materials.filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locs = locations.filter((l) => l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const remembered = (() => { try { return localStorage.getItem(LAST_LOCATION_KEY); } catch { return null; } })();
  const [materialId, setMaterialId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('decrease');
  const [reason, setReason] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [lotExpiry, setLotExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  const effLocation = locationId || (locs.find((l) => l.id === remembered)?.id ?? locs[0]?.id ?? '');
  const effMaterial = materialId || mats[0]?.id || '';
  const material = mats.find((m) => m.id === effMaterial);
  const unitName = units.find((u) => u.id === material?.base_unit_id)?.name ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!effMaterial) return setError('Hãy chọn vật tư.');
    if (!effLocation) return setError('Hãy chọn kho.');
    const q = parseNumber(qty);
    if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng phải là số lớn hơn 0.');
    const c = parseNumber(cost);
    if (c !== null && (Number.isNaN(c) || c < 0 || !Number.isInteger(c))) return setError('Giá nhập phải là số tiền (đồng), không có phần lẻ.');
    if (lotExpiry && !lotNo.trim()) return setError('Đã nhập hạn dùng thì cần nhập cả số lô.');
    if (mode === 'receipt' && date > todayLocal()) return setError('Ngày nhập kho không được sau ngày hôm nay.');
    if (mode === 'adjustment' && reason.trim().length < 3) return setError('Điều chỉnh cần ghi lý do (ví dụ: kiểm kê, hao hụt, hỏng).');
    setBusy(true);
    try {
      const id = await recordTransaction({
        id: draftId, organizationId: orgId, locationId: effLocation, materialId: effMaterial, type: mode,
        quantity: q, direction, unitCost: c, date, reason, lotNo, lotExpiry: lotExpiry || null,
      });
      try { localStorage.setItem(LAST_LOCATION_KEY, effLocation); } catch { /* bỏ qua */ }
      setSavedId(id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSavedId(null);
    setDraftId(crypto.randomUUID());
    setQty('');
    setCost('');
    setReason('');
    setLotNo('');
    setLotExpiry('');
    setError(null);
  }

  const title = mode === 'receipt' ? 'Nhập kho' : 'Điều chỉnh tồn kho';

  if (savedId) {
    return (
      <section>
        <h1>Đã ghi</h1>
        <p className="msg ok" role="status">Đã lưu lên máy chủ.</p>
        <button className="primary" onClick={again}>Ghi tiếp</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  if (mats.length === 0 || locs.length === 0) {
    return (
      <section>
        <h1>{title}</h1>
        <p className="msg warn">
          {mats.length === 0 ? 'Chưa có vật tư nào. ' : ''}{locs.length === 0 ? 'Chưa có kho nào. ' : ''}
          Hãy tạo trong mục "Danh mục" (cần có mạng), rồi quay lại đây.
        </p>
        <button className="secondary" onClick={onClose}>Quay lại</button>
      </section>
    );
  }

  return (
    <section>
      <h1>{title}</h1>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        <label>
          Vật tư
          <select value={effMaterial} onChange={(e) => setMaterialId(e.target.value)}>
            {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        {locs.length > 1 && (
          <label>
            Kho
            <select value={effLocation} onChange={(e) => setLocationId(e.target.value)}>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        {mode === 'adjustment' && (
          <fieldset>
            <legend>Điều chỉnh</legend>
            <label className="check">
              <input type="radio" name="dir" checked={direction === 'decrease'} onChange={() => setDirection('decrease')} /> Giảm tồn (hao hụt, hỏng, kiểm kê thấy ít hơn)
            </label>
            <label className="check">
              <input type="radio" name="dir" checked={direction === 'increase'} onChange={() => setDirection('increase')} /> Tăng tồn (kiểm kê thấy nhiều hơn)
            </label>
          </fieldset>
        )}
        <label>
          Số lượng{unitName ? ` (${unitName.toLowerCase()})` : ''}
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
        </label>
        {mode === 'receipt' && (
          <label>
            Giá nhập mỗi {unitName ? unitName.toLowerCase() : 'đơn vị'} (đồng, không bắt buộc)
            <input value={cost} inputMode="numeric" onChange={(e) => setCost(e.target.value)} />
            <small>Để trống nếu chưa biết giá. Khi đó báo cáo sẽ ghi rõ là thiếu giá vốn, không tự đoán.</small>
          </label>
        )}
        {mode === 'receipt' && (
          <div className="pair">
            <label>Số lô (không bắt buộc)<input value={lotNo} maxLength={60} onChange={(e) => setLotNo(e.target.value)} placeholder="Ghi trên bao bì" /></label>
            <label>Hạn dùng<input type="date" value={lotExpiry} onChange={(e) => setLotExpiry(e.target.value)} /></label>
          </div>
        )}
        <label>
          Ngày
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {mode === 'adjustment' ? 'Lý do (bắt buộc)' : 'Ghi chú (không bắt buộc)'}
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Nhập kho và điều chỉnh cần có mạng; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
