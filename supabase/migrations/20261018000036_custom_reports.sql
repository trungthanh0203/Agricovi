-- D48 (P6): BÁO CÁO THEO NHU CẦU. Tính trên máy chủ, kiểm quyền theo mục (docs/DESIGN_DASHBOARD.md mục 10, D30).
-- run_report(org, loại, tham số) trả bảng số liệu; báo cáo đã lưu (của tôi hoặc chia sẻ cho cơ sở) chỉ lưu LOẠI + THAM SỐ,
-- khi mở lại luôn chạy mới và kiểm quyền lại (người xem không đủ quyền thì không thấy số).

create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) default auth.uid(),
  name text not null check (length(trim(name)) between 2 and 80),
  report_type text not null check (report_type in ('expenses', 'sales', 'harvest', 'stock', 'labor', 'cycles')),
  params jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index on saved_reports (organization_id);
alter table saved_reports enable row level security;
create policy saved_reports_read on saved_reports for select to authenticated
  using (owner_id = auth.uid() or (shared and is_org_member(organization_id)));
create policy saved_reports_insert on saved_reports for insert to authenticated
  with check (owner_id = auth.uid() and is_org_member(organization_id));
create policy saved_reports_update on saved_reports for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and is_org_member(organization_id));
create policy saved_reports_delete on saved_reports for delete to authenticated
  using (owner_id = auth.uid() or has_org_role(organization_id, array['owner']::member_role[]));

