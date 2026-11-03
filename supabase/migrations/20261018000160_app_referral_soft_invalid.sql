-- D131 (sửa): mã giới thiệu SAI không còn chặn đăng ký. Tài khoản/cơ sở vẫn được tạo, mã sai bị bỏ qua và app báo cho người dùng biết.
-- Giao diện kiểm tra mã bằng referral_code_valid() để báo "mã không chính xác" sau khi tạo xong.

create function referral_code_valid(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from referral_partners where code = upper(trim(coalesce(p_code, ''))) and active);
$$;
revoke execute on function referral_code_valid(text) from public, anon;
grant execute on function referral_code_valid(text) to authenticated, service_role;

create or replace function create_organization(p_type org_type, p_name text, p_ref text default null) returns uuid
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
  if referral_code_valid(p_ref) then perform referral_attach(new_id, p_ref); end if;   -- mã sai: bỏ qua
  return new_id;
end $$;

create or replace function owner_signup_finalize(p_user uuid, p_phone text, p_auth_email text, p_name text, p_org_name text, p_type org_type, p_ip_hash text, p_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  insert into owner_signups (user_id, phone, auth_email, full_name, org_name, org_type, ip_hash, ref_code)
    values (p_user, p_phone, p_auth_email, trim(p_name), trim(p_org_name), p_type, p_ip_hash,
            case when referral_code_valid(p_ref) then upper(trim(p_ref)) end) returning id into sid;   -- mã sai: không lưu
  return sid;
end $$;
