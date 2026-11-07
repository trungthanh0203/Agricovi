// Edge Function: ĐỌC ẢNH PHIẾU / HÓA ĐƠN NHẬP KHO và NHÃN / TỜ HƯỚNG DẪN VẬT TƯ (G2-3, D158). App gửi 1–3 ảnh; hàm nhờ mô hình đọc ảnh của Cloudflare Workers AI tách ra
// nhà cung cấp, số hóa đơn, ngày, tổng tiền và các dòng hàng, rồi trả BẢN NHÁP cho app. Ảnh KHÔNG được lưu ở bất kỳ đâu (chỉ đi qua bộ nhớ);
// chỉ ghi nhật ký số lần đọc (để tính hạn mức theo gói). Kết quả luôn là bản nháp: app cho người dùng kiểm tra rồi mới lưu.
//
// Triển khai:  npx supabase functions deploy scan-invoice
// Bí mật (một lần):
//   npx supabase secrets set CLOUDFLARE_ACCOUNT_ID=...  CLOUDFLARE_API_TOKEN=...      (token có quyền Workers AI)
// Mô hình lấy từ cấu hình nền tảng `invoice_scan_model` (mặc định Mistral Small 3.1); đổi ở bảng platform_settings, không cần triển khai lại.
//
// Hợp đồng:
//   POST { organization_id, scan_id (uuid tạo ở app), kind?: 'invoice' (mặc định) | 'label', images: ["data:image/jpeg;base64,..." × 1..3] }
//     -> kind invoice: { ok: true, draft: {...}, usage };  kind label: { ok: true, label: {...}, usage }.  Hai loại dùng chung một hạn mức tháng theo gói.
// Lỗi: HTTP 400/401/403/429/502 { error: "MÃ_LỖI: nội dung tiếng Việt" }. Lần đọc lỗi hệ thống không bị tính vào hạn mức.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { LABEL_PROMPT, PROMPT, parseModelJson, sanitizeDraft, sanitizeLabel } from './sanitize.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const DEFAULT_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const MAX_IMAGE_CHARS = 2_000_000; // ~1,5 MB mỗi ảnh sau khi app đã thu nhỏ
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textOf(result: Record<string, unknown> | undefined): string {
  if (!result) return '';
  if (typeof result.response === 'string') return result.response;
  if (result.response && typeof result.response === 'object') return JSON.stringify(result.response);
  const choices = result.choices as { message?: { content?: unknown } }[] | undefined;
  const c = choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p as { text?: string }).text ?? '').join('');
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('METHOD: Chỉ hỗ trợ POST', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cfAccount = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!cfAccount || !cfToken) return fail('NOT_CONFIGURED: Chức năng đọc phiếu chưa được cấu hình ở máy chủ. Hãy báo quản trị nền tảng.', 503);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);
  // gọi hàm CSDL bằng phiên của chính người dùng để quyền (has_perm) và hạn mức được kiểm đúng người
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who.user) return fail('UNAUTHENTICATED: Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.', 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('BAD_REQUEST: Yêu cầu không hợp lệ.'); }
  const org = String(body.organization_id ?? '');
  const scanId = String(body.scan_id ?? '');
  const images = Array.isArray(body.images) ? body.images.map(String) : [];
  const kind = body.kind === 'label' ? 'label' : 'invoice';
  if (!UUID.test(org) || !UUID.test(scanId)) return fail('BAD_REQUEST: Thiếu mã cơ sở hoặc mã lần đọc.');
  if (images.length < 1 || images.length > 3) return fail('BAD_REQUEST: Cần từ 1 đến 3 ảnh.');
  for (const im of images) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(im)) return fail('BAD_IMAGE: Ảnh không đúng định dạng (cần JPEG, PNG hoặc WebP).');
    if (im.length > MAX_IMAGE_CHARS) return fail('BAD_IMAGE: Ảnh quá lớn. Hãy chụp lại hoặc chọn ảnh nhỏ hơn.');
  }

  // quyền + hạn mức + tốc độ (ném lỗi có mã: FORBIDDEN, SCAN_LIMIT, SCAN_NOT_ALLOWED, SCAN_RATE)
  const begun = await asUser.rpc('begin_invoice_scan', { p_org: org, p_id: scanId, p_images: images.length, p_kind: kind });
  if (begun.error) {
    const msg = begun.error.message;
    const status = /^FORBIDDEN/.test(msg) ? 403 : /^SCAN_(LIMIT|RATE)/.test(msg) ? 429 : 400;
    return fail(msg, status);
  }
  const usage = begun.data as { limit: number; used: number; remaining: number };

  const t0 = Date.now();
  let model = DEFAULT_MODEL;
  const finish = async (ok: boolean, lines: number) => {
    await asUser.rpc('finish_invoice_scan', { p_id: scanId, p_ok: ok, p_lines: lines, p_ms: Date.now() - t0, p_model: model });
  };

  try {
    const { data: st } = await admin.from('platform_settings').select('value').eq('key', 'invoice_scan_model').maybeSingle();
    if (typeof st?.value === 'string' && /^@cf\/[\w./-]+$/.test(st.value)) model = st.value;

    const content = [{ type: 'text', text: kind === 'label' ? LABEL_PROMPT : PROMPT }, ...images.map((im) => ({ type: 'image_url', image_url: { url: im } }))];
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content }], max_tokens: kind === 'label' ? 4000 : 3000, temperature: 0 }),
    });
    const j = await res.json().catch(() => ({})) as { success?: boolean; result?: Record<string, unknown>; errors?: unknown };
    if (!res.ok || j.success === false) {
      console.error('cloudflare ai error', res.status, JSON.stringify(j.errors ?? j).slice(0, 300));
      await finish(false, 0);
      return fail(res.status === 429 ? 'AI_BUSY: Dịch vụ đọc ảnh đang quá tải trong hôm nay. Hãy thử lại sau hoặc nhập tay.' : 'AI_FAILED: Không đọc được ảnh lúc này. Hãy thử lại sau hoặc nhập tay.', res.status === 429 ? 429 : 502);
    }
    if (kind === 'label') {
      const label = sanitizeLabel(parseModelJson(textOf(j.result)));
      if (!label) {
        await finish(false, 0);
        return fail('AI_UNREADABLE: Không đọc được thông tin vật tư từ ảnh này. Hãy chụp lại rõ hơn (đủ sáng, thấy hết chữ, tránh bóng loáng) hoặc nhập tay.', 422);
      }
      await finish(true, 1);
      return json({ ok: true, label, usage });
    }
    const draft = sanitizeDraft(parseModelJson(textOf(j.result)));
    if (!draft) {
      await finish(false, 0);
      return fail('AI_UNREADABLE: Không đọc được nội dung ảnh này. Hãy chụp lại rõ hơn (đủ sáng, thẳng, không bị cắt chữ) hoặc nhập tay.', 422);
    }
    await finish(true, draft.dong_hang.length);
    return json({ ok: true, draft, usage });
  } catch (e) {
    console.error('scan-invoice exception', e);
    await finish(false, 0).catch(() => undefined);
    return fail('AI_FAILED: Không đọc được ảnh lúc này. Hãy thử lại sau hoặc nhập tay.', 502);
  }
});
