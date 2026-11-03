-- D155 (bổ sung): đổi chữ "nhà màng" thành "ô sản xuất" trong thông báo của change_cycle_area (khu nuôi trồng có thể là chuồng, ao...).
create or replace function change_cycle_area(p_cycle uuid, p_area uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c production_cycles; v_old_org uuid; a production_areas;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền sửa vụ này.'; end if;
  if c.status <> 'preparing' then
    raise exception 'CYCLE_STARTED: Chỉ đổi ô sản xuất khi vụ còn ở trạng thái Chuẩn bị (chưa bắt đầu sản xuất).';
  end if;
  if exists (select 1 from harvest_records h where h.cycle_id = p_cycle and h.voided_at is null)
     or exists (select 1 from sales_records s where s.cycle_id = p_cycle and s.voided_at is null) then
    raise exception 'HAS_OUTPUT: Vụ đã có thu hoạch hoặc doanh thu nên không đổi ô sản xuất được.';
  end if;
  select * into a from production_areas where id = p_area;
  if a.id is null or not a.is_active then raise exception 'INVALID_AREA: Ô sản xuất không tồn tại hoặc đã dừng.'; end if;
  v_old_org := cycle_area_org(p_cycle);
  if a.organization_id is distinct from v_old_org then raise exception 'INVALID_AREA: Hãy chọn ô sản xuất trong cùng cơ sở/hộ với ô sản xuất hiện tại.'; end if;
  if not can_create_cycle(c.owner_org_id, p_area) then raise exception 'FORBIDDEN: Bạn không có quyền ở ô sản xuất này.'; end if;
  if p_area = c.area_id then return; end if;
  update production_cycles set area_id = p_area where id = p_cycle;   -- trigger kiểm: không chọn khu cơ sở vật chất, không chọn phân khu đã chia ô
end $$;
