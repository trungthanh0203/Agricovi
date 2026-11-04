// Edge Function: lấy tin từ các nguồn cấp RSS/Atom (bảng site_news_sources) về làm BẢN NHÁP bài viết website.
// Chỉ lấy tiêu đề, tóm tắt ngắn và liên kết nguồn (không sao chép nguyên bài); biên tập viên duyệt rồi mới đăng.
//
// Triển khai:  npx supabase functions deploy news-fetch
// Bí mật (một lần):  npx supabase secrets set NEWS_CRON_SECRET=<chuỗi-ngẫu-nhiên-dài>
// Gọi theo hai cách:
//   1) Lịch tuần (GitHub Actions, .github/workflows/news-weekly.yml): header x-cron-secret = NEWS_CRON_SECRET.
//   2) Nút "Lấy tin ngay" ở quản trị website: đăng nhập bằng tài khoản có vai trò tổng biên tập/biên tập viên.
// Hợp đồng: POST { source_id?: uuid } -> { ok: true, results: [{ name, added, status }] }. Lỗi: HTTP 4xx { error: "MÃ: nội dung" }.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const MAX_BYTES = 2_000_000;
const MAX_AGE_DAYS = 21;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const plain = (s: string) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function tag(block: string, names: string[]): string {
  for (const n of names) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block);
    if (m) return m[1]!;
  }
  return '';
}

interface Item { title: string; link: string; summary: string; published: string | null }
function parseFeed(xml: string): Item[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: Item[] = [];
  for (const b of blocks) {
    let link = plain(tag(b, ['link']));
    if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); link = m ? decode(m[1]!) : plain(tag(b, ['guid'])); }
    const date = plain(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const t = date ? new Date(date) : null;
    out.push({
      title: plain(tag(b, ['title'])),
      link: link.replace(/^http:\/\//i, 'https://'),
      summary: plain(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 300),
      published: t && !isNaN(t.getTime()) ? t.toISOString() : null,
    });
  }
  return out;
}

async function readFeed(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': 'AgricoviNewsBot/1.0 (+https://agricovi.com)', Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!r.ok) throw new Error('Nguồn trả về lỗi HTTP ' + r.status);
  const text = await r.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Xác thực: khóa lịch chạy HOẶC người dùng có vai trò biên tập website
  const secret = Deno.env.get('NEWS_CRON_SECRET');
  const given = req.headers.get('x-cron-secret');
  let allowed = !!secret && !!given && given === secret;
  if (!allowed) {
    const auth = req.headers.get('Authorization');
    if (auth) {
      const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
      const { data } = await asUser.rpc('get_my_site_roles');
      allowed = Array.isArray(data) && data.some((r: string) => r === 'chief_editor' || r === 'editor' || r === 'admin');
    }
  }
  if (!allowed) return fail('FORBIDDEN: Bạn chưa được phép lấy tin tự động.', 403);

  let body: { source_id?: string } = {};
  try { body = await req.json(); } catch { /* không có nội dung: chạy tất cả */ }

  let q = admin.from('site_news_sources').select('id, name, feed_url, keywords, max_items').eq('is_active', true);
  if (body.source_id) q = q.eq('id', body.source_id);
  const { data: sources, error } = await q;
  if (error) return fail('DB: ' + error.message, 500);

  const since = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const results: { name: string; added: number; status: string }[] = [];
  for (const s of (sources ?? []) as { id: string; name: string; feed_url: string; keywords: string[]; max_items: number }[]) {
    try {
      let items = parseFeed(await readFeed(s.feed_url)).filter((i) => i.title && i.link.startsWith('https://'));
      items = items.filter((i) => !i.published || new Date(i.published).getTime() >= since);
      const kws = (s.keywords ?? []).map(fold).filter(Boolean);
      if (kws.length) items = items.filter((i) => { const hay = fold(i.title + ' ' + i.summary); return kws.some((k) => hay.includes(k)); });
      items = items.slice(0, s.max_items);
      const { data: added, error: e2 } = await admin.rpc('news_ingest', { p_source: s.id, p_items: items });
      if (e2) throw new Error(e2.message);
      results.push({ name: s.name, added: Number(added) || 0, status: 'ok' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.rpc('news_ingest', { p_source: s.id, p_items: [], p_error: msg.slice(0, 250) });
      results.push({ name: s.name, added: 0, status: 'Lỗi: ' + msg });
    }
  }
  // Tự xóa bản nháp tin tự động quá 15 ngày chưa ai mở/duyệt
  const { data: cleaned } = await admin.rpc('news_cleanup');
  return json({ ok: true, results, cleaned: Number(cleaned) || 0 });
});
