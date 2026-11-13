-- Thống kê tổng hợp: thêm ô Khách hàng (sau Nhà cung ứng), kiểm quyền xem doanh thu như mục Doanh thu.
create or replace function org_stats_summary(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner_ok boolean; mgr boolean; exp_ok boolean; sales_ok boolean; harv_ok boolean; inv_ok boolean; web_ok boolean; s subscriptions; pname text;
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  owner_ok := has_org_role(p_org, array['owner']::member_role[]);
  mgr := has_org_role(p_org, array['owner', 'manager']::member_role[]);
  exp_ok := has_perm(p_org, 'expenses', 'view');
  sales_ok := has_perm(p_org, 'sales', 'view');
  harv_ok := has_perm(p_org, 'harvest', 'view') or has_perm(p_org, 'summary', 'view');
  inv_ok := has_perm(p_org, 'inventory', 'view');
  web_ok := can_edit_profile(p_org);
  select * into s from subscriptions where organization_id = p_org order by period_end desc limit 1;
  if s.id is not null then select t.name into pname from plan_tiers t where t.id = s.plan_tier_id; end if;
  return jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type) from organizations o where o.id = p_org),
    'plans', case when owner_ok then jsonb_build_object('count', (select count(*) from subscriptions where organization_id = p_org and status <> 'trial'),
                      'current', pname, 'status', org_sub_status(p_org), 'period_end', s.period_end) end,
    'areas', (select count(*) from production_areas where organization_id = p_org and parent_id is null),
    'cells', (select count(*) from production_areas where organization_id = p_org and parent_id is not null),
    'warehouses', case when inv_ok then (select count(*) from inventory_locations where organization_id = p_org) end,
    'materials', case when inv_ok then (select count(*) from materials where organization_id = p_org) end,
    'suppliers', case when exp_ok then (select count(*) from partners where organization_id = p_org and is_supplier) end,
    'customers', case when sales_ok then (select count(*) from partners where organization_id = p_org and is_customer) end,
    'staff', case when mgr then (select count(*) from worker_profiles where organization_id = p_org) end,
    'templates', (select count(*) from cycle_templates where organization_id = p_org),
    'cycles_active', (select count(*) from production_cycles c where c.owner_org_id = p_org and c.status = 'active' and can_read_cycle(c.id)),
    'cycles_preparing', (select count(*) from production_cycles c where c.owner_org_id = p_org and c.status = 'preparing' and can_read_cycle(c.id)),
    'cycles_paused', (select count(*) from production_cycles c where c.owner_org_id = p_org and c.status = 'paused' and can_read_cycle(c.id)),
    'cycles_ended', (select count(*) from production_cycles c where c.owner_org_id = p_org and c.status = 'ended' and can_read_cycle(c.id)),
    'expenses', case when exp_ok then (select count(*) from expense_records where organization_id = p_org and voided_at is null) end,
    'harvests', case when harv_ok then (select count(*) from harvest_records where organization_id = p_org and voided_at is null) end,
    'sales', case when sales_ok then (select count(*) from sales_records where organization_id = p_org and voided_at is null) end,
    'public_cycles', case when web_ok then (select count(*) from public_cycles where organization_id = p_org and is_visible) end,
    'web_orders', case when web_ok then (select count(*) from web_orders where organization_id = p_org) end);
end $$;
revoke execute on function org_stats_summary(uuid) from public, anon;
grant execute on function org_stats_summary(uuid) to authenticated, service_role;

