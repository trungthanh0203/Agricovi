-- Quyền theo MỤC do chủ cơ sở cấp cho từng người (quyết định D27).
-- Các mục trong tab "Vật tư & chi phí": kho, thu hoạch, chi phí, doanh thu, tổng kết vụ.
-- Mỗi người có mức hiệu lực ở từng mục: 0 = không thấy, 1 = xem, 2 = xem và nhập liệu.
--   * Chủ cơ sở luôn đủ quyền ở mọi mục.
--   * Chưa được cấp riêng thì theo VAI TRÒ (đúng như ma trận trong docs/ROLES.md trước đây).
--   * Chủ cấp riêng (đè lên mặc định theo vai trò) ở cột organization_memberships.permissions, ví dụ {"expenses":"edit"}.
-- Ép ở CSDL (RLS), không chỉ ẩn ở giao diện.

alter table organization_memberships add column permissions jsonb not null default '{}'::jsonb;

create or replace function perm_level_of(p text) returns integer
language sql immutable as $$
  select case p when 'edit' then 2 when 'view' then 1 else 0 end;
$$;

-- Hợp lệ: đối tượng gồm các khóa mục đã biết với giá trị none/view/edit; "tổng kết vụ" chỉ none/view
create or replace function permissions_valid(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each_text(p) e
        where e.key not in ('inventory', 'harvest', 'expenses', 'sales', 'summary')
           or e.value not in ('none', 'view', 'edit')
           or (e.key = 'summary' and e.value = 'edit'));
$$;
alter table organization_memberships add constraint memb_permissions_valid check (permissions_valid(permissions));

-- Mức mặc định theo vai trò (giữ đúng hành vi trước đây)
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
    else 0 end;
$$;

