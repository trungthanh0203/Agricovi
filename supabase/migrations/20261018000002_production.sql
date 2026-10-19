-- Sản xuất: hàm truy cập vụ (hai ngữ cảnh Hộ/HTX), cấu hình cây, giai đoạn, việc, nhật ký, thu hoạch.
-- Tham chiếu: v1.1 mục 4.2, 4.3, 5.2, 6.2, 6.3, 8; v1.2 mục 4, 8.

-- ---------------------------------------------------------------------------
-- Hàm truy cập theo vụ. Chủ sở hữu dữ liệu = owner_org_id (hộ hoặc HTX).
--  * Vụ riêng của hộ: owner_org = hộ; HTX không phải thành viên => HTX không thấy (FR-COOP-010).
--  * Vụ của HTX: owner_org = HTX; thành viên HTX thấy; hộ tạo vụ (chủ khu trồng) vẫn thấy/ghi được.
-- ---------------------------------------------------------------------------
create or replace function cycle_owner_org(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_org_id from production_cycles where id = c;
$$;

create or replace function cycle_area_org(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select a.organization_id from production_cycles pc join production_areas a on a.id = pc.area_id where pc.id = c;
$$;

create or replace function can_read_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_org_member(cycle_owner_org(c)) or is_org_member(cycle_area_org(c));
$$;

-- ghi nhật ký/thu hoạch: mọi vai trò sản xuất của chủ vụ hoặc của chủ khu trồng
create or replace function can_log_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(cycle_owner_org(c), array['owner','manager','worker','inventory_finance','cooperative_manager']::member_role[])
      or has_org_role(cycle_area_org(c), array['owner','manager','worker','inventory_finance']::member_role[]);
$$;

-- quản lý vụ (đổi trạng thái, sửa thông tin vụ)
create or replace function can_manage_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(cycle_owner_org(c), array['owner','manager','cooperative_manager']::member_role[])
      or has_org_role(cycle_area_org(c), array['owner','manager']::member_role[]);
$$;

-- tạo vụ mới: chủ khu trồng được chọn ghi theo hộ mình, hoặc theo HTX mà hộ đang là thành viên
create or replace function can_create_cycle(owner_org uuid, area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with a as (select organization_id as area_org from production_areas where id = area)
  select exists (
    select 1 from a where
      -- ghi theo chính tổ chức sở hữu khu trồng
      (owner_org = a.area_org and has_org_role(owner_org, array['owner','manager']::member_role[]))
      -- hộ ghi vụ theo HTX mà mình đang là thành viên hoạt động
      or (has_org_role(a.area_org, array['owner','manager']::member_role[])
          and exists (select 1 from cooperative_memberships cm
                      where cm.household_org_id = a.area_org and cm.cooperative_org_id = owner_org and cm.status = 'active'))
  );
$$;

create or replace function can_read_area(area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_org_member(a.organization_id)
      or exists (select 1 from production_cycles pc
                 where pc.area_id = area and is_org_member(pc.owner_org_id))
  from production_areas a where a.id = area;
$$;

-- thay chính sách khu trồng/vụ của migration 1 bằng chính sách có ngữ cảnh Hộ/HTX
drop policy areas_read on production_areas;
drop policy areas_write on production_areas;
drop policy cycles_read on production_cycles;
drop policy cycles_write on production_cycles;

create policy areas_read on production_areas for select to authenticated using (can_read_area(id));
create policy areas_write on production_areas for all to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));

create policy cycles_read on production_cycles for select to authenticated using (can_read_cycle(id));
create policy cycles_insert on production_cycles for insert to authenticated
  with check (can_create_cycle(owner_org_id, area_id));
create policy cycles_update on production_cycles for update to authenticated
  using (can_manage_cycle(id)) with check (can_manage_cycle(id));
-- không có policy delete: dùng trạng thái 'cancelled' (giữ lịch sử)

-- Cột bổ sung cho vụ
alter table production_cycles
  add column variety_id uuid,
  add column crop_profile_id uuid,
  add column planted_area numeric check (planted_area is null or planted_area > 0),
  add column planted_area_unit text,
  add column expected_end_date date,
  add column end_date date,
  add column note text,
  add column version integer not null default 1; -- phát hiện xung đột khi đồng bộ (FR-SYNC-004)

create or replace function bump_version() returns trigger language plpgsql as $$
begin
  new.version = old.version + 1;
  return new;
end $$;
create trigger production_cycles_bump before update on production_cycles
  for each row execute function bump_version();

-- ---------------------------------------------------------------------------
-- Cấu hình cây trồng (CropProfile) và giống
-- ---------------------------------------------------------------------------
create table crop_varieties (
  id uuid primary key default gen_random_uuid(),
  crop_type_id uuid not null references crop_types(id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (crop_type_id, name)
);

create table crop_profiles (
  id uuid primary key default gen_random_uuid(),
  crop_type_id uuid not null references crop_types(id),
  name text not null,
  version integer not null default 1,
  -- giai đoạn tham khảo, mẫu việc, mẫu thu hoạch... Giá trị chỉ là THAM KHẢO, sửa được (FR-CROP-006, FR-CROP-008)
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (crop_type_id, name, version)
);

alter table production_cycles
  add constraint cycles_variety_fk foreign key (variety_id) references crop_varieties(id),
  add constraint cycles_profile_fk foreign key (crop_profile_id) references crop_profiles(id);

-- Loại công việc: trường dữ liệu thay đổi theo loại (FR-LOG-002). organization_id null = loại dùng chung toàn nền tảng.
create table work_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  field_schema jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index work_types_code_global on work_types (code) where organization_id is null;
create unique index work_types_code_org on work_types (organization_id, code) where organization_id is not null;

insert into work_types (code, name, field_schema) values
  ('irrigation',  'Tưới nước',   '[{"key":"duration_min","label":"Thời gian (phút)","type":"number"}]'),
  ('fertilizing', 'Bón phân',    '[{"key":"method","label":"Cách bón","type":"select"}]'),
  ('spraying',    'Phun thuốc',  '[{"key":"target","label":"Đối tượng","type":"text"}]'),
  ('pruning',     'Tỉa cành/bấm ngọn', '[]'),
  ('pollination', 'Thụ phấn',    '[]'),
  ('harvesting',  'Thu hoạch',   '[]'),
  ('other',       'Việc khác',   '[]');

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  crop_profile_id uuid not null references crop_profiles(id) on delete cascade,
  work_type_id uuid not null references work_types(id),
  stage_name text,
  name text not null,
  day_offset integer not null default 0, -- số ngày kể từ ngày bắt đầu vụ
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tự đồng bộ organization_id của bản ghi con theo chủ vụ (client không tự gán được)
-- ---------------------------------------------------------------------------
create or replace function sync_org_from_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cycle_id is not null then
    new.organization_id := cycle_owner_org(new.cycle_id);
    if new.organization_id is null then
      raise exception 'Vụ % không tồn tại', new.cycle_id;
    end if;
  end if;
  return new;
end $$;

-- quyền ghi bản ghi con: theo vụ nếu có, nếu không thì theo tổ chức
create or replace function can_log(org uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when c is not null then can_log_cycle(c)
              else has_org_role(org, array['owner','manager','worker','inventory_finance']::member_role[]) end;
$$;

create or replace function can_read_scoped(org uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when c is not null then can_read_cycle(c) else is_org_member(org) end;
$$;

create or replace function can_manage_cycle_or_org(org uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when c is not null then can_manage_cycle(c)
              else has_org_role(org, array['owner','manager']::member_role[]) end;
$$;

-- ---------------------------------------------------------------------------
-- Giai đoạn, việc, nhật ký, thu hoạch
-- ---------------------------------------------------------------------------
create table production_stages (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  name text not null,
  seq integer not null default 0,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on production_stages (cycle_id, seq);
create trigger production_stages_org before insert or update of cycle_id on production_stages
  for each row execute function sync_org_from_cycle();
create trigger production_stages_updated before update on production_stages
  for each row execute function set_updated_at();

create type task_status as enum ('todo', 'done', 'skipped');

create table production_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  work_type_id uuid not null references work_types(id),
  title text not null,
  due_date date,
  status task_status not null default 'todo',
  assigned_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on production_tasks (cycle_id, due_date);
create trigger production_tasks_org before insert or update of cycle_id on production_tasks
  for each row execute function sync_org_from_cycle();
create trigger production_tasks_updated before update on production_tasks
  for each row execute function set_updated_at();

create type record_source as enum ('online', 'offline', 'import');

-- Nhật ký: id do thiết bị tạo (idempotent). Không xóa; sửa để lại audit; "hủy" bằng voided_at.
create table activity_logs (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  cycle_id uuid references production_cycles(id),
  area_id uuid references production_areas(id),
  work_type_id uuid not null references work_types(id),
  task_id uuid references production_tasks(id),
  performed_at timestamptz not null,                        -- thời điểm thực hiện (người dùng khai)
  recorded_at timestamptz not null default now(),           -- thời điểm ghi trên thiết bị / máy chủ
  received_at timestamptz not null default now(),           -- thời điểm máy chủ nhận
  source record_source not null default 'online',
  data jsonb not null default '{}'::jsonb,                  -- trường theo work_types.field_schema
  note text,
  performed_by uuid references auth.users(id),
  created_by uuid references auth.users(id) default auth.uid(),
  voided_at timestamptz,
  void_reason text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (cycle_id is not null or area_id is not null),
  check (voided_at is null or void_reason is not null)
);
create index on activity_logs (organization_id, performed_at desc);
create index on activity_logs (cycle_id, performed_at desc);
create trigger activity_logs_org before insert or update of cycle_id on activity_logs
  for each row execute function sync_org_from_cycle();
create trigger activity_logs_bump before update on activity_logs
  for each row execute function bump_version();

create or replace function stamp_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger activity_logs_updated before update on activity_logs
  for each row execute function stamp_updated_at();

create table harvest_records (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  cycle_id uuid not null references production_cycles(id),
  harvested_at timestamptz not null,
  grade text,                                   -- phân loại
  quantity numeric not null check (quantity >= 0),
  unit text not null default 'kg',
  loss_quantity numeric check (loss_quantity is null or loss_quantity >= 0), -- hao hụt
  note text,
  source record_source not null default 'online',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  check (voided_at is null or void_reason is not null)
);
create index on harvest_records (cycle_id, harvested_at);
create trigger harvest_records_org before insert or update of cycle_id on harvest_records
  for each row execute function sync_org_from_cycle();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table crop_varieties enable row level security;
alter table crop_profiles enable row level security;
alter table work_types enable row level security;
alter table task_templates enable row level security;
alter table production_stages enable row level security;
alter table production_tasks enable row level security;
alter table activity_logs enable row level security;
alter table harvest_records enable row level security;

create policy varieties_read on crop_varieties for select to authenticated using (true);
create policy varieties_admin on crop_varieties for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy profiles_read on crop_profiles for select to authenticated using (true);
create policy profiles_admin on crop_profiles for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy templates_read on task_templates for select to authenticated using (true);
create policy templates_admin on task_templates for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy work_types_read on work_types for select to authenticated
  using (organization_id is null or is_org_member(organization_id));
create policy work_types_write on work_types for all to authenticated
  using (organization_id is not null and has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (organization_id is not null and has_org_role(organization_id, array['owner','manager']::member_role[]));
create policy work_types_admin on work_types for all to authenticated
  using (organization_id is null and is_platform_admin()) with check (organization_id is null and is_platform_admin());

create policy stages_read on production_stages for select to authenticated using (can_read_cycle(cycle_id));
create policy stages_write on production_stages for all to authenticated
  using (can_manage_cycle(cycle_id)) with check (can_manage_cycle(cycle_id));

create policy tasks_read on production_tasks for select to authenticated using (can_read_cycle(cycle_id));
create policy tasks_insert on production_tasks for insert to authenticated with check (can_manage_cycle(cycle_id));
create policy tasks_update on production_tasks for update to authenticated
  using (can_log_cycle(cycle_id)) with check (can_log_cycle(cycle_id));

create policy logs_read on activity_logs for select to authenticated using (can_read_scoped(organization_id, cycle_id));
create policy logs_insert on activity_logs for insert to authenticated
  with check (can_log(organization_id, cycle_id) and created_by = auth.uid());
create policy logs_update on activity_logs for update to authenticated
  using (can_manage_cycle_or_org(organization_id, cycle_id)) with check (can_manage_cycle_or_org(organization_id, cycle_id));
-- không có policy delete

create policy harvest_read on harvest_records for select to authenticated using (can_read_cycle(cycle_id));
create policy harvest_insert on harvest_records for insert to authenticated
  with check (can_log_cycle(cycle_id) and created_by = auth.uid());
create policy harvest_update on harvest_records for update to authenticated
  using (can_manage_cycle(cycle_id)) with check (can_manage_cycle(cycle_id));
