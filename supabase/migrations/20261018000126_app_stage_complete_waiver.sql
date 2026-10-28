-- Lối thoát khi bấm Xong mà chưa Ghi việc đủ (migration 0125): CHỈ CHỦ CƠ SỞ được bấm Xong kèm lý do (ít nhất 3 ký tự); máy chủ lưu lý do, người bấm và thời điểm
-- để còn đối chiếu (hiện ở Quản lý vụ). Mở lại việc thì xóa dấu này. Người khác (quản lý, tổ trưởng) vẫn phải ghi đủ.

alter table production_stages
  add column log_waived_reason text check (log_waived_reason is null or length(log_waived_reason) <= 300),
  add column log_waived_by uuid references auth.users(id),
  add column log_waived_at timestamptz;

drop function advance_stage(uuid, text, date);
create function advance_stage(p_stage uuid, p_action text, p_date date default null, p_reason text default null)
returns production_stages
language plpgsql security definer set search_path = public as $$
declare st production_stages; cyc_status cycle_status; d date := coalesce(p_date, current_date); r production_stages; need integer; have integer; waive boolean := false; v_owner uuid;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null or not can_manage_stages(st.cycle_id) then
    raise exception 'FORBIDDEN: Bạn không có quyền thay đổi giai đoạn của vụ này.';
  end if;
  select status, owner_org_id into cyc_status, v_owner from production_cycles where id = st.cycle_id;
  if cyc_status <> 'active' then
    raise exception 'CYCLE_NOT_ACTIVE: Chỉ vụ đang sản xuất mới bắt đầu hoặc hoàn thành giai đoạn.';
  end if;
  if p_action = 'start' then
    if st.status <> 'pending' then raise exception 'INVALID_TRANSITION: Giai đoạn này đã bắt đầu rồi.'; end if;
    update production_stages set status = 'in_progress', actual_start = d where id = p_stage returning * into r;
  elsif p_action = 'complete' then
    if st.status <> 'in_progress' then raise exception 'INVALID_TRANSITION: Hãy bắt đầu giai đoạn trước khi hoàn thành.'; end if;
    if d < st.actual_start then raise exception 'INVALID_DATE: Ngày hoàn thành không thể trước ngày bắt đầu (%).', st.actual_start; end if;
    select p.expected, p.logged into need, have from stage_log_progress(p_stage, d) p;
    if have < need then
      if length(trim(coalesce(p_reason, ''))) >= 3 then
        if not has_org_role(v_owner, array['owner']::member_role[]) then
          raise exception 'FORBIDDEN: Chỉ chủ cơ sở được bấm Xong khi chưa ghi đủ việc. Hãy Ghi việc còn thiếu (cần % lần, đã ghi % lần).', need, have;
        end if;
        waive := true;
      else
        raise exception 'LOG_INCOMPLETE: Việc "%" cần Ghi việc đủ % lần mới bấm Xong được (hiện đã ghi % lần). Hãy Ghi việc còn thiếu rồi bấm Xong lại.', st.name, need, have;
      end if;
    end if;
    update production_stages set status = 'done', actual_end = d,
           log_waived_reason = case when waive then left(trim(p_reason), 300) else null end,
           log_waived_by = case when waive then auth.uid() else null end,
           log_waived_at = case when waive then now() else null end
     where id = p_stage returning * into r;
  elsif p_action = 'reopen' then
    if st.status <> 'done' then raise exception 'INVALID_TRANSITION: Chỉ mở lại được giai đoạn đã xong.'; end if;
    update production_stages set status = 'in_progress', actual_end = null, log_waived_reason = null, log_waived_by = null, log_waived_at = null
     where id = p_stage returning * into r;
  else
    raise exception 'INVALID_ARGUMENT: Thao tác không hợp lệ.';
  end if;
  return r;
end $$;
revoke execute on function advance_stage(uuid, text, date, text) from public, anon;
grant execute on function advance_stage(uuid, text, date, text) to authenticated, service_role;

-- Dời lịch các việc sau (bản vá của migration 0073), áp lại cho hàm mới
do $$
declare d text;
begin
  d := pg_get_functiondef('advance_stage(uuid, text, date, text)'::regprocedure);
  if position('shift_later_stages' in d) = 0 then
    d := replace(d, 'declare st production_stages;', 'declare dur integer; st production_stages;');
    d := replace(d, E'  return r;\nend',
      E'  if p_action = ''start'' and st.planned_start is not null and st.planned_end is not null and d <> st.planned_start then\n'
      || E'    dur := coalesce(st.duration_days, (st.planned_end - st.planned_start) + 1);\n'
      || E'    update production_stages set planned_start = d, planned_end = d + dur - 1 where id = p_stage returning * into r;\n'
      || E'    perform shift_later_stages(st.cycle_id, st.seq, r.planned_end - st.planned_end);\n'
      || E'  elsif p_action = ''complete'' and st.planned_end is not null and d <> st.planned_end then\n'
      || E'    perform shift_later_stages(st.cycle_id, st.seq, d - st.planned_end);\n'
      || E'  end if;\n  return r;\nend');
    execute d;
  end if;
end $$;
