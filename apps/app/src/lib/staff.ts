import { supabase } from './supabase';

export interface StaffStatus {
  is_staff: boolean;
  must_change: boolean;
  expired: boolean;
  org_name: string | null;
  full_name: string | null;
}

export type WorkMode = 'self_hourly' | 'leader_hourly' | 'leader_output' | 'mixed';

/** Kiểu do tổ trưởng chấm/ghi: bắt buộc thuộc một tổ có tổ trưởng (quyết định D17) */
export const isLeaderMode = (m: WorkMode) => m === 'leader_hourly' || m === 'leader_output';

/** [GIẢ ĐỊNH] 4 kiểu phân hệ khởi đầu (docs/DECISIONS.md D10); mở rộng bằng migration + danh sách này. */
export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  self_hourly: 'Tự chấm công bằng điện thoại, tính theo giờ',
  leader_hourly: 'Tổ trưởng chấm công, tính theo giờ',
  leader_output: 'Tổ trưởng ghi sản lượng, tính theo sản lượng',
  mixed: 'Kết hợp giờ và sản lượng',
};

const cacheKey = (uid: string) => `agriconnect.staff.${uid}`;

export async function fetchStaffStatus(uid: string): Promise<StaffStatus | null> {
  try {
    if (!supabase || !navigator.onLine) throw new Error('offline');
    const { data, error } = await supabase.rpc('my_staff_status');
    if (error) throw error;
    const row = ((data as StaffStatus[] | null) ?? [])[0] ?? null;
    try { localStorage.setItem(cacheKey(uid), JSON.stringify(row)); } catch { /* bỏ qua */ }
    return row;
  } catch {
    // Offline: dùng trạng thái đã lưu lần trước. Máy chủ vẫn chặn dữ liệu nếu nhân viên chưa đổi mật khẩu.
    try {
      const raw = localStorage.getItem(cacheKey(uid));
      return raw ? (JSON.parse(raw) as StaffStatus | null) : null;
    } catch {
      return null;
    }
  }
}

export async function completePasswordChange(newPassword: string): Promise<void> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const up = await supabase.auth.updateUser({ password: newPassword });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('staff_password_changed');
  if (error) throw error;
}

export interface StaffCredentials {
  user_id?: string;
  phone: string;
  temp_password: string;
  expires_at: string;
}

async function callFunction<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.functions.invoke('staff-accounts', { body });
  if (error) {
    // Lỗi HTTP: nội dung nằm trong phản hồi { error: "MÃ: nội dung" }
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j.error) throw new Error(j.error);
      } catch (e) {
        if (e instanceof Error && e.message && !/JSON|Unexpected/i.test(e.message)) throw e;
      }
    }
    throw error;
  }
  return data as T;
}

export const createStaffAccount = (p: {
  organization_id: string; full_name: string; phone: string; roles: string[]; work_mode: WorkMode; team_id?: string | null;
}) => callFunction<StaffCredentials>({ action: 'create', ...p });

/** Chủ đổi họ tên và số điện thoại (= tên đăng nhập) của nhân viên. Cần triển khai lại Edge Function staff-accounts. */
export const updateStaffProfile = (organization_id: string, user_id: string, full_name: string, phone: string) =>
  callFunction<{ phone: string; full_name: string }>({ action: 'update', organization_id, user_id, full_name, phone });

export const resetStaffPassword = (organization_id: string, user_id: string) =>
  callFunction<StaffCredentials>({ action: 'reset_password', organization_id, user_id });
