-- D35: sửa/xóa vụ, sửa giai đoạn của vụ, ghi chú theo ngày (nhắc việc ở Trang chủ).

-- ---------------------------------------------------------------------------
-- Sửa vụ có kiểm tra phiên bản: thêm trường "name" (tên vụ). Giữ nguyên các trường cũ.
-- ---------------------------------------------------------------------------
create or replace function update_cycle(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns production_cycles
language plpgsql security invoker set search_path = public as $$
declare r production_cycles; cur production_cycles;
begin
  update production_cycles set
    status     = case when p_changes ? 'status'     then (p_changes->>'status')::cycle_status else status end,
    start_date = case when p_changes ? 'start_date' then (p_changes->>'start_date')::date else start_date end,
    note       = case when p_changes ? 'note'       then nullif(p_changes->>'note', '') else note end,
    name       = case when p_changes ? 'name'       then nullif(trim(p_changes->>'name'), '') else name end,
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

-- ---------------------------------------------------------------------------
-- Xóa vụ: chỉ khi vụ CHƯA có dữ liệu (nhật ký, thu hoạch, chi phí, doanh thu, kho...). Đã có dữ liệu thì chỉ Kết thúc/Hủy.
-- Giai đoạn và ghi chú của vụ xóa theo.
-- ---------------------------------------------------------------------------
create or replace function delete_cycle(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_id) or not can_manage_cycle(p_id) then
    raise exception 'FORBIDDEN: Bạn không có quyền xóa vụ này.';
  end if;
  begin
    delete from production_cycles where id = p_id;
  exception when foreign_key_violation then
    raise exception 'HAS_DATA: Vụ đã có dữ liệu (nhật ký, thu hoạch, chi phí…) nên không xóa được để giữ lịch sử. Hãy chọn "Kết thúc vụ" nếu không dùng nữa.';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Sửa giai đoạn của vụ (chỉ người quản lý vụ; vụ đã kết thúc/hủy thì khóa)
-- ---------------------------------------------------------------------------
create or replace function cycle_stage_edit_guard(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s cycle_status;
begin
  if not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền sửa giai đoạn của vụ này.';
  end if;
  select status into s from production_cycles where id = p_cycle;
  if s in ('ended', 'cancelled') then
    raise exception 'CYCLE_CLOSED: Vụ đã kết thúc nên không sửa giai đoạn được.';
  end if;
end $$;

create or replace function sync_cycle_end(p_cycle uuid) returns void
language sql security definer set search_path = public as $$
  update production_cycles set expected_end_date = (select max(planned_end) from production_stages where cycle_id = p_cycle)
   where id = p_cycle;
$$;

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
  v_wt := case when p_changes ? 'work_type_id' then nullif(p_changes->>'work_type_id', '')::uuid else st.work_type_id end;
  update production_stages set
    name = v_name,
    work_type_id = v_wt,
    planned_start = case when p_changes ? 'planned_start' then (p_changes->>'planned_start')::date else planned_start end,
    planned_end   = case when p_changes ? 'planned_end'   then (p_changes->>'planned_end')::date else planned_end end,
    note = case when p_changes ? 'note' then nullif(trim(p_changes->>'note'), '') else note end
  where id = p_stage returning * into r;
  if r.planned_start is not null and r.planned_end is not null and r.planned_end < r.planned_start then
    raise exception 'INVALID_DATE: Ngày kết thúc kế hoạch không thể trước ngày bắt đầu.';
  end if;
  update production_stages set duration_days = case when r.planned_start is not null and r.planned_end is not null
    then (r.planned_end - r.planned_start) + 1 else duration_days end where id = p_stage returning * into r;
  perform sync_cycle_end(st.cycle_id);
  return r;
end $$;

create or replace function add_cycle_stage(p_cycle uuid, p_work_type uuid, p_name text, p_start date, p_end date, p_note text default null)
returns production_stages
language plpgsql security definer set search_path = public as $$
declare r production_stages; v_name text := nullif(trim(p_name), ''); v_seq integer;
begin
  perform cycle_stage_edit_guard(p_cycle);
  if v_name is null and p_work_type is not null then select name into v_name from work_types where id = p_work_type; end if;
  if v_name is null then raise exception 'INVALID_NAME: Hãy chọn việc hoặc nhập tên giai đoạn.'; end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'INVALID_DATE: Hãy nhập ngày bắt đầu và ngày kết thúc kế hoạch (kết thúc không trước bắt đầu).';
  end if;
  select coalesce(max(seq), 0) + 1 into v_seq from production_stages where cycle_id = p_cycle;
  insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end, work_type_id, duration_days, note)
    values (p_cycle, (select owner_org_id from production_cycles where id = p_cycle), v_name, v_seq, p_start, p_end, p_work_type,
            (p_end - p_start) + 1, nullif(trim(p_note), ''))
    returning * into r;
  perform sync_cycle_end(p_cycle);
  return r;
end $$;

create or replace function delete_cycle_stage(p_stage uuid) returns void
language plpgsql security definer set search_path = public as $$
declare st production_stages;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null then raise exception 'NOT_FOUND: Không tìm thấy giai đoạn.'; end if;
  perform cycle_stage_edit_guard(st.cycle_id);
  if st.status <> 'pending' then
    raise exception 'INVALID_TRANSITION: Giai đoạn đã bắt đầu hoặc đã xong nên không xóa được.';
  end if;
  if exists (select 1 from activity_logs where stage_id = p_stage) then
    raise exception 'HAS_DATA: Giai đoạn đã có nhật ký gắn vào nên không xóa được.';
  end if;
  delete from production_stages where id = p_stage;
  perform sync_cycle_end(st.cycle_id);
end $$;

-- ---------------------------------------------------------------------------
-- Ghi chú theo ngày của vụ (hiện ở lịch và nhắc ở Trang chủ)
-- ---------------------------------------------------------------------------
create table cycle_notes (
  id uuid primary key,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  note_date date not null,
  content text not null check (length(trim(content)) between 1 and 500),
  done boolean not null default false,
  created_by uuid not null references auth.users(id) default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);
create index on cycle_notes (cycle_id, note_date);
create index on cycle_notes (organization_id, note_date) where not done;

create trigger cycle_notes_a_org before insert or update of cycle_id on cycle_notes
  for each row execute function sync_org_from_cycle();
create or replace function cycle_notes_author() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_name := author_display_name(new.created_by, new.organization_id, null);
  return new;
end $$;
create trigger cycle_notes_b_author before insert on cycle_notes for each row execute function cycle_notes_author();

alter table cycle_notes enable row level security;
create policy cycle_notes_read on cycle_notes for select to authenticated using (can_read_cycle(cycle_id));
create policy cycle_notes_insert on cycle_notes for insert to authenticated
  with check (can_log_cycle(cycle_id) and created_by = auth.uid());
create policy cycle_notes_update on cycle_notes for update to authenticated
  using (created_by = auth.uid() or can_manage_cycle(cycle_id))
  with check (created_by = auth.uid() or can_manage_cycle(cycle_id));
create policy cycle_notes_delete on cycle_notes for delete to authenticated
  using (created_by = auth.uid() or can_manage_cycle(cycle_id));

revoke execute on function delete_cycle(uuid), cycle_stage_edit_guard(uuid), sync_cycle_end(uuid), update_cycle_stage(uuid, jsonb),
  add_cycle_stage(uuid, uuid, text, date, date, text), delete_cycle_stage(uuid), update_cycle(uuid, integer, uuid, jsonb) from public, anon;
revoke execute on function cycle_stage_edit_guard(uuid), sync_cycle_end(uuid) from authenticated;
grant execute on function delete_cycle(uuid), update_cycle_stage(uuid, jsonb), add_cycle_stage(uuid, uuid, text, date, date, text),
  delete_cycle_stage(uuid), update_cycle(uuid, integer, uuid, jsonb) to authenticated, service_role;
