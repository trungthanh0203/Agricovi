import { useEffect, useState } from 'react';
import { SUPPORT_CONTACT } from './brand';
import { supabase } from './supabase';

/**
 * Thông tin liên hệ của đơn vị vận hành (D130), do quản trị nền tảng sửa (trang quản trị → Cấu hình → Thông tin liên hệ).
 * Đọc công khai bằng hàm public_contact_info() nên dùng được ở trang đăng nhập; lưu bản gần nhất trên máy để hiện cả khi mất mạng.
 * Chưa có gì (chưa db push 0140, chưa có mạng lần đầu) thì dùng dòng liên hệ mặc định trong lib/brand.ts.
 */
export interface ContactInfo {
  company: string; address: string; phone: string; zalo: string; website: string; email: string; facebook: string; youtube: string;
}
const EMPTY: ContactInfo = { company: '', address: '', phone: '', zalo: '', website: '', email: '', facebook: '', youtube: '' };
const KEY = 'agricovi.contact_info';

function clean(raw: unknown): ContactInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof ContactInfo)[]) out[k] = typeof r[k] === 'string' ? (r[k] as string).trim() : '';
  return out;
}
const hasAny = (c: ContactInfo) => Object.values(c).some(Boolean);

function readCache(): ContactInfo | null {
  try { const raw = localStorage.getItem(KEY); return raw ? clean(JSON.parse(raw)) : null; } catch { return null; }
}

/** Hook: thông tin liên hệ (bản lưu trên máy hiện ngay, rồi cập nhật từ máy chủ nếu có mạng) */
export function useContactInfo(): ContactInfo | null {
  const [info, setInfo] = useState<ContactInfo | null>(readCache);
  useEffect(() => {
    if (!supabase || !navigator.onLine) return;
    let live = true;
    void supabase.rpc('public_contact_info').then(({ data, error }) => {
      if (!live || error) return;
      const c = clean(data);
      if (!hasAny(c)) return;
      setInfo(c);
      try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* bộ nhớ đầy hoặc bị chặn */ }
    });
    return () => { live = false; };
  }, []);
  return info;
}

/** Dòng liên hệ ngắn để chèn vào lời giới thiệu hoặc màn chờ: "Tên công ty · điện thoại · website" */
export function contactLine(c: ContactInfo | null): string {
  if (!c || !hasAny(c)) return SUPPORT_CONTACT;
  return [c.company, c.phone || c.zalo, c.website].filter(Boolean).join(' · ');
}

export const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
export const zaloHref = (p: string) => `https://zalo.me/${p.replace(/\D/g, '')}`;
