import type { MemberRole } from '@agriconnect/shared';
import type { PermOverrides } from './permissions';
import { supabase } from './supabase';

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface OrgInvitation {
  id: string;
  organization_id: string;
  org_name: string;
  org_type: 'household' | 'cooperative';
  roles: MemberRole[];
  invited_at: string;
}
export interface CoopInvitation {
  id: string;
  cooperative_org_id: string;
  coop_name: string;
  invited_at: string;
}
export interface Member {
  user_id: string;
  email: string;
  roles: MemberRole[];
  /** 'suspended' = chủ đã tạm dừng, người này không vào được cơ sở */
  status?: 'active' | 'suspended';
  is_self: boolean;
  is_staff: boolean;
  phone: string | null;
  full_name: string | null;
  must_change_password: boolean;
  work_mode: string | null;
  leads_teams: string[] | null;
  description?: string | null;
}
export interface PendingInvite {
  id: string;
  email: string;
  roles?: MemberRole[];
  created_at: string;
}
export interface CoopHousehold {
  household_org_id: string;
  name: string;
  joined_at: string | null;
  managed: boolean;
  active_coop_cycles: number;
  /** Thông tin cơ bản do HTX ghi (migration 0092) */
  member_code?: string | null;
  head_name?: string | null;
  phone?: string | null;
  address?: string | null;
  main_products?: string | null;
  area_ha?: number | null;
  note?: string | null;
  activity_status?: 'active' | 'paused';
  certificates?: string | null;
}

export interface HouseholdInfo {
  member_code: string; head_name: string; phone: string; address: string; main_products: string; area_ha: number | null; note: string;
  activity_status: 'active' | 'paused'; certificates: string;
}
export interface MyCooperative {
  cooperative_org_id: string;
  name: string;
  joined_at: string | null;
  managed: boolean;
}

export const myInvitations = () => rpc<OrgInvitation[]>('my_invitations');
export const myCoopInvitations = () => rpc<CoopInvitation[]>('my_coop_invitations');
export const acceptInvitation = (id: string) => rpc<string>('accept_invitation', { p_id: id });
export const declineInvitation = (id: string) => rpc<void>('decline_invitation', { p_id: id });
export const acceptCoopInvitation = (id: string, householdId: string) =>
  rpc<void>('accept_coop_invitation', { p_id: id, p_household: householdId });
export const declineCoopInvitation = (id: string) => rpc<void>('decline_coop_invitation', { p_id: id });

export const listMembers = (org: string) => rpc<Member[]>('list_org_members', { p_org: org });
export const inviteMember = (org: string, email: string, roles: MemberRole[]) =>
  rpc<string>('invite_member', { p_org: org, p_email: email, p_roles: roles });
export const revokeInvitation = (id: string) => rpc<void>('revoke_invitation', { p_id: id });
export const setMemberRoles = (org: string, user: string, roles: MemberRole[]) =>
  rpc<void>('set_member_roles', { p_org: org, p_user: user, p_roles: roles });
export const setMemberSuspended = (org: string, user: string, suspended: boolean) =>
  rpc<void>('set_member_suspended', { p_org: org, p_user: user, p_suspended: suspended });
export const removeMember = (org: string, user: string) => rpc<void>('remove_member', { p_org: org, p_user: user });

export async function pendingOrgInvites(org: string): Promise<PendingInvite[]> {
  const { data, error } = await client()
    .from('organization_invitations')
    .select('id, email, roles, created_at')
    .eq('organization_id', org)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as PendingInvite[];
}

export async function pendingCoopInvites(coop: string): Promise<PendingInvite[]> {
  const { data, error } = await client()
    .from('cooperative_invitations')
    .select('id, email, created_at')
    .eq('cooperative_org_id', coop)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as PendingInvite[];
}

export const listCoopHouseholds = (coop: string) => rpc<CoopHousehold[]>('list_coop_households', { p_coop: coop });
export const inviteHousehold = (coop: string, email: string) => rpc<string>('invite_household', { p_coop: coop, p_email: email });
export const revokeCoopInvitation = (id: string) => rpc<void>('revoke_coop_invitation', { p_id: id });
export const createMemberHousehold = (coop: string, name: string) =>
  rpc<string>('create_member_household', { p_coop: coop, p_name: name });
export const removeHousehold = (coop: string, household: string) =>
  rpc<void>('remove_household', { p_coop: coop, p_household: household });
export const leaveCooperative = (household: string) => rpc<void>('leave_cooperative', { p_household: household });
export const myCooperative = (household: string) => rpc<MyCooperative[]>('my_cooperative', { p_household: household });

/** Quyền theo mục đã cấp riêng cho từng thành viên (chỉ chủ xem được), khóa là mã người dùng */
export async function fetchPermissionOverrides(orgId: string): Promise<Record<string, PermOverrides>> {
  const rows = await rpc<Array<{ member_user_id: string; member_overrides: PermOverrides }>>('member_permission_overrides', { p_org: orgId });
  return Object.fromEntries((rows ?? []).map((r) => [r.member_user_id, r.member_overrides ?? {}]));
}

/** Chủ cấp quyền theo mục cho một người; bảng rỗng = trở về mặc định theo vai trò */
export const setMemberPermissions = (orgId: string, userId: string, perms: PermOverrides) =>
  rpc<void>('set_member_permissions', { p_org: orgId, p_user: userId, p_permissions: perms });

/** Trang trại được giao cho từng người (khóa là mã người dùng; null = tất cả). Chỉ chủ và quản lý đọc được. */
export async function fetchMemberAreas(orgId: string): Promise<Record<string, string[] | null>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('organization_memberships').select('user_id, area_ids').eq('organization_id', orgId);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.user_id as string, (r.area_ids as string[] | null) ?? null]));
}

/** Chủ giao trang trại cho một người; null hoặc rỗng = tất cả trang trại (D83) */
export const setMemberAreas = (orgId: string, userId: string, areaIds: string[] | null) =>
  rpc<void>('set_member_areas', { p_org: orgId, p_user: userId, p_area_ids: areaIds && areaIds.length > 0 ? areaIds : null });

/** Chủ ghi mô tả cho một nhân sự (rỗng = xóa mô tả) */
export const setMemberDescription = (orgId: string, userId: string, description: string) =>
  rpc<void>('set_member_description', { p_org: orgId, p_user: userId, p_description: description });

/** HTX ghi thông tin cơ bản của một hộ thành viên (rỗng = xóa) */
export const updateCoopHousehold = (coop: string, household: string, f: HouseholdInfo) =>
  rpc<void>('update_coop_household', {
    p_coop: coop, p_household: household, p_member_code: f.member_code, p_head_name: f.head_name, p_phone: f.phone,
    p_address: f.address, p_main_products: f.main_products, p_area_ha: f.area_ha, p_note: f.note, p_activity_status: f.activity_status, p_certificates: f.certificates,
  });
