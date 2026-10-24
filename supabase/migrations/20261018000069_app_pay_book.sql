-- D87: BẢNG LƯƠNG xem được theo người (giai đoạn 1-2). Mỗi người xem của chính mình (giờ công từng ngày, lương, thưởng, phạt, tạm ứng, thực nhận);
-- chủ và người có quyền Tiền công (mức xem) xem một người, tất cả hoặc theo tổ. Chỉ ĐỌC; tính ở máy chủ cho khớp với "Tính tiền công".
-- Mỗi khoản có trạng thái: locked (kỳ đã khóa) · calculated (đã có trong bảng lương, kỳ chưa khóa) · estimate (chưa vào kỳ nào: ƯỚC TÍNH theo
-- đơn giá hiện hành, có thể đổi) · no_rate (chưa có cách trả công) · pending (chờ xác nhận) · open (đang trong ca) · rejected (bị từ chối).

-- Ai được xem của ai: người có quyền Tiền công (xem) xem mọi người; còn lại chỉ xem chính mình
create or replace function pay_scope(p_org uuid, p_worker uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare mine uuid := my_worker_id(p_org);
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Cần đăng nhập.'; end if;
  if has_perm(p_org, 'payroll', 'view') then
    if p_worker is not null then
      if not exists (select 1 from worker_profiles w where w.id = p_worker and w.organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy người này.'; end if;
      return array[p_worker];
    end if;
    return array(select w.id from worker_profiles w where w.organization_id = p_org);
  end if;
  if not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  if p_worker is not null and p_worker is distinct from mine then raise exception 'FORBIDDEN: Bạn chỉ xem được bảng lương của chính mình.'; end if;
  return case when mine is null then '{}'::uuid[] else array[mine] end;
end $$;

-- Các khoản (nội bộ): công theo ngày, lương cố định theo tháng, thưởng/phạt/tạm ứng. amount mang dấu (phạt, tạm ứng là số âm).
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
  select pa.worker_id, pa.kind::text, pp.end_date, pa.id, 0,
         case pa.kind when 'bonus' then pa.amount else -pa.amount end, null::numeric,
         case when pp.status = 'locked' then 'locked' else 'calculated' end, pa.reason, null::timestamptz, null::timestamptz, null::integer
    from pay_adjustments pa join payroll_periods pp on pp.id = pa.period_id
   where pa.organization_id = p_org and pp.end_date between p_from and p_to and pa.worker_id = any (p_workers);
$$;
revoke execute on function pay_scope(uuid, uuid), pay_items(uuid, date, date, uuid[]) from public, anon;
revoke execute on function pay_items(uuid, date, date, uuid[]) from authenticated;
grant execute on function pay_scope(uuid, uuid) to authenticated, service_role;

-- Tổng hợp mỗi người một dòng (xem tất cả / theo tổ / một người)
create or replace function get_pay_overview(p_org uuid, p_from date, p_to date, p_worker uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ws uuid[]; res jsonb;
begin
  ws := pay_scope(p_org, p_worker);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_to - p_from > 800 then raise exception 'INVALID_DATE: Chỉ xem tối đa khoảng 2 năm một lần.'; end if;
  select coalesce(jsonb_agg(x.r order by x.r->>'name'), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'worker_id', w.id, 'name', w.full_name, 'user_id', w.user_id, 'status', w.status,
      'team_id', t.id, 'team_name', t.name,
      'hours', round(coalesce(sum(i.minutes) filter (where i.kind = 'hours'), 0) / 60.0, 2),
      'pending_hours', round(coalesce(sum(i.minutes) filter (where i.kind = 'pending'), 0) / 60.0, 2),
      'days', count(distinct i.item_date) filter (where i.kind = 'hours'),
      'hourly', coalesce(sum(i.amount) filter (where i.kind = 'hours'), 0),
      'salary', coalesce(sum(i.amount) filter (where i.kind = 'salary'), 0),
      'bonus', coalesce(sum(i.amount) filter (where i.kind = 'bonus'), 0),
      'deduction', coalesce(-sum(i.amount) filter (where i.kind = 'deduction'), 0),
      'advance', coalesce(-sum(i.amount) filter (where i.kind = 'advance'), 0),
      'net', coalesce(sum(i.amount) filter (where i.kind in ('hours', 'salary', 'bonus', 'deduction', 'advance')), 0),
      'net_locked', coalesce(sum(i.amount) filter (where i.kind in ('hours', 'salary', 'bonus', 'deduction', 'advance') and i.status = 'locked'), 0),
      'no_rate_days', count(*) filter (where i.status = 'no_rate')) as r
      from worker_profiles w
      left join worker_team_memberships tm on tm.worker_id = w.id and tm.valid_to is null
      left join worker_teams t on t.id = tm.team_id
      left join pay_items(p_org, p_from, p_to, ws) i on i.worker_id = w.id
     where w.id = any (ws)
     group by w.id, t.id) x;
  return jsonb_build_object('from', p_from, 'to', p_to, 'generated_at', now(), 'can_see_all', has_perm(p_org, 'payroll', 'view'), 'workers', res);
end $$;

-- Chi tiết một người: từng ngày công (vào ca / ra ca), lương tháng, thưởng/phạt/tạm ứng
create or replace function get_pay_detail(p_org uuid, p_worker uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ws uuid[]; res jsonb;
begin
  if p_worker is null then raise exception 'INVALID: Hãy chọn người.'; end if;
  ws := pay_scope(p_org, p_worker);
  if cardinality(ws) = 0 then return jsonb_build_object('items', '[]'::jsonb); end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_to - p_from > 800 then raise exception 'INVALID_DATE: Chỉ xem tối đa khoảng 2 năm một lần.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', i.kind, 'date', i.item_date, 'id', i.ref, 'minutes', i.minutes, 'amount', i.amount, 'rate', i.rate, 'status', i.status,
      'label', i.label, 'started_at', i.started_at, 'ended_at', i.ended_at, 'break_minutes', i.break_minutes)
      order by i.item_date desc, i.started_at desc nulls last), '[]'::jsonb) into res
    from pay_items(p_org, p_from, p_to, ws) i;
  return jsonb_build_object('worker_id', p_worker, 'from', p_from, 'to', p_to, 'generated_at', now(), 'items', res);
end $$;
revoke execute on function get_pay_overview(uuid, date, date, uuid), get_pay_detail(uuid, uuid, date, date) from public, anon;
grant execute on function get_pay_overview(uuid, date, date, uuid), get_pay_detail(uuid, uuid, date, date) to authenticated, service_role;
