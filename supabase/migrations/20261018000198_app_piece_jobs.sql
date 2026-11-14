-- Mục 11 báo cáo đối thủ: PHIẾU KHOÁN (trả công theo việc: theo sản lượng hoặc trọn gói), một phiếu có thể giao cho nhiều người.
-- Thiết kế gắn vào hệ thống trả công HIỆN CÓ, không dựng song song (khác mô hình sản lượng cũ đã bỏ ở D86: không có giá chung theo tổ/cơ sở):
--  * Phiếu nháp = giao khoán (việc, vụ, đơn giá hoặc số tiền trọn gói, những người nhận và phần chia). Nghiệm thu = nhập số lượng thực tế.
--  * Nghiệm thu sinh MỖI NGƯỜI MỘT KHOẢN "piece" trong pay_adjustments của kỳ lương THÁNG của ngày làm: tự cộng vào "thực nhận" cùng thưởng/phạt/tạm ứng
--    (Tạm ứng giữ nguyên cách cũ), chốt/khóa kỳ lương khóa luôn khoản đó (trigger pay_adj_lock sẵn có).
--  * Tiền khoán tính vào chi phí nhân công của VỤ (get_cycle_summary).
--  * Quyền: mục Tiền công (payroll edit để lập/nghiệm thu/hủy; payroll view xem tất cả; người nhận chỉ thấy phần của mình). Cần mạng (chức năng quản lý, D24).

