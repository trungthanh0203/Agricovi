import { createClient } from '@supabase/supabase-js';

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;

// Quản trị website chạy ở /admin/ CÙNG địa chỉ với website công khai (D64): dùng khóa lưu phiên riêng để không lẫn với phiên đăng nhập
// của người dùng website sau này (người mua, nhà cung cấp). Quản trị nền tảng chạy ở /quan-tri/ của app nên dùng chung phiên với app.
const storageKey = typeof location !== 'undefined' && location.pathname.startsWith('/admin') ? 'agriconnect-webadmin-auth' : undefined;

/** null khi chưa cấu hình biến môi trường (giống app chính) */
export const supabase = url && anon ? createClient(url, anon, storageKey ? { auth: { storageKey } } : undefined) : null;

/** Gọi hàm máy chủ; lỗi dạng "MÃ: nội dung" được rút gọn thành nội dung tiếng Việt */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Chưa cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(clean(error.message));
  return data as T;
}

export function clean(msg: string): string {
  const m = /^([A-Z][A-Z_]{3,}): (.+)$/s.exec(msg);
  return m ? m[2]! : msg;
}

export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const vnd = (n: number | string | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString('vi-VN')} đ`;

export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => {
    const t = v === null ? '' : String(v);
    return /[,"\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
  };
  const NL = String.fromCharCode(13, 10);
  const text = String.fromCharCode(0xfeff) + rows.map((r) => r.map(cell).join(',')).join(NL) + NL;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
