-- Việc trong quy trình có thể CHẠY SONG SONG và LẶP LẠI (tưới mỗi ngày, bón mỗi 5 ngày, phun mỗi 7 ngày...):
--  - start_day: ngày bắt đầu tính từ ngày 1 của quy trình. Trống = NỐI TIẾP ngay sau việc nối tiếp trước đó (cách cũ, mọi quy trình đang có giữ nguyên);
--    có giá trị = việc chạy song song từ ngày đó và KHÔNG làm các việc nối tiếp phía sau dời đi.
--  - repeat_every_days: lặp lại mỗi N ngày trong khoảng thực hiện của việc (trống = làm một lần/liên tục).
-- Tổng số ngày của quy trình = ngày kết thúc muộn nhất.

alter table template_stages
  add column start_day integer check (start_day is null or start_day between 1 and 3650),
  add column repeat_every_days integer check (repeat_every_days is null or repeat_every_days between 1 and 365);
alter table system_template_stages
  add column start_day integer check (start_day is null or start_day between 1 and 3650),
  add column repeat_every_days integer check (repeat_every_days is null or repeat_every_days between 1 and 365);
alter table production_stages
  add column repeat_every_days integer check (repeat_every_days is null or repeat_every_days between 1 and 365);

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
    insert into template_stages (template_id, seq, work_type_id, name, duration_days, note, importance, phase_id, start_day, repeat_every_days)
      values (new_id, s.seq, s.work_type_id, s.name, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end, s.start_day, s.repeat_every_days) returning id into new_stage;
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
    insert into template_stages (template_id, seq, work_type_id, duration_days, note, importance, phase_id, start_day, repeat_every_days)
      values (new_id, s.seq, s.work_type_id, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end, s.start_day, s.repeat_every_days);
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
                                   work_type_id, template_stage_id, duration_days, note, phase_code, phase_name, importance, repeat_every_days)
      values (p_id, p_owner_org, s.name, s.seq, start_d + st - 1, start_d + en - 1, s.work_type_id, s.id, s.duration_days, s.note, s.p_code, s.p_name, s.importance, s.repeat_every_days);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Mẫu dưa lưới: viết lại với việc chạy song song và lặp lại (phiên bản 2). Quy trình cơ sở đã áp dụng trước đó không đổi.
-- ---------------------------------------------------------------------------
do $$
declare t uuid;
begin
  select id into t from system_templates where code = 'melon_greenhouse';
  if t is null then return; end if;
  delete from system_template_stages where system_template_id = t;
  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note
    from (values
      (1,  1, 'substrate_prep', 5,  null::int, null::int, 'high',   'Giá thể (mụn dừa) phải xả chát tanin và lignin hoàn toàn trước khi trồng.'),
      (2,  1, 'fertilizing',    2,  null, null, 'normal', 'Bón lót.'),
      (3,  2, 'seed_soaking',   1,  null, null, 'normal', null),
      (4,  2, 'tray_sowing',    1,  null, null, 'high',   'Ghi lô hạt giống.'),
      (5,  2, 'irrigation',     12, null, 1,    'normal', 'Chăm cây con trong khay: tưới nhẹ mỗi ngày, giữ ẩm đều.'),
      (6,  3, 'transplanting',  2,  null, null, 'high',   null),
      (7,  3, 'replanting',     3,  null, null, 'low',    'Dặm cây chết hoặc yếu.'),
      (8,  3, 'trellising',     5,  null, null, 'normal', null),
      (9,  4, 'fertilizing',    10, 32,   5,    'high',   'Bón cho cây con mỗi 5 ngày; ghi EC, pH dung dịch.'),
      (10, 4, 'irrigation',     10, 32,   1,    'normal', 'Tưới hằng ngày theo EC, pH.'),
      (11, 4, 'spraying',       10, 32,   7,    'normal', 'Phòng bệnh mỗi 7 ngày theo quy trình; ghi thuốc và thời gian cách ly.'),
      (12, 5, 'pollination',    5,  42,   1,    'high',   'Thụ phấn hằng ngày lúc hoa nở.'),
      (13, 5, 'pruning',        9,  42,   3,    'normal', 'Tỉa nhánh, chọn quả giữ lại, 3 ngày một lần.'),
      (14, 6, 'fertilizing',    22, 51,   5,    'high',   'Dinh dưỡng nuôi quả; giảm đạm, tăng kali; ghi EC, pH.'),
      (15, 6, 'irrigation',     22, 51,   1,    'normal', null),
      (16, 6, 'spraying',       22, 51,   7,    'high',   'Kiểm tra thời gian cách ly trước khi thu hoạch.'),
      (17, 7, 'harvesting',     7,  73,   null, 'high',   'Kiểm tra hết cách ly, đo độ ngọt (Brix) rồi thu.')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note);
  update system_templates set version = version + 1,
    description = 'Quy trình trồng dưa lưới trong nhà màng, khoảng 79 ngày. Các việc chăm sóc (tưới, bón, phun) chạy song song và lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu số ngày và việc với kỹ thuật của cơ sở rồi chỉnh lại.'
   where id = t;
end $$;
