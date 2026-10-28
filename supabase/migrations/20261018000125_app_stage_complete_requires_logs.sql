-- Bấm XONG một việc của vụ chỉ được khi đã GHI VIỆC ĐỦ (thay cho ràng buộc "Ra ca phải ghi việc").
-- Số lần cần ghi: việc không đặt chu kỳ lặp = 1 lần; việc lặp mỗi N ngày = số ngày đến hạn từ ngày bắt đầu kế hoạch đến ngày hoàn thành
-- (hoặc ngày kết thúc kế hoạch nếu sớm hơn), tức các ngày 0, N, 2N... Mỗi NGÀY chỉ tính một lần (ghi trùng trong ngày không được tính thêm).
-- Bản ghi tính cho việc: gắn đúng việc (stage_id), hoặc cùng loại việc của vụ chưa gắn việc nào và ghi từ ngày bắt đầu việc.
-- Việc Thu hoạch tính cả phiếu thu hoạch của vụ. Việc không gắn loại việc (vụ cũ) thì không kiểm.

create or replace function stage_log_progress(p_stage uuid, p_date date default null)
returns table (expected integer, logged integer)
language plpgsql stable security definer set search_path = public as $$
declare st production_stages; d date := coalesce(p_date, current_date); ref date; wcode text;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null or not can_read_cycle(st.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy việc hoặc bạn không có quyền xem.'; end if;
  if st.work_type_id is null then
    expected := 0; logged := 0; return next; return;
  end if;
  ref := least(d, coalesce(st.planned_end, d));
  expected := 1;
  if st.repeat_every_days is not null and st.planned_start is not null and ref >= st.planned_start then
    expected := ((ref - st.planned_start) / st.repeat_every_days) + 1;
  end if;
  select count(distinct (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date)::integer into logged
    from activity_logs l
   where l.cycle_id = st.cycle_id and l.voided_at is null
     and (l.stage_id = st.id
          or (l.stage_id is null and l.work_type_id = st.work_type_id
              and (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date >= coalesce(st.actual_start, st.planned_start, date '1900-01-01')));
  select code into wcode from work_types where id = st.work_type_id;
  if wcode like 'harvesting%' then
    logged := logged + (select count(*)::integer from harvest_records h where h.cycle_id = st.cycle_id and h.voided_at is null);
  end if;
  return next;
end $$;
revoke execute on function stage_log_progress(uuid, date) from public, anon;
grant execute on function stage_log_progress(uuid, date) to authenticated, service_role;

create or replace function advance_stage(p_stage uuid, p_action text, p_date date default null)
returns production_stages
language plpgsql security definer set search_path = public as $$
declare st production_stages; cyc_status cycle_status; d date := coalesce(p_date, current_date); r production_stages; need integer; have integer;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null or not can_manage_stages(st.cycle_id) then
    raise exception 'FORBIDDEN: Bạn không có quyền thay đổi giai đoạn của vụ này.';
  end if;
  select status into cyc_status from production_cycles where id = st.cycle_id;
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
      raise exception 'LOG_INCOMPLETE: Việc "%" cần Ghi việc đủ % lần mới bấm Xong được (hiện đã ghi % lần). Hãy Ghi việc còn thiếu rồi bấm Xong lại.', st.name, need, have;
    end if;
    update production_stages set status = 'done', actual_end = d where id = p_stage returning * into r;
  elsif p_action = 'reopen' then
    if st.status <> 'done' then raise exception 'INVALID_TRANSITION: Chỉ mở lại được giai đoạn đã xong.'; end if;
    update production_stages set status = 'in_progress', actual_end = null where id = p_stage returning * into r;
  else
    raise exception 'INVALID_ARGUMENT: Thao tác không hợp lệ.';
  end if;
  return r;
end $$;

-- Khôi phục các bản vá của migration 0073 (dời lịch các việc sau khi bắt đầu/hoàn thành/sửa ngày) và 0086 (sao mốc an toàn khi tạo vụ và nhân bản quy trình)
-- đã bị mất khi các migration 0109, 0114, 0115, 0117 viết lại bốn hàm này. Vá lại bằng cách thay đoạn văn bản như đã làm ở 0073 và 0086; chỉ vá nếu chưa có.
do $$
declare d text;
begin
  -- advance_stage (vừa viết lại ở trên): dời lịch các việc sau
  d := pg_get_functiondef('advance_stage(uuid, text, date)'::regprocedure);
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

  -- update_cycle_stage (viết lại ở 0117): dời lịch khi sửa ngày kết thúc
  d := pg_get_functiondef('update_cycle_stage(uuid, jsonb)'::regprocedure);
  if position('shift_later_stages' in d) = 0 then
    if position(E'  perform sync_cycle_end(st.cycle_id);\n  return r;' in d) = 0 then raise exception 'update_cycle_stage: không tìm thấy đoạn cần thay'; end if;
    d := replace(d, E'  perform sync_cycle_end(st.cycle_id);\n  return r;',
      E'  if r.planned_end is not null and st.planned_end is not null and r.planned_end <> st.planned_end then\n'
      || E'    perform shift_later_stages(st.cycle_id, st.seq, r.planned_end - st.planned_end);\n  end if;\n'
      || E'  perform sync_cycle_end(st.cycle_id);\n  return r;');
    execute d;
  end if;

  -- create_cycle_from_template (viết lại ở 0109/0114/0115): sao mốc an toàn của mẫu sang vụ
  d := pg_get_functiondef('create_cycle_from_template(uuid, uuid, uuid, uuid, date, cycle_status, text)'::regprocedure);
  if position('cycle_milestones' in d) = 0 then
    if position(E'  -- lượt 2: sao từng việc với ngày kế hoạch' in d) = 0 then raise exception 'create_cycle_from_template: không tìm thấy đoạn cần thay'; end if;
    d := replace(d, E'  -- lượt 2: sao từng việc với ngày kế hoạch',
      E'  insert into cycle_milestones (cycle_id, organization_id, title, anchor, offset_days, note)\n'
      || E'    select p_id, p_owner_org, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = tpl.id order by m.created_at, m.id;\n'
      || E'  -- lượt 2: sao từng việc với ngày kế hoạch');
    execute d;
  end if;

  -- duplicate_cycle_template (viết lại ở 0109/0114/0115): nhân bản cả mốc
  d := pg_get_functiondef('duplicate_cycle_template(uuid, text)'::regprocedure);
  if position('template_milestones' in d) = 0 then
    if position(E'  return new_id;' in d) = 0 then raise exception 'duplicate_cycle_template: không tìm thấy đoạn cần thay'; end if;
    d := replace(d, E'  return new_id;',
      E'  insert into template_milestones (template_id, title, anchor, offset_days, note)\n'
      || E'    select new_id, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = p_template;\n  return new_id;');
    execute d;
  end if;
end $$;
