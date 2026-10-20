-- D44 (P3): CHỨC VỤ do chủ cơ sở định nghĩa + quyền mục "Khai báo" + hạn chế loại việc + quyền quản lý giai đoạn.
-- Quyền hiệu lực của một người ở một mục = lớn nhất của (mặc định theo vai trò, các chức vụ được gán); nếu chủ cấp riêng
-- cho người đó thì phần cấp riêng ĐÈ lên. Chủ luôn đủ quyền. Người chưa được gán chức vụ nào: hành vi như cũ.
-- Cũng thêm: chủ/quản lý có hồ sơ lao động để chấm công như nhân sự khác (ensure_my_worker).

-- ---------------------------------------------------------------------------
-- Bảng chức vụ
-- ---------------------------------------------------------------------------
-- Mục quyền hợp lệ thêm 'declare' (Khai báo)
create or replace function permissions_valid(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each_text(p) e
        where e.key not in ('inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare')
           or e.value not in ('none', 'view', 'edit')
           or (e.key = 'summary' and e.value = 'edit'));
$$;

create table org_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  description text check (description is null or length(description) <= 300),
  perms jsonb not null default '{}'::jsonb check (permissions_valid(perms)),
  work_type_ids uuid[],                         -- null = làm được mọi loại việc
  can_manage_stages boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
alter table org_positions enable row level security;
create policy org_positions_read on org_positions for select to authenticated using (is_org_member(organization_id));
-- ghi chỉ qua hàm của chủ

alter table organization_memberships add column position_ids uuid[] not null default '{}'::uuid[];

-- ---------------------------------------------------------------------------
-- Quyền hiệu lực có tính chức vụ
-- ---------------------------------------------------------------------------
create or replace function role_default_perm(p_roles member_role[], p_module text) returns integer
language sql immutable as $$
  select case p_module
    when 'inventory' then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when 'manager' = any (p_roles) then 1 else 0 end
    when 'expenses'  then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when p_roles && array['manager', 'cooperative_manager']::member_role[] then 1 else 0 end
    when 'sales'     then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when p_roles && array['manager', 'cooperative_manager']::member_role[] then 1 else 0 end
    when 'summary'   then case when p_roles && array['owner', 'manager', 'inventory_finance', 'cooperative_manager']::member_role[] then 1 else 0 end
    when 'harvest'   then case when p_roles && array['owner', 'manager', 'worker', 'inventory_finance', 'cooperative_manager']::member_role[] then 2 else 0 end
    when 'declare'   then case when p_roles && array['owner', 'manager', 'cooperative_manager']::member_role[] then 2 else 0 end
    else 0 end;
$$;

