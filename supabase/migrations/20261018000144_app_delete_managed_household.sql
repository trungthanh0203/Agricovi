-- HTX xóa hộ do HTX tạo và quản lý khỏi danh sách (D133). remove_household chưa gỡ được loại hộ này; ở đây cho xóa hẳn khi hộ CHƯA có dữ liệu sản xuất
-- (chưa có phân khu, vụ, và không bị bản ghi nào khác tham chiếu). Hộ đã có dữ liệu thì báo rõ, không xóa để không mất dữ liệu.
create function delete_managed_household(p_coop uuid, p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_coop, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ HTX được xóa hộ thành viên.'; end if;
  if (select managed_by_org from organizations where id = p_household) is distinct from p_coop then
    raise exception 'NOT_MANAGED: Đây là hộ tự tham gia HTX, hãy dùng "Gỡ khỏi HTX" thay vì xóa.';
  end if;
  if exists (select 1 from production_cycles c where c.owner_org_id = p_household)
     or exists (select 1 from production_areas a where a.organization_id = p_household) then
    raise exception 'HAS_DATA: Hộ này đã có phân khu hoặc vụ sản xuất nên không xóa được (sẽ mất dữ liệu). Hãy chuyển quyền chủ hộ hoặc tạm ngưng hộ.';
  end if;
  delete from cooperative_memberships where household_org_id = p_household;
  delete from organizations where id = p_household;
exception when foreign_key_violation then
  raise exception 'HAS_DATA: Hộ này đã có dữ liệu ghi nhận nên không xóa được (sẽ mất dữ liệu). Hãy chuyển quyền chủ hộ hoặc tạm ngưng hộ.';
end $$;
revoke execute on function delete_managed_household(uuid, uuid) from public, anon;
grant execute on function delete_managed_household(uuid, uuid) to authenticated;
