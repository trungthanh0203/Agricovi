import { useEffect, useRef } from 'react';
import { GUIDE_JUMP_EVENT, type GuideJump } from '../lib/helpEvents';
import { HELP, type HelpKey } from '../lib/helpContent';

/**
 * Bảng trượt từ dưới lên của nút ⓘ (D123). Tải lười cùng nội dung trợ giúp (lib/helpContent.ts) nên không làm nặng gói đầu.
 * Nút Back của điện thoại (và phím Esc) đóng bảng trước khi rời màn hình.
 */
export function HelpSheet({ topic, onClose }: { topic: string; onClose: () => void }) {
  const entry = HELP[topic as HelpKey];
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    window.history.pushState({ agriHelp: true }, '');
    const onPop = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  // đóng bằng cách lùi lịch sử (khớp với nút Back); không còn mục lịch sử của bảng thì đóng thẳng
  function close() {
    if ((window.history.state as { agriHelp?: boolean } | null)?.agriHelp) window.history.back();
    else onCloseRef.current();
  }

  function openGuide() {
    if (!entry?.guide) return;
    const jump: GuideJump = { id: entry.guide.id, step: entry.guide.step };
    close();
    // đợi lần lùi lịch sử xong rồi mới chuyển tab
    window.setTimeout(() => window.dispatchEvent(new CustomEvent<GuideJump>(GUIDE_JUMP_EVENT, { detail: jump })), 60);
  }

  return (
    <>
      <div className="sheet-back" onClick={close} />
      <div className="sheet help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="sheet-head">
          <strong id="help-title" style={{ flex: 1 }}>ⓘ {entry?.title ?? 'Hướng dẫn'}</strong>
          <button ref={closeRef} type="button" className="sheet-x" onClick={close} aria-label="Đóng">✕</button>
        </div>
        {entry ? (
          <div className="help-body">
            <h3>Dùng để làm gì</h3>
            <p>{entry.what}</p>
            <h3>Cách dùng nhanh</h3>
            <ul>{entry.how.map((h) => <li key={h}>{h}</li>)}</ul>
            {entry.note && <p className="guide-tip">💡 {entry.note}</p>}
            {entry.guide && <button type="button" className="secondary" onClick={openGuide}>Xem hướng dẫn đầy đủ</button>}
          </div>
        ) : (
          <div className="help-body"><p>Chức năng này chưa có phần giới thiệu. Xem Menu ☰ → Hướng dẫn sử dụng.</p></div>
        )}
      </div>
    </>
  );
}
