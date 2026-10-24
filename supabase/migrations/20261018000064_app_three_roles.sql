-- D83: CHỈ CÒN 3 VAI TRÒ (Chủ cơ sở, Quản lý, Nhân viên) cho mọi cơ sở. Quyền của Quản lý và Nhân viên chỉ ở mức tối thiểu;
-- chủ cấp thêm từng mục cho từng người, hoặc gom thành CHỨC VỤ (org_positions, do chủ tạo riêng cho cơ sở) rồi gán.
-- Các vai trò cũ Kho & chi phí, Biên tập hồ sơ, Quản lý HTX bỏ: quyền của chúng thành chức vụ gợi ý ("Thủ kho và kế toán",
-- "Biên tập hồ sơ", "Quản lý hợp tác xã"). Giá trị enum cũ vẫn còn trong kiểu (không xóa được) nhưng không còn gán được.
-- Thêm 3 mục quyền: website (Hồ sơ website và đơn khách), coop (Hộ thành viên của HTX), payroll (Tiền công: lương, giá công, thưởng/phạt).
-- Chức vụ KHÔNG đổi vai trò chính của người được gán.

-- ---------------------------------------------------------------------------
-- 1. Mục quyền và mức mặc định theo vai trò (nhánh vai trò cũ giữ lại cho dữ liệu/test cũ, không còn gán được)
-- ---------------------------------------------------------------------------
create or replace function permissions_valid(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each_text(p) e
        where e.key not in ('inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare', 'website', 'coop', 'payroll')
           or e.value not in ('none', 'view', 'edit')
           or (e.key = 'summary' and e.value = 'edit'));
$$;

create or replace function role_default_perm(p_roles member_role[], p_module text) returns integer
language sql immutable as $$
  select case p_module
    when 'inventory' then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when 'manager' = any (p_roles) then 1 else 0 end
    when 'expenses'  then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when 'cooperative_manager' = any (p_roles) then 1 else 0 end
    when 'sales'     then case when p_roles && array['owner', 'inventory_finance']::member_role[] then 2
                               when 'cooperative_manager' = any (p_roles) then 1 else 0 end
    when 'summary'   then case when p_roles && array['owner', 'inventory_finance', 'cooperative_manager']::member_role[] then 1 else 0 end
    when 'harvest'   then case when p_roles && array['owner', 'manager', 'worker', 'inventory_finance', 'cooperative_manager']::member_role[] then 2 else 0 end
    when 'declare'   then case when p_roles && array['owner', 'cooperative_manager']::member_role[] then 2
                               when 'manager' = any (p_roles) then 1 else 0 end
    when 'website'   then case when p_roles && array['owner', 'profile_editor']::member_role[] then 2 else 0 end
    when 'coop'      then case when p_roles && array['owner', 'cooperative_manager']::member_role[] then 2 else 0 end
    when 'payroll'   then case when 'owner' = any (p_roles) then 2 else 0 end
    else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tên vai trò hiển thị
-- ---------------------------------------------------------------------------
update platform_role_labels set name = 'Nhân viên', updated_at = now() where role = 'worker';
update org_positions set name = 'Nhân viên' where is_builtin and base_role = 'worker';

-- ---------------------------------------------------------------------------
-- 3. Chức vụ gợi ý và vai trò có sẵn (chỉ Quản lý, Nhân viên)
-- ---------------------------------------------------------------------------
create or replace function default_perms_json(r member_role) returns jsonb
language sql immutable as $$
  select jsonb_object_agg(m, case role_default_perm(array[r], m) when 2 then 'edit' when 1 then 'view' else 'none' end)
    from unnest(array['inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare', 'website', 'coop', 'payroll']) m;
$$;

