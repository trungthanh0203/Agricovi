import { supabase } from './supabase';

export interface TeamRow {
  id: string;
  name: string;
  leader_worker_id: string | null;
  is_active: boolean;
  description?: string | null;
  area_id?: string | null;
}
export interface WorkerRow {
  id: string;
  full_name: string;
  phone: string | null;
  user_id: string | null;      // có tài khoản đăng nhập hay không
  work_mode: string | null;
  status: 'active' | 'inactive';
}
export interface TeamMembershipRow {
  team_id: string;
  worker_id: string;
}
export interface OrphanWorker {
  worker_id: string;
  full_name: string;
  work_mode: string | null;
  team_name: string | null;
}

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export async function loadTeams(org: string) {
  const c = client();
  const [teams, workers, members, orphans] = await Promise.all([
    c.from('worker_teams').select('id, name, leader_worker_id, is_active, description, area_id').eq('organization_id', org).eq('is_active', true).order('name')
      .then(async (r) => r.error // chưa db push 0091: tải bản cũ để vẫn xem được
        ? c.from('worker_teams').select('id, name, leader_worker_id, is_active').eq('organization_id', org).eq('is_active', true).order('name')
        : r),
    c.from('worker_profiles').select('id, full_name, phone, user_id, work_mode, status').eq('organization_id', org).eq('status', 'active').order('full_name'),
    c.from('worker_team_memberships').select('team_id, worker_id').is('valid_to', null),
    c.from('workers_without_leader').select('worker_id, full_name, work_mode, team_name').eq('organization_id', org),
  ]);
  for (const r of [teams, workers, members, orphans]) if (r.error) throw r.error;
  return {
    teams: (teams.data ?? []) as TeamRow[],
    workers: (workers.data ?? []) as WorkerRow[],
    members: (members.data ?? []) as TeamMembershipRow[],
    orphans: (orphans.data ?? []) as OrphanWorker[],
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const createTeam = (org: string, name: string, leader: string | null, description: string | null = null, area: string | null = null) =>
  rpc<string>('create_team', { p_org: org, p_name: name, p_leader: leader, p_description: description, p_area: area });
export const updateTeam = (team: string, name: string, leader: string | null, description: string | null, area: string | null) =>
  rpc<void>('update_team', { p_team: team, p_name: name, p_leader: leader, p_description: description, p_area: area });
export const archiveTeam = (team: string) => rpc<void>('archive_team', { p_team: team });
export const setTeamLeader = (team: string, leader: string | null) =>
  rpc<void>('set_team_leader', { p_team: team, p_leader: leader });
export const assignWorkerToTeam = (worker: string, team: string) =>
  rpc<void>('assign_worker_to_team', { p_worker: worker, p_team: team });
export const createWorkerWithoutAccount = (org: string, name: string, phone: string, mode: string, team: string | null) =>
  rpc<string>('create_worker_without_account', { p_org: org, p_name: name, p_phone: phone, p_work_mode: mode, p_team: team });

/** Sửa họ tên và điện thoại của người làm không có tài khoản (chủ/quản lý; cần mạng) */
export async function updateWorkerInfo(worker: string, name: string, phone: string): Promise<void> {
  const { error } = await client().from('worker_profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', worker);
  if (error) throw error;
}

/** Cho người làm không có tài khoản ngừng làm việc (không xóa: lịch sử công và lương vẫn giữ) */
export async function deactivateWorker(worker: string): Promise<void> {
  const { error } = await client().from('worker_profiles').update({ status: 'inactive' }).eq('id', worker);
  if (error) throw error;
}
