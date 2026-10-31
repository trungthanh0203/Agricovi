-- D147: hộ thành viên do HTX tạo có tài khoản đăng nhập riêng (số điện thoại + mật khẩu), chỉ xem và nhập dữ liệu CỦA HỘ.
-- Dùng cơ chế tài khoản nhân viên có sẵn (Edge Function staff-accounts) + một chức vụ mẫu "Hộ nhập liệu" của cơ sở hộ.
-- Chủ HTX vẫn là chủ của cơ sở hộ nên xem/sửa/quản lý được mọi thứ; người của hộ không mời/gỡ người, không xem bảng lương, không đổi chức vụ.
create or replace function ensure_household_position(p_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở (chủ HTX của hộ này) được cấp tài khoản cho hộ.';
  end if;
  if (select type from organizations where id = p_org) <> 'household' then
    raise exception 'INVALID_ORG: Chỉ cấp tài khoản hộ cho cơ sở loại hộ.';
  end if;
  select id into v_id from org_positions where organization_id = p_org and name = 'Hộ nhập liệu';
  if v_id is null then
    insert into org_positions (organization_id, name, description, perms, work_type_ids, can_manage_stages, is_active, base_role, is_builtin)
      values (p_org, 'Hộ nhập liệu', 'Người của hộ: xem và nhập dữ liệu của chính hộ (vụ, ghi việc, thu hoạch, kho, chi phí, doanh thu). Không xem bảng lương, không quản lý người.',
              jsonb_build_object('inventory', 'edit', 'harvest', 'edit', 'expenses', 'edit', 'sales', 'edit', 'summary', 'view', 'declare', 'view',
                                 'payroll', 'none', 'website', 'none', 'coop', 'none'),
              null, true, true, 'manager', false)
      returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function ensure_household_position(uuid) from public, anon;
grant execute on function ensure_household_position(uuid) to authenticated;
