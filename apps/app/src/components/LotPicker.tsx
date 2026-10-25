import { useEffect, useState } from 'react';
import { fetchLots, type LotOption } from '../lib/inventory';
import { todayLocal } from '../lib/hooks';

/** Chọn lô tay cho một dòng vật tư đã dùng (không bắt buộc): để trống thì máy chủ tự gắn lô hạn gần nhất. Chỉ hiện khi có mạng và vật tư đã có lô. */
export function LotPicker({ materialId, lotId, reason, onLot, onReason }: {
  materialId: string; lotId: string; reason: string; onLot: (id: string, expired: boolean) => void; onReason: (v: string) => void;
}) {
  const [lots, setLots] = useState<LotOption[]>([]);
  useEffect(() => {
    let live = true;
    void fetchLots(materialId).then((r) => { if (live) setLots(r); });
    return () => { live = false; };
  }, [materialId]);
  if (lots.length === 0) return null;
  const today = todayLocal();
  const expired = (l: LotOption) => !!l.expiry_date && l.expiry_date < today;
  const chosen = lots.find((l) => l.id === lotId);
  return (
    <>
      <label>Lô (không bắt buộc)
        <select value={lotId} onChange={(e) => onLot(e.target.value, expired(lots.find((l) => l.id === e.target.value) ?? { id: '', lot_no: '', expiry_date: null }))}>
          <option value="">Tự chọn lô hạn gần nhất</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}{l.expiry_date ? ` · hạn ${l.expiry_date.split('-').reverse().join('/')}` : ''}{expired(l) ? ' (HẾT HẠN)' : ''}</option>)}
        </select>
      </label>
      {chosen && expired(chosen) && (
        <label>Lý do dùng lô đã hết hạn (bắt buộc)<input value={reason} maxLength={300} onChange={(e) => onReason(e.target.value)} placeholder="Ví dụ: đã kiểm tra, còn dùng được" /></label>
      )}
    </>
  );
}
