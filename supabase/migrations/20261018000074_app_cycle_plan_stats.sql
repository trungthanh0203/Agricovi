-- D93: KẾ HOẠCH VÀ SỐ LIỆU TÓM TẮT CỦA VỤ. Mỗi vụ có thể đặt sản lượng dự kiến và ngân sách dự kiến; danh sách mùa vụ hiện dòng thống kê
-- (chi phí, thu hoạch, doanh thu, lãi/lỗ, tiến độ, giờ công, phải thu...). Tính ở máy chủ cho cả danh sách một lần, phần TIỀN theo quyền "Tổng kết vụ",
-- thu hoạch theo quyền Thu hoạch, phần công và tiến độ chỉ cho chủ và quản lý.

alter table production_cycles
  add column target_yield_kg numeric check (target_yield_kg is null or target_yield_kg >= 0),
  add column budget_amount numeric check (budget_amount is null or budget_amount >= 0);

-- Đặt/đổi kế hoạch của vụ (người quản lý vụ); null = bỏ kế hoạch
create or replace function set_cycle_plan(p_cycle uuid, p_target_yield numeric, p_budget numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền đặt kế hoạch cho vụ này.';
  end if;
  if (p_target_yield is not null and p_target_yield < 0) or (p_budget is not null and p_budget < 0) then
    raise exception 'INVALID_AMOUNT: Sản lượng và ngân sách dự kiến không được âm.';
  end if;
  update production_cycles set target_yield_kg = p_target_yield, budget_amount = p_budget where id = p_cycle;
end $$;

-- Số liệu tóm tắt của các vụ do cơ sở sở hữu (một lần cho cả danh sách)
create or replace function get_cycles_stats(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record; res jsonb := '[]'::jsonb; sm jsonb; today date := vn_today();
  money_ok boolean; harvest_ok boolean; mgr boolean;
  v_gross numeric; v_loss numeric; v_net numeric; v_sold numeric; v_rev numeric; v_total numeric; v_mat numeric; v_lab numeric; v_oth numeric;
  v_recv numeric; v_cps numeric; v_profit numeric; v_hours numeric; v_workers integer; v_logs integer; v_delay integer; v_mins numeric;
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  money_ok := has_perm(p_org, 'summary', 'view');
  harvest_ok := has_perm(p_org, 'harvest', 'view') or money_ok;
  mgr := has_org_role(p_org, array['owner', 'manager']::member_role[]);
  for c in select * from production_cycles pc where pc.owner_org_id = p_org and can_read_cycle(pc.id) order by pc.created_at loop
    sm := case when money_ok then get_cycle_summary(c.id) end;
    v_gross := null; v_loss := null; v_net := null; v_sold := null; v_rev := null; v_total := null; v_mat := null; v_lab := null; v_oth := null;
    v_recv := null; v_cps := null; v_profit := null; v_hours := null; v_workers := null; v_logs := null; v_delay := null;
    if harvest_ok then
      select coalesce(sum(quantity), 0), coalesce(sum(coalesce(loss_quantity, 0)), 0) into v_gross, v_loss from harvest_records where cycle_id = c.id and voided_at is null;
      v_net := v_gross - v_loss;
    end if;
    if sm is not null then
      v_total := (sm->>'total_cost')::numeric;
      v_mat := coalesce((sm->>'material_used_cost')::numeric, 0) + coalesce((sm->>'material_used_manual')::numeric, 0);
      v_lab := coalesce((sm->>'labor_cost')::numeric, 0) + coalesce((sm->>'labor_estimated')::numeric, 0);
      v_oth := v_total - v_mat - v_lab;
      v_sold := (sm->>'sold_qty')::numeric;
      v_rev := (sm->>'revenue_recorded')::numeric;
      v_cps := (sm->>'cost_per_kg')::numeric;
      v_profit := v_rev - v_total;
      select coalesce(sum(s.amount - coalesce((select sum(rc.amount) from sale_receipts rc where rc.sale_id = s.id and rc.voided_at is null), 0)), 0) into v_recv
        from sales_records s where s.cycle_id = c.id and s.voided_at is null and s.partner_id is not null;
      v_recv := greatest(v_recv, 0);
    end if;
    if mgr then
      select coalesce(sum(a.approved_minutes), 0) / 60.0, count(distinct a.worker_id) into v_hours, v_workers
        from attendance_records a where a.cycle_id = c.id and a.status = 'confirmed';
      select count(*)::integer into v_logs from activity_logs l where l.cycle_id = c.id and l.voided_at is null;
      select coalesce(max(today - st.planned_end), 0)::integer into v_delay from production_stages st
       where st.cycle_id = c.id and st.status in ('pending', 'in_progress') and st.planned_end is not null and st.planned_end < today and c.status = 'active';
    end if;
    res := res || jsonb_build_object(
      'cycle_id', c.id, 'status', c.status, 'start_date', c.start_date, 'expected_end_date', c.expected_end_date,
      'target_yield_kg', c.target_yield_kg, 'budget_amount', case when money_ok then c.budget_amount end,
      'days_elapsed', case when mgr and c.start_date is not null then greatest(0, least(today, coalesce(c.expected_end_date, today)) - c.start_date + 1) end,
      'days_planned', case when mgr and c.start_date is not null and c.expected_end_date is not null then c.expected_end_date - c.start_date + 1 end,
      'delay_days', v_delay, 'labor_hours', round(v_hours, 1), 'workers', v_workers, 'logs', v_logs,
      'harvest_net', v_net, 'harvest_gross', v_gross, 'harvest_loss', v_loss,
      'cost_total', v_total, 'cost_material', v_mat, 'cost_labor', v_lab, 'cost_other', v_oth,
      'revenue', v_rev, 'profit', v_profit, 'sold', v_sold, 'unsold', case when v_net is not null and v_sold is not null then v_net - v_sold end,
      'avg_price', case when v_sold > 0 then round(v_rev / v_sold) end, 'cost_per_kg', v_cps,
      'profit_per_kg', case when v_net > 0 and v_profit is not null then round(v_profit / v_net) end, 'receivable', v_recv,
      'missing_cost', case when sm is not null then coalesce((sm->>'issues_missing_cost')::integer, 0) > 0 end,
      'has_estimate', case when sm is not null then (sm->>'has_estimated_cost')::boolean end,
      'missing_harvest', case when sm is not null then (sm->>'missing_harvest')::boolean end,
      'missing_revenue', case when sm is not null then (sm->>'missing_revenue')::boolean end);
  end loop;
  return jsonb_build_object('generated_at', now(), 'can_money', money_ok, 'can_ops', mgr, 'cycles', res);
end $$;

revoke execute on function set_cycle_plan(uuid, numeric, numeric), get_cycles_stats(uuid) from public, anon;
grant execute on function set_cycle_plan(uuid, numeric, numeric), get_cycles_stats(uuid) to authenticated, service_role;
