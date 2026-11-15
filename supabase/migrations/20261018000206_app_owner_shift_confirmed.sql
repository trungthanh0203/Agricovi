-- D169: công do CHỦ cơ sở nhập ở "Chấm công cho người làm" được duyệt (Hợp lệ) ngay, không cần bước xác nhận.
-- Quản lý và tổ trưởng nhập vẫn ở "Chờ xác nhận" như D56. Giữ nguyên kiểm trùng giờ.
create or replace function record_shift(
  p_id uuid, p_worker uuid, p_start timestamptz, p_end timestamptz, p_break integer default 0,
  p_cycle uuid default null, p_note text default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := worker_org(p_worker);
  v_admin boolean := is_workforce_admin(worker_org(p_worker));
  v_owner boolean := has_org_role(worker_org(p_worker), array['owner']::member_role[]);
  v_mins integer;
  r attendance_records;
begin
  if v_org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  if p_end is null or p_start is null or p_end <= p_start then raise exception 'INVALID_TIME: Giờ kết thúc phải sau giờ bắt đầu.'; end if;
  if p_end > now() + interval '10 minutes' then raise exception 'INVALID_TIME: Không chấm công cho giờ chưa tới.'; end if;
  if exists (select 1 from attendance_records where id = p_id) then
    select * into r from attendance_records where id = p_id; return r; -- bấm lặp
  end if;
  if exists (select 1 from attendance_records a where a.worker_id = p_worker and a.status <> 'rejected'
               and a.started_at < p_end and (a.ended_at is null or a.ended_at > p_start)) then
    raise exception 'DUPLICATE: Người này đã có công trùng giờ với khoảng thời gian vừa nhập.';
  end if;
  v_mins := greatest(0, (extract(epoch from (p_end - p_start)) / 60)::int - greatest(0, coalesce(p_break, 0)));
  insert into attendance_records (id, worker_id, work_date, started_at, ended_at, break_minutes, source, device_recorded_at,
                                  cycle_id, note, entered_late, status, approved_minutes, confirmed_by, confirmed_at)
    values (p_id, p_worker, (p_start at time zone 'Asia/Ho_Chi_Minh')::date, p_start, p_end, greatest(0, coalesce(p_break, 0)),
            case when v_admin then 'admin'::attendance_source else 'team_leader'::attendance_source end, now(),
            p_cycle, nullif(trim(coalesce(p_note, '')), ''), true,
            case when v_owner then 'confirmed'::attendance_status else 'needs_confirmation'::attendance_status end,
            case when v_owner then v_mins end, case when v_owner then auth.uid() end, case when v_owner then now() end)
    returning * into r;
  return r;
end $$;
