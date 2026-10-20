-- D38: khi tạo nhân viên/người lao động được chọn MỌI tổ đang có, kể cả tổ chưa có tổ trưởng (sửa D17).
-- Kiểu phân hệ "do tổ trưởng chấm" vẫn bắt buộc chọn một tổ; tổ chưa có tổ trưởng thì chủ chọn tổ trưởng sau
-- (view workers_without_leader vẫn báo những người này để chủ xử lý).

create or replace function staff_finalize(
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
  if p_work_mode like 'leader\_%' and p_team is null then
    raise exception 'TEAM_REQUIRED: Kiểu phân hệ do tổ trưởng chấm công/ghi sản lượng cần chọn một tổ.';
  end if;
  if p_team is not null and not exists (
       select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org and t.is_active) then
    raise exception 'TEAM_REQUIRED: Tổ được chọn không tồn tại hoặc đã ngừng.';
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

create or replace function create_worker_without_account(p_org uuid, p_name text, p_phone text, p_work_mode text, p_team uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare wid uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên'; end if;
  if p_work_mode is null or p_work_mode not like 'leader\_%' then
    raise exception 'INVALID_MODE: Người không có tài khoản chỉ dùng kiểu phân hệ do tổ trưởng chấm công hoặc ghi sản lượng.';
  end if;
  if p_team is null or not exists (select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org and t.is_active) then
    raise exception 'TEAM_REQUIRED: Cần chọn một tổ.';
  end if;
  insert into worker_profiles (organization_id, full_name, phone, work_mode)
    values (p_org, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_work_mode) returning id into wid;
  insert into worker_team_memberships (team_id, worker_id) values (p_team, wid);
  return wid;
end $$;
