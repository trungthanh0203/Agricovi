-- D96 (Đợt 1, T2 bước 3): DỮ LIỆU MẪU để thử app mà không phải nhập tay. Chỉ chủ cơ sở gọi được, mỗi cơ sở MỘT lần.
-- Tạo một trang trại, kho, thuốc có thời gian cách ly, vụ dưa lưới đang chạy với nhật ký (kèm vật tư đã dùng), một sự cố đang mở.
-- Mọi mục có tiền tố "[MẪU]". Vì nhật ký và kho là bản ghi chỉ thêm nên không có nút xóa riêng;
-- muốn dọn thì chạy supabase/maintenance/wipe_all_data.sql (người dùng tự chạy khi còn là dữ liệu thử).

create table demo_seeds (
  organization_id uuid primary key references organizations(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table demo_seeds enable row level security;
create policy demo_seeds_read on demo_seeds for select to authenticated using (is_org_member(organization_id));
revoke insert, update, delete on demo_seeds from authenticated, anon;

create or replace function seed_demo_data(p_org uuid, p_kind text default 'melon') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_area uuid := gen_random_uuid(); v_loc uuid := gen_random_uuid(); v_cycle uuid := gen_random_uuid();
  v_crop uuid; v_u_pack uuid; v_u_kg uuid;
  v_ridomil uuid := gen_random_uuid(); v_radiant uuid := gen_random_uuid(); v_npk uuid := gen_random_uuid();
  v_log uuid; v_inc uuid := gen_random_uuid();
  v_wt_irri uuid; v_wt_fert uuid; v_wt_spray uuid; v_wt_pol uuid; v_wt_prune uuid;
begin
  if p_kind <> 'melon' then raise exception 'INVALID_KIND: Hiện chỉ có dữ liệu mẫu dưa lưới nhà màng.'; end if;
  if v_uid is null or not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở mới nạp được dữ liệu mẫu.';
  end if;
  if exists (select 1 from demo_seeds where organization_id = p_org) then
    raise exception 'ALREADY_SEEDED: Cơ sở này đã nạp dữ liệu mẫu rồi.';
  end if;

  select id into v_crop from crop_types where organization_id is null and code = 'melon';
  select id into v_u_pack from units_of_measure where code = 'pack';
  select id into v_u_kg from units_of_measure where code = 'kg';
  select id into v_wt_irri from work_types where organization_id is null and code = 'irrigation';
  select id into v_wt_fert from work_types where organization_id is null and code = 'fertilizing';
  select id into v_wt_spray from work_types where organization_id is null and code = 'spraying';
  select id into v_wt_pol from work_types where organization_id is null and code = 'pollination';
  select id into v_wt_prune from work_types where organization_id is null and code = 'pruning';

  perform set_config('agri.legacy_cycle_insert', 'on', true);   -- vụ mẫu không đi qua quy trình mẫu

  insert into production_areas (id, organization_id, name, description, area_size, area_unit)
    values (v_area, p_org, '[MẪU] Nhà màng số 1', 'Dữ liệu mẫu để thử app', 500, 'm2');
  insert into inventory_locations (id, organization_id, name) values (v_loc, p_org, '[MẪU] Kho vật tư');

  insert into materials (id, organization_id, name, category, base_unit_id, brand, withdrawal_days, usage_guide) values
    (v_ridomil, p_org, '[MẪU] Ridomil Gold 68WG', 'Thuốc bảo vệ thực vật', v_u_pack, 'Dữ liệu mẫu', 14, 'Trị sương mai. Cách ly 14 ngày.'),
    (v_radiant, p_org, '[MẪU] Radiant 60SC', 'Thuốc bảo vệ thực vật', v_u_pack, 'Dữ liệu mẫu', 7, 'Trị bọ trĩ, sâu. Cách ly 7 ngày.'),
    (v_npk, p_org, '[MẪU] NPK 20-20-20 tưới nhỏ giọt', 'Phân bón vô cơ', v_u_kg, 'Dữ liệu mẫu', null, null);

  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, source, recorded_by) values
    (gen_random_uuid(), p_org, v_loc, v_ridomil, 'receipt', 20, 85000, v_today - 40, 'online', v_uid),
    (gen_random_uuid(), p_org, v_loc, v_radiant, 'receipt', 20, 120000, v_today - 40, 'online', v_uid),
    (gen_random_uuid(), p_org, v_loc, v_npk, 'receipt', 100, 45000, v_today - 40, 'online', v_uid);

  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, name, planted_area_m2, plant_count, variety_name,
                                 seed_source, seed_lot, sowing_date, planting_date, target_yield_kg, budget_amount, created_by)
    values (v_cycle, p_org, v_area, v_crop, 'active', v_today - 35, '[MẪU] Dưa lưới vụ thử', 500, 1500, 'Dưa lưới Kim Cô Nương',
            'Cửa hàng giống mẫu', 'LOT-MAU-01', v_today - 45, v_today - 35, 3000, 40000000, v_uid);

  insert into production_stages (cycle_id, name, seq, planned_start, planned_end, actual_start, actual_end, status) values
    (v_cycle, 'Làm đất, lên luống',   1, v_today - 35, v_today - 31, v_today - 35, v_today - 31, 'done'),
    (v_cycle, 'Chăm sóc giai đoạn cây con', 2, v_today - 30, v_today - 17, v_today - 30, v_today - 16, 'done'),
    (v_cycle, 'Ra hoa, thụ phấn',     3, v_today - 16, v_today - 6,  v_today - 16, v_today - 5, 'done'),
    (v_cycle, 'Nuôi trái',            4, v_today - 5,  v_today + 25, v_today - 5,  null, 'in_progress'),
    (v_cycle, 'Thu hoạch',            5, v_today + 26, v_today + 40, null, null, 'pending');

  -- nhật ký kèm vật tư đã dùng; lần phun Radiant gần đây nên vụ đang trong thời gian cách ly (để thử cảnh báo)
  v_log := gen_random_uuid();
  insert into activity_logs (id, cycle_id, work_type_id, performed_at, data, note) values
    (v_log, v_cycle, v_wt_fert, ((v_today - 33)::timestamp + time '07:30') at time zone 'Asia/Ho_Chi_Minh',
     '{"method":"Bón gốc","dose":"5 kg / 1.000 m²"}', '[MẪU] Bón lót trước khi trồng');
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, cycle_id, activity_log_id, source, recorded_by)
    values (gen_random_uuid(), p_org, v_loc, v_npk, 'issue', -15, v_today - 33, v_cycle, v_log, 'online', v_uid);

  insert into activity_logs (id, cycle_id, work_type_id, performed_at, data, note) values
    (gen_random_uuid(), v_cycle, v_wt_irri, ((v_today - 20)::timestamp + time '06:30') at time zone 'Asia/Ho_Chi_Minh',
     '{"duration_min":30,"ec":2.1,"ph":6.2}', '[MẪU] Tưới nhỏ giọt'),
    (gen_random_uuid(), v_cycle, v_wt_pol, ((v_today - 10)::timestamp + time '08:00') at time zone 'Asia/Ho_Chi_Minh',
     '{"flowers":120}', '[MẪU] Thụ phấn đợt 1'),
    (gen_random_uuid(), v_cycle, v_wt_prune, ((v_today - 7)::timestamp + time '08:00') at time zone 'Asia/Ho_Chi_Minh',
     '{"plants":300}', '[MẪU] Bấm ngọn, tỉa nhánh'),
    (gen_random_uuid(), v_cycle, v_wt_irri, ((v_today - 1)::timestamp + time '06:30') at time zone 'Asia/Ho_Chi_Minh',
     '{"duration_min":40,"ec":2.3,"ph":6.0}', '[MẪU] Tưới nhỏ giọt');

  v_log := gen_random_uuid();
  insert into activity_logs (id, cycle_id, work_type_id, performed_at, data, note) values
    (v_log, v_cycle, v_wt_spray, ((v_today - 15)::timestamp + time '16:30') at time zone 'Asia/Ho_Chi_Minh',
     '{"target":["Sương mai"],"dose":"20 g / bình 16 lít","water_l":200,"sprayed_m2":500,"ppe":true}', '[MẪU] Phun phòng sương mai');
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, cycle_id, activity_log_id, source, recorded_by)
    values (gen_random_uuid(), p_org, v_loc, v_ridomil, 'issue', -2, v_today - 15, v_cycle, v_log, 'online', v_uid);

  v_log := gen_random_uuid();
  insert into activity_logs (id, cycle_id, work_type_id, performed_at, data, note) values
    (v_log, v_cycle, v_wt_spray, ((v_today - 3)::timestamp + time '16:30') at time zone 'Asia/Ho_Chi_Minh',
     '{"target":["Bọ trĩ","Nhện đỏ"],"dose":"10 ml / bình 16 lít","water_l":200,"sprayed_m2":500,"ppe":true}', '[MẪU] Phun trừ bọ trĩ');
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, cycle_id, activity_log_id, source, recorded_by)
    values (gen_random_uuid(), p_org, v_loc, v_radiant, 'issue', -1, v_today - 3, v_cycle, v_log, 'online', v_uid);

  -- một sự cố đang mở với việc khắc phục quá hạn (hiện ở Nhắc việc)
  insert into cycle_incidents (id, cycle_id, kind, incident_date, severity, description, loss_quantity, loss_amount)
    values (v_inc, v_cycle, 'pest', v_today - 6, 'medium', '[MẪU] Luống 3 có đốm sương mai trên lá, khoảng 15 cây', 15, 450000);
  insert into incident_actions (id, incident_id, cycle_id, organization_id, content, assignee_id, assignee_name, due_date)
    values (gen_random_uuid(), v_inc, v_cycle, p_org, '[MẪU] Cắt bỏ lá bệnh và phun lại luống 3', v_uid,
            author_display_name(v_uid, p_org, null), v_today - 1);

  insert into demo_seeds (organization_id, kind) values (p_org, p_kind);
  return v_cycle;
end $$;
revoke execute on function seed_demo_data(uuid, text) from public, anon;
grant execute on function seed_demo_data(uuid, text) to authenticated, service_role;
