import { useMemo, useState } from 'react';
import { qrPng, qrSvg } from '../lib/qr';

/** Mã QR + nút tải ảnh PNG, sao chép nội dung và xem nội dung trong mã */
export function QrCard({ text, filename }: { text: string; filename: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const qr = useMemo(() => {
    try { return qrSvg(text); } catch (e) { return { error: e instanceof Error ? e.message : 'Lỗi' }; }
  }, [text]);
  if ('error' in qr) return <p className="msg error" role="alert">{qr.error}</p>;

  async function download() {
    try {
      const url = await qrPng((qr as { svg: string }).svg);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Không tải được ảnh.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(qr && 'text' in qr ? qr.text : text); setMsg('Đã sao chép nội dung.'); } catch { setMsg('Không sao chép được trên thiết bị này.'); }
  }

  return (
    <div className="qrcard">
      <div className="qrbox" role="img" aria-label="Mã QR" dangerouslySetInnerHTML={{ __html: qr.svg }} />
      {qr.truncated && <p className="msg warn">Nội dung dài nên mã chỉ chứa phần đầu.</p>}
      <button type="button" className="secondary" onClick={() => void download()}>Tải ảnh QR</button>
      {msg && <p className="muted" role="status">{msg}</p>}
      <details className="fold inline"><summary><span className="fold-title">Xem nội dung trong mã</span></summary><div className="fold-body">
        <button type="button" className="secondary" onClick={() => void copy()}>Chép nội dung</button>
        <pre className="qrtext">{qr.text}</pre>
      </div></details>
    </div>
  );
}
