-- BỘ DỮ LIỆU MẪU ĐẦY ĐỦ CHO MỘT HỢP TÁC XÃ (từ cơ sở vật chất đến công nợ).
-- Gắn vào cơ sở của tài khoản bên dưới (ưu tiên cơ sở loại HTX do tài khoản đó làm chủ). Chạy lại an toàn: đã có dữ liệu mẫu thì bỏ qua.
--
-- NỘI DUNG:
--   · 5 phân khu, mỗi phân khu 4 nhà màng (khu cấp dưới) và 2 kho (kho vật tư chung, kho phân – thuốc)
--   · 5 tổ theo 5 phân khu (mỗi người thuộc đúng 1 tổ = 1 phân khu), mỗi tổ 1 tổ trưởng (35.000đ/giờ) + 9 nhân viên (30.000đ/giờ), 50 người, có công chấm 45 ngày gần nhất (kèm vài ca chờ xác nhận, ca đang mở hôm nay)
--   · Mỗi phân khu 2 quy trình dưa lưới: 1 sao từ mẫu hệ thống (17 việc, 7 công đoạn), 1 quy trình riêng (10 việc, ít hơn nhưng tổng 79 ngày như mẫu)
--   · Mỗi phân khu 12 vụ (mỗi nhà màng 3 vụ nối tiếp): 4 đã kết thúc (quá khứ), 4 đang sản xuất, 4 đang chuẩn bị (tương lai)
--   · Nhật ký việc cho mọi việc ĐÃ THỰC HIỆN XONG (việc lặp ghi theo từng lần), kèm xuất vật tư khi bón phân/phun thuốc/chuẩn bị đất/gieo/làm giàn
--   · 8 vật tư; kho: nhập (2 đợt, có hóa đơn, số lô) – xuất theo vụ – tồn; 5 nhà cung ứng và công nợ phải trả (đã trả đủ, trả một phần, chưa trả, quá hạn)
--   · 6 khách hàng và công nợ phải thu (đã thu đủ, thu một phần, chưa thu, quá hạn)
--   · Chi phí, thu hoạch, doanh thu theo từng vụ + chi phí chung của HTX
--
-- CÁCH DÙNG (Supabase → SQL Editor, trên dự án THỬ hoặc dự án bạn chấp nhận có dữ liệu mẫu):
--   1. Sửa v_email (và v_org_name nếu tài khoản có nhiều cơ sở cùng loại; để rỗng nghĩa là tự chọn) rồi bấm Run.
--   2. Muốn xóa sạch dữ liệu mẫu: đổi v_mode thành 'XOA' và chạy lại (chỉ xóa các dòng mẫu, không đụng dữ liệu thật của cơ sở).
-- Ghi chú: gói dịch vụ có thể đang giới hạn số vụ đang sản xuất; script bỏ qua giới hạn này khi nạp. Muốn tạo thêm vụ mới sau đó, hãy nâng gói hoặc xóa dữ liệu mẫu.

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_email    constant text := 'trungthanhfx23@gmail.com';   -- tài khoản chủ cơ sở
  v_org_name constant text := '';                           -- tên cơ sở (để rỗng = tự chọn cơ sở HTX của tài khoản)
  v_mode     constant text := 'THEM';                       -- 'THEM' = nạp dữ liệu mẫu; 'XOA' = xóa dữ liệu mẫu
  -- ===== HẾT CẤU HÌNH =====
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_org uuid; v_crop uuid;
  v_u_kg uuid; v_u_l uuid; v_u_pack uuid; v_u_piece uuid;
  v_sys uuid; v_sysver int;
  v_pid uuid;
  r record; s record; ph record;
  cur int; st int; en int;
  n_cnt int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %. Hãy đăng ký app bằng email này trước.', v_email; end if;
  select o.id into v_org
    from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   where (v_org_name = '' or o.name = v_org_name)
   order by (o.type = 'cooperative') desc, o.created_at limit 1;
  if v_org is null then raise exception 'Tài khoản % chưa là chủ của cơ sở nào%.', v_email, case when v_org_name <> '' then ' tên "' || v_org_name || '"' else '' end; end if;
  perform set_config('statement_timeout', '0', true);
  perform set_config('agri.legacy_cycle_insert', 'on', true);   -- cho phép tạo vụ ngoài giao diện
  perform set_config('agri.withdrawal_exempt', '1', true);      -- dữ liệu mẫu không bị chặn bởi thời gian cách ly vật tư

  -- =============================================================== XÓA
  if v_mode = 'XOA' then
    create temp table smp_del_cyc (id uuid) on commit drop;
    create temp table smp_del_wk (id uuid) on commit drop;
    create temp table smp_del_partner (id uuid) on commit drop;
    insert into smp_del_cyc select id from production_cycles where owner_org_id = v_org and code like 'MAU-%';
    insert into smp_del_wk select id from worker_profiles where organization_id = v_org and phone like '09119000%';
    insert into smp_del_partner select id from partners where organization_id = v_org and note like 'Dữ liệu mẫu%';
    delete from attendance_records where worker_id in (select id from smp_del_wk);
    alter table sale_receipts disable trigger sale_receipts_guard;   -- thu tiền thường không xóa được; riêng dữ liệu mẫu thì dọn
    delete from sale_receipts where sale_id in (select id from sales_records where cycle_id in (select id from smp_del_cyc));
    alter table sale_receipts enable trigger sale_receipts_guard;
    delete from sales_records where cycle_id in (select id from smp_del_cyc);
    delete from harvest_records where cycle_id in (select id from smp_del_cyc);
    delete from expense_records where organization_id = v_org and (cycle_id in (select id from smp_del_cyc) or note like '[Mẫu]%');
    alter table bill_payments disable trigger bill_payments_guard;
    delete from bill_payments where bill_id in (select id from purchase_bills where partner_id in (select id from smp_del_partner));
    alter table bill_payments enable trigger bill_payments_guard;
    alter table inventory_transactions disable trigger inventory_txn_guard_mod;   -- giao dịch kho thường không xóa được; riêng dữ liệu mẫu thì dọn
    delete from inventory_transactions where organization_id = v_org and (cycle_id in (select id from smp_del_cyc)
      or location_id in (select id from inventory_locations where organization_id = v_org and description like 'Dữ liệu mẫu%')
      or material_id in (select id from materials where organization_id = v_org and description like 'Dữ liệu mẫu%'));
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from purchase_bills where partner_id in (select id from smp_del_partner);
    delete from activity_logs where cycle_id in (select id from smp_del_cyc);
    delete from production_stages where cycle_id in (select id from smp_del_cyc);
    delete from production_cycles where id in (select id from smp_del_cyc);
    delete from work_rates where worker_id in (select id from smp_del_wk);
    delete from worker_team_memberships where team_id in (select id from worker_teams where organization_id = v_org and description like 'Dữ liệu mẫu%');
    delete from worker_teams where organization_id = v_org and description like 'Dữ liệu mẫu%';
    delete from worker_profiles where id in (select id from smp_del_wk);
    delete from material_lots where organization_id = v_org and lot_no ~ '^L[12]-[1-8]-[A-E]$';
    delete from inventory_locations where organization_id = v_org and description like 'Dữ liệu mẫu%';
    delete from materials where organization_id = v_org and description like 'Dữ liệu mẫu%';
    delete from template_stages where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu%');
    delete from template_phases where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu%');
    delete from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu%';
    delete from partners where id in (select id from smp_del_partner);
    delete from production_areas where organization_id = v_org and code like 'MAU-%' and parent_id is not null;
    delete from production_areas where organization_id = v_org and code like 'MAU-%';
    raise notice 'Đã xóa dữ liệu mẫu của cơ sở %.', v_org;
    return;
  end if;
  if v_mode <> 'THEM' then raise exception 'v_mode phải là THEM hoặc XOA'; end if;

  if exists (select 1 from production_areas where organization_id = v_org and code like 'MAU-%') then
    raise notice 'Cơ sở này đã có dữ liệu mẫu, bỏ qua (muốn nạp lại hãy chạy XOA trước).'; return;
  end if;

  select id into v_crop from crop_types where code = 'melon';
  select id, version into v_sys, v_sysver from system_templates where code = 'melon_greenhouse';
  if v_crop is null or v_sys is null then raise exception 'Thiếu sản phẩm Dưa lưới hoặc mẫu hệ thống melon_greenhouse (cần đã db push đủ migration).'; end if;
  select id into v_u_kg from units_of_measure where organization_id is null and code = 'kg';
  select id into v_u_l from units_of_measure where organization_id is null and code = 'l';
  select id into v_u_pack from units_of_measure where organization_id is null and code = 'pack';
  select id into v_u_piece from units_of_measure where organization_id is null and code = 'piece';

  alter table production_cycles disable trigger production_cycles_quota;       -- bỏ qua hạn mức số vụ khi nạp mẫu
  alter table worker_teams disable trigger worker_teams_leader_guard;          -- tổ trưởng mẫu chưa có tài khoản đăng nhập

  -- =============================================================== ĐỐI TÁC
  create temp table smp_partner (idx int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_partner (idx, kind, name) values
    (1, 'sup', 'Công ty TNHH Phân bón Phú Nông'), (2, 'sup', 'Cơ sở Hữu cơ Xanh Việt'), (3, 'sup', 'Đại lý Thuốc BVTV Hai Lúa'),
    (4, 'sup', 'Công ty Giống cây trồng Miền Nam'), (5, 'sup', 'Cửa hàng Vật tư nông nghiệp Tân Tiến'),
    (1, 'cus', 'Siêu thị Co.opmart Biên Hòa'), (2, 'cus', 'Chợ đầu mối Thủ Đức'), (3, 'cus', 'Công ty Thực phẩm Sạch Việt'),
    (4, 'cus', 'Nhà hàng Hương Quê'), (5, 'cus', 'Cửa hàng Trái cây Minh Châu'), (6, 'cus', 'Đại lý Trái cây Hai Thành');
  insert into partners (id, organization_id, name, phone, address, goods, note, is_supplier, is_customer, customer_kind)
    select id, v_org, name, '028' || (12340000 + idx * 111 + (case kind when 'sup' then 0 else 5000 end))::text,
           case kind when 'sup' then 'Khu công nghiệp / cửa hàng vật tư, nhà cung cấp ' || idx else 'Điểm nhận hàng ' || idx end,
           case when kind = 'sup' then (array['Phân NPK, phân bón lá', 'Phân hữu cơ, giá thể xơ dừa', 'Thuốc bảo vệ thực vật', 'Hạt giống dưa lưới', 'Dây treo, kẹp cây'])[idx] else 'Dưa lưới thương phẩm' end,
           'Dữ liệu mẫu', kind = 'sup', kind = 'cus',
           case when kind = 'cus' then (array['Siêu thị', 'Chợ đầu mối', 'Doanh nghiệp', 'Nhà hàng', 'Cửa hàng', 'Đại lý'])[idx] end
      from smp_partner;

  -- =============================================================== VẬT TƯ
  create temp table smp_mat (idx int, id uuid default gen_random_uuid(), name text, unit uuid, grp text, price bigint, wd int, loc int, sup int) on commit drop;
  insert into smp_mat (idx, name, unit, grp, price, wd, loc, sup) values
    (1, 'Phân NPK 20-20-15', v_u_kg, 'fertilizer', 18000, null, 2, 1),
    (2, 'Phân hữu cơ vi sinh', v_u_kg, 'fertilizer', 9000, null, 2, 2),
    (3, 'Phân bón lá Growmore', v_u_kg, 'fertilizer', 95000, null, 2, 1),
    (4, 'Thuốc trừ nấm Ridomil Gold', v_u_kg, 'pesticide', 420000, 7, 2, 3),
    (5, 'Thuốc trừ sâu sinh học Bt', v_u_l, 'pesticide', 260000, 5, 2, 3),
    (6, 'Hạt giống dưa lưới F1', v_u_pack, 'seed', 350000, null, 1, 4),
    (7, 'Giá thể xơ dừa', v_u_kg, 'other', 3500, null, 1, 2),
    (8, 'Dây treo và kẹp cây', v_u_piece, 'other', 1500, null, 1, 5);
  update smp_mat m set id = e.id from materials e where e.organization_id = v_org and e.name = m.name;   -- vật tư đã có sẵn trong cơ sở thì dùng lại
  insert into materials (id, organization_id, name, base_unit_id, material_group, reorder_threshold, withdrawal_days, description)
    select m.id, v_org, m.name, m.unit, m.grp, 20, m.wd, 'Dữ liệu mẫu' from smp_mat m
     where not exists (select 1 from materials e where e.id = m.id);

  -- =============================================================== PHÂN KHU, NHÀ MÀNG, KHO
  create temp table smp_area (k int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_area (k, name) select g, 'Phân khu ' || chr(64 + g) from generate_series(1, 5) g;
  insert into production_areas (id, organization_id, name, code, kind, area_size, area_unit, location, description)
    select id, v_org, name, 'MAU-PK' || k, 'crop', 4000, 'm2', 'Khu sản xuất công nghệ cao – ' || name, 'Dữ liệu mẫu' from smp_area;
  create temp table smp_cell (k int, c int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_cell (k, c, name) select k, c, 'Nhà màng ' || chr(64 + k) || c from generate_series(1, 5) k, generate_series(1, 4) c;
  insert into production_areas (id, organization_id, parent_id, name, code, kind, housing, area_size, area_unit, description)
    select ce.id, v_org, a.id, ce.name, 'MAU-PK' || ce.k || '-NM' || ce.c, 'crop', 'Nhà màng', 1000, 'm2', 'Dữ liệu mẫu'
      from smp_cell ce join smp_area a on a.k = ce.k;
  create temp table smp_loc (k int, n int, id uuid default gen_random_uuid()) on commit drop;
  insert into smp_loc (k, n) select k, n from generate_series(1, 5) k, generate_series(1, 2) n;
  insert into inventory_locations (id, organization_id, name, description, area_ids)
    select l.id, v_org, (case l.n when 1 then 'Kho vật tư chung – ' else 'Kho phân – thuốc – ' end) || a.name, 'Dữ liệu mẫu', array[a.id]
      from smp_loc l join smp_area a on a.k = l.k;

  -- =============================================================== NHÂN SỰ (5 tổ × 10 người)
  create temp table smp_worker (k int, idx int, n int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_worker (k, idx, n, name)
    select k, i, (k - 1) * 10 + i,
           (array['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'])[1 + (((k - 1) * 10 + i) * 7) % 10] || ' '
           || case when ((k - 1) * 10 + i) % 2 = 0 then 'Thị ' || (array['Hà', 'Hạnh', 'Hoa', 'Lan', 'Linh', 'Mai', 'Thảo', 'Trang', 'Vân', 'Yến', 'Ngọc', 'Hương', 'Loan'])[1 + (((k - 1) * 10 + i) * 3) % 13]
                   else 'Văn ' || (array['An', 'Bình', 'Cường', 'Dũng', 'Hiếu', 'Hùng', 'Khánh', 'Long', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Tuấn', 'Lộc'])[1 + (((k - 1) * 10 + i) * 4) % 15] end
      from generate_series(1, 5) k, generate_series(1, 10) i;
  insert into worker_profiles (id, organization_id, full_name, phone, status, work_mode)
    select id, v_org, name, '09119' || lpad(n::text, 5, '0'), 'active', case when idx = 1 then 'self_hourly' else 'leader_hourly' end from smp_worker;
  create temp table smp_team (k int, id uuid default gen_random_uuid()) on commit drop;
  insert into smp_team (k) select g from generate_series(1, 5) g;
  insert into worker_teams (id, organization_id, name, leader_worker_id, area_id, description)
    select t.id, v_org, 'Tổ ' || a.name, w.id, a.id, 'Dữ liệu mẫu'
      from smp_team t join smp_area a on a.k = t.k join smp_worker w on w.k = t.k and w.idx = 1;
  insert into worker_team_memberships (team_id, worker_id, valid_from)
    select t.id, w.id, v_today - 300 from smp_worker w join smp_team t on t.k = w.k;

  -- đơn giá công theo giờ: nhân viên 30.000đ/giờ, tổ trưởng 35.000đ/giờ
  insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from)
    select v_org, 'hour', w.id, case when w.idx = 1 then 35000 else 30000 end, v_today - 365 from smp_worker w;

  -- =============================================================== QUY TRÌNH (mỗi phân khu 2)
  create temp table smp_tpl (k int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_tpl (k, kind, name)
    select a.k, kd.kind, case kd.kind when 'sys' then 'Dưa lưới nhà màng – mẫu hệ thống (' else 'Dưa lưới nhà màng – quy trình riêng (' end || a.name || ')'
      from smp_area a cross join (values ('sys'), ('own')) kd (kind);
  insert into cycle_templates (id, organization_id, crop_type_id, name, note, is_active, source_system_id, source_version)
    select id, v_org, v_crop, name,
           case kind when 'sys' then 'Dữ liệu mẫu. Sao từ mẫu hệ thống Dưa lưới nhà màng (17 việc, 7 công đoạn).'
                     else 'Dữ liệu mẫu. Quy trình riêng: gộp bớt việc (10 việc), tổng thời gian vẫn 79 ngày như mẫu.' end,
           true, case when kind = 'sys' then v_sys end, case when kind = 'sys' then v_sysver end
      from smp_tpl;
  for r in select * from smp_tpl loop
    -- công đoạn: cả hai loại dùng 7 công đoạn của mẫu hệ thống
    create temp table if not exists smp_ph (tpl uuid, seq int, id uuid) on commit drop;
    for ph in select * from system_template_phases where system_template_id = v_sys order by seq loop
      insert into template_phases (template_id, organization_id, seq, code, name, description)
        values (r.id, v_org, ph.seq, ph.code, ph.name, ph.description) returning id into v_pid;
      insert into smp_ph values (r.id, ph.seq, v_pid);
      if r.kind = 'sys' then
        insert into template_stages (template_id, organization_id, seq, name, duration_days, note, work_type_id, phase_id, importance, start_day, repeat_every_days, guide, materials)
          select r.id, v_org, x.seq, wt.name, x.duration_days, x.note, x.work_type_id, v_pid, x.importance, x.start_day, x.repeat_every_days, x.guide, coalesce(x.materials, '[]'::jsonb)
            from system_template_stages x join work_types wt on wt.id = x.work_type_id
           where x.system_template_id = v_sys and x.phase_id = ph.id;
      end if;
    end loop;
    if r.kind = 'own' then
      insert into template_stages (template_id, organization_id, seq, name, duration_days, work_type_id, phase_id, importance, start_day, repeat_every_days, materials)
        select r.id, v_org, d.seq, wt.name, d.dur, wt.id, (select id from smp_ph where tpl = r.id and seq = d.pseq), d.imp, d.sd, d.rep, '[]'::jsonb
          from (values (1, 1, 'substrate_prep', 7, 1, null::int, 'high'), (2, 2, 'irrigation', 14, 8, 1, 'normal'), (3, 3, 'transplanting', 10, 22, null, 'high'),
                       (4, 4, 'fertilizing', 10, 32, 5, 'high'), (4, 5, 'spraying', 10, 32, 7, 'normal'), (5, 6, 'pollination', 9, 42, 1, 'high'),
                       (6, 7, 'fertilizing', 22, 51, 5, 'high'), (6, 8, 'spraying', 22, 51, 7, 'high'), (6, 9, 'irrigation', 22, 51, 1, 'normal'),
                       (7, 10, 'harvesting', 7, 73, null, 'high')) d (pseq, seq, wcode, dur, sd, rep, imp)
          join work_types wt on wt.organization_id is null and wt.code = d.wcode;
    end if;
  end loop;

  -- =============================================================== VỤ (mỗi nhà màng: 1 đã kết thúc, 1 đang sản xuất nối tiếp, 1 đang chuẩn bị)
  create temp table smp_cyc (id uuid default gen_random_uuid(), k int, c int, slot text, tpl uuid, start_d date, status cycle_status) on commit drop;
  insert into smp_cyc (k, c, slot, tpl, start_d, status)
    select ce.k, ce.c, sl.slot, tp.id,
           case sl.slot when 'ended' then v_today - (130 + 12 * ce.k + 3 * ce.c)
                        when 'active' then v_today - ((array[10, 30, 50, 72])[ce.c] + ce.k - 1)
                        else v_today + (81 - ((array[10, 30, 50, 72])[ce.c] + ce.k - 1)) end,
           (case sl.slot when 'ended' then 'ended' when 'active' then 'active' else 'preparing' end)::cycle_status
      from smp_cell ce cross join (values ('ended'), ('active'), ('preparing')) sl (slot)
      join smp_tpl tp on tp.k = ce.k and tp.kind = case when ce.c % 2 = 1 then 'sys' else 'own' end;
  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date, end_date, name, code, template_id, template_name,
                                 template_version, planted_area_m2, plant_count, variety_name, target_yield_kg, budget_amount, sowing_date, planting_date, note)
    select y.id, v_org, ce.id, v_crop, y.status, y.start_d, y.start_d + 78, case when y.status = 'ended' then y.start_d + 78 end,
           'Dưa lưới ' || ce.name || ' – vụ ' || (case y.slot when 'ended' then 1 when 'active' then 2 else 3 end),
           'MAU-' || chr(64 + y.k) || y.c || '-V' || (case y.slot when 'ended' then 1 when 'active' then 2 else 3 end),
           tp.id, tp.name, 1, 1000, 2800, 'Dưa lưới Kim Cương F1', 5500, 60000000, y.start_d + 2, y.start_d + 21, 'Dữ liệu mẫu'
      from smp_cyc y join smp_cell ce on ce.k = y.k and ce.c = y.c join cycle_templates tp on tp.id = y.tpl;

  -- giai đoạn: sao từ quy trình giống create_cycle_from_template
  for r in select id, start_d, tpl from smp_cyc loop
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
  -- trạng thái việc theo thời gian hiện tại
  update production_stages ps set
      status = case when y.status = 'ended' or ps.planned_end < v_today then 'done' when ps.planned_start <= v_today then 'in_progress' else 'pending' end,
      actual_start = case when y.status = 'ended' or ps.planned_start <= v_today then ps.planned_start end,
      actual_end = case when y.status = 'ended' or ps.planned_end < v_today then ps.planned_end end
    from smp_cyc y where y.id = ps.cycle_id and y.status in ('ended', 'active');

  -- =============================================================== NHẬT KÝ VIỆC (các việc đã thực hiện xong)
  create temp table smp_log (id uuid default gen_random_uuid(), cycle_id uuid, stage_id uuid, wt_id uuid, wcode text, sname text, k int, c int, d date) on commit drop;
  insert into smp_log (cycle_id, stage_id, wt_id, wcode, sname, k, c, d)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.c, g::date
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, (ps.repeat_every_days || ' days')::interval) g
     where ps.status in ('done', 'in_progress') and ps.repeat_every_days is not null and ps.planned_start <= v_today - 1;
  insert into smp_log (cycle_id, stage_id, wt_id, wcode, sname, k, c, d)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.c, ps.planned_end
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
     where ps.status = 'done' and ps.repeat_every_days is null;
  insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at, source, data, note, author_name)
    select l.id, v_org, l.cycle_id, l.wt_id, l.stage_id, (l.d + time '08:30') at time zone v_tz, 'online', '{}'::jsonb,
           'Đã hoàn thành: ' || l.sname, w.name
      from smp_log l join smp_worker w on w.k = l.k and w.idx = 1;

  -- =============================================================== KHO: xuất cho từng việc, nhập 2 đợt có hóa đơn, tồn
  create temp table smp_issue (id uuid default gen_random_uuid(), log_id uuid, cycle_id uuid, k int, mat int, qty numeric, d date) on commit drop;
  insert into smp_issue (log_id, cycle_id, k, mat, qty, d)
    select l.id, l.cycle_id, l.k,
           case l.wcode when 'fertilizing' then (array[3, 1, 2])[1 + extract(doy from l.d)::int % 3]
                        when 'spraying' then (array[4, 5])[1 + extract(doy from l.d)::int % 2]
                        when 'substrate_prep' then 7 when 'tray_sowing' then 6 when 'trellising' then 8 end,
           case l.wcode when 'fertilizing' then (array[2, 25, 40])[1 + extract(doy from l.d)::int % 3]
                        when 'spraying' then 1.2 when 'substrate_prep' then 900 when 'tray_sowing' then 3 when 'trellising' then 1500 end,
           l.d
      from smp_log l where l.wcode in ('fertilizing', 'spraying', 'substrate_prep', 'tray_sowing', 'trellising');

  create temp table smp_rcpt (id uuid default gen_random_uuid(), k int, rnd int, mat int, sup int, qty numeric, cost bigint, d date, bill_id uuid) on commit drop;
  insert into smp_rcpt (k, rnd, mat, sup, qty, cost, d)
    select i.k, 1, i.mat, m.sup, ceil(sum(i.qty) * 1.15 + 5), (m.price * 1.00)::bigint, v_today - 215
      from smp_issue i join smp_mat m on m.idx = i.mat where i.d < v_today - 70 group by i.k, i.mat, m.sup, m.price;
  insert into smp_rcpt (k, rnd, mat, sup, qty, cost, d)
    select i.k, 2, i.mat, m.sup, ceil(sum(i.qty) * 1.5 + 20), (m.price * 1.04)::bigint, v_today - 70
      from smp_issue i join smp_mat m on m.idx = i.mat where i.d >= v_today - 70 group by i.k, i.mat, m.sup, m.price;
  create temp table smp_bill (id uuid default gen_random_uuid(), k int, rnd int, sup int, d date, total bigint) on commit drop;
  insert into smp_bill (k, rnd, sup, d, total) select k, rnd, sup, min(d), sum((qty * cost)::bigint) from smp_rcpt group by k, rnd, sup;
  update smp_rcpt rc set bill_id = b.id from smp_bill b where b.k = rc.k and b.rnd = rc.rnd and b.sup = rc.sup;
  insert into purchase_bills (id, organization_id, partner_id, invoice_no, bill_date, due_date, total_amount, note)
    select b.id, v_org, p.id, 'HD-' || b.sup || '-' || chr(64 + b.k) || '-' || b.rnd, b.d, b.d + 30, b.total, 'Dữ liệu mẫu'
      from smp_bill b join smp_partner p on p.kind = 'sup' and p.idx = b.sup;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, bill_id, lot_no, lot_expiry)
    select rc.id, v_org, l.id, m.id, 'receipt', rc.qty, rc.cost, rc.d, rc.bill_id,
           'L' || rc.rnd || '-' || rc.mat || '-' || chr(64 + rc.k),
           case when rc.mat <= 5 then v_today + case when rc.rnd = 1 and rc.mat = 4 and rc.k = 1 then 20 when rc.rnd = 1 then 200 else 420 end end
      from smp_rcpt rc join smp_mat m on m.idx = rc.mat join smp_loc l on l.k = rc.k and l.n = m.loc;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, cycle_id, activity_log_id)
    select i.id, v_org, l.id, m.id, 'issue', -i.qty, m.price, i.d, i.cycle_id, i.log_id
      from smp_issue i join smp_mat m on m.idx = i.mat join smp_loc l on l.k = i.k and l.n = m.loc;
  -- điều chỉnh kiểm kê (hao hụt nhỏ) mỗi phân khu
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason)
    select gen_random_uuid(), v_org, l.id, m.id, 'adjustment', -2, v_today - 20, 'Kiểm kê: hao hụt, rơi vãi khi vận chuyển'
      from smp_loc l join smp_mat m on m.idx = 1 and m.loc = l.n where l.n = 2;
  -- thanh toán công nợ phải trả: đợt 1 trả đủ; đợt 2 xen kẽ trả đủ / một phần / chưa trả (quá hạn)
  insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
    select gen_random_uuid(), v_org, b.id, b.d + case when b.rnd = 1 then 10 else 20 end,
           round(b.total * case when b.rnd = 1 then 1 else (array[1, 0.5, 0])[1 + (b.k + b.sup) % 3] end)::bigint, 'transfer', 'Dữ liệu mẫu'
      from smp_bill b where b.rnd = 1 or (b.k + b.sup) % 3 <> 2;

  -- =============================================================== THU HOẠCH, DOANH THU, CÔNG NỢ PHẢI THU
  create temp table smp_h (id uuid default gen_random_uuid(), cycle_id uuid, k int, c int, n int, d date, qty numeric, cust int, price bigint, amount bigint) on commit drop;
  insert into smp_h (cycle_id, k, c, n, d, qty)
    select ps.cycle_id, y.k, y.c, (row_number() over (partition by ps.cycle_id order by g))::int, g::date, round((420 + random() * 220)::numeric, 1)
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, interval '1 day') g
     where wt.code = 'harvesting' and ps.status in ('done', 'in_progress') and ps.planned_start <= v_today - 1;
  update smp_h set cust = case when n % 5 = 0 then null else 1 + (k + c + n) % 6 end,
                   price = 24000 + k * 500 + c * 300;
  update smp_h set amount = round(qty * price)::bigint;
  insert into harvest_records (id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note)
    select id, v_org, cycle_id, (d + time '06:30') at time zone v_tz, case when n % 3 = 0 then 'B' else 'A' end, qty, 'kg', round((5 + random() * 10)::numeric, 1), 'Dữ liệu mẫu'
      from smp_h;
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, buyer_note, partner_id, invoice_no, due_date)
    select h.id, v_org, h.cycle_id, h.d, h.qty, 'kg', h.amount, case when h.cust is null then 'Bán lẻ tại vườn' else p.name end, p.id,
           case when h.cust is not null then 'BH-' || chr(64 + h.k) || h.c || '-' || h.n end,
           case when h.cust is not null then h.d + case when h.cust % 2 = 0 then 15 else 30 end end
      from smp_h h left join smp_partner p on p.kind = 'cus' and p.idx = h.cust;
  -- thu tiền: bán lâu thì đã thu đủ; vừa bán thì chưa thu; khách số 6 luôn nợ
  insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
    select gen_random_uuid(), v_org, h.id, h.d + 10,
           round(h.amount * case when h.cust = 6 then 0 when v_today - h.d > 50 then 1 when v_today - h.d > 20 then (case when h.cust % 2 = 0 then 0.6 else 1 end) else 0 end)::bigint,
           'transfer', 'Dữ liệu mẫu'
      from smp_h h where h.cust is not null and h.cust <> 6 and v_today - h.d > 20;

  -- =============================================================== CHI PHÍ
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note, partner_id)
    select gen_random_uuid(), v_org, y.id, 'labor'::expense_category, 'cash_paid'::expense_kind, ((16 + (y.k + y.c) % 5) * 1000000 * case when y.status = 'ended' then 1 else 0.5 end)::bigint,
           case when y.status = 'ended' then y.start_d + 76 else least(y.start_d + 45, v_today - 1) end, 'Công chăm sóc, làm giàn, thu hoạch', null
      from smp_cyc y where y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), v_org, y.id, 'material', 'cash_paid', ((7 + y.k % 3) * 1000000)::bigint, y.start_d + 3, 'Mua vật tư đầu vụ',
           (select id from smp_partner where kind = 'sup' and idx = 1 + (y.k + y.c) % 5)
      from smp_cyc y where y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), v_org, y.id, 'utility', 'allocated', 3000000, least(y.start_d + 60, v_today - 1), 'Phân bổ điện, nước theo diện tích nhà màng', null
      from smp_cyc y where y.status in ('ended', 'active');
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note)
    select gen_random_uuid(), v_org, null::uuid, 'rent'::expense_category, 'cash_paid'::expense_kind, 15000000, v_today - 30 * m, '[Mẫu] Thuê đất tháng ' || to_char(v_today - 30 * m, 'MM/YYYY') from generate_series(0, 5) m
    union all
    select gen_random_uuid(), v_org, null, 'depreciation', 'allocated', 8000000, v_today - 30 * m, '[Mẫu] Khấu hao nhà màng tháng ' || to_char(v_today - 30 * m, 'MM/YYYY') from generate_series(0, 5) m
    union all
    select gen_random_uuid(), v_org, null, 'other', 'cash_paid', 2000000 + m * 400000, v_today - 30 * m - 5, '[Mẫu] Chi phí quản lý, văn phòng' from generate_series(0, 5) m;

  -- =============================================================== CHẤM CÔNG (45 ngày gần nhất)
  create temp table smp_act (k int, c int, id uuid) on commit drop;
  insert into smp_act select y.k, y.c, y.id from smp_cyc y where y.status = 'active';
  -- ngày làm việc đã chốt (trừ hôm qua và hôm nay)
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, d::date, ((d::date + time '07:00') at time zone v_tz) + ((w.n * 7 + extract(doy from d)::int) % 20) * interval '1 minute',
           ((d::date + time '16:00') at time zone v_tz), (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, 'confirmed'::attendance_status, 60, 480,
           a.id, (select ac.id from smp_act ac where ac.k = w.k and ac.c = 1 + (w.n + extract(doy from d)::int) % 4), now()
      from smp_worker w join smp_area a on a.k = w.k
      cross join generate_series(v_today - 45, v_today - 2, interval '1 day') d
     where extract(dow from d) <> 0 and (w.n * 13 + extract(doy from d)::int * 7) % 100 >= 12;
  -- hôm qua: một phần chờ xác nhận
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, v_today - 1, ((v_today - 1 + time '07:00') at time zone v_tz), ((v_today - 1 + time '16:00') at time zone v_tz),
           (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, (case when w.n % 3 = 0 then 'needs_confirmation' else 'confirmed' end)::attendance_status, 60,
           case when w.n % 3 = 0 then null else 480 end, a.id, (select ac.id from smp_act ac where ac.k = w.k and ac.c = 1 + w.n % 4),
           case when w.n % 3 = 0 then null else now() end
      from smp_worker w join smp_area a on a.k = w.k where extract(dow from v_today - 1) <> 0 and w.n % 11 <> 0;
  -- hôm nay: một số người đang trong ca (đã vào, chưa ra)
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, source, status, break_minutes, area_id, cycle_id)
    select gen_random_uuid(), v_org, w.id, v_today, least(((v_today + time '07:05') at time zone v_tz), now() - interval '5 minutes'),
           (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, 'open'::attendance_status, 60, a.id, (select ac.id from smp_act ac where ac.k = w.k and ac.c = 1 + w.n % 4)
      from smp_worker w join smp_area a on a.k = w.k
     where w.n % 10 <> 4 and extract(dow from v_today) <> 0 and (now() at time zone v_tz)::time > time '07:30';

  alter table production_cycles enable trigger production_cycles_quota;
  alter table worker_teams enable trigger worker_teams_leader_guard;

  select count(*) into n_cnt from production_cycles where owner_org_id = v_org and code like 'MAU-%';
  raise notice 'Đã nạp dữ liệu mẫu cho cơ sở %: 5 phân khu, 20 nhà màng, 10 kho, 50 nhân sự, % vụ, % nhật ký, % lần thu hoạch.', v_org, n_cnt, (select count(*) from smp_log), (select count(*) from smp_h);
end $$;
