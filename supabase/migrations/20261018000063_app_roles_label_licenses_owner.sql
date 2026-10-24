-- D82: (1) Giấy phép/chứng chỉ chỉ CHỦ cơ sở được thêm-sửa-xóa (mọi thành viên vẫn xem được); Gói dịch vụ chỉ chủ xem.
--      (2) Quản trị nền tảng sửa được TÊN các vai trò có sẵn (Quản lý, Nhân viên sản xuất…): đổi một lần, mọi cơ sở đổi theo,
--          cơ sở tạo sau cũng dùng tên mới. Chỉ đổi TÊN, không đổi quyền.

-- ---------------------------------------------------------------------------
-- (1) Giấy phép, gói dịch vụ
-- ---------------------------------------------------------------------------
drop policy org_licenses_write on org_licenses;
create policy org_licenses_write on org_licenses for all to authenticated
  using (has_org_role(organization_id, array['owner']::member_role[]))
  with check (has_org_role(organization_id, array['owner']::member_role[]));

create or replace function org_plan_usage(p_org uuid) returns table (
  plan_name text, status subscription_status, max_cycles integer, used_cycles integer,
  period_end timestamptz, price_per_quarter bigint, is_current boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem được gói dịch vụ.';
  end if;
  return query
    select pt.name, s.status, s.max_cycles,
           (select count(*)::int from production_cycles c
             where c.owner_org_id = p_org and c.status in ('active', 'paused')),
           s.period_end, s.price_per_quarter,
           (s.status in ('trial', 'active') and now() >= s.period_start and now() < s.period_end)
      from subscriptions s join plan_tiers pt on pt.id = s.plan_tier_id
     where s.organization_id = p_org
     order by s.period_end desc
     limit 1;
end $$;
revoke execute on function org_plan_usage(uuid) from public, anon;
grant execute on function org_plan_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (2) Tên vai trò do quản trị nền tảng đặt
-- ---------------------------------------------------------------------------
create table platform_role_labels (
  role member_role primary key,
  name text not null check (length(trim(name)) between 2 and 40),
  updated_at timestamptz not null default now()
);
insert into platform_role_labels (role, name) values
  ('owner', 'Chủ cơ sở'), ('manager', 'Quản lý'), ('worker', 'Nhân viên sản xuất'), ('inventory_finance', 'Kho & chi phí'),
  ('cooperative_manager', 'Quản lý HTX'), ('profile_editor', 'Biên tập hồ sơ');
alter table platform_role_labels enable row level security;
create policy platform_role_labels_read on platform_role_labels for select to authenticated using (true);
grant select on platform_role_labels to authenticated;

create or replace function role_label(r member_role) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from platform_role_labels where role = r), r::text);
$$;
revoke execute on function role_label(member_role) from public, anon;
grant execute on function role_label(member_role) to authenticated;

-- Cơ sở mới (và "Thêm vai trò có sẵn") dùng tên hiện hành
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
      values (p_org, role_label(r),
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

-- Quản trị viên nền tảng đổi tên một vai trò có sẵn; mọi cơ sở đổi theo
create or replace function admin_set_role_label(p_role member_role, p_name text, p_reason text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare prev text; v_name text := trim(coalesce(p_name, '')); n integer := 0;
begin
  perform admin_guard();
  if length(v_name) < 2 or length(v_name) > 40 then raise exception 'INVALID_NAME: Tên vai trò cần từ 2 đến 40 ký tự.'; end if;
  select name into prev from platform_role_labels where role = p_role;
  if p_role <> 'owner' and exists (select 1 from org_positions where not is_builtin and lower(name) = lower(v_name)) then
    raise exception 'NAME_TAKEN: Có cơ sở đã tự tạo vai trò trùng tên này, hãy chọn tên khác.';
  end if;
  insert into platform_role_labels (role, name, updated_at) values (p_role, v_name, now())
    on conflict (role) do update set name = excluded.name, updated_at = now();
  if p_role <> 'owner' then
    update org_positions set name = v_name where is_builtin and base_role = p_role and name is distinct from v_name;
    get diagnostics n = row_count;
  end if;
  perform admin_audit(null, 'set_role_label', 'platform_role_label', p_role::text, jsonb_build_object('name', prev),
                      jsonb_build_object('name', v_name, 'orgs_updated', n), nullif(trim(coalesce(p_reason, '')), ''));
  return n;
end $$;
revoke execute on function admin_set_role_label(member_role, text, text) from public, anon;
grant execute on function admin_set_role_label(member_role, text, text) to authenticated;
