-- 1) Loại khu của trang trại: Trồng trọt (crop), Chăn nuôi (livestock), Cơ sở vật chất (facility), Khác (other).
--    Giá trị cũ 'growing' đổi thành 'livestock' nếu khu đã có vụ vật nuôi, còn lại 'crop'.
alter table production_areas drop constraint production_areas_kind_check;
update production_areas a set kind = case
  when exists (select 1 from production_cycles c join crop_types t on t.id = c.crop_type_id
                where c.area_id = a.id and t.kind = 'livestock') then 'livestock' else 'crop' end
 where a.kind = 'growing';
alter table production_areas alter column kind set default 'crop';
alter table production_areas add constraint production_areas_kind_check check (kind in ('crop', 'livestock', 'facility', 'other'));

-- 2) Hộ thành viên HTX: thông tin cơ bản để quản lý (do HTX ghi, nằm ở bản ghi tư cách thành viên)
alter table cooperative_memberships
  add column member_code text check (member_code is null or (member_code = trim(member_code) and length(member_code) between 1 and 40)),
  add column head_name text check (head_name is null or length(head_name) <= 120),
  add column phone text check (phone is null or length(phone) <= 30),
  add column address text check (address is null or length(address) <= 200),
  add column main_products text check (main_products is null or length(main_products) <= 200),
  add column area_ha numeric check (area_ha is null or area_ha >= 0),
  add column note text check (note is null or length(note) <= 500);
create unique index cooperative_member_code_uq on cooperative_memberships (cooperative_org_id, lower(member_code)) where member_code is not null;

create function update_coop_household(
  p_coop uuid, p_household uuid, p_member_code text, p_head_name text, p_phone text, p_address text,
  p_main_products text, p_area_ha numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := null;
begin
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa hộ thành viên.'; end if;
  begin
    update cooperative_memberships set
      member_code = nullif(trim(coalesce(p_member_code, '')), ''),
      head_name = nullif(trim(coalesce(p_head_name, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      main_products = nullif(trim(coalesce(p_main_products, '')), ''),
      area_ha = p_area_ha,
      note = nullif(trim(coalesce(p_note, '')), '')
     where cooperative_org_id = p_coop and household_org_id = p_household and status = 'active';
  exception when unique_violation then
    raise exception 'DUPLICATE_CODE: Mã hộ này đã được dùng cho hộ khác trong HTX.';
  end;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy hộ thành viên này.'; end if;
end $$;
revoke execute on function update_coop_household(uuid, uuid, text, text, text, text, text, numeric, text) from public, anon;
grant execute on function update_coop_household(uuid, uuid, text, text, text, text, text, numeric, text) to authenticated, service_role;

drop function list_coop_households(uuid);
create function list_coop_households(p_coop uuid) returns table (
  household_org_id uuid, name text, joined_at timestamptz, managed boolean, active_coop_cycles integer,
  member_code text, head_name text, phone text, address text, main_products text, area_ha numeric, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN'; end if;
  return query
    select h.id, h.name, cm.joined_at, coalesce(h.managed_by_org = p_coop, false), active_coop_cycles(p_coop, h.id),
           cm.member_code, cm.head_name, cm.phone, cm.address, cm.main_products, cm.area_ha, cm.note
      from cooperative_memberships cm join organizations h on h.id = cm.household_org_id
     where cm.cooperative_org_id = p_coop and cm.status = 'active'
     order by cm.member_code nulls last, h.name;
end $$;
revoke execute on function list_coop_households(uuid) from public, anon;
grant execute on function list_coop_households(uuid) to authenticated, service_role;
