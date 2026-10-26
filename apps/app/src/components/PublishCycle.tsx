import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { supabase } from '../lib/supabase';

interface PubStatus { code: string; is_visible: boolean; hidden_by_admin: boolean; published_at: string; version: number }

/**
 * Công khai vụ lên website (D53): CHỈ chủ cơ sở bấm, sau khi đọc rõ thông tin nào sẽ hiện công khai. Không bao giờ tự công khai.
 * Bản công khai là ảnh chụp tại lúc bấm; thông tin vụ đổi sau đó thì bấm "Cập nhật bản công khai". Ngừng công khai có hiệu lực ngay.
 */
export function PublishCycle({ cycleId }: { cycleId: string }) {
  const online = useOnline();
  const [st, setSt] = useState<PubStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !navigator.onLine) { setLoaded(true); return; }
    const { data, error: e } = await supabase.from('public_cycles').select('code, is_visible, hidden_by_admin, published_at, version').eq('cycle_id', cycleId).maybeSingle();
    if (e) setError(friendlyError(e)); else setSt((data as PubStatus | null) ?? null);
    setLoaded(true);
  }, [cycleId]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase!.rpc(fn, { p_cycle: cycleId });
      if (e) throw new Error(e.message);
      await load();
    } catch (x) { setError(friendlyError(x)); } finally { setBusy(false); }
  }
  function publish(update: boolean) {
    const msg = update
      ? 'Cập nhật bản công khai theo thông tin mới nhất của vụ?'
      : 'CÔNG KHAI vụ này lên website?\n\nThông tin sẽ hiện cho mọi người: tên vụ, sản phẩm, phân khu và vị trí, ngày bắt đầu/kết thúc, phân - thuốc - vật tư đã dùng, giấy phép còn hạn của cơ sở.\n\nKHÔNG công khai: chi phí, doanh thu, nhật ký chi tiết, tiền công.\n\nBạn có thể ngừng công khai bất cứ lúc nào.';
    if (window.confirm(msg)) void run('publish_cycle');
  }

  if (!loaded) return <p className="muted">Đang tải…</p>;
  return (
    <div className="pubbox">
      {error && <p className="msg error" role="alert">{error}</p>}
      {!online && <p className="msg warn" role="status">Cần có mạng để công khai hoặc ngừng công khai.</p>}
      {st?.hidden_by_admin ? (
        <p className="msg warn" role="status">Vụ này đang bị quản trị viên tạm ẩn khỏi website. Hãy liên hệ để được xem xét.</p>
      ) : st?.is_visible ? (
        <>
          <p><span className="pill ok">🌐 Đang công khai</span> mã <strong>{st.code}</strong> · bản {st.version} · {new Date(st.published_at).toLocaleDateString('vi-VN')}</p>
          <div className="btnrow">
            <button className="secondary" disabled={busy || !online} onClick={() => publish(true)}>Cập nhật bản công khai</button>
            <button className="secondary" disabled={busy || !online} onClick={() => { if (window.confirm('Ngừng công khai vụ này? Trang truy xuất sẽ không còn hiển thị.')) void run('unpublish_cycle'); }}>Ngừng công khai</button>
          </div>
        </>
      ) : (
        <>
          {st && <p className="muted">Đã ngừng công khai.</p>}
          <button className="secondary" disabled={busy || !online} onClick={() => publish(false)}>🌐 Mở công khai website</button>
        </>
      )}
    </div>
  );
}
