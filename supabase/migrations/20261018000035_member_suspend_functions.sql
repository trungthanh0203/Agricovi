-- (tách file vì giá trị enum mới chưa dùng được trong cùng giao dịch với lệnh thêm giá trị)
create or replace function set_member_suspended(p_org uuid, p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role[]; st member_status;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạm dừng thành viên.'; end if;
  select m.roles, m.status into cur, st from organization_memberships m
   where m.organization_id = p_org and m.user_id = p_user and m.status in ('active', 'suspended');
  if cur is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (cur) then raise exception 'INVALID_ROLE: Không tạm dừng chủ cơ sở.'; end if;
  update organization_memberships set status = case when p_suspended then 'suspended'::member_status else 'active'::member_status end
   where organization_id = p_org and user_id = p_user;
end $$;
revoke execute on function set_member_suspended(uuid, uuid, boolean) from public, anon;
grant execute on function set_member_suspended(uuid, uuid, boolean) to authenticated, service_role;

drop function list_org_members(uuid);
create function list_org_members(p_org uuid) returns table (
  user_id uuid, email text, roles member_role[], status member_status, is_self boolean,
  is_staff boolean, phone text, full_name text, must_change_password boolean, work_mode text, leads_teams text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select m.user_id, u.email::text, m.roles, m.status, m.user_id = auth.uid(),
           sa.user_id is not null, sa.phone, sa.full_name, coalesce(sa.must_change_password, false), wp.work_mode,
           (select array_agg(t.name order by t.name)
              from worker_teams t join worker_profiles lw on lw.id = t.leader_worker_id
             where lw.user_id = m.user_id and t.organization_id = p_org and t.is_active)
      from organization_memberships m
      join auth.users u on u.id = m.user_id
      left join staff_accounts sa on sa.user_id = m.user_id
      left join worker_profiles wp on wp.user_id = m.user_id and wp.organization_id = p_org
     where m.organization_id = p_org and m.status in ('active', 'suspended')
     order by ('owner' = any (m.roles)) desc, coalesce(sa.full_name, u.email);
end $$;
revoke execute on function list_org_members(uuid) from public, anon;
grant execute on function list_org_members(uuid) to authenticated, service_role;
