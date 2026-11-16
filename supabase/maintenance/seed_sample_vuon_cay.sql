-- BỘ DỮ LIỆU MẪU VƯỜN CÂY (na, nho) THEO MÙA VỤ: vườn có chi phí đầu tư, mỗi mùa thu hoạch một vụ riêng liên kết với vườn, đầu tư chia khấu hao vào các vụ mùa (D176).
-- Gắn vào cơ sở có sẵn của tài khoản bên dưới. Chạy lại an toàn: đã có dữ liệu mẫu vườn cây thì bỏ qua.
--
-- NỘI DUNG
--   · 1 phân khu "Vườn cây ăn trái" với 3 ô: Ô na (5.000 m², 400 cây, trồng 5 năm trước), Ô nho (3.000 m², 300 cây, trồng 2 năm trước, CHƯA kinh doanh), Ô na cũ (2.000 m², 200 cây, ghi thẳng, chưa mở vụ mùa)
--   · 3 "vườn" (vụ kiểu vườn cây): chi phí đầu tư (cây giống, làm đất, giàn...) ghi loại "đầu tư vườn cây"; số năm kiến thiết và khấu hao khác nhau (na: kiến thiết 2, khấu hao 10; nho: 3 và 8; na cũ: 3 và 15)
--   · VƯỜN NA có 5 vụ mùa (mỗi mùa 365 ngày, nối tiếp): mùa 1 (cây mới cho trái, sản lượng thấp, vừa bước vào kinh doanh), mùa 2 (tốt), mùa 3 (có sự cố sâu bệnh, đã xử lý), mùa 4 ĐANG THU DỞ
--     (còn tồn chưa bán), mùa 5 đang chuẩn bị. Mùa 2 có một phiếu bán nhiều hơn thu hoạch để thử cảnh báo.
--   · VƯỜN NHO: 1 vụ mùa đầu tiên đang chuẩn bị (vườn chưa kinh doanh nên chưa có khấu hao, chưa có doanh thu, không hiện lỗ giả)
--   · VƯỜN NA CŨ: ghi thẳng vào vườn (chưa mở vụ mùa): tổng kết của vườn tính khấu hao cả đời đến nay
--   · Mỗi vụ mùa: quy trình sao từ mẫu hệ thống (Na một năm / Nho một mùa), nhật ký cho mọi việc đã làm xong, xuất vật tư theo việc (xuất kho KHÔNG kèm giá: dùng giá nhập bình quân như app thật),
--     thu hoạch nhiều đợt và doanh thu theo khách (đã thu / thu một phần / còn nợ), công ghi tay, điện nước và thuê đất chia cho vụ (loại "phân bổ" có ghi cách chia)
--   · Kho 1 nơi, 4 vật tư, 2 nhà cung ứng và công nợ phải trả; 5 nhân sự (1 tổ trưởng + 4) có chấm công 45 ngày gần nhất gắn vào vụ mùa đang thu
--
-- CÁCH DÙNG (Supabase → SQL Editor): sửa v_email (và v_org_name nếu tài khoản làm chủ nhiều cơ sở) rồi bấm Run.
-- Xóa dữ liệu mẫu: đổi v_mode thành 'XOA' và chạy lại (chỉ xóa các dòng mẫu vườn cây, không đụng dữ liệu thật hay các bộ mẫu khác).
-- Ghi chú: gói dịch vụ có thể giới hạn số vụ đang chạy; script bỏ qua giới hạn này khi nạp.

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_email    constant text := 'hotelthanhconggrand@gmail.com';   -- tài khoản chủ cơ sở
  v_org_name constant text := '';                               -- tên cơ sở (để rỗng = cơ sở đầu tiên do tài khoản làm chủ)
  v_mode     constant text := 'THEM';                           -- 'THEM' = nạp dữ liệu mẫu; 'XOA' = xóa dữ liệu mẫu
  -- ===== HẾT CẤU HÌNH =====
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_org uuid; v_crop_na uuid; v_crop_nho uuid; v_sys_na uuid; v_sys_nho uuid; v_sysver int; v_pid uuid;
  v_u_kg uuid; v_u_l uuid; v_u_pack uuid;
  r record; s record; ph record;
  cur int; st int; en int;
  n_cnt int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %. Hãy đăng ký app bằng email này trước.', v_email; end if;
  select o.id into v_org
    from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   where (v_org_name = '' or o.name = v_org_name)
   order by o.created_at limit 1;
  if v_org is null then raise exception 'Tài khoản % chưa là chủ của cơ sở nào%.', v_email, case when v_org_name <> '' then ' tên "' || v_org_name || '"' else '' end; end if;
  perform set_config('statement_timeout', '0', true);
  perform set_config('agri.legacy_cycle_insert', 'on', true);   -- cho phép tạo vụ ngoài giao diện
  perform set_config('agri.withdrawal_exempt', '1', true);      -- dữ liệu mẫu không bị chặn bởi thời gian cách ly vật tư

  -- =============================================================== XÓA
  if v_mode = 'XOA' then
    create temp table vc_del_cyc (id uuid) on commit drop;
    create temp table vc_del_wk (id uuid) on commit drop;
    create temp table vc_del_partner (id uuid) on commit drop;
    insert into vc_del_cyc select id from production_cycles where owner_org_id = v_org and code like 'MAUVUON-%';
    insert into vc_del_wk select id from worker_profiles where organization_id = v_org and phone like '09133%';
    insert into vc_del_partner select id from partners where organization_id = v_org and note = 'Dữ liệu mẫu vườn cây';
    delete from attendance_records where worker_id in (select id from vc_del_wk);
    alter table sale_receipts disable trigger sale_receipts_guard;
    delete from sale_receipts where sale_id in (select id from sales_records where cycle_id in (select id from vc_del_cyc));
    alter table sale_receipts enable trigger sale_receipts_guard;
    delete from sales_records where cycle_id in (select id from vc_del_cyc);
    delete from harvest_records where cycle_id in (select id from vc_del_cyc);
    delete from expense_records where organization_id = v_org and (cycle_id in (select id from vc_del_cyc) or note like '[Mẫu vườn]%');
    alter table bill_payments disable trigger bill_payments_guard;
    delete from bill_payments where bill_id in (select id from purchase_bills where partner_id in (select id from vc_del_partner));
    alter table bill_payments enable trigger bill_payments_guard;
    alter table inventory_transactions disable trigger inventory_txn_guard_mod;
    delete from inventory_transactions where organization_id = v_org and (cycle_id in (select id from vc_del_cyc)
      or location_id in (select id from inventory_locations where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây')
      or material_id in (select id from materials where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây'));
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from purchase_bills where partner_id in (select id from vc_del_partner);
    delete from incident_actions where cycle_id in (select id from vc_del_cyc);
    delete from cycle_incidents where cycle_id in (select id from vc_del_cyc);
    delete from cycle_count_events where cycle_id in (select id from vc_del_cyc);
    delete from activity_logs where cycle_id in (select id from vc_del_cyc);
    delete from production_stages where cycle_id in (select id from vc_del_cyc);
    delete from production_cycles where orchard_cycle_id in (select id from vc_del_cyc);
    delete from production_cycles where id in (select id from vc_del_cyc);
    delete from work_rates where worker_id in (select id from vc_del_wk);
    delete from worker_team_memberships where team_id in (select id from worker_teams where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây');
    delete from worker_teams where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây';
    delete from worker_profiles where id in (select id from vc_del_wk);
    delete from material_lots where organization_id = v_org and lot_no ~ '^V[12]-[1-4]$';
    delete from inventory_locations where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây';
    delete from materials where organization_id = v_org and description = 'Dữ liệu mẫu vườn cây';
    delete from template_stages where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu vườn cây%');
    delete from template_phases where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu vườn cây%');
    delete from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu vườn cây%';
    delete from partners where id in (select id from vc_del_partner);
    delete from production_areas where organization_id = v_org and code like 'MAUVUON-%' and parent_id is not null;
    delete from production_areas where organization_id = v_org and code like 'MAUVUON-%';
    raise notice 'Đã xóa dữ liệu mẫu vườn cây của cơ sở %.', v_org;
    return;
  end if;
  if v_mode <> 'THEM' then raise exception 'v_mode phải là THEM hoặc XOA'; end if;

  if exists (select 1 from production_areas where organization_id = v_org and code like 'MAUVUON-%') then
    raise notice 'Cơ sở này đã có dữ liệu mẫu vườn cây, bỏ qua (muốn nạp lại hãy chạy XOA trước).'; return;
  end if;

  select id into v_crop_na from crop_types where organization_id is null and code = 'custard_apple';
  select id into v_crop_nho from crop_types where organization_id is null and code = 'grape';
  select id, version into v_sys_na, v_sysver from system_templates where code = 'custard_apple_year';
  select id into v_sys_nho from system_templates where code = 'grape_season';
  if v_crop_na is null or v_crop_nho is null or v_sys_na is null or v_sys_nho is null then raise exception 'Thiếu sản phẩm hoặc mẫu hệ thống Na/Nho (cần đã db push đủ migration, kể cả 0183).'; end if;
  select id into v_u_kg from units_of_measure where organization_id is null and code = 'kg';
  select id into v_u_l from units_of_measure where organization_id is null and code = 'l';
  select id into v_u_pack from units_of_measure where organization_id is null and code = 'pack';

  alter table production_cycles disable trigger production_cycles_quota;
  alter table worker_teams disable trigger worker_teams_leader_guard;

  -- =============================================================== ĐỐI TÁC
  create temp table vc_partner (idx int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into vc_partner (idx, kind, name) values
    (1, 'sup', 'Cửa hàng Vật tư Nông nghiệp Ba Hậu'), (2, 'sup', 'Đại lý Thuốc BVTV Năm Sáu'),
    (1, 'cus', 'Siêu thị Co.opmart Biên Hòa'), (2, 'cus', 'Chợ đầu mối Thủ Đức'), (3, 'cus', 'Thương lái Tư Hạ'), (4, 'cus', 'Cửa hàng Trái cây Minh Châu');
  insert into partners (id, organization_id, name, phone, address, goods, note, is_supplier, is_customer, customer_kind)
    select id, v_org, name, '028' || (32340000 + idx * 111 + (case kind when 'sup' then 0 else 5000 end))::text,
           case kind when 'sup' then 'Cửa hàng / đại lý nhà cung cấp ' || idx else 'Điểm nhận hàng ' || idx end,
           case when kind = 'sup' then (array['Phân bón, dây buộc giàn', 'Thuốc BVTV sinh học'])[idx] else 'Na, nho tươi' end,
           'Dữ liệu mẫu vườn cây', kind = 'sup', kind = 'cus',
           case when kind = 'cus' then (array['Siêu thị', 'Chợ đầu mối', 'Đại lý', 'Cửa hàng'])[idx] end
      from vc_partner;

  -- =============================================================== VẬT TƯ
  create temp table vc_mat (idx int, id uuid default gen_random_uuid(), name text, unit uuid, grp text, price bigint, wd int, sup int) on commit drop;
  insert into vc_mat (idx, name, unit, grp, price, wd, sup) values
    (1, 'Phân NPK cân đối', v_u_kg, 'fertilizer', 18000, null, 1),
    (2, 'Phân hữu cơ hoai mục', v_u_kg, 'fertilizer', 4500, null, 1),
    (3, 'Thuốc / chế phẩm phòng bệnh sinh học', v_u_l, 'pesticide', 280000, 7, 2),
    (4, 'Dây buộc giàn', v_u_pack, 'other', 45000, null, 1);
  update vc_mat m set id = e.id from materials e where e.organization_id = v_org and e.name = m.name;
  insert into materials (id, organization_id, name, base_unit_id, material_group, reorder_threshold, withdrawal_days, description)
    select m.id, v_org, m.name, m.unit, m.grp, 20, m.wd, 'Dữ liệu mẫu vườn cây' from vc_mat m
     where not exists (select 1 from materials e where e.id = m.id);

  -- =============================================================== PHÂN KHU, Ô, KHO
  create temp table vc_area (id uuid default gen_random_uuid()) on commit drop;
  insert into vc_area default values;
  insert into production_areas (id, organization_id, name, code, kind, area_size, area_unit, location, description)
    select id, v_org, 'Vườn cây ăn trái', 'MAUVUON-PK1', 'crop', 10000, 'm2', 'Khu vườn cây lâu năm', 'Dữ liệu mẫu vườn cây' from vc_area;
  create temp table vc_cell (k int, id uuid default gen_random_uuid(), name text, m2 int) on commit drop;
  insert into vc_cell (k, name, m2) values (1, 'Ô na (cây 5 năm)', 5000), (2, 'Ô nho (cây 2 năm)', 3000), (3, 'Ô na cũ (ghi thẳng)', 2000);
  insert into production_areas (id, organization_id, parent_id, name, code, kind, area_size, area_unit, description)
    select ce.id, v_org, (select id from vc_area), ce.name, 'MAUVUON-C' || ce.k, 'crop', ce.m2, 'm2', 'Dữ liệu mẫu vườn cây' from vc_cell ce;
  create temp table vc_loc (id uuid default gen_random_uuid()) on commit drop;
  insert into vc_loc default values;
  insert into inventory_locations (id, organization_id, name, description, area_ids)
    select id, v_org, 'Kho vật tư vườn cây', 'Dữ liệu mẫu vườn cây', array[(select id from vc_area)] from vc_loc;

  -- =============================================================== NHÂN SỰ (1 tổ trưởng + 4 nhân viên)
  create temp table vc_worker (idx int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into vc_worker (idx, name) values (1, 'Nguyễn Văn Sáu'), (2, 'Trần Thị Hương'), (3, 'Lê Văn Tâm'), (4, 'Phạm Thị Lan'), (5, 'Võ Văn Phúc');
  insert into worker_profiles (id, organization_id, full_name, phone, status, work_mode)
    select id, v_org, name, '09133' || lpad(idx::text, 5, '0'), 'active', case when idx = 1 then 'self_hourly' else 'leader_hourly' end from vc_worker;
  create temp table vc_team (id uuid default gen_random_uuid()) on commit drop;
  insert into vc_team default values;
  insert into worker_teams (id, organization_id, name, leader_worker_id, area_id, description)
    select t.id, v_org, 'Tổ vườn cây', w.id, (select id from vc_area), 'Dữ liệu mẫu vườn cây' from vc_team t join vc_worker w on w.idx = 1;
  insert into worker_team_memberships (team_id, worker_id, valid_from) select (select id from vc_team), w.id, v_today - 2000 from vc_worker w;
  insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from)
    select v_org, 'hour', w.id, case when w.idx = 1 then 38000 else 32000 end, v_today - 2000 from vc_worker w;

  -- =============================================================== QUY TRÌNH (sao từ mẫu hệ thống Na và Nho)
  create temp table vc_tpl (kind text, id uuid default gen_random_uuid(), sys uuid, crop uuid, name text) on commit drop;
  insert into vc_tpl (kind, sys, crop, name) values
    ('na', v_sys_na, v_crop_na, 'Na: một năm – mẫu hệ thống (vườn cây ăn trái)'), ('nho', v_sys_nho, v_crop_nho, 'Nho: một mùa vụ – mẫu hệ thống (vườn cây ăn trái)');
  insert into cycle_templates (id, organization_id, crop_type_id, name, note, is_active, source_system_id, source_version)
    select id, v_org, crop, name, 'Dữ liệu mẫu vườn cây. Sao từ mẫu hệ thống ' || (case kind when 'na' then 'Na (365 ngày)' else 'Nho (135 ngày)' end) || '.', true, sys, (select version from system_templates where id = vc_tpl.sys) from vc_tpl;
  for r in select * from vc_tpl loop
    for ph in select * from system_template_phases where system_template_id = r.sys order by seq loop
      insert into template_phases (template_id, organization_id, seq, code, name, description)
        values (r.id, v_org, ph.seq, ph.code, ph.name, ph.description) returning id into v_pid;
      insert into template_stages (template_id, organization_id, seq, name, duration_days, note, work_type_id, phase_id, importance, start_day, repeat_every_days, guide, materials)
        select r.id, v_org, x.seq, wt.name, x.duration_days, x.note, x.work_type_id, v_pid, x.importance, x.start_day, x.repeat_every_days, x.guide, coalesce(x.materials, '[]'::jsonb)
          from system_template_stages x join work_types wt on wt.id = x.work_type_id
         where x.system_template_id = r.sys and x.phase_id = ph.id;
    end loop;
  end loop;

  -- =============================================================== VƯỜN (vụ kiểu vườn cây) VÀ CHI PHÍ ĐẦU TƯ
  create temp table vc_orch (k int, id uuid default gen_random_uuid(), cell uuid, crop uuid, kind text, name text, code text, planting date, maturity numeric, amort int, trees int, m2 int, variety text) on commit drop;
  insert into vc_orch (k, cell, crop, kind, name, code, planting, maturity, amort, trees, m2, variety)
    select 1, (select id from vc_cell where k = 1), v_crop_na, 'na', 'Vườn na', 'MAUVUON-NA-VUON', v_today - 1825, 2, 10, 400, 5000, 'Na Thái'
    union all select 2, (select id from vc_cell where k = 2), v_crop_nho, 'nho', 'Vườn nho', 'MAUVUON-NHO-VUON', v_today - 730, 3, 8, 300, 3000, 'Nho đỏ không hạt'
    union all select 3, (select id from vc_cell where k = 3), v_crop_na, 'na', 'Vườn na cũ (ghi thẳng)', 'MAUVUON-NACU-VUON', v_today - 1500, 3, 15, 200, 2000, 'Na Thái';
  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, name, code, plant_count, count_unit, planted_area_m2, variety_name,
                                 planting_date, cycle_mode, maturity_years, amort_years, intercrop, note)
    select id, v_org, cell, crop, 'active', planting, name, code, trees, 'cây', m2, variety, planting, 'perennial', maturity, amort, true, 'Dữ liệu mẫu vườn cây' from vc_orch;
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note, is_capital)
    select gen_random_uuid(), v_org, o.id, 'other', 'cash_paid', c.amt, v_today - c.off, c.note, true
      from vc_orch o join (values (1, 1825, 600000000::bigint, 'Cây giống, làm đất, dựng giàn'), (1, 1000, 100000000::bigint, 'Nâng cấp hệ thống tưới và giàn'),
                                  (2, 730, 400000000::bigint, 'Cây giống, làm đất, dựng giàn nho'), (3, 1500, 200000000::bigint, 'Cây giống, làm đất')) c (k, off, amt, note) on c.k = o.k;
  -- cây chết và trồng dặm của vườn na
  insert into cycle_count_events (id, cycle_id, organization_id, event_date, kind, quantity, note, created_by)
    select gen_random_uuid(), o.id, v_org, v_today - 1300, 'dead', 6, 'Cây chết do úng gốc', v_user from vc_orch o where o.k = 1
    union all select gen_random_uuid(), o.id, v_org, v_today - 1280, 'in', 6, 'Trồng dặm thay cây chết', v_user from vc_orch o where o.k = 1;

  -- =============================================================== VỤ MÙA (mỗi mùa một vụ, liên kết với vườn)
  create temp table vc_cyc (id uuid default gen_random_uuid(), orch int, kind text, no int, tpl uuid, start_d date, end_d date, status cycle_status, sc text, yk numeric, price bigint,
                            trees int, cname text, code text, cell uuid, crop uuid, orch_id uuid, span int) on commit drop;
  insert into vc_cyc (orch, kind, no, tpl, start_d, status, sc, yk, price, trees, cname, code, cell, crop, orch_id, span)
    select v.orch, v.kind, v.no, t.id, v_today + v.off, v.status::cycle_status, v.sc, v.yk, v.price, o.trees,
           'Mùa ' || t.kind || ' ' || extract(year from (v_today + v.off + 150))::text, 'MAUVUON-' || upper(t.kind) || '-M' || v.no, o.cell, o.crop, o.id,
           case t.kind when 'na' then 365 else 135 end
      from (values (1, 'E1', 1, -1415, 'ended', 'low', 2.5, 62000), (1, 'E2', 2, -1050, 'ended', 'good', 14, 58000), (1, 'E3', 3, -685, 'ended', 'pest', 9.5, 50000),
                   (1, 'A1', 4, -320, 'active', 'normal', 14, 57000), (1, 'P1', 5, 46, 'preparing', 'plan', 0, 0), (2, 'N1', 1, 30, 'preparing', 'plan', 0, 0)) v (orch, kind, no, off, status, sc, yk, price)
      join vc_orch o on o.k = v.orch join vc_tpl t on t.kind = case v.orch when 1 then 'na' else 'nho' end;
  update vc_cyc set end_d = start_d + span - 1;
  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date, end_date, name, code, template_id, template_name, template_version,
                                 plant_count, count_unit, planted_area_m2, variety_name, target_yield_kg, budget_amount, cycle_mode, mgmt_model, intercrop, orchard_cycle_id, note)
    select y.id, v_org, y.cell, y.crop, y.status, y.start_d, y.end_d, case when y.status = 'ended' then y.end_d end, y.cname, y.code, y.tpl, t.name, 1,
           y.trees, 'cây', (select o.m2 from vc_orch o where o.id = y.orch_id), (select o.variety from vc_orch o where o.id = y.orch_id),
           case when y.yk > 0 then y.trees * y.yk end, 150000000, 'batch', 'family', true, y.orch_id, 'Dữ liệu mẫu vườn cây'
      from vc_cyc y join cycle_templates t on t.id = y.tpl;
  for r in select id, start_d, tpl from vc_cyc loop
    cur := 1;
    for s in select t.*, p.code as p_code, p.name as p_name from template_stages t left join template_phases p on p.id = t.phase_id where t.template_id = r.tpl order by t.seq loop
      st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
      insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end, work_type_id, template_stage_id, duration_days, note,
                                     phase_code, phase_name, importance, repeat_every_days, guide, materials)
        values (r.id, v_org, s.name, s.seq, r.start_d + st - 1, r.start_d + en - 1, s.work_type_id, s.id, s.duration_days, s.note,
                s.p_code, s.p_name, s.importance, s.repeat_every_days, s.guide, s.materials);
      if s.start_day is null then cur := en + 1; end if;
    end loop;
  end loop;
  update production_stages ps set
      status = case when y.status = 'ended' or ps.planned_end < v_today then 'done' when ps.planned_start <= v_today then 'in_progress' else 'pending' end,
      actual_start = case when y.status = 'ended' or ps.planned_start <= v_today then ps.planned_start end,
      actual_end = case when y.status = 'ended' or ps.planned_end < v_today then ps.planned_end end
    from vc_cyc y where y.id = ps.cycle_id and y.status in ('ended', 'active');

  -- =============================================================== NHẬT KÝ VIỆC
  create temp table vc_log (id uuid default gen_random_uuid(), cycle_id uuid, stage_id uuid, wt_id uuid, wcode text, sname text, d date, trees int, kind text) on commit drop;
  insert into vc_log (cycle_id, stage_id, wt_id, wcode, sname, d, trees, kind)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, g::date, y.trees, case when wt.code = 'harvesting' then 'harvest' else 'work' end
      from production_stages ps join vc_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, (ps.repeat_every_days || ' days')::interval) g
     where ps.status in ('done', 'in_progress') and ps.repeat_every_days is not null and ps.planned_start <= v_today - 1;
  insert into vc_log (cycle_id, stage_id, wt_id, wcode, sname, d, trees, kind)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, ps.planned_end, y.trees, 'work'
      from production_stages ps join vc_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
     where ps.status = 'done' and ps.repeat_every_days is null;
  insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at, source, data, note, author_name)
    select l.id, v_org, l.cycle_id, l.wt_id, l.stage_id, (l.d + time '07:30') at time zone v_tz, 'online', '{}'::jsonb,
           case when l.kind = 'harvest' then 'Thu hoạch đợt ' || to_char(l.d, 'DD/MM') else 'Đã hoàn thành: ' || l.sname end, (select name from vc_worker where idx = 1)
      from vc_log l;

  -- =============================================================== KHO: xuất cho việc (không kèm giá: dùng giá nhập bình quân như app thật), nhập 2 đợt có hóa đơn
  create temp table vc_issue (id uuid default gen_random_uuid(), log_id uuid, cycle_id uuid, mat int, qty numeric, d date) on commit drop;
  insert into vc_issue (log_id, cycle_id, mat, qty, d)
    select l.id, l.cycle_id,
           case l.wcode when 'fertilizing' then 1 + extract(doy from l.d)::int % 2 when 'spraying' then 3 when 'trellising' then 4 end,
           case l.wcode when 'fertilizing' then case when extract(doy from l.d)::int % 2 = 0 then l.trees * 0.25 else l.trees * 1.0 end
                        when 'spraying' then 3 when 'trellising' then 12 end,
           l.d
      from vc_log l where l.wcode in ('fertilizing', 'spraying', 'trellising');
  create temp table vc_rcpt (id uuid default gen_random_uuid(), rnd int, mat int, sup int, qty numeric, cost bigint, d date, bill_id uuid) on commit drop;
  insert into vc_rcpt (rnd, mat, sup, qty, cost, d)
    select 1, i.mat, m.sup, ceil(sum(i.qty) * 1.01 + 5), (m.price * 1.00)::bigint, v_today - 1500
      from vc_issue i join vc_mat m on m.idx = i.mat where i.d < v_today - 150 group by i.mat, m.sup, m.price;
  insert into vc_rcpt (rnd, mat, sup, qty, cost, d)
    select 2, i.mat, m.sup, ceil(sum(i.qty) * 1.10 + 5), (m.price * 1.05)::bigint, v_today - 150
      from vc_issue i join vc_mat m on m.idx = i.mat where i.d >= v_today - 150 group by i.mat, m.sup, m.price;
  create temp table vc_bill (id uuid default gen_random_uuid(), rnd int, sup int, d date, total bigint) on commit drop;
  insert into vc_bill (rnd, sup, d, total) select rnd, sup, min(d), sum((qty * cost)::bigint) from vc_rcpt group by rnd, sup;
  update vc_rcpt rc set bill_id = b.id from vc_bill b where b.rnd = rc.rnd and b.sup = rc.sup;
  insert into purchase_bills (id, organization_id, partner_id, invoice_no, bill_date, due_date, total_amount, note)
    select b.id, v_org, p.id, 'HDV-' || b.sup || '-' || b.rnd, b.d, b.d + 30, b.total, 'Dữ liệu mẫu vườn cây'
      from vc_bill b join vc_partner p on p.kind = 'sup' and p.idx = b.sup;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, bill_id, lot_no, lot_expiry)
    select rc.id, v_org, (select id from vc_loc), m.id, 'receipt', rc.qty, rc.cost, rc.d, rc.bill_id, 'V' || rc.rnd || '-' || rc.mat,
           case when rc.mat = 3 then v_today + case when rc.rnd = 1 then 100 else 330 end end
      from vc_rcpt rc join vc_mat m on m.idx = rc.mat;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, cycle_id, activity_log_id)
    select i.id, v_org, (select id from vc_loc), m.id, 'issue', -i.qty, null, i.d, i.cycle_id, i.log_id
      from vc_issue i join vc_mat m on m.idx = i.mat;
  insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
    select gen_random_uuid(), v_org, b.id, b.d + case when b.rnd = 1 then 10 else 20 end, round(b.total * case when b.rnd = 1 then 1 else (array[1, 0.5])[1 + b.sup % 2] end)::bigint, 'transfer', 'Dữ liệu mẫu vườn cây'
      from vc_bill b;

  -- =============================================================== THU HOẠCH, DOANH THU, CÔNG NỢ PHẢI THU
  create temp table vc_h (id uuid default gen_random_uuid(), cycle_id uuid, no int, n int, d date, qty numeric, price bigint, cust int, sold boolean, oversell boolean, amount bigint, last_n int) on commit drop;
  insert into vc_h (cycle_id, no, n, d, qty, price)
    select l.cycle_id, y.no, (row_number() over (partition by l.cycle_id order by l.d))::int, l.d,
           round((y.trees * y.yk / 15.0 * (0.85 + 0.3 * ((row_number() over (partition by l.cycle_id order by l.d))::int * 7 % 10) / 10.0))::numeric, 1),
           y.price + ((row_number() over (partition by l.cycle_id order by l.d))::int % 3) * 500
      from vc_log l join vc_cyc y on y.id = l.cycle_id where l.kind = 'harvest' and y.yk > 0;
  update vc_h h set last_n = (select max(n) from vc_h x where x.cycle_id = h.cycle_id);
  -- vụ đang thu dở: 2 đợt cuối chưa bán (còn tồn); mùa 2: phiếu bán đợt cuối ghi bằng sản lượng gộp (bán nhiều hơn thu hoạch sau hao hụt)
  update vc_h h set cust = 1 + (h.no + h.n) % 4, sold = not (y.status = 'active' and h.n > h.last_n - 2), oversell = (y.kind = 'E2' and h.n = h.last_n)
    from vc_cyc y where y.id = h.cycle_id;
  update vc_h set amount = round((case when oversell then qty else qty * 0.98 end) * price)::bigint;
  insert into harvest_records (id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note)
    select id, v_org, cycle_id, (d + time '06:30') at time zone v_tz, case when n % 3 = 0 then 'B' else 'A' end, qty, 'kg', round(qty * 0.02, 1), 'Dữ liệu mẫu vườn cây' from vc_h;
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, buyer_note, partner_id, invoice_no, due_date)
    select h.id, v_org, h.cycle_id, h.d, case when h.oversell then h.qty else round(h.qty * 0.98, 1) end, 'kg', h.amount, p.name, p.id,
           'BV-' || h.no || '-' || h.n, h.d + case when h.cust % 2 = 0 then 15 else 30 end
      from vc_h h join vc_partner p on p.kind = 'cus' and p.idx = h.cust where h.sold;
  -- thu tiền: khách số 3 (thương lái Tư Hạ) luôn nợ; bán lâu thì đã thu đủ; vừa bán thì thu một phần hoặc chưa thu
  insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
    select gen_random_uuid(), v_org, h.id, h.d + 10, round(h.amount * case when v_today - h.d > 40 then 1 else 0.5 end)::bigint, 'transfer', 'Dữ liệu mẫu vườn cây'
      from vc_h h where h.sold and h.cust <> 3 and v_today - h.d > 12;

  -- =============================================================== CHI PHÍ CỦA VỤ MÙA (công ghi tay, điện nước, thuê đất chia cho vụ, chi khác)
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note)
    select gen_random_uuid(), v_org, y.id, 'labor'::expense_category, 'cash_paid'::expense_kind,
           (y.trees * 150000 * (case when y.status = 'ended' then 1 else least(1, greatest(0, (v_today - 46 - y.start_d)::numeric / 365)) end))::bigint,
           case when y.status = 'ended' then y.end_d - 20 else v_today - 46 end,
           case when y.status = 'ended' then 'Công tỉa cành, bón phân, thu hoạch cả mùa' else 'Công ghi tay giai đoạn trước 45 ngày gần nhất (45 ngày gần nhất tính theo chấm công)' end
      from vc_cyc y where y.orch = 1 and (y.status = 'ended' or (y.status = 'active' and y.start_d < v_today - 46))
    union all
    select gen_random_uuid(), v_org, y.id, 'utility', 'allocated', (8000000 * least(1, greatest(0, (least(y.end_d, v_today) - y.start_d + 1)::numeric / 365)))::bigint,
           least(y.end_d, v_today - 1), 'Phân bổ điện bơm, nước tưới theo diện tích × ngày (8 triệu/năm)'
      from vc_cyc y where y.orch = 1 and y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), v_org, y.id, 'rent', 'allocated', (12000000 * least(1, greatest(0, (least(y.end_d, v_today) - y.start_d + 1)::numeric / 365)))::bigint,
           least(y.end_d, v_today - 1), 'Phân bổ thuê đất 12 triệu/năm theo diện tích × ngày'
      from vc_cyc y where y.orch = 1 and y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), v_org, y.id, 'other', 'cash_paid', 3000000, least(y.start_d + 250, v_today - 1), 'Vận chuyển, bao bì, phí chợ'
      from vc_cyc y where y.orch = 1 and y.status in ('ended', 'active') and y.start_d + 250 <= v_today;

  -- =============================================================== VƯỜN NA CŨ GHI THẲNG (chưa mở vụ mùa): thu, chi, sản lượng ghi trực tiếp vào vườn
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note)
    select gen_random_uuid(), v_org, o.id, 'labor'::expense_category, 'cash_paid'::expense_kind, 30000000, v_today - 120, 'Công chăm sóc năm nay' from vc_orch o where o.k = 3
    union all select gen_random_uuid(), v_org, o.id, 'material', 'material_used', 12000000, v_today - 200, 'Phân, thuốc đã dùng (ghi tay, không qua kho)' from vc_orch o where o.k = 3;
  insert into harvest_records (id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note)
    select gen_random_uuid(), v_org, o.id, ((v_today - 60 - 3 * g) + time '06:30') at time zone v_tz, 'A', 260 + g * 8, 'kg', 5, 'Dữ liệu mẫu vườn cây' from vc_orch o cross join generate_series(0, 9) g where o.k = 3;
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, buyer_note, invoice_no)
    select gen_random_uuid(), v_org, o.id, v_today - 58 - 3 * g, 255 + g * 8, 'kg', round((255 + g * 8) * 55000), 'Bán lẻ tại vườn', 'BV-CU-' || g from vc_orch o cross join generate_series(0, 9) g where o.k = 3;

  -- =============================================================== SỰ CỐ (mùa 3: sâu bệnh, đã xử lý)
  create temp table vc_inc (id uuid default gen_random_uuid(), cycle_id uuid, d date) on commit drop;
  insert into vc_inc (cycle_id, d) select y.id, y.start_d + 205 from vc_cyc y where y.kind = 'E3';
  insert into cycle_incidents (id, cycle_id, organization_id, kind, incident_date, severity, description, loss_quantity, loss_amount, status, closed_at, closed_by, close_note, created_by)
    select i.id, i.cycle_id, v_org, 'pest', i.d, 'medium', 'Sâu đục trái và rệp sáp trên na giai đoạn nuôi trái; khoảng 15% trái bị hại.', 800, 800 * 50000, 'closed',
           (i.d + 14 + time '16:00') at time zone v_tz, v_user, 'Đã phun chế phẩm sinh học 2 đợt, bao trái; hết lây lan.', v_user from vc_inc i;
  insert into incident_actions (id, incident_id, cycle_id, organization_id, content, assignee_name, due_date, done, done_at, done_by, created_by)
    select gen_random_uuid(), i.id, i.cycle_id, v_org, a.content, (select name from vc_worker where idx = 1), i.d + a.due, true, (i.d + a.due + time '10:00') at time zone v_tz, v_user, v_user
      from vc_inc i cross join (values ('Phun chế phẩm sinh học diệt sâu, rệp', 2), ('Bao trái bằng túi giấy cho các chùm còn lại', 7)) a (content, due);

  -- =============================================================== CHẤM CÔNG (45 ngày gần nhất, gắn vụ mùa na đang thu)
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, d::date, ((d::date + time '06:30') at time zone v_tz) + ((w.idx * 7 + extract(doy from d)::int) % 20) * interval '1 minute',
           ((d::date + time '15:30') at time zone v_tz), (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, 'confirmed'::attendance_status, 60, 480,
           (select id from vc_area), (select id from vc_cyc where kind = 'A1'), now()
      from vc_worker w cross join generate_series(v_today - 45, v_today - 2, interval '1 day') d
     where extract(dow from d) <> 0 and (w.idx * 13 + extract(doy from d)::int * 7) % 100 >= 10;
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, v_today - 1, ((v_today - 1 + time '06:30') at time zone v_tz), ((v_today - 1 + time '15:30') at time zone v_tz),
           (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, (case when w.idx % 3 = 0 then 'needs_confirmation' else 'confirmed' end)::attendance_status, 60,
           case when w.idx % 3 = 0 then null else 480 end, (select id from vc_area), (select id from vc_cyc where kind = 'A1'), case when w.idx % 3 = 0 then null else now() end
      from vc_worker w where extract(dow from v_today - 1) <> 0;

  alter table production_cycles enable trigger production_cycles_quota;
  alter table worker_teams enable trigger worker_teams_leader_guard;

  select count(*) into n_cnt from production_cycles where owner_org_id = v_org and code like 'MAUVUON-%';
  raise notice 'Đã nạp dữ liệu mẫu vườn cây cho cơ sở %: 1 phân khu, 3 ô, 3 vườn, % vụ (gồm vườn và vụ mùa), % nhật ký, % đợt thu hoạch, 5 nhân sự.', v_org, n_cnt, (select count(*) from vc_log), (select count(*) from vc_h);
end $$;
