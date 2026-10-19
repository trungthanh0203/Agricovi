// Edge Function: chủ cơ sở tạo / đặt lại mật khẩu tài khoản nhân viên đăng nhập bằng số điện thoại.
// Cần chạy ở máy chủ vì tạo tài khoản thay người khác đòi hỏi khóa quản trị (service_role) - tuyệt đối không đưa khóa này ra frontend.
//
// Triển khai:  npx supabase functions deploy staff-accounts
// Biến môi trường SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cấp cho hàm.
//
// Hợp đồng:
//   POST { action: 'create', organization_id, full_name, phone, roles: string[], work_mode, team_id? }
//        -> { user_id, phone, temp_password, expires_at }
//   POST { action: 'reset_password', organization_id, user_id }
//        -> { phone?, temp_password, expires_at }
// Lỗi: HTTP 400 { error: "MÃ_LỖI: nội dung tiếng Việt" }. Mật khẩu tạm CHỈ có trong phản hồi này, không lưu ở đâu khác.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*', // xác thực bằng JWT trong header Authorization, không dùng cookie
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const ROLES = ['manager', 'worker', 'inventory_finance', 'profile_editor', 'cooperative_manager'];
const WORK_MODES = ['self_hourly', 'leader_hourly', 'leader_output', 'mixed'];

/** Mật khẩu tạm ngẫu nhiên 8 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I). */
function tempPassword(length = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const max = 256 - (256 % alphabet.length); // bỏ giá trị lệch để phân bố đều
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < max && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

function cleanMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : (e as { message?: string })?.message ?? '';
  return m || 'Có lỗi xảy ra';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Xác định người gọi từ JWT của chính họ (không tin dữ liệu người gọi gửi lên)
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who.user) return fail('UNAUTHENTICATED: Cần đăng nhập', 401);
  const actor = who.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST: Dữ liệu gửi lên không hợp lệ');
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const org = String(body.organization_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(org)) return fail('BAD_REQUEST: Thiếu cơ sở');

  try {
    if (body.action === 'create') {
      const roles = Array.isArray(body.roles) ? (body.roles as unknown[]).map(String) : [];
      const mode = String(body.work_mode ?? 'self_hourly');
      const name = String(body.full_name ?? '').trim();
      const team = body.team_id ? String(body.team_id) : null;
      if (roles.length === 0 || roles.some((r) => !ROLES.includes(r))) return fail('INVALID_ROLE: Hãy chọn ít nhất một vai trò hợp lệ');
      if (!WORK_MODES.includes(mode)) return fail('INVALID_MODE: Kiểu phân hệ không hợp lệ');
      if (team && !/^[0-9a-f-]{36}$/i.test(team)) return fail('BAD_REQUEST: Tổ không hợp lệ');

      // 1) Kiểm tra quyền (chủ cơ sở), số điện thoại, vai trò; nhận email ẩn theo cấu hình tên miền
      const pre = await admin.rpc('staff_precheck', {
        p_actor: actor, p_org: org, p_phone: String(body.phone ?? ''), p_roles: roles,
      });
      if (pre.error) return fail(pre.error.message);
      const { phone, auth_email, granted_roles } =
        (pre.data as { phone: string; auth_email: string; granted_roles: string[] }[])[0];

      // 2) Tạo tài khoản Auth với mật khẩu tạm ngẫu nhiên (đã xác nhận sẵn, không gửi thư)
      const password = tempPassword();
      const created = await admin.auth.admin.createUser({
        email: auth_email,
        password,
        email_confirm: true,
        user_metadata: { staff: true, phone, full_name: name },
      });
      if (created.error || !created.data.user) {
        return fail(created.error?.message?.includes('already') ? 'PHONE_IN_USE: Số điện thoại này đã có tài khoản.' : cleanMessage(created.error));
      }
      const userId = created.data.user.id;

      // 3) Ghi hồ sơ nhân viên, vai trò, hồ sơ lao động; nếu lỗi thì xóa tài khoản vừa tạo (không để lại tài khoản mồ côi)
      const fin = await admin.rpc('staff_finalize', {
        p_actor: actor, p_org: org, p_user: userId, p_phone: phone, p_email: auth_email,
        p_name: name, p_roles: granted_roles, p_work_mode: mode, p_team: team,
      });
      if (fin.error) {
        await admin.auth.admin.deleteUser(userId);
        return fail(fin.error.message);
      }
      return json({ user_id: userId, phone, temp_password: password, expires_at: fin.data });
    }

    if (body.action === 'reset_password') {
      const userId = String(body.user_id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('BAD_REQUEST: Thiếu người dùng');

      // Kiểm tra quyền TRƯỚC khi đổi mật khẩu: staff_reset cũng kiểm tra lại sau đó
      const check = await admin
        .from('staff_accounts').select('user_id, phone').eq('user_id', userId).eq('organization_id', org).maybeSingle();
      const isOwner = await admin
        .from('organization_memberships').select('id').eq('organization_id', org).eq('user_id', actor)
        .eq('role', 'owner').eq('status', 'active').maybeSingle();
      if (!isOwner.data) return fail('FORBIDDEN: Chỉ chủ cơ sở được đặt lại mật khẩu nhân viên');
      if (!check.data) return fail('NOT_FOUND: Không phải tài khoản nhân viên của cơ sở này');

      const password = tempPassword();
      const upd = await admin.auth.admin.updateUserById(userId, { password });
      if (upd.error) return fail(cleanMessage(upd.error));
      const res = await admin.rpc('staff_reset', { p_actor: actor, p_org: org, p_user: userId });
      if (res.error) return fail(res.error.message);
      return json({ phone: check.data.phone, temp_password: password, expires_at: res.data });
    }

    return fail('BAD_REQUEST: Hành động không hợp lệ');
  } catch (e) {
    console.error('staff-accounts error', e);
    return fail('SERVER: Có lỗi hệ thống, hãy thử lại sau', 500);
  }
});
