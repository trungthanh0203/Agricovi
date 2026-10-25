-- P1 / M1 (D98): MÃ + LOẠI + KIỂU CHUỒNG của khu, và thông tin quản lý của vụ/lứa nuôi.
-- Khu có 2 loại: 'growing' (khu nuôi/trồng, tạo vụ được) và 'facility' (cơ sở vật chất: cổng, kho, biogas, hố sát trùng...,
-- chỉ ghi việc, không tạo vụ). Việc ghi cho khu không gắn vụ dùng cột activity_logs.area_id đã có.

alter table production_areas
  add column code text check (code is null or (code = trim(code) and length(code) between 1 and 40)),
  add column kind text not null default 'growing' check (kind in ('growing', 'facility')),
  add column housing text check (housing is null or housing in ('closed', 'semi_open', 'open'));
create unique index production_areas_code_uq on production_areas (organization_id, lower(code)) where code is not null;

alter table production_cycles
  add column code text check (code is null or (code = trim(code) and length(code) between 1 and 40)),
  add column count_unit text check (count_unit is null or length(count_unit) between 1 and 20),
  add column supervisor_name text check (supervisor_name is null or length(supervisor_name) <= 120),
  add column supervisor_phone text check (supervisor_phone is null or length(supervisor_phone) <= 30);
create unique index production_cycles_code_uq on production_cycles (owner_org_id, lower(code)) where code is not null;

-- Khu cơ sở vật chất không có vụ: chặn tạo vụ vào khu đó và chặn đổi khu đã có vụ thành cơ sở vật chất
create or replace function cycle_area_kind_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from production_areas a where a.id = new.area_id and a.kind = 'facility') then
    raise exception 'FACILITY_AREA: Đây là khu cơ sở vật chất (cổng, kho, biogas...), không tạo vụ được. Hãy chọn khu nuôi/trồng.';
  end if;
  return new;
end $$;
create trigger production_cycles_area_kind before insert or update of area_id on production_cycles
  for each row execute function cycle_area_kind_guard();

create or replace function area_kind_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'facility' and old.kind is distinct from 'facility'
     and exists (select 1 from production_cycles c where c.area_id = new.id) then
    raise exception 'AREA_HAS_CYCLES: Khu này đã có vụ nên không đổi thành cơ sở vật chất được.';
  end if;
  return new;
end $$;
create trigger production_areas_kind before update of kind on production_areas
  for each row execute function area_kind_guard();

-- Nhật ký gắn khu (không gắn vụ): khu phải thuộc đúng cơ sở và nằm trong phạm vi trang trại của người ghi (D83)
create or replace function activity_log_area_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cycle_id is null and new.area_id is not null then
    if not exists (select 1 from production_areas a where a.id = new.area_id and a.organization_id = new.organization_id) then
      raise exception 'INVALID_AREA: Khu không thuộc cơ sở này.';
    end if;
    if auth.uid() is not null and not scope_ok(new.organization_id, new.area_id) then
      raise exception 'FORBIDDEN: Bạn không được ghi việc cho khu này.';
    end if;
  end if;
  return new;
end $$;
create trigger activity_logs_area_guard before insert on activity_logs
  for each row execute function activity_log_area_guard();

-- Đặt mã vụ/lô, đơn vị đếm, cán bộ kỹ thuật phụ trách (người quản lý vụ); trống = bỏ
create or replace function set_cycle_ext(
  p_cycle uuid, p_code text, p_count_unit text, p_supervisor_name text, p_supervisor_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền sửa thông tin quản lý của vụ này.';
  end if;
  begin
    update production_cycles set code = nullif(trim(coalesce(p_code, '')), ''),
           count_unit = nullif(trim(coalesce(p_count_unit, '')), ''),
           supervisor_name = nullif(trim(coalesce(p_supervisor_name, '')), ''),
           supervisor_phone = nullif(trim(coalesce(p_supervisor_phone, '')), '')
     where id = p_cycle;
  exception when unique_violation then
    raise exception 'DUPLICATE_CODE: Mã này đã được dùng cho vụ khác trong cơ sở. Hãy đặt mã khác.';
  end;
end $$;
revoke execute on function set_cycle_ext(uuid, text, text, text, text) from public, anon;
grant execute on function set_cycle_ext(uuid, text, text, text, text) to authenticated, service_role;