-- Quyền xem từng loại báo cáo (theo mục D27; nhân công theo quản lý/chủ)
create or replace function report_allowed(p_org uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'expenses' then has_perm(p_org, 'expenses', 'view')
    when 'sales'    then has_perm(p_org, 'sales', 'view')
    when 'harvest'  then has_perm(p_org, 'harvest', 'view')
    when 'stock'    then has_perm(p_org, 'inventory', 'view')
    when 'cycles'   then has_perm(p_org, 'summary', 'view')
    when 'labor'    then has_org_role(p_org, array['owner', 'manager']::member_role[])
    else false end;
$$;

create or replace function cycle_label(p_cycle uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(c.name, ''), nullif(c.template_name, ''), 'Vụ ' || to_char(c.created_at, 'DD/MM/YYYY'))
    from production_cycles c where c.id = p_cycle;
$$;

create or replace function run_report(p_org uuid, p_type text, p_params jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f date := coalesce(nullif(p_params ->> 'from', '')::date, current_date - 30);
  t date := coalesce(nullif(p_params ->> 'to', '')::date, current_date);
  cyc uuid := nullif(p_params ->> 'cycle_id', '')::uuid;
  grp text := coalesce(nullif(p_params ->> 'group', ''), 'default');
  cols jsonb; rows jsonb; title text;
begin
  if not report_allowed(p_org, p_type) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem loại báo cáo này.';
  end if;
  if t < f then raise exception 'INVALID_DATE: Ngày kết thúc không thể trước ngày bắt đầu.'; end if;
  if t - f > 800 then raise exception 'INVALID_DATE: Khoảng thời gian tối đa khoảng 2 năm.'; end if;

  if p_type = 'expenses' then
    title := 'Chi phí';
    cols := '[{"key":"label","label":"Nhóm","kind":"text"},{"key":"count","label":"Số khoản","kind":"int","sum":true},{"key":"amount","label":"Số tiền","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'amount', a) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(e.expense_date, 'YYYY-MM') when 'day' then to_char(e.expense_date, 'YYYY-MM-DD')
                      when 'cycle' then coalesce(cycle_label(e.cycle_id), 'Không gắn vụ')
                      when 'kind' then case e.kind when 'cash_paid' then 'Thực chi' when 'material_used' then 'Vật tư dùng' when 'allocated' then 'Phân bổ' else 'Ước tính' end
                      else case e.category when 'material' then 'Vật tư' when 'labor' then 'Nhân công' when 'utility' then 'Điện nước' when 'rent' then 'Thuê mướn'
                                           when 'depreciation' then 'Khấu hao' else 'Khác' end end as g,
             count(*) as n, sum(e.amount) as a
        from expense_records e
       where e.organization_id = p_org and e.voided_at is null and e.expense_date between f and t and (cyc is null or e.cycle_id = cyc)
         and not (e.kind = 'cash_paid' and e.category = 'material') -- tiền mua vật tư không cộng (đã tính khi dùng)
       group by 1) x;

  elsif p_type = 'sales' then
    title := 'Doanh thu bán hàng';
    cols := '[{"key":"label","label":"Nhóm","kind":"text"},{"key":"qty","label":"Số lượng (kg)","kind":"num","sum":true},{"key":"count","label":"Số lần bán","kind":"int","sum":true},{"key":"amount","label":"Doanh thu","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'qty', q, 'count', n, 'amount', a) order by g), '[]') into rows from (
      select case grp when 'day' then to_char(s.sold_date, 'YYYY-MM-DD') when 'cycle' then coalesce(cycle_label(s.cycle_id), '—')
                      else to_char(s.sold_date, 'YYYY-MM') end as g,
             sum(s.quantity) as q, count(*) as n, sum(s.amount) as a
        from sales_records s
       where s.organization_id = p_org and s.voided_at is null and s.sold_date between f and t and (cyc is null or s.cycle_id = cyc)
       group by 1) x;

  elsif p_type = 'harvest' then
    title := 'Thu hoạch';
    cols := '[{"key":"label","label":"Nhóm","kind":"text"},{"key":"gross","label":"Thu (kg)","kind":"num","sum":true},{"key":"loss","label":"Hao hụt (kg)","kind":"num","sum":true},{"key":"net","label":"Sau hao hụt (kg)","kind":"num","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'gross', q, 'loss', l, 'net', q - l) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(h.harvested_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')
                      when 'cycle' then coalesce(cycle_label(h.cycle_id), '—') when 'grade' then coalesce(nullif(h.grade, ''), 'Chưa phân loại')
                      else to_char(h.harvested_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') end as g,
             sum(h.quantity) as q, sum(coalesce(h.loss_quantity, 0)) as l
        from harvest_records h
       where h.organization_id = p_org and h.voided_at is null
         and (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date between f and t and (cyc is null or h.cycle_id = cyc)
       group by 1) x;

  elsif p_type = 'stock' then
    title := 'Nhập, xuất, điều chỉnh vật tư';
    cols := '[{"key":"label","label":"Nhóm","kind":"text"},{"key":"receipt","label":"Nhập","kind":"num","sum":true},{"key":"issue","label":"Xuất dùng","kind":"num","sum":true},{"key":"adjust","label":"Điều chỉnh","kind":"num","sum":true},{"key":"net","label":"Chênh lệch","kind":"num","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'receipt', r, 'issue', i, 'adjust', a, 'net', r + i + a) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(x.txn_date, 'YYYY-MM') when 'location' then coalesce(l.name, '—') else coalesce(m.name, '—') end as g,
             sum(x.quantity_delta) filter (where x.txn_type = 'receipt') as r_,
             sum(x.quantity_delta) filter (where x.txn_type = 'issue') as i_,
             sum(x.quantity_delta) filter (where x.txn_type = 'adjustment') as a_
        from inventory_transactions x
        join materials m on m.id = x.material_id join inventory_locations l on l.id = x.location_id
       where x.organization_id = p_org and x.txn_date between f and t and (cyc is null or x.cycle_id = cyc)
       group by 1) y(g, r_, i_, a_), lateral (select coalesce(y.r_, 0) as r, coalesce(y.i_, 0) as i, coalesce(y.a_, 0) as a) z(r, i, a);

  elsif p_type = 'labor' then
    title := 'Giờ công và tiền công';
    cols := '[{"key":"label","label":"Nhóm","kind":"text"},{"key":"shifts","label":"Số ca","kind":"int","sum":true},{"key":"hours","label":"Giờ công (đã xác nhận)","kind":"num","sum":true},{"key":"pay","label":"Tiền công đã tính","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'shifts', n, 'hours', round(mins / 60.0, 1), 'pay', coalesce(pay, 0)) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(a.work_date, 'YYYY-MM') when 'cycle' then coalesce(cycle_label(a.cycle_id), 'Không gắn vụ')
                      else coalesce(w.full_name, '—') end as g,
             count(*) as n, sum(coalesce(a.approved_minutes, 0)) as mins,
             (select sum(l.amount) from pay_statement_lines l where l.attendance_id = any (array_agg(a.id))) as pay
        from attendance_records a join worker_profiles w on w.id = a.worker_id
       where a.organization_id = p_org and a.status = 'confirmed' and a.work_date between f and t and (cyc is null or a.cycle_id = cyc)
       group by 1) x;

  else -- cycles
    title := 'Tổng hợp theo vụ';
    cols := '[{"key":"label","label":"Vụ","kind":"text"},{"key":"cost","label":"Tổng chi phí","kind":"money","sum":true},{"key":"net","label":"Thu hoạch sau hao hụt (kg)","kind":"num","sum":true},{"key":"revenue","label":"Doanh thu","kind":"money","sum":true},{"key":"cps","label":"Giá thành/kg","kind":"money"}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', cycle_label(c.id), 'cost', (s ->> 'total_cost')::numeric, 'net', (s ->> 'harvested_net_qty')::numeric,
                              'revenue', (s ->> 'revenue_recorded')::numeric, 'cps', (s ->> 'cost_per_kg')::numeric) order by c.created_at desc), '[]') into rows
      from production_cycles c, lateral (select get_cycle_summary(c.id) as s) z
     where c.owner_org_id = p_org and (cyc is null or c.id = cyc) and (c.start_date is null or c.start_date <= t) and coalesce(c.end_date, current_date) >= f;
  end if;

  return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
end $$;

revoke execute on function report_allowed(uuid, text), cycle_label(uuid), run_report(uuid, text, jsonb) from public, anon;
revoke execute on function cycle_label(uuid) from authenticated;
grant execute on function report_allowed(uuid, text), run_report(uuid, text, jsonb) to authenticated, service_role;
