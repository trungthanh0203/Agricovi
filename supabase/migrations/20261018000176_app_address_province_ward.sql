-- Chuẩn hóa địa chỉ theo 2 cấp hành chính: Tỉnh/thành phố, Xã/phường, và dòng "Địa chỉ" (số nhà, đường, thôn/ấp…).
-- Cột chữ cũ (partners.address, production_areas.location, cooperative_memberships.address) GIỮ NGUYÊN làm dòng "Địa chỉ"; thêm hai cột province, ward.
-- Dữ liệu cũ không bị đổi: người dùng bổ sung tỉnh/xã khi sửa lần sau.

alter table partners
  add column province text check (province is null or length(province) between 1 and 60),
  add column ward text check (ward is null or length(ward) between 1 and 80);
alter table production_areas
  add column province text check (province is null or length(province) between 1 and 60),
  add column ward text check (ward is null or length(ward) between 1 and 80);
alter table cooperative_memberships
  add column province text check (province is null or length(province) between 1 and 60),
  add column ward text check (ward is null or length(ward) between 1 and 80);

drop function update_coop_household(uuid, uuid, text, text, text, text, text, numeric, text, text, text);
create function update_coop_household(
  p_coop uuid, p_household uuid, p_member_code text, p_head_name text, p_phone text, p_address text,
  p_main_products text, p_area_ha numeric, p_note text, p_activity_status text default 'active', p_certificates text default null,
  p_province text default null, p_ward text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa hộ thành viên.'; end if;
  if p_activity_status is null or p_activity_status not in ('active', 'paused') then
    raise exception 'INVALID_STATUS: Trạng thái hộ chỉ là đang hoạt động hoặc tạm ngưng.';
  end if;
  begin
    update cooperative_memberships set
      member_code = nullif(trim(coalesce(p_member_code, '')), ''),
      head_name = nullif(trim(coalesce(p_head_name, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      province = nullif(trim(coalesce(p_province, '')), ''),
      ward = nullif(trim(coalesce(p_ward, '')), ''),
      main_products = nullif(trim(coalesce(p_main_products, '')), ''),
      area_ha = p_area_ha,
      note = nullif(trim(coalesce(p_note, '')), ''),
      activity_status = p_activity_status,
      certificates = nullif(trim(coalesce(p_certificates, '')), '')
     where cooperative_org_id = p_coop and household_org_id = p_household and status = 'active';
  exception when unique_violation then
    raise exception 'DUPLICATE_CODE: Mã hộ này đã được dùng cho hộ khác trong HTX.';
  end;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy hộ thành viên này.'; end if;
end $$;
revoke execute on function update_coop_household(uuid, uuid, text, text, text, text, text, numeric, text, text, text, text, text) from public, anon;
grant execute on function update_coop_household(uuid, uuid, text, text, text, text, text, numeric, text, text, text, text, text) to authenticated, service_role;

drop function list_coop_households(uuid);
create function list_coop_households(p_coop uuid) returns table (
  household_org_id uuid, name text, joined_at timestamptz, managed boolean, active_coop_cycles integer,
  member_code text, head_name text, phone text, address text, main_products text, area_ha numeric, note text,
  activity_status text, certificates text, province text, ward text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN'; end if;
  return query
    select h.id, h.name, cm.joined_at, coalesce(h.managed_by_org = p_coop, false), active_coop_cycles(p_coop, h.id),
           cm.member_code, cm.head_name, cm.phone, cm.address, cm.main_products, cm.area_ha, cm.note,
           cm.activity_status, cm.certificates, cm.province, cm.ward
      from cooperative_memberships cm join organizations h on h.id = cm.household_org_id
     where cm.cooperative_org_id = p_coop and cm.status = 'active'
     order by cm.member_code nulls last, h.name;
end $$;
revoke execute on function list_coop_households(uuid) from public, anon;
grant execute on function list_coop_households(uuid) to authenticated, service_role;