-- Mức hiệu lực của người đang đăng nhập ở một cơ sở và một mục
create or replace function perm_level(p_org uuid, p_module text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  if account_blocked() then return 0; end if;
  select mm.roles, mm.permissions into m from organization_memberships mm
   where mm.organization_id = p_org and mm.user_id = auth.uid() and mm.status = 'active';
  if not found then return 0; end if;
  if 'owner' = any (m.roles) then return 2; end if;
  if m.permissions ? p_module then return perm_level_of(m.permissions ->> p_module); end if;
  return role_default_perm(m.roles, p_module);
end $$;

create or replace function has_perm(p_org uuid, p_module text, p_need text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level(p_org, p_module) >= perm_level_of(p_need);
$$;

-- Theo vụ: chủ vụ hoặc chủ khu trồng (hộ ghi theo vụ của HTX), giống can_log_cycle
create or replace function cycle_has_perm(c uuid, p_module text, p_need text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(cycle_owner_org(c), p_module, p_need) or has_perm(cycle_area_org(c), p_module, p_need);
$$;

-- ---------------------------------------------------------------------------
-- Chủ cấp quyền cho người khác
-- ---------------------------------------------------------------------------
create or replace function set_member_permissions(p_org uuid, p_user uuid, p_permissions jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r member_role[];
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở mới cấp quyền cho người khác.';
  end if;
  select roles into r from organization_memberships where organization_id = p_org and user_id = p_user and status = 'active';
  if r is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (r) then raise exception 'INVALID_TARGET: Chủ cơ sở luôn có đủ mọi quyền, không cần cấp.'; end if;
  if not permissions_valid(coalesce(p_permissions, '{}'::jsonb)) then
    raise exception 'INVALID_PERMISSIONS: Quyền không hợp lệ.';
  end if;
  update organization_memberships set permissions = coalesce(p_permissions, '{}'::jsonb)
   where organization_id = p_org and user_id = p_user and status = 'active';
end $$;

-- Quyền đã cấp riêng của các thành viên (chỉ chủ xem); khóa ra là member_* để khỏi trùng tên cột
create or replace function member_permission_overrides(p_org uuid)
returns table (member_user_id uuid, member_overrides jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem được quyền đã cấp.';
  end if;
  return query select m.user_id, m.permissions from organization_memberships m
    where m.organization_id = p_org and m.status = 'active';
end $$;

revoke execute on function set_member_permissions(uuid, uuid, jsonb), member_permission_overrides(uuid) from public, anon;
grant execute on function set_member_permissions(uuid, uuid, jsonb), member_permission_overrides(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Viết lại chính sách theo mục (mặc định theo vai trò cho kết quả y như trước)
-- ---------------------------------------------------------------------------
-- Kho: danh mục và nhập kho/điều chỉnh. Đọc danh mục vẫn dành cho mọi thành viên (cần khi ghi việc).
drop policy units_write on units_of_measure;
create policy units_write on units_of_measure for all to authenticated
  using (organization_id is not null and has_perm(organization_id, 'inventory', 'edit'))
  with check (organization_id is not null and has_perm(organization_id, 'inventory', 'edit'));

drop policy materials_write on materials;
create policy materials_write on materials for all to authenticated
  using (has_perm(organization_id, 'inventory', 'edit')) with check (has_perm(organization_id, 'inventory', 'edit'));

drop policy conv_write on unit_conversions;
create policy conv_write on unit_conversions for all to authenticated
  using (has_perm(organization_id, 'inventory', 'edit')) with check (has_perm(organization_id, 'inventory', 'edit'));

drop policy locations_write on inventory_locations;
create policy locations_write on inventory_locations for all to authenticated
  using (has_perm(organization_id, 'inventory', 'edit')) with check (has_perm(organization_id, 'inventory', 'edit'));

drop policy inv_txn_read on inventory_transactions;
create policy inv_txn_read on inventory_transactions for select to authenticated
  using (has_perm(organization_id, 'inventory', 'view'));
drop policy inv_txn_insert on inventory_transactions;
create policy inv_txn_insert on inventory_transactions for insert to authenticated
  with check (
    has_perm(organization_id, 'inventory', 'edit')
    -- "xuất dùng" khi ghi việc là việc hằng ngày của nhân viên, không phụ thuộc quyền kho
    or (txn_type = 'issue' and has_org_role(organization_id, array['manager', 'worker']::member_role[])));

create or replace view inventory_balances with (security_invoker = true) as
select t.organization_id, t.location_id, t.material_id, m.name as material_name,
       sum(t.quantity_delta) as balance,
       sum(t.quantity_delta) < 0 as is_negative,
       count(*) filter (where t.unit_cost is null and t.txn_type = 'receipt') as receipts_missing_cost
from inventory_transactions t join materials m on m.id = t.material_id
where has_perm(t.organization_id, 'inventory', 'view')
group by t.organization_id, t.location_id, t.material_id, m.name;

-- Chi phí
drop policy expense_read on expense_records;
create policy expense_read on expense_records for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
drop policy expense_insert on expense_records;
create policy expense_insert on expense_records for insert to authenticated with check (has_perm(organization_id, 'expenses', 'edit'));
drop policy expense_update on expense_records;
create policy expense_update on expense_records for update to authenticated
  using (has_perm(organization_id, 'expenses', 'edit')) with check (has_perm(organization_id, 'expenses', 'edit'));

-- Doanh thu
drop policy sales_read on sales_records;
create policy sales_read on sales_records for select to authenticated using (has_perm(organization_id, 'sales', 'view'));
drop policy sales_insert on sales_records;
create policy sales_insert on sales_records for insert to authenticated with check (has_perm(organization_id, 'sales', 'edit'));
drop policy sales_update on sales_records;
create policy sales_update on sales_records for update to authenticated
  using (has_perm(organization_id, 'sales', 'edit')) with check (has_perm(organization_id, 'sales', 'edit'));

-- Thu hoạch (vẫn kèm điều kiện theo vụ như trước)
drop policy harvest_read on harvest_records;
create policy harvest_read on harvest_records for select to authenticated
  using (can_read_cycle(cycle_id) and cycle_has_perm(cycle_id, 'harvest', 'view'));
drop policy harvest_insert on harvest_records;
create policy harvest_insert on harvest_records for insert to authenticated
  with check (can_log_cycle(cycle_id) and created_by = auth.uid() and cycle_has_perm(cycle_id, 'harvest', 'edit'));
drop policy harvest_update on harvest_records;
create policy harvest_update on harvest_records for update to authenticated
  using (can_manage_cycle(cycle_id) and cycle_has_perm(cycle_id, 'harvest', 'edit'))
  with check (can_manage_cycle(cycle_id) and cycle_has_perm(cycle_id, 'harvest', 'edit'));
drop policy harvest_update_own on harvest_records;
create policy harvest_update_own on harvest_records for update to authenticated
  using (created_by = auth.uid() and received_at > now() - interval '24 hours' and can_log_cycle(cycle_id)
         and cycle_has_perm(cycle_id, 'harvest', 'edit'))
  with check (created_by = auth.uid());

-- Tổng kết vụ: theo quyền mục "tổng kết" của chủ vụ (nội dung hàm giữ nguyên như migration 0016, chỉ đổi điều kiện quyền)
create or replace function get_cycle_summary(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid; v_status cycle_status;
  v_cash_nonmat bigint; v_cash_mat bigint; v_mat_manual bigint; v_alloc bigint;
  v_mat_cost bigint; v_miss integer; v_avg integer;
  v_gross numeric; v_loss numeric; v_net numeric; v_sold numeric; v_rev bigint;
  v_total bigint; v_cps numeric;
begin
  select owner_org_id, status into v_owner, v_status from production_cycles where id = p_cycle;
  if v_owner is null or not has_perm(v_owner, 'summary', 'view') then
    raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết chi phí của vụ này.';
  end if;

  select coalesce(sum(amount) filter (where kind = 'cash_paid' and category <> 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'cash_paid' and category = 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'material_used'), 0),
         coalesce(sum(amount) filter (where kind in ('allocated', 'estimated')), 0)
    into v_cash_nonmat, v_cash_mat, v_mat_manual, v_alloc
    from expense_records where cycle_id = p_cycle and voided_at is null;

  select coalesce(sum(cost) filter (where cost_known), 0),
         count(*) filter (where not cost_known)::integer,
         count(*) filter (where cost_from_average)::integer
    into v_mat_cost, v_miss, v_avg
    from inventory_issue_costs where cycle_id = p_cycle;

  select coalesce(sum(quantity), 0), coalesce(sum(coalesce(loss_quantity, 0)), 0)
    into v_gross, v_loss from harvest_records where cycle_id = p_cycle and voided_at is null;
  v_net := v_gross - v_loss;

  select coalesce(sum(quantity), 0), coalesce(sum(amount), 0)
    into v_sold, v_rev from sales_records where cycle_id = p_cycle and voided_at is null;

  v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc;
  v_cps := case when v_net > 0 and v_miss = 0 then round(v_total::numeric / v_net) end;

  return jsonb_build_object(
    'cycle_id', p_cycle,
    'status', v_status,
    'updated_at', now(),
    'cash_paid_other', v_cash_nonmat,
    'cash_paid_material', v_cash_mat,
    'material_used_cost', v_mat_cost,
    'material_used_manual', v_mat_manual,
    'allocated_or_estimated', v_alloc,
    'total_cost', v_total,
    'harvested_gross_qty', v_gross,
    'harvest_loss_qty', v_loss,
    'harvested_net_qty', v_net,
    'sold_qty', v_sold,
    'revenue_recorded', v_rev,
    'cost_per_kg', v_cps,
    'issues_missing_cost', v_miss,
    'issues_cost_from_average', v_avg,
    'has_estimated_cost', v_alloc > 0,
    'missing_harvest', v_gross = 0,
    'missing_revenue', v_rev = 0 and v_sold = 0
  );
end $$;
