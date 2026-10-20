import type { PermOverrides } from './permissions';
import { supabase } from './supabase';

/** Chức vụ do chủ cơ sở định nghĩa (D44). Mọi thao tác cần mạng; máy chủ kiểm quyền (chỉ chủ). */

export interface PositionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  perms: PermOverrides;
  /** null = làm được mọi loại việc */
  work_type_ids: string[] | null;
  can_manage_stages: boolean;
  is_active: boolean;
}

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}
async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function listPositions(orgId: string): Promise<PositionRow[]> {
  const rows = await ok(client().from('org_positions')
    .select('id, organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active').eq('organization_id', orgId).order('name'));
  return (rows ?? []) as PositionRow[];
}

export async function savePosition(
  orgId: string, id: string | null,
  f: { name: string; description: string; perms: PermOverrides; workTypeIds: string[] | null; canManageStages: boolean; isActive?: boolean },
): Promise<void> {
  needOnline('lưu chức vụ');
  await ok(client().rpc('save_position', {
    p_org: orgId, p_id: id, p_name: f.name, p_description: f.description, p_perms: f.perms,
    p_work_type_ids: f.workTypeIds, p_can_manage_stages: f.canManageStages, p_active: f.isActive ?? true,
  }));
}

export async function deletePosition(id: string): Promise<void> {
  needOnline('xóa chức vụ');
  await ok(client().rpc('delete_position', { p_id: id }));
}

/** Chức vụ đang giữ của từng thành viên (user_id → danh sách mã chức vụ) */
export async function listMemberPositions(orgId: string): Promise<Map<string, string[]>> {
  const rows = await ok(client().from('organization_memberships').select('user_id, position_ids').eq('organization_id', orgId).eq('status', 'active'));
  return new Map(((rows ?? []) as { user_id: string; position_ids: string[] | null }[]).map((r) => [r.user_id, r.position_ids ?? []]));
}

export async function setMemberPositions(orgId: string, userId: string, ids: string[]): Promise<void> {
  needOnline('gán chức vụ');
  await ok(client().rpc('set_member_positions', { p_org: orgId, p_user: userId, p_positions: ids }));
}
