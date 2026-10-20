-- P2 (D34): TẠO VỤ THEO QUY TRÌNH MẪU (bắt buộc) và giám sát vụ theo đúng quy trình đó.
-- Vụ là BẢN SAO của mẫu lúc tạo: giai đoạn của vụ (production_stages) có ngày kế hoạch tính từ ngày bắt đầu; sửa mẫu về sau
-- không đổi vụ đang chạy. Giai đoạn có trạng thái Chưa làm / Đang làm / Xong với ngày thực tế để so với kế hoạch.

alter table production_cycles
  add column name text check (name is null or length(name) <= 120),
  add column template_id uuid references cycle_templates(id),      -- không xóa được mẫu đã có vụ dùng (chỉ ngừng dùng)
  add column template_name text,
  add column template_version integer;

alter table production_stages
  add column work_type_id uuid references work_types(id),
  add column template_stage_id uuid references template_stages(id) on delete set null,
  add column duration_days integer check (duration_days is null or duration_days >= 1),
  add column status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  add column note text,
  add constraint stages_dates_ok check (actual_end is null or actual_start is null or actual_end >= actual_start);

alter table activity_logs add column stage_id uuid references production_stages(id);
create index on activity_logs (stage_id) where stage_id is not null;

-- Nhật ký gắn giai đoạn phải cùng vụ
create or replace function activity_log_stage_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare st_cycle uuid;
begin
  if new.stage_id is not null then
    select cycle_id into st_cycle from production_stages where id = new.stage_id;
    if st_cycle is distinct from new.cycle_id then
      raise exception 'INVALID_STAGE: Giai đoạn không thuộc vụ của nhật ký này.';
    end if;
  end if;
  return new;
end $$;
create trigger activity_logs_stage_guard before insert on activity_logs for each row execute function activity_log_stage_guard();

-- Vụ mới (người dùng đăng nhập) bắt buộc có quy trình mẫu; tạo bằng create_cycle_from_template
create or replace function cycle_requires_template() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.template_id is null
     and coalesce(current_setting('agri.legacy_cycle_insert', true), '') <> 'on' then  -- cờ chỉ dùng trong test cũ; client không đặt được
    raise exception 'TEMPLATE_REQUIRED: Vụ phải được tạo theo một quy trình mẫu. Hãy chọn quy trình khi tạo vụ.';
  end if;
  return new;
end $$;
create trigger production_cycles_require_template before insert on production_cycles
  for each row execute function cycle_requires_template();

-- Giai đoạn của vụ chỉ đổi qua hàm (không sửa trực tiếp từng trường); vẫn đọc theo quyền đọc vụ
drop policy stages_write on production_stages;

-- ---------------------------------------------------------------------------
-- Tạo vụ theo mẫu: một lần tạo vụ + toàn bộ giai đoạn có ngày kế hoạch (hạn mức vụ vẫn được ép như cũ)
-- ---------------------------------------------------------------------------
create or replace function create_cycle_from_template(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date,
  p_status cycle_status default 'preparing', p_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tpl cycle_templates; total integer; d date; s record; start_d date := coalesce(p_start, current_date);
begin
  if p_id is null then raise exception 'INVALID_ARGUMENT: Thiếu mã vụ.'; end if;
  -- gửi lặp cùng mã (mất phản hồi, bấm lại): coi như đã tạo
  if exists (select 1 from production_cycles where id = p_id) then
    if (select created_by from production_cycles where id = p_id) = auth.uid() then return p_id; end if;
    raise exception 'DUPLICATE_ID: Mã vụ đã tồn tại.';
  end if;
  if not can_create_cycle(p_owner_org, p_area) then
    raise exception 'FORBIDDEN: Bạn không có quyền tạo vụ ở cơ sở hoặc khu trồng này.';
  end if;
  if p_status not in ('preparing', 'active') then
    raise exception 'INVALID_STATUS: Vụ mới chỉ ở trạng thái Chuẩn bị hoặc Đang sản xuất.';
  end if;
  if not exists (select 1 from production_areas a where a.id = p_area and a.is_active) then
    raise exception 'INVALID_AREA: Khu trồng đã dừng hoặc không tồn tại.';
  end if;
  select * into tpl from cycle_templates where id = p_template;
  if tpl.id is null or tpl.organization_id <> p_owner_org then
    raise exception 'INVALID_TEMPLATE: Quy trình mẫu phải thuộc cơ sở sở hữu vụ.';
  end if;
  if not tpl.is_active then raise exception 'INVALID_TEMPLATE: Quy trình này đã ngừng dùng.'; end if;
  select coalesce(sum(duration_days), 0) into total from template_stages where template_id = tpl.id;
  if total = 0 then raise exception 'INVALID_TEMPLATE: Quy trình chưa có giai đoạn nào. Hãy thêm giai đoạn ở tab Khai báo.'; end if;

  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date,
                                 name, template_id, template_name, template_version, created_by)
    values (p_id, p_owner_org, p_area, tpl.crop_type_id, p_status, start_d, start_d + total - 1,
            nullif(trim(p_name), ''), tpl.id, tpl.name, tpl.version, auth.uid());

  d := start_d;
  for s in select * from template_stages where template_id = tpl.id order by seq loop
    insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end,
                                   work_type_id, template_stage_id, duration_days, note)
      values (p_id, p_owner_org, s.name, s.seq, d, d + s.duration_days - 1, s.work_type_id, s.id, s.duration_days, s.note);
    d := d + s.duration_days;
  end loop;
  return p_id;
end $$;

-- Bắt đầu / hoàn thành / mở lại một giai đoạn của vụ (người quản lý vụ). Ngày thực tế mặc định là hôm nay.
create or replace function advance_stage(p_stage uuid, p_action text, p_date date default null)
returns production_stages
language plpgsql security definer set search_path = public as $$
declare st production_stages; cyc_status cycle_status; d date := coalesce(p_date, current_date); r production_stages;
begin
  select * into st from production_stages where id = p_stage;
  if st.id is null or not can_manage_cycle(st.cycle_id) then
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
    update production_stages set status = 'done', actual_end = d where id = p_stage returning * into r;
  elsif p_action = 'reopen' then
    if st.status <> 'done' then raise exception 'INVALID_TRANSITION: Chỉ mở lại được giai đoạn đã xong.'; end if;
    update production_stages set status = 'in_progress', actual_end = null where id = p_stage returning * into r;
  else
    raise exception 'INVALID_ARGUMENT: Thao tác không hợp lệ.';
  end if;
  return r;
end $$;

revoke execute on function create_cycle_from_template(uuid, uuid, uuid, uuid, date, cycle_status, text),
  advance_stage(uuid, text, date) from public, anon;
grant execute on function create_cycle_from_template(uuid, uuid, uuid, uuid, date, cycle_status, text),
  advance_stage(uuid, text, date) to authenticated, service_role;
