import { useEffect, useRef } from 'react';

/** Khóa công khai Cloudflare Turnstile (miễn phí). Chưa đặt thì không hiện khung xác nhận (máy chủ cũng bỏ qua bước này). */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileApi { render(el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; 'error-callback': () => void; language?: string }): string; remove(id: string): void }
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Khung "xác nhận bạn là người thật" của Cloudflare (chống đăng ký ồ ạt). Gọi onToken khi vượt qua; onToken('') khi hết hạn. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY) { onToken(''); return; }
    let id: string | null = null;
    let dead = false;
    void loadScript().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: SITE_KEY, language: 'vi', callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') });
    }).catch(() => undefined);
    return () => { dead = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [onToken]);
  return SITE_KEY ? <div ref={box} className="turnstile" /> : null;
}

export const turnstileEnabled = Boolean(SITE_KEY);
