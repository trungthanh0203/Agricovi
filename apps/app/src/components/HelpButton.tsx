import { Suspense, useState } from 'react';
import { lazyRetry } from '../lib/lazyRetry';

// Gói trợ giúp chỉ tải khi người dùng bấm ⓘ lần đầu (D123): không làm nặng lúc mở app hay vào màn hình
const loadSheet = () => import('./HelpSheet').then((m) => ({ default: m.HelpSheet }));
const HelpSheet = lazyRetry(loadSheet);

/** Nút ⓘ giới thiệu, giải thích và hướng dẫn chức năng đang mở. `topic` là mã mục menu (xem lib/helpContent.ts). */
export function HelpButton({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="help-btn" aria-label="Giới thiệu và hướng dẫn chức năng này" title="Giới thiệu và hướng dẫn"
        onPointerDown={() => void loadSheet().catch(() => undefined)} onClick={() => setOpen(true)}>i</button>
      {open && <Suspense fallback={null}><HelpSheet topic={topic} onClose={() => setOpen(false)} /></Suspense>}
    </>
  );
}
