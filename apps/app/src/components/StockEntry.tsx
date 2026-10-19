import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SYNC_STATE_LABEL_VI } from '@agriconnect/shared';
import { SyncBadge } from './SyncBadge';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useRecordSync } from '../lib/hooks';
import { parseNumber, recordTransaction } from '../lib/inventory';

const LAST_LOCATION_KEY = 'agriconnect.lastLocation';

/** Nhập kho hoặc điều chỉnh tồn. Giao dịch chỉ thêm; điều chỉnh bắt buộc có lý do (v1.1 mục 4.4). Dùng được offline. */
export function StockEntry({ orgId, mode, onClose }: { orgId: string; mode: 'receipt' | 'adjustment'; onClose: () => void }) {
  const sync = useRecordSync();
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useLiveQuery(() => db.units.toArray(), [], []);

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
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

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
    if (mode === 'adjustment' && reason.trim().length < 3) return setError('Điều chỉnh cần ghi lý do (ví dụ: kiểm kê, hao hụt, hỏng).');
    try {
      const id = await recordTransaction({
        organizationId: orgId, locationId: effLocation, materialId: effMaterial, type: mode,
        quantity: q, direction, unitCost: c, date, reason,
      });
      try { localStorage.setItem(LAST_LOCATION_KEY, effLocation); } catch { /* bỏ qua */ }
      setSavedId(id);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function again() {
    setSavedId(null);
    setQty('');
    setCost('');
    setReason('');
    setError(null);
  }

  const title = mode === 'receipt' ? 'Nhập kho' : 'Điều chỉnh tồn kho';

  if (savedId) {
    const s = sync.get(savedId);
    return (
      <section>
        <h1>Đã ghi</h1>
        <p className="msg ok" role="status">
          {s && s.state !== 'synced' ? SYNC_STATE_LABEL_VI.local_only : SYNC_STATE_LABEL_VI.synced}
        </p>
        <SyncBadge sync={s} />
        {(!s || s.state !== 'synced') && !navigator.onLine && <p className="muted">Giao dịch đang nằm trên điện thoại và sẽ tự gửi khi có mạng.</p>}
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
        <label>
          Ngày
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {mode === 'adjustment' ? 'Lý do (bắt buộc)' : 'Ghi chú (không bắt buộc)'}
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!navigator.onLine && <p className="msg warn">Đang offline. Giao dịch sẽ được lưu trên điện thoại và gửi sau.</p>}
        <button type="submit" className="primary">Lưu</button>
        <button type="button" className="link" onClick={onClose}>Hủy</button>
      </form>
    </section>
  );
}
