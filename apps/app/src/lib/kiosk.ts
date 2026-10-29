import { callFunction } from './staff';
import { supabase } from './supabase';

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
export const kioskPunch = (phone: string, pin: string, action: 'in' | 'out', id: string, photo: string, faceOk: boolean | null, descriptor: number[] | null = null, attempts = 1, cycleId: string | null = null) =>
  call('kiosk_punch', { p_phone: phone, p_pin: pin, p_action: action, p_id: id, p_photo: photo, p_face_ok: faceOk, p_descriptor: descriptor, p_attempts: attempts, p_cycle: cycleId });

export interface KioskCycle { id: string; name: string; in_area: boolean }
/** Các vụ chọn được khi Vào ca ở máy này (để tính chi phí nhân công theo vụ) */
export async function kioskCycles(): Promise<KioskCycle[]> {
  const { data, error } = await client().rpc('kiosk_cycles');
  if (error) return [];
  return (data ?? []) as KioskCycle[];
}
/** Mức khớp khuôn mặt (match | maybe | mismatch | no_ref | none), không ghi gì: để máy cho chụp lại khi không khớp */
export const kioskFaceCheck = (phone: string, pin: string, descriptor: number[]) => call('kiosk_face_check', { p_phone: phone, p_pin: pin, p_descriptor: descriptor });
/** Đặt PIN; kèm khuôn mặt (1–3 dấu vân + ảnh mẫu) thì cần người làm đã đồng ý */
export const kioskSetPin = (phone: string, code: string, pin: string, face?: { descriptors: number[][]; photo: string }) =>
  call('kiosk_set_pin', { p_phone: phone, p_code: code, p_new_pin: pin, p_descriptors: face?.descriptors ?? null, p_photo: face?.photo ?? null, p_consent: Boolean(face) });

// ---------------------------------------------------------------------------
// Phía chủ / quản lý
// ---------------------------------------------------------------------------
export interface KioskRow { id: string; area_id: string | null; name: string; active: boolean; created_at: string; ask_cycle: boolean }

export async function listKiosks(orgId: string): Promise<KioskRow[]> {
  const { data, error } = await client().from('attendance_kiosks').select('id, area_id, name, active, created_at, ask_cycle').eq('organization_id', orgId).order('created_at');
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

/** Liên kết lại một máy chấm công ĐÃ CÓ (không nhập lại tên, phân khu, đồng ý): đặt mật khẩu mới cho tài khoản thiết bị rồi chuyển phiên của máy sang đó. */
export async function relinkThisDeviceToKiosk(orgId: string, kioskId: string): Promise<void> {
  const res = await callFunction<{ kiosk_id: string; email: string; password: string }>({ action: 'relink_kiosk', organization_id: orgId, kiosk_id: kioskId });
  const { error } = await client().auth.signInWithPassword({ email: res.email, password: res.password });
  if (error) throw error;
}

// Điện thoại nhớ máy chấm công nó từng làm (chỉ tên và mã, không có mật khẩu) để lần sau chủ chọn lại ngay
const LAST_KIOSK_KEY = 'agri.lastKiosk';
export function rememberKioskOnDevice(id: string, name: string): void {
  try { localStorage.setItem(LAST_KIOSK_KEY, JSON.stringify({ id, name })); } catch { /* bỏ qua */ }
}
export function lastKioskOnDevice(): { id: string; name: string } | null {
  try { const raw = localStorage.getItem(LAST_KIOSK_KEY); return raw ? (JSON.parse(raw) as { id: string; name: string }) : null; } catch { return null; }
}

export const revokeKiosk = (orgId: string, kioskId: string) => callFunction<{ ok: boolean }>({ action: 'revoke_kiosk', organization_id: orgId, kiosk_id: kioskId });

export async function issuePinCode(workerId: string): Promise<string> {
  const { data, error } = await client().rpc('issue_pin_code', { p_worker: workerId });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface PinStatus { wid: string; has_pin: boolean; code_pending: boolean; is_locked: boolean; has_face: boolean }
export async function listPinStatus(orgId: string): Promise<PinStatus[]> {
  const { data, error } = await client().rpc('list_kiosk_pin_status', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data ?? []) as PinStatus[];
}

export interface PhotoReviewRow {
  ph_id: string; att_id: string; wk_id: string; wk_name: string; ph_kind: 'in' | 'out'; ph_at: string; ph_photo: string;
  ph_face_ok: boolean | null; ph_flags: string[]; kiosk_name: string | null; area_name: string | null; ph_distance: number | null;
}
export async function listPhotoReview(orgId: string, from: string, to: string): Promise<PhotoReviewRow[]> {
  const { data, error } = await client().rpc('attendance_photo_review', { p_org: orgId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []) as PhotoReviewRow[];
}

export async function deleteWorkerFace(workerId: string): Promise<void> {
  const { error } = await client().rpc('delete_worker_face', { p_worker: workerId });
  if (error) throw new Error(error.message);
}

/** Ảnh mẫu khuôn mặt (nhỏ) của các người làm, để chủ nhìn cạnh ảnh chấm công */
export async function listFaceRefPhotos(workerIds: string[]): Promise<Record<string, string>> {
  if (workerIds.length === 0) return {};
  const { data, error } = await client().from('worker_face_profiles').select('worker_id, photo').in('worker_id', workerIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries(((data ?? []) as { worker_id: string; photo: string }[]).map((r) => [r.worker_id, r.photo]));
}

/** Cờ chỉ để nhắc nhẹ (không tính là đáng ngờ) */
export const SOFT_FLAGS = ['unchecked', 'no_ref', 'no_descriptor', 'face_maybe'];

export const FLAG_LABEL: Record<string, string> = {
  face_mismatch: 'Có thể không phải đúng người',
  face_maybe: 'Khớp chưa chắc',
  no_ref: 'Chưa đăng ký khuôn mặt',
  no_descriptor: 'Máy chưa so được khuôn mặt',
  retries: 'Phải chụp nhiều lần',
  no_face: 'Không thấy khuôn mặt',
  unchecked: 'Máy chưa kiểm được mặt',
  fast_pair: 'Hai người bấm sát nhau',
  forgot_out: 'Quên Ra ca hôm trước',
};

export async function setWorkerPhone(workerId: string, phone: string): Promise<string> {
  const { data, error } = await client().rpc('set_worker_phone', { p_worker: workerId, p_phone: phone });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setKioskAskCycle(kioskId: string, on: boolean): Promise<void> {
  const { error } = await client().rpc('set_kiosk_ask_cycle', { p_kiosk: kioskId, p_on: on });
  if (error) throw new Error(error.message);
}
