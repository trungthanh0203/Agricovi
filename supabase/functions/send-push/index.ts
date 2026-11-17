// Edge Function: GỬI THÔNG BÁO ĐẨY (Web Push) (H2 lát 1, D182). Lát 1 chỉ có hai việc, đều cần phiên đăng nhập của người dùng:
//   POST { action: "public_key" }  -> { public_key }   (khóa công khai VAPID để app đăng ký thiết bị; app không cần cấu hình thêm biến nào)
//   POST { action: "test" }        -> { sent, removed, failed }   gửi một thông báo thử tới MỌI thiết bị đã bật của CHÍNH người gọi
// Lát 2 (bản tin sáng) sẽ thêm đường gọi nội bộ từ lịch của CSDL. Khóa riêng VAPID chỉ nằm ở máy chủ.
//
// Triển khai:  npx supabase functions deploy send-push
// Bí mật (một lần; xem docs/HUONG_DAN_BAT_THONG_BAO.md):
//   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:<email liên hệ của bạn>
// Thiết bị hết hạn (HTTP 404/410 từ dịch vụ đẩy) bị xóa khỏi bảng push_subscriptions.
// Lỗi: HTTP 400/401/405/503 { error: "MÃ_LỖI: nội dung tiếng Việt" }.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who.user) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('BAD_REQUEST: Yêu cầu không hợp lệ.'); }

  if (body.action === 'public_key') return json({ public_key: pub });

  if (body.action === 'test') {
    webpush.setVapidDetails(subject, pub, priv);
    const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', who.user.id);
    if (error) return fail(`DB_ERROR: ${error.message}`, 500);
    const payload = JSON.stringify({ title: 'Agricovi', body: 'Thông báo thử: máy này đã nhận được thông báo.', tag: 'agricovi-test', url: '/' });
    let sent = 0, failed = 0;
    const gone: string[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); else failed++;
      }
    }));
    if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone);
    return json({ sent, removed: gone.length, failed });
  }

  return fail('BAD_REQUEST: Hành động không hợp lệ.');
});
