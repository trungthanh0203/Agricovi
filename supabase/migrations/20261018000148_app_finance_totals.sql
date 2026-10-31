-- Đợt 2 (D142): tổng Chi phí / Doanh thu tính ở máy chủ (toàn bộ, không phụ thuộc phần đã tải về máy).
-- Chỉ tính khoản chưa hủy. Lọc theo vụ: p_cycle; p_no_cycle = true là chi phí chung (không gắn vụ).

create or replace function expense_totals(p_org uuid, p_cycle uuid default null, p_no_cycle boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'expenses', 'view') then raise exception 'FORBIDDEN'; end if;
  return (
    select jsonb_build_object(
      'n', count(*),
      'cash_paid', coalesce(sum(amount) filter (where kind = 'cash_paid'), 0),
      'material_used', coalesce(sum(amount) filter (where kind = 'material_used'), 0),
      'allocated_estimated', coalesce(sum(amount) filter (where kind in ('allocated', 'estimated')), 0))
    from expense_records e
    where e.organization_id = p_org and e.voided_at is null
      and (p_cycle is null or e.cycle_id = p_cycle)
      and (not p_no_cycle or e.cycle_id is null));
end $$;

create or replace function sales_totals(p_org uuid, p_cycle uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'sales', 'view') then raise exception 'FORBIDDEN'; end if;
  return (
    select jsonb_build_object('n', count(*), 'quantity', coalesce(sum(quantity), 0), 'amount', coalesce(sum(amount), 0))
    from sales_records s
    where s.organization_id = p_org and s.voided_at is null and (p_cycle is null or s.cycle_id = p_cycle));
end $$;

revoke execute on function expense_totals(uuid, uuid, boolean), sales_totals(uuid, uuid) from public, anon;
grant execute on function expense_totals(uuid, uuid, boolean), sales_totals(uuid, uuid) to authenticated;
