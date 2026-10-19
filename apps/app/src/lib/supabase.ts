import { createClient } from '@supabase/supabase-js';

// import.meta.env có thể không tồn tại khi chạy ngoài Vite (ví dụ kiểm thử bằng Node)
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

/** Tên biến còn thiếu lúc build (không lộ giá trị), để màn hướng dẫn nói đúng chỗ thiếu */
export const missingEnv = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean) as string[];

/** null khi chưa cấu hình .env - app hiện màn hướng dẫn cài đặt. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
