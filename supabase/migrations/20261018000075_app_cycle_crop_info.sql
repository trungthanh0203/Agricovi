-- D94 (Đợt 1 trồng trọt, T1): THÔNG TIN GIỐNG VÀ DIỆN TÍCH CỦA VỤ để tính năng suất, chi phí, lãi theo diện tích.
-- Diện tích lưu theo m² (người dùng nhập bằng m², ha, sào, công; app quy đổi). Không bắt buộc.

alter table production_cycles
  add column planted_area_m2 numeric check (planted_area_m2 is null or planted_area_m2 > 0),
  add column plant_count integer check (plant_count is null or plant_count > 0),
  add column variety_name text check (variety_name is null or length(variety_name) <= 120),
  add column seed_source text check (seed_source is null or length(seed_source) <= 200),
  add column seed_lot text check (seed_lot is null or length(seed_lot) <= 80),
  add column sowing_date date,
  add column planting_date date,
  add constraint cycles_plant_after_sow check (sowing_date is null or planting_date is null or planting_date >= sowing_date);

-- Đặt/đổi thông tin giống và diện tích (người quản lý vụ); null = bỏ
create or replace function set_cycle_info(
  p_cycle uuid, p_area_m2 numeric, p_plants integer, p_variety text, p_seed_source text, p_seed_lot text, p_sowing date, p_planting date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền sửa thông tin giống và diện tích của vụ này.';
  end if;
  if p_area_m2 is not null and p_area_m2 <= 0 then raise exception 'INVALID_AMOUNT: Diện tích phải lớn hơn 0.'; end if;
  if p_plants is not null and p_plants <= 0 then raise exception 'INVALID_AMOUNT: Số cây phải lớn hơn 0.'; end if;
  if p_sowing is not null and p_planting is not null and p_planting < p_sowing then
    raise exception 'INVALID_DATE: Ngày trồng không thể trước ngày gieo.';
  end if;
  update production_cycles set planted_area_m2 = p_area_m2, plant_count = p_plants,
         variety_name = nullif(trim(coalesce(p_variety, '')), ''), seed_source = nullif(trim(coalesce(p_seed_source, '')), ''),
         seed_lot = nullif(trim(coalesce(p_seed_lot, '')), ''), sowing_date = p_sowing, planting_date = p_planting
   where id = p_cycle;
end $$;
revoke execute on function set_cycle_info(uuid, numeric, integer, text, text, text, date, date) from public, anon;
grant execute on function set_cycle_info(uuid, numeric, integer, text, text, text, date, date) to authenticated, service_role;

-- Số liệu theo diện tích trong get_cycles_stats: năng suất, chi phí, doanh thu, lãi trên 1.000 m², kg mỗi cây, mật độ.
-- (tiền theo quyền Tổng kết vụ, thu hoạch theo quyền Thu hoạch: dùng lại các biến đã kiểm quyền trong hàm)
do $$
declare d text; k text := '''target_yield_kg'', c.target_yield_kg,';
begin
  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  if position(k in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, k || chr(10)
    || '      ''area_m2'', c.planted_area_m2, ''plant_count'', c.plant_count, ''variety'', c.variety_name,' || chr(10)
    || '      ''density_per_1000m2'', case when c.planted_area_m2 > 0 and c.plant_count is not null then round(c.plant_count / c.planted_area_m2 * 1000) end,' || chr(10)
    || '      ''yield_per_1000m2'', case when c.planted_area_m2 > 0 and v_net is not null then round(v_net / c.planted_area_m2 * 1000, 1) end,' || chr(10)
    || '      ''kg_per_plant'', case when c.plant_count > 0 and v_net is not null then round(v_net / c.plant_count, 2) end,' || chr(10)
    || '      ''cost_per_1000m2'', case when c.planted_area_m2 > 0 and v_total is not null then round(v_total / c.planted_area_m2 * 1000) end,' || chr(10)
    || '      ''revenue_per_1000m2'', case when c.planted_area_m2 > 0 and v_rev is not null then round(v_rev / c.planted_area_m2 * 1000) end,' || chr(10)
    || '      ''profit_per_1000m2'', case when c.planted_area_m2 > 0 and v_profit is not null then round(v_profit / c.planted_area_m2 * 1000) end,');
  execute d;
end $$;
