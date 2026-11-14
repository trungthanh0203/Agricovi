import { useEffect, useState } from 'react';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Tính năng nâng cao của cơ sở (mặc định TẮT, chủ bật ở Tài khoản → Tính năng nâng cao; migration 0196).
 * Cơ sở nhỏ không bật thì không thấy gì thêm. Bản lưu trên máy để mở app khi mất mạng vẫn đúng.
 */
export type FeatureKey = 'map';
const ALL: FeatureKey[] = ['map'];

const KEY = (org: string, f: string) => `agriconnect.feature.${org}.${f}`;
const listeners = new Set<() => void>();

function cached(org: string, f: string): boolean {
  try { return localStorage.getItem(KEY(org, f)) === '1'; } catch { return false; }
}

export async function refreshFeatures(orgId: string): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data, error } = await supabase.from('org_features').select('feature, enabled').eq('organization_id', orgId);
  if (error) return; // chưa db push 0196: coi như tắt
  const rows = (data ?? []) as { feature: string; enabled: boolean }[];
  try {
    for (const f of ALL) localStorage.setItem(KEY(orgId, f), rows.some((r) => r.feature === f && r.enabled) ? '1' : '0');
  } catch { /* bỏ qua */ }
  listeners.forEach((l) => l());
}

export function useFeature(orgId: string | undefined, f: FeatureKey): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    if (orgId) void refreshFeatures(orgId);
    return () => { listeners.delete(l); };
  }, [orgId]);
  return orgId ? cached(orgId, f) : false;
}

export async function setFeature(orgId: string, f: FeatureKey, enabled: boolean): Promise<void> {
  requireOnline('đổi tính năng nâng cao');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_feature', { p_org: orgId, p_feature: f, p_enabled: enabled });
  if (error) throw new Error(error.message);
  try { localStorage.setItem(KEY(orgId, f), enabled ? '1' : '0'); } catch { /* bỏ qua */ }
  listeners.forEach((l) => l());
}
