// Edge Function: chủ cơ sở đăng ký bằng SỐ ĐIỆN THOẠI (không email) và quản trị nền tảng đặt lại mật khẩu cho họ.
// Cần chạy ở máy chủ vì tạo tài khoản cho người chưa đăng nhập đòi hỏi khóa quản trị (service_role); tuyệt đối không đưa khóa này ra frontend.
//
// Triển khai:  npx supabase functions deploy owner-signup
// Biến môi trường SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cấp.
// Chống đăng ký ồ ạt (khuyên bật): đặt TURNSTILE_SECRET_KEY (khóa bí mật Cloudflare Turnstile, miễn phí):
//   npx supabase secrets set TURNSTILE_SECRET_KEY=...   (chưa đặt thì bỏ qua bước này; vẫn có giới hạn theo mạng và phải chờ duyệt)
//
// Hợp đồng:
//   POST { action: 'register', phone, password, full_name, org_name, org_type: 'household'|'cooperative', turnstile_token? } -> { ok: true, phone }
//   POST { action: 'admin_reset_password', signup_id }   (cần đăng nhập bằng tài khoản quản trị nền tảng) -> { phone, temp_password }
// Lỗi: HTTP 400 { error: "MÃ_LỖI: nội dung tiếng Việt" }.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

function tempPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const max = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < max && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function turnstileOk(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // chưa cấu hình: bỏ qua (vẫn có giới hạn theo mạng và bước duyệt)
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST: Dữ liệu gửi lên không hợp lệ');
  }

  try {
    if (body.action === 'register') {
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      const orgName = String(body.org_name ?? '').trim();
      const orgType = body.org_type === 'cooperative' ? 'cooperative' : 'household';
      if (fullName.length < 2) return fail('INVALID_NAME: Hãy nhập họ tên người đại diện (ít nhất 2 ký tự).');
      if (orgName.length < 2) return fail('INVALID_NAME: Hãy nhập tên cơ sở (ít nhất 2 ký tự).');
      if (password.length < 8) return fail('WEAK_PASSWORD: Mật khẩu cần ít nhất 8 ký tự.');

      const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      if (!(await turnstileOk(body.turnstile_token as string | undefined, ip))) {
        return fail('CAPTCHA: Chưa xác nhận bạn là người thật. Hãy tải lại trang và thử lại.');
      }
      const ipHash = ip ? await sha256(`agricovi|${ip}`) : null;

      // 1) kiểm tra số điện thoại, giới hạn theo mạng; nhận email ẩn theo cấu hình tên miền
      const pre = await admin.rpc('owner_signup_precheck', { p_phone: String(body.phone ?? ''), p_ip_hash: ipHash });
      if (pre.error) return fail(pre.error.message);
      const { phone, auth_email } = (pre.data as { phone: string; auth_email: string }[])[0];

      // 2) tạo tài khoản đăng nhập (đã xác nhận sẵn, không gửi thư)
      const created = await admin.auth.admin.createUser({
        email: auth_email, password, email_confirm: true, user_metadata: { owner_phone: true, phone, full_name: fullName },
      });
      if (created.error || !created.data.user) {
        return fail(created.error?.message?.includes('already') ? 'PHONE_IN_USE: Số điện thoại này đã có tài khoản.' : (created.error?.message ?? 'Không tạo được tài khoản'));
      }
      // 3) ghi đăng ký chờ duyệt; lỗi thì xóa tài khoản vừa tạo (không để lại tài khoản mồ côi)
      const fin = await admin.rpc('owner_signup_finalize', {
        p_user: created.data.user.id, p_phone: phone, p_auth_email: auth_email, p_name: fullName, p_org_name: orgName, p_type: orgType, p_ip_hash: ipHash,
      });
      if (fin.error) {
        await admin.auth.admin.deleteUser(created.data.user.id);
        return fail(fin.error.message);
      }
      return json({ ok: true, phone });
    }

    if (body.action === 'admin_reset_password') {
      const authHeader = req.headers.get('Authorization') ?? '';
      const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
      const { data: who, error: whoErr } = await asCaller.auth.getUser();
      if (whoErr || !who.user) return fail('UNAUTHENTICATED: Cần đăng nhập bằng tài khoản quản trị nền tảng', 401);
      const chk = await admin.rpc('owner_signup_admin_check', { p_actor: who.user.id, p_signup: String(body.signup_id ?? '') });
      if (chk.error) return fail(chk.error.message);
      const row = (chk.data as { user_id: string; phone: string }[])[0];
      if (!row) return fail('NOT_FOUND: Chỉ đặt lại được mật khẩu cho đăng ký đã duyệt.');
      const password = tempPassword();
      const upd = await admin.auth.admin.updateUserById(row.user_id, { password });
      if (upd.error) return fail(upd.error.message);
      return json({ phone: row.phone, temp_password: password });
    }

    return fail('BAD_REQUEST: Hành động không hợp lệ');
  } catch (e) {
    console.error('owner-signup error', e);
    return fail('SERVER: Có lỗi hệ thống, hãy thử lại sau', 500);
  }
});
