import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Địa chỉ trang quản trị: cùng tên miền ở /quan-tri/ (khi chạy thử trên máy thì cổng 5181) */
const env = ((import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {});
export const ADMIN_URL = env.DEV ? 'http://localhost:5181/' : '/quan-tri/';

/**
 * Tài khoản có phải quản trị viên nền tảng không (D54). Chỉ để HIỆN hình khóa dẫn tới trang quản trị;
 * quyền thật do CSDL kiểm ở mọi thao tác quản trị. Nhớ kết quả trên máy để hiện cả khi mất mạng.
 */
export function useIsPlatformAdmin(uid: string | undefined): boolean {
  const key = uid ? `agriconnect.padmin.${uid}` : '';
  const [yes, setYes] = useState(() => {
    try { return key ? localStorage.getItem(key) === '1' : false; } catch { return false; }
  });
  useEffect(() => {
    if (!uid || !supabase || !navigator.onLine) return;
    let alive = true;
    void supabase.rpc('is_platform_admin').then(({ data, error }) => {
      if (!alive || error) return;
      const v = data === true;
      setYes(v);
      try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* bỏ qua */ }
    });
    return () => { alive = false; };
  }, [uid, key]);
  return yes;
}
