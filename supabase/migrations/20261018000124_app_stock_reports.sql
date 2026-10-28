-- Báo cáo kho (K7, bản rút gọn): (1) Nhập–xuất–tồn theo kỳ, (2) Vật tư dùng theo vụ. Tính ở máy chủ, chỉ đọc, cần quyền xem Kho.
-- Số lượng theo đơn vị gốc của vật tư. Không đổi dữ liệu nào.

-- (1) Nhập–xuất–tồn: đầu kỳ = tổng mọi giao dịch trước ngày bắt đầu; trong kỳ tách nhập (receipt), xuất (issue) và điều chỉnh/chuyển kho/trả về (adjustment);
-- cuối kỳ = đầu kỳ + nhập − xuất + điều chỉnh. Chọn một kho thì chỉ tính kho đó (chuyển kho hiện là điều chỉnh tăng/giảm của kho).
create or replace function get_stock_period_report(p_org uuid, p_from date, p_to date, p_location uuid default null)
returns table (material_id uuid, material_name text, unit_name text, material_group text, opening numeric, receipts numeric, issues numeric, adjustments numeric, closing numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'inventory', 'view') then
    raise exception 'FORBIDDEN: Bạn không có quyền xem báo cáo kho.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE: Khoảng ngày không hợp lệ (đến ngày không được trước từ ngày).';
  end if;
  if p_to - p_from > 3660 then raise exception 'INVALID_DATE: Khoảng ngày tối đa 10 năm.'; end if;
  return query
    select m.id, m.name, u.name::text, m.material_group::text,
           coalesce(sum(t.quantity_delta) filter (where t.txn_date < p_from), 0),
           coalesce(sum(t.quantity_delta) filter (where t.txn_date between p_from and p_to and t.txn_type = 'receipt'), 0),
           coalesce(sum(-t.quantity_delta) filter (where t.txn_date between p_from and p_to and t.txn_type = 'issue'), 0),
           coalesce(sum(t.quantity_delta) filter (where t.txn_date between p_from and p_to and t.txn_type = 'adjustment'), 0),
           coalesce(sum(t.quantity_delta) filter (where t.txn_date <= p_to), 0)
      from materials m
      join units_of_measure u on u.id = m.base_unit_id
      left join inventory_transactions t on t.material_id = m.id and t.organization_id = p_org and (p_location is null or t.location_id = p_location)
     where m.organization_id = p_org
     group by m.id, m.name, u.name, m.material_group
    having bool_or(t.id is not null)
     order by m.name;
end $$;
revoke execute on function get_stock_period_report(uuid, date, date, uuid) from public, anon;
grant execute on function get_stock_period_report(uuid, date, date, uuid) to authenticated, service_role;

-- (2) Vật tư dùng theo vụ: lượng ròng (đã xuất cho vụ trừ đã trả về kho) và giá vốn trong kỳ, theo từng vụ và vật tư
create or replace function get_material_use_by_cycle(p_org uuid, p_from date, p_to date)
returns table (cycle_id uuid, cycle_name text, area_name text, material_id uuid, material_name text, unit_name text, quantity numeric, cost bigint, cost_unknown integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'inventory', 'view') then
    raise exception 'FORBIDDEN: Bạn không có quyền xem báo cáo kho.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE: Khoảng ngày không hợp lệ (đến ngày không được trước từ ngày).';
  end if;
  if p_to - p_from > 3660 then raise exception 'INVALID_DATE: Khoảng ngày tối đa 10 năm.'; end if;
  return query
    select c.id, coalesce(nullif(trim(c.name), ''), nullif(trim(c.code), ''), 'Vụ'), a.name::text, m.id, m.name, u.name::text,
           sum(ic.quantity), coalesce(sum(ic.cost) filter (where ic.cost_known), 0)::bigint, (count(*) filter (where not ic.cost_known))::integer
      from inventory_issue_costs ic
      join production_cycles c on c.id = ic.cycle_id and c.owner_org_id = p_org
      join production_areas a on a.id = c.area_id
      join materials m on m.id = ic.material_id
      join units_of_measure u on u.id = m.base_unit_id
     where ic.organization_id = p_org and ic.txn_date between p_from and p_to
     group by c.id, c.name, c.code, a.name, m.id, m.name, u.name
    having sum(ic.quantity) <> 0
     order by 2, m.name;
end $$;
revoke execute on function get_material_use_by_cycle(uuid, date, date) from public, anon;
grant execute on function get_material_use_by_cycle(uuid, date, date) to authenticated, service_role;
