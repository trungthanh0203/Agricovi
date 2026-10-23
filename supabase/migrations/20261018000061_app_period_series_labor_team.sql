-- G2-7 (biểu đồ, D79): (1) SỐ LIỆU THEO THÁNG tính ở máy chủ cho biểu đồ xu hướng ở Trang chủ (thay cho việc cộng 200 bản ghi gần nhất trên máy);
-- (2) báo cáo Giờ công và tiền công thêm cách nhóm THEO PHÒNG / TỔ.
-- Mọi số kiểm quyền theo mục (D27): chi phí cần xem Chi phí, doanh thu cần xem Doanh thu, thu hoạch cần xem Thu hoạch; mục nào không có quyền thì trả null.

-- Chuỗi theo tháng, p_months tháng gần nhất (1..12) tính tới tháng hiện tại (giờ Việt Nam), tháng không có số liệu = 0.
-- Chi phí cộng đúng như báo cáo chi phí: không tính tiền mua vật tư thực chi (đã tính khi dùng), bỏ khoản đã hủy.
create or replace function get_period_series(p_org uuid, p_months integer default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n integer := least(12, greatest(1, coalesce(p_months, 6)));
  m0 date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date;
  first_month date := (m0 - make_interval(months => n - 1))::date;
  c_ok boolean := has_perm(p_org, 'expenses', 'view');
  r_ok boolean := has_perm(p_org, 'sales', 'view');
  h_ok boolean := has_perm(p_org, 'harvest', 'view');
  months jsonb; cost jsonb; rev jsonb; hv jsonb;
begin
  if auth.uid() is null or not (c_ok or r_ok or h_ok) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem số liệu theo tháng.';
  end if;
  select jsonb_agg(to_char(g, 'YYYY-MM') order by g) into months from generate_series(first_month, m0, interval '1 month') g;
  if c_ok then
    select jsonb_agg(coalesce(x.a, 0) order by g) into cost from generate_series(first_month, m0, interval '1 month') g
      left join (select date_trunc('month', e.expense_date)::date as mo, sum(e.amount) as a from expense_records e
                  where e.organization_id = p_org and e.voided_at is null and e.expense_date >= first_month
                    and not (e.kind = 'cash_paid' and e.category = 'material') group by 1) x on x.mo = g::date;
  end if;
  if r_ok then
    select jsonb_agg(coalesce(x.a, 0) order by g) into rev from generate_series(first_month, m0, interval '1 month') g
      left join (select date_trunc('month', s.sold_date)::date as mo, sum(s.amount) as a from sales_records s
                  where s.organization_id = p_org and s.voided_at is null and s.sold_date >= first_month group by 1) x on x.mo = g::date;
  end if;
  if h_ok then
    select jsonb_agg(coalesce(x.a, 0) order by g) into hv from generate_series(first_month, m0, interval '1 month') g
      left join (select date_trunc('month', (h.harvested_at at time zone 'Asia/Ho_Chi_Minh'))::date as mo, sum(h.quantity - coalesce(h.loss_quantity, 0)) as a
                   from harvest_records h
                  where h.organization_id = p_org and h.voided_at is null and (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date >= first_month group by 1) x on x.mo = g::date;
  end if;
  return jsonb_build_object('months', months, 'cost', cost, 'revenue', rev, 'harvest_kg', hv, 'generated_at', now());
end $$;

revoke execute on function get_period_series(uuid, integer) from public, anon;
grant execute on function get_period_series(uuid, integer) to authenticated, service_role;

-- run_report: giữ nguyên các nhánh của migration 0057 (purchases, customers) và thêm nhánh labor nhóm 'team'; các loại khác chuyển cho hàm cũ
create or replace function run_report(p_org uuid, p_type text, p_params jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f date := coalesce(nullif(p_params ->> 'from', '')::date, current_date - 30);
  t date := coalesce(nullif(p_params ->> 'to', '')::date, current_date);
  cyc uuid := nullif(p_params ->> 'cycle_id', '')::uuid;
  grp text := coalesce(nullif(p_params ->> 'group', ''), 'partner');
  cols jsonb; rows jsonb; title text;
begin
  if not (p_type in ('purchases', 'customers') or (p_type = 'labor' and grp = 'team')) then
    return run_report_base(p_org, p_type, p_params);
  end if;
  if not report_allowed(p_org, p_type) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem loại báo cáo này.';
  end if;
  if t < f then raise exception 'INVALID_DATE: Ngày kết thúc không thể trước ngày bắt đầu.'; end if;
  if t - f > 800 then raise exception 'INVALID_DATE: Khoảng thời gian tối đa khoảng 2 năm.'; end if;

  if p_type = 'labor' then
    title := 'Giờ công và tiền công theo phòng / tổ';
    cols := '[{"key":"label","label":"Phòng / Tổ","kind":"text"},{"key":"shifts","label":"Số ca","kind":"int","sum":true},{"key":"hours","label":"Giờ công (đã xác nhận)","kind":"num","sum":true},{"key":"pay","label":"Tiền công","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'shifts', n, 'hours', round(mins / 60.0, 1), 'pay', coalesce(pay, 0)) order by g), '[]') into rows from (
      select coalesce(tm.name, 'Chưa có tổ') as g, count(*) as n, sum(coalesce(a.approved_minutes, 0)) as mins,
             (select sum(l.amount) from pay_statement_lines l where l.attendance_id = any (array_agg(a.id))) as pay
        from attendance_records a
        left join lateral (select t2.name from worker_team_memberships m2 join worker_teams t2 on t2.id = m2.team_id
                            where m2.worker_id = a.worker_id and m2.valid_from <= a.work_date and (m2.valid_to is null or m2.valid_to >= a.work_date)
                            order by m2.valid_from desc limit 1) tm on true
       where a.organization_id = p_org and a.status = 'confirmed' and a.work_date between f and t and (cyc is null or a.cycle_id = cyc)
       group by 1) x;
    return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
  end if;

  if p_type = 'customers' then
    title := 'Doanh thu theo khách hàng';
    cols := '[{"key":"label","label":"' || case grp when 'month' then 'Tháng' else 'Khách hàng' end || '","kind":"text"},{"key":"count","label":"Số lần bán","kind":"int","sum":true},{"key":"qty","label":"Số lượng (kg)","kind":"num","sum":true},{"key":"amount","label":"Doanh thu","kind":"money","sum":true},{"key":"collected","label":"Đã thu","kind":"money","sum":true},{"key":"owed","label":"Còn phải thu","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'qty', q, 'amount', a, 'collected', c, 'owed', a - c) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(s.sold_date, 'YYYY-MM') else coalesce(pr.name, 'Bán lẻ (không ghi khách)') end as g,
             count(*) as n, sum(s.quantity) as q, sum(s.amount) as a,
             sum(case when s.partner_id is null then s.amount
                      else coalesce((select sum(rc.amount) from sale_receipts rc where rc.sale_id = s.id and rc.voided_at is null), 0) end) as c
        from sales_records s left join partners pr on pr.id = s.partner_id
       where s.organization_id = p_org and s.voided_at is null and s.sold_date between f and t
       group by 1) y;
    return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
  end if;

  -- purchases (giữ nguyên như migration 0056/0057)
  title := 'Mua hàng theo nhà cung ứng';
  if grp = 'material' then
    cols := '[{"key":"label","label":"Vật tư","kind":"text"},{"key":"qty","label":"Số lượng nhập","kind":"num","sum":true},{"key":"amount","label":"Thành tiền","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'qty', q, 'amount', a) order by g), '[]') into rows from (
      select coalesce(m.name, '—') as g, sum(x.quantity_delta) as q, sum(round(x.quantity_delta * coalesce(x.unit_cost, 0))) as a
        from inventory_transactions x
        join purchase_bills b on b.id = x.bill_id and b.voided_at is null
        join materials m on m.id = x.material_id
       where x.organization_id = p_org and x.bill_id is not null and b.bill_date between f and t
       group by 1) y;
  else
    cols := '[{"key":"label","label":"' || case grp when 'month' then 'Tháng' else 'Nhà cung ứng' end || '","kind":"text"},{"key":"count","label":"Số hóa đơn","kind":"int","sum":true},{"key":"total","label":"Tổng tiền","kind":"money","sum":true},{"key":"paid","label":"Đã trả","kind":"money","sum":true},{"key":"owed","label":"Còn nợ","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'total', tot, 'paid', paid, 'owed', tot - paid) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(b.bill_date, 'YYYY-MM') else coalesce(pr.name, '—') end as g,
             count(*) as n, sum(b.total_amount) as tot,
             sum(coalesce((select sum(bp.amount) from bill_payments bp where bp.bill_id = b.id and bp.voided_at is null), 0)) as paid
        from purchase_bills b join partners pr on pr.id = b.partner_id
       where b.organization_id = p_org and b.voided_at is null and b.bill_date between f and t
       group by 1) y;
  end if;
  return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
end $$;

revoke execute on function run_report(uuid, text, jsonb) from public, anon;
grant execute on function run_report(uuid, text, jsonb) to authenticated, service_role;
