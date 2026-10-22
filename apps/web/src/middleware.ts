import { defineMiddleware } from 'astro:middleware';
import { stripLang, translateHtml } from '@agriconnect/shared/src/i18n';
import { loadTranslations } from './lib/translations';

/**
 * Lớp bao quanh mọi yêu cầu của website (W8, D71):
 *  1. Song ngữ: địa chỉ /en/… được xử lý như trang tiếng Việt tương ứng rồi DỊCH HTML sang tiếng Anh (từ điển ở packages/shared/src/i18n*.ts).
 *  2. Bộ nhớ đệm ở biên Cloudflare (Cache API): chỉ trang công khai có Cache-Control public + s-maxage; trang riêng tư không bao giờ được lưu.
 *  3. Tiêu đề bảo mật cho mọi phản hồi (CSP, chống nhúng khung, nosniff, HSTS, Referrer-Policy, Permissions-Policy).
 */
const SUPABASE = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) ?? '';
function origin(u: string): string { try { return new URL(u).origin; } catch { return ''; } }
const SB = origin(SUPABASE);

// Trang dùng script/kiểu nội tuyến do Astro sinh nên cần 'unsafe-inline'; các nguồn còn lại bị khóa chặt.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${SB ? ' ' + SB : ''}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function secure(res: Response, https: boolean): Response {
  let r = res;
  try { r.headers.set('X-Content-Type-Options', 'nosniff'); } catch { r = new Response(res.body, res); r.headers.set('X-Content-Type-Options', 'nosniff'); }
  const h = r.headers;
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', CSP);
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (https) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return r;
}

function edgeTtl(res: Response): number {
  const cc = res.headers.get('Cache-Control') ?? '';
  if (/(^|,\s*)(private|no-store|no-cache)\b/i.test(cc) || res.headers.has('Set-Cookie')) return 0;
  const m = /s-maxage=(\d+)/i.exec(cc);
  return m ? Math.min(Number(m[1]), 3600) : 0;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  // ctx.rewrite() chạy lại chuỗi middleware cho đường dẫn đã viết lại: lần thứ hai chỉ việc render, không làm lại gì
  if (ctx.locals.i18nPass) return next();
  ctx.locals.i18nPass = true;
  const url = new URL(ctx.request.url);
  const { path, lang } = stripLang(url.pathname);
  ctx.locals.lang = lang;
  ctx.locals.pathVi = path;
  const https = url.protocol === 'https:';
  const cache: Cache | undefined = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheable = ctx.request.method === 'GET' && !!cache && !ctx.request.headers.has('Authorization');
  const key = cacheable ? new Request(url.toString(), { method: 'GET' }) : null;

  if (cache && key) {
    const hit = await cache.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('Cache-Control', r.headers.get('X-Orig-Cache-Control') ?? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      r.headers.delete('X-Orig-Cache-Control');
      r.headers.set('X-Edge-Cache', 'HIT');
      return secure(r, https);
    }
  }

  if (lang === 'en') ctx.locals.tr = await loadTranslations();
  let res = lang === 'en' ? await ctx.rewrite(path + url.search) : await next();
  if (lang === 'en' && (res.headers.get('Content-Type') ?? '').includes('text/html')) {
    const html = translateHtml(await res.text(), ctx.locals.tr?.glossary);
    const headers = new Headers(res.headers);
    headers.delete('Content-Length');
    res = new Response(html, { status: res.status, statusText: res.statusText, headers });
  }
  res = secure(res, https);

  const ttl = res.status === 200 ? edgeTtl(res) : 0;
  if (cache && key && ttl > 0) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('X-Orig-Cache-Control', res.headers.get('Cache-Control') ?? '');
    copy.headers.set('Cache-Control', `public, max-age=${ttl}`);
    const put = cache.put(key, copy).catch(() => undefined);
    const wait = (ctx.locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } }).cfContext?.waitUntil;
    if (wait) wait.call((ctx.locals as { cfContext?: unknown }).cfContext, put); else await put;
  }
  return res;
});
