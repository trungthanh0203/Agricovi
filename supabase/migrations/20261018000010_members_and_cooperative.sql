-- Quản lý người dùng: mời thành viên, mời hộ vào HTX, hộ do HTX quản lý, giới hạn 1 cơ sở cho tài khoản Hộ.
-- Quyết định của chủ sản phẩm (docs/DECISIONS.md): Hộ chỉ có 1 cơ sở; HTX thêm được nhiều cơ sở (hộ thành viên).
-- Lời mời theo EMAIL: không cần gửi thư; người được mời đăng ký/đăng nhập bằng đúng email đó rồi chấp nhận.

create type invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');

create or replace function current_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

-- Hộ do HTX tạo thay thành viên (HTX là chủ quản cho tới khi chuyển quyền - chưa làm ở MVP)
alter table organizations add column managed_by_org uuid references organizations(id);

-- ---------------------------------------------------------------------------
-- Bảng lời mời (ghi qua RPC; chỉ đọc có kiểm soát)
-- ---------------------------------------------------------------------------
create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role member_role not null check (role <> 'owner'),
  status invitation_status not null default 'pending',
  invited_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index one_pending_org_invite on organization_invitations (organization_id, email) where status = 'pending';
create index on organization_invitations (email) where status = 'pending';

create table cooperative_invitations (
  id uuid primary key default gen_random_uuid(),
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  status invitation_status not null default 'pending',
  invited_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index one_pending_coop_invite on cooperative_invitations (cooperative_org_id, email) where status = 'pending';
create index on cooperative_invitations (email) where status = 'pending';

alter table organization_invitations enable row level security;
alter table cooperative_invitations enable row level security;

create policy orginv_read on organization_invitations for select to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]));
create policy coopinv_read on cooperative_invitations for select to authenticated
  using (has_org_role(cooperative_org_id, array['owner','cooperative_manager']::member_role[]));

-- ---------------------------------------------------------------------------
-- Tạo cơ sở: tài khoản đã là CHỦ của một cơ sở thì không tự tạo thêm (chỉ tạo cơ sở đầu tiên)
-- ---------------------------------------------------------------------------
create or replace function create_organization(p_type org_type, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'INVALID_NAME: Tên cơ sở cần ít nhất 2 ký tự';
  end if;
  if exists (select 1 from organization_memberships
              where user_id = auth.uid() and role = 'owner' and status = 'active') then
    raise exception 'ORG_LIMIT: Tài khoản này đã có cơ sở. Hộ chỉ có một cơ sở; HTX thêm hộ thành viên trong mục Hộ thành viên.';
  end if;
  insert into organizations (type, name, created_by) values (p_type, trim(p_name), auth.uid())
    returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Thành viên của cơ sở
-- ---------------------------------------------------------------------------
create or replace function invite_member(p_org uuid, p_email text, p_role member_role) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); new_id uuid; org_t org_type;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if e is null or position('@' in e) < 2 then raise exception 'INVALID_EMAIL: Email chưa đúng định dạng'; end if;
  if p_role = 'owner' then raise exception 'INVALID_ROLE: Không thể mời làm chủ cơ sở'; end if;
  select type into org_t from organizations where id = p_org;
  if p_role = 'cooperative_manager' and org_t <> 'cooperative' then
    raise exception 'INVALID_ROLE: Vai trò Quản lý HTX chỉ dùng cho HTX';
  end if;
  if exists (select 1 from organization_memberships m join auth.users u on u.id = m.user_id
              where m.organization_id = p_org and m.status = 'active' and lower(u.email) = e) then
    raise exception 'ALREADY_MEMBER: Người này đã là thành viên';
  end if;
  insert into organization_invitations (organization_id, email, role) values (p_org, e, p_role)
    returning id into new_id;      -- lỗi unique nếu đã có lời mời đang chờ
  return new_id;
exception when unique_violation then
  raise exception 'ALREADY_INVITED: Email này đã có lời mời đang chờ';
end $$;

