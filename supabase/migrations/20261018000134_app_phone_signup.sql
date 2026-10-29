-- Đăng ký chủ cơ sở bằng SỐ ĐIỆN THOẠI (D121): dành cho hộ không có email. Miễn phí, không gửi mã OTP:
-- hộ nhập số điện thoại (Zalo) + mật khẩu + tên cơ sở; tài khoản ở trạng thái CHỜ DUYỆT; quản trị nền tảng liên hệ qua Zalo xác nhận rồi bấm Duyệt
-- thì cơ sở mới được tạo. Chống đăng ký ồ ạt: Cloudflare Turnstile ở Edge Function + giới hạn số lần theo mạng (IP đã băm) ở đây.
-- Đăng nhập dùng lại cơ chế số điện thoại -> email ẩn của nhân viên (login_email_for_phone).

create table owner_signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  phone text not null unique,
  auth_email text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  org_name text not null check (length(trim(org_name)) between 2 and 80),
  org_type org_type not null default 'household',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,                                  -- lý do từ chối (hiện cho người đăng ký)
  ip_hash text,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);
create index on owner_signups (status, created_at);
create index on owner_signups (ip_hash, created_at);
alter table owner_signups enable row level security;
create policy owner_signups_own on owner_signups for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Hàm cho Edge Function owner-signup (khóa quản trị)
-- ---------------------------------------------------------------------------
create function owner_signup_precheck(p_phone text, p_ip_hash text) returns table (phone text, auth_email text)
language plpgsql security definer set search_path = public as $$
declare n text := normalize_vn_phone(p_phone); dom text; v_email text;
begin
  if n is null then raise exception 'INVALID_PHONE: Số điện thoại chưa đúng (cần số di động 10 chữ số, ví dụ 0912345678).'; end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  v_email := n || '@sdt.' || coalesce(dom, 'agricovi.com');
  if exists (select 1 from staff_accounts s where s.phone = n)
     or exists (select 1 from owner_signups o where o.phone = n)
     or exists (select 1 from auth.users u where lower(u.email) = lower(v_email)) then
    raise exception 'PHONE_IN_USE: Số điện thoại này đã có tài khoản. Hãy đăng nhập, hoặc liên hệ Agricovi qua Zalo nếu quên mật khẩu.';
  end if;
  if p_ip_hash is not null and (select count(*) from owner_signups o where o.ip_hash = p_ip_hash and o.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'RATE_LIMIT: Đăng ký quá nhiều lần từ cùng một mạng. Hãy thử lại sau 1 giờ, hoặc liên hệ Agricovi qua Zalo.';
  end if;
  if (select count(*) from owner_signups o where o.status = 'pending') >= 300 then
    raise exception 'BUSY: Đang có quá nhiều đăng ký chờ duyệt. Hãy liên hệ Agricovi qua Zalo.';
  end if;
  return query select n, v_email;
end $$;

create function owner_signup_finalize(p_user uuid, p_phone text, p_auth_email text, p_name text, p_org_name text, p_type org_type, p_ip_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  insert into owner_signups (user_id, phone, auth_email, full_name, org_name, org_type, ip_hash)
    values (p_user, p_phone, p_auth_email, trim(p_name), trim(p_org_name), p_type, p_ip_hash) returning id into sid;
  return sid;
end $$;

-- Edge Function kiểm tra người gọi có phải quản trị nền tảng không (để đặt lại mật khẩu cho chủ hộ đăng ký bằng điện thoại)
create function owner_signup_admin_check(p_actor uuid, p_signup uuid) returns table (user_id uuid, phone text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins a where a.user_id = p_actor) then
    raise exception 'FORBIDDEN: Chỉ quản trị viên nền tảng được thực hiện.';
  end if;
  return query select o.user_id, o.phone from owner_signups o where o.id = p_signup and o.status = 'approved';
end $$;

-- ---------------------------------------------------------------------------
-- Người đăng ký xem trạng thái của mình
-- ---------------------------------------------------------------------------
create function my_owner_signup() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', o.status, 'org_name', o.org_name, 'phone', o.phone, 'note', o.note, 'created_at', o.created_at)
    from owner_signups o where o.user_id = auth.uid();
$$;

-- Chưa được duyệt thì không tự tạo cơ sở được (không lách việc chờ duyệt)
create or replace function create_organization(p_type org_type, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if exists (select 1 from staff_accounts where user_id = auth.uid()) then
    raise exception 'STAFF_ACCOUNT: Tài khoản nhân viên do chủ cơ sở tạo, không tự tạo cơ sở được.';
  end if;
  if exists (select 1 from owner_signups where user_id = auth.uid() and status <> 'approved') then
    raise exception 'PENDING_APPROVAL: Đăng ký của bạn đang chờ Agricovi duyệt. Cơ sở sẽ được tạo ngay khi duyệt xong.';
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

-- ---------------------------------------------------------------------------
-- Quản trị nền tảng: danh sách và duyệt
-- ---------------------------------------------------------------------------
create function admin_list_signups(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'phone', o.phone, 'full_name', o.full_name, 'org_name', o.org_name, 'org_type', o.org_type,
                                                       'status', o.status, 'note', o.note, 'created_at', o.created_at, 'decided_at', o.decided_at,
                                                       'organization_id', o.organization_id) order by o.created_at desc)
                     from owner_signups o where p_status is null or o.status = p_status), '[]'::jsonb);
end $$;

create function admin_decide_signup(p_id uuid, p_approve boolean, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o owner_signups; new_org uuid;
begin
  perform admin_guard();
  select * into o from owner_signups where id = p_id for update;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đăng ký.'; end if;
  if o.status <> 'pending' then raise exception 'ALREADY_DECIDED: Đăng ký này đã được xử lý.'; end if;
  if p_approve then
    insert into organizations (type, name, created_by) values (o.org_type, o.org_name, o.user_id) returning id into new_org;  -- trigger tạo gói dùng thử và gán chủ
    update owner_signups set status = 'approved', organization_id = new_org, decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform admin_audit(new_org, 'approve_signup', 'owner_signups', p_id::text, null, jsonb_build_object('phone', o.phone, 'org', o.org_name), p_reason);
    return new_org;
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do từ chối (hiện cho người đăng ký).'; end if;
  update owner_signups set status = 'rejected', note = left(trim(p_reason), 300), decided_at = now(), decided_by = auth.uid() where id = p_id;
  perform admin_audit(null, 'reject_signup', 'owner_signups', p_id::text, null, jsonb_build_object('phone', o.phone, 'org', o.org_name), p_reason);
  return null;
end $$;

revoke execute on function owner_signup_precheck(text, text), owner_signup_finalize(uuid, text, text, text, text, org_type, text),
  owner_signup_admin_check(uuid, uuid) from public, anon, authenticated;
grant execute on function owner_signup_precheck(text, text), owner_signup_finalize(uuid, text, text, text, text, org_type, text),
  owner_signup_admin_check(uuid, uuid) to service_role;
revoke execute on function my_owner_signup(), admin_list_signups(text), admin_decide_signup(uuid, boolean, text) from public, anon;
grant execute on function my_owner_signup(), admin_list_signups(text), admin_decide_signup(uuid, boolean, text) to authenticated;
revoke execute on function create_organization(org_type, text) from public, anon;
grant execute on function create_organization(org_type, text) to authenticated;
