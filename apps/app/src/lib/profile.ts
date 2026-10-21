import { useEffect, useState } from 'react';
import { fetchStaffStatus } from './staff';
import { supabase } from './supabase';

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}

/** Tên hiển thị người dùng tự đặt (null nếu chưa đặt) */
export async function fetchDisplayName(uid: string): Promise<string | null> {
  if (!supabase || !navigator.onLine) return null;
  const { data } = await supabase.from('user_profiles').select('display_name').eq('user_id', uid).maybeSingle();
  return (data as { display_name: string } | null)?.display_name ?? null;
}

export async function saveDisplayName(name: string): Promise<string> {
  needOnline('đổi tên hiển thị');
  const { data, error } = await client().rpc('set_display_name', { p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Đổi mật khẩu của chính mình */
export async function changeMyPassword(newPassword: string): Promise<void> {
  needOnline('đổi mật khẩu');
  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export interface MyWork {
  workerId: string;
  mode: string | null;
  teamName: string | null;
  leadsTeams: string[];
}

/** Tổ tôi đang làm và các tổ tôi phụ trách ở một cơ sở (chỉ khi tôi có hồ sơ lao động) */
export async function fetchMyWork(uid: string, orgId: string): Promise<MyWork | null> {
  if (!supabase || !navigator.onLine) return null;
  const w = await supabase.from('worker_profiles').select('id, work_mode').eq('user_id', uid).eq('organization_id', orgId).maybeSingle();
  const me = w.data as { id: string; work_mode: string | null } | null;
  if (!me) return null;
  const [mem, led] = await Promise.all([
    supabase.from('worker_team_memberships').select('team_id').eq('worker_id', me.id).is('valid_to', null),
    supabase.from('worker_teams').select('name').eq('leader_worker_id', me.id).eq('is_active', true),
  ]);
  const teamIds = ((mem.data ?? []) as { team_id: string }[]).map((r) => r.team_id);
  let teamName: string | null = null;
  if (teamIds.length > 0) {
    const t = await supabase.from('worker_teams').select('name').in('id', teamIds).limit(1);
    teamName = ((t.data ?? []) as { name: string }[])[0]?.name ?? null;
  }
  return { workerId: me.id, mode: me.work_mode, teamName, leadsTeams: ((led.data ?? []) as { name: string }[]).map((r) => r.name) };
}

/** Tên hiển thị của người đang đăng nhập (tên tự đặt > họ tên nhân viên > phần đầu email), nhớ trên máy để hiện cả khi offline */
export function useMyName(uid: string | undefined, email: string | undefined): string {
  const key = uid ? `agriconnect.myname.${uid}` : '';
  const [name, setName] = useState(() => {
    try { return (key && localStorage.getItem(key)) || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (!uid || !navigator.onLine) return;
    let alive = true;
    void Promise.all([fetchDisplayName(uid).catch(() => null), fetchStaffStatus(uid).catch(() => null)]).then(([d, s]) => {
      const n = d ?? s?.full_name ?? '';
      if (!alive || !n) return;
      setName(n);
      try { localStorage.setItem(key, n); } catch { /* bỏ qua */ }
    });
    return () => { alive = false; };
  }, [uid, key]);
  return name || (email?.includes('@sdt.') ? email.split('@')[0]! : email?.split('@')[0]) || '';
}
