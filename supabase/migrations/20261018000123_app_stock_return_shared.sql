-- Quản lý kho: (K3) TRẢ VẬT TƯ VỀ KHO từ một vụ và (K2) XUẤT DÙNG CHUNG CHIA CHO NHIỀU VỤ theo diện tích.
--
-- K3: giao dịch 'adjustment' tăng tồn có is_return = true và cycle_id. Máy chủ tự tính đơn giá = giá vốn bình quân của vật tư đã xuất cho vụ đó,
--     không cho trả quá lượng đã xuất cho vụ (trừ lượng đã trả). Giá vốn vật tư của vụ (inventory_issue_costs) trừ đi phần trả; cám trả về trừ khỏi cám của FCR.
-- K2: issue_shared_to_cycles: một lần xuất, chia thành một giao dịch "xuất cho vụ" cho từng vụ chọn, theo diện tích (diện tích trồng/nuôi của vụ,
--     không có thì diện tích phân khu; thiếu diện tích ở bất kỳ vụ nào thì chia đều). Phần dư làm tròn dồn vào vụ cuối.

alter table inventory_transactions
  add column is_return boolean not null default false,
  add constraint inv_return_shape check (not is_return or (txn_type = 'adjustment' and quantity_delta > 0 and cycle_id is not null
    and reverses_txn_id is null and activity_log_id is null and transfer_id is null and issue_kind is null));
create index on inventory_transactions (cycle_id) where is_return;

create or replace function inventory_return_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare c production_cycles; issued numeric; returned numeric; avg_cost numeric;
begin
  if not new.is_return then return new; end if;
  if auth.uid() is not null and not has_perm(new.organization_id, 'inventory', 'edit') then
    raise exception 'FORBIDDEN: Chỉ người có quyền sửa Kho mới trả vật tư về kho được.';
  end if;
  select * into c from production_cycles where id = new.cycle_id;
  if c.id is null or c.owner_org_id <> new.organization_id then raise exception 'INVALID_CYCLE: Vụ không thuộc cơ sở này.'; end if;
  if c.status in ('ended', 'cancelled') then raise exception 'CYCLE_CLOSED: Vụ đã kết thúc hoặc đã hủy nên không trả vật tư về kho được.'; end if;
  select coalesce(sum(-t.quantity_delta), 0) into issued from inventory_transactions t
   where t.cycle_id = new.cycle_id and t.material_id = new.material_id and t.txn_type = 'issue'
     and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);
  select coalesce(sum(t.quantity_delta), 0) into returned from inventory_transactions t
   where t.cycle_id = new.cycle_id and t.material_id = new.material_id and t.is_return;
  if new.quantity_delta > issued - returned then
    raise exception 'INVALID_QTY: Chỉ trả được tối đa % (đã xuất cho vụ % và đã trả %).', issued - returned, issued, returned;
  end if;
  select sum(ic.cost) / nullif(sum(ic.quantity), 0) into avg_cost from inventory_issue_costs ic
   where ic.cycle_id = new.cycle_id and ic.material_id = new.material_id and ic.cost_known and ic.quantity > 0;
  new.unit_cost := avg_cost;  -- đơn giá do máy chủ tính, bỏ giá client gửi
  if length(trim(coalesce(new.reason, ''))) < 3 then
    new.reason := 'Trả vật tư về kho từ vụ ' || coalesce(nullif(trim(c.name), ''), nullif(trim(c.code), ''), 'đang chạy');
  end if;
  return new;
end $$;
create trigger inventory_return_prepare_ins before insert on inventory_transactions
  for each row execute function inventory_return_prepare();
revoke execute on function inventory_return_prepare() from public, anon;

