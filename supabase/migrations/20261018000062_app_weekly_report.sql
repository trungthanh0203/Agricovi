-- BÁO CÁO TUẦN (G2-7, D80): tóm tắt một tuần (thứ Hai đến Chủ nhật, giờ Việt Nam) cho chủ và quản lý, kèm so sánh tuần trước, số liệu từng ngày
-- và "điểm cần chú ý" tại thời điểm xem. Tính ở máy chủ khi mở (luôn mới, không lưu bản chụp, không cần lịch chạy nền); chỉ ĐỌC.
-- Chỉ chủ và quản lý xem được; mỗi chỉ số kiểm quyền theo mục (D27): chi phí cần xem Chi phí, doanh thu cần xem Doanh thu, thu hoạch cần xem Thu hoạch,
-- kho cần xem Kho; mục nào không có quyền trả null. Phần website chỉ cho người xử lý được website (đọc bảng đơn của website, không sửa).

-- Chỉ số của một khoảng ngày [p_from, p_to]. Hàm NỘI BỘ (không cấp cho người dùng gọi trực tiếp).
create or replace function weekly_metrics(p_org uuid, p_from date, p_to date, c_ok boolean, r_ok boolean, h_ok boolean, l_ok boolean, w_ok boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'logs', (select count(*)::int from activity_logs a where a.organization_id = p_org and a.voided_at is null
              and (a.performed_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to),
    'harvest_kg', case when h_ok then (select coalesce(sum(h.quantity - coalesce(h.loss_quantity, 0)), 0) from harvest_records h
              where h.organization_id = p_org and h.voided_at is null and (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to) end,
    'revenue', case when r_ok then (select coalesce(sum(s.amount), 0) from sales_records s
              where s.organization_id = p_org and s.voided_at is null and s.sold_date between p_from and p_to) end,
    'cost', case when c_ok then (select coalesce(sum(e.amount), 0) from expense_records e
              where e.organization_id = p_org and e.voided_at is null and e.expense_date between p_from and p_to
                and not (e.kind = 'cash_paid' and e.category = 'material')) end,
    'labor_hours', case when l_ok then (select round(coalesce(sum(a.approved_minutes), 0) / 60.0, 1) from attendance_records a
              where a.organization_id = p_org and a.status = 'confirmed' and a.work_date between p_from and p_to) end,
    'collected', case when r_ok then (select coalesce(sum(rc.amount), 0) from sale_receipts rc
              where rc.organization_id = p_org and rc.voided_at is null and rc.received_on between p_from and p_to) end,
    'paid_out', case when c_ok then (select coalesce(sum(bp.amount), 0) from bill_payments bp
              where bp.organization_id = p_org and bp.voided_at is null and bp.paid_on between p_from and p_to) end,
    'web_orders', case when w_ok then (select count(*)::int from web_orders o where o.organization_id = p_org
              and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to) end,
    'web_quotes', case when w_ok then (select count(*)::int from quote_requests q where q.organization_id = p_org
              and (q.created_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to) end);
$$;
revoke execute on function weekly_metrics(uuid, date, date, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;

-- p_week_start: ngày bất kỳ trong tuần cần xem (mặc định: tuần vừa qua). Trả về tuần bắt đầu từ thứ Hai của ngày đó.
create or replace function get_weekly_report(p_org uuid, p_week_start date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := vn_today();
  ws date; we date;
  c_ok boolean := has_perm(p_org, 'expenses', 'view');
  r_ok boolean := has_perm(p_org, 'sales', 'view');
  h_ok boolean := has_perm(p_org, 'harvest', 'view');
  i_ok boolean := has_perm(p_org, 'inventory', 'view');
  w_ok boolean := can_edit_profile(p_org);
  cur jsonb; prev jsonb; daily jsonb; attn jsonb;
begin
  if auth.uid() is null or not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ và quản lý xem được báo cáo tuần.';
  end if;
  ws := date_trunc('week', coalesce(p_week_start, today - 7))::date;
  if ws > date_trunc('week', today)::date then raise exception 'INVALID_DATE: Chưa tới tuần này.'; end if;
  if ws < today - 730 then raise exception 'INVALID_DATE: Chỉ xem được báo cáo tuần trong khoảng 2 năm gần đây.'; end if;
  we := ws + 6;

  cur := weekly_metrics(p_org, ws, we, c_ok, r_ok, h_ok, true, w_ok);
  prev := weekly_metrics(p_org, ws - 7, ws - 1, c_ok, r_ok, h_ok, true, w_ok);

  select jsonb_agg(jsonb_build_object(
      'date', to_char(d, 'YYYY-MM-DD'),
      'logs', (select count(*)::int from activity_logs a where a.organization_id = p_org and a.voided_at is null and (a.performed_at at time zone 'Asia/Ho_Chi_Minh')::date = d::date),
      'cost', case when c_ok then (select coalesce(sum(e.amount), 0) from expense_records e where e.organization_id = p_org and e.voided_at is null and e.expense_date = d::date
                                     and not (e.kind = 'cash_paid' and e.category = 'material')) end,
      'revenue', case when r_ok then (select coalesce(sum(s.amount), 0) from sales_records s where s.organization_id = p_org and s.voided_at is null and s.sold_date = d::date) end,
      'harvest_kg', case when h_ok then (select coalesce(sum(h.quantity - coalesce(h.loss_quantity, 0)), 0) from harvest_records h where h.organization_id = p_org and h.voided_at is null
                                            and (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date = d::date) end) order by d)
    into daily from generate_series(ws, we, interval '1 day') d;

  -- Điểm cần chú ý TẠI THỜI ĐIỂM XEM (không phụ thuộc tuần đang xem)
  attn := jsonb_build_object(
    'overdue_payables', case when c_ok then (select jsonb_build_object('count', count(*)::int, 'amount', coalesce(sum(x.rest), 0))
        from (select b.total_amount - coalesce((select sum(bp.amount) from bill_payments bp where bp.bill_id = b.id and bp.voided_at is null), 0) as rest
                from purchase_bills b where b.organization_id = p_org and b.voided_at is null and b.due_date is not null and b.due_date < today) x where x.rest > 0) end,
    'overdue_receivables', case when r_ok then (select jsonb_build_object('count', count(*)::int, 'amount', coalesce(sum(x.rest), 0))
        from (select s.amount - coalesce((select sum(rc.amount) from sale_receipts rc where rc.sale_id = s.id and rc.voided_at is null), 0) as rest
                from sales_records s where s.organization_id = p_org and s.voided_at is null and s.partner_id is not null and s.due_date is not null and s.due_date < today) x where x.rest > 0) end,
    'low_stock', case when i_ok then (select count(*)::int from materials m
        where m.organization_id = p_org and m.is_active and m.reorder_threshold is not null
          and coalesce((select sum(b.balance) from inventory_balances b where b.material_id = m.id), 0) <= m.reorder_threshold) end,
    'late_cycles', (select count(distinct c.id)::int from production_cycles c join production_stages st on st.cycle_id = c.id
        where c.owner_org_id = p_org and c.status = 'active' and st.status in ('pending', 'in_progress') and st.planned_end is not null and st.planned_end < today),
    'pending_attendance', (select count(*)::int from attendance_records a where a.organization_id = p_org and a.ended_at is not null and a.status = 'needs_confirmation'),
    'web_orders_waiting', case when w_ok then (select count(*)::int from web_orders o where o.organization_id = p_org and o.status = 'placed') end);

  return jsonb_build_object('week_start', to_char(ws, 'YYYY-MM-DD'), 'week_end', to_char(we, 'YYYY-MM-DD'),
                            'is_current_week', ws = date_trunc('week', today)::date, 'cur', cur, 'prev', prev, 'daily', daily, 'attention', attn,
                            'generated_at', now());
end $$;

revoke execute on function get_weekly_report(uuid, date) from public, anon;
grant execute on function get_weekly_report(uuid, date) to authenticated, service_role;
