import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Theo dõi sử dụng (D160): ghi NGẦM "phiên sử dụng" để quản trị nền tảng xem tài khoản nào dùng từ lúc nào đến lúc nào, ở thiết bị nào, vào chức năng nào.
 * Nhẹ: một tín hiệu mỗi ~60 giây khi app đang mở và nhìn thấy (không có thì thôi, lỗi bỏ qua, không ảnh hưởng việc đang làm); thời gian ở từng màn cộng dồn
 * trong bộ nhớ rồi gửi kèm tín hiệu, không gửi mỗi lần chuyển màn. Mỗi trình duyệt/app cài có MÃ THIẾT BỊ riêng (để phân biệt khi một tài khoản dùng nhiều máy).
 */
const DEVICE_KEY = 'agriconnect.deviceId';
export const LOGIN_FLAG = 'agriconnect.loginMethod'; // đặt khi đăng nhập thành công ('email' | 'phone'), tín hiệu đầu tiên của phiên gửi kèm rồi xóa
const PING_MS = 60_000;
const IDLE_NEW_SESSION_MS = 30 * 60_000; // ẩn quá 30 phút rồi quay lại: tính là phiên mới

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, '0')}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`);

function getDeviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d || !/^[0-9a-f-]{36}$/i.test(d)) { d = uuid(); localStorage.setItem(DEVICE_KEY, d); }
    return d;
  } catch { return uuid(); } // không lưu được (chế độ riêng tư): mã mới mỗi lần mở
}

/** Nhãn thiết bị dễ đọc từ chuỗi trình duyệt: "Chrome · Android · SM-A546E · #7F3K" (mã ngắn cuối giúp phân biệt hai máy giống nhau) */
export function deviceLabel(ua: string, id: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Trình duyệt';
  let os = 'Thiết bị lạ', model = '';
  const am = /Android [\d.]+;\s*([^);]+)/.exec(ua);
  if (/Android/.test(ua)) { os = 'Android'; model = (am?.[1] ?? '').replace(/\s*Build.*$/, '').trim(); if (/^(K|Mobile)$/i.test(model)) model = ''; }
  else if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac';
  else if (/Linux|X11/.test(ua)) os = 'Linux';
  return [browser, os, model, `#${id.replace(/-/g, '').slice(-4).toUpperCase()}`].filter(Boolean).join(' · ');
}

/** Mã màn hình hợp lệ cho máy chủ: chữ thường, số, gạch dưới; "tab/mục" */
export const screenKey = (tab: string, sub?: string | null, overlay?: string | null): string => {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30) || 'khac';
  if (overlay) return clean(`overlay_${overlay}`);
  return sub ? `${clean(tab)}/${clean(sub)}` : clean(tab);
};

interface Trace { country: string | null; colo: string | null }
let traceCache: Trace | null = null;
/** Quốc gia và trạm Cloudflare gần nhất (cho biết vùng) lấy từ chính tên miền của app; không có (chạy thử ở máy) thì bỏ qua */
async function fetchTrace(): Promise<Trace> {
  if (traceCache) return traceCache;
  const none: Trace = { country: null, colo: null };
  try {
    if (/^(localhost|127\.|192\.168\.)/.test(location.hostname)) return (traceCache = none);
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 3000);
    const txt = await fetch('/cdn-cgi/trace', { signal: ctl.signal, cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
    window.clearTimeout(t);
    const loc = /^loc=([A-Z]{2})$/m.exec(txt)?.[1] ?? null;
    const colo = /^colo=([A-Z]{2,8})$/m.exec(txt)?.[1] ?? null;
    return (traceCache = { country: loc, colo });
  } catch { return (traceCache = none); }
}

/** Gắn một lần ở khung chính khi đã đăng nhập: `key` là mã màn đang xem (tab/mục hoặc màn phủ), `orgId` là cơ sở đang chọn */
export function useUsageTracker(userId: string | undefined, orgId: string | undefined, key: string): void {
  const keyRef = useRef(key);
  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  const api = useRef<{ account: () => void } | null>(null);

  useEffect(() => {
    if (!userId || !supabase) return;
    const client = supabase;
    const device = getDeviceId();
    const label = deviceLabel(navigator.userAgent, device);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    let session = uuid();
    let lastTick = Date.now();
    let hiddenAt: number | null = document.hidden ? Date.now() : null;
    let buffer: Record<string, number> = {};   // mili giây theo mã màn
    let sending = false;

    const account = () => {
      const now = Date.now();
      if (!document.hidden) {
        const el = Math.min(now - lastTick, 120_000);
        if (el > 0) buffer[keyRef.current] = (buffer[keyRef.current] ?? 0) + el;
      }
      lastTick = now;
    };

    async function send(ended = false) {
      if (sending || !navigator.onLine) return;
      account();
      const entries = Object.entries(buffer).map(([k, ms]) => [k, Math.round(ms / 1000)] as const).filter(([, s]) => s > 0);
      const seconds = entries.reduce((n, [, s]) => n + s, 0);
      const first = !sentFirst;
      if (seconds === 0 && !first && !ended) return;
      const screens = Object.fromEntries(entries.slice(0, 30));
      const snapshot = buffer; buffer = {};
      sending = true;
      try {
        const t = first || traceCache === null ? await fetchTrace() : traceCache;
        let method: string | null = null;
        if (first) { try { method = localStorage.getItem(LOGIN_FLAG); } catch { /* bỏ qua */ } }
        const { error } = await client.rpc('usage_ping', {
          p_session: session, p_org: orgRef.current ?? null, p_device: device, p_label: label, p_standalone: standalone, p_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
          p_seconds: Math.min(seconds, 300), p_screens: screens, p_country: t.country, p_colo: t.colo, p_login: method, p_ended: ended,
        });
        if (error) throw error;
        sentFirst = true;
        if (first && method) { try { localStorage.removeItem(LOGIN_FLAG); } catch { /* bỏ qua */ } }
      } catch {
        for (const [k, ms] of Object.entries(snapshot)) buffer[k] = (buffer[k] ?? 0) + ms; // gửi lỗi: giữ lại gửi lần sau
      } finally { sending = false; }
    }
    let sentFirst = false;

    const onVisibility = () => {
      if (document.hidden) { account(); hiddenAt = Date.now(); void send(false); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt > IDLE_NEW_SESSION_MS) { session = uuid(); sentFirst = false; }
      hiddenAt = null; lastTick = Date.now();
      void send(false);
    };
    const onHide = () => { account(); void send(true); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('online', onVisibility);
    const timer = window.setInterval(() => { if (!document.hidden) void send(false); }, PING_MS);
    api.current = { account };
    void send(false); // tín hiệu đầu tiên ngay khi mở (có kèm cách đăng nhập nếu vừa đăng nhập)
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('online', onVisibility);
      account(); void send(true);
      api.current = null;
    };
  }, [userId]);

  // đổi màn: chốt thời gian đã trôi qua cho màn CŨ (keyRef vẫn là mã cũ) rồi mới chuyển sang mã mới
  useEffect(() => { api.current?.account(); keyRef.current = key; }, [key]);
}
