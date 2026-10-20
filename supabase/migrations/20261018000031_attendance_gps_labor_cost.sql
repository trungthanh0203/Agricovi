-- D43 (bước E, lát 2): vị trí khi chấm công, chấm công offline an toàn, yêu cầu sửa công, chi phí nhân công vào tổng kết vụ.

-- ---------------------------------------------------------------------------
-- 1. Bản ghi công do chính người lao động tạo (kể cả gửi từ hàng đợi offline): máy chủ quyết định trạng thái, ngày công
--    và không cho tự xác nhận. Ca đã có giờ ra thì chờ xác nhận; chưa có giờ ra thì đang mở.
-- ---------------------------------------------------------------------------
create or replace function attendance_self_guard() returns trigger language plpgsql as $$
begin
  if new.source = 'self' and auth.uid() is not null then
    if new.started_at > now() + interval '10 minutes' or (new.ended_at is not null and new.ended_at > now() + interval '10 minutes') then
      raise exception 'INVALID_TIME: Không chấm công cho giờ chưa tới.';
    end if;
    new.work_date := (new.started_at at time zone 'Asia/Ho_Chi_Minh')::date;
    new.status := case when new.ended_at is not null then 'needs_confirmation'::attendance_status else 'open'::attendance_status end;
    new.approved_minutes := null; new.confirmed_by := null; new.confirmed_at := null;
    new.entered_late := false;
  end if;
  return new;
end $$;
-- chạy trước attendance_defaults_trg (tên đứng trước theo thứ tự chữ cái)
create trigger attendance_a_self_guard before insert on attendance_records for each row execute function attendance_self_guard();

-- ---------------------------------------------------------------------------
-- 2. Vào/ra ca có vị trí (chỉ lấy tại thời điểm chấm, không theo dõi nền) và vụ tùy chọn
-- ---------------------------------------------------------------------------
drop function clock_in(uuid, uuid, uuid);
drop function clock_out(uuid, integer);

create function clock_in(p_id uuid, p_org uuid, p_cycle uuid default null,
                         p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
returns attendance_records
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
  insert into attendance_records (id, worker_id, work_date, started_at, source, device_recorded_at, cycle_id, start_lat, start_lng, start_accuracy_m)
    values (p_id, w, vn_today(), now(), 'self', now(), p_cycle, p_lat, p_lng, p_acc) returning * into r;
  return r;
end $$;

create function clock_out(p_id uuid, p_break integer default 0, p_lat double precision default null, p_lng double precision default null,
                          p_acc double precision default null, p_cycle uuid default null)
returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare r attendance_records;
begin
  update attendance_records set ended_at = now(), break_minutes = greatest(0, coalesce(p_break, 0)), status = 'needs_confirmation',
         end_lat = p_lat, end_lng = p_lng, end_accuracy_m = p_acc, cycle_id = coalesce(p_cycle, cycle_id)
   where id = p_id and ended_at is null and is_worker_self(worker_id)
  returning * into r;
  if r.id is null then
    select * into r from attendance_records where id = p_id;
    if r.id is not null and r.ended_at is not null then return r; end if; -- bấm lặp
    raise exception 'NOT_FOUND: Không tìm thấy ca đang mở của bạn.';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Yêu cầu sửa công (v1.1 16.9): người lao động hoặc tổ trưởng đề nghị, quản lý/chủ duyệt. Giữ giá trị trước/sau.
-- ---------------------------------------------------------------------------
create or replace function request_attendance_adjustment(p_attendance uuid, p_proposed jsonb, p_reason text) returns attendance_adjustments
language plpgsql security invoker set search_path = public as $$
declare a attendance_records; r attendance_adjustments;
begin
  select * into a from attendance_records where id = p_attendance;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi công.'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do đề nghị sửa.'; end if;
  if p_proposed is null or not (p_proposed ?| array['started_at', 'ended_at', 'break_minutes']) then
    raise exception 'INVALID_ARGUMENT: Hãy nêu giờ vào, giờ ra hoặc phút nghỉ muốn sửa.';
  end if;
  insert into attendance_adjustments (organization_id, attendance_id, problem_type, proposed, before_values, reason)
    values (a.organization_id, a.id, 'time_correction', p_proposed,
            jsonb_build_object('started_at', a.started_at, 'ended_at', a.ended_at, 'break_minutes', a.break_minutes, 'approved_minutes', a.approved_minutes),
            trim(p_reason))
    returning * into r;
  return r;
end $$;

create or replace function decide_attendance_adjustment(p_id uuid, p_approve boolean) returns attendance_adjustments
language plpgsql security definer set search_path = public as $$
declare adj attendance_adjustments; a attendance_records; r attendance_adjustments;
  s timestamptz; e timestamptz; b integer; mins integer;
begin
  select * into adj from attendance_adjustments where id = p_id;
  if adj.id is null or not is_workforce_admin(adj.organization_id) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được duyệt yêu cầu sửa công.';
  end if;
  if adj.status <> 'pending' then raise exception 'INVALID_TRANSITION: Yêu cầu này đã được xử lý.'; end if;
  select * into a from attendance_records where id = adj.attendance_id;
  if p_approve then
    s := coalesce((adj.proposed->>'started_at')::timestamptz, a.started_at);
    e := coalesce((adj.proposed->>'ended_at')::timestamptz, a.ended_at);
    b := coalesce((adj.proposed->>'break_minutes')::integer, a.break_minutes);
    if e is null or e <= s then raise exception 'INVALID_TIME: Giờ ra phải sau giờ vào.'; end if;
    if e > now() + interval '10 minutes' then raise exception 'INVALID_TIME: Không sửa thành giờ chưa tới.'; end if;
    mins := greatest(0, (extract(epoch from (e - s)) / 60)::int - greatest(0, b));
    update attendance_records set started_at = s, ended_at = e, break_minutes = greatest(0, b),
           work_date = (s at time zone 'Asia/Ho_Chi_Minh')::date, status = 'confirmed', approved_minutes = mins,
           confirmed_by = auth.uid(), confirmed_at = now()
     where id = a.id;
  end if;
  update attendance_adjustments set status = case when p_approve then 'approved'::adjustment_status else 'rejected'::adjustment_status end,
         decided_by = auth.uid(), decided_at = now(),
         after_values = case when p_approve then (select jsonb_build_object('started_at', x.started_at, 'ended_at', x.ended_at,
                              'break_minutes', x.break_minutes, 'approved_minutes', x.approved_minutes) from attendance_records x where x.id = a.id) end
   where id = p_id returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tổng kết vụ có chi phí nhân công (tiền công của công/sản lượng gắn vụ): kỳ đã khóa = đã duyệt, kỳ chưa khóa = dự tính
-- ---------------------------------------------------------------------------
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

revoke execute on function clock_in(uuid, uuid, uuid, double precision, double precision, double precision),
  clock_out(uuid, integer, double precision, double precision, double precision, uuid),
  request_attendance_adjustment(uuid, jsonb, text), decide_attendance_adjustment(uuid, boolean) from public, anon;
grant execute on function clock_in(uuid, uuid, uuid, double precision, double precision, double precision),
  clock_out(uuid, integer, double precision, double precision, double precision, uuid),
  request_attendance_adjustment(uuid, jsonb, text), decide_attendance_adjustment(uuid, boolean) to authenticated, service_role;
