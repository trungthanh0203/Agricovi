-- Thêm cấp NHÀ MÀNG dưới PHÂN KHU (D125): Cơ sở → Phân khu (cấp 1, cụm) → Nhà màng / Chuồng / Ao (cấp 2, nơi chạy vụ).
-- Dùng lại bảng production_areas: cấp 2 là một dòng có parent_id trỏ về phân khu cha. Chỉ 2 cấp.
-- - Vụ gắn vào cấp thấp nhất: phân khu đã chia nhà màng thì vụ phải gắn vào nhà màng; phân khu chưa chia thì vụ vẫn gắn thẳng như cũ.
-- - Nhà màng luôn cùng loại (kind) với phân khu cha.
-- - Giao phân khu cho người làm (organization_memberships.area_ids) tự gồm các nhà màng con; người chỉ được giao một nhà màng vẫn đọc được phân khu cha.
-- - split_area_into_cells: phân khu đang có vụ → tạo nhà màng đầu tiên và chuyển các vụ hiện có sang đó.
-- - Máy chấm công gắn phân khu cấp 1; tùy chọn "hỏi làm cho vụ nào" hiện cả vụ của các nhà màng con.

alter table production_areas
  add column parent_id uuid references production_areas(id) on delete restrict,
  add constraint production_areas_parent_self check (parent_id is null or parent_id <> id);
create index on production_areas (parent_id) where parent_id is not null;

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
    raise exception 'INVALID_PARENT: Chỉ chia 2 cấp (phân khu rồi nhà màng).';
  end if;
  if p.kind = 'facility' or new.kind = 'facility' then
    raise exception 'INVALID_PARENT: Khu cơ sở vật chất không chia nhà màng.';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from production_areas c where c.parent_id = new.id) then
    raise exception 'INVALID_PARENT: Khu này đã có nhà màng con nên không thành nhà màng được.';
  end if;
  if current_setting('agri.area_split', true) is distinct from 'on'
     and exists (select 1 from production_cycles c where c.area_id = p.id) then
    raise exception 'AREA_HAS_CYCLES: Phân khu này đã có vụ. Hãy dùng "Chia thành nhà màng" để chuyển các vụ hiện có sang nhà màng.';
  end if;
  new.kind := p.kind;
  new.kind_item := p.kind_item;
  return new;
end $$;
create trigger production_areas_parent before insert or update of parent_id, kind on production_areas
  for each row execute function area_parent_guard();

-- Đổi loại của phân khu cha thì các nhà màng con đổi theo; phân khu đã chia nhà màng không thành cơ sở vật chất
create or replace function area_kind_propagate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from production_areas c where c.parent_id = new.id) then
    if new.kind = 'facility' then
      raise exception 'INVALID_PARENT: Phân khu đã chia nhà màng nên không đổi thành cơ sở vật chất được.';
    end if;
    update production_areas set kind = new.kind, kind_item = new.kind_item where parent_id = new.id;
  end if;
  return null;
end $$;
create trigger production_areas_kind_propagate after update of kind, kind_item on production_areas
  for each row when (old.kind is distinct from new.kind or old.kind_item is distinct from new.kind_item)
  execute function area_kind_propagate();

-- Vụ: không gắn vào phân khu đã chia nhà màng
create or replace function cycle_area_kind_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from production_areas a where a.id = new.area_id and a.kind = 'facility') then
    raise exception 'FACILITY_AREA: Đây là khu cơ sở vật chất (cổng, kho, biogas...), không tạo vụ được. Hãy chọn khu nuôi/trồng.';
  end if;
  if exists (select 1 from production_areas c where c.parent_id = new.area_id) then
    raise exception 'AREA_HAS_CELLS: Phân khu này đã chia nhà màng. Hãy chọn một nhà màng để tạo vụ.';
  end if;
  return new;
end $$;

-- Phạm vi theo phân khu: giao phân khu cha thì gồm các nhà màng con
create or replace function scope_ok(p_org uuid, p_area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when 'owner' = any (m.roles) or m.area_ids is null then true
             when (select a.organization_id from production_areas a where a.id = p_area) is distinct from p_org then true
             else p_area = any (m.area_ids)
               or coalesce((select a.parent_id = any (m.area_ids) from production_areas a where a.id = p_area), false)
           end
      from organization_memberships m
     where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'), false);
$$;

-- Đọc phân khu: người chỉ được giao nhà màng con vẫn đọc được phân khu cha (để hiện tên "Phân khu › Nhà màng")
create or replace function can_read_area(area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (is_org_member(a.organization_id) and (scope_ok(a.organization_id, area)
            or exists (select 1 from production_areas ch where ch.parent_id = area and scope_ok(a.organization_id, ch.id))))
      or exists (select 1 from production_cycles pc
                 where pc.area_id = area and is_org_member(pc.owner_org_id) and scope_ok(pc.owner_org_id, area))
  from production_areas a where a.id = area;
$$;

-- Chia phân khu đang có vụ thành nhà màng: tạo nhà màng đầu tiên (kế thừa loại, diện tích, kiểu nhà) và chuyển các vụ hiện có sang đó
create or replace function split_area_into_cells(p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p production_areas; child uuid := gen_random_uuid();
begin
  select * into p from production_areas where id = p_parent;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy phân khu.'; end if;
  if not has_perm(p.organization_id, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền khai báo.'; end if;
  if p.parent_id is not null then raise exception 'INVALID_PARENT: Chỉ phân khu cấp 1 mới chia nhà màng.'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'INVALID_NAME: Hãy nhập tên nhà màng.'; end if;
  if exists (select 1 from production_areas c where c.parent_id = p.id) then
    raise exception 'ALREADY_SPLIT: Phân khu đã chia nhà màng. Hãy thêm nhà màng mới.';
  end if;
  if not exists (select 1 from production_cycles c where c.area_id = p.id) then
    raise exception 'NO_CYCLES: Phân khu chưa có vụ nào. Chỉ cần thêm nhà màng.';
  end if;
  perform set_config('agri.area_split', 'on', true);
  insert into production_areas (id, organization_id, name, kind, kind_item, housing, area_size, area_unit, parent_id)
    values (child, p.organization_id, trim(p_name), p.kind, p.kind_item, p.housing, p.area_size, p.area_unit, p.id);
  update production_cycles set area_id = child where area_id = p.id;
  perform set_config('agri.area_split', 'off', true);
  return child;
end $$;
revoke execute on function split_area_into_cells(uuid, text) from public, anon;
grant execute on function split_area_into_cells(uuid, text) to authenticated;

-- Máy chấm công: tùy chọn "hỏi làm cho vụ nào" hiện vụ của phân khu đặt máy, gồm cả các nhà màng con
create or replace function kiosk_cycle_options(p_kiosk attendance_kiosks) returns table (cid uuid, cname text, in_area boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select pc.id, coalesce(nullif(trim(pc.name), ''), coalesce(ct.name, 'Vụ') || ' ' || to_char(pc.start_date, 'DD/MM')) as nm,
           (p_kiosk.area_id is not null and (pc.area_id = p_kiosk.area_id
              or exists (select 1 from production_areas ca where ca.id = pc.area_id and ca.parent_id = p_kiosk.area_id))) as ia
      from production_cycles pc left join crop_types ct on ct.id = pc.crop_type_id
     where pc.owner_org_id = p_kiosk.organization_id and pc.status = 'active')
  select c.id, c.nm, c.ia from c
   where c.ia or not exists (select 1 from c c2 where c2.ia)
   order by c.ia desc, c.nm;
$$;
