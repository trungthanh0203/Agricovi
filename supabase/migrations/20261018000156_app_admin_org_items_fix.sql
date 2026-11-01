-- Sửa admin_org_items: bảng public_cycles dùng cột published_at (không có created_at).
create or replace function admin_org_items(p_org uuid, p_kind text, p_limit integer default 300) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim integer := greatest(1, least(coalesce(p_limit, 300), 1000)); res jsonb;
begin
  perform admin_guard();
  if not exists (select 1 from organizations where id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy cơ sở.'; end if;

  if p_kind = 'plan' then
    select coalesce(jsonb_agg(jsonb_build_array(t.name, s.status, s.period_start, s.period_end, s.max_cycles) order by s.period_end desc), '[]') into res
      from subscriptions s join plan_tiers t on t.id = s.plan_tier_id where s.organization_id = p_org;
  elsif p_kind = 'models' or p_kind = 'cycles' then
    select coalesce(jsonb_agg(r.row order by r.sd desc nulls last), '[]') into res from (
      select c.start_date sd, jsonb_build_array(coalesce(c.name, c.code, ct.name), ct.name, c.status, coalesce(c.mgmt_model, o.mgmt_model), c.start_date) row
        from production_cycles c join crop_types ct on ct.id = c.crop_type_id join organizations o on o.id = c.owner_org_id
       where c.owner_org_id = p_org limit lim) r;
  elsif p_kind = 'areas' or p_kind = 'cells' then
    select coalesce(jsonb_agg(r.row order by r.nm), '[]') into res from (
      select a.name nm, jsonb_build_array(a.name, pa.name, a.kind, a.area_size, a.area_unit, a.is_active) row
        from production_areas a left join production_areas pa on pa.id = a.parent_id
       where a.organization_id = p_org and ((p_kind = 'areas' and a.parent_id is null) or (p_kind = 'cells' and a.parent_id is not null)) limit lim) r;
  elsif p_kind = 'warehouses' then
    select coalesce(jsonb_agg(jsonb_build_array(l.name, l.is_active, l.created_at) order by l.name), '[]') into res
      from inventory_locations l where l.organization_id = p_org;
  elsif p_kind = 'staff' then
    select coalesce(jsonb_agg(jsonb_build_array(w.full_name, w.status, w.user_id is not null, w.created_at) order by w.full_name), '[]') into res
      from worker_profiles w where w.organization_id = p_org;
  elsif p_kind = 'templates' then
    select coalesce(jsonb_agg(jsonb_build_array(t.name, ct.name, t.version, t.is_active, t.created_at) order by t.name), '[]') into res
      from cycle_templates t join crop_types ct on ct.id = t.crop_type_id where t.organization_id = p_org;
  elsif p_kind = 'expenses' then
    select coalesce(jsonb_agg(r.row order by r.d desc), '[]') into res from (
      select e.expense_date d, jsonb_build_array(e.expense_date, coalesce(c.name, c.code, ct.name), e.category, e.kind, e.voided_at is not null) row
        from expense_records e left join production_cycles c on c.id = e.cycle_id left join crop_types ct on ct.id = c.crop_type_id
       where e.organization_id = p_org order by e.expense_date desc limit lim) r;
  elsif p_kind = 'harvests' then
    select coalesce(jsonb_agg(r.row order by r.d desc), '[]') into res from (
      select h.harvested_at d, jsonb_build_array(h.harvested_at, coalesce(c.name, c.code, ct.name), h.grade, h.source, h.voided_at is not null) row
        from harvest_records h join production_cycles c on c.id = h.cycle_id join crop_types ct on ct.id = c.crop_type_id
       where h.organization_id = p_org order by h.harvested_at desc limit lim) r;
  elsif p_kind = 'sales' then
    select coalesce(jsonb_agg(r.row order by r.d desc), '[]') into res from (
      select s.sold_date d, jsonb_build_array(s.sold_date, coalesce(c.name, c.code, ct.name), s.source, s.voided_at is not null) row
        from sales_records s join production_cycles c on c.id = s.cycle_id join crop_types ct on ct.id = c.crop_type_id
       where s.organization_id = p_org order by s.sold_date desc limit lim) r;
  elsif p_kind = 'public_cycles' then
    select coalesce(jsonb_agg(jsonb_build_array(p.code, coalesce(c.name, c.code, ct.name), p.is_visible, p.published_at) order by p.published_at desc), '[]') into res
      from public_cycles p join production_cycles c on c.id = p.cycle_id join crop_types ct on ct.id = c.crop_type_id where p.organization_id = p_org;
  elsif p_kind = 'web_orders' then
    select coalesce(jsonb_agg(jsonb_build_array(w.code, w.status, w.payment_status, w.created_at) order by w.created_at desc), '[]') into res
      from web_orders w where w.organization_id = p_org;
  else
    raise exception 'INVALID_KIND: Mục không hợp lệ.';
  end if;
  return res;
end $$;

revoke execute on function admin_org_items(uuid, text, integer) from public, anon;
grant execute on function admin_org_items(uuid, text, integer) to authenticated, service_role;
