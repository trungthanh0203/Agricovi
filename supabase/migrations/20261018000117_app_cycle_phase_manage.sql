-- Sửa/xóa CÔNG ĐOẠN của vụ đã tạo (công đoạn là nhãn nhóm chụp từ quy trình mẫu trên từng việc của vụ) và chuyển việc sang công đoạn khác.
-- Chỉ đổi vụ này, không đổi quy trình mẫu. Quyền và điều kiện giống sửa việc của vụ (cycle_stage_edit_guard).

-- Sửa việc của vụ: thêm đổi công đoạn (phase_name / phase_code; chuỗi rỗng = bỏ khỏi công đoạn)
create or replace function update_cycle_stage(p_stage uuid, p_changes jsonb) returns production_stages
language plpgsql security definer set search_path = public as $$
declare st production_stages; r production_stages; v_name text; v_wt uuid;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null then raise exception 'NOT_FOUND: Không tìm thấy giai đoạn.'; end if;
  perform cycle_stage_edit_guard(st.cycle_id);
  v_name := case when p_changes ? 'name' then trim(p_changes->>'name') else st.name end;
  if v_name is null or length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'INVALID_NAME: Tên giai đoạn cần từ 1 đến 120 ký tự.';
  end if;
  if p_changes ? 'phase_name' and length(coalesce(p_changes->>'phase_name', '')) > 120 then
    raise exception 'INVALID_NAME: Tên công đoạn tối đa 120 ký tự.';
  end if;
  v_wt := case when p_changes ? 'work_type_id' then nullif(p_changes->>'work_type_id', '')::uuid else st.work_type_id end;
  update production_stages set
    name = v_name,
    work_type_id = v_wt,
    planned_start = case when p_changes ? 'planned_start' then (p_changes->>'planned_start')::date else planned_start end,
    planned_end   = case when p_changes ? 'planned_end'   then (p_changes->>'planned_end')::date else planned_end end,
    note = case when p_changes ? 'note' then nullif(trim(p_changes->>'note'), '') else note end,
    phase_name = case when p_changes ? 'phase_name' then nullif(trim(p_changes->>'phase_name'), '') else phase_name end,
    phase_code = case when p_changes ? 'phase_name' then nullif(trim(coalesce(p_changes->>'phase_code', '')), '') else phase_code end
  where id = p_stage returning * into r;
  if r.planned_start is not null and r.planned_end is not null and r.planned_end < r.planned_start then
    raise exception 'INVALID_DATE: Ngày kết thúc kế hoạch không thể trước ngày bắt đầu.';
  end if;
  update production_stages set duration_days = case when r.planned_start is not null and r.planned_end is not null
    then (r.planned_end - r.planned_start) + 1 else duration_days end where id = p_stage returning * into r;
  perform sync_cycle_end(st.cycle_id);
  return r;
end $$;

-- Đổi số thứ tự (mã) và tên của một công đoạn trong vụ: áp cho mọi việc đang mang tên công đoạn cũ; trả về số việc được đổi
create or replace function update_cycle_phase(p_cycle uuid, p_old_name text, p_new_code text, p_new_name text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; v_name text := nullif(trim(p_new_name), '');
begin
  perform cycle_stage_edit_guard(p_cycle);
  if v_name is null or length(v_name) > 120 then raise exception 'INVALID_NAME: Tên công đoạn cần từ 1 đến 120 ký tự.'; end if;
  if length(coalesce(p_new_code, '')) > 20 then raise exception 'INVALID_NAME: Số thứ tự (mã) tối đa 20 ký tự.'; end if;
  update production_stages set phase_name = v_name, phase_code = nullif(trim(coalesce(p_new_code, '')), '')
   where cycle_id = p_cycle and phase_name = p_old_name;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOT_FOUND: Không tìm thấy công đoạn này trong vụ.'; end if;
  return n;
end $$;

-- Xóa một công đoạn khỏi vụ. p_with_items = false: giữ các việc, chỉ bỏ khỏi công đoạn. true: xóa luôn các việc của công đoạn
-- (chỉ khi mọi việc còn "chưa làm" và chưa có nhật ký gắn vào, giống xóa việc).
create or replace function delete_cycle_phase(p_cycle uuid, p_name text, p_with_items boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform cycle_stage_edit_guard(p_cycle);
  if not exists (select 1 from production_stages where cycle_id = p_cycle and phase_name = p_name) then
    raise exception 'NOT_FOUND: Không tìm thấy công đoạn này trong vụ.';
  end if;
  if not p_with_items then
    update production_stages set phase_name = null, phase_code = null where cycle_id = p_cycle and phase_name = p_name;
    get diagnostics n = row_count;
    return n;
  end if;
  if exists (select 1 from production_stages s where s.cycle_id = p_cycle and s.phase_name = p_name and s.status <> 'pending') then
    raise exception 'INVALID_TRANSITION: Công đoạn có việc đã bắt đầu hoặc đã xong nên không xóa cả công đoạn được.';
  end if;
  if exists (select 1 from production_stages s join activity_logs l on l.stage_id = s.id where s.cycle_id = p_cycle and s.phase_name = p_name) then
    raise exception 'HAS_DATA: Công đoạn có việc đã ghi nhật ký nên không xóa cả công đoạn được.';
  end if;
  delete from production_stages where cycle_id = p_cycle and phase_name = p_name;
  get diagnostics n = row_count;
  perform sync_cycle_end(p_cycle);
  return n;
end $$;

revoke execute on function update_cycle_phase(uuid, text, text, text), delete_cycle_phase(uuid, text, boolean) from public, anon;
grant execute on function update_cycle_phase(uuid, text, text, text), delete_cycle_phase(uuid, text, boolean) to authenticated, service_role;