-- Giá vốn vật tư theo vụ: các dòng xuất (như cũ) + các dòng trả (số âm)
create or replace view inventory_issue_costs with (security_invoker = true) as
select t.id as txn_id, t.organization_id, t.material_id, t.cycle_id, t.activity_log_id, t.txn_date,
       -t.quantity_delta as quantity,
       coalesce(t.unit_cost, a.avg_cost) as unit_cost_used,
       coalesce(t.unit_cost, a.avg_cost) is not null as cost_known,
       (t.unit_cost is null and a.avg_cost is not null) as cost_from_average,
       round(-t.quantity_delta * coalesce(t.unit_cost, a.avg_cost))::bigint as cost
from inventory_transactions t
left join lateral (
  select sum(r.quantity_delta * r.unit_cost) / nullif(sum(r.quantity_delta), 0) as avg_cost
  from inventory_transactions r
  where r.organization_id = t.organization_id and r.material_id = t.material_id
    and r.txn_type = 'receipt' and r.unit_cost is not null and r.txn_date <= t.txn_date
) a on true
where t.txn_type = 'issue'
  and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
union all
select t.id, t.organization_id, t.material_id, t.cycle_id, null::uuid, t.txn_date,
       -t.quantity_delta,
       t.unit_cost,
       t.unit_cost is not null,
       false,
       -round(t.quantity_delta * t.unit_cost)::bigint
from inventory_transactions t
where t.is_return
  and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);

-- Tăng trọng/FCR: cám trả về kho trừ khỏi cám đã xuất cho vụ
create or replace function get_cycle_growth(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_weigh jsonb; v_stock jsonb; v_logs jsonb; v_manual jsonb; v_can boolean; v_other boolean := false;
begin
  select owner_org_id into v_org from production_cycles where id = p_cycle;
  if v_org is null or not can_read_cycle(p_cycle) then raise exception 'NOT_FOUND: Không tìm thấy vụ hoặc bạn không có quyền xem.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'pigs', x.pigs, 'avg_kg', x.avg, 'id', x.id, 'manual', x.manual) order by x.d, x.ts), '[]'::jsonb) into v_weigh
    from (
      select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, l.performed_at ts,
             case when l.data->>'pigs' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'pigs')::numeric end pigs,
             case when l.data->>'avg_kg' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'avg_kg')::numeric end avg,
             null::uuid id, false manual
        from activity_logs l join work_types w on w.id = l.work_type_id
       where l.cycle_id = p_cycle and l.voided_at is null and (w.name ilike 'cân heo%' or w.name ilike 'cân mẫu%' or (w.organization_id is null and w.code = 'weighing'))
      union all
      select m.weigh_date, m.created_at, m.head_count::numeric, m.avg_kg, m.id, true
        from cycle_weighings m where m.cycle_id = p_cycle and m.voided_at is null
    ) x
   where x.avg is not null and x.avg > 0;

  select coalesce(jsonb_agg(jsonb_build_object('date', y.d, 'kg', y.kg) order by y.d), '[]'::jsonb) into v_logs
    from (select u.d, sum(u.kg) kg from (
            select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, (l.data->>'feed_kg')::numeric kg
              from activity_logs l
             where l.cycle_id = p_cycle and l.voided_at is null and l.data->>'feed_kg' ~ '^[0-9]+(\.[0-9]+)?$'
            union all
            select f.feed_date, f.kg from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null
          ) u group by u.d) y;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'date', f.feed_date, 'kg', f.kg, 'name', f.feed_name) order by f.feed_date, f.created_at), '[]'::jsonb) into v_manual
    from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null;

  v_can := has_perm(v_org, 'inventory', 'view');
  if v_can then
    select coalesce(jsonb_agg(jsonb_build_object('date', z.d, 'kg', z.kg) order by z.d), '[]'::jsonb), coalesce(bool_or(z.unknown), false) into v_stock, v_other
      from (select t.txn_date d, sum(case when f.factor is null then 0 else -t.quantity_delta * f.factor end) kg, bool_or(f.factor is null) unknown
              from inventory_transactions t
              join materials m on m.id = t.material_id and m.material_group = 'feed'
              join units_of_measure u on u.id = m.base_unit_id
              cross join lateral (select case u.code when 'kg' then 1::numeric when 'g' then 0.001 when 'ton' then 1000::numeric end as factor) f
             where t.cycle_id = p_cycle and (t.txn_type = 'issue' or t.is_return)
               and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
             group by t.txn_date) z;
  else
    v_stock := '[]'::jsonb;
  end if;

  return jsonb_build_object('weighings', v_weigh, 'feed', jsonb_build_object('can_view', v_can, 'stock_by_date', v_stock, 'other_unit', v_other, 'logs_by_date', v_logs, 'manual_entries', v_manual));
