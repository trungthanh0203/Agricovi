import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Mã giới thiệu (D131). Liên kết dạng .../?ref=MÃ được lưu lại ở máy để tự điền vào ô "Mã giới thiệu" khi đăng ký.
 * Chủ cơ sở có mã riêng (tự tạo lần đầu xem) để giới thiệu người quen.
 */
const KEY = 'agricovi.ref';

export function captureRefFromUrl(): void {
  try {
    const r = new URL(window.location.href).searchParams.get('ref');
    if (r && /^[A-Za-z0-9-]{3,20}$/.test(r)) localStorage.setItem(KEY, r.toUpperCase());
  } catch { /* trình duyệt chặn lưu trữ: bỏ qua */ }
}
export const storedRef = (): string => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setStoredRef = (v: string): void => { try { if (v.trim()) localStorage.setItem(KEY, v.trim().toUpperCase()); } catch { /* bỏ qua */ } };
export const clearStoredRef = (): void => { try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ } };

export interface MyReferral { code: string; active: boolean; pct: number; months: number; referred: number; paying: number; earned_open: number; earned_paid: number }

/** Mã giới thiệu của cơ sở đang dùng (chỉ chủ cơ sở; cần mạng). null khi chưa tải được hoặc không đủ quyền. */
export function useMyReferral(orgId: string | undefined, enabled: boolean): MyReferral | null {
  const [data, setData] = useState<MyReferral | null>(null);
  useEffect(() => {
    setData(null);
    if (!supabase || !orgId || !enabled || !navigator.onLine) return;
    let alive = true;
    void supabase.rpc('my_referral', { p_org: orgId }).then(({ data: d, error }) => { if (alive && !error) setData(d as MyReferral); });
    return () => { alive = false; };
  }, [orgId, enabled]);
  return data;
}
