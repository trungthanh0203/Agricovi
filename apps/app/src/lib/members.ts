import type { MemberRole } from '@agriconnect/shared';
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
  is_self: boolean;
  is_staff: boolean;
  phone: string | null;
  full_name: string | null;
  must_change_password: boolean;
  work_mode: string | null;
  leads_teams: string[] | null;
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