end $$;

-- K2: xuất dùng chung chia cho nhiều vụ
create or replace function issue_shared_to_cycles(p_org uuid, p_material uuid, p_location uuid, p_qty numeric, p_date date, p_cycles uuid[], p_note text default null)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  n integer := coalesce(cardinality(p_cycles), 0); ids uuid[]; w numeric[] := '{}'; v numeric; sumw numeric := 0; use_area boolean := true;
  i integer; share numeric; given numeric := 0; c production_cycles; basis text; cnt integer := 0;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: Số lượng phải lớn hơn 0.'; end if;
  if n = 0 then raise exception 'INVALID_CYCLE: Hãy chọn ít nhất một vụ.'; end if;
  select array_agg(distinct x) into ids from unnest(p_cycles) x;
  if cardinality(ids) <> n then raise exception 'INVALID_CYCLE: Danh sách vụ bị trùng.'; end if;
  if not exists (select 1 from materials where id = p_material and organization_id = p_org) then raise exception 'INVALID_MATERIAL: Vật tư không thuộc cơ sở này.'; end if;
  if not exists (select 1 from inventory_locations where id = p_location and organization_id = p_org and is_active) then raise exception 'INVALID_LOCATION: Kho không thuộc cơ sở này hoặc đã dừng.'; end if;
  -- diện tích mỗi vụ (m²): diện tích của vụ, không có thì diện tích phân khu
  for i in 1 .. n loop
    select * into c from production_cycles where id = ids[i];
    if c.id is null or c.owner_org_id <> p_org then raise exception 'INVALID_CYCLE: Vụ không thuộc cơ sở này.'; end if;
    if c.status in ('ended', 'cancelled') then raise exception 'CYCLE_CLOSED: Vụ đã kết thúc hoặc đã hủy.'; end if;
    select coalesce(c.planted_area * case when c.planted_area_unit = 'ha' then 10000 else 1 end,
                    a.area_size * case when a.area_unit = 'ha' then 10000 else 1 end) into v
      from production_areas a where a.id = c.area_id;
    if v is null or v <= 0 then use_area := false; end if;
    w := w || coalesce(v, 0);
    sumw := sumw + coalesce(v, 0);
  end loop;
  if not use_area or sumw <= 0 then
    use_area := false; w := array_fill(1::numeric, array[n]); sumw := n;
  end if;
  basis := case when use_area then 'chia theo diện tích' else 'chia đều' end;
  for i in 1 .. n loop
    share := case when i = n then p_qty - given else round(p_qty * w[i] / sumw, 3) end;
    given := given + share;
    if share <= 0 then continue; end if;
    insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, issue_kind, cycle_id, reason, source)
      values (gen_random_uuid(), p_org, p_location, p_material, 'issue', -share, p_date, 'cycle', ids[i],
              'Dùng chung, ' || basis || coalesce(': ' || nullif(trim(p_note), ''), ''), 'online');
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;
revoke execute on function issue_shared_to_cycles(uuid, uuid, uuid, numeric, date, uuid[], text) from public, anon;
grant execute on function issue_shared_to_cycles(uuid, uuid, uuid, numeric, date, uuid[], text) to authenticated, service_role;
