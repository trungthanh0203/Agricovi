-- Tài khoản nhân viên do chủ cơ sở tạo, đăng nhập bằng SỐ ĐIỆN THOẠI (quyết định D10, docs/DECISIONS.md).
-- Cách làm: số điện thoại được ghép thành một email ẩn <sdt>@sdt.<tên miền cấu hình> để dùng Supabase Auth bình thường.
-- Mật khẩu tạm do HỆ THỐNG sinh ngẫu nhiên, hiện cho chủ một lần. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu;
-- cho tới lúc đó MỌI quyền truy cập dữ liệu đều bị chặn ở CSDL (không chỉ ở giao diện).

insert into platform_settings (key, value, description) values
  ('login_email_domain', '"agricovi.com"'::jsonb,
   'Tên miền ghép email ẩn cho tài khoản nhân viên (email = <sdt>@sdt.<tên miền>). Đổi khi có tên miền thật; tài khoản cũ giữ email đã lưu. '
   || 'YÊU CẦU: tên miền này phải do bạn kiểm soát và tên miền phụ sdt.* KHÔNG có hộp thư nhận, nếu không thư đặt lại mật khẩu có thể rơi vào tay người khác.'),
  ('staff_temp_password_days', '7'::jsonb, 'Số ngày mật khẩu tạm của nhân viên còn hiệu lực để đổi lần đầu')
on conflict (key) do nothing;

-- Chuẩn hóa số điện thoại di động Việt Nam về dạng 0xxxxxxxxx (10 số). Trả về null nếu không hợp lệ.
create or replace function normalize_vn_phone(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9+]', '', 'g');
  if d like '+84%' then d := '0' || substr(d, 4);
  elsif d like '84%' and length(d) = 11 then d := '0' || substr(d, 3);
  end if;
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if d ~ '^0[35789][0-9]{8}$' then return d; end if;
  return null;
end $$;

-- Gán kiểu phân hệ cho từng người lao động (D10). [GIẢ ĐỊNH] 4 kiểu khởi đầu, mở rộng bằng migration.
alter table worker_profiles
  add column work_mode text check (work_mode in ('self_hourly', 'leader_hourly', 'leader_output', 'mixed'));

create table staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  phone text not null unique,
  auth_email text not null unique,
  full_name text not null,
  must_change_password boolean not null default true,
  temp_password_expires_at timestamptz,
  temp_password_hash text,             -- băm mật khẩu tạm, để chứng minh mật khẩu đã THẬT SỰ được đổi
  password_changed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table staff_accounts enable row level security;

-- Tài khoản nhân viên bị khóa dữ liệu cho tới khi đổi mật khẩu tạm (ép ở mọi hàm kiểm quyền)
create or replace function account_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_accounts s where s.user_id = auth.uid() and s.must_change_password);
$$;

create or replace function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not account_blocked() and exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid() and status = 'active');
$$;

create or replace function has_org_role(org uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not account_blocked() and exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid() and status = 'active'
      and role = any (roles));
$$;

