import { useEffect, useState } from 'react';
import { loadOlderFinance } from '../lib/finance';

/**
 * Danh sách dài chỉ vẽ 50 dòng đầu, bấm "Xem thêm" để vẽ tiếp (Đợt 2 hiệu năng, D140).
 * `resetKey` đổi (ví dụ bộ lọc/ô tìm đổi) thì quay về 50 dòng đầu.
 */
export function useShowMore<T>(items: T[], resetKey = '', step = 50) {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [resetKey, step]);
  const visible = items.length > n ? items.slice(0, n) : items;
  const more = items.length > n ? (
    <div className="btnrow">
      <button type="button" className="secondary" onClick={() => setN((x) => x + step)}>
        Xem thêm ({items.length - n} dòng nữa)
      </button>
    </div>
  ) : null;
  return { visible, more };
}

/** Nút "Tải thêm khoản cũ hơn" cho Chi phí/Doanh thu: đồng bộ nền chỉ giữ 200 khoản gần nhất (D141) */
export function LoadOlder({ kind, online, loaded }: { kind: 'expenses' | 'sales'; online: boolean; loaded: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  if (loaded < 200 && !done) return null; // chưa đủ 200 khoản thì không có gì cũ hơn
  if (done) return <p className="muted">Đã tải hết các khoản cũ.</p>;
  return (
    <div className="btnrow">
      <button type="button" className="secondary" disabled={busy || !online} onClick={async () => {
        setBusy(true); setErr('');
        try { const more = await loadOlderFinance(kind); if (!more) setDone(true); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Không tải được, thử lại.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Đang tải…' : 'Tải thêm khoản cũ hơn'}</button>
      {err && <span className="msg error" role="alert">{err}</span>}
    </div>
  );
}
