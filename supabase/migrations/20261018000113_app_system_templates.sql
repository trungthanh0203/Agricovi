-- Quy trình MẪU HỆ THỐNG: do quản trị nền tảng soạn, mọi cơ sở xem được và bấm "Áp dụng cho cơ sở của tôi" để SAO CHÉP thành quy trình riêng rồi sửa tùy ý.
-- Mẫu chỉ gồm công đoạn, việc (từ danh mục việc dùng chung), số ngày, mức độ quan trọng, ghi chú. Sao chép xong thì độc lập: sửa mẫu hệ thống không đổi quy trình của cơ sở.

create table system_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{1,60}$'),
  kind text not null check (kind in ('crop', 'livestock', 'aquatic', 'other')),
  crop_type_id uuid references crop_types(id),               -- sản phẩm dùng chung gợi ý (có thể trống)
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  description text check (description is null or length(description) <= 1000),
  source text check (source is null or length(source) <= 300),
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger system_templates_updated before update on system_templates for each row execute function set_updated_at();

create table system_template_phases (
  id uuid primary key default gen_random_uuid(),
  system_template_id uuid not null references system_templates(id) on delete cascade,
  seq integer not null check (seq >= 1),
  code text check (code is null or length(code) <= 20),
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  description text check (description is null or length(description) <= 500)
);
create index on system_template_phases (system_template_id, seq);

create table system_template_stages (
  id uuid primary key default gen_random_uuid(),
  system_template_id uuid not null references system_templates(id) on delete cascade,
  phase_id uuid references system_template_phases(id) on delete set null,
  seq integer not null check (seq >= 1),
  work_type_id uuid not null references work_types(id),
  duration_days integer not null check (duration_days between 1 and 3650),
  importance text not null default 'normal' check (importance in ('high', 'normal', 'low')),
  note text check (note is null or length(note) <= 500)
);
create index on system_template_stages (system_template_id, seq);

alter table system_templates enable row level security;
alter table system_template_phases enable row level security;
alter table system_template_stages enable row level security;
create policy sys_tpl_read on system_templates for select to authenticated using (true);
create policy sys_tpl_write on system_templates for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy sys_tpl_phase_read on system_template_phases for select to authenticated using (true);
create policy sys_tpl_phase_write on system_template_phases for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy sys_tpl_stage_read on system_template_stages for select to authenticated using (true);
create policy sys_tpl_stage_write on system_template_stages for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- Quy trình của cơ sở nhớ nó được sao từ mẫu hệ thống nào, bản nào (để sau này báo "có bản mới", không tự ghi đè)
alter table cycle_templates
  add column source_system_id uuid references system_templates(id) on delete set null,
  add column source_version integer;

-- Áp dụng mẫu hệ thống cho cơ sở: sao thành quy trình riêng. p_id (mã tạo ở máy) giúp bấm lặp không nhân đôi.
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
    insert into template_stages (template_id, seq, work_type_id, duration_days, note, importance, phase_id)
      values (new_id, s.seq, s.work_type_id, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end);
  end loop;
  return new_id;
end $$;
revoke execute on function apply_system_template(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function apply_system_template(uuid, uuid, uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nội dung: DƯA LƯỚI NHÀ MÀNG (bản nháp theo sổ nhật ký VietGAP dưa lưới; số ngày cần đối chiếu với hộ thí điểm)
-- ---------------------------------------------------------------------------
insert into work_types (code, name, field_schema, applies_to) values
  ('substrate_prep', 'Chuẩn bị giá thể', '[]', array['crop'])
on conflict (code) where organization_id is null do nothing;

do $$
declare t uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
  wt uuid;
begin
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('melon_greenhouse', 'crop', (select id from crop_types where organization_id is null and code = 'melon'),
            'Dưa lưới nhà màng (bản tham khảo)',
            'Quy trình trồng dưa lưới trong nhà màng, khoảng 80 ngày từ chuẩn bị đến hết thu hoạch. Bản tham khảo: hãy đối chiếu số ngày và việc với kỹ thuật của cơ sở rồi chỉnh lại.',
            'Theo sổ nhật ký dưa lưới VietGAP; số ngày là bản nháp')
    returning id into t;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 1, '1', 'Chuẩn bị', 'Giá thể và bón lót trước khi trồng') returning id into p1;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 2, '2', 'Ươm cây', 'Ngâm ủ, gieo hạt và chăm cây con trong khay') returning id into p2;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 3, '3', 'Trồng cây', 'Ra vườn, dặm cây, treo dây lên giàn') returning id into p3;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 4, '4', 'Sinh trưởng', 'Cây phát triển thân lá trước khi ra hoa') returning id into p4;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 5, '5', 'Ra hoa, đậu quả', 'Thụ phấn, tỉa cành, giữ quả') returning id into p5;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 6, '6', 'Nuôi quả', 'Quả lớn và chín, theo dõi EC/pH và thời gian cách ly') returning id into p6;
  insert into system_template_phases (system_template_id, seq, code, name, description) values (t, 7, '7', 'Thu hoạch', 'Kiểm tra cách ly, độ ngọt rồi thu quả') returning id into p7;

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, importance, note)
  select t, v.ph, v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.imp, v.note
    from (values
      (p1, 1,  'substrate_prep', 5,  'high',   'Giá thể (mụn dừa) phải xả chát tanin và lignin hoàn toàn trước khi trồng.'),
      (p1, 2,  'fertilizing',    2,  'normal', 'Bón lót.'),
      (p2, 3,  'seed_soaking',   1,  'normal', null),
      (p2, 4,  'tray_sowing',    1,  'high',   'Ghi lô hạt giống.'),
      (p2, 5,  'irrigation',     12, 'normal', 'Chăm cây con trong khay: tưới nhẹ, giữ ẩm đều.'),
      (p3, 6,  'transplanting',  2,  'high',   null),
      (p3, 7,  'replanting',     3,  'low',    'Dặm cây chết hoặc yếu.'),
      (p3, 8,  'trellising',     5,  'normal', null),
      (p4, 9,  'fertilizing',    10, 'high',   'Bón cho cây con; ghi EC, pH dung dịch.'),
      (p4, 10, 'spraying',       4,  'normal', 'Phòng bệnh theo quy trình; ghi thuốc và thời gian cách ly.'),
      (p5, 11, 'pollination',    5,  'high',   null),
      (p5, 12, 'pruning',        4,  'normal', 'Tỉa nhánh, chọn quả giữ lại.'),
      (p6, 13, 'fertilizing',    14, 'high',   'Dinh dưỡng nuôi quả; giảm đạm, tăng kali; ghi EC, pH.'),
      (p6, 14, 'spraying',       4,  'high',   'Kiểm tra thời gian cách ly trước khi thu hoạch.'),
      (p7, 15, 'harvesting',     7,  'high',   'Kiểm tra hết cách ly, đo độ ngọt (Brix) rồi thu.')
    ) as v(ph, seq, wcode, days, imp, note);
end $$;
