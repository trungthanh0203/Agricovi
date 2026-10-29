import { supabase } from './supabase';
import { callFunction } from './staff';

/**
 * Chủ cơ sở đăng ký bằng SỐ ĐIỆN THOẠI (D121), cho hộ không có email. Miễn phí, không gửi mã: đăng ký ở trạng thái chờ duyệt,
 * quản trị Agricovi liên hệ qua Zalo xác nhận rồi duyệt thì cơ sở mới được tạo.
 */
export interface PhoneSignupInput { phone: string; password: string; full_name: string; org_name: string; org_type: 'household' | 'cooperative'; turnstile_token?: string }

export const registerByPhone = (p: PhoneSignupInput) => callFunction<{ ok: boolean; phone: string }>({ action: 'register', ...p }, 'owner-signup');

export interface OwnerSignup { status: 'pending' | 'approved' | 'rejected'; org_name: string; phone: string; note: string | null; created_at: string }

/** Trạng thái đăng ký của tôi (null nếu không đăng ký bằng số điện thoại) */
export async function fetchOwnerSignup(): Promise<OwnerSignup | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_owner_signup');
  if (error) throw error;
  return (data as OwnerSignup | null) ?? null;
}
