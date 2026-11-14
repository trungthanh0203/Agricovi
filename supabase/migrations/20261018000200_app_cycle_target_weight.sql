-- Mục 14 lát 2: DỰ BÁO NGÀY XUẤT CHUỒNG. Thêm "cân nặng xuất chuồng dự kiến" (kg/con) của lứa nuôi; app dựa vào tăng trọng gần đây (ADG) để ước ngày đạt cân.
-- Chỉ lưu mục tiêu do cơ sở tự đặt (không nạp sẵn số kỹ thuật). Đọc qua get_cycle_growth (kèm sẵn trong kết quả) nên không phải thêm cột vào danh sách tải vụ.

alter table production_cycles add column target_weight_kg numeric
  check (target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 5000));

create or replace function set_cycle_target_weight(p_cycle uuid, p_kg numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý vụ đặt được cân nặng xuất chuồng dự kiến.';
  end if;
  if p_kg is not null and (p_kg <= 0 or p_kg > 5000) then
    raise exception 'INVALID_WEIGHT: Cân nặng xuất chuồng phải lớn hơn 0 và không quá 5.000 kg mỗi con.';
  end if;
  update production_cycles set target_weight_kg = p_kg where id = p_cycle;
end $$;
revoke execute on function set_cycle_target_weight(uuid, numeric) from public, anon;
grant execute on function set_cycle_target_weight(uuid, numeric) to authenticated, service_role;

-- get_cycle_growth: vá bản HIỆN TẠI để kết quả có thêm target_weight_kg
do $$
declare d text;
begin
  d := pg_get_functiondef('get_cycle_growth(uuid)'::regprocedure);
  if position('return jsonb_build_object(''weighings'', v_weigh,' in d) = 0 then raise exception 'get_cycle_growth: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, 'return jsonb_build_object(''weighings'', v_weigh,',
    'return jsonb_build_object(''target_weight_kg'', (select c.target_weight_kg from production_cycles c where c.id = p_cycle), ''weighings'', v_weigh,');
  execute d;
end $$;
