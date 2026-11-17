import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { disablePush, enablePush, getDigestPrefs, pushStatus, saveDigestPrefs, sendTestPush, type DigestPrefs, type PushStatus } from '../lib/push';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5);   // 5 giờ đến 21 giờ

const STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: 'Máy hoặc trình duyệt này chưa hỗ trợ thông báo.',
  'ios-install': 'Trên iPhone, hãy thêm Agricovi vào Màn hình chính (nút Chia sẻ → Thêm vào MH chính), mở app từ biểu tượng đó rồi quay lại đây để bật thông báo.',
  denied: 'Thông báo đang bị chặn cho Agricovi. Muốn bật, hãy cho phép thông báo trong cài đặt của máy hoặc trình duyệt, rồi quay lại đây.',
  off: 'Thông báo đang tắt trên máy này.',
  on: 'Thông báo đang bật trên máy này.',
};

/** Tài khoản → Thông báo (H2 lát 1): bật/tắt thông báo cho máy đang dùng và gửi thử. Chỉ xin quyền khi bấm nút. */
export function PushSettings() {
  const online = useOnline();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => { void pushStatus().then(setStatus); }, []);
  useEffect(refresh, [refresh]);
  const [prefs, setPrefs] = useState<DigestPrefs | null>(null);
  useEffect(() => { if (navigator.onLine) void getDigestPrefs().then(setPrefs).catch(() => undefined); }, []);
  async function savePrefs(next: DigestPrefs) {
    const before = prefs;
    setPrefs(next); setError(null); setMsg(null);
    try { await saveDigestPrefs(next); setMsg(next.enabled ? `Đã lưu: bản tin gửi lúc ${next.hour} giờ mỗi sáng.` : 'Đã tắt bản tin buổi sáng.'); } catch (e) { setPrefs(before); setError(friendlyError(e)); }
  }

  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setError(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); refresh(); }
  }

  if (!status) return null;
  return (
    <div className="inline-form">
      <p>{STATUS_TEXT[status]}</p>
      {status === 'off' && <button type="button" className="primary" disabled={busy || !online} onClick={() => void run(async () => { await enablePush(); return 'Đã bật thông báo. Bấm "Gửi thử" để kiểm tra.'; })}>Bật thông báo</button>}
      {status === 'on' && (
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy || !online} onClick={() => void run(async () => {
            const r = await sendTestPush();
            return r.sent > 0 ? `Đã gửi thử tới ${r.sent} máy. Nếu không thấy thông báo, hãy kiểm tra cài đặt thông báo của máy.` : 'Chưa có máy nào nhận được. Hãy tắt rồi bật lại thông báo.';
          })}>Gửi thử</button>
          <button type="button" className="secondary" disabled={busy || !online} onClick={() => void run(async () => { await disablePush(); return 'Đã tắt thông báo trên máy này.'; })}>Tắt thông báo</button>
        </div>
      )}
      {prefs && status !== 'unsupported' && (
        <div className="card slim">
          <p><strong>Bản tin buổi sáng</strong></p>
          <label className="check"><input type="checkbox" checked={prefs.enabled} disabled={!online} onChange={(e) => void savePrefs({ ...prefs, enabled: e.target.checked })} /> Nhận bản tin mỗi ngày (việc cần làm, mũi tiêm, công nợ…)</label>
          {prefs.enabled && (
            <label>Gửi lúc
              <select value={prefs.hour} disabled={!online} onChange={(e) => void savePrefs({ ...prefs, hour: Number(e.target.value) })}>
                {(HOURS.includes(prefs.hour) ? HOURS : [...HOURS, prefs.hour].sort((a, b) => a - b)).map((h) => <option key={h} value={h}>{h} giờ</option>)}
              </select>
            </label>
          )}
          <p className="muted">Cài đặt này áp dụng cho mọi máy đã bật thông báo của tài khoản. Không có việc cần nhắc thì không gửi.</p>
        </div>
      )}
      {!online && <p className="muted">Đang offline: bật, tắt và gửi thử cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <p className="muted">Thông báo đẩy có thể đến trễ hoặc không đến khi máy tiết kiệm pin; việc quan trọng luôn hiện ở Trang chủ. Nội dung không ghi số tiền hay tên khách.</p>
    </div>
  );
}
