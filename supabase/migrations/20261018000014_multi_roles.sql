-- Một người có thể mang NHIỀU vai trò trong cùng một cơ sở (nhân viên kiêm Kho & chi phí, tổ trưởng kiêm Quản lý HTX...).
-- Chủ cơ sở ('owner') bao gồm mọi vai trò khác ("chủ kiêm quản lý"): mọi kiểm tra quyền đều chấp nhận chủ.
-- "Tổ trưởng" KHÔNG phải vai trò cấp cơ sở mà là chỉ định theo tổ (worker_teams.leader_worker_id), xem migration 0015.
-- Quyết định: docs/DECISIONS.md D16.

-- ---------------------------------------------------------------------------
-- 1. Cột roles (mảng) thay cho role đơn
-- ---------------------------------------------------------------------------
alter table organization_memberships add column roles member_role[];
update organization_memberships set roles = array[role];
alter table organization_memberships alter column roles set not null;
alter table organization_memberships add constraint memb_roles_nonempty check (cardinality(roles) >= 1);
-- chủ cơ sở đứng một mình: quyền của chủ đã bao gồm mọi vai trò
alter table organization_memberships add constraint memb_owner_alone
  check (not ('owner' = any (roles)) or roles = array['owner']::member_role[]);

alter table organization_invitations add column roles member_role[];
update organization_invitations set roles = array[role];
alter table organization_invitations alter column roles set not null;
alter table organization_invitations add constraint orginv_roles_valid
  check (cardinality(roles) >= 1 and not ('owner' = any (roles)));

