// Edge Function: người mua tự đăng ký tài khoản website bằng SỐ ĐIỆN THOẠI (email thì đăng ký thẳng bằng Supabase Auth).
// Cần chạy ở máy chủ vì tạo tài khoản đã xác nhận sẵn đòi hỏi khóa quản trị (service_role) - tuyệt đối không đưa khóa này ra frontend.
//
// Triển khai:  npx supabase functions deploy web-accounts
// Biến môi trường SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cấp cho hàm.
//
// Hợp đồng:
//   POST { action: 'register_phone', phone, password, full_name, buyer_kind?, company? } -> { ok: true }
//   Sau đó website đăng nhập bằng số điện thoại + mật khẩu (email ẩn n@sdt.<tên miền>, xem login_email_for_phone).
// Lỗi: HTTP 400 { error: "MÃ_LỖI: nội dung tiếng Việt" }.
// Lưu ý: số điện thoại CHƯA xác minh OTP nên không là bằng chứng danh tính. Chống lạm dụng hiện chỉ ở CSDL (tối đa 200 đăng ký/giờ);
// sẽ thêm Turnstile khi có khóa.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const KINDS = ['individual', 'restaurant', 'trader', 'business', 'farm'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('INVALID: Dữ liệu gửi lên không đọc được.'); }
  if (body.action !== 'register_phone') return fail('INVALID: Thao tác không hỗ trợ.');

  const fullName = String(body.full_name ?? '').trim();
  const password = String(body.password ?? '');
  const kind = KINDS.includes(String(body.buyer_kind)) ? String(body.buyer_kind) : 'individual';
  const company = String(body.company ?? '').trim().slice(0, 120);
  if (fullName.length < 2 || fullName.length > 80) return fail('INVALID: Hãy nhập họ tên (2–80 ký tự).');
  if (password.length < 8 || password.length > 72) return fail('INVALID: Mật khẩu cần từ 8 đến 72 ký tự.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: email, error: pre } = await admin.rpc('web_phone_precheck', { p_phone: String(body.phone ?? '') });
  if (pre) return fail(pre.message);
  const phone = String(email).split('@')[0];
  const { error } = await admin.auth.admin.createUser({
    email: String(email), password, email_confirm: true,
    user_metadata: { full_name: fullName, buyer_kind: kind, company, login_kind: 'phone', phone },
  });
  if (error) return fail(/already|registered|exists/i.test(error.message) ? 'EXISTS: Số điện thoại này đã có tài khoản. Hãy đăng nhập hoặc dùng số khác.' : 'ERROR: Chưa tạo được tài khoản, vui lòng thử lại.');
  return json({ ok: true });
});