create or replace function perm_level(p_org uuid, p_module text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare m record; base integer; pos integer;
begin
  if account_blocked() then return 0; end if;
  select mm.roles, mm.permissions, mm.position_ids into m from organization_memberships mm
   where mm.organization_id = p_org and mm.user_id = auth.uid() and mm.status = 'active';
  if not found then return 0; end if;
  if 'owner' = any (m.roles) then return 2; end if;
  if m.permissions ? p_module then return perm_level_of(m.permissions ->> p_module); end if; -- chủ cấp riêng: đè lên
  base := role_default_perm(m.roles, p_module);
  select coalesce(max(perm_level_of(p.perms ->> p_module)), 0) into pos
    from org_positions p where p.id = any (m.position_ids) and p.organization_id = p_org and p.is_active;
  return greatest(base, pos);
end $$;

-- Khai báo (cây trồng, loại việc, quy trình mẫu...) theo quyền mục "declare"
create or replace function can_configure(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(org, 'declare', 'edit');
$$;

drop policy areas_write on production_areas;
create policy areas_write on production_areas for all to authenticated
  using (has_org_role(organization_id, array['owner', 'manager']::member_role[]) or has_perm(organization_id, 'declare', 'edit'))
  with check (has_org_role(organization_id, array['owner', 'manager']::member_role[]) or has_perm(organization_id, 'declare', 'edit'));

-- ---------------------------------------------------------------------------
-- Hạn chế loại việc theo chức vụ (ép khi ghi nhật ký) và quyền quản lý giai đoạn
-- ---------------------------------------------------------------------------
create or replace function work_type_allowed(p_org uuid, p_wt uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m record; n integer;
begin
  select roles, position_ids into m from organization_memberships
   where organization_id = p_org and user_id = auth.uid() and status = 'active';
  if not found then return false; end if;
  if m.roles && array['owner', 'manager']::member_role[] then return true; end if;
  select count(*) into n from org_positions p where p.id = any (m.position_ids) and p.organization_id = p_org and p.is_active;
  if n = 0 then return true; end if; -- chưa gán chức vụ nào (hoặc đều đã ngừng): không hạn chế như cũ
  return exists (select 1 from org_positions p where p.id = any (m.position_ids) and p.organization_id = p_org and p.is_active
                   and (p.work_type_ids is null or p_wt = any (p.work_type_ids)));
end $$;

drop policy logs_insert on activity_logs;
create policy logs_insert on activity_logs for insert to authenticated
  with check (can_log(organization_id, cycle_id) and created_by = auth.uid()
              and (work_type_allowed(organization_id, work_type_id) or work_type_allowed(cycle_area_org(cycle_id), work_type_id)));

create or replace function can_manage_stages(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_cycle(c)
      or exists (select 1 from organization_memberships m
                   join org_positions p on p.id = any (m.position_ids) and p.organization_id = m.organization_id
                  where m.user_id = auth.uid() and m.status = 'active' and p.is_active and p.can_manage_stages
                    and m.organization_id in (cycle_owner_org(c), cycle_area_org(c)));
$$;

create or replace function cycle_stage_edit_guard(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s cycle_status;
begin
  if not can_manage_stages(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền sửa giai đoạn của vụ này.';
  end if;
  select status into s from production_cycles where id = p_cycle;
  if s in ('ended', 'cancelled') then
    raise exception 'CYCLE_CLOSED: Vụ đã kết thúc nên không sửa giai đoạn được.';
  end if;
end $$;

create or replace function advance_stage(p_stage uuid, p_action text, p_date date default null)
returns production_stages
language plpgsql security definer set search_path = public as $$
declare st production_stages; cyc_status cycle_status; d date := coalesce(p_date, current_date); r production_stages;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null or not can_manage_stages(st.cycle_id) then
    raise exception 'FORBIDDEN: Bạn không có quyền thay đổi giai đoạn của vụ này.';
  end if;
  select status into cyc_status from production_cycles where id = st.cycle_id;
  if cyc_status <> 'active' then
    raise exception 'CYCLE_NOT_ACTIVE: Chỉ vụ đang sản xuất mới bắt đầu hoặc hoàn thành giai đoạn.';
  end if;
  if p_action = 'start' then
    if st.status <> 'pending' then raise exception 'INVALID_TRANSITION: Giai đoạn này đã bắt đầu rồi.'; end if;
    update production_stages set status = 'in_progress', actual_start = d where id = p_stage returning * into r;
  elsif p_action = 'complete' then
    if st.status <> 'in_progress' then raise exception 'INVALID_TRANSITION: Hãy bắt đầu giai đoạn trước khi hoàn thành.'; end if;
    if d < st.actual_start then raise exception 'INVALID_DATE: Ngày hoàn thành không thể trước ngày bắt đầu (%).', st.actual_start; end if;
    update production_stages set status = 'done', actual_end = d where id = p_stage returning * into r;
  elsif p_action = 'reopen' then
    if st.status <> 'done' then raise exception 'INVALID_TRANSITION: Chỉ mở lại được giai đoạn đã xong.'; end if;
    update production_stages set status = 'in_progress', actual_end = null where id = p_stage returning * into r;
  else
    raise exception 'INVALID_ARGUMENT: Thao tác không hợp lệ.';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Hàm của chủ: lưu/xóa chức vụ, gán chức vụ cho người
-- ---------------------------------------------------------------------------
create or replace function save_position(
  p_org uuid, p_id uuid, p_name text, p_description text, p_perms jsonb, p_work_type_ids uuid[], p_can_manage_stages boolean, p_active boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); bad integer;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạo và sửa chức vụ.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Tên chức vụ cần ít nhất 2 ký tự.'; end if;
  if not permissions_valid(coalesce(p_perms, '{}'::jsonb)) then raise exception 'INVALID_PERMISSIONS: Quyền không hợp lệ.'; end if;
  if p_work_type_ids is not null then
    select count(*) into bad from unnest(p_work_type_ids) w
     where not exists (select 1 from work_types t where t.id = w and (t.organization_id is null or t.organization_id = p_org));
    if bad > 0 then raise exception 'INVALID_WORK_TYPE: Có loại việc không thuộc cơ sở này.'; end if;
  end if;
  if p_id is not null and not exists (select 1 from org_positions where id = p_id and organization_id = p_org) then
    raise exception 'NOT_FOUND: Không tìm thấy chức vụ.';
  end if;
  insert into org_positions (id, organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active)
    values (v_id, p_org, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_perms, '{}'::jsonb), p_work_type_ids,
            coalesce(p_can_manage_stages, false), coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, description = excluded.description, perms = excluded.perms,
    work_type_ids = excluded.work_type_ids, can_manage_stages = excluded.can_manage_stages, is_active = excluded.is_active;
  return v_id;
end $$;

create or replace function delete_position(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from org_positions where id = p_id;
  if v_org is null or not has_org_role(v_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xóa chức vụ.';
  end if;
  update organization_memberships set position_ids = array_remove(position_ids, p_id) where organization_id = v_org and p_id = any (position_ids);
  delete from org_positions where id = p_id;
end $$;

create or replace function set_member_positions(p_org uuid, p_user uuid, p_positions uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare r member_role[]; bad integer; ids uuid[] := coalesce(p_positions, '{}'::uuid[]);
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được gán chức vụ.';
  end if;
  select roles into r from organization_memberships where organization_id = p_org and user_id = p_user and status = 'active';
  if r is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (r) then raise exception 'INVALID_TARGET: Chủ cơ sở luôn có đủ mọi quyền, không cần gán chức vụ.'; end if;
  select count(*) into bad from unnest(ids) x where not exists (select 1 from org_positions p where p.id = x and p.organization_id = p_org and p.is_active);
  if bad > 0 then raise exception 'INVALID_POSITION: Có chức vụ không tồn tại hoặc đã ngừng.'; end if;
  update organization_memberships set position_ids = ids where organization_id = p_org and user_id = p_user and status = 'active';
end $$;

-- Chủ/quản lý/nhân viên có hồ sơ lao động để tự chấm công như nhân sự khác (tạo một lần, tên lấy từ tên hiển thị)
create or replace function ensure_my_worker(p_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare w uuid; r member_role[]; nm text;
begin
  select roles into r from organization_memberships where organization_id = p_org and user_id = auth.uid() and status = 'active';
  if r is null or not (r && array['owner', 'manager', 'worker']::member_role[]) then
    raise exception 'FORBIDDEN: Bạn không có quyền chấm công ở cơ sở này.';
  end if;
  select id into w from worker_profiles where organization_id = p_org and user_id = auth.uid();
  if w is not null then return w; end if;
  nm := coalesce((select display_name from user_profiles where user_id = auth.uid()),
                 (select nullif(split_part(email, '@', 1), '') from auth.users where id = auth.uid()), 'Nhân sự');
  insert into worker_profiles (organization_id, user_id, full_name, work_mode)
    values (p_org, auth.uid(), case when length(nm) < 1 then 'Nhân sự' else nm end, 'self_hourly') returning id into w;
  return w;
end $$;

revoke execute on function work_type_allowed(uuid, uuid), can_manage_stages(uuid), save_position(uuid, uuid, text, text, jsonb, uuid[], boolean, boolean),
  delete_position(uuid), set_member_positions(uuid, uuid, uuid[]), ensure_my_worker(uuid), cycle_stage_edit_guard(uuid) from public, anon;
revoke execute on function cycle_stage_edit_guard(uuid) from authenticated;
grant execute on function save_position(uuid, uuid, text, text, jsonb, uuid[], boolean, boolean), delete_position(uuid),
  set_member_positions(uuid, uuid, uuid[]), ensure_my_worker(uuid), work_type_allowed(uuid, uuid), can_manage_stages(uuid) to authenticated, service_role;
