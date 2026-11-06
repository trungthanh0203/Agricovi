-- Cây lâu năm (vườn cây) và đàn nuôi liên tục (docs/PLAN_CAY_LAU_NAM_VA_DAN_LIEN_TUC.md, C1–C3, cách A):
--  * production_cycles.cycle_mode: 'batch' (như trước) | 'perennial' (vườn cây) | 'herd' (đàn). Mọi ghi việc/thu hoạch/chi phí/doanh thu vẫn gắn vụ.
--  * KỲ (cycle_periods): khung thời gian chăm sóc và báo cáo (mùa, năm, quý). Mỗi kỳ sao quy trình mẫu thành các việc của kỳ; mỗi lúc chỉ một kỳ đang mở.
--  * Vườn cây: ngày trồng (tuổi cây), chi phí đầu tư vườn cây (is_capital) và khấu hao tính tự động theo năm khấu hao.
--  * Đàn: số đầu theo NHÓM (tồn đầu, nhập, sinh, chuyển nhóm, chết, loại, xuất) và báo cáo biến động đàn.
--  * Tổng kết theo khoảng ngày / theo kỳ.

alter table production_cycles
  add column cycle_mode text not null default 'batch' check (cycle_mode in ('batch', 'perennial', 'herd')),
  add column maturity_years numeric check (maturity_years is null or (maturity_years >= 0 and maturity_years <= 30)),   -- số năm kiến thiết (chưa kinh doanh) của vườn cây
  add column amort_years integer check (amort_years is null or (amort_years between 1 and 60));                         -- số năm khấu hao chi phí đầu tư

create table cycle_periods (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  label text not null check (length(trim(label)) between 1 and 60),
  start_date date not null,
  end_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  template_id uuid references cycle_templates(id) on delete set null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (end_date is null or end_date >= start_date)
);
create index on cycle_periods (cycle_id, start_date);
create unique index cycle_period_one_open on cycle_periods (cycle_id) where status = 'open';
create trigger cycle_periods_org before insert on cycle_periods for each row execute function sync_org_from_cycle();
alter table cycle_periods enable row level security;
create policy cycle_periods_read on cycle_periods for select to authenticated using (can_read_cycle(cycle_id));
revoke insert, update, delete on cycle_periods from authenticated, anon;      -- chỉ ghi qua hàm

alter table production_stages add column period_id uuid references cycle_periods(id) on delete cascade;
create index on production_stages (period_id) where period_id is not null;

alter table expense_records add column is_capital boolean not null default false;   -- chi phí đầu tư vườn cây: không vào lãi lỗ năm mà khấu hao dần

-- Sự kiện số lượng theo nhóm đàn
alter table cycle_count_events
  add column animal_group text check (animal_group is null or length(trim(animal_group)) between 1 and 40),
  add column to_group text check (to_group is null or length(trim(to_group)) between 1 and 40);
alter table cycle_count_events drop constraint cycle_count_events_kind_check;
alter table cycle_count_events add constraint cycle_count_events_kind_check check (kind in ('in', 'dead', 'culled', 'out', 'born', 'move', 'open'));
alter table cycle_count_events add constraint cycle_count_events_move_check
  check ((kind = 'move') = (to_group is not null) and (kind <> 'move' or (animal_group is not null and animal_group <> to_group)));

-- Sao việc từ quy trình vào vụ (0181) có thêm: gắn kỳ, dịch số thứ tự (nhiều kỳ nối nhau), tùy chọn sao mốc an toàn
drop function cycle_instantiate_from_template(uuid, uuid, uuid, date);
create function cycle_instantiate_from_template(p_cycle uuid, p_org uuid, p_template uuid, p_start date, p_period uuid default null, p_seq_offset integer default 0, p_copy_milestones boolean default true) returns integer
language plpgsql security definer set search_path = public as $$
declare total integer := 0; cur integer := 1; st integer; en integer; s record;
begin
  for s in select start_day, duration_days from template_stages where template_id = p_template order by seq loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    total := greatest(total, en);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  if total = 0 then raise exception 'INVALID_TEMPLATE: Quy trình chưa có việc nào.'; end if;

  if p_copy_milestones then
    insert into cycle_milestones (cycle_id, organization_id, title, anchor, offset_days, note)
      select p_cycle, p_org, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = p_template order by m.created_at, m.id;
  end if;

  cur := 1;
  for s in
    select t.*, p.code as p_code, p.name as p_name
      from template_stages t left join template_phases p on p.id = t.phase_id
     where t.template_id = p_template order by t.seq
  loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end,
                                   work_type_id, template_stage_id, duration_days, note, phase_code, phase_name, importance, repeat_every_days, guide, materials, period_id)
      values (p_cycle, p_org, s.name, s.seq + p_seq_offset, p_start + st - 1, p_start + en - 1, s.work_type_id, s.id, s.duration_days, s.note, s.p_code, s.p_name, s.importance, s.repeat_every_days, s.guide, s.materials, p_period);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  return total;
