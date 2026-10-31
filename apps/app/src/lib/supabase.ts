import { createClient } from '@supabase/supabase-js';
import { perfState } from './perfState';

// import.meta.env có thể không tồn tại khi chạy ngoài Vite (ví dụ kiểm thử bằng Node)
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

/** Tên biến còn thiếu lúc build (không lộ giá trị), để màn hướng dẫn nói đúng chỗ thiếu */
export const missingEnv = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean) as string[];

/** null khi chưa cấu hình .env - app hiện màn hướng dẫn cài đặt. */
// Khi đang đo một lần đồng bộ (lib/perf.ts) thì cộng dung lượng dữ liệu từng phản hồi; bình thường chỉ chuyển tiếp, không tốn thêm gì
const measuredFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (perfState.measuring) {
    perfState.requests += 1;
    void res.clone().arrayBuffer().then((b) => { perfState.bytes += b.byteLength; }).catch(() => undefined);
  }
  return res;
};
export const supabase = url && anonKey ? createClient(url, anonKey, { global: { fetch: measuredFetch } }) : null;
