import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { syncDown } from '../lib/production';
import { supabase } from '../lib/supabase';

/**
 * Nạp dữ liệu mẫu (D96) cho chủ cơ sở để thử app: một trang trại, kho, thuốc có thời gian cách ly, vụ dưa lưới đang chạy với nhật ký
 * và một sự cố đang mở. Mỗi cơ sở một lần. Mọi mục có tiền tố "[MẪU]". Cần mạng.
 */
export function DemoDataCard({ orgId }: { orgId: string }) {
  const online = useOnline();
  const [seeded, setSeeded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    if (!supabase || !navigator.onLine) return;
    void supabase.from('demo_seeds').select('organization_id').eq('organization_id', orgId).maybeSingle()
      .then(({ data, error }) => { if (live) setSeeded(error ? null : Boolean(data)); });
    return () => { live = false; };
  }, [orgId]);

  async function seed() {
    if (!supabase) return;
    if (!window.confirm('Nạp dữ liệu mẫu để thử app? Sẽ tạo thêm trang trại, kho, thuốc, một vụ dưa lưới và nhật ký (đều có chữ [MẪU]). Chỉ nạp được một lần.')) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.rpc('seed_demo_data', { p_org: orgId, p_kind: 'melon' });
      if (error) throw new Error(error.message);
      await syncDown().catch(() => undefined);
      setSeeded(true);
      setMsg({ ok: true, text: 'Đã nạp dữ liệu mẫu. Mở màn Sản xuất để xem vụ "[MẪU] Dưa lưới vụ thử". Vụ đang trong thời gian cách ly, hãy thử ghi thu hoạch để xem cảnh báo.' });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="inline-form">
      {seeded ? (
        <p className="muted">Cơ sở này đã nạp dữ liệu mẫu (các mục có chữ [MẪU]). Khi dùng thật, nhờ người cài đặt dọn dữ liệu thử.</p>
      ) : (
        <>
          <p className="muted">Dữ liệu giả lập dưa lưới nhà màng để làm quen: có thuốc cách ly 7 và 14 ngày, nhật ký phun thuốc, bón phân và một sự cố đang xử lý.</p>
          <button className="secondary" disabled={busy || !online || seeded === null} onClick={() => void seed()}>Nạp dữ liệu mẫu dưa lưới</button>
        </>
      )}
      {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