end $$;
revoke execute on function cycle_instantiate_from_template(uuid, uuid, uuid, date, uuid, integer, boolean) from public, anon, authenticated;

-- Tạo vụ có kiểm tra (0179): thêm kiểu, ngày trồng, nhóm đàn, tên kỳ đầu, năm kiến thiết/khấu hao
drop function create_cycle_checked(uuid, uuid, uuid, uuid, date, cycle_status, text, text, numeric, integer, boolean, boolean, uuid, uuid[], date, text, text);
create function create_cycle_checked(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date, p_status cycle_status,
  p_name text, p_variety text, p_area_m2 numeric, p_count integer,
  p_intercrop boolean default false, p_confirm_over boolean default false,
  p_current_tpl uuid default null, p_done_tpl uuid[] default null, p_current_start date default null, p_origin text default null, p_origin_note text default null,
  p_mode text default 'batch', p_planting date default null, p_groups jsonb default null, p_period_label text default null, p_maturity numeric default null, p_amort integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f date := coalesce(p_start, vn_today()); days integer; r jsonb; cap numeric; peak numeric; over boolean := false; g jsonb; gsum integer := 0; period uuid; endd date;
begin
  if exists (select 1 from production_cycles where id = p_id) then return p_id; end if;      -- gọi lặp không tạo trùng
  if coalesce(p_mode, 'batch') not in ('batch', 'perennial', 'herd') then raise exception 'INVALID_MODE: Kiểu vụ không hợp lệ.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID_CYCLE_NAME: Hãy nhập tên (ít nhất 2 ký tự).'; end if;
  if length(trim(coalesce(p_variety, ''))) < 1 then raise exception 'INVALID_VARIETY: Hãy nhập giống (chưa rõ thì ghi "Chưa rõ giống").'; end if;
  if p_area_m2 is null or p_area_m2 <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập diện tích (lớn hơn 0).'; end if;
  if p_count is null or p_count <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số lượng (cây, con…) lớn hơn 0.'; end if;
  if p_mode <> 'batch' and p_current_tpl is not null then raise exception 'INVALID_MODE: Vườn cây và đàn không bắt đầu giữa chừng theo việc; hãy dùng ngày bắt đầu theo dõi.'; end if;
  if p_mode = 'perennial' then
    if p_planting is null or p_planting > vn_today() then raise exception 'INVALID_DATE: Hãy nhập ngày trồng (không ở tương lai).'; end if;
  end if;
  if p_mode = 'herd' then
    if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then raise exception 'INVALID_GROUPS: Hãy nhập số đầu tồn của ít nhất một nhóm.'; end if;
    for g in select * from jsonb_array_elements(p_groups) loop
      if length(trim(coalesce(g ->> 'group', ''))) not between 1 and 40 or coalesce((g ->> 'count')::integer, 0) <= 0 then raise exception 'INVALID_GROUPS: Mỗi nhóm cần tên (tối đa 40 ký tự) và số đầu lớn hơn 0.'; end if;
      gsum := gsum + (g ->> 'count')::integer;
    end loop;
    if gsum <> p_count then raise exception 'INVALID_GROUPS: Tổng số đầu các nhóm (%) phải bằng số lượng (%).', gsum, p_count; end if;
  end if;

  select coalesce(sum(duration_days), 0) into days from template_stages where template_id = p_template;
  if not coalesce(p_intercrop, false) then
    r := area_free_m2(p_area, f, f + least(greatest(days, 1), 3650), null);
    cap := (r ->> 'capacity_m2')::numeric; peak := (r ->> 'peak_used_m2')::numeric;
    if cap is not null and peak + p_area_m2 > cap + 0.5 then
      if not coalesce(p_confirm_over, false) then
        raise exception 'OVER_CAPACITY: Ô chỉ còn trống % m² trong thời gian này, vụ cần % m². Giảm diện tích, tích "Dùng chung diện tích với vụ khác trong ô", hoặc chủ cơ sở xác nhận tạo vượt.',
          round(greatest(0, cap - peak)), round(p_area_m2);
      end if;
      if not has_org_role(p_owner_org, array['owner']::member_role[]) then
        raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xác nhận tạo vụ vượt diện tích còn trống của ô.';
      end if;
      over := true;
    end if;
  end if;

  if p_current_tpl is null then
    perform create_cycle_from_template(p_id, p_owner_org, p_area, p_template, p_start, p_status, trim(p_name));
  else
    perform create_cycle_midstart(p_id, p_owner_org, p_area, p_template, p_start, trim(p_name), p_current_tpl, p_done_tpl, p_current_start, p_origin, p_origin_note);
  end if;
  update production_cycles set variety_name = left(trim(p_variety), 120), planted_area_m2 = p_area_m2, plant_count = p_count,
         intercrop = coalesce(p_intercrop, false), over_capacity = over, cycle_mode = p_mode,
         planting_date = case when p_mode = 'perennial' then p_planting else planting_date end,
         maturity_years = case when p_mode = 'perennial' then coalesce(p_maturity, 3) end,
         amort_years = case when p_mode = 'perennial' then coalesce(p_amort, 15) end
   where id = p_id;

  if p_mode <> 'batch' then
    select expected_end_date into endd from production_cycles where id = p_id;
    insert into cycle_periods (cycle_id, organization_id, label, start_date, end_date, status, template_id)
      values (p_id, p_owner_org, left(coalesce(nullif(trim(p_period_label), ''), 'Kỳ 1'), 60), f, endd, 'open', p_template) returning id into period;
    update production_stages set period_id = period where cycle_id = p_id and period_id is null;
  end if;
  if p_mode = 'herd' then
    for g in select * from jsonb_array_elements(p_groups) loop
      insert into cycle_count_events (id, cycle_id, organization_id, event_date, kind, quantity, animal_group, note)
        values (gen_random_uuid(), p_id, p_owner_org, f, 'open', (g ->> 'count')::integer, left(trim(g ->> 'group'), 40), 'Tồn đầu');
    end loop;
  end if;
  return p_id;
end $$;
revoke execute on function create_cycle_checked(uuid, uuid, uuid, uuid, date, cycle_status, text, text, numeric, integer, boolean, boolean, uuid, uuid[], date, text, text, text, date, jsonb, text, numeric, integer) from public, anon;
grant execute on function create_cycle_checked(uuid, uuid, uuid, uuid, date, cycle_status, text, text, numeric, integer, boolean, boolean, uuid, uuid[], date, text, text, text, date, jsonb, text, numeric, integer) to authenticated, service_role;

-- Mở kỳ mới: sao quy trình mẫu thành các việc của kỳ (nối sau các kỳ trước)
create or replace function open_cycle_period(p_cycle uuid, p_label text, p_start date, p_template uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c production_cycles; tpl cycle_templates; last_end date; period uuid; total integer; off integer;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_stages(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền mở kỳ cho vụ này.'; end if;
  if c.cycle_mode = 'batch' then raise exception 'INVALID_MODE: Chỉ vườn cây và đàn mới chia kỳ.'; end if;
  if c.status not in ('active', 'paused', 'preparing') then raise exception 'INVALID_STATE: Vụ đã kết thúc hoặc đã hủy.'; end if;
  if exists (select 1 from cycle_periods where cycle_id = p_cycle and status = 'open') then raise exception 'PERIOD_OPEN: Đang có kỳ mở. Hãy đóng kỳ đó trước.'; end if;
  if length(trim(coalesce(p_label, ''))) < 1 then raise exception 'INVALID_LABEL: Hãy nhập tên kỳ (ví dụ "Mùa 2027").'; end if;
  select * into tpl from cycle_templates where id = p_template;
  if tpl.id is null or tpl.organization_id <> c.owner_org_id or not tpl.is_active or tpl.crop_type_id <> c.crop_type_id then
    raise exception 'INVALID_TEMPLATE: Quy trình phải còn dùng, cùng sản phẩm và thuộc cơ sở sở hữu vụ.';
  end if;
  select max(end_date) into last_end from cycle_periods where cycle_id = p_cycle;
  if p_start is null or (last_end is not null and p_start <= last_end) then raise exception 'INVALID_DATE: Ngày bắt đầu kỳ phải sau ngày kết thúc kỳ trước.'; end if;
  select coalesce(max(seq), 0) into off from production_stages where cycle_id = p_cycle;
  insert into cycle_periods (cycle_id, organization_id, label, start_date, status, template_id)
    values (p_cycle, c.owner_org_id, left(trim(p_label), 60), p_start, 'open', p_template) returning id into period;
  total := cycle_instantiate_from_template(p_cycle, c.owner_org_id, p_template, p_start, period, off, false);
  update cycle_periods set end_date = p_start + total - 1 where id = period;
  update production_cycles set expected_end_date = p_start + total - 1, template_id = tpl.id, template_name = tpl.name, template_version = tpl.version where id = p_cycle;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
    values (c.owner_org_id, auth.uid(), 'open_period', 'production_cycle', p_cycle::text, null, jsonb_build_object('period', period, 'label', trim(p_label), 'start', p_start), null);
  return period;
end $$;
revoke execute on function open_cycle_period(uuid, text, date, uuid) from public, anon;
grant execute on function open_cycle_period(uuid, text, date, uuid) to authenticated, service_role;

-- Đóng kỳ: chốt ngày kết thúc; các việc chưa bắt đầu (và chưa có nhật ký) của kỳ bị bỏ; còn việc đang làm thì chưa đóng được
create or replace function close_cycle_period(p_period uuid, p_end date default null) returns void
language plpgsql security definer set search_path = public as $$
declare pr cycle_periods; e date := coalesce(p_end, vn_today()); removed integer;
begin
  select * into pr from cycle_periods where id = p_period;
  if pr.id is null or not can_manage_stages(pr.cycle_id) then raise exception 'FORBIDDEN: Bạn không có quyền đóng kỳ này.'; end if;
  if pr.status <> 'open' then raise exception 'INVALID_STATE: Kỳ này đã đóng rồi.'; end if;
  if e < pr.start_date or e > vn_today() then raise exception 'INVALID_DATE: Ngày kết thúc kỳ phải từ ngày bắt đầu kỳ đến hôm nay.'; end if;
  if exists (select 1 from production_stages where period_id = p_period and status = 'in_progress') then
    raise exception 'STAGE_RUNNING: Còn việc đang làm. Hãy bấm Xong việc đó trước khi đóng kỳ.';
  end if;
  with del as (
    delete from production_stages s where s.period_id = p_period and s.status = 'pending'
       and not exists (select 1 from activity_logs l where l.stage_id = s.id) returning 1)
  select count(*) into removed from del;
  update cycle_periods set status = 'closed', end_date = e, closed_at = now() where id = p_period;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
    values (pr.organization_id, auth.uid(), 'close_period', 'production_cycle', pr.cycle_id::text, null, jsonb_build_object('period', p_period, 'end', e, 'removed_pending', removed), null);
end $$;
revoke execute on function close_cycle_period(uuid, date) from public, anon;
grant execute on function close_cycle_period(uuid, date) to authenticated, service_role;

-- Đặt số năm kiến thiết và khấu hao của vườn cây
create or replace function set_orchard_params(p_cycle uuid, p_planting date, p_maturity numeric, p_amort integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền sửa vườn cây này.'; end if;
  if not exists (select 1 from production_cycles where id = p_cycle and cycle_mode = 'perennial') then raise exception 'INVALID_MODE: Chỉ vườn cây mới có thông số này.'; end if;
  if p_planting is null or p_planting > vn_today() then raise exception 'INVALID_DATE: Ngày trồng không được để trống hoặc ở tương lai.'; end if;
  update production_cycles set planting_date = p_planting, maturity_years = p_maturity, amort_years = p_amort where id = p_cycle;
end $$;
revoke execute on function set_orchard_params(uuid, date, numeric, integer) from public, anon;
grant execute on function set_orchard_params(uuid, date, numeric, integer) to authenticated, service_role;

-- Tổng kết theo khoảng ngày (kỳ): chi phí, thu hoạch, doanh thu, lãi lỗ, khấu hao vườn cây, trên cây / trên đầu
create or replace function get_cycle_period_summary(p_cycle uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c production_cycles; f date := coalesce(p_from, date '1900-01-01'); t date := coalesce(p_to, vn_today());
  v_exp bigint; v_cap_in bigint; v_cap_total bigint; v_mat bigint; v_labor bigint; v_gross numeric; v_loss numeric; v_net numeric; v_sold numeric; v_rev bigint;
  v_dep bigint := 0; v_total bigint; v_profit bigint; v_heads integer; biz_start date; v_days integer; age numeric;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not has_perm(c.owner_org_id, 'summary', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết của vụ này.'; end if;
  select coalesce(sum(amount) filter (where not is_capital and ((kind = 'cash_paid' and category <> 'material') or kind in ('material_used', 'allocated', 'estimated'))), 0),
         coalesce(sum(amount) filter (where is_capital), 0)
    into v_exp, v_cap_in from expense_records where cycle_id = p_cycle and voided_at is null and expense_date between f and t;
  select coalesce(sum(amount), 0) into v_cap_total from expense_records where cycle_id = p_cycle and voided_at is null and is_capital and expense_date <= t;
  select coalesce(sum(cost) filter (where cost_known), 0) into v_mat from inventory_issue_costs where cycle_id = p_cycle and txn_date between f and t;
  select coalesce(round(sum(l.amount)), 0) into v_labor
    from pay_statement_lines l join worker_pay_statements st on st.id = l.statement_id join payroll_periods pp on pp.id = st.period_id
    left join attendance_records a on a.id = l.attendance_id left join work_output_records o on o.id = l.output_id
   where coalesce(a.cycle_id, o.cycle_id) = p_cycle and pp.end_date between f and t;
  select coalesce(sum(quantity), 0), coalesce(sum(coalesce(loss_quantity, 0)), 0) into v_gross, v_loss
    from harvest_records where cycle_id = p_cycle and voided_at is null and (harvested_at at time zone 'Asia/Ho_Chi_Minh')::date between f and t;
  v_net := v_gross - v_loss;
  select coalesce(sum(quantity), 0), coalesce(sum(amount), 0) into v_sold, v_rev from sales_records where cycle_id = p_cycle and voided_at is null and sold_date between f and t;

  if c.cycle_mode = 'perennial' and c.planting_date is not null and c.amort_years is not null then
    biz_start := c.planting_date + (coalesce(c.maturity_years, 3) * 365)::integer;
    v_days := greatest(0, least(t, date '2999-12-31') - greatest(f, biz_start) + 1);
    v_dep := round(v_cap_total::numeric / (c.amort_years * 365) * v_days);
  end if;
  v_total := v_exp + v_mat + v_labor + v_dep;
  v_profit := v_rev - v_total;
  select coalesce(sum(case when kind in ('open', 'in', 'born') then quantity when kind in ('dead', 'culled', 'out') then -quantity else 0 end), 0)::integer into v_heads
    from cycle_count_events where cycle_id = p_cycle and voided_at is null and event_date <= t;
  age := case when c.planting_date is not null then round(((t - c.planting_date) / 365.25)::numeric, 1) end;
  return jsonb_build_object(
    'cycle_id', p_cycle, 'from', f, 'to', t, 'mode', c.cycle_mode,
    'cost_expenses', v_exp, 'cost_material', v_mat, 'cost_labor', v_labor, 'depreciation', v_dep, 'capital_in_window', v_cap_in, 'capital_total', v_cap_total, 'total_cost', v_total,
    'harvest_net', v_net, 'harvest_gross', v_gross, 'harvest_loss', v_loss, 'sold_qty', v_sold, 'revenue', v_rev, 'profit', v_profit,
    'cost_per_kg', case when v_net > 0 then round(v_total::numeric / v_net) end,
    'yield_per_plant', case when c.plant_count > 0 then round(v_net / c.plant_count, 2) end,
    'yield_per_1000m2', case when c.planted_area_m2 > 0 then round(v_net / c.planted_area_m2 * 1000, 1) end,
    'age_years', age,
    'phase', case when c.cycle_mode <> 'perennial' or c.planting_date is null then null
                  when t < c.planting_date + (coalesce(c.maturity_years, 3) * 365)::integer then 'construction' else 'business' end,
    'heads_end', case when c.cycle_mode = 'herd' then v_heads end,
    'cost_per_head', case when c.cycle_mode = 'herd' and v_heads > 0 then round(v_total::numeric / v_heads) end,
    'revenue_per_head', case when c.cycle_mode = 'herd' and v_heads > 0 then round(v_rev::numeric / v_heads) end);
end $$;
revoke execute on function get_cycle_period_summary(uuid, date, date) from public, anon;
grant execute on function get_cycle_period_summary(uuid, date, date) to authenticated, service_role;

-- Tổng kết từng kỳ của một vụ (kỳ đang mở tính đến hôm nay)
create or replace function get_cycle_periods_report(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr record; res jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from production_cycles c where c.id = p_cycle and has_perm(c.owner_org_id, 'summary', 'view')) then raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết của vụ này.'; end if;
  for pr in select * from cycle_periods where cycle_id = p_cycle order by start_date loop
    res := res || (jsonb_build_object('period_id', pr.id, 'label', pr.label, 'status', pr.status, 'start', pr.start_date, 'end', pr.end_date)
                   || get_cycle_period_summary(p_cycle, pr.start_date, case when pr.status = 'open' then least(coalesce(pr.end_date, vn_today()), vn_today()) else pr.end_date end));
  end loop;
  return res;
end $$;
revoke execute on function get_cycle_periods_report(uuid) from public, anon;
grant execute on function get_cycle_periods_report(uuid) to authenticated, service_role;

-- Biến động đàn theo nhóm trong khoảng ngày: đầu kỳ, nhập, sinh, chuyển vào/ra, chết, loại, xuất, cuối kỳ
create or replace function get_herd_balance(p_cycle uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f date := coalesce(p_from, date '1900-01-01'); t date := coalesce(p_to, vn_today());
begin
  if auth.uid() is null or not can_read_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không xem được vụ này.'; end if;
  return coalesce((
    with ev as (
      -- mỗi sự kiện thành các dòng (nhóm, thay đổi, loại luồng); chuyển nhóm = trừ ở nhóm đi, cộng ở nhóm đến
      select coalesce(animal_group, '') g, event_date d, quantity q,
             case kind when 'open' then 'open' when 'in' then 'in' when 'born' then 'born' when 'dead' then 'dead' when 'culled' then 'culled' when 'out' then 'out' when 'move' then 'move_out' end k
        from cycle_count_events where cycle_id = p_cycle and voided_at is null
      union all
      select to_group, event_date, quantity, 'move_in' from cycle_count_events where cycle_id = p_cycle and voided_at is null and kind = 'move'
    ), sgn as (
      select g, d, q, k, case when k in ('open', 'in', 'born', 'move_in') then q else -q end delta from ev
    ), grp as (select distinct g from sgn)
    select jsonb_agg(jsonb_build_object(
      'group', g,
      'opening', (select coalesce(sum(delta), 0) from sgn s where s.g = grp.g and s.d < f),
      'in', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k in ('open', 'in')),
      'born', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'born'),
      'move_in', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'move_in'),
      'move_out', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'move_out'),
      'dead', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'dead'),
      'culled', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'culled'),
      'out', (select coalesce(sum(q), 0) from sgn s where s.g = grp.g and s.d between f and t and k = 'out'),
      'closing', (select coalesce(sum(delta), 0) from sgn s where s.g = grp.g and s.d <= t)) order by g)
    from grp), '[]'::jsonb);
end $$;
revoke execute on function get_herd_balance(uuid, date, date) from public, anon;
grant execute on function get_herd_balance(uuid, date, date) to authenticated, service_role;

-- Đổi quy trình (0181) chỉ dành cho vụ theo mùa; vườn cây và đàn đổi quy trình ở mỗi kỳ mới
do $$
declare d text; k text := '  if c.status in (''ended'', ''cancelled'') then';
begin
  d := pg_get_functiondef('change_cycle_template(uuid, uuid)'::regprocedure);
  if position(k in d) = 0 then raise exception 'change_cycle_template: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, '  if c.cycle_mode <> ''batch'' then raise exception ''INVALID_MODE: Vườn cây và đàn đổi quy trình ở mỗi kỳ mới.''; end if;' || chr(10) || k);
  execute d;
end $$;
