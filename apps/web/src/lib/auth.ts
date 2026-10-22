import { createClient, type Session } from '@supabase/supabase-js';

/**
 * Đăng nhập và tài khoản người dùng website (W3). CHỈ chạy ở trình duyệt (phiên đăng nhập lưu ở máy người dùng); trang công khai dựng phía máy chủ
 * không bao giờ chứa dữ liệu riêng của người dùng. Mọi dữ liệu riêng lấy qua hàm RPC kiểm quyền ở CSDL (tài khoản nhân viên bị chặn ở đó).
 */
const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
export const auth = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export interface WebAccount {
  staff: boolean; user_id?: string; email: string | null; email_verified?: boolean;
  profile: { full_name: string; buyer_kind: string; company: string | null; tax_code: string | null; phone: string | null; login_kind: string; status: string } | null;
  orgs?: { org_id: string; name: string; type: string; is_owner: boolean }[];
  material_shop?: { id: string; name: string; slug: string; status: string } | null;
}

export const BUYER_KIND_LABEL: Record<string, string> = {
  individual: 'Cá nhân', restaurant: 'Nhà hàng, bếp ăn, quán', trader: 'Thương lái, đại lý', business: 'Doanh nghiệp', farm: 'Nhà vườn, trang trại (mua vật tư)',
};

/** Đưa lỗi kỹ thuật về câu tiếng Việt dễ hiểu */
export function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? String(e);
  if (/invalid login credentials/i.test(m)) return 'Số điện thoại/email hoặc mật khẩu chưa đúng.';
  if (/email not confirmed/i.test(m)) return 'Email chưa được xác nhận. Hãy mở thư xác nhận chúng tôi đã gửi rồi đăng nhập lại.';
  if (/user already registered|already been registered/i.test(m)) return 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu".';
  if (/password should be at least|weak/i.test(m)) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (/rate limit|too many/i.test(m)) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
  if (/failed to fetch|network/i.test(m)) return 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại.';
  return m.replace(/^[A-Z][A-Z_]{3,}: /, '');
}

export async function call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!auth) throw new Error('Website chưa được cấu hình kết nối dữ liệu.');
  const { data, error } = await auth.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Email hoặc số điện thoại -> email đăng nhập (số điện thoại dùng email ẩn của hệ thống) */
async function identToEmail(ident: string): Promise<string> {
  const t = ident.trim();
  if (t.includes('@')) return t;
  const email = await call<string | null>('login_email_for_phone', { p_phone: t });
  if (!email) throw new Error('Số điện thoại chưa đúng.');
  return email;
}

/** Lấy tài khoản của tôi, tạo hồ sơ người mua nếu chưa có. Tài khoản nhân viên bị đăng xuất kèm thông báo. */
export async function loadAccount(): Promise<WebAccount> {
  let acc = await call<WebAccount>('get_my_web_account');
  if (acc.staff) {
    await auth!.auth.signOut();
    throw new Error('Tài khoản nhân viên không dùng website. Hãy dùng ứng dụng AgriConnect.');
  }
  if (!acc.profile) acc = await call<WebAccount>('ensure_buyer_profile');
  rememberShops(acc);
  return acc;
}

export async function signIn(ident: string, password: string): Promise<WebAccount> {
  if (!auth) throw new Error('Website chưa được cấu hình kết nối dữ liệu.');
  const email = await identToEmail(ident);
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return loadAccount();
}

export interface Reg { mode: 'email' | 'phone'; ident: string; password: string; fullName: string; kind: string; company: string }
/** Trả về 'ready' (đã đăng nhập) hoặc 'confirm' (cần mở thư xác nhận email) */
export async function register(r: Reg, redirectPath = '/tai-khoan/'): Promise<'ready' | 'confirm'> {
  if (!auth || !url || !key) throw new Error('Website chưa được cấu hình kết nối dữ liệu.');
  if (r.mode === 'email') {
    const { data, error } = await auth.auth.signUp({
      email: r.ident.trim(), password: r.password,
      options: { data: { full_name: r.fullName.trim(), buyer_kind: r.kind, company: r.company.trim() }, emailRedirectTo: `${location.origin}${redirectPath}` },
    });
    if (error) throw error;
    if (!data.session) return 'confirm';
    await loadAccount();
    return 'ready';
  }
  const res = await fetch(`${url}/functions/v1/web-accounts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action: 'register_phone', phone: r.ident, password: r.password, full_name: r.fullName, buyer_kind: r.kind, company: r.company }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Chưa đăng ký được, vui lòng thử lại.');
  await signIn(r.ident, r.password);
  return 'ready';
}

/** Ghi nhớ ở máy người dùng có gian hàng nào (chỉ để menu trên cùng quyết định hiện liên kết; quyền thật luôn kiểm ở máy chủ) */
function rememberShops(acc: WebAccount): void {
  try { localStorage.setItem('agriconnect-acc', JSON.stringify({ org: (acc.orgs?.length ?? 0) > 0, mat: Boolean(acc.material_shop) })); } catch { /* bỏ qua */ }
}
export async function signOut(): Promise<void> {
  try { localStorage.removeItem('agriconnect-acc'); } catch { /* bỏ qua */ }
  await auth?.auth.signOut();
}
export async function session(): Promise<Session | null> { return auth ? (await auth.auth.getSession()).data.session : null; }
/** Đường dẫn quay lại sau đăng nhập: chỉ nhận đường dẫn nội bộ */
export function nextUrl(): string {
  const n = new URLSearchParams(location.search).get('next') ?? '';
  return /^\/(?!\/)[^\s"'<>]*$/.test(n) ? n : '/tai-khoan/';
}
