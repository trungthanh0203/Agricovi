-- Kho dùng cho trang trại nào: null = tất cả trang trại; có danh sách = chỉ các trang trại đó (gợi ý khi chọn kho lúc ghi việc).
alter table inventory_locations add column area_ids uuid[];

create function location_areas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.area_ids is not null and cardinality(new.area_ids) = 0 then new.area_ids := null; end if;
  if new.area_ids is not null and exists (
       select 1 from unnest(new.area_ids) x
        where not exists (select 1 from production_areas a where a.id = x and a.organization_id = new.organization_id)) then
    raise exception 'INVALID_AREA: Có trang trại không thuộc cơ sở này.';
  end if;
  return new;
end $$;
create trigger inventory_locations_areas before insert or update of area_ids on inventory_locations
  for each row execute function location_areas_guard();