create or replace function is_worker_self(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not account_blocked()
     and exists (select 1 from worker_profiles where id = w and user_id = auth.uid() and status = 'active');
$$;

create or replace function is_team_leader_of(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not account_blocked() and exists (
    select 1
    from worker_team_memberships m
    join worker_teams t on t.id = m.team_id and t.is_active
    join worker_profiles lead on lead.id = t.leader_worker_id and lead.user_id = auth.uid() and lead.status = 'active'
    where m.worker_id = w
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date));
$$;

-- Chủ cơ sở và quản lý xem được danh sách tài khoản nhân viên của cơ sở
create policy staff_read on staff_accounts for select to authenticated
  using (has_org_role(organization_id, array['owner', 'manager']::member_role[]));

-- Tài khoản nhân viên không tự tạo cơ sở
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
  if exists (select 1 from organization_memberships
              where user_id = auth.uid() and role = 'owner' and status = 'active') then
    raise exception 'ORG_LIMIT: Tài khoản này đã có cơ sở. Hộ chỉ có một cơ sở; HTX thêm hộ thành viên trong mục Hộ thành viên.';
  end if;
  insert into organizations (type, name, created_by) values (p_type, trim(p_name), auth.uid())
    returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Đăng nhập: số điện thoại -> email ẩn (gọi được khi chưa đăng nhập)
-- ---------------------------------------------------------------------------
create or replace function login_email_for_phone(p_phone text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text := normalize_vn_phone(p_phone); e text; dom text;
begin
  if n is null then return null; end if;
  select auth_email into e from staff_accounts where phone = n;
  if e is not null then return e; end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  return n || '@sdt.' || coalesce(dom, 'agricovi.com');
end $$;

-- ---------------------------------------------------------------------------
-- Các hàm dành riêng cho Edge Function (service_role). Không cấp cho người dùng.
-- ---------------------------------------------------------------------------
create or replace function staff_precheck(p_actor uuid, p_org uuid, p_phone text, p_role member_role)
returns table (phone text, auth_email text)
language plpgsql security definer set search_path = public as $$
declare n text := normalize_vn_phone(p_phone); org_t org_type; dom text;
begin
  if not exists (select 1 from organization_memberships
                  where organization_id = p_org and user_id = p_actor and role = 'owner' and status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạo tài khoản nhân viên';
  end if;
  if n is null then raise exception 'INVALID_PHONE: Số điện thoại chưa đúng (cần số di động 10 chữ số, ví dụ 0912345678)'; end if;
  if p_role = 'owner' then raise exception 'INVALID_ROLE: Không thể tạo chủ cơ sở'; end if;
  select type into org_t from organizations where id = p_org;
  if p_role = 'cooperative_manager' and org_t <> 'cooperative' then
    raise exception 'INVALID_ROLE: Vai trò Quản lý HTX chỉ dùng cho HTX';
  end if;
  if exists (select 1 from staff_accounts s where s.phone = n) then
    raise exception 'PHONE_IN_USE: Số điện thoại này đã có tài khoản nhân viên. Mỗi số chỉ dùng cho một tài khoản.';
  end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  return query select n, n || '@sdt.' || coalesce(dom, 'agricovi.com');
end $$;

create or replace function staff_finalize(
  p_actor uuid, p_org uuid, p_user uuid, p_phone text, p_email text, p_name text,
  p_role member_role, p_work_mode text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare days integer; expires timestamptz; h text;
begin
  if not exists (select 1 from organization_memberships
                  where organization_id = p_org and user_id = p_actor and role = 'owner' and status = 'active') then
    raise exception 'FORBIDDEN';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên nhân viên'; end if;
  select coalesce((value #>> '{}')::int, 7) into days from platform_settings where key = 'staff_temp_password_days';
  expires := now() + make_interval(days => coalesce(days, 7));
  select encrypted_password into h from auth.users where id = p_user;

  insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name, temp_password_expires_at, temp_password_hash, created_by)
    values (p_user, p_org, p_phone, p_email, trim(p_name), expires, h, p_actor);
  insert into organization_memberships (organization_id, user_id, role, status) values (p_org, p_user, p_role, 'active');
  insert into worker_profiles (organization_id, user_id, full_name, phone, work_mode)
    values (p_org, p_user, trim(p_name), p_phone, p_work_mode);
  return expires;
end $$;

create or replace function staff_reset(p_actor uuid, p_org uuid, p_user uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare days integer; expires timestamptz; h text;
begin
  if not exists (select 1 from organization_memberships
                  where organization_id = p_org and user_id = p_actor and role = 'owner' and status = 'active') then
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
-- Dành cho chính nhân viên (đã đăng nhập, kể cả khi đang bị khóa dữ liệu)
-- ---------------------------------------------------------------------------
create or replace function my_staff_status() returns table (
  is_staff boolean, must_change boolean, expired boolean, org_name text, full_name text)
language sql stable security definer set search_path = public as $$
  select true, s.must_change_password,
         s.must_change_password and coalesce(s.temp_password_expires_at < now(), false),
         o.name, s.full_name
    from staff_accounts s join organizations o on o.id = s.organization_id
   where s.user_id = auth.uid()
  union all
  select false, false, false, null, null
   where not exists (select 1 from staff_accounts where user_id = auth.uid());
$$;

-- Gọi SAU khi đã đổi mật khẩu bằng Auth. Chỉ mở khóa khi mật khẩu trong Auth thật sự khác mật khẩu tạm.
create or replace function staff_password_changed() returns void
language plpgsql security definer set search_path = public as $$
declare s staff_accounts; cur text;
begin
  select * into s from staff_accounts where user_id = auth.uid() for update;
  if s.user_id is null then return; end if;
  if not s.must_change_password then return; end if;
  if s.temp_password_expires_at < now() then
    raise exception 'TEMP_EXPIRED: Mật khẩu tạm đã hết hạn. Hãy nhờ chủ cơ sở đặt lại mật khẩu cho bạn.';
  end if;
  select encrypted_password into cur from auth.users where id = auth.uid();
  if cur is not distinct from s.temp_password_hash then
    raise exception 'NOT_CHANGED: Bạn chưa đổi mật khẩu. Hãy đặt mật khẩu mới khác mật khẩu tạm.';
  end if;
  update staff_accounts set must_change_password = false, password_changed_at = now() where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Danh sách thành viên: bổ sung số điện thoại và trạng thái tài khoản nhân viên
-- ---------------------------------------------------------------------------
drop function list_org_members(uuid);
create function list_org_members(p_org uuid) returns table (
  user_id uuid, email text, role member_role, status member_status, is_self boolean,
  is_staff boolean, phone text, full_name text, must_change_password boolean, work_mode text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.status, m.user_id = auth.uid(),
           sa.user_id is not null, sa.phone, sa.full_name, coalesce(sa.must_change_password, false), wp.work_mode
      from organization_memberships m
      join auth.users u on u.id = m.user_id
      left join staff_accounts sa on sa.user_id = m.user_id
      left join worker_profiles wp on wp.user_id = m.user_id and wp.organization_id = p_org
     where m.organization_id = p_org and m.status = 'active'
     order by (m.role = 'owner') desc, coalesce(sa.full_name, u.email);
end $$;

-- Quyền thực thi
revoke execute on function normalize_vn_phone(text), account_blocked(), login_email_for_phone(text),
  staff_precheck(uuid,uuid,text,member_role), staff_finalize(uuid,uuid,uuid,text,text,text,member_role,text),
  staff_reset(uuid,uuid,uuid), my_staff_status(), staff_password_changed(), list_org_members(uuid)
  from public, anon;
grant execute on function normalize_vn_phone(text), account_blocked(), my_staff_status(), staff_password_changed(),
  list_org_members(uuid) to authenticated, service_role;
-- Chỉ Edge Function (service_role) gọi được ba hàm tạo/đặt lại tài khoản
grant execute on function staff_precheck(uuid,uuid,text,member_role),
  staff_finalize(uuid,uuid,uuid,text,text,text,member_role,text), staff_reset(uuid,uuid,uuid) to service_role;
revoke execute on function staff_precheck(uuid,uuid,text,member_role),
  staff_finalize(uuid,uuid,uuid,text,text,text,member_role,text), staff_reset(uuid,uuid,uuid) from authenticated;
-- Màn đăng nhập (chưa có phiên) cần đổi số điện thoại thành email ẩn
grant execute on function login_email_for_phone(text) to anon, authenticated, service_role;
