-- Loại khu chuyển từ PHÂN KHU sang Ô SẢN XUẤT (D128): một phân khu có thể có các ô khác loại (nhà màng trồng cây, chuồng nuôi, ô cơ sở vật chất…).
-- - Ô giữ loại (kind, kind_item) riêng, không còn bị ép theo phân khu cha; đổi loại phân khu cha không còn kéo theo các ô con.
-- - Ô cơ sở vật chất (cổng, kho…) được phép nằm trong một phân khu. Vẫn không gắn vụ vào khu cơ sở vật chất (trigger của 0080).
-- Giữ nguyên: chỉ 2 cấp, cùng cơ sở, phân khu đã có vụ không thêm ô trực tiếp (dùng split_area_into_cells), chia ô chuyển vụ sang ô đầu tiên (kế thừa loại của phân khu cũ).

drop trigger if exists production_areas_kind_propagate on production_areas;
drop function if exists area_kind_propagate();

drop trigger if exists production_areas_parent on production_areas;
create or replace function area_parent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p production_areas;
begin
  if new.parent_id is null then return new; end if;
  select * into p from production_areas where id = new.parent_id;
  if not found or p.organization_id <> new.organization_id then
    raise exception 'INVALID_PARENT: Phân khu cha phải thuộc cùng cơ sở.';
  end if;
  if p.parent_id is not null then
    raise exception 'INVALID_PARENT: Chỉ chia 2 cấp (phân khu rồi ô sản xuất).';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from production_areas c where c.parent_id = new.id) then
    raise exception 'INVALID_PARENT: Khu này đã có ô con nên không thành ô sản xuất được.';
  end if;
  if current_setting('agri.area_split', true) is distinct from 'on'
     and exists (select 1 from production_cycles c where c.area_id = p.id) then
    raise exception 'AREA_HAS_CYCLES: Phân khu này đã có vụ. Hãy dùng "Chia thành ô sản xuất" để chuyển các vụ hiện có sang ô.';
  end if;
  return new;
end $$;
create trigger production_areas_parent before insert or update of parent_id on production_areas
  for each row execute function area_parent_guard();
