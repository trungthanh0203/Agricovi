import { callFunction } from './staff';
import { supabase } from './supabase';

/**
 * Thông báo đẩy ra điện thoại (H2 lát 1, D182). Chỉ xin quyền khi người dùng bấm "Bật thông báo". Cần có mạng để bật, tắt và gửi thử.
 * Thông báo đẩy không bảo đảm tới nơi (tiết kiệm pin, mất mạng); việc quan trọng luôn hiện ở Trang chủ.
 */
export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSub(): Promise<PushSubscription | null> {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

/** Trạng thái thông báo của máy này */
export async function pushStatus(): Promise<PushStatus> {
  if (isIos() && !isInstalled()) return 'ios-install';   // iPhone chỉ nhận khi đã thêm vào Màn hình chính
  if (!canPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSub()) && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Bật thông báo cho máy này (xin quyền, đăng ký, lưu lên máy chủ) */
export async function enablePush(): Promise<void> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để bật thông báo.');
  if (!canPush()) throw new Error('UNSUPPORTED: Máy này chưa hỗ trợ thông báo.');
  const { public_key } = await callFunction<{ public_key: string }>({ action: 'public_key' }, 'send-push');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('DENIED: Bạn chưa cho phép thông báo. Muốn bật lại, hãy cho phép thông báo cho Acovin trong cài đặt của máy hoặc trình duyệt.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('PUSH_FAILED: Máy không tạo được khóa nhận thông báo. Hãy thử lại.');
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
  if (error) throw new Error(error.message);
}

/** Tắt thông báo cho máy này */
export async function disablePush(): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  if (supabase && navigator.onLine) await supabase.rpc('remove_push_subscription', { p_endpoint: endpoint });
}

export interface DigestPrefs { enabled: boolean; hour: number }
/** Cài đặt bản tin buổi sáng của tôi (mặc định bật, 7 giờ) */
export async function getDigestPrefs(): Promise<DigestPrefs> {
  if (!supabase) return { enabled: true, hour: 7 };
  const { data, error } = await supabase.from('notification_prefs').select('morning_digest, digest_hour').maybeSingle();
  if (error) throw new Error(error.message);
  return { enabled: data?.morning_digest ?? true, hour: data?.digest_hour ?? 7 };
}
/** Bật/tắt bản tin và chọn giờ nhận (giờ Việt Nam) */
export async function saveDigestPrefs(p: DigestPrefs): Promise<void> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để lưu.');
  const { error } = await supabase.rpc('set_digest_prefs', { p_enabled: p.enabled, p_hour: p.hour });
  if (error) throw new Error(error.message);
}

/** Gửi thử một thông báo cho chính mình (mọi máy đã bật của tài khoản) */
export async function sendTestPush(): Promise<{ sent: number; removed: number }> {
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để gửi thử.');
  return callFunction<{ sent: number; removed: number }>({ action: 'test' }, 'send-push');
}
