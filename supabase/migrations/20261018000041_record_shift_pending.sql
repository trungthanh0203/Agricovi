-- D56: chấm công hộ luôn ở trạng thái "Chờ xác nhận" (kể cả khi chủ/quản lý nhập) để còn xem lại, sửa hoặc từ chối trước khi tính tiền.
-- Thêm kiểm tra trùng giờ của cùng một người ngay ở máy chủ.
create or replace function record_shift(
  p_id uuid, p_worker uuid, p_start timestamptz, p_end timestamptz, p_break integer default 0,
  p_cycle uuid default null, p_note text default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare org uuid := worker_org(p_worker); admin boolean := is_workforce_admin(worker_org(p_worker)); r attendance_records;
begin
  if org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  if p_end is null or p_start is null or p_end <= p_start then raise exception 'INVALID_TIME: Giờ kết thúc phải sau giờ bắt đầu.'; end if;
  if p_end > now() + interval '10 minutes' then raise exception 'INVALID_TIME: Không chấm công cho giờ chưa tới.'; end if;
  if exists (select 1 from attendance_records where id = p_id) then
    select * into r from attendance_records where id = p_id; return r; -- bấm lặp
  end if;
  if exists (select 1 from attendance_records a where a.worker_id = p_worker and a.status <> 'rejected'
               and a.started_at < p_end and (a.ended_at is null or a.ended_at > p_start)) then
    raise exception 'DUPLICATE: Người này đã có công trùng giờ với khoảng thời gian vừa nhập.';
  end if;
  insert into attendance_records (id, worker_id, work_date, started_at, ended_at, break_minutes, source, device_recorded_at,
                                  cycle_id, note, entered_late, status)
    values (p_id, p_worker, (p_start at time zone 'Asia/Ho_Chi_Minh')::date, p_start, p_end, greatest(0, coalesce(p_break, 0)),
            case when admin then 'admin'::attendance_source else 'team_leader'::attendance_source end, now(),
            p_cycle, nullif(trim(coalesce(p_note, '')), ''), true, 'needs_confirmation'::attendance_status)
    returning * into r;
  return r;
end $$;
