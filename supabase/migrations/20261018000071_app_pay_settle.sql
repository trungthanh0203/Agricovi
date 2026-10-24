-- D89: CHỐT LƯƠNG NGAY TRONG BẢNG LƯƠNG. Kỳ lương luôn là CẢ THÁNG (tạo tự động khi tính); khóa kỳ bị CHẶN nếu còn việc chưa xong
-- (công chờ xác nhận, ca đang mở, yêu cầu sửa công chờ duyệt, người chưa có cách trả công, công mới chưa tính); thêm/sửa/xóa thưởng-phạt-tạm ứng tự tính lại.

-- Mỗi tổ chức chỉ một kỳ cho cùng khoảng ngày
create unique index payroll_period_unique_range on payroll_periods (organization_id, start_date, end_date);

-- Việc còn dang dở của một khoảng ngày (nội bộ)
create or replace function payroll_blockers(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pend integer; opn integer; reqs integer; todo integer; miss jsonb; msgs text[] := '{}';
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
  if pend > 0 then msgs := msgs || format('%s ca công đang chờ xác nhận', pend); end if;
  if opn > 0 then msgs := msgs || format('%s ca đang mở (chưa ra ca)', opn); end if;
  if reqs > 0 then msgs := msgs || format('%s yêu cầu sửa công chờ duyệt', reqs); end if;
  if jsonb_array_length(miss) > 0 then msgs := msgs || format('%s người chưa có cách trả công', jsonb_array_length(miss)); end if;
  if todo > 0 then msgs := msgs || format('%s ca công mới chưa tính (hãy Tính lại)', todo); end if;
  return jsonb_build_object('pending_attendance', pend, 'open_shifts', opn, 'pending_requests', reqs, 'missing_rate', miss, 'uncomputed', todo,
                            'blocked', cardinality(msgs) > 0, 'messages', to_jsonb(msgs));
end $$;
revoke execute on function payroll_blockers(uuid, date, date) from public, anon, authenticated;

-- Tạo (nếu chưa có) kỳ lương của một tháng; trả mã kỳ
create or replace function ensure_month_period(p_org uuid, p_month date) returns uuid
language plpgsql security definer set search_path = public as $$
declare s date := date_trunc('month', p_month::timestamp)::date; e date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date; pid uuid;
begin
  if not has_perm(p_org, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập bảng lương.'; end if;
  if s > vn_today() then raise exception 'INVALID_DATE: Chưa tới tháng này.'; end if;
  select id into pid from payroll_periods where organization_id = p_org and start_date = s and end_date = e;
  if pid is not null then return pid; end if;
  if exists (select 1 from payroll_periods where organization_id = p_org and start_date <= e and end_date >= s) then
    raise exception 'PERIOD_OVERLAP: Đã có kỳ lương cũ trùng một phần với tháng này (kỳ tạo theo kiểu cũ). Hãy nhờ quản trị xử lý kỳ đó trước.';
  end if;
  insert into payroll_periods (organization_id, start_date, end_date) values (p_org, s, e) returning id into pid;
  return pid;
end $$;

-- Trạng thái chốt lương của một tháng: kỳ (nếu có), trạng thái, việc còn dang dở
create or replace function get_pay_settle_state(p_org uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s date := date_trunc('month', p_month::timestamp)::date; e date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date; per payroll_periods;
begin
  if not has_perm(p_org, 'payroll', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem việc chốt lương.'; end if;
  select * into per from payroll_periods where organization_id = p_org and start_date = s and end_date = e;
  return jsonb_build_object('month', s, 'from', s, 'to', e, 'period_id', per.id, 'status', coalesce(per.status::text, 'none'),
                            'overlap_legacy', per.id is null and exists (select 1 from payroll_periods where organization_id = p_org and start_date <= e and end_date >= s),
                            'blockers', payroll_blockers(p_org, s, e), 'can_edit', has_perm(p_org, 'payroll', 'edit'), 'is_owner', has_org_role(p_org, array['owner']::member_role[]));
end $$;

-- Tính lương của tháng (tạo kỳ nếu chưa có)
create or replace function settle_month(p_org uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid := ensure_month_period(p_org, p_month);
begin
  return compute_payroll(pid) || jsonb_build_object('period_id', pid);
end $$;

-- Khóa kỳ: CHẶN nếu còn việc chưa xong
create or replace function lock_payroll(p_period uuid) returns void
language plpgsql security definer set search_path = public as $$
declare per payroll_periods; b jsonb;
begin
  select * into per from payroll_periods where id = p_period;
  if per.id is null or not has_org_role(per.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được khóa kỳ lương.';
  end if;
  if per.status = 'locked' then return; end if;
  b := payroll_blockers(per.organization_id, per.start_date, per.end_date);
  if (b->>'blocked')::boolean then
    raise exception 'BLOCKED: Chưa khóa được kỳ vì còn việc chưa xong: %.', array_to_string(array(select jsonb_array_elements_text(b->'messages')), '; ');
  end if;
  update worker_pay_statements set total_approved = total_estimated where period_id = p_period;
  update payroll_periods set status = 'locked' where id = p_period;
end $$;

-- Thưởng / phạt / tạm ứng: thêm, sửa, xóa rồi TỰ TÍNH LẠI bảng lương tháng đó
create or replace function add_pay_adjustment(p_org uuid, p_worker uuid, p_month date, p_kind pay_adjustment_kind, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not has_perm(p_org, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền nhập thưởng/phạt.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Số tiền phải lớn hơn 0.'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do.'; end if;
  if not exists (select 1 from worker_profiles w where w.id = p_worker and w.organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy người này.'; end if;
  pid := ensure_month_period(p_org, p_month);
  insert into pay_adjustments (organization_id, worker_id, period_id, kind, amount, reason) values (p_org, p_worker, pid, p_kind, p_amount, trim(p_reason));
  return compute_payroll(pid) || jsonb_build_object('period_id', pid);
end $$;

create or replace function update_pay_adjustment(p_id uuid, p_kind pay_adjustment_kind, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a pay_adjustments;
begin
  select * into a from pay_adjustments where id = p_id;
  if a.id is null or not has_perm(a.organization_id, 'payroll', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản này.'; end if;
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
  delete from pay_adjustments where id = p_id;
  return compute_payroll(a.period_id) || jsonb_build_object('period_id', a.period_id);
end $$;

revoke execute on function ensure_month_period(uuid, date), get_pay_settle_state(uuid, date), settle_month(uuid, date),
  add_pay_adjustment(uuid, uuid, date, pay_adjustment_kind, numeric, text), update_pay_adjustment(uuid, pay_adjustment_kind, numeric, text), delete_pay_adjustment(uuid) from public, anon;
grant execute on function ensure_month_period(uuid, date), get_pay_settle_state(uuid, date), settle_month(uuid, date),
  add_pay_adjustment(uuid, uuid, date, pay_adjustment_kind, numeric, text), update_pay_adjustment(uuid, pay_adjustment_kind, numeric, text), delete_pay_adjustment(uuid) to authenticated, service_role;
revoke execute on function lock_payroll(uuid) from public, anon;
grant execute on function lock_payroll(uuid) to authenticated, service_role;
