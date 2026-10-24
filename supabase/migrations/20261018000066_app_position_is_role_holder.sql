-- D84: LÀM LẠI cho đúng mô hình của chủ sản phẩm. Hệ thống có 3 vai trò (Chủ cơ sở, Quản lý, Nhân viên). CHỨC VỤ do chủ tạo cho cơ sở mình,
-- mỗi chức vụ CÓ MỘT VAI TRÒ (mặc định Nhân viên; chuyển sang Quản lý thì chủ chọn thêm quyền). Mỗi người (trừ chủ) giữ ĐÚNG MỘT chức vụ;
-- vai trò và quyền của người lấy theo chức vụ (chủ vẫn có thể cấp riêng thêm/bớt cho từng người như ngoại lệ, D27).
-- Hai dòng "vai trò có sẵn" của từng cơ sở (Quản lý, Nhân viên) trở thành chức vụ thường, sửa/xóa được.
-- base_role của chức vụ = vai trò của chức vụ đó (chỉ manager hoặc worker).

-- ---------------------------------------------------------------------------
-- 1. Chức vụ có sẵn: thành chức vụ thường
-- ---------------------------------------------------------------------------
create or replace function seed_builtin_roles_internal(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; ins integer; v_type org_type;
begin
  select type into v_type from organizations where id = p_org;
  insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
    values
      (p_org, role_label('manager'), 'Điều hành sản xuất: tạo vụ, quản lý giai đoạn, xác nhận chấm công, xem nhân sự.',
         default_perms_json('manager'), null, true, true, 'manager', false),
      (p_org, role_label('worker'), 'Ghi nhật ký, thu hoạch, vật tư đã dùng và chấm công của mình.',
         default_perms_json('worker'), null, false, true, 'worker', false),
      (p_org, 'Thủ kho và kế toán', 'Nhập xuất kho, ghi chi phí và doanh thu.',
         default_perms_json('worker') || '{"inventory":"edit","expenses":"edit","sales":"edit","summary":"view"}'::jsonb, null, false, true, 'worker', false),
      (p_org, 'Biên tập hồ sơ', 'Soạn hồ sơ giới thiệu và xử lý đơn khách từ website.',
         default_perms_json('worker') || '{"website":"edit"}'::jsonb, null, false, true, 'worker', false)
  on conflict (organization_id, name) do nothing;
  get diagnostics ins = row_count; n := n + ins;
  if v_type = 'cooperative' then
    insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
      values (p_org, 'Quản lý hợp tác xã', 'Mời và quản lý hộ thành viên.',
              default_perms_json('manager') || '{"coop":"edit"}'::jsonb, null, true, true, 'manager', false)
    on conflict (organization_id, name) do nothing;
    get diagnostics ins = row_count; n := n + ins;
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ: mọi người (trừ chủ) giữ đúng một chức vụ; vai trò theo chức vụ
-- ---------------------------------------------------------------------------
do $$
declare o record; m record; pid uuid; prole member_role; want member_role;
begin
  update org_positions set is_builtin = false where is_builtin;
  -- "Quản lý hợp tác xã" từng được tạo với vai trò nhân viên: đúng ra là vai trò quản lý
  update org_positions set base_role = 'manager', can_manage_stages = true,
         perms = default_perms_json('manager') || '{"coop":"edit"}'::jsonb
   where name = 'Quản lý hợp tác xã' and base_role = 'worker';
  for o in select id from organizations loop perform seed_builtin_roles_internal(o.id); end loop;
  for m in select id, organization_id, roles, position_ids from organization_memberships where not ('owner' = any (roles)) loop
    pid := null;
    -- giữ chức vụ tự tạo đầu tiên còn dùng được
    select p.id, p.base_role into pid, prole from org_positions p
     where p.organization_id = m.organization_id and p.id = any (m.position_ids) and p.is_active order by p.name limit 1;
    if pid is null then
      want := case when 'manager' = any (m.roles) then 'manager' else 'worker' end;
      select p.id, p.base_role into pid, prole from org_positions p
       where p.organization_id = m.organization_id and p.base_role = want and p.name = role_label(want) limit 1;
      if pid is null then
        select p.id, p.base_role into pid, prole from org_positions p
         where p.organization_id = m.organization_id and p.base_role = want and p.is_active order by p.created_at limit 1;
      end if;
    end if;
    if pid is not null then
      update organization_memberships set position_ids = array[pid], roles = array[prole] where id = m.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tạo / sửa / xóa chức vụ (chỉ chủ)
-- ---------------------------------------------------------------------------
create or replace function save_position(
  p_org uuid, p_id uuid, p_name text, p_description text, p_perms jsonb, p_work_type_ids uuid[], p_can_manage_stages boolean,
  p_active boolean default true, p_base_role member_role default 'worker')
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); bad integer; cur org_positions; v_base member_role := coalesce(p_base_role, 'worker');
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được tạo và sửa chức vụ.';
  end if;
  if p_id is not null then
    select * into cur from org_positions where id = p_id and organization_id = p_org;
    if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy chức vụ.'; end if;
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Tên chức vụ cần ít nhất 2 ký tự.'; end if;
  if not permissions_valid(coalesce(p_perms, '{}'::jsonb)) then raise exception 'INVALID_PERMISSIONS: Quyền không hợp lệ.'; end if;
  if v_base not in ('manager', 'worker') then raise exception 'INVALID_ROLE: Vai trò của chức vụ chỉ là Quản lý hoặc Nhân viên.'; end if;
  if p_work_type_ids is not null then
    select count(*) into bad from unnest(p_work_type_ids) w
     where not exists (select 1 from work_types t where t.id = w and (t.organization_id is null or t.organization_id = p_org));
    if bad > 0 then raise exception 'INVALID_WORK_TYPE: Có loại việc không thuộc cơ sở này.'; end if;
  end if;
  if exists (select 1 from org_positions q where q.organization_id = p_org and lower(q.name) = lower(trim(p_name)) and q.id is distinct from p_id) then
    raise exception 'NAME_TAKEN: Đã có chức vụ trùng tên này.';
  end if;
  insert into org_positions (id, organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
    values (v_id, p_org, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_perms, '{}'::jsonb), p_work_type_ids,
            coalesce(p_can_manage_stages, false), coalesce(p_active, true), v_base, false)
  on conflict (id) do update set name = excluded.name, description = excluded.description, perms = excluded.perms,
    work_type_ids = excluded.work_type_ids, can_manage_stages = excluded.can_manage_stages, is_active = excluded.is_active, base_role = excluded.base_role;
  -- đổi vai trò của chức vụ thì những người đang giữ đổi theo
  if p_id is not null then
    update organization_memberships set roles = array[v_base]
     where organization_id = p_org and p_id = any (position_ids) and not ('owner' = any (roles));
  end if;
  return v_id;
