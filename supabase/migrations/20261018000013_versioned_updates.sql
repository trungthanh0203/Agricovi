-- Bước B: sửa/hủy nhật ký và phát hiện xung đột khi đồng bộ (FR-LOG-004/005, FR-SYNC-004, v1.1 mục 8.3).
-- Nguyên tắc: không dùng "bản ghi đến sau luôn thắng". Mỗi lần sửa gửi kèm phiên bản đã thấy (expected_version);
-- máy chủ chỉ áp dụng khi khớp, nếu không thì báo CONFLICT để người dùng chọn cách giải quyết.
-- Mỗi lần sửa có mã riêng (op_id) nên gửi lặp sau khi mất mạng không bị coi nhầm là xung đột.

alter table activity_logs add column last_op_id uuid;
alter table production_cycles add column last_op_id uuid;

-- ---------------------------------------------------------------------------
-- Trường bất biến của nhật ký; bản ghi đã hủy không khôi phục/sửa nội dung
-- ---------------------------------------------------------------------------
create or replace function activity_log_update_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.organization_id is distinct from old.organization_id
     or new.cycle_id is distinct from old.cycle_id
     or new.area_id is distinct from old.area_id
     or new.created_by is distinct from old.created_by
     or new.performed_by is distinct from old.performed_by
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at then
    raise exception 'IMMUTABLE_FIELD: Không đổi được vụ, người ghi hoặc nguồn của nhật ký. Hãy hủy bản ghi và ghi lại.';
  end if;
  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'VOIDED: Bản ghi đã hủy, không khôi phục được. Hãy ghi lại một bản ghi mới.';
    end if;
    if new.data is distinct from old.data or new.note is distinct from old.note
       or new.performed_at is distinct from old.performed_at or new.work_type_id is distinct from old.work_type_id then
      raise exception 'VOIDED: Bản ghi đã hủy, không sửa nội dung được.';
    end if;
  end if;
  return new;
end $$;
create trigger activity_logs_guard before update on activity_logs
  for each row execute function activity_log_update_guard();

-- Người ghi được sửa/hủy bản ghi CỦA MÌNH trong 24 giờ kể từ khi máy chủ nhận [GIẢ ĐỊNH, docs/DECISIONS.md D15].
-- Chủ/quản lý sửa mọi bản ghi theo chính sách logs_update đã có.
create policy logs_update_own on activity_logs for update to authenticated
  using (created_by = auth.uid() and received_at > now() - interval '24 hours' and can_log(organization_id, cycle_id))
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Sửa có kiểm tra phiên bản. security INVOKER: RLS của người gọi vẫn có hiệu lực.
-- ---------------------------------------------------------------------------
create or replace function update_activity_log(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns activity_logs
language plpgsql security invoker set search_path = public as $$
declare r activity_logs; cur activity_logs;
begin
  update activity_logs set
    data         = case when p_changes ? 'data'         then p_changes->'data' else data end,
    note         = case when p_changes ? 'note'         then nullif(p_changes->>'note', '') else note end,
    performed_at = case when p_changes ? 'performed_at' then (p_changes->>'performed_at')::timestamptz else performed_at end,
    work_type_id = case when p_changes ? 'work_type_id' then (p_changes->>'work_type_id')::uuid else work_type_id end,
    voided_at    = case when p_changes ? 'voided_at'    then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason  = case when p_changes ? 'void_reason'  then p_changes->>'void_reason' else void_reason end,
    last_op_id   = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from activity_logs where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy bản ghi hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;  -- lần gửi lặp của một thay đổi đã được áp dụng
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Bản ghi đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa bản ghi này (chỉ chủ/quản lý, hoặc người ghi trong 24 giờ đầu).';
end $$;

-- Sửa vụ có kiểm tra phiên bản: trạng thái, ngày bắt đầu, ghi chú
create or replace function update_cycle(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns production_cycles
language plpgsql security invoker set search_path = public as $$
declare r production_cycles; cur production_cycles;
begin
  update production_cycles set
    status     = case when p_changes ? 'status'     then (p_changes->>'status')::cycle_status else status end,
    start_date = case when p_changes ? 'start_date' then (p_changes->>'start_date')::date else start_date end,
    note       = case when p_changes ? 'note'       then nullif(p_changes->>'note', '') else note end,
    last_op_id = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from production_cycles where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy vụ hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Vụ đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa vụ này.';
end $$;

revoke execute on function update_activity_log(uuid, integer, uuid, jsonb), update_cycle(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function update_activity_log(uuid, integer, uuid, jsonb), update_cycle(uuid, integer, uuid, jsonb) to authenticated, service_role;
