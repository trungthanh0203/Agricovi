-- D45: chủ cơ sở đổi được họ tên và số điện thoại của nhân viên (số điện thoại là tên đăng nhập nên đổi cả email ẩn).
-- Hàm chỉ cho Edge Function (service_role) gọi; Edge Function đổi email đăng nhập ở Auth, lỗi thì gọi lại hàm này để hoàn tác.
create or replace function staff_update_profile(p_actor uuid, p_org uuid, p_user uuid, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staff_accounts; n text := normalize_vn_phone(p_phone); dom text; new_email text;
begin
  if not exists (select 1 from organization_memberships m
                  where m.organization_id = p_org and m.user_id = p_actor and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được sửa thông tin nhân viên.';
  end if;
  select * into s from staff_accounts where user_id = p_user and organization_id = p_org;
  if s.user_id is null then raise exception 'NOT_FOUND: Không phải tài khoản nhân viên của cơ sở này.'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên nhân viên (ít nhất 2 ký tự).'; end if;
  if n is null then raise exception 'INVALID_PHONE: Số điện thoại chưa đúng (cần số di động 10 chữ số, ví dụ 0912345678).'; end if;
  if n <> s.phone and exists (select 1 from staff_accounts x where x.phone = n) then
    raise exception 'PHONE_IN_USE: Số điện thoại này đã có tài khoản nhân viên. Mỗi số chỉ dùng cho một tài khoản.';
  end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  new_email := case when n = s.phone then s.auth_email else n || '@sdt.' || coalesce(dom, 'agricovi.com') end;
  update staff_accounts set full_name = trim(p_name), phone = n, auth_email = new_email where user_id = p_user;
  update worker_profiles set full_name = trim(p_name), phone = n where user_id = p_user and organization_id = p_org;
  return jsonb_build_object('phone', n, 'auth_email', new_email, 'old_phone', s.phone, 'old_email', s.auth_email, 'old_name', s.full_name);
end $$;
revoke execute on function staff_update_profile(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function staff_update_profile(uuid, uuid, uuid, text, text) to service_role;
