-- D190: ghi nghỉ việc, bước 2 (docs/PLAN_GHI_NGHI.md): số ngày phép năm của cơ sở và tổng hợp ngày nghỉ theo người/tháng/loại.
-- Ngày nghỉ tính theo ngày dương lịch (không loại trừ thứ bảy, chủ nhật); nửa ngày = 0,5. Ghi nghỉ vắt qua năm thì chỉ tính phần trong năm.
-- Chưa chặn khi vượt phép năm, chỉ cho biết còn lại (có thể âm).

alter table organizations add column annual_leave_days integer not null default 12 check (annual_leave_days between 0 and 60);

create or replace function set_annual_leave_days(p_org uuid, p_days integer) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở đặt số ngày phép năm.'; end if;
  if p_days is null or p_days < 0 or p_days > 60 then raise exception 'INVALID_ARGUMENT: Số ngày phép năm từ 0 đến 60.'; end if;
  update organizations set annual_leave_days = p_days where id = p_org;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'set_annual_leave_days', 'organization', p_org::text, jsonb_build_object('days', p_days));
  return p_days;
end $$;
revoke execute on function set_annual_leave_days(uuid, integer) from public, anon;
grant execute on function set_annual_leave_days(uuid, integer) to authenticated;

-- Tổng hợp ngày nghỉ của một năm: {allowance, rows:[{worker_id, month, kind, days}]}. SECURITY INVOKER: người xem chỉ thấy các ghi nghỉ mình được đọc (RLS).
create or replace function absence_year_summary(p_org uuid, p_year integer, p_worker uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare y0 date; y1 date; v_rows jsonb; v_allow integer;
begin
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'INVALID_ARGUMENT: Năm chưa đúng.'; end if;
  y0 := make_date(p_year, 1, 1); y1 := make_date(p_year, 12, 31);
  select annual_leave_days into v_allow from organizations where id = p_org;
  select coalesce(jsonb_agg(jsonb_build_object('worker_id', worker_id, 'month', m, 'kind', kind, 'days', days) order by worker_id, m, kind), '[]'::jsonb)
    into v_rows
    from (
      select a.worker_id, extract(month from d)::int m, a.kind, sum(case when a.half_day then 0.5 else 1 end)::numeric days
        from worker_absences a
        cross join lateral generate_series(greatest(a.from_date, y0), least(a.to_date, y1), interval '1 day') d
       where a.organization_id = p_org and a.status = 'active' and a.from_date <= y1 and a.to_date >= y0
         and (p_worker is null or a.worker_id = p_worker)
       group by a.worker_id, extract(month from d), a.kind
    ) t;
  return jsonb_build_object('allowance', coalesce(v_allow, 12), 'rows', v_rows);
end $$;
revoke execute on function absence_year_summary(uuid, integer, uuid) from public, anon;
grant execute on function absence_year_summary(uuid, integer, uuid) to authenticated;
