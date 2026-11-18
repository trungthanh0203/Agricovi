-- D198: xử lý nhanh ca "Quên ra ca" cho chủ/quản lý/tổ trưởng (docs/PLAN_TRANG_CHAM_CONG.md).
-- Trước đây ca mở từ hôm trước chỉ gỡ được bằng "Đề nghị sửa giờ" từng ca (chỉ cho ca đã xong) hoặc chờ người làm tự ra ca (đã bỏ ở D117).
-- Hai hàm SECURITY INVOKER nên quyền do chính sách att_update quyết định (chủ/quản lý mọi người; tổ trưởng người trong tổ; không tự đóng ca của mình).
-- Chủ đóng ca thì công được XÁC NHẬN luôn (giống record_shift của chủ); quản lý/tổ trưởng đóng thì chờ xác nhận. Kỳ lương đã khóa: trigger hiện có chặn.

-- Đóng MỘT ca đang mở: p_ended_at là giờ ra do người đóng chọn (phải sau giờ vào, không ở tương lai). Bấm lặp không đổi gì.
create or replace function close_open_shift(p_id uuid, p_ended_at timestamptz, p_break integer default null) returns attendance_records
language plpgsql security invoker set search_path = public as $$
declare a attendance_records; r attendance_records; v_owner boolean; v_break integer; v_mins integer;
begin
  select * into a from attendance_records where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi công.'; end if;
  if a.ended_at is not null then return a; end if;
  if a.status = 'rejected' then raise exception 'INVALID_STATE: Công này đã bị từ chối.'; end if;
  if is_worker_self(a.worker_id) and not is_workforce_admin(a.organization_id) then
    raise exception 'FORBIDDEN: Bạn không tự đóng ca của chính mình. Hãy nhờ tổ trưởng hoặc quản lý.';
  end if;
  if p_ended_at is null or p_ended_at <= a.started_at then raise exception 'INVALID_TIME: Giờ ra phải sau giờ vào.'; end if;
  if p_ended_at > now() + interval '10 minutes' then raise exception 'INVALID_TIME: Không đóng ca cho giờ chưa tới.'; end if;
  v_break := greatest(0, coalesce(p_break, a.break_minutes, 0));
  v_mins := greatest(0, (extract(epoch from (p_ended_at - a.started_at)) / 60)::int - v_break);
  v_owner := has_org_role(a.organization_id, array['owner']::member_role[]);
  update attendance_records set ended_at = p_ended_at, break_minutes = v_break,
         note = nullif(trim(coalesce(note, '') || case when note is null then '' else ' · ' end || 'Đóng ca quên ra ca'), ''),
         status = case when v_owner then 'confirmed'::attendance_status else 'needs_confirmation'::attendance_status end,
         approved_minutes = case when v_owner then v_mins end,
         confirmed_by = case when v_owner then auth.uid() end, confirmed_at = case when v_owner then now() end
   where id = p_id and ended_at is null returning * into r;
  if r.id is null then raise exception 'FORBIDDEN: Bạn không có quyền đóng ca này.'; end if;
  return r;
end $$;

-- Đóng HÀNG LOẠT mọi ca còn mở từ những ngày trước hôm nay, mỗi ca ra lúc p_time (giờ Việt Nam) của chính ngày làm đó.
-- Ca có giờ vào muộn hơn p_time hoặc nằm trong kỳ lương đã khóa thì bỏ qua (đếm vào skipped) để chủ xử lý riêng.
create or replace function close_stale_shifts(p_org uuid, p_time time default '17:00') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a record; v_end timestamptz; v_closed integer := 0; v_skipped integer := 0;
begin
  if p_time is null then raise exception 'INVALID_TIME: Hãy chọn giờ ra.'; end if;
  for a in select id, work_date, started_at from attendance_records
            where organization_id = p_org and ended_at is null and status <> 'rejected' and work_date < vn_today() order by work_date, started_at loop
    v_end := ((a.work_date + p_time) at time zone 'Asia/Ho_Chi_Minh');
    if v_end <= a.started_at then v_skipped := v_skipped + 1; continue; end if;
    begin
      perform close_open_shift(a.id, v_end, null);
      v_closed := v_closed + 1;
    exception when others then v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('closed', v_closed, 'skipped', v_skipped);
end $$;

revoke execute on function close_open_shift(uuid, timestamptz, integer), close_stale_shifts(uuid, time) from public, anon;
grant execute on function close_open_shift(uuid, timestamptz, integer), close_stale_shifts(uuid, time) to authenticated;
