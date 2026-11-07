import type { APIRoute } from 'astro';
import { sb } from '../lib/db';

// Nhận biểu mẫu "Đăng ký tư vấn" (nút cố định bên phải). Lưu vào "Yêu cầu báo giá" của quản trị website, có tiền tố [Tư vấn].
export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  // chỉ nhận từ chính trang web này
  const o = request.headers.get('origin');
  if (!o || o !== new URL(request.url).origin) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  let b: Record<string, unknown> = {};
  try { b = await request.json(); } catch { return json({ error: 'Yêu cầu không hợp lệ.' }, 400); }
  const g = (k: string, n: number) => String(b[k] ?? '').trim().slice(0, n);
  if (g('website', 50)) return json({ ok: true }); // ô bẫy: người thật không thấy ô này
  const name = g('name', 80), phone = g('phone', 20), need = g('msg', 600);
  if (name.length < 2) return json({ error: 'Hãy nhập họ và tên.' }, 400);
  if (!/^\+?[\d\s.()-]{8,20}$/.test(phone)) return json({ error: 'Số điện thoại chưa đúng.' }, 400);
  if (!sb) return json({ error: 'Website chưa được cấu hình kết nối dữ liệu.' }, 503);
  const { error } = await sb.rpc('submit_quote_request', {
    p_kind: 'general', p_target: null, p_name: name, p_phone: phone, p_email: null, p_qty: null,
    p_message: ['[Tư vấn] Đăng ký tư vấn nhanh', need].filter(Boolean).join('\n'),
  });
  if (error) return json({ error: error.message.replace(/^[A-Z_]{4,}: /, '') }, 400);
  return json({ ok: true });
};