create or replace function revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv organization_invitations;
begin
  select * into inv from organization_invitations where id = p_id for update;
  if inv.id is null or not has_org_role(inv.organization_id, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  update organization_invitations set status = 'revoked', decided_at = now() where id = p_id and status = 'pending';
end $$;

create or replace function my_invitations() returns table (
  id uuid, organization_id uuid, org_name text, org_type org_type, role member_role, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.organization_id, o.name, o.type, i.role, i.created_at
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
  insert into organization_memberships (organization_id, user_id, role, status)
    values (inv.organization_id, auth.uid(), inv.role, 'active')
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';
  update organization_invitations set status = 'accepted', decided_at = now() where id = p_id;
  return inv.organization_id;
end $$;

create or replace function decline_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update organization_invitations set status = 'declined', decided_at = now()
   where id = p_id and status = 'pending' and email = current_email();
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;

create or replace function list_org_members(p_org uuid) returns table (
  user_id uuid, email text, role member_role, status member_status, is_self boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.status, m.user_id = auth.uid()
      from organization_memberships m join auth.users u on u.id = m.user_id
     where m.organization_id = p_org and m.status = 'active'
     order by (m.role = 'owner') desc, u.email;
end $$;

create or replace function set_member_role(p_org uuid, p_user uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role; org_t org_type;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_role = 'owner' then raise exception 'INVALID_ROLE: Không thể đặt thêm chủ cơ sở'; end if;
  select role into cur from organization_memberships where organization_id = p_org and user_id = p_user and status = 'active';
  if cur is null then raise exception 'NOT_FOUND'; end if;
  if cur = 'owner' then raise exception 'INVALID_ROLE: Không đổi vai trò của chủ cơ sở'; end if;
  select type into org_t from organizations where id = p_org;
  if p_role = 'cooperative_manager' and org_t <> 'cooperative' then raise exception 'INVALID_ROLE: Vai trò Quản lý HTX chỉ dùng cho HTX'; end if;
  update organization_memberships set role = p_role where organization_id = p_org and user_id = p_user;
end $$;

create or replace function remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur member_role;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  select role into cur from organization_memberships where organization_id = p_org and user_id = p_user and status = 'active';
  if cur is null then raise exception 'NOT_FOUND'; end if;
  if cur = 'owner' then raise exception 'INVALID_ROLE: Không gỡ chủ cơ sở'; end if;
  -- thu hồi quyền truy cập mới; lịch sử thao tác đã thực hiện vẫn giữ (v1.1 mục 4.1)
  update organization_memberships set status = 'revoked' where organization_id = p_org and user_id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- HTX và hộ thành viên
-- ---------------------------------------------------------------------------
create or replace function invite_household(p_coop uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); new_id uuid;
begin
  if not has_org_role(p_coop, array['owner','cooperative_manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if (select type from organizations where id = p_coop) <> 'cooperative' then raise exception 'FORBIDDEN: Chỉ HTX mới mời hộ'; end if;
  if e is null or position('@' in e) < 2 then raise exception 'INVALID_EMAIL: Email chưa đúng định dạng'; end if;
  insert into cooperative_invitations (cooperative_org_id, email) values (p_coop, e) returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'ALREADY_INVITED: Email này đã có lời mời đang chờ';
end $$;

create or replace function revoke_coop_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv cooperative_invitations;
begin
  select * into inv from cooperative_invitations where id = p_id for update;
  if inv.id is null or not has_org_role(inv.cooperative_org_id, array['owner','cooperative_manager']::member_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  update cooperative_invitations set status = 'revoked', decided_at = now() where id = p_id and status = 'pending';
end $$;

-- Lời mời HTX gửi tới email của chủ hộ (cùng tài khoản đang đăng nhập)
create or replace function my_coop_invitations() returns table (
  id uuid, cooperative_org_id uuid, coop_name text, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.cooperative_org_id, o.name, i.created_at
    from cooperative_invitations i join organizations o on o.id = i.cooperative_org_id
   where i.status = 'pending' and i.email = current_email()
   order by i.created_at;
$$;

create or replace function accept_coop_invitation(p_id uuid, p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv cooperative_invitations;
begin
  select * into inv from cooperative_invitations where id = p_id for update;
  if inv.id is null or inv.status <> 'pending' or inv.email is distinct from current_email() then
    raise exception 'FORBIDDEN: Lời mời không còn hiệu lực hoặc không dành cho bạn';
  end if;
  if not has_org_role(p_household, array['owner']::member_role[])
     or (select type from organizations where id = p_household) <> 'household' then
    raise exception 'FORBIDDEN: Chỉ chủ hộ mới chấp nhận lời mời của HTX';
  end if;
  if exists (select 1 from cooperative_memberships where household_org_id = p_household and status = 'active') then
    raise exception 'ALREADY_IN_COOPERATIVE: Hộ đang thuộc một HTX. Mỗi hộ chỉ thuộc một HTX.';
  end if;
  insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at)
    values (p_household, inv.cooperative_org_id, 'active', now());
  update cooperative_invitations set status = 'accepted', decided_at = now() where id = p_id;
end $$;

create or replace function decline_coop_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update cooperative_invitations set status = 'declined', decided_at = now()
   where id = p_id and status = 'pending' and email = current_email();
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;

-- Số vụ đang chạy ghi theo HTX trên khu trồng của hộ (chặn rời HTX khi còn vụ đang chạy)
create or replace function active_coop_cycles(p_coop uuid, p_household uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from production_cycles c join production_areas a on a.id = c.area_id
   where c.owner_org_id = p_coop and a.organization_id = p_household and c.status in ('active', 'paused');
$$;

create or replace function list_coop_households(p_coop uuid) returns table (
  household_org_id uuid, name text, joined_at timestamptz, managed boolean, active_coop_cycles integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_coop, array['owner','cooperative_manager','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select h.id, h.name, cm.joined_at, coalesce(h.managed_by_org = p_coop, false), active_coop_cycles(p_coop, h.id)
      from cooperative_memberships cm join organizations h on h.id = cm.household_org_id
     where cm.cooperative_org_id = p_coop and cm.status = 'active'
     order by h.name;
end $$;

-- HTX tạo hộ thành viên thay cho người chưa có tài khoản/smartphone. HTX là chủ quản (managed_by_org).
create or replace function create_member_household(p_coop uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not has_org_role(p_coop, array['owner','cooperative_manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if (select type from organizations where id = p_coop) <> 'cooperative' then raise exception 'FORBIDDEN: Chỉ HTX mới tạo hộ thành viên'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Tên hộ cần ít nhất 2 ký tự'; end if;
  insert into organizations (type, name, created_by, managed_by_org)
    values ('household', trim(p_name), auth.uid(), p_coop) returning id into new_id;
  insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at)
    values (new_id, p_coop, 'active', now());
  return new_id;
end $$;

create or replace function remove_household(p_coop uuid, p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not has_org_role(p_coop, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  if (select managed_by_org from organizations where id = p_household) = p_coop then
    raise exception 'MANAGED_HOUSEHOLD: Hộ do HTX tạo và quản lý nên chưa thể gỡ (cần chuyển quyền chủ hộ trước)';
  end if;
  n := active_coop_cycles(p_coop, p_household);
  if n > 0 then
    raise exception 'HAS_ACTIVE_COOP_CYCLES: Còn % vụ ghi theo HTX đang chạy. Hãy kết thúc các vụ đó trước.', n;
  end if;
  update cooperative_memberships set status = 'left', left_at = now()
   where household_org_id = p_household and cooperative_org_id = p_coop and status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function leave_cooperative(p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
declare coop uuid; n integer;
begin
  if not has_org_role(p_household, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  select cooperative_org_id into coop from cooperative_memberships where household_org_id = p_household and status = 'active';
  if coop is null then raise exception 'NOT_FOUND: Hộ không thuộc HTX nào'; end if;
  if (select managed_by_org from organizations where id = p_household) = coop then
    raise exception 'MANAGED_HOUSEHOLD: Hộ do HTX tạo và quản lý nên chưa thể rời (cần chuyển quyền chủ hộ trước)';
  end if;
  n := active_coop_cycles(coop, p_household);
  if n > 0 then
    raise exception 'HAS_ACTIVE_COOP_CYCLES: Còn % vụ ghi theo HTX đang chạy. Hãy kết thúc các vụ đó trước khi rời HTX.', n;
  end if;
  update cooperative_memberships set status = 'left', left_at = now()
   where household_org_id = p_household and status = 'active';
end $$;

-- Hộ xem HTX mình đang thuộc (hộ không đọc được bảng organizations của HTX)
create or replace function my_cooperative(p_household uuid) returns table (
  cooperative_org_id uuid, name text, joined_at timestamptz, managed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_member(p_household) then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, cm.joined_at, coalesce((select managed_by_org from organizations where id = p_household) = c.id, false)
      from cooperative_memberships cm join organizations c on c.id = cm.cooperative_org_id
     where cm.household_org_id = p_household and cm.status = 'active';
end $$;

-- Quyền thực thi: chỉ người đã đăng nhập (kiểm quyền chi tiết nằm trong từng hàm)
do $$
declare f text;
begin
  foreach f in array array[
    'current_email()', 'invite_member(uuid,text,member_role)', 'revoke_invitation(uuid)', 'my_invitations()',
    'accept_invitation(uuid)', 'decline_invitation(uuid)', 'list_org_members(uuid)', 'set_member_role(uuid,uuid,member_role)',
    'remove_member(uuid,uuid)', 'invite_household(uuid,text)', 'revoke_coop_invitation(uuid)', 'my_coop_invitations()',
    'accept_coop_invitation(uuid,uuid)', 'decline_coop_invitation(uuid)', 'active_coop_cycles(uuid,uuid)',
    'list_coop_households(uuid)', 'create_member_household(uuid,text)', 'remove_household(uuid,uuid)',
    'leave_cooperative(uuid)', 'my_cooperative(uuid)', 'create_organization(org_type,text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
