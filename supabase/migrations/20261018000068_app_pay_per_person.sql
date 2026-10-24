-- D86 (V3): TRẢ CÔNG THEO TỪNG NGƯỜI. Chỉ còn hai cách: theo GIỜ (đồng/giờ) hoặc LƯƠNG CỐ ĐỊNH THEO THÁNG (đồng/tháng); đặt riêng cho từng người,
-- mỗi dòng có ngày hiệu lực (đổi giá không làm đổi kỳ đã khóa). Bỏ trả theo sản lượng và giá chung theo tổ/cơ sở.
-- Lương tháng: trả nguyên số tiền, một lần cho mỗi tháng (tháng của NGÀY CUỐI kỳ), dù kỳ ngắn hơn hay dài hơn một tháng; nghỉ không phép hay vào
-- giữa tháng thì chủ nhập khoản "Phạt/khấu trừ" có lý do. Thưởng, phạt, tạm ứng đã có (pay_adjustments): Thực nhận = công + lương tháng + thưởng - phạt - tạm ứng.

-- 1. Dòng giá cũ không còn áp dụng (giữ lại để kỳ đã khóa còn truy ngược), ngừng dùng
update work_rates set is_active = false where worker_id is null or team_id is not null or rate_type = 'quantity';

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'work_rates'::regclass and contype = 'c'
            and (pg_get_constraintdef(oid) ~ 'unit' or pg_get_constraintdef(oid) ~ 'team_id') loop
    execute format('alter table work_rates drop constraint %I', c.conname);
  end loop;
end $$;
alter table work_rates add constraint work_rates_person_only
  check (worker_id is not null and team_id is null and unit is null and work_type_id is null and rate_type in ('hour', 'month')) not valid;

-- 2. Đơn giá áp dụng: chỉ của chính người đó, mới nhất có hiệu lực tại ngày
create or replace function resolve_rate(p_org uuid, p_worker uuid, p_type rate_type, p_work_type uuid, p_unit text, p_date date)
returns work_rates
language sql stable security definer set search_path = public as $$
  select r.* from work_rates r
   where r.organization_id = p_org and r.worker_id = p_worker and r.is_active and r.rate_type = p_type
     and r.valid_from <= p_date and (r.valid_to is null or r.valid_to >= p_date)
   order by r.valid_from desc
   limit 1;
$$;

-- 3. Dòng lương cố định trong bảng lương
alter table pay_statement_lines add column salary_worker_id uuid references worker_profiles(id), add column salary_month date;
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'pay_statement_lines'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'attendance_id' loop
    execute format('alter table pay_statement_lines drop constraint %I', c.conname);
  end loop;
end $$;
alter table pay_statement_lines add constraint pay_lines_kind_ids check (
     (line_type = 'hours' and attendance_id is not null and output_id is null)
  or (line_type = 'output' and output_id is not null and attendance_id is null)
  or (line_type = 'salary' and attendance_id is null and output_id is null and salary_worker_id is not null and salary_month is not null));
create unique index one_salary_per_worker_month on pay_statement_lines (salary_worker_id, salary_month) where line_type = 'salary';

-- 4. Tính bảng lương: công đã xác nhận x giá giờ của người + lương tháng + thưởng/phạt/tạm ứng. Thiếu giá giờ thì báo (trừ người có lương tháng).
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
    + coalesce((select sum(case pa.kind when 'bonus' then pa.amount else -pa.amount end) from pay_adjustments pa
                 where pa.period_id = p_period and pa.worker_id = st.worker_id), 0)
   where st.period_id = p_period;

  select coalesce(sum(total_estimated), 0) into total from worker_pay_statements where period_id = p_period;
  return jsonb_build_object('lines', n_lines + n_sal, 'salary_lines', n_sal, 'missing_rate_hours', miss_a, 'missing_rate_output', 0, 'total', total,
                            'workers', (select count(*) from worker_pay_statements where period_id = p_period));
end $$;
revoke execute on function compute_payroll(uuid) from public, anon;
grant execute on function compute_payroll(uuid) to authenticated, service_role;
