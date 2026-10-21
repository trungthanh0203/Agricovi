-- D49: DANH MỤC VAI TRÒ của cơ sở = vai trò có sẵn + vai trò chủ tự tạo (trước đây gọi là "chức vụ"), cùng một danh sách, cùng sửa/xóa được.
-- Vai trò có sẵn (Quản lý, Nhân viên sản xuất, Kho & chi phí, Quản lý HTX, Biên tập hồ sơ) được tạo thành dòng riêng cho từng cơ sở,
-- quyền ban đầu đúng như mặc định cũ. Sửa quyền một vai trò có sẵn thì mọi người giữ vai trò đó đổi theo.
-- Xóa vai trò có sẵn chỉ được khi không ai đang giữ; muốn dùng lại thì bấm "Thêm vai trò có sẵn". Vai trò tự tạo "dựa trên" một vai trò nền
-- (để giữ các quyền thao tác gốc); gán vai trò tự tạo cho người nào thì tự cộng vai trò nền cho người đó.

alter table org_positions
  add column base_role member_role not null default 'worker',
  add column is_builtin boolean not null default false;
alter table org_positions add constraint org_positions_base_not_owner check (base_role <> 'owner');
create unique index org_positions_builtin_unique on org_positions (organization_id, base_role) where is_builtin;

