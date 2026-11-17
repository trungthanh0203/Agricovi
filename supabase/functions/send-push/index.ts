// Edge Function: GỬI THÔNG BÁO ĐẨY (Web Push) (H2, D182–D183). Ba việc:
//   POST { action: "public_key" }  -> { public_key }   (cần phiên đăng nhập; khóa công khai VAPID để app đăng ký thiết bị)
//   POST { action: "test" }        -> { sent, removed, failed }   (cần phiên đăng nhập) gửi thử tới MỌI thiết bị đã bật của CHÍNH người gọi
//   POST { action: "digest" }      -> { users, sent, removed, failed }   BẢN TIN SÁNG: chỉ lịch của CSDL gọi, kèm header x-cron-secret (= PUSH_CRON_SECRET).
//        CSDL chọn người cần gửi (claim_morning_digests), hàm soạn một thông báo gộp mỗi người (digest.ts) rồi gửi.
// Khóa riêng VAPID chỉ nằm ở máy chủ.
//
// Triển khai:  npx supabase functions deploy send-push
// Bí mật (một lần; xem docs/HUONG_DAN_BAT_THONG_BAO.md):
//   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:<email liên hệ của bạn> PUSH_CRON_SECRET=<chuỗi ngẫu nhiên dài>
// Thiết bị hết hạn (HTTP 404/410 từ dịch vụ đẩy) bị xóa khỏi bảng push_subscriptions.
// Lỗi: HTTP 400/401/405/503 { error: "MÃ_LỖI: nội dung tiếng Việt" }.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { composeDigest } from './digest.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!pub || !priv || !subject) return fail('NOT_CONFIGURED: Thông báo đẩy chưa được cấu hình ở máy chủ. Hãy báo quản trị nền tảng.', 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('BAD_REQUEST: Yêu cầu không hợp lệ.'); }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

  // gửi một thông báo tới các thiết bị; thiết bị hết hạn (404/410) bị xóa
  async function sendTo(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: string) {
    let sent = 0, failed = 0;
    const gone: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); else failed++;
      }
    }));
    if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone);
    return { sent, removed: gone.length, failed };
  }

  // BẢN TIN SÁNG: chỉ lịch của CSDL gọi (header x-cron-secret), không dùng phiên người dùng
  if (body.action === 'digest') {
    const secret = Deno.env.get('PUSH_CRON_SECRET');
    const given = req.headers.get('x-cron-secret') ?? '';
    let diff = given.length ^ (secret?.length ?? 0);                        // so sánh không dừng sớm (tránh lộ bí mật qua thời gian)
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ (secret?.charCodeAt(i) ?? 0);
    if (!secret || diff !== 0) return fail('FORBIDDEN: Không có quyền gọi bản tin sáng.', 403);
    webpush.setVapidDetails(subject, pub, priv);
    const { data: rows, error } = await admin.rpc('claim_morning_digests', {});
    if (error) return fail(`DB_ERROR: ${error.message}`, 500);
    let sent = 0, removed = 0, failed = 0, users = 0;
    for (const row of (rows ?? []) as { user_id: string; counts: unknown }[]) {
      const msg = composeDigest(row.counts as never);
      if (!msg) continue;
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', row.user_id);
      const r = await sendTo(subs ?? [], JSON.stringify(msg));
      users++; sent += r.sent; removed += r.removed; failed += r.failed;
    }
    return json({ users, sent, removed, failed });
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who.user) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);

  if (body.action === 'public_key') return json({ public_key: pub });

  if (body.action === 'test') {
    webpush.setVapidDetails(subject, pub, priv);
    const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', who.user.id);
    if (error) return fail(`DB_ERROR: ${error.message}`, 500);
    const payload = JSON.stringify({ title: 'Agricovi', body: 'Thông báo thử: máy này đã nhận được thông báo.', tag: 'agricovi-test', url: '/' });
    return json(await sendTo(subs ?? [], payload));
  }

  return fail('BAD_REQUEST: Hành động không hợp lệ.');
});
