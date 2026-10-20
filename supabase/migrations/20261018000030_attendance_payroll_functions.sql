-- D42 (bước E, lát 1): chấm công, sản lượng, đơn giá và tính tiền công.
-- Bảng và quyền đã có từ migration 0004/0015; ở đây thêm HÀM để giao diện dùng gọn và đúng quy tắc:
--  - Vào ca / ra ca của chính mình; tổ trưởng/quản lý chấm hộ; xác nhận hoặc từ chối công.
--  - Ghi và xác nhận sản lượng.
--  - Tính bảng lương của một kỳ từ công đã xác nhận và sản lượng đã xác nhận (mỗi dòng truy ngược được tới bản ghi và đơn giá).
--  - Chủ khóa/mở khóa kỳ (khóa: chốt số "đã duyệt"; mở khóa: cần lý do, có ghi audit).
-- Giờ Việt Nam (Asia/Ho_Chi_Minh) quyết định "ngày công".

alter table attendance_records add column cycle_id uuid references production_cycles(id);

create or replace function vn_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- ---------------------------------------------------------------------------
-- Chấm công
-- ---------------------------------------------------------------------------
-- Hồ sơ lao động của tôi ở cơ sở (null nếu không có)
create or replace function my_worker_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from worker_profiles where organization_id = p_org and user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function clock_in(p_id uuid, p_org uuid, p_cycle uuid default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare w uuid := my_worker_id(p_org); r attendance_records;
begin
  if w is null then raise exception 'NO_WORKER: Bạn chưa có hồ sơ lao động ở cơ sở này nên chưa chấm công được.'; end if;
  if exists (select 1 from attendance_records where id = p_id) then
    select * into r from attendance_records where id = p_id; return r; -- bấm lặp
  end if;
  if exists (select 1 from attendance_records where worker_id = w and ended_at is null and status <> 'rejected') then
    raise exception 'SHIFT_OPEN: Bạn đang có một ca chưa kết thúc. Hãy "Ra ca" trước.';
  end if;
  insert into attendance_records (id, worker_id, work_date, started_at, source, device_recorded_at, cycle_id)
    values (p_id, w, vn_today(), now(), 'self', now(), p_cycle) returning * into r;
  return r;
end $$;

create or replace function clock_out(p_id uuid, p_break integer default 0) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare r attendance_records;
begin
  update attendance_records set ended_at = now(), break_minutes = greatest(0, coalesce(p_break, 0))
   where id = p_id and ended_at is null and is_worker_self(worker_id)
  returning * into r;
  if r.id is null then
    select * into r from attendance_records where id = p_id;
    if r.id is not null and r.ended_at is not null then return r; end if; -- bấm lặp
    raise exception 'NOT_FOUND: Không tìm thấy ca đang mở của bạn.';
  end if;
  return r;
end $$;

-- Tổ trưởng/quản lý chấm hộ một ca đã xong. Quản lý/chủ nhập thì xác nhận luôn; tổ trưởng nhập thì chờ xác nhận.
create or replace function record_shift(
  p_id uuid, p_worker uuid, p_start timestamptz, p_end timestamptz, p_break integer default 0,
  p_cycle uuid default null, p_note text default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare org uuid := worker_org(p_worker); admin boolean := is_workforce_admin(worker_org(p_worker)); r attendance_records; mins integer;
begin
  if org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  if p_end is null or p_start is null or p_end <= p_start then raise exception 'INVALID_TIME: Giờ kết thúc phải sau giờ bắt đầu.'; end if;
  if p_end > now() + interval '10 minutes' then raise exception 'INVALID_TIME: Không chấm công cho giờ chưa tới.'; end if;
  if exists (select 1 from attendance_records where id = p_id) then
    select * into r from attendance_records where id = p_id; return r; -- bấm lặp
  end if;
  mins := greatest(0, (extract(epoch from (p_end - p_start)) / 60)::int - greatest(0, coalesce(p_break, 0)));
  insert into attendance_records (id, worker_id, work_date, started_at, ended_at, break_minutes, source, device_recorded_at,
                                  cycle_id, note, entered_late, status, approved_minutes, confirmed_by, confirmed_at)
    values (p_id, p_worker, (p_start at time zone 'Asia/Ho_Chi_Minh')::date, p_start, p_end, greatest(0, coalesce(p_break, 0)),
            case when admin then 'admin'::attendance_source else 'team_leader'::attendance_source end, now(),
            p_cycle, nullif(trim(coalesce(p_note, '')), ''), true,
            case when admin then 'confirmed'::attendance_status else 'needs_confirmation'::attendance_status end,
            case when admin then mins end, case when admin then auth.uid() end, case when admin then now() end)
    returning * into r;
  return r;
end $$;

-- Xác nhận công (có thể chỉnh số phút được duyệt). Người không được xác nhận công của chính mình.
create or replace function confirm_attendance(p_id uuid, p_minutes integer default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare a attendance_records; r attendance_records;
begin
  select * into a from attendance_records where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi công.'; end if;
  if a.ended_at is null then raise exception 'SHIFT_OPEN: Ca chưa kết thúc nên chưa xác nhận được.'; end if;
  if is_worker_self(a.worker_id) and not is_workforce_admin(a.organization_id) then
    raise exception 'FORBIDDEN: Bạn không tự xác nhận công của chính mình. Hãy nhờ tổ trưởng hoặc quản lý.';
  end if;
  if p_minutes is not null and p_minutes < 0 then raise exception 'INVALID_MINUTES: Số phút không được âm.'; end if;
  update attendance_records set status = 'confirmed', approved_minutes = coalesce(p_minutes, declared_minutes, 0),
         confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id returning * into r;
  if r.id is null then raise exception 'FORBIDDEN: Bạn không có quyền xác nhận công này.'; end if;
  return r;
end $$;

create or replace function reject_attendance(p_id uuid, p_reason text) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare a attendance_records; r attendance_records;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do từ chối.'; end if;
  select * into a from attendance_records where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi công.'; end if;
  if is_worker_self(a.worker_id) and not is_workforce_admin(a.organization_id) then
    raise exception 'FORBIDDEN: Bạn không tự từ chối công của chính mình.';
  end if;
  update attendance_records set status = 'rejected', exception_reason = trim(p_reason), confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id returning * into r;
  if r.id is null then raise exception 'FORBIDDEN: Bạn không có quyền xử lý công này.'; end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Sản lượng
-- ---------------------------------------------------------------------------
create or replace function record_output(
  p_id uuid, p_worker uuid, p_date date, p_cycle uuid, p_work_type uuid, p_qty numeric, p_unit text, p_note text default null)
returns work_output_records
language plpgsql security invoker set search_path = public as $$
declare admin boolean := is_workforce_admin(worker_org(p_worker)); r work_output_records;
begin
  if worker_org(p_worker) is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QUANTITY: Sản lượng phải lớn hơn 0.'; end if;
  if p_unit is null or length(trim(p_unit)) = 0 then raise exception 'INVALID_UNIT: Hãy nhập đơn vị (kg, giỏ, cây...).'; end if;
  if p_date is null or p_date > vn_today() then raise exception 'INVALID_DATE: Ngày ghi sản lượng không được sau hôm nay.'; end if;
  if exists (select 1 from work_output_records where id = p_id) then
    select * into r from work_output_records where id = p_id; return r;
  end if;
  insert into work_output_records (id, work_date, worker_id, team_id, cycle_id, work_type_id, quantity, unit, source, note, status, confirmed_by, confirmed_at)
    values (p_id, p_date, p_worker,
            (select m.team_id from worker_team_memberships m where m.worker_id = p_worker and m.valid_to is null limit 1),
            p_cycle, p_work_type, p_qty, trim(p_unit),
            case when admin then 'admin'::attendance_source else 'team_leader'::attendance_source end,
            nullif(trim(coalesce(p_note, '')), ''),
            case when admin then 'confirmed'::output_status else 'draft'::output_status end,
            case when admin then auth.uid() end, case when admin then now() end)
    returning * into r;
  return r;
end $$;

create or replace function confirm_output(p_id uuid) returns work_output_records
language plpgsql security invoker set search_path = public as $$
declare o work_output_records; r work_output_records;
begin
  select * into o from work_output_records where id = p_id;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi sản lượng.'; end if;
  if is_worker_self(o.worker_id) and not is_workforce_admin(o.organization_id) then
    raise exception 'FORBIDDEN: Bạn không tự xác nhận sản lượng của chính mình.';
  end if;
  update work_output_records set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id returning * into r;
  if r.id is null then raise exception 'FORBIDDEN: Bạn không có quyền xác nhận sản lượng này.'; end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Đơn giá áp dụng: cụ thể nhất thắng (người > tổ > cả cơ sở; theo loại việc; mới nhất)
-- ---------------------------------------------------------------------------
create or replace function resolve_rate(p_org uuid, p_worker uuid, p_type rate_type, p_work_type uuid, p_unit text, p_date date)
returns work_rates
language sql stable security definer set search_path = public as $$
  select r.* from work_rates r
   where r.organization_id = p_org and r.is_active and r.rate_type = p_type
     and r.valid_from <= p_date and (r.valid_to is null or r.valid_to >= p_date)
     and (r.worker_id is null or r.worker_id = p_worker)
     and (r.team_id is null or r.team_id in (select m.team_id from worker_team_memberships m
            where m.worker_id = p_worker and m.valid_from <= p_date and (m.valid_to is null or m.valid_to >= p_date)))
     and (p_type = 'quantity' or r.work_type_id is null)
     and (p_type = 'hour' or r.unit = p_unit)
     and (r.work_type_id is null or r.work_type_id = p_work_type)
   order by (r.worker_id is not null) desc, (r.team_id is not null) desc, (r.work_type_id is not null) desc, r.valid_from desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Tính bảng lương một kỳ (làm lại từ đầu mỗi lần, chỉ khi kỳ chưa khóa). Công/sản lượng thiếu đơn giá được báo, không tự tính 0.
-- ---------------------------------------------------------------------------
create or replace function compute_payroll(p_period uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  per payroll_periods; a record; o record; rt work_rates; sid uuid; qty numeric; amt numeric;
  miss_a integer := 0; miss_o integer := 0; n_lines integer := 0; total numeric;
begin
  select * into per from payroll_periods where id = p_period;
  if per.id is null or not is_workforce_admin(per.organization_id) then
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
    if rt.id is null then miss_a := miss_a + 1; continue; end if;
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

  for o in
    select * from work_output_records wo
     where wo.organization_id = per.organization_id and wo.work_date between per.start_date and per.end_date
       and wo.status in ('confirmed', 'approved')
       and not exists (select 1 from pay_statement_lines l where l.output_id = wo.id)
     order by wo.work_date
  loop
    rt := resolve_rate(per.organization_id, o.worker_id, 'quantity', o.work_type_id, o.unit, o.work_date);
    if rt.id is null then miss_o := miss_o + 1; continue; end if;
    select id into sid from worker_pay_statements where period_id = p_period and worker_id = o.worker_id;
    if sid is null then
      insert into worker_pay_statements (period_id, organization_id, worker_id) values (p_period, per.organization_id, o.worker_id) returning id into sid;
    end if;
    amt := round(o.quantity * rt.amount);
    insert into pay_statement_lines (statement_id, organization_id, line_type, output_id, quantity, unit, rate_id, rate_amount, amount, explanation)
      values (sid, per.organization_id, 'output', o.id, o.quantity, o.unit, rt.id, rt.amount, amt,
              format('%s %s × %s đ/%s (ngày %s)', trim_scale(o.quantity), o.unit, trim_scale(rt.amount), o.unit, to_char(o.work_date, 'DD/MM/YYYY')));
    n_lines := n_lines + 1;
  end loop;

  -- người chỉ có khoản cộng/trừ trong kỳ cũng có bảng
  insert into worker_pay_statements (period_id, organization_id, worker_id)
    select distinct p_period, per.organization_id, pa.worker_id from pay_adjustments pa
     where pa.period_id = p_period
       and not exists (select 1 from worker_pay_statements s where s.period_id = p_period and s.worker_id = pa.worker_id);

  update worker_pay_statements s set total_estimated =
      coalesce((select sum(l.amount) from pay_statement_lines l where l.statement_id = s.id), 0)
    + coalesce((select sum(case pa.kind when 'bonus' then pa.amount else -pa.amount end) from pay_adjustments pa
                 where pa.period_id = p_period and pa.worker_id = s.worker_id), 0)
   where s.period_id = p_period;

  select coalesce(sum(total_estimated), 0) into total from worker_pay_statements where period_id = p_period;
  return jsonb_build_object('lines', n_lines, 'missing_rate_hours', miss_a, 'missing_rate_output', miss_o, 'total', total,
                            'workers', (select count(*) from worker_pay_statements where period_id = p_period));
end $$;

-- Chủ khóa kỳ: chốt số đã duyệt. Mở khóa: chỉ chủ, bắt buộc có lý do, ghi audit.
create or replace function lock_payroll(p_period uuid) returns void
language plpgsql security definer set search_path = public as $$
declare per payroll_periods;
begin
  select * into per from payroll_periods where id = p_period;
  if per.id is null or not has_org_role(per.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được khóa kỳ lương.';
  end if;
  if per.status = 'locked' then return; end if;
  update worker_pay_statements set total_approved = total_estimated where period_id = p_period;
  update payroll_periods set status = 'locked' where id = p_period;
end $$;

create or replace function unlock_payroll(p_period uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare per payroll_periods;
begin
  select * into per from payroll_periods where id = p_period;
  if per.id is null or not has_org_role(per.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được mở khóa kỳ lương.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do mở khóa (ít nhất 5 ký tự).'; end if;
  if per.status <> 'locked' then return; end if;
  update payroll_periods set status = 'draft' where id = p_period;
  update worker_pay_statements set total_approved = null where period_id = p_period;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
    values (per.organization_id, auth.uid(), 'unlock', 'payroll_period', p_period::text,
            jsonb_build_object('status', 'locked'), jsonb_build_object('status', 'draft'), trim(p_reason));
end $$;

revoke execute on function vn_today(), my_worker_id(uuid), clock_in(uuid, uuid, uuid), clock_out(uuid, integer),
  record_shift(uuid, uuid, timestamptz, timestamptz, integer, uuid, text), confirm_attendance(uuid, integer), reject_attendance(uuid, text),
  record_output(uuid, uuid, date, uuid, uuid, numeric, text, text), confirm_output(uuid), resolve_rate(uuid, uuid, rate_type, uuid, text, date),
  compute_payroll(uuid), lock_payroll(uuid), unlock_payroll(uuid, text) from public, anon;
revoke execute on function resolve_rate(uuid, uuid, rate_type, uuid, text, date) from authenticated;
grant execute on function vn_today(), my_worker_id(uuid), clock_in(uuid, uuid, uuid), clock_out(uuid, integer),
  record_shift(uuid, uuid, timestamptz, timestamptz, integer, uuid, text), confirm_attendance(uuid, integer), reject_attendance(uuid, text),
  record_output(uuid, uuid, date, uuid, uuid, numeric, text, text), confirm_output(uuid),
  compute_payroll(uuid), lock_payroll(uuid), unlock_payroll(uuid, text) to authenticated, service_role;
