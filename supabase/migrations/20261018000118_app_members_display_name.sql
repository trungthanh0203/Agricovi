-- Danh sách nhân sự trả thêm "Tên người dùng" (user_profiles.display_name) của từng thành viên có tài khoản email,
-- để cột Họ tên hiện tên người dùng thay vì email (chủ cơ sở thường chỉ có email).
drop function list_org_members(uuid);
create function list_org_members(p_org uuid) returns table (
  user_id uuid, email text, roles member_role[], status member_status, is_self boolean,
  is_staff boolean, phone text, full_name text, must_change_password boolean, work_mode text, leads_teams text[], description text, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select m.user_id, u.email::text, m.roles, m.status, m.user_id = auth.uid(),
           sa.user_id is not null, sa.phone, sa.full_name, coalesce(sa.must_change_password, false), wp.work_mode,
           (select array_agg(t.name order by t.name)
              from worker_teams t join worker_profiles lw on lw.id = t.leader_worker_id
             where lw.user_id = m.user_id and t.organization_id = p_org and t.is_active),
           m.description,
           (select up.display_name from user_profiles up where up.user_id = m.user_id)
      from organization_memberships m
      join auth.users u on u.id = m.user_id
      left join staff_accounts sa on sa.user_id = m.user_id
      left join worker_profiles wp on wp.user_id = m.user_id and wp.organization_id = p_org
     where m.organization_id = p_org and m.status in ('active', 'suspended')
     order by ('owner' = any (m.roles)) desc, coalesce(sa.full_name, u.email);
end $$;
revoke execute on function list_org_members(uuid) from public, anon;
grant execute on function list_org_members(uuid) to authenticated, service_role;
