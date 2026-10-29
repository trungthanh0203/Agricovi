import { callFunction } from './staff';
import { createIsolatedClient, supabase } from './supabase';

/**
 * Máy chấm công (D111): một điện thoại cố định ở phân khu, đăng nhập bằng TÀI KHOẢN THIẾT BỊ (không có vai trò trong cơ sở).
 * Người làm nhập số điện thoại + PIN, bấm Vào ca hoặc Ra ca, máy chụp ảnh kèm theo. Cần mạng. Máy chủ kiểm mọi điều kiện.
 */

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export interface KioskInfo { kiosk_id: string; organization_id: string; org_name: string; area_id: string | null; area_name: string | null; name: string }

const cacheKey = (uid: string) => `agri.kiosk.${uid}`;

/** Thiết bị này có phải máy chấm công không. Mất mạng thì dùng kết quả lần trước (máy chủ vẫn chặn khi máy đã bị ngừng). */
export async function fetchKioskInfo(uid: string): Promise<KioskInfo | null> {
  try {
    if (!supabase || !navigator.onLine) throw new Error('offline');
    const { data, error } = await supabase.rpc('kiosk_me');
    if (error) throw error;
    try { localStorage.setItem(cacheKey(uid), JSON.stringify(data ?? null)); } catch { /* bỏ qua */ }
    return (data as KioskInfo | null) ?? null;
  } catch {
    try {
      const raw = localStorage.getItem(cacheKey(uid));
      return raw ? (JSON.parse(raw) as KioskInfo | null) : null;
    } catch { return null; }
  }
}
export function readCachedKiosk(uid: string): KioskInfo | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw === null ? undefined : (JSON.parse(raw) as KioskInfo | null);
  } catch { return undefined; }
}

export interface KioskReply { ok: boolean; code?: string; message?: string; [k: string]: unknown }

async function call(fn: string, args: Record<string, unknown>): Promise<KioskReply> {
  if (!navigator.onLine) return { ok: false, code: 'OFFLINE', message: 'Máy chấm công cần có mạng. Hãy kiểm tra Internet rồi thử lại.' };
  const { data, error } = await client().rpc(fn, args);
  if (error) return { ok: false, code: 'ERROR', message: error.message.replace(/^[A-Z_]+: /, '') };
  return data as KioskReply;
}

export const kioskCheck = (phone: string, pin: string) => call('kiosk_check', { p_phone: phone, p_pin: pin });
export const kioskPunch = (phone: string, pin: string, action: 'in' | 'out', id: string, photo: string, faceOk: boolean | null) =>
  call('kiosk_punch', { p_phone: phone, p_pin: pin, p_action: action, p_id: id, p_photo: photo, p_face_ok: faceOk });
export const kioskSetPin = (phone: string, code: string, pin: string) => call('kiosk_set_pin', { p_phone: phone, p_code: code, p_new_pin: pin });

/** Thoát chế độ máy chấm công: phải đăng nhập lại bằng tài khoản CHỦ cơ sở. Kiểm tra bằng máy khách riêng để không đổi phiên của máy. */
export async function verifyOwnerToExit(identifier: string, password: string, orgId: string): Promise<void> {
  const tmp = createIsolatedClient();
  if (!tmp) throw new Error('Supabase chưa được cấu hình');
  let email = identifier.trim();
  if (!email.includes('@')) {
    const { data, error } = await tmp.rpc('login_email_for_phone', { p_phone: email });
    if (error) throw error;
    if (!data) throw new Error('INVALID_PHONE: Số điện thoại chưa đúng.');
    email = data as string;
  }
  const { error } = await tmp.auth.signInWithPassword({ email, password });
  if (error) throw error;
  try {
    const { data, error: e2 } = await tmp.rpc('kiosk_can_exit', { p_org: orgId });
    if (e2) throw e2;
    if (data !== true) throw new Error('FORBIDDEN: Chỉ chủ cơ sở được thoát chế độ máy chấm công.');
  } finally {
    await tmp.auth.signOut().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Phía chủ / quản lý
// ---------------------------------------------------------------------------
export interface KioskRow { id: string; area_id: string | null; name: string; active: boolean; created_at: string }

export async function listKiosks(orgId: string): Promise<KioskRow[]> {
  const { data, error } = await client().from('attendance_kiosks').select('id, area_id, name, active, created_at').eq('organization_id', orgId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as KioskRow[];
}

/** Chủ liên kết điện thoại này làm máy chấm công: tạo tài khoản thiết bị rồi chuyển phiên đăng nhập của máy sang tài khoản đó (chủ bị đăng xuất khỏi máy). */
export async function linkThisDeviceAsKiosk(orgId: string, areaId: string | null, name: string): Promise<void> {
  const res = await callFunction<{ kiosk_id: string; email: string; password: string }>({
    action: 'create_kiosk', organization_id: orgId, area_id: areaId, name, consent: true,
  });
  const { error } = await client().auth.signInWithPassword({ email: res.email, password: res.password }); // mật khẩu không được lưu lại ở đâu
  if (error) throw error;
}

export const revokeKiosk = (orgId: string, kioskId: string) => callFunction<{ ok: boolean }>({ action: 'revoke_kiosk', organization_id: orgId, kiosk_id: kioskId });

export async function issuePinCode(workerId: string): Promise<string> {
  const { data, error } = await client().rpc('issue_pin_code', { p_worker: workerId });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface PinStatus { wid: string; has_pin: boolean; code_pending: boolean; is_locked: boolean }
export async function listPinStatus(orgId: string): Promise<PinStatus[]> {
  const { data, error } = await client().rpc('list_kiosk_pin_status', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data ?? []) as PinStatus[];
}

export interface PhotoReviewRow {
  ph_id: string; att_id: string; wk_id: string; wk_name: string; ph_kind: 'in' | 'out'; ph_at: string; ph_photo: string;
  ph_face_ok: boolean | null; ph_flags: string[]; kiosk_name: string | null; area_name: string | null;
}
export async function listPhotoReview(orgId: string, from: string, to: string): Promise<PhotoReviewRow[]> {
  const { data, error } = await client().rpc('attendance_photo_review', { p_org: orgId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []) as PhotoReviewRow[];
}

export const FLAG_LABEL: Record<string, string> = {
  no_face: 'Không thấy khuôn mặt',
  unchecked: 'Máy chưa kiểm được mặt',
  fast_pair: 'Hai người bấm sát nhau',
  forgot_out: 'Quên Ra ca hôm trước',
};
