import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { Collapsible } from './Collapsible';

interface Pending { status: string; requested_at: string; scheduled_for: string }
const fmt = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/**
 * Xóa tài khoản trong app (D220; cửa hàng ứng dụng bắt buộc). Gửi yêu cầu, có thời gian chờ để đổi ý (mặc định 14 ngày),
 * sau đó quản trị xóa tài khoản và dữ liệu của cơ sở mà bạn là chủ duy nhất. Hủy yêu cầu được bất cứ lúc nào trước khi xóa.
 */
export function DeleteAccountSection() {
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !navigator.onLine) return;
    const { data, error: e } = await supabase.rpc('my_account_deletion');
    if (!e) setPending((data as Pending | null) ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function request(ev: FormEvent) {
    ev.preventDefault();
    if (!supabase || busy) return;
    if (typed.trim().toUpperCase() !== 'XÓA') return setError('Hãy gõ chữ XÓA để xác nhận.');
    setBusy(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('request_account_deletion', { p_reason: reason.trim() || null });
      if (e) throw new Error(e.message);
      setTyped(''); setReason('');
      await load();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!supabase || busy) return;
    setBusy(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('cancel_account_deletion');
      if (e) throw new Error(e.message);
      await load();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return (
    <Collapsible title="Xóa tài khoản" summary={pending ? `đã yêu cầu, xóa sau ${fmt(pending.scheduled_for)}` : undefined} warn={!!pending}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {pending ? (
        <>
          <p className="msg warn">Bạn đã yêu cầu xóa tài khoản. Tài khoản và dữ liệu sẽ bị xóa sau ngày <strong>{fmt(pending.scheduled_for)}</strong>. Trước đó bạn vẫn dùng bình thường và có thể hủy yêu cầu.</p>
          <div className="actions"><button type="button" className="primary" disabled={busy} onClick={() => void cancel()}>Hủy yêu cầu xóa</button></div>
        </>
      ) : (
        <form className="inline-form" onSubmit={(e) => void request(e)}>
          <p>Khi xóa, <strong>không khôi phục được</strong>: tài khoản đăng nhập, và nếu bạn là chủ duy nhất của một cơ sở thì cả cơ sở đó (vụ, nhật ký, kho, chi phí, nhân sự, tài khoản nhân viên...) bị xóa. Cơ sở khác mà bạn chỉ là thành viên thì giữ nguyên.</p>
          <p className="muted">Có thời gian chờ để đổi ý. Muốn lưu lại số liệu, hãy xuất dữ liệu trước khi xóa.</p>
          <label>Lý do (không bắt buộc)<input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
          <label>Gõ chữ XÓA để xác nhận<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
          <div className="actions"><button type="submit" className="secondary" disabled={busy || !navigator.onLine}>Yêu cầu xóa tài khoản</button></div>
        </form>
      )}
    </Collapsible>
  );
}
