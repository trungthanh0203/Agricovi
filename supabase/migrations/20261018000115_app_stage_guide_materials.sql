-- Việc trong quy trình có HƯỚNG DẪN và VẬT TƯ DỰ KIẾN (tên, lượng/liều dùng): vật tư lấy từ danh mục của cơ sở (material_id) hoặc chỉ ghi tên (mẫu hệ thống).
-- materials: mảng [{ "name": "...", "amount": "0.5 kg / phuy 200 lít", "material_id": "<uuid, không bắt buộc>" }], tối đa 20 dòng.
-- Quy trình sao sang vụ nên vụ nhớ hướng dẫn và vật tư dự kiến của từng việc.

alter table template_stages
  add column guide text check (guide is null or length(guide) <= 1000),
  add column materials jsonb not null default '[]' check (jsonb_typeof(materials) = 'array' and jsonb_array_length(materials) <= 20);
alter table system_template_stages
  add column guide text check (guide is null or length(guide) <= 1000),
  add column materials jsonb not null default '[]' check (jsonb_typeof(materials) = 'array' and jsonb_array_length(materials) <= 20);
alter table production_stages
  add column guide text check (guide is null or length(guide) <= 1000),
  add column materials jsonb not null default '[]' check (jsonb_typeof(materials) = 'array' and jsonb_array_length(materials) <= 20);

-- Nhân bản quy trình: giữ cả ngày bắt đầu và lặp lại
create or replace function duplicate_cycle_template(p_template uuid, p_name text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare src cycle_templates; new_id uuid; s record; ph record; new_stage uuid; new_phase uuid; pmap jsonb := '{}'::jsonb;
begin
  select * into src from cycle_templates where id = p_template;
  if src.id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  perform set_config('agri.copying_template', '1', true);
  insert into cycle_templates (organization_id, crop_type_id, name, note)
    values (src.organization_id, src.crop_type_id, trim(p_name), src.note) returning id into new_id;
  for ph in select * from template_phases where template_id = p_template order by seq loop
    insert into template_phases (template_id, seq, code, name, description)
      values (new_id, ph.seq, ph.code, ph.name, ph.description) returning id into new_phase;
    pmap := pmap || jsonb_build_object(ph.id::text, new_phase);
  end loop;
  for s in select * from template_stages where template_id = p_template order by seq loop
    insert into template_stages (template_id, seq, work_type_id, name, duration_days, note, importance, phase_id, start_day, repeat_every_days, guide, materials)
      values (new_id, s.seq, s.work_type_id, s.name, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end, s.start_day, s.repeat_every_days, s.guide, s.materials) returning id into new_stage;
    insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days, is_required, note)
      select new_stage, t.work_type_id, t.title, t.start_day, t.repeat_every_days, t.is_required, t.note
        from template_tasks t where t.stage_id = s.id;
  end loop;
  perform set_config('agri.copying_template', '', true);
  return new_id;
end $$;

-- Áp dụng mẫu hệ thống: giữ cả ngày bắt đầu và lặp lại
create or replace function apply_system_template(p_org uuid, p_system uuid, p_crop_type uuid, p_name text default null, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare sys system_templates; crop crop_types; new_id uuid; base text; nm text; i integer := 1; ph record; new_phase uuid; pmap jsonb := '{}'::jsonb; s record;
begin
  if p_id is not null and exists (select 1 from cycle_templates where id = p_id) then
    if exists (select 1 from cycle_templates where id = p_id and organization_id = p_org) then return p_id; end if;
    raise exception 'DUPLICATE_ID: Mã quy trình đã tồn tại.';
  end if;
  if not can_configure(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền tạo quy trình cho cơ sở này.'; end if;
  select * into sys from system_templates where id = p_system and is_active;
  if sys.id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu hệ thống hoặc mẫu đã ngừng dùng.'; end if;
  select * into crop from crop_types where id = p_crop_type;
  if crop.id is null or (crop.organization_id is not null and crop.organization_id <> p_org) then
    raise exception 'INVALID_CROP: Hãy chọn sản phẩm dùng chung hoặc sản phẩm của cơ sở.';
  end if;
  if crop.kind is distinct from sys.kind then
    raise exception 'INVALID_CROP: Mẫu này dành cho loại khác với sản phẩm đã chọn.';
  end if;

  base := coalesce(nullif(trim(p_name), ''), sys.name);
  nm := base;
  while exists (select 1 from cycle_templates where organization_id = p_org and name = nm) loop
    i := i + 1; nm := base || ' (' || i || ')';
  end loop;

  new_id := coalesce(p_id, gen_random_uuid());
  insert into cycle_templates (id, organization_id, crop_type_id, name, note, source_system_id, source_version)
    values (new_id, p_org, p_crop_type, nm, sys.description, sys.id, sys.version);
  for ph in select * from system_template_phases where system_template_id = sys.id order by seq loop
    insert into template_phases (template_id, seq, code, name, description) values (new_id, ph.seq, ph.code, ph.name, ph.description) returning id into new_phase;
    pmap := pmap || jsonb_build_object(ph.id::text, new_phase);
  end loop;
  for s in select * from system_template_stages where system_template_id = sys.id order by seq loop
    insert into template_stages (template_id, seq, work_type_id, duration_days, note, importance, phase_id, start_day, repeat_every_days, guide, materials)
      values (new_id, s.seq, s.work_type_id, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end, s.start_day, s.repeat_every_days, s.guide, s.materials);
  end loop;
  return new_id;
end $$;

-- Tạo vụ theo mẫu: việc nối tiếp xếp liền nhau; việc có ngày bắt đầu riêng chạy song song; lưu cả "lặp lại mỗi N ngày"
create or replace function create_cycle_from_template(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date,
  p_status cycle_status default 'preparing', p_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tpl cycle_templates; total integer := 0; cur integer; st integer; en integer; s record; start_d date := coalesce(p_start, current_date);
begin
  if p_id is null then raise exception 'INVALID_ARGUMENT: Thiếu mã vụ.'; end if;
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

  -- lượt 1: tổng số ngày = ngày kết thúc muộn nhất
  cur := 1;
  for s in select start_day, duration_days from template_stages where template_id = tpl.id order by seq loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    total := greatest(total, en);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  if total = 0 then raise exception 'INVALID_TEMPLATE: Quy trình chưa có việc nào. Hãy thêm công đoạn và việc ở tab Khai báo.'; end if;

  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date,
                                 name, template_id, template_name, template_version, created_by)
    values (p_id, p_owner_org, p_area, tpl.crop_type_id, p_status, start_d, start_d + total - 1,
            nullif(trim(p_name), ''), tpl.id, tpl.name, tpl.version, auth.uid());

  -- lượt 2: sao từng việc với ngày kế hoạch
  cur := 1;
  for s in
    select t.*, p.code as p_code, p.name as p_name
      from template_stages t left join template_phases p on p.id = t.phase_id
     where t.template_id = tpl.id order by t.seq
  loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end,
                                   work_type_id, template_stage_id, duration_days, note, phase_code, phase_name, importance, repeat_every_days, guide, materials)
      values (p_id, p_owner_org, s.name, s.seq, start_d + st - 1, start_d + en - 1, s.work_type_id, s.id, s.duration_days, s.note, s.p_code, s.p_name, s.importance, s.repeat_every_days, s.guide, s.materials);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  return p_id;
end $$;