-- ---------------------------------------------------------------------------
-- Tạo sẵn các vai trò có sẵn cho cơ sở
-- ---------------------------------------------------------------------------
create or replace function seed_builtin_roles_internal(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r member_role; n integer := 0; v_type org_type; perms jsonb; m text; lvl integer; ins integer;
begin
  select type into v_type from organizations where id = p_org;
  for r, perms in
    select x.role, '{}'::jsonb from (values ('manager'::member_role), ('worker'), ('inventory_finance'), ('profile_editor'),
      ('cooperative_manager')) x(role)
     where x.role <> 'cooperative_manager' or v_type = 'cooperative'
  loop
    foreach m in array array['inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare'] loop
      lvl := role_default_perm(array[r], m);
      perms := perms || jsonb_build_object(m, case lvl when 2 then 'edit' when 1 then 'view' else 'none' end);
    end loop;
    insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
      values (p_org,
        case r when 'manager' then 'Quản lý' when 'worker' then 'Nhân viên sản xuất' when 'inventory_finance' then 'Kho & chi phí'
               when 'cooperative_manager' then 'Quản lý HTX' else 'Biên tập hồ sơ' end,
        case r when 'manager' then 'Quản lý sản xuất: tạo vụ, quản lý giai đoạn, nhân sự, chấm công.'
               when 'worker' then 'Ghi nhật ký, thu hoạch, xuất dùng vật tư và chấm công của mình.'
               when 'inventory_finance' then 'Nhập kho, điều chỉnh tồn, ghi chi phí và doanh thu.'
               when 'cooperative_manager' then 'Quản lý hộ thành viên và vụ ghi theo HTX.'
               else 'Soạn nội dung hồ sơ giới thiệu.' end,
        perms, null, r = 'manager', true, r, true)
    on conflict do nothing;
    get diagnostics ins = row_count;
    n := n + ins;
  end loop;
  return n;
end $$;

create or replace function organizations_seed_roles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_builtin_roles_internal(new.id);
  return new;
end $$;
create trigger organizations_seed_roles after insert on organizations for each row execute function organizations_seed_roles();

do $$
declare o record;
begin
  for o in select id from organizations loop perform seed_builtin_roles_internal(o.id); end loop;
end $$;

create or replace function add_builtin_roles(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở được thêm vai trò có sẵn.'; end if;
  return seed_builtin_roles_internal(p_org);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền hiệu lực: vai trò có sẵn lấy theo dòng của cơ sở (sửa được), vai trò tự tạo cộng thêm
-- ---------------------------------------------------------------------------
create or replace function perm_level(p_org uuid, p_module text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare m record; base integer := 0; pos integer; r member_role; lv integer;
begin
  if account_blocked() then return 0; end if;
  select mm.roles, mm.permissions, mm.position_ids into m from organization_memberships mm
   where mm.organization_id = p_org and mm.user_id = auth.uid() and mm.status = 'active';
  if not found then return 0; end if;
  if 'owner' = any (m.roles) then return 2; end if;
  if m.permissions ? p_module then return perm_level_of(m.permissions ->> p_module); end if; -- chủ cấp riêng: đè lên
  foreach r in array m.roles loop
    select perm_level_of(p.perms ->> p_module) into lv from org_positions p
     where p.organization_id = p_org and p.is_builtin and p.base_role = r;
    base := greatest(base, coalesce(lv, role_default_perm(array[r], p_module)));
  end loop;
  select coalesce(max(perm_level_of(p.perms ->> p_module)), 0) into pos
    from org_positions p where p.id = any (m.position_ids) and p.organization_id = p_org and p.is_active and not p.is_builtin;
  return greatest(base, pos);
end $$;

-- Loại việc: nếu người đó giữ vai trò TỰ TẠO thì chỉ tính các vai trò tự tạo (hợp các loại việc cho phép); nếu không thì tính vai trò có sẵn họ giữ.
-- Quản lý và chủ luôn được mọi loại.
create or replace function work_type_allowed(p_org uuid, p_wt uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m record; n integer;
begin
  select roles, position_ids into m from organization_memberships
   where organization_id = p_org and user_id = auth.uid() and status = 'active';
  if not found then return false; end if;
  if m.roles && array['owner', 'manager']::member_role[] then return true; end if;
  select count(*) into n from org_positions p where p.organization_id = p_org and p.is_active and not p.is_builtin and p.id = any (m.position_ids);
  if n > 0 then
    return exists (select 1 from org_positions p where p.organization_id = p_org and p.is_active and not p.is_builtin and p.id = any (m.position_ids)
                     and (p.work_type_ids is null or p_wt = any (p.work_type_ids)));
  end if;
  select count(*) into n from org_positions p where p.organization_id = p_org and p.is_active and p.is_builtin and p.base_role = any (m.roles);
  if n = 0 then return true; end if;
  return exists (select 1 from org_positions p where p.organization_id = p_org and p.is_active and p.is_builtin and p.base_role = any (m.roles)
                   and (p.work_type_ids is null or p_wt = any (p.work_type_ids)));
end $$;

create or replace function can_manage_stages(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_cycle(c)
      or exists (select 1 from organization_memberships m
                   join org_positions p on p.organization_id = m.organization_id and p.is_active and p.can_manage_stages
                    and ((p.is_builtin and p.base_role = any (m.roles)) or (not p.is_builtin and p.id = any (m.position_ids)))
                  where m.user_id = auth.uid() and m.status = 'active'
                    and m.organization_id in (cycle_owner_org(c), cycle_area_org(c)));
$$;

-- ---------------------------------------------------------------------------
-- Lưu / xóa / gán
-- ---------------------------------------------------------------------------
drop function save_position(uuid, uuid, text, text, jsonb, uuid[], boolean, boolean);
create function save_position(
  p_org uuid, p_id uuid, p_name text, p_description text, p_perms jsonb, p_work_type_ids uuid[], p_can_manage_stages boolean,
  p_active boolean default true, p_base_role member_role default 'worker')
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); bad integer; cur org_positions; v_base member_role := coalesce(p_base_role, 'worker');
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạo và sửa vai trò.';
  end if;
  if p_id is not null then
    select * into cur from org_positions where id = p_id and organization_id = p_org;
    if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy vai trò.'; end if;
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Tên vai trò cần ít nhất 2 ký tự.'; end if;
  if not permissions_valid(coalesce(p_perms, '{}'::jsonb)) then raise exception 'INVALID_PERMISSIONS: Quyền không hợp lệ.'; end if;
  if v_base = 'owner' then raise exception 'INVALID_ROLE: Không dựa trên vai trò chủ cơ sở.'; end if;
  if p_work_type_ids is not null then
    select count(*) into bad from unnest(p_work_type_ids) w
     where not exists (select 1 from work_types t where t.id = w and (t.organization_id is null or t.organization_id = p_org));
    if bad > 0 then raise exception 'INVALID_WORK_TYPE: Có loại việc không thuộc cơ sở này.'; end if;
  end if;
  if cur.is_builtin then
    -- vai trò có sẵn: giữ tên, vai trò nền, luôn hoạt động; sửa được mô tả, quyền, loại việc, quyền giai đoạn
    update org_positions set description = nullif(trim(coalesce(p_description, '')), ''), perms = coalesce(p_perms, '{}'::jsonb),
           work_type_ids = p_work_type_ids, can_manage_stages = coalesce(p_can_manage_stages, false) where id = p_id;
    return p_id;
  end if;
  insert into org_positions (id, organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
    values (v_id, p_org, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_perms, '{}'::jsonb), p_work_type_ids,
            coalesce(p_can_manage_stages, false), coalesce(p_active, true), v_base, false)
  on conflict (id) do update set name = excluded.name, description = excluded.description, perms = excluded.perms,
    work_type_ids = excluded.work_type_ids, can_manage_stages = excluded.can_manage_stages, is_active = excluded.is_active, base_role = excluded.base_role;
  return v_id;
end $$;

create or replace function delete_position(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p org_positions; n integer;
begin
  select * into p from org_positions where id = p_id;
  if p.id is null or not has_org_role(p.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xóa vai trò.';
  end if;
  if p.is_builtin then
    select count(*) into n from organization_memberships m
     where m.organization_id = p.organization_id and m.status in ('active', 'suspended') and p.base_role = any (m.roles);
    if n > 0 then
      raise exception 'IN_USE: Vai trò này đang có % người giữ. Hãy đổi vai trò của họ ở mục Nhân sự trước khi xóa.', n;
    end if;
  else
    update organization_memberships set position_ids = array_remove(position_ids, p_id) where organization_id = p.organization_id and p_id = any (position_ids);
  end if;
  delete from org_positions where id = p_id;
end $$;

-- Gán vai trò tự tạo: tự cộng vai trò nền cho người đó
create or replace function set_member_positions(p_org uuid, p_user uuid, p_positions uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare r member_role[]; bad integer; ids uuid[] := coalesce(p_positions, '{}'::uuid[]); bases member_role[];
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được gán vai trò.';
  end if;
  select roles into r from organization_memberships where organization_id = p_org and user_id = p_user and status = 'active';
  if r is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (r) then raise exception 'INVALID_TARGET: Chủ cơ sở luôn có đủ mọi quyền, không cần gán vai trò.'; end if;
  select count(*) into bad from unnest(ids) x
   where not exists (select 1 from org_positions p where p.id = x and p.organization_id = p_org and p.is_active and not p.is_builtin);
  if bad > 0 then raise exception 'INVALID_POSITION: Có vai trò không tồn tại hoặc đã ngừng.'; end if;
  select coalesce(array_agg(distinct p.base_role), '{}') into bases from org_positions p where p.id = any (ids);
  update organization_memberships set position_ids = ids, roles = clean_roles(p_org, roles || bases)
   where organization_id = p_org and user_id = p_user and status = 'active';
end $$;

revoke execute on function seed_builtin_roles_internal(uuid), organizations_seed_roles() from public, anon, authenticated;
revoke execute on function add_builtin_roles(uuid), save_position(uuid, uuid, text, text, jsonb, uuid[], boolean, boolean, member_role),
  delete_position(uuid), set_member_positions(uuid, uuid, uuid[]) from public, anon;
grant execute on function add_builtin_roles(uuid), save_position(uuid, uuid, text, text, jsonb, uuid[], boolean, boolean, member_role),
  delete_position(uuid), set_member_positions(uuid, uuid, uuid[]), work_type_allowed(uuid, uuid), can_manage_stages(uuid) to authenticated, service_role;