create table piece_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid references production_cycles(id),
  title text not null check (length(trim(title)) between 2 and 120),
  work_date date not null,
  pay_mode text not null check (pay_mode in ('output', 'lump')),      -- output = đơn giá x sản lượng; lump = trọn gói
  unit text check (unit is null or length(unit) <= 20),
  unit_price numeric check (unit_price is null or unit_price > 0),
  lump_amount numeric check (lump_amount is null or lump_amount > 0),
  quantity numeric check (quantity is null or quantity > 0),          -- sản lượng thực tế, ghi khi nghiệm thu
  total_amount numeric check (total_amount is null or total_amount > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  note text check (note is null or length(note) <= 300),
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  check ((pay_mode = 'output' and unit is not null and unit_price is not null and lump_amount is null)
      or (pay_mode = 'lump' and lump_amount is not null and unit_price is null)),
  check (status <> 'confirmed' or total_amount is not null),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index on piece_jobs (organization_id, work_date);
create index on piece_jobs (cycle_id);

create table piece_job_shares (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references piece_jobs(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id),
  share_pct numeric not null check (share_pct > 0 and share_pct <= 100),
  amount numeric,                                                      -- ghi khi nghiệm thu
  unique (job_id, worker_id)
);
create index on piece_job_shares (worker_id);

alter table piece_jobs enable row level security;
alter table piece_job_shares enable row level security;
revoke all on piece_jobs, piece_job_shares from authenticated, anon;   -- chỉ đọc/ghi qua các hàm bên dưới

alter table pay_adjustments add column piece_job_id uuid references piece_jobs(id), add column cycle_id uuid references production_cycles(id);
create index on pay_adjustments (piece_job_id) where piece_job_id is not null;
create index on pay_adjustments (cycle_id) where cycle_id is not null;

-- ---------------------------------------------------------------------------
-- Nối vào các hàm tính lương / Bảng lương / giá thành vụ hiện có (nguyên văn hàm cũ, chỉ thêm phần khoán)
-- ---------------------------------------------------------------------------

create or replace function compute_payroll(p_period uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  per payroll_periods; a record; s work_rates; rt work_rates; sid uuid; qty numeric; amt numeric; m date;
  miss_a integer := 0; n_lines integer := 0; n_sal integer := 0; total numeric;
begin
  select * into per from payroll_periods where id = p_period;
  if per.id is null or not has_perm(per.organization_id, 'payroll', 'edit') then
    raise exception 'FORBIDDEN: Bạn không có quyền lập bảng lương.';
  end if;
  if per.status = 'locked' then raise exception 'PERIOD_LOCKED: Kỳ đã khóa. Cần mở khóa (chủ, có lý do) trước khi tính lại.'; end if;

  delete from pay_statement_lines where statement_id in (select id from worker_pay_statements where period_id = p_period);
  delete from worker_pay_statements where period_id = p_period;

  for a in
    select * from attendance_records ar
     where ar.organization_id = per.organization_id and ar.work_date between per.start_date and per.end_date
       and ar.status = 'confirmed' and coalesce(ar.approved_minutes, 0) > 0
       and not exists (select 1 from pay_statement_lines l where l.attendance_id = ar.id)
     order by ar.work_date, ar.started_at
  loop
    rt := resolve_rate(per.organization_id, a.worker_id, 'hour', null, null, a.work_date);
    if rt.id is null then
      if (resolve_rate(per.organization_id, a.worker_id, 'month', null, null, a.work_date)).id is null then miss_a := miss_a + 1; end if;
      continue;
    end if;
    select id into sid from worker_pay_statements where period_id = p_period and worker_id = a.worker_id;
    if sid is null then
      insert into worker_pay_statements (period_id, organization_id, worker_id) values (p_period, per.organization_id, a.worker_id) returning id into sid;
    end if;
    qty := round(a.approved_minutes / 60.0, 2);
    amt := round(a.approved_minutes / 60.0 * rt.amount);
    insert into pay_statement_lines (statement_id, organization_id, line_type, attendance_id, quantity, unit, rate_id, rate_amount, amount, explanation)
      values (sid, per.organization_id, 'hours', a.id, qty, 'hour', rt.id, rt.amount, amt,
              format('%s giờ × %s đ/giờ (ngày %s)', trim_scale(qty), trim_scale(rt.amount), to_char(a.work_date, 'DD/MM/YYYY')));
    n_lines := n_lines + 1;
  end loop;

  -- lương cố định theo tháng: một lần cho mỗi người mỗi tháng (tháng của ngày cuối kỳ)
  m := date_trunc('month', per.end_date)::date;
  for s in
    select distinct on (r.worker_id) r.* from work_rates r
      join worker_profiles w on w.id = r.worker_id and w.status = 'active'
     where r.organization_id = per.organization_id and r.is_active and r.rate_type = 'month'
       and r.valid_from <= per.end_date and (r.valid_to is null or r.valid_to >= per.end_date)
     order by r.worker_id, r.valid_from desc
  loop
    if exists (select 1 from pay_statement_lines l where l.line_type = 'salary' and l.salary_worker_id = s.worker_id and l.salary_month = m) then continue; end if;
    select id into sid from worker_pay_statements where period_id = p_period and worker_id = s.worker_id;
    if sid is null then
      insert into worker_pay_statements (period_id, organization_id, worker_id) values (p_period, per.organization_id, s.worker_id) returning id into sid;
    end if;
    insert into pay_statement_lines (statement_id, organization_id, line_type, quantity, unit, rate_id, rate_amount, amount, explanation, salary_worker_id, salary_month)
      values (sid, per.organization_id, 'salary', 1, 'tháng', s.id, s.amount, s.amount,
              format('Lương cố định tháng %s', to_char(m, 'MM/YYYY')), s.worker_id, m);
    n_sal := n_sal + 1;
  end loop;

  -- người chỉ có khoản cộng/trừ trong kỳ cũng có bảng
  insert into worker_pay_statements (period_id, organization_id, worker_id)
    select distinct p_period, per.organization_id, pa.worker_id from pay_adjustments pa
     where pa.period_id = p_period
       and not exists (select 1 from worker_pay_statements st where st.period_id = p_period and st.worker_id = pa.worker_id);

  update worker_pay_statements st set total_estimated =
      coalesce((select sum(l.amount) from pay_statement_lines l where l.statement_id = st.id), 0)
    + coalesce((select sum(case when pa.kind in ('bonus', 'piece') then pa.amount else -pa.amount end) from pay_adjustments pa
                 where pa.period_id = p_period and pa.worker_id = st.worker_id), 0)
   where st.period_id = p_period;

  select coalesce(sum(total_estimated), 0) into total from worker_pay_statements where period_id = p_period;
  return jsonb_build_object('lines', n_lines + n_sal, 'salary_lines', n_sal, 'missing_rate_hours', miss_a, 'missing_rate_output', 0, 'total', total,
                            'workers', (select count(*) from worker_pay_statements where period_id = p_period));
end $$;

create or replace function pay_items(p_org uuid, p_from date, p_to date, p_workers uuid[])
returns table (worker_id uuid, kind text, item_date date, ref uuid, minutes numeric, amount numeric, rate numeric, status text, label text, started_at timestamptz, ended_at timestamptz, break_minutes integer)
language sql stable security definer set search_path = public as $$
  -- công theo ngày
  select a.worker_id,
         case a.status::text when 'confirmed' then 'hours' when 'needs_confirmation' then (case when a.ended_at is null then 'open' else 'pending' end)
                           when 'rejected' then 'rejected' else 'open' end,
         a.work_date, a.id,
         case when a.status = 'confirmed' then coalesce(a.approved_minutes, 0)
              when a.ended_at is not null and a.status = 'needs_confirmation' then greatest(0, extract(epoch from (a.ended_at - a.started_at)) / 60 - a.break_minutes) else 0 end,
         case when a.status = 'confirmed' then coalesce(l.amount, round(coalesce(a.approved_minutes, 0) / 60.0 * coalesce(rt.amount, 0)), 0) else 0 end,
         case when a.status = 'confirmed' then coalesce(l.rate_amount, rt.amount) end,
         case when a.status <> 'confirmed' then a.status::text
              when l.id is not null then (case when pp.status = 'locked' then 'locked' else 'calculated' end)
              when rt.id is null then 'no_rate' else 'estimate' end,
         null::text, a.started_at, a.ended_at, a.break_minutes
    from attendance_records a
    left join pay_statement_lines l on l.attendance_id = a.id and l.line_type = 'hours'
    left join worker_pay_statements st on st.id = l.statement_id
    left join payroll_periods pp on pp.id = st.period_id
    left join lateral (select * from resolve_rate(p_org, a.worker_id, 'hour', null, null, a.work_date)) rt on a.status = 'confirmed' and l.id is null
   where a.organization_id = p_org and a.work_date between p_from and p_to and a.worker_id = any (p_workers)
  union all
  -- lương cố định theo tháng (mỗi tháng một lần, tháng có ngày đầu nằm trong khoảng xem)
  select w.worker_id, 'salary', m.d::date, l.id, 0,
         coalesce(l.amount, sr.amount, 0), coalesce(l.rate_amount, sr.amount),
         case when l.id is not null then (case when pp.status = 'locked' then 'locked' else 'calculated' end) else 'estimate' end,
         to_char(m.d, 'MM/YYYY'), null::timestamptz, null::timestamptz, null::integer
    from unnest(p_workers) as w(worker_id)
    join worker_profiles wp on wp.id = w.worker_id and wp.status = 'active'
    cross join lateral generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') as m(d)
    left join pay_statement_lines l on l.line_type = 'salary' and l.salary_worker_id = w.worker_id and l.salary_month = m.d::date
    left join worker_pay_statements st on st.id = l.statement_id
    left join payroll_periods pp on pp.id = st.period_id
    left join lateral (
      select r.amount from work_rates r
       where r.organization_id = p_org and r.worker_id = w.worker_id and r.is_active and r.rate_type = 'month'
         and r.valid_from <= least((m.d + interval '1 month - 1 day')::date, vn_today()) and (r.valid_to is null or r.valid_to >= least((m.d + interval '1 month - 1 day')::date, vn_today()))
       order by r.valid_from desc limit 1) sr on l.id is null
   where m.d::date <= p_to and m.d::date <= vn_today()
     and (l.id is not null or sr.amount is not null)
  union all
  -- thưởng, phạt, tạm ứng (theo kỳ lương)
  select pa.worker_id, pa.kind::text, coalesce(pj.work_date, pp.end_date), pa.id, 0,
         case when pa.kind in ('bonus', 'piece') then pa.amount else -pa.amount end, null::numeric,
         case when pp.status = 'locked' then 'locked' else 'calculated' end, pa.reason, null::timestamptz, null::timestamptz, null::integer
    from pay_adjustments pa join payroll_periods pp on pp.id = pa.period_id left join piece_jobs pj on pj.id = pa.piece_job_id
   where pa.organization_id = p_org and pp.end_date between p_from and p_to and pa.worker_id = any (p_workers);
$$;

create or replace function get_pay_series(p_org uuid, p_worker uuid default null, p_months integer default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ws uuid[]; n integer := least(greatest(coalesce(p_months, 6), 1), 24); d0 date; res jsonb;
begin
  ws := pay_scope(p_org, p_worker);
  d0 := (date_trunc('month', vn_today()::timestamp) - make_interval(months => n - 1))::date;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.d, 'YYYY-MM'), 'net', coalesce(s.net, 0), 'net_locked', coalesce(s.net_locked, 0), 'hours', coalesce(s.hours, 0)) order by m.d), '[]'::jsonb)
    into res
    from generate_series(d0::timestamp, date_trunc('month', vn_today()::timestamp), interval '1 month') as m(d)
    left join (
      select date_trunc('month', i.item_date::timestamp) as mon,
             sum(i.amount) filter (where i.kind in ('hours', 'salary', 'piece', 'bonus', 'deduction', 'advance')) as net,
             sum(i.amount) filter (where i.kind in ('hours', 'salary', 'piece', 'bonus', 'deduction', 'advance') and i.status = 'locked') as net_locked,
             round(sum(i.minutes) filter (where i.kind = 'hours') / 60.0, 2) as hours
        from pay_items(p_org, d0, (date_trunc('month', vn_today()::timestamp) + interval '1 month - 1 day')::date, ws) i
       group by 1) s on s.mon = m.d;
  return jsonb_build_object('generated_at', now(), 'can_see_all', has_perm(p_org, 'payroll', 'view'), 'months', res);
