import { useCallback, useEffect, useState } from 'react';
import { QrCard } from './QrCard';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { buildCycleQr, fetchCycleTrace } from '../lib/qr';

/** Mã QR truy xuất của một vụ: tên vụ, nơi trồng, thời gian, vật tư đã dùng. Lấy số liệu mới nhất từ máy chủ mỗi lần mở. */
export function CycleQr({ cycleId, label }: { cycleId: string; label: string }) {
  const online = useOnline();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try { setText(buildCycleQr(await fetchCycleTrace(cycleId))); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }, [cycleId]);
  useEffect(() => { if (navigator.onLine) void load(); }, [load]);

  return (
    <>
      {error && <p className="msg error" role="alert">{error}</p>}
      {!online && !text && <p className="msg warn">Cần có mạng để lấy thông tin mới nhất của vụ.</p>}
      {text && <QrCard text={text} filename={`qr-vu-${label.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30) || 'vu'}.png`} />}
      <button type="button" className="secondary" disabled={busy || !online} onClick={() => void load()}>{busy ? 'Đang tải…' : 'Cập nhật mã (thêm vật tư mới dùng)'}</button>
      <p className="muted">Mã chứa thông tin tại thời điểm tạo; vật tư dùng thêm sau này cần bấm "Cập nhật mã" rồi in lại.</p>
    </>
  );
}
