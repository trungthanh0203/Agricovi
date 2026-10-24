-- D91: LỊCH GIAI ĐOẠN CỦA VỤ TỰ ĐỔI THEO THỰC TẾ.
-- (1) Vụ tạo lịch sẵn (Chuẩn bị) rồi mới bắt đầu chạy: lúc chuyển sang Đang sản xuất, ngày bắt đầu vụ = ngày thực tế và cả lịch các giai đoạn dời theo.
-- (2) Đổi ngày bắt đầu của vụ (khi chưa giai đoạn nào bắt đầu): các giai đoạn dời theo.
-- (3) Bắt đầu giai đoạn lệch ngày kế hoạch: giai đoạn đó bắt đầu đúng ngày thực tế (giữ số ngày), các giai đoạn SAU dời theo.
-- (4) Hoàn thành giai đoạn sớm hoặc trễ so với kế hoạch: các giai đoạn SAU dời theo đúng số ngày lệch.
-- (5) Sửa ngày kết thúc kế hoạch của một giai đoạn: các giai đoạn SAU dời theo đúng số ngày thay đổi.
-- Chỉ dời các giai đoạn SAU còn ở trạng thái chưa bắt đầu, giữ nguyên số ngày của từng giai đoạn; giai đoạn đang chạy hoặc đã xong không bị đụng.

create or replace function shift_later_stages(p_cycle uuid, p_after_seq integer, p_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_days is null or p_days = 0 then return; end if;
  update production_stages set planned_start = planned_start + p_days, planned_end = planned_end + p_days
   where cycle_id = p_cycle and seq > p_after_seq and status = 'pending' and planned_start is not null and planned_end is not null;
  perform sync_cycle_end(p_cycle);
end $$;
revoke execute on function shift_later_stages(uuid, integer, integer) from public, anon, authenticated;

-- (1) Lúc bắt đầu chạy vụ: ngày bắt đầu = hôm nay (giờ Việt Nam), trừ khi người dùng đồng thời chọn ngày khác.
-- (1)+(2) Đổi ngày bắt đầu vụ khi chưa giai đoạn nào chạy: ngày dự kiến xong của vụ đổi theo NGAY TRONG LẦN CẬP NHẬT NÀY (không tạo thêm lần cập nhật
-- nên không làm tăng phiên bản vụ thêm lần nữa), rồi các giai đoạn dời theo ở trigger sau.
create or replace function cycles_schedule_before() returns trigger language plpgsql security definer set search_path = public as $$
declare mx date;
begin
  if old.status = 'preparing' and new.status = 'active' and new.start_date is not distinct from old.start_date then
    new.start_date := vn_today();
  end if;
  if old.start_date is not null and new.start_date is not null and new.start_date <> old.start_date
     and not exists (select 1 from production_stages s where s.cycle_id = new.id and s.status <> 'pending') then
    select max(planned_end) into mx from production_stages where cycle_id = new.id and planned_end is not null;
    if mx is not null then new.expected_end_date := mx + (new.start_date - old.start_date); end if;
  end if;
  return new;
end $$;
create trigger cycles_schedule_before_trg before update on production_cycles for each row execute function cycles_schedule_before();

create or replace function cycles_schedule_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.start_date is not null and new.start_date is not null and new.start_date <> old.start_date
     and not exists (select 1 from production_stages s where s.cycle_id = new.id and s.status <> 'pending') then
    update production_stages set planned_start = planned_start + (new.start_date - old.start_date), planned_end = planned_end + (new.start_date - old.start_date)
     where cycle_id = new.id and planned_start is not null and planned_end is not null;
  end if;
  return new;
end $$;
create trigger cycles_schedule_after_trg after update on production_cycles for each row when (old.start_date is distinct from new.start_date) execute function cycles_schedule_after();

-- (3)+(4) Bắt đầu / hoàn thành giai đoạn lệch kế hoạch; (5) sửa ngày kết thúc kế hoạch của một giai đoạn
do $$
declare d text;
begin
  d := pg_get_functiondef('advance_stage(uuid, text, date)'::regprocedure);
  if position('declare st production_stages;' in d) = 0 or position(E'  return r;\nend' in d) = 0 then raise exception 'advance_stage: không tìm thấy đoạn cần thay'; end if;
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

  d := pg_get_functiondef('update_cycle_stage(uuid, jsonb)'::regprocedure);
  if position(E'  perform sync_cycle_end(st.cycle_id);\n  return r;' in d) = 0 then raise exception 'update_cycle_stage: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, E'  perform sync_cycle_end(st.cycle_id);\n  return r;',
    E'  if r.planned_end is not null and st.planned_end is not null and r.planned_end <> st.planned_end then\n'
    || E'    perform shift_later_stages(st.cycle_id, st.seq, r.planned_end - st.planned_end);\n  end if;\n'
    || E'  perform sync_cycle_end(st.cycle_id);\n  return r;');
  execute d;
end $$;