-- ---------------------------------------------------------------------------
-- 2. Kiểm tra quyền: thành viên có BẤT KỲ vai trò nào trong danh sách, hoặc là chủ
--    (dùng $2 vì tên tham số "roles" trùng tên cột)
-- ---------------------------------------------------------------------------
create or replace function has_org_role(org uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not account_blocked() and exists (
    select 1 from organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
      and (m.roles && $2 or 'owner' = any (m.roles)));
$$;

-- Làm sạch danh sách vai trò: không rỗng, không có 'owner', vai trò HTX chỉ cho HTX, bỏ trùng, thứ tự theo khai báo của kiểu
create or replace function clean_roles(p_org uuid, p_roles member_role[]) returns member_role[]
language plpgsql stable set search_path = public as $$
declare cleaned member_role[]; org_t org_type;
begin
  select array(select distinct r from unnest(coalesce(p_roles, '{}')) r order by r) into cleaned;
  if cardinality(cleaned) = 0 then raise exception 'INVALID_ROLE: Hãy chọn ít nhất một vai trò'; end if;
  if 'owner' = any (cleaned) then raise exception 'INVALID_ROLE: Không thể gán vai trò chủ cơ sở'; end if;
  select type into org_t from organizations where id = p_org;
  if 'cooperative_manager' = any (cleaned) and org_t <> 'cooperative' then
    raise exception 'INVALID_ROLE: Vai trò Quản lý HTX chỉ dùng cho HTX';
  end if;
  return cleaned;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Viết lại các hàm dùng role đơn
-- ---------------------------------------------------------------------------
create or replace function add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into organization_memberships (organization_id, user_id, roles, status)
    values (new.id, new.created_by, array['owner']::member_role[], 'active')
    on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function create_organization(p_type org_type, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if exists (select 1 from staff_accounts where user_id = auth.uid()) then
    raise exception 'STAFF_ACCOUNT: Tài khoản nhân viên do chủ cơ sở tạo, không tự tạo cơ sở được.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'INVALID_NAME: Tên cơ sở cần ít nhất 2 ký tự';
  end if;
  if exists (select 1 from organization_memberships m
              where m.user_id = auth.uid() and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'ORG_LIMIT: Tài khoản này đã có cơ sở. Hộ chỉ có một cơ sở; HTX thêm hộ thành viên trong mục Hộ thành viên.';
  end if;
  insert into organizations (type, name, created_by) values (p_type, trim(p_name), auth.uid())
    returning id into new_id;
  return new_id;
end $$;

drop function invite_member(uuid, text, member_role);
create function invite_member(p_org uuid, p_email text, p_roles member_role[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); new_id uuid; cleaned member_role[];
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if e is null or position('@' in e) < 2 then raise exception 'INVALID_EMAIL: Email chưa đúng định dạng'; end if;
  cleaned := clean_roles(p_org, p_roles);
  if exists (select 1 from organization_memberships m join auth.users u on u.id = m.user_id
              where m.organization_id = p_org and m.status = 'active' and lower(u.email) = e) then
    raise exception 'ALREADY_MEMBER: Người này đã là thành viên';
  end if;
  insert into organization_invitations (organization_id, email, roles) values (p_org, e, cleaned)
    returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'ALREADY_INVITED: Email này đã có lời mời đang chờ';
end $$;

drop function my_invitations();
create function my_invitations() returns table (
  id uuid, organization_id uuid, org_name text, org_type org_type, roles member_role[], invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.organization_id, o.name, o.type, i.roles, i.created_at
    from organization_invitations i join organizations o on o.id = i.organization_id
   where i.status = 'pending' and i.email = current_email()
   order by i.created_at;
$$;

create or replace function accept_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv organization_invitations;
begin
  select * into inv from organization_invitations where id = p_id for update;
  if inv.id is null or inv.status <> 'pending' or inv.email is distinct from current_email() then
    raise exception 'FORBIDDEN: Lời mời không còn hiệu lực hoặc không dành cho bạn';
  end if;
  insert into organization_memberships (organization_id, user_id, roles, status)
    values (inv.organization_id, auth.uid(), inv.roles, 'active')
  on conflict (organization_id, user_id) do update set
    roles = case
      when organization_memberships.status = 'revoked' then excluded.roles           -- quay lại sau khi bị gỡ: chỉ vai trò mới
      when 'owner' = any (organization_memberships.roles) then organization_memberships.roles
      else array(select distinct r from unnest(organization_memberships.roles || excluded.roles) r order by r)
    end,
    status = 'active';
  update organization_invitations set status = 'accepted', decided_at = now() where id = p_id;
  return inv.organization_id;
end $$;

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
     where m.organization_id = p_org and m.status = 'active'
     order by ('owner' = any (m.roles)) desc, coalesce(sa.full_name, u.email);
end $$;

drop function set_member_role(uuid, uuid, member_role);
create function set_member_roles(p_org uuid, p_user uuid, p_roles member_role[]) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role[]; cleaned member_role[];
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  select m.roles into cur from organization_memberships m where m.organization_id = p_org and m.user_id = p_user and m.status = 'active';
  if cur is null then raise exception 'NOT_FOUND'; end if;
  if 'owner' = any (cur) then raise exception 'INVALID_ROLE: Không đổi vai trò của chủ cơ sở'; end if;
  cleaned := clean_roles(p_org, p_roles);
  update organization_memberships set roles = cleaned where organization_id = p_org and user_id = p_user;
end $$;

create or replace function remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role[];
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  select m.roles into cur from organization_memberships m where m.organization_id = p_org and m.user_id = p_user and m.status = 'active';
  if cur is null then raise exception 'NOT_FOUND'; end if;
  if 'owner' = any (cur) then raise exception 'INVALID_ROLE: Không gỡ chủ cơ sở'; end if;
  -- thu hồi quyền truy cập mới; lịch sử thao tác đã thực hiện vẫn giữ (v1.1 mục 4.1)
  update organization_memberships set status = 'revoked' where organization_id = p_org and user_id = p_user;
end $$;

-- Tài khoản nhân viên: nhận nhiều vai trò và (tùy chọn) tổ lao động ngay khi tạo
drop function staff_precheck(uuid, uuid, text, member_role);
create function staff_precheck(p_actor uuid, p_org uuid, p_phone text, p_roles member_role[])
returns table (phone text, auth_email text, granted_roles member_role[])
language plpgsql security definer set search_path = public as $$
declare n text := normalize_vn_phone(p_phone); dom text;
begin
  if not exists (select 1 from organization_memberships m
                  where m.organization_id = p_org and m.user_id = p_actor and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạo tài khoản nhân viên';
  end if;
  if n is null then raise exception 'INVALID_PHONE: Số điện thoại chưa đúng (cần số di động 10 chữ số, ví dụ 0912345678)'; end if;
  if exists (select 1 from staff_accounts s where s.phone = n) then
    raise exception 'PHONE_IN_USE: Số điện thoại này đã có tài khoản nhân viên. Mỗi số chỉ dùng cho một tài khoản.';
  end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  return query select n, n || '@sdt.' || coalesce(dom, 'agricovi.com'), clean_roles(p_org, p_roles);
end $$;

drop function staff_finalize(uuid, uuid, uuid, text, text, text, member_role, text);
create function staff_finalize(
  p_actor uuid, p_org uuid, p_user uuid, p_phone text, p_email text, p_name text,
  p_roles member_role[], p_work_mode text, p_team uuid default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare days integer; expires timestamptz; h text; cleaned member_role[]; wid uuid;
begin
  if not exists (select 1 from organization_memberships m
                  where m.organization_id = p_org and m.user_id = p_actor and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên nhân viên'; end if;
  cleaned := clean_roles(p_org, p_roles);
  -- Kiểu phân hệ do tổ trưởng chấm/ghi: bắt buộc thuộc một tổ CÓ tổ trưởng (quyết định D17)
  if p_work_mode like 'leader\_%' and p_team is null then
    raise exception 'TEAM_REQUIRED: Kiểu phân hệ do tổ trưởng chấm công/ghi sản lượng cần chọn một tổ có tổ trưởng.';
  end if;
  if p_team is not null and not exists (
       select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org and t.is_active and t.leader_worker_id is not null) then
    raise exception 'TEAM_REQUIRED: Tổ được chọn không tồn tại hoặc chưa có tổ trưởng.';
  end if;

  select coalesce((value #>> '{}')::int, 7) into days from platform_settings where key = 'staff_temp_password_days';
  expires := now() + make_interval(days => coalesce(days, 7));
  select encrypted_password into h from auth.users where id = p_user;

  insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name, temp_password_expires_at, temp_password_hash, created_by)
    values (p_user, p_org, p_phone, p_email, trim(p_name), expires, h, p_actor);
  insert into organization_memberships (organization_id, user_id, roles, status) values (p_org, p_user, cleaned, 'active');
  insert into worker_profiles (organization_id, user_id, full_name, phone, work_mode)
    values (p_org, p_user, trim(p_name), p_phone, p_work_mode) returning id into wid;
  if p_team is not null then
    insert into worker_team_memberships (team_id, worker_id) values (p_team, wid);
  end if;
  return expires;
end $$;

create or replace function staff_reset(p_actor uuid, p_org uuid, p_user uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare days integer; expires timestamptz; h text;
begin
  if not exists (select 1 from organization_memberships m
                  where m.organization_id = p_org and m.user_id = p_actor and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from staff_accounts where user_id = p_user and organization_id = p_org) then
    raise exception 'NOT_FOUND: Không phải tài khoản nhân viên của cơ sở này';
  end if;
  select coalesce((value #>> '{}')::int, 7) into days from platform_settings where key = 'staff_temp_password_days';
  expires := now() + make_interval(days => coalesce(days, 7));
  select encrypted_password into h from auth.users where id = p_user;
  update staff_accounts
     set must_change_password = true, temp_password_expires_at = expires, temp_password_hash = h
   where user_id = p_user;
  return expires;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Bỏ cột role đơn
-- ---------------------------------------------------------------------------
alter table organization_memberships drop column role;
alter table organization_invitations drop column role;

-- ---------------------------------------------------------------------------
-- 5. Quyền thực thi cho các hàm mới
-- ---------------------------------------------------------------------------
revoke execute on function clean_roles(uuid, member_role[]), invite_member(uuid, text, member_role[]), my_invitations(),
  list_org_members(uuid), set_member_roles(uuid, uuid, member_role[]),
  staff_precheck(uuid, uuid, text, member_role[]), staff_finalize(uuid, uuid, uuid, text, text, text, member_role[], text, uuid)
  from public, anon;
grant execute on function clean_roles(uuid, member_role[]), invite_member(uuid, text, member_role[]), my_invitations(),
  list_org_members(uuid), set_member_roles(uuid, uuid, member_role[]) to authenticated, service_role;
-- chỉ Edge Function (service_role) gọi hàm tạo tài khoản nhân viên
grant execute on function staff_precheck(uuid, uuid, text, member_role[]),
  staff_finalize(uuid, uuid, uuid, text, text, text, member_role[], text, uuid) to service_role;
revoke execute on function staff_precheck(uuid, uuid, text, member_role[]),
  staff_finalize(uuid, uuid, uuid, text, text, text, member_role[], text, uuid) from authenticated;
