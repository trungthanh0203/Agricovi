-- Phòng/Tổ dạng danh sách: thêm MÔ TẢ và TRANG TRẠI của tổ; sửa tổ một lần; xóa tổ (ẩn, không mất lịch sử).
-- Nhân sự: thêm MÔ TẢ cho từng người (chủ ghi), trả về trong list_org_members.

alter table worker_teams add column description text check (description is null or length(description) <= 500);
alter table worker_teams add column area_id uuid references production_areas(id) on delete set null;

-- Tổ mới có mô tả + trang trại (đổi chữ ký nên bỏ hàm cũ)
drop function create_team(uuid, text, uuid);
create function create_team(p_org uuid, p_name text, p_leader uuid default null, p_description text default null, p_area uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 1 then raise exception 'INVALID_NAME: Hãy nhập tên tổ'; end if;
  if p_area is not null and not exists (select 1 from production_areas a where a.id = p_area and a.organization_id = p_org) then
    raise exception 'INVALID_AREA: Trang trại không thuộc cơ sở này.';
  end if;
  insert into worker_teams (organization_id, name, leader_worker_id, description, area_id)
    values (p_org, trim(p_name), p_leader, nullif(trim(coalesce(p_description, '')), ''), p_area)
    returning id into new_id;
  return new_id;
end $$;

-- Sửa tổ một lần (tên, tổ trưởng, mô tả, trang trại). Tổ trưởng mới tự thành thành viên của tổ.
create function update_team(p_team uuid, p_name text, p_leader uuid, p_description text, p_area uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare o uuid;
begin
  if p_name is null or length(trim(p_name)) < 1 then raise exception 'INVALID_NAME: Hãy nhập tên tổ'; end if;
  select organization_id into o from worker_teams where id = p_team and is_active;
  if o is null then raise exception 'FORBIDDEN: Không tìm thấy tổ hoặc bạn không có quyền sửa.'; end if;
  if p_area is not null and not exists (select 1 from production_areas a where a.id = p_area and a.organization_id = o) then
    raise exception 'INVALID_AREA: Trang trại không thuộc cơ sở này.';
  end if;
  update worker_teams
     set name = trim(p_name), leader_worker_id = p_leader,
         description = nullif(trim(coalesce(p_description, '')), ''), area_id = p_area
   where id = p_team;
  if p_leader is not null and not exists (
       select 1 from worker_team_memberships where team_id = p_team and worker_id = p_leader and valid_to is null) then
    perform assign_worker_to_team(p_leader, p_team);
  end if;
end $$;

-- Xóa tổ = ẩn tổ và kết thúc tư cách thành viên (lịch sử chấm công giữ nguyên)
create function archive_team(p_team uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update worker_teams set is_active = false where id = p_team and is_active;
  if not found then raise exception 'FORBIDDEN: Không tìm thấy tổ hoặc bạn không có quyền xóa.'; end if;
  update worker_team_memberships set valid_to = current_date where team_id = p_team and valid_to is null;
end $$;

revoke execute on function create_team(uuid, text, uuid, text, uuid), update_team(uuid, text, uuid, text, uuid), archive_team(uuid) from public, anon;
grant execute on function create_team(uuid, text, uuid, text, uuid), update_team(uuid, text, uuid, text, uuid), archive_team(uuid) to authenticated, service_role;

-- Nhân sự: mô tả
alter table organization_memberships add column description text check (description is null or length(description) <= 500);

create function set_member_description(p_org uuid, p_user uuid, p_description text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được ghi mô tả nhân sự.';
  end if;
  update organization_memberships set description = nullif(trim(coalesce(p_description, '')), '')
   where organization_id = p_org and user_id = p_user and status in ('active', 'suspended');
  if not found then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
end $$;
revoke execute on function set_member_description(uuid, uuid, text) from public, anon;
grant execute on function set_member_description(uuid, uuid, text) to authenticated, service_role;

drop function list_org_members(uuid);
create function list_org_members(p_org uuid) returns table (
  user_id uuid, email text, roles member_role[], status member_status, is_self boolean,
  is_staff boolean, phone text, full_name text, must_change_password boolean, work_mode text, leads_teams text[], description text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select m.user_id, u.email::text, m.roles, m.status, m.user_id = auth.uid(),
           sa.user_id is not null, sa.phone, sa.full_name, coalesce(sa.must_change_password, false), wp.work_mode,
           (select array_agg(t.name order by t.name)
              from worker_teams t join worker_profiles lw on lw.id = t.leader_worker_id
             where lw.user_id = m.user_id and t.organization_id = p_org and t.is_active),
           m.description
      from organization_memberships m
      join auth.users u on u.id = m.user_id
      left join staff_accounts sa on sa.user_id = m.user_id
      left join worker_profiles wp on wp.user_id = m.user_id and wp.organization_id = p_org
     where m.organization_id = p_org and m.status in ('active', 'suspended')
     order by ('owner' = any (m.roles)) desc, coalesce(sa.full_name, u.email);
end $$;
revoke execute on function list_org_members(uuid) from public, anon;
grant execute on function list_org_members(uuid) to authenticated, service_role;