end $$;

create or replace function payroll_blockers(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare draftp integer; pend integer; opn integer; reqs integer; todo integer; miss jsonb; msgs text[] := '{}';
begin
  select count(*) into pend from attendance_records a
   where a.organization_id = p_org and a.work_date between p_from and p_to and a.status = 'needs_confirmation' and a.ended_at is not null;
  select count(*) into opn from attendance_records a
   where a.organization_id = p_org and a.work_date between p_from and p_to and a.ended_at is null and a.status <> 'rejected';
  select count(*) into reqs from attendance_adjustments j join attendance_records a on a.id = j.attendance_id
   where a.organization_id = p_org and a.work_date between p_from and p_to and j.status = 'pending';
  -- công đã xác nhận nhưng người đó chưa có cách trả công (giờ hoặc tháng) tại ngày công
  select coalesce(jsonb_agg(jsonb_build_object('worker_id', x.worker_id, 'name', x.name, 'days', x.days) order by x.name), '[]'::jsonb) into miss from (
    select w.id as worker_id, w.full_name as name, count(*) as days
      from attendance_records a join worker_profiles w on w.id = a.worker_id
     where a.organization_id = p_org and a.work_date between p_from and p_to and a.status = 'confirmed' and coalesce(a.approved_minutes, 0) > 0
       and not exists (select 1 from pay_statement_lines l where l.attendance_id = a.id)
       and (resolve_rate(p_org, a.worker_id, 'hour', null, null, a.work_date)).id is null
       and (resolve_rate(p_org, a.worker_id, 'month', null, null, a.work_date)).id is null
     group by w.id, w.full_name) x;
  -- công đã xác nhận, có giá, nhưng chưa được tính vào bảng lương
  select count(*) into todo from attendance_records a
   where a.organization_id = p_org and a.work_date between p_from and p_to and a.status = 'confirmed' and coalesce(a.approved_minutes, 0) > 0
     and not exists (select 1 from pay_statement_lines l where l.attendance_id = a.id)
     and (resolve_rate(p_org, a.worker_id, 'hour', null, null, a.work_date)).id is not null;
  select count(*) into draftp from piece_jobs j where j.organization_id = p_org and j.work_date between p_from and p_to and j.status = 'draft';
  if draftp > 0 then msgs := msgs || format('%s phiếu khoán chưa nghiệm thu', draftp); end if;
  if pend > 0 then msgs := msgs || format('%s ca công đang chờ xác nhận', pend); end if;
  if opn > 0 then msgs := msgs || format('%s ca đang mở (chưa ra ca)', opn); end if;
  if reqs > 0 then msgs := msgs || format('%s yêu cầu sửa công chờ duyệt', reqs); end if;
  if jsonb_array_length(miss) > 0 then msgs := msgs || format('%s người chưa có cách trả công', jsonb_array_length(miss)); end if;
  if todo > 0 then msgs := msgs || format('%s ca công mới chưa tính (hãy Tính lại)', todo); end if;
  return jsonb_build_object('pending_attendance', pend, 'open_shifts', opn, 'pending_requests', reqs, 'draft_piece_jobs', draftp, 'missing_rate', miss, 'uncomputed', todo,
                            'blocked', cardinality(msgs) > 0, 'messages', to_jsonb(msgs));
end $$;

create or replace function get_cycle_summary(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid; v_status cycle_status;
  v_cash_nonmat bigint; v_cash_mat bigint; v_mat_manual bigint; v_alloc bigint;
  v_mat_cost bigint; v_miss integer; v_avg integer;
  v_gross numeric; v_loss numeric; v_net numeric; v_sold numeric; v_rev bigint;
  v_labor bigint; v_labor_est bigint;
  v_total bigint; v_cps numeric;
begin
  select owner_org_id, status into v_owner, v_status from production_cycles where id = p_cycle;
  if v_owner is null or not has_perm(v_owner, 'summary', 'view') then
    raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết chi phí của vụ này.';
  end if;

  select coalesce(sum(amount) filter (where kind = 'cash_paid' and category <> 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'cash_paid' and category = 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'material_used'), 0),
         coalesce(sum(amount) filter (where kind in ('allocated', 'estimated')), 0)
    into v_cash_nonmat, v_cash_mat, v_mat_manual, v_alloc
    from expense_records where cycle_id = p_cycle and voided_at is null;

  select coalesce(sum(cost) filter (where cost_known), 0),
         count(*) filter (where not cost_known)::integer,
         count(*) filter (where cost_from_average)::integer
    into v_mat_cost, v_miss, v_avg
    from inventory_issue_costs where cycle_id = p_cycle;

  select coalesce(sum(quantity), 0), coalesce(sum(coalesce(loss_quantity, 0)), 0)
    into v_gross, v_loss from harvest_records where cycle_id = p_cycle and voided_at is null;
  v_net := v_gross - v_loss;

  select coalesce(sum(quantity), 0), coalesce(sum(amount), 0)
    into v_sold, v_rev from sales_records where cycle_id = p_cycle and voided_at is null;

  select coalesce(round(sum(l.amount) filter (where p.status = 'locked')), 0),
         coalesce(round(sum(l.amount) filter (where p.status <> 'locked')), 0)
    into v_labor, v_labor_est
    from pay_statement_lines l
    join worker_pay_statements st on st.id = l.statement_id
    join payroll_periods p on p.id = st.period_id
    left join attendance_records a on a.id = l.attendance_id
    left join work_output_records o on o.id = l.output_id
   where coalesce(a.cycle_id, o.cycle_id) = p_cycle;

  -- Tiền khoán (phiếu khoán đã nghiệm thu) của vụ: kỳ đã khóa = đã duyệt, kỳ chưa khóa = dự tính
  v_labor := v_labor + coalesce((select round(sum(pa.amount)) from pay_adjustments pa join payroll_periods p on p.id = pa.period_id
                                  where pa.kind = 'piece' and pa.cycle_id = p_cycle and p.status = 'locked'), 0);
  v_labor_est := v_labor_est + coalesce((select round(sum(pa.amount)) from pay_adjustments pa join payroll_periods p on p.id = pa.period_id
                                          where pa.kind = 'piece' and pa.cycle_id = p_cycle and p.status <> 'locked'), 0);

  v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc + v_labor + v_labor_est;
  v_cps := case when v_net > 0 and v_miss = 0 then round(v_total::numeric / v_net) end;

  return jsonb_build_object(
    'cycle_id', p_cycle,
    'status', v_status,
    'updated_at', now(),
    'cash_paid_other', v_cash_nonmat,
    'cash_paid_material', v_cash_mat,
    'material_used_cost', v_mat_cost,
    'material_used_manual', v_mat_manual,
    'allocated_or_estimated', v_alloc,
    'labor_cost', v_labor,
    'labor_estimated', v_labor_est,
    'total_cost', v_total,
    'harvested_gross_qty', v_gross,
    'harvest_loss_qty', v_loss,
    'harvested_net_qty', v_net,
    'sold_qty', v_sold,
    'revenue_recorded', v_rev,
    'cost_per_kg', v_cps,
    'issues_missing_cost', v_miss,
    'issues_cost_from_average', v_avg,
    'has_estimated_cost', v_alloc > 0 or v_labor_est > 0,
    'missing_harvest', v_gross = 0,
    'missing_revenue', v_rev = 0 and v_sold = 0
  );
end $$;

create or replace function update_pay_adjustment(p_id uuid, p_kind pay_adjustment_kind, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a pay_adjustments;
begin
  select * into a from pay_adjustments where id = p_id;
  if a.id is null or not has_perm(a.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản này.'; end if;
  if a.piece_job_id is not null then raise exception 'USE_PIECE: Khoản này đến từ phiếu khoán, hãy sửa hoặc hủy ở phiếu khoán.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Số tiền phải lớn hơn 0.'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do.'; end if;
  update pay_adjustments set kind = coalesce(p_kind, kind), amount = p_amount, reason = trim(p_reason) where id = p_id;
  return compute_payroll(a.period_id) || jsonb_build_object('period_id', a.period_id);
end $$;

create or replace function delete_pay_adjustment(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a pay_adjustments;
begin
  select * into a from pay_adjustments where id = p_id;
  if a.id is null or not has_perm(a.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền xóa khoản này.'; end if;
  if a.piece_job_id is not null then raise exception 'USE_PIECE: Khoản này đến từ phiếu khoán, hãy hủy ở phiếu khoán.'; end if;
  delete from pay_adjustments where id = p_id;
  return compute_payroll(a.period_id) || jsonb_build_object('period_id', a.period_id);
end $$;

-- get_pay_overview: vá bản HIỆN TẠI (đã có n_locked, n_calculated... từ 0072) thay vì chép lại bản cũ
do $$
declare d text;
begin
  d := pg_get_functiondef('get_pay_overview(uuid, date, date, uuid)'::regprocedure);
  if position('''salary'', coalesce(sum(i.amount) filter (where i.kind = ''salary''), 0),' in d) = 0 then raise exception 'get_pay_overview: không tìm thấy đoạn cột salary'; end if;
  d := replace(d, '''salary'', coalesce(sum(i.amount) filter (where i.kind = ''salary''), 0),',
    '''salary'', coalesce(sum(i.amount) filter (where i.kind = ''salary''), 0),
      ''piece'', coalesce(sum(i.amount) filter (where i.kind = ''piece''), 0),');
  if position('in (''hours'', ''salary'', ''bonus'', ''deduction'', ''advance'')' in d) = 0 then raise exception 'get_pay_overview: không tìm thấy danh sách loại khoản'; end if;
  d := replace(d, 'in (''hours'', ''salary'', ''bonus'', ''deduction'', ''advance'')', 'in (''hours'', ''salary'', ''piece'', ''bonus'', ''deduction'', ''advance'')');
  execute d;
end $$;

-- ---------------------------------------------------------------------------
-- Hàm của phiếu khoán
-- ---------------------------------------------------------------------------

-- Kiểm tra và ghi thông tin phiếu (dùng chung cho lập và sửa)
create or replace function piece_job_write(p_id uuid, p_org uuid, p_cycle uuid, p_title text, p_date date, p_mode text, p_unit text, p_price numeric, p_lump numeric, p_workers jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare n integer; w jsonb; sum_pct numeric := 0; pct numeric; jid uuid := p_id; equal boolean;
begin
  if p_cycle is not null and not exists (select 1 from production_cycles c where c.id = p_cycle and c.owner_org_id = p_org) then
    raise exception 'NOT_FOUND: Không tìm thấy vụ này trong cơ sở.';
  end if;
  if p_date is null or p_date > vn_today() then raise exception 'INVALID_DATE: Ngày làm không được ở tương lai.'; end if;
  if p_mode = 'output' and (p_unit is null or length(trim(p_unit)) = 0 or p_price is null or p_price <= 0) then
    raise exception 'INVALID_PIECE: Khoán theo sản lượng cần đơn vị (kg, thùng…) và đơn giá lớn hơn 0.';
  end if;
  if p_mode = 'lump' and (p_lump is null or p_lump <= 0) then raise exception 'INVALID_PIECE: Khoán trọn gói cần số tiền lớn hơn 0.'; end if;
  if p_mode not in ('output', 'lump') then raise exception 'INVALID_PIECE: Cách khoán không hợp lệ.'; end if;
  if p_workers is null or jsonb_typeof(p_workers) <> 'array' or jsonb_array_length(p_workers) = 0 then
    raise exception 'INVALID_PIECE: Hãy chọn ít nhất một người nhận khoán.';
  end if;
  n := jsonb_array_length(p_workers);
  equal := not exists (select 1 from jsonb_array_elements(p_workers) e where e->'pct' is not null and jsonb_typeof(e->'pct') = 'number');
  for w in select * from jsonb_array_elements(p_workers) loop
    if not exists (select 1 from worker_profiles wp where wp.id = (w->>'worker_id')::uuid and wp.organization_id = p_org) then
      raise exception 'NOT_FOUND: Có người nhận khoán không thuộc cơ sở.';
    end if;
    pct := case when equal then round(100.0 / n, 4) else coalesce((w->>'pct')::numeric, 0) end;
    if pct <= 0 or pct > 100 then raise exception 'INVALID_PIECE: Phần chia của mỗi người phải lớn hơn 0 và không quá 100%%.'; end if;
    sum_pct := sum_pct + pct;
  end loop;
  if abs(sum_pct - 100) > 0.01 then raise exception 'INVALID_PIECE: Tổng phần chia phải bằng 100%% (hiện là %).', round(sum_pct, 2); end if;
  if (select count(distinct (e->>'worker_id')) from jsonb_array_elements(p_workers) e) <> n then
    raise exception 'INVALID_PIECE: Một người chỉ được chọn một lần trong phiếu.';
  end if;

  if jid is null then
    insert into piece_jobs (organization_id, cycle_id, title, work_date, pay_mode, unit, unit_price, lump_amount, note)
    values (p_org, p_cycle, trim(p_title), p_date, p_mode, case when p_mode = 'output' then trim(p_unit) end, case when p_mode = 'output' then p_price end,
            case when p_mode = 'lump' then p_lump end, nullif(trim(coalesce(p_note, '')), '')) returning id into jid;
  else
    update piece_jobs set cycle_id = p_cycle, title = trim(p_title), work_date = p_date, pay_mode = p_mode,
           unit = case when p_mode = 'output' then trim(p_unit) end, unit_price = case when p_mode = 'output' then p_price end,
           lump_amount = case when p_mode = 'lump' then p_lump end, note = nullif(trim(coalesce(p_note, '')), '') where id = jid;
    delete from piece_job_shares where job_id = jid;
  end if;
  for w in select * from jsonb_array_elements(p_workers) loop
    insert into piece_job_shares (job_id, organization_id, worker_id, share_pct)
    values (jid, p_org, (w->>'worker_id')::uuid, case when equal then round(100.0 / n, 4) else (w->>'pct')::numeric end);
  end loop;
  return jid;
end $$;
revoke execute on function piece_job_write(uuid, uuid, uuid, text, date, text, text, numeric, numeric, jsonb, text) from public, anon, authenticated;

create or replace function create_piece_job(p_org uuid, p_cycle uuid, p_title text, p_date date, p_mode text, p_unit text, p_price numeric, p_lump numeric, p_workers jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập phiếu khoán (mục Tiền công).'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'INVALID_PIECE: Hãy ghi nội dung việc khoán.'; end if;
  return piece_job_write(null, p_org, p_cycle, p_title, p_date, p_mode, p_unit, p_price, p_lump, p_workers, p_note);
end $$;

create or replace function update_piece_job(p_id uuid, p_cycle uuid, p_title text, p_date date, p_mode text, p_unit text, p_price numeric, p_lump numeric, p_workers jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare j piece_jobs;
begin
  select * into j from piece_jobs where id = p_id;
  if j.id is null or not has_perm(j.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa phiếu khoán.'; end if;
  if j.status <> 'draft' then raise exception 'NOT_DRAFT: Phiếu đã nghiệm thu hoặc đã hủy nên không sửa được. Hãy hủy rồi lập phiếu mới.'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'INVALID_PIECE: Hãy ghi nội dung việc khoán.'; end if;
  return piece_job_write(p_id, j.organization_id, p_cycle, p_title, p_date, p_mode, p_unit, p_price, p_lump, p_workers, p_note);
end $$;

-- Nghiệm thu: nhập sản lượng thực tế (khoán theo sản lượng) rồi chia tiền vào kỳ lương tháng của ngày làm
create or replace function confirm_piece_job(p_id uuid, p_quantity numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j piece_jobs; pid uuid; total numeric; paid numeric := 0; amt numeric; sh record; k integer := 0; n integer; st payroll_status; reason text;
begin
  select * into j from piece_jobs where id = p_id;
  if j.id is null or not has_perm(j.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền nghiệm thu phiếu khoán.'; end if;
  if j.status <> 'draft' then raise exception 'NOT_DRAFT: Phiếu này đã nghiệm thu hoặc đã hủy.'; end if;
  if j.pay_mode = 'output' then
    if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_PIECE: Hãy nhập sản lượng thực tế (lớn hơn 0).'; end if;
    total := round(j.unit_price * p_quantity);
  else
    total := j.lump_amount;
  end if;
  if total is null or total <= 0 then raise exception 'INVALID_PIECE: Tổng tiền khoán phải lớn hơn 0.'; end if;

  pid := ensure_month_period(j.organization_id, j.work_date);
  select status into st from payroll_periods where id = pid;
  if st = 'locked' then
    raise exception 'PERIOD_LOCKED: Tháng %/% đã chốt lương nên chưa ghi thêm tiền khoán được. Chủ cơ sở cần mở khóa kỳ lương đó trước.', to_char(j.work_date, 'MM'), to_char(j.work_date, 'YYYY');
  end if;

  reason := case when j.pay_mode = 'output'
                 then format('Khoán: %s (%s %s × %s đ)', j.title, trim_scale(p_quantity), j.unit, trim_scale(j.unit_price))
                 else format('Khoán trọn gói: %s', j.title) end;
  select count(*) into n from piece_job_shares where job_id = p_id;
  for sh in select * from piece_job_shares where job_id = p_id order by worker_id loop
    k := k + 1;
    amt := case when k = n then total - paid else round(total * sh.share_pct / 100) end;   -- người cuối nhận phần lẻ để tổng khớp đúng
    if amt <= 0 then raise exception 'INVALID_PIECE: Số tiền của một người nhận bằng 0. Hãy kiểm tra phần chia.'; end if;
    paid := paid + amt;
    insert into pay_adjustments (organization_id, worker_id, period_id, kind, amount, reason, piece_job_id, cycle_id)
    values (j.organization_id, sh.worker_id, pid, 'piece', amt, reason, p_id, j.cycle_id);
    update piece_job_shares set amount = amt where id = sh.id;
  end loop;
  update piece_jobs set status = 'confirmed', quantity = coalesce(p_quantity, quantity), total_amount = total, confirmed_by = auth.uid(), confirmed_at = now() where id = p_id;
  return compute_payroll(pid) || jsonb_build_object('period_id', pid, 'job_total', total);
end $$;

-- Hủy phiếu: nháp thì đánh dấu hủy; đã nghiệm thu thì gỡ các khoản khỏi kỳ lương (kỳ đã khóa thì chặn)
create or replace function cancel_piece_job(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j piece_jobs; pid uuid; res jsonb := '{}'::jsonb;
begin
  select * into j from piece_jobs where id = p_id;
  if j.id is null or not has_perm(j.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền hủy phiếu khoán.'; end if;
  if j.status = 'cancelled' then return res; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy.'; end if;
  if j.status = 'confirmed' then
    select period_id into pid from pay_adjustments where piece_job_id = p_id limit 1;
    if pid is not null and exists (select 1 from payroll_periods p where p.id = pid and p.status = 'locked') then
      raise exception 'PERIOD_LOCKED: Kỳ lương của phiếu này đã chốt nên chưa hủy được. Chủ cơ sở cần mở khóa kỳ lương trước.';
    end if;
    delete from pay_adjustments where piece_job_id = p_id;
    update piece_job_shares set amount = null where job_id = p_id;
  end if;
  update piece_jobs set status = 'cancelled', cancel_reason = trim(p_reason) where id = p_id;
  if pid is not null then res := compute_payroll(pid) || jsonb_build_object('period_id', pid); end if;
  return res;
end $$;

-- Danh sách phiếu trong khoảng ngày. Người có quyền Tiền công (xem) thấy tất cả; người khác chỉ thấy phiếu có mình và chỉ phần của mình.
create or replace function get_piece_jobs(p_org uuid, p_from date, p_to date, p_cycle uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare seeall boolean; mine uuid; res jsonb;
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_to - p_from > 800 then raise exception 'INVALID_DATE: Chỉ xem tối đa khoảng 2 năm một lần.'; end if;
  seeall := has_perm(p_org, 'payroll', 'view');
  mine := my_worker_id(p_org);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'cycle_id', j.cycle_id, 'title', j.title, 'work_date', j.work_date, 'pay_mode', j.pay_mode, 'unit', j.unit,
      'unit_price', j.unit_price, 'lump_amount', j.lump_amount, 'quantity', j.quantity, 'total_amount', case when seeall then j.total_amount end,
      'status', j.status, 'note', j.note, 'cancel_reason', j.cancel_reason,
      'pay_state', case when j.status <> 'confirmed' then null when exists (
          select 1 from pay_adjustments pa join payroll_periods pp on pp.id = pa.period_id where pa.piece_job_id = j.id and pp.status = 'locked') then 'locked' else 'calculated' end,
      'shares', (select coalesce(jsonb_agg(jsonb_build_object('worker_id', s.worker_id, 'name', w.full_name, 'pct', s.share_pct, 'amount', s.amount) order by w.full_name), '[]'::jsonb)
                   from piece_job_shares s join worker_profiles w on w.id = s.worker_id where s.job_id = j.id and (seeall or s.worker_id = mine))
    ) order by j.work_date desc, j.created_at desc), '[]'::jsonb) into res
    from piece_jobs j
   where j.organization_id = p_org and j.work_date between p_from and p_to and (p_cycle is null or j.cycle_id = p_cycle)
     and (seeall or exists (select 1 from piece_job_shares s where s.job_id = j.id and s.worker_id = mine));
  return jsonb_build_object('from', p_from, 'to', p_to, 'generated_at', now(), 'can_edit', has_perm(p_org, 'payroll', 'edit'), 'can_see_all', seeall, 'jobs', res);
end $$;

revoke execute on function create_piece_job(uuid, uuid, text, date, text, text, numeric, numeric, jsonb, text), update_piece_job(uuid, uuid, text, date, text, text, numeric, numeric, jsonb, text),
  confirm_piece_job(uuid, numeric), cancel_piece_job(uuid, text), get_piece_jobs(uuid, date, date, uuid) from public, anon;
grant execute on function create_piece_job(uuid, uuid, text, date, text, text, numeric, numeric, jsonb, text), update_piece_job(uuid, uuid, text, date, text, text, numeric, numeric, jsonb, text),
  confirm_piece_job(uuid, numeric), cancel_piece_job(uuid, text), get_piece_jobs(uuid, date, date, uuid) to authenticated, service_role;
