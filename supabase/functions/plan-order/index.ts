// Edge Function: chủ cơ sở gửi yêu cầu MUA GÓI DỊCH VỤ; hệ thống lưu yêu cầu (hiện ở trang quản trị nền tảng → Đơn mua gói) và gửi email thông báo.
//
// Triển khai:  npx supabase functions deploy plan-order
// Biến môi trường SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cấp.
// Gửi email (tùy chọn, dịch vụ Resend có gói miễn phí):
//   npx supabase secrets set RESEND_API_KEY=...            (khóa API của Resend)
//   npx supabase secrets set RESEND_FROM="Agricovi <no-reply@tên-miền-đã-xác-minh>"   (chưa có tên miền: bỏ trống để dùng onboarding@resend.dev, chỉ gửi được tới email chủ tài khoản Resend)
//   npx supabase secrets set ORDER_NOTIFY_EMAIL=...        (email nhận; bỏ trống thì dùng email ở Cấu hình → Thông tin liên hệ)
// Chưa cấu hình gửi email thì đơn vẫn được lưu và hiện ở trang quản trị (đánh dấu "chưa gửi email").
//
// Hợp đồng:
//   POST { action: 'create', organization_id, plan_id, quarters, full_name, phone, address, note? } -> { ok: true, order_id, email: 'sent'|'skipped'|'failed' }
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

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

interface MailData {
  plan_name: string; quarters: number; amount: number; full_name: string; phone: string; address: string; note: string | null;
  org_name: string; org_type: string; user_email: string | null; to_email: string | null;
}

async function sendMail(d: MailData): Promise<'sent' | 'skipped' | 'failed'> {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ORDER_NOTIFY_EMAIL') || d.to_email;
  if (!key || !to) return 'skipped';
  const from = Deno.env.get('RESEND_FROM') || 'Agricovi <onboarding@resend.dev>';
  const rows: [string, string][] = [
    ['Cơ sở', `${d.org_name} (${d.org_type === 'cooperative' ? 'Hợp tác xã' : 'Hộ'})`],
    ['Gói muốn mua', `${d.plan_name}, ${d.quarters} quý`],
    ['Thành tiền', vnd(Number(d.amount))],
    ['Họ tên', d.full_name], ['Điện thoại', d.phone], ['Địa chỉ', d.address],
    ['Ghi chú', d.note ?? ''], ['Email tài khoản', d.user_email ?? ''],
  ];
  const html = `<h2>Đơn mua gói dịch vụ mới</h2><table cellpadding="6" style="border-collapse:collapse">${rows.filter((r) => r[1]).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table><p>Vào trang quản trị nền tảng → Đơn mua gói để liên hệ và duyệt.</p>`;
  const text = `Đơn mua gói dịch vụ mới\n${rows.filter((r) => r[1]).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nVào trang quản trị nền tảng → Đơn mua gói để liên hệ và duyệt.`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Đơn mua gói ${d.plan_name} - ${d.org_name}`, html, text, ...(d.user_email ? { reply_to: d.user_email } : {}) }),
    });
    if (!res.ok) console.error('resend error', res.status, await res.text());
    return res.ok ? 'sent' : 'failed';
  } catch (e) {
    console.error('resend exception', e);
    return 'failed';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who.user) return fail('UNAUTHENTICATED: Cần đăng nhập', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST: Dữ liệu gửi lên không hợp lệ');
  }

  try {
    if (body.action !== 'create') return fail('BAD_REQUEST: Hành động không hợp lệ');
    // 1) tạo yêu cầu bằng quyền của chính người gọi (máy chủ kiểm: chỉ chủ cơ sở, gói hợp lệ, tối đa 3 yêu cầu chờ)
    const created = await asCaller.rpc('create_plan_order', {
      p_org: String(body.organization_id ?? ''), p_plan: String(body.plan_id ?? ''), p_quarters: Number(body.quarters ?? 1),
      p_name: String(body.full_name ?? ''), p_phone: String(body.phone ?? ''), p_address: String(body.address ?? ''), p_note: body.note ? String(body.note) : null,
    });
    if (created.error) return fail(created.error.message);
    const orderId = created.data as string;

    // 2) gửi email thông báo; lỗi gửi thư không làm mất đơn
    let email: 'sent' | 'skipped' | 'failed' = 'skipped';
    const md = await admin.rpc('plan_order_mail_data', { p_id: orderId });
    if (!md.error && md.data) email = await sendMail(md.data as MailData);
    await admin.rpc('plan_order_email_result', { p_id: orderId, p_status: email });
    return json({ ok: true, order_id: orderId, email });
  } catch (e) {
    console.error('plan-order error', e);
    return fail('SERVER: Có lỗi hệ thống, hãy thử lại sau', 500);
  }
});