end $$;

create or replace function delete_position(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p org_positions; n integer;
begin
  select * into p from org_positions where id = p_id;
  if p.id is null or not has_org_role(p.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xóa chức vụ.';
  end if;
  select count(*) into n from organization_memberships m
   where m.organization_id = p.organization_id and m.status in ('active', 'suspended') and p_id = any (m.position_ids);
  if n > 0 then
    raise exception 'IN_USE: Chức vụ này đang có % người giữ. Hãy chuyển họ sang chức vụ khác ở mục Nhân sự trước khi xóa.', n;
  end if;
  delete from org_positions where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Gán chức vụ cho người: đúng MỘT chức vụ; vai trò theo chức vụ
-- ---------------------------------------------------------------------------
create or replace function set_member_position(p_org uuid, p_user uuid, p_position uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r member_role[]; pos org_positions;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được gán chức vụ.';
  end if;
  select roles into r from organization_memberships where organization_id = p_org and user_id = p_user and status in ('active', 'suspended');
  if r is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (r) then raise exception 'INVALID_TARGET: Chủ cơ sở luôn có đủ mọi quyền, không cần chức vụ.'; end if;
  select * into pos from org_positions where id = p_position and organization_id = p_org and is_active;
  if pos.id is null then raise exception 'INVALID_POSITION: Chức vụ không tồn tại hoặc đã ngừng.'; end if;
  update organization_memberships set position_ids = array[pos.id], roles = array[pos.base_role]
   where organization_id = p_org and user_id = p_user;
end $$;

create or replace function set_member_positions(p_org uuid, p_user uuid, p_positions uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_positions is null or cardinality(p_positions) <> 1 then
    raise exception 'INVALID_POSITION: Mỗi người giữ đúng một chức vụ.';
  end if;
  perform set_member_position(p_org, p_user, p_positions[1]);
end $$;

-- Lời mời kèm chức vụ: người nhận chấp nhận thì vào đúng chức vụ đó
alter table organization_invitations add column position_id uuid references org_positions(id) on delete set null;

create or replace function invite_member_position(p_org uuid, p_email text, p_position uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pos org_positions; new_id uuid;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  select * into pos from org_positions where id = p_position and organization_id = p_org and is_active;
  if pos.id is null then raise exception 'INVALID_POSITION: Chức vụ không tồn tại hoặc đã ngừng.'; end if;
  new_id := invite_member(p_org, p_email, array[pos.base_role]::member_role[]);
  update organization_invitations set position_id = pos.id where id = new_id;
  return new_id;
end $$;

create or replace function accept_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv organization_invitations; pos org_positions;
begin
  select * into inv from organization_invitations where id = p_id for update;
  if inv.id is null or inv.status <> 'pending' or inv.email is distinct from current_email() then
    raise exception 'FORBIDDEN: Lời mời không còn hiệu lực hoặc không dành cho bạn';
  end if;
  insert into organization_memberships (organization_id, user_id, roles, status)
    values (inv.organization_id, auth.uid(), inv.roles, 'active')
  on conflict (organization_id, user_id) do update set
    roles = case
      when organization_memberships.status = 'revoked' then excluded.roles
      when 'owner' = any (organization_memberships.roles) then organization_memberships.roles
      else array(select distinct r from unnest(organization_memberships.roles || excluded.roles) r order by r)
    end,
    status = 'active';
  if inv.position_id is not null then
    select * into pos from org_positions where id = inv.position_id and is_active;
    if pos.id is not null then
      update organization_memberships set position_ids = array[pos.id], roles = array[pos.base_role]
       where organization_id = inv.organization_id and user_id = auth.uid() and not ('owner' = any (roles));
    end if;
  end if;
  update organization_invitations set status = 'accepted', decided_at = now() where id = p_id;
  return inv.organization_id;
end $$;

-- Quản trị đổi tên vai trò: các chức vụ mang đúng tên vai trò cũ đổi theo
create or replace function admin_set_role_label(p_role member_role, p_name text, p_reason text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare prev text; v_name text := trim(coalesce(p_name, '')); n integer := 0;
begin
  perform admin_guard();
  if length(v_name) < 2 or length(v_name) > 40 then raise exception 'INVALID_NAME: Tên vai trò cần từ 2 đến 40 ký tự.'; end if;
  select name into prev from platform_role_labels where role = p_role;
  if p_role <> 'owner' and exists (select 1 from org_positions p where lower(p.name) = lower(v_name) and p.name is distinct from prev) then
    raise exception 'NAME_TAKEN: Có cơ sở đã có chức vụ trùng tên này, hãy chọn tên khác.';
  end if;
  insert into platform_role_labels (role, name, updated_at) values (p_role, v_name, now())
    on conflict (role) do update set name = excluded.name, updated_at = now();
  if p_role <> 'owner' then
    update org_positions set name = v_name where base_role = p_role and name = prev and name is distinct from v_name;
    get diagnostics n = row_count;
  end if;
  perform admin_audit(null, 'set_role_label', 'platform_role_label', p_role::text, jsonb_build_object('name', prev),
                      jsonb_build_object('name', v_name, 'orgs_updated', n), nullif(trim(coalesce(p_reason, '')), ''));
  return n;
end $$;

revoke execute on function set_member_position(uuid, uuid, uuid), invite_member_position(uuid, text, uuid) from public, anon;
grant execute on function set_member_position(uuid, uuid, uuid), invite_member_position(uuid, text, uuid) to authenticated, service_role;
