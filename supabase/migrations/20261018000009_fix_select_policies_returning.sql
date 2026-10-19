-- Sửa: INSERT ... RETURNING (PostgREST/supabase-js thường dùng) bị RLS từ chối cho production_cycles.
-- Nguyên nhân: chính sách SELECT gọi can_read_cycle(id) tra cứu lại hàng theo id trong bảng; hàng vừa thêm
-- chưa nhìn thấy được trong chính câu lệnh đó, nên kiểm tra SELECT trên RETURNING thất bại.
-- Cách sửa: chính sách SELECT dựa trực tiếp vào CỘT của hàng đang kiểm tra.

-- Chủ khu trồng của một khu (tra cứu hàng ĐÃ tồn tại từ trước, an toàn)
create or replace function area_org(area uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from production_areas where id = area;
$$;

drop policy cycles_read on production_cycles;
create policy cycles_read on production_cycles for select to authenticated
  using (is_org_member(owner_org_id) or is_org_member(area_org(area_id)));

drop policy areas_read on production_areas;
create policy areas_read on production_areas for select to authenticated
  using (is_org_member(organization_id) or can_read_area(id));

revoke execute on function area_org(uuid) from public, anon;
grant execute on function area_org(uuid) to authenticated, service_role;