create or replace function seed_builtin_roles_internal(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r member_role; n integer := 0; v_type org_type; ins integer;
begin
  select type into v_type from organizations where id = p_org;
  foreach r in array array['manager', 'worker']::member_role[] loop
    insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
      values (p_org, role_label(r),
        case r when 'manager' then 'Điều hành sản xuất: tạo vụ, quản lý giai đoạn, xác nhận chấm công, xem nhân sự.'
               else 'Ghi nhật ký, thu hoạch, vật tư đã dùng và chấm công của mình.' end,
        default_perms_json(r), null, r = 'manager', true, r, true)
    on conflict do nothing;
    get diagnostics ins = row_count; n := n + ins;
  end loop;
  -- chức vụ gợi ý (chủ sửa, xóa được)
  insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
    values (p_org, 'Thủ kho và kế toán', 'Nhập xuất kho, ghi chi phí và doanh thu.',
            default_perms_json('worker') || '{"inventory":"edit","expenses":"edit","sales":"edit","summary":"view"}'::jsonb, null, false, true, 'worker', false),
           (p_org, 'Biên tập hồ sơ', 'Soạn hồ sơ giới thiệu và xử lý đơn khách từ website.',
            default_perms_json('worker') || '{"website":"edit"}'::jsonb, null, false, true, 'worker', false)
  on conflict do nothing;
  get diagnostics ins = row_count; n := n + ins;
  if v_type = 'cooperative' then
    insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
      values (p_org, 'Quản lý hợp tác xã', 'Mời và quản lý hộ thành viên.',
              default_perms_json('worker') || '{"coop":"edit"}'::jsonb, null, false, true, 'worker', false)
    on conflict do nothing;
    get diagnostics ins = row_count; n := n + ins;
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Chuyển dữ liệu cũ
-- ---------------------------------------------------------------------------
do $$
declare o record; m record; conv record; ids uuid[]; nr member_role[]; r member_role; pid uuid; pname text; pperm jsonb; pbase member_role;
begin
  -- vai trò có sẵn cũ -> chức vụ thường
  for conv in select * from (values
      ('inventory_finance'::member_role, 'Thủ kho và kế toán', 'worker'::member_role, 'Nhập xuất kho, ghi chi phí và doanh thu.',
        '{"inventory":"edit","expenses":"edit","sales":"edit","summary":"view"}'::jsonb),
      ('profile_editor', 'Biên tập hồ sơ', 'worker', 'Soạn hồ sơ giới thiệu và xử lý đơn khách từ website.', '{"website":"edit"}'::jsonb),
      ('cooperative_manager', 'Quản lý hợp tác xã', 'worker', 'Mời và quản lý hộ thành viên.', '{"coop":"edit"}'::jsonb)) x(old_role, nm, base, descr, extra)
  loop
    update org_positions set is_builtin = false, name = conv.nm, base_role = conv.base, description = conv.descr,
           perms = default_perms_json('worker') || conv.extra
     where is_builtin and base_role = conv.old_role
       and not exists (select 1 from org_positions q where q.organization_id = org_positions.organization_id and q.name = conv.nm);
    delete from org_positions where is_builtin and base_role = conv.old_role; -- (trùng tên: bỏ dòng cũ)
    -- cơ sở có người/lời mời giữ vai trò cũ mà chưa có chức vụ tương ứng -> tạo
    insert into org_positions (organization_id, name, description, perms, can_manage_stages, is_active, base_role, is_builtin)
      select distinct mm.organization_id, conv.nm, conv.descr, default_perms_json('worker') || conv.extra, false, true, conv.base, false
        from organization_memberships mm where conv.old_role = any (mm.roles)
      on conflict (organization_id, name) do nothing;
    -- thành viên: đổi vai trò, thêm chức vụ
    for m in select * from organization_memberships where conv.old_role = any (roles) loop
      select id into pid from org_positions where organization_id = m.organization_id and name = conv.nm;
      update organization_memberships set
        roles = (select array_agg(distinct x order by x) from unnest(array_remove(m.roles, conv.old_role) || case when conv.old_role = 'cooperative_manager' then array['manager']::member_role[] else array['worker']::member_role[] end) x),
        position_ids = case when pid is null or pid = any (m.position_ids) then m.position_ids else m.position_ids || pid end
       where id = m.id;
    end loop;
    update organization_invitations set roles = (select array_agg(distinct x order by x)
        from unnest(array_remove(roles, conv.old_role) || case when conv.old_role = 'cooperative_manager' then array['manager']::member_role[] else array['worker']::member_role[] end) x)
     where conv.old_role = any (roles);
  end loop;
  -- vai trò có sẵn còn lại: đưa quyền về mức tối thiểu mới
  update org_positions set perms = default_perms_json(base_role) where is_builtin and base_role in ('manager', 'worker');
  -- cơ sở chưa có chức vụ gợi ý: thêm
  for o in select id from organizations loop perform seed_builtin_roles_internal(o.id); end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Chỉ gán được 3 vai trò; chức vụ không đổi vai trò chính
-- ---------------------------------------------------------------------------
create or replace function clean_roles(p_org uuid, p_roles member_role[]) returns member_role[]
language plpgsql stable set search_path = public as $$
declare cleaned member_role[];
begin
  select array(select distinct r from unnest(coalesce(p_roles, '{}')) r order by r) into cleaned;
  if cardinality(cleaned) = 0 then raise exception 'INVALID_ROLE: Hãy chọn ít nhất một vai trò'; end if;
  if 'owner' = any (cleaned) then raise exception 'INVALID_ROLE: Không thể gán vai trò chủ cơ sở'; end if;
  if cleaned && array['inventory_finance', 'profile_editor', 'cooperative_manager']::member_role[] then
    raise exception 'INVALID_ROLE: Chỉ có 3 vai trò: Chủ cơ sở, Quản lý, Nhân viên. Quyền thêm hãy cấp riêng hoặc gán chức vụ.';
  end if;
  return cleaned;
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
  select count(*) into bad from unnest(ids) x
   where not exists (select 1 from org_positions p where p.id = x and p.organization_id = p_org and p.is_active and not p.is_builtin);
  if bad > 0 then raise exception 'INVALID_POSITION: Có chức vụ không tồn tại hoặc đã ngừng.'; end if;
  update organization_memberships set position_ids = ids where organization_id = p_org and user_id = p_user and status = 'active';
end $$;

-- invite_member cũ (0010) còn nhánh vai trò HTX; hàm hiện hành dùng clean_roles nên đã được chặn ở trên.

-- ---------------------------------------------------------------------------
-- 6. Quyền theo mục thay cho vai trò cũ
-- ---------------------------------------------------------------------------
-- Hồ sơ website, đơn khách: chủ hoặc người được cấp quyền "website" (mức sửa)
create or replace function can_edit_profile(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(org, 'website', 'edit');
$$;

-- Người nhận thông báo của website (chủ + người được cấp quyền website). Chat WEB nên dùng hàm này thay cho danh sách vai trò cũ.
create or replace function website_staff_ids(p_org uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from organization_memberships m
   where m.organization_id = p_org and m.status = 'active'
     and ('owner' = any (m.roles)
          or (case when m.permissions ? 'website' then perm_level_of(m.permissions ->> 'website')
                   else coalesce((select max(perm_level_of(p.perms ->> 'website')) from org_positions p
                                   where p.organization_id = p_org and p.is_active
                                     and ((p.is_builtin and p.base_role = any (m.roles)) or (not p.is_builtin and p.id = any (m.position_ids)))), 0) end) >= 2);
$$;
revoke execute on function website_staff_ids(uuid), default_perms_json(member_role) from public, anon, authenticated;

-- HTX: hộ thành viên theo quyền "coop"
drop policy coopinv_read on cooperative_invitations;
create policy coopinv_read on cooperative_invitations for select to authenticated using (has_perm(cooperative_org_id, 'coop', 'view'));
drop policy coop_write on cooperative_memberships;
create policy coop_write on cooperative_memberships for all to authenticated
  using (has_org_role(household_org_id, array['owner']::member_role[]) or has_perm(cooperative_org_id, 'coop', 'edit'))
  with check (has_org_role(household_org_id, array['owner']::member_role[]) or has_perm(cooperative_org_id, 'coop', 'edit'));

do $$
declare d text;
begin
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('invite_household', 'revoke_coop_invitation', 'create_member_household') loop
    d := replace(d, 'has_org_role(p_coop, array[''owner'',''cooperative_manager'']::member_role[])', 'has_perm(p_coop, ''coop'', ''edit'')');
    d := replace(d, 'has_org_role(inv.cooperative_org_id, array[''owner'',''cooperative_manager'']::member_role[])', 'has_perm(inv.cooperative_org_id, ''coop'', ''edit'')');
    execute d;
  end loop;
end $$;
create or replace function list_coop_households(p_coop uuid) returns table (
  household_org_id uuid, name text, joined_at timestamptz, managed boolean, active_coop_cycles integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN'; end if;
  return query
    select h.id, h.name, cm.joined_at, coalesce(h.managed_by_org = p_coop, false), active_coop_cycles(p_coop, h.id)
      from cooperative_memberships cm join organizations h on h.id = cm.household_org_id
     where cm.cooperative_org_id = p_coop and cm.status = 'active'
     order by h.name;
end $$;

-- Vụ: bỏ hai vai trò cũ khỏi danh sách (người đó nay là quản lý/nhân viên)
create or replace function can_log_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(cycle_owner_org(c), array['owner','manager','worker']::member_role[])
      or has_org_role(cycle_area_org(c), array['owner','manager','worker']::member_role[]);
$$;
create or replace function can_manage_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(cycle_owner_org(c), array['owner','manager']::member_role[])
      or has_org_role(cycle_area_org(c), array['owner','manager']::member_role[]);
$$;

-- Khai báo trang trại: theo quyền "declare" (Quản lý mặc định chỉ xem)
drop policy areas_write on production_areas;
create policy areas_write on production_areas for all to authenticated
  using (has_perm(organization_id, 'declare', 'edit')) with check (has_perm(organization_id, 'declare', 'edit'));

-- Yêu cầu dịch vụ hồ sơ: theo quyền website
drop policy psr_insert on profile_service_requests;
create policy psr_insert on profile_service_requests for insert to authenticated with check (can_edit_profile(organization_id));
drop policy psr_update on profile_service_requests;
create policy psr_update on profile_service_requests for update to authenticated
  using (can_edit_profile(organization_id) or is_platform_admin()) with check (can_edit_profile(organization_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- 7. Tiền công (lương, giá công, thưởng/phạt, bảng lương): quyền "payroll"; người làm vẫn xem phần của mình
-- ---------------------------------------------------------------------------
drop policy rates_read on work_rates;
create policy rates_read on work_rates for select to authenticated using (has_perm(organization_id, 'payroll', 'view'));
drop policy rates_write on work_rates;
create policy rates_write on work_rates for all to authenticated
  using (has_perm(organization_id, 'payroll', 'edit')) with check (has_perm(organization_id, 'payroll', 'edit'));

drop policy period_read on payroll_periods;
create policy period_read on payroll_periods for select to authenticated
  using (has_perm(organization_id, 'payroll', 'view')
         or exists (select 1 from worker_pay_statements s where s.period_id = payroll_periods.id and is_worker_self(s.worker_id)));
drop policy period_write on payroll_periods;
create policy period_write on payroll_periods for all to authenticated
  using (has_perm(organization_id, 'payroll', 'edit')) with check (has_perm(organization_id, 'payroll', 'edit'));

drop policy stmt_read on worker_pay_statements;
create policy stmt_read on worker_pay_statements for select to authenticated
  using (has_perm(organization_id, 'payroll', 'view') or is_worker_self(worker_id));
drop policy stmt_write on worker_pay_statements;
create policy stmt_write on worker_pay_statements for all to authenticated
  using (has_perm(organization_id, 'payroll', 'edit')) with check (has_perm(organization_id, 'payroll', 'edit'));

drop policy lines_read on pay_statement_lines;
create policy lines_read on pay_statement_lines for select to authenticated
  using (has_perm(organization_id, 'payroll', 'view')
         or is_worker_self((select s.worker_id from worker_pay_statements s where s.id = pay_statement_lines.statement_id)));
drop policy lines_write on pay_statement_lines;
create policy lines_write on pay_statement_lines for all to authenticated
  using (has_perm(organization_id, 'payroll', 'edit')) with check (has_perm(organization_id, 'payroll', 'edit'));

drop policy padj_read on pay_adjustments;
create policy padj_read on pay_adjustments for select to authenticated
  using (has_perm(organization_id, 'payroll', 'view') or is_worker_self(worker_id));
drop policy padj_write on pay_adjustments;
create policy padj_write on pay_adjustments for all to authenticated
  using (has_perm(organization_id, 'payroll', 'edit')) with check (has_perm(organization_id, 'payroll', 'edit'));

do $$
declare d text;
begin
  d := pg_get_functiondef('compute_payroll(uuid)'::regprocedure);
  if position('not is_workforce_admin(per.organization_id)' in d) = 0 then raise exception 'compute_payroll: không tìm thấy điều kiện cần thay'; end if;
  d := replace(d, 'not is_workforce_admin(per.organization_id)', 'not has_perm(per.organization_id, ''payroll'', ''edit'')');
  execute d;
end $$;
