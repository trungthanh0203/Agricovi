import { useCallback, useEffect, useState } from 'react';
import { CycleQr } from './CycleQr';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { supabase } from '../lib/supabase';

interface PubStatus { code: string; is_visible: boolean; hidden_by_admin: boolean; published_at: string; version: number }

/**
 * Thanh nút của vụ ĐÃ CÔNG KHAI lên website (D157), đặt trên hai nút Danh sách / Lịch ở Quản lý vụ:
 * "Cập nhật mã QR vụ" (lấy số liệu mới nhất, vẽ lại mã QR để in/tải) và "Cập nhật lên website" (cập nhật bản công khai theo thông tin mới nhất của vụ; chỉ chủ cơ sở).
 * Vụ chưa công khai hoặc đang bị ẩn thì không hiện gì (việc công khai nằm ở danh sách vụ).
 */
export function PublishedCycleBar({ cycleId, label, canQr, canPublish }: { cycleId: string; label: string; canQr: boolean; canPublish: boolean }) {
  const online = useOnline();
  const [st, setSt] = useState<PubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState(0);   // mỗi lần bấm vẽ lại mã QR từ số liệu mới nhất
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const { data } = await supabase.from('public_cycles').select('code, is_visible, hidden_by_admin, published_at, version').eq('cycle_id', cycleId).maybeSingle();
    setSt((data as PubStatus | null) ?? null);
  }, [cycleId]);
  useEffect(() => { void load(); }, [load]);

  if (!st || !st.is_visible || st.hidden_by_admin) return null;

  async function updateWebsite() {
    if (!window.confirm('Cập nhật bản công khai trên website theo thông tin mới nhất của vụ?')) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const { error: e } = await supabase!.rpc('publish_cycle', { p_cycle: cycleId });
      if (e) throw new Error(e.message);
      await load();
      setMsg('Đã cập nhật lên website.');
    } catch (x) { setError(friendlyError(x)); } finally { setBusy(false); }
  }

  return (
    <div className="pubbox">
      <p className="muted">🌐 Vụ đang công khai trên website · mã <strong>{st.code}</strong> · bản {st.version} · {new Date(st.published_at).toLocaleDateString('vi-VN')}</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <div className="btnrow">
        {canQr && <button type="button" className="secondary" disabled={!online} onClick={() => { setShowQr(true); setQrKey((k) => k + 1); }}>Cập nhật mã QR vụ</button>}
        {canPublish && <button type="button" className="secondary" disabled={busy || !online} onClick={() => void updateWebsite()}>{busy ? 'Đang cập nhật…' : 'Cập nhật lên website'}</button>}
      </div>
      {showQr && canQr && (
        <div>
          <CycleQr key={qrKey} cycleId={cycleId} label={label} />
          <button type="button" className="link" onClick={() => setShowQr(false)}>Ẩn mã QR</button>
        </div>
      )}
    </div>
  );
}
