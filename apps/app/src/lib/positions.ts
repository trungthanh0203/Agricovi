import type { MemberRole } from '@agriconnect/shared';
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
  /** Vai trò của chức vụ: Nhân viên (worker) hoặc Quản lý (manager) — D84 */
  base_role: MemberRole;
  is_builtin: boolean;
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
    .select('id, organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin').eq('organization_id', orgId).order('name'));
  return (rows ?? []) as PositionRow[];
}

export async function savePosition(
  orgId: string, id: string | null,
  f: { name: string; description: string; perms: PermOverrides; workTypeIds: string[] | null; canManageStages: boolean; isActive?: boolean; baseRole?: MemberRole },
): Promise<void> {
  needOnline('lưu chức vụ');
  await ok(client().rpc('save_position', {
    p_org: orgId, p_id: id, p_name: f.name, p_description: f.description, p_perms: f.perms,
    p_work_type_ids: f.workTypeIds, p_can_manage_stages: f.canManageStages, p_active: f.isActive ?? true, p_base_role: f.baseRole ?? 'worker',
  }));
}

/** Thêm lại các chức vụ có sẵn đã xóa (không đụng chức vụ đã có) */
export async function addBuiltinRoles(orgId: string): Promise<number> {
  needOnline('thêm chức vụ có sẵn');
  return Number(await ok(client().rpc('add_builtin_roles', { p_org: orgId })));
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

/** Gán chức vụ cho một người (mỗi người đúng một chức vụ); vai trò của người đổi theo chức vụ (D84) */
export async function setMemberPosition(orgId: string, userId: string, positionId: string): Promise<void> {
  needOnline('gán chức vụ');
  await ok(client().rpc('set_member_position', { p_org: orgId, p_user: userId, p_position: positionId }));
}

/** Mời bằng email kèm chức vụ */
export async function inviteMemberPosition(orgId: string, email: string, positionId: string): Promise<string> {
  needOnline('mời thành viên');
  return String(await ok(client().rpc('invite_member_position', { p_org: orgId, p_email: email, p_position: positionId })));
}
