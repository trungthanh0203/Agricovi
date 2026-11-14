-- Mục 6 báo cáo đối thủ: SỐ ĐO NHẬP TAY (pH, DO, nhiệt độ nước, độ mặn, EC, nhiệt độ/độ ẩm không khí, hoặc chỉ số riêng do chủ thêm) kèm NGƯỠNG cảnh báo.
-- Bù tạm phần cảm biến bằng giá gần như bằng 0; sau này cổng nhận số liệu cảm biến (mục 12) có thể ghi vào chính bảng này (source = 'sensor').
-- Khớp hệ thống đang có:
--  * Số đo gắn VỤ (như nhật ký, số lượng): quyền đọc/ghi theo can_read_cycle / can_log_cycle; khu/ao lấy tự động từ vụ.
--  * Ghi mới của nhân viên dùng được offline (D24): id do thiết bị tạo, gửi bằng ON CONFLICT DO NOTHING; hủy cần mạng và lý do; không sửa, không xóa.
--  * Ngưỡng là cấu hình của CƠ SỞ (chủ vụ): chỉ chủ/quản lý đặt; mặc định TRỐNG (chưa có ngưỡng thì không cảnh báo) cho tới khi chuyên gia duyệt.

create table measure_readings (
  id uuid primary key,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  area_id uuid references production_areas(id),
  metric text not null check (metric ~ '^[a-z0-9_]{1,40}$'),       -- khóa chuẩn (ph, do, ...) hoặc chỉ số riêng 'x_...'
  value numeric not null check (value > -1000000 and value < 1000000000),
  measured_at timestamptz not null,
  note text check (note is null or length(note) <= 300),
  source record_source not null default 'online',
  created_by uuid references auth.users(id) default auth.uid(),
  author_name text,
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(void_reason) <= 300),
  check (voided_at is null or void_reason is not null)
);
create index on measure_readings (cycle_id, measured_at desc);
create index on measure_readings (organization_id, metric, measured_at desc);

create trigger measure_readings_org before insert on measure_readings
  for each row execute function sync_org_from_cycle();
create or replace function measure_readings_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_name := author_display_name(new.created_by, new.organization_id, null);
  new.area_id := (select area_id from production_cycles where id = new.cycle_id);
  if new.measured_at > now() + interval '1 day' then
    raise exception 'INVALID_DATE: Thời điểm đo không được ở tương lai.';
  end if;
  return new;
end $$;
create trigger measure_readings_b_guard before insert on measure_readings
  for each row execute function measure_readings_guard();

alter table measure_readings enable row level security;
-- chính sách đọc dựa vào CỘT của hàng (cycle_id) để INSERT ... ON CONFLICT DO NOTHING của hàng đợi offline chạy được (bẫy số 1 và 8)
create policy measure_read on measure_readings for select to authenticated using (can_read_cycle(cycle_id));
create policy measure_insert on measure_readings for insert to authenticated
  with check (can_log_cycle(cycle_id) and created_by = auth.uid());
revoke update, delete on measure_readings from authenticated, anon;

create or replace function void_measure_reading(p_id uuid, p_reason text) returns measure_readings
language plpgsql security definer set search_path = public as $$
declare e measure_readings;
begin
  select * into e from measure_readings where id = p_id;
  if e.id is null or not can_read_cycle(e.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy số đo.'; end if;
  if not (can_manage_cycle(e.cycle_id) or (e.created_by = auth.uid() and e.created_at > now() - interval '24 hours')) then
    raise exception 'FORBIDDEN: Chỉ người quản lý vụ, hoặc người ghi trong 24 giờ đầu, mới hủy được.';
  end if;
  if e.voided_at is not null then return e; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'INVALID_REASON: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  update measure_readings set voided_at = now(), void_reason = trim(p_reason) where id = p_id returning * into e;
  return e;
end $$;
revoke execute on function void_measure_reading(uuid, text) from public, anon;
grant execute on function void_measure_reading(uuid, text) to authenticated, service_role;

-- Ngưỡng cảnh báo và chỉ số riêng của cơ sở. Chỉ số chuẩn: ph, do, water_temp, salinity, ec, air_temp, humidity (nhãn/đơn vị ở app).
-- Chỉ số riêng: khóa bắt đầu bằng 'x_', bắt buộc có tên và đơn vị.
create table measure_limits (
  organization_id uuid not null references organizations(id) on delete cascade,
  metric text not null check (metric ~ '^[a-z0-9_]{1,40}$'),
  label text check (label is null or length(label) between 1 and 60),
  unit text check (unit is null or length(unit) <= 20),
  min_value numeric,
  max_value numeric,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, metric),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (metric not like 'x\_%' or (label is not null and unit is not null))
);
alter table measure_limits enable row level security;
create policy measure_limits_read on measure_limits for select to authenticated using (is_org_member(organization_id));
revoke insert, update, delete on measure_limits from authenticated, anon;

create or replace function set_measure_limit(p_org uuid, p_metric text, p_label text, p_unit text, p_min numeric, p_max numeric, p_active boolean default true)
returns measure_limits language plpgsql security definer set search_path = public as $$
declare r measure_limits; m text := lower(trim(coalesce(p_metric, '')));
begin
  if not has_org_role(p_org, array['owner','manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở hoặc quản lý đặt được ngưỡng.';
  end if;
  if m !~ '^[a-z0-9_]{1,40}$' then raise exception 'INVALID_METRIC: Chỉ số không hợp lệ.'; end if;
  if m like 'x\_%' and (length(trim(coalesce(p_label, ''))) < 1 or length(trim(coalesce(p_unit, ''))) < 1) then
    raise exception 'INVALID_METRIC: Chỉ số riêng cần có tên và đơn vị.';
  end if;
  if p_min is not null and p_max is not null and p_min > p_max then
    raise exception 'INVALID_RANGE: Ngưỡng thấp nhất không được lớn hơn ngưỡng cao nhất.';
  end if;
  insert into measure_limits (organization_id, metric, label, unit, min_value, max_value, is_active, updated_by, updated_at)
  values (p_org, m, nullif(trim(p_label), ''), nullif(trim(p_unit), ''), p_min, p_max, coalesce(p_active, true), auth.uid(), now())
  on conflict (organization_id, metric) do update
    set label = excluded.label, unit = excluded.unit, min_value = excluded.min_value, max_value = excluded.max_value,
        is_active = excluded.is_active, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function set_measure_limit(uuid, text, text, text, numeric, numeric, boolean) from public, anon;
grant execute on function set_measure_limit(uuid, text, text, text, numeric, numeric, boolean) to authenticated, service_role;
