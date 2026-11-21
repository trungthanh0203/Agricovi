import { useEffect, useState } from 'react';

/** Theo dõi một điều kiện màn hình (ví dụ máy tính: '(min-width: 1024px)'). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Màn hình đủ rộng để dùng bố cục máy tính (menu dọc bên trái); khớp với @media trong styles.css */
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