create or replace function org_stats_items(p_org uuid, p_kind text, p_sort integer default 1, p_desc boolean default false, p_limit integer default 30, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o text := quote_literal(p_org::text) || '::uuid'; base text; n integer; lim integer := greatest(1, least(coalesce(p_limit, 30), 100)); off integer := greatest(0, coalesce(p_offset, 0));
  owner_ok boolean; mgr boolean; exp_ok boolean; sales_ok boolean; harv_ok boolean; inv_ok boolean; web_ok boolean; cols text; total bigint; rows jsonb; st text;
  cyc text := 'coalesce(nullif(c.name, ''''), c.code, ct.name)';
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  owner_ok := has_org_role(p_org, array['owner']::member_role[]);
  mgr := has_org_role(p_org, array['owner', 'manager']::member_role[]);
  exp_ok := has_perm(p_org, 'expenses', 'view');
  sales_ok := has_perm(p_org, 'sales', 'view');
  harv_ok := has_perm(p_org, 'harvest', 'view') or has_perm(p_org, 'summary', 'view');
  inv_ok := has_perm(p_org, 'inventory', 'view');
  web_ok := can_edit_profile(p_org);

  if p_kind = 'plans' then
    if not owner_ok then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem được các gói đã mua.'; end if; n := 6;
    base := 'select t.name c1, s.status::text c2, s.period_start c3, s.period_end c4, s.max_cycles c5, s.price_per_quarter c6 from subscriptions s join plan_tiers t on t.id = s.plan_tier_id where s.organization_id = ' || o;
  elsif p_kind = 'areas' then
    n := 6;
    base := 'select a.name c1, a.kind c2, case when a.area_unit = ''ha'' then a.area_size * 10000 else a.area_size end c3, a.is_active c4, (select count(*) from production_areas k where k.parent_id = a.id) c5, a.created_at c6 from production_areas a where a.organization_id = ' || o || ' and a.parent_id is null';
  elsif p_kind = 'cells' then
    n := 6;
    base := 'select a.name c1, p.name c2, a.kind c3, case when a.area_unit = ''ha'' then a.area_size * 10000 else a.area_size end c4, a.is_active c5, (select count(*) from production_cycles c where c.area_id = a.id and c.status in (''preparing'', ''active'', ''paused'')) c6 from production_areas a join production_areas p on p.id = a.parent_id where a.organization_id = ' || o;
  elsif p_kind = 'warehouses' then
    if not inv_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem kho.'; end if; n := 3;
    base := 'select l.name c1, l.is_active c2, l.created_at c3 from inventory_locations l where l.organization_id = ' || o;
  elsif p_kind = 'materials' then
    if not inv_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem vật tư.'; end if; n := 5;
    base := 'select m.name c1, m.material_group c2, u.name c3, m.is_active c4, m.created_at c5 from materials m left join units_of_measure u on u.id = m.base_unit_id where m.organization_id = ' || o;
  elsif p_kind = 'suppliers' then
    if not exp_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem nhà cung ứng.'; end if; n := 6;
    base := 'select p.name c1, p.phone c2, p.province c3, p.ward c4, p.goods c5, p.is_active c6 from partners p where p.organization_id = ' || o || ' and p.is_supplier';
  elsif p_kind = 'customers' then
    if not sales_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem khách hàng.'; end if; n := 5;
    base := 'select p.name c1, p.phone c2, p.province c3, p.is_active c4, p.created_at c5 from partners p where p.organization_id = ' || o || ' and p.is_customer';
  elsif p_kind = 'staff' then
    if not mgr then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý xem được nhân sự.'; end if; n := 4;
    base := 'select w.full_name c1, w.status::text c2, w.user_id is not null c3, w.created_at c4 from worker_profiles w where w.organization_id = ' || o;
  elsif p_kind = 'templates' then
    n := 6;
    base := 'select t.name c1, ct.name c2, t.version c3, t.is_active c4, (select count(*) from template_stages s where s.template_id = t.id) c5, t.created_at c6 from cycle_templates t join crop_types ct on ct.id = t.crop_type_id where t.organization_id = ' || o;
  elsif p_kind in ('cycles_active', 'cycles_preparing', 'cycles_paused', 'cycles_ended') then
    st := substr(p_kind, 8); n := 8;
    base := 'select ' || cyc || ' c1, ct.name c2, a.name c3, c.start_date c4, c.expected_end_date c5, c.planted_area_m2 c6, c.plant_count c7, c.cycle_mode c8 from production_cycles c join crop_types ct on ct.id = c.crop_type_id join production_areas a on a.id = c.area_id where c.owner_org_id = ' || o || ' and c.status = ' || quote_literal(st) || ' and can_read_cycle(c.id)';
  elsif p_kind = 'expenses' then
    if not exp_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem chi phí.'; end if; n := 6;
    base := 'select e.expense_date c1, ' || cyc || ' c2, e.category::text c3, e.kind::text c4, e.amount c5, e.voided_at is not null c6 from expense_records e left join production_cycles c on c.id = e.cycle_id left join crop_types ct on ct.id = c.crop_type_id where e.voided_at is null and e.organization_id = ' || o;
  elsif p_kind = 'harvests' then
    if not harv_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem thu hoạch.'; end if; n := 6;
    base := 'select (h.harvested_at at time zone ''Asia/Ho_Chi_Minh'')::date c1, ' || cyc || ' c2, h.grade c3, h.quantity c4, h.loss_quantity c5, h.voided_at is not null c6 from harvest_records h join production_cycles c on c.id = h.cycle_id join crop_types ct on ct.id = c.crop_type_id where h.voided_at is null and h.organization_id = ' || o;
  elsif p_kind = 'sales' then
    if not sales_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem doanh thu.'; end if; n := 5;
    base := 'select s.sold_date c1, ' || cyc || ' c2, s.quantity c3, s.amount c4, s.voided_at is not null c5 from sales_records s join production_cycles c on c.id = s.cycle_id join crop_types ct on ct.id = c.crop_type_id where s.voided_at is null and s.organization_id = ' || o;
  elsif p_kind = 'public_cycles' then
    if not web_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem hồ sơ website.'; end if; n := 4;
    base := 'select p.code c1, ' || cyc || ' c2, p.is_visible c3, p.published_at c4 from public_cycles p join production_cycles c on c.id = p.cycle_id join crop_types ct on ct.id = c.crop_type_id where p.organization_id = ' || o;
  elsif p_kind = 'web_orders' then
    if not web_ok then raise exception 'FORBIDDEN: Bạn không có quyền xem đơn từ website.'; end if; n := 5;
    base := 'select w.code c1, w.status c2, w.payment_status c3, w.created_at c4, order_total(w.id) c5 from web_orders w where w.organization_id = ' || o;
  else
    raise exception 'INVALID_KIND: Mục không hợp lệ.';
  end if;

  if p_sort is null or p_sort < 1 or p_sort > n then p_sort := 1; end if;
  select string_agg('c' || i, ', ' order by i) into cols from generate_series(1, n) i;
  execute 'select count(*) from (' || base || ') x' into total;
  execute 'select coalesce(jsonb_agg(jsonb_build_array(' || cols || ')), ''[]''::jsonb) from (select * from (' || base || ') x order by c' || p_sort || case when coalesce(p_desc, false) then ' desc' else ' asc' end || ' nulls last, c1 asc limit ' || lim || ' offset ' || off || ') y' into rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;
revoke execute on function org_stats_items(uuid, text, integer, boolean, integer, integer) from public, anon;
grant execute on function org_stats_items(uuid, text, integer, boolean, integer, integer) to authenticated, service_role;
