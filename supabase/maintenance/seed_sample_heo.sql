-- BỘ DỮ LIỆU MẪU NUÔI HEO THỊT: từ khai báo (phân khu, chuồng, kho, vật tư, nhân sự, quy trình) đến hết vụ (thu hoạch, doanh thu, công nợ).
-- Gắn vào cơ sở có sẵn của tài khoản bên dưới. Chạy lại an toàn: đã có dữ liệu mẫu heo thì bỏ qua.
--
-- NỘI DUNG
--   · 2 phân khu ("Trại heo A", "Trại heo B"), mỗi phân khu 5 chuồng (ô sản xuất) = 10 chuồng; mỗi phân khu 2 kho (thức ăn; thuốc – vật tư)
--   · Sản phẩm "Heo thịt" (loại vật nuôi) nếu cơ sở chưa có; mỗi phân khu 2 quy trình: 1 sao từ mẫu hệ thống "Heo thịt VietGAP" (25 việc, 5 công đoạn), 1 quy trình riêng rút gọn (10 việc)
--   · MỖI CHUỒNG 6 VỤ (lứa) 100–120 con: 2 ĐÃ KẾT THÚC, 2 ĐANG CHẠY (chạy song song ở hai ngăn, tuổi khác nhau; vụ vào sau được đánh dấu "vượt chỗ trống" như khi chủ xác nhận), 2 ĐANG CHUẨN BỊ => 60 vụ
--     - Đã kết thúc: "tốt" (hao hụt thấp, lãi), "bệnh" (hao cao, có sự cố đã xử lý, lãi mỏng/lỗ), "xuất chia hai đợt" (giá đợt sau thấp, có khách nợ)
--     - Đang chạy: từ "đang chuẩn bị chuồng" đến "đang xuất chuồng"; vụ "lệch" có sự cố đang mở, việc khắc phục quá hạn, mũi vaccine trễ, ăn thấp hơn định mức
--     - Đang chuẩn bị: có quy trình/ lịch việc, hoặc chưa gắn quy trình
--   · Số lượng: số con nhập, chết/loại thải theo ngày; cân mẫu mỗi 15 ngày (tăng trọng); cám ăn mỗi ngày (xuất kho theo vụ); định mức thức ăn theo ngày tuổi (vụ đang chạy "bình thường")
--   · Lịch vaccine (mốc nhắc, có số lô mũi đã tiêm); nhật ký cho mọi việc đã làm xong; kho (nhập 2 đợt có hóa đơn, xuất theo vụ, tồn); công nợ phải trả/phải thu
--   · Nhân sự: 2 tổ (mỗi phân khu 1 tổ trưởng + 5 nhân viên = 12 người), đơn giá giờ công, chấm công 45 ngày gần nhất gắn theo các vụ đang chạy (có ca chờ xác nhận, ca đang mở hôm nay)
--
-- CÁCH DÙNG (Supabase → SQL Editor): sửa v_email (và v_org_name nếu tài khoản làm chủ nhiều cơ sở) rồi bấm Run.
-- Xóa dữ liệu mẫu: đổi v_mode thành 'XOA' và chạy lại (chỉ xóa các dòng mẫu heo, không đụng dữ liệu thật hay bộ mẫu khác).
-- Ghi chú: gói dịch vụ có thể giới hạn số vụ đang chạy; script bỏ qua giới hạn này khi nạp. Muốn tạo thêm vụ mới sau đó hãy nâng gói hoặc xóa dữ liệu mẫu.

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_email    constant text := 'hotelthanhconggrand@gmail.com';   -- tài khoản chủ cơ sở
  v_org_name constant text := '';                               -- tên cơ sở (để rỗng = cơ sở đầu tiên do tài khoản làm chủ)
  v_mode     constant text := 'THEM';                           -- 'THEM' = nạp dữ liệu mẫu; 'XOA' = xóa dữ liệu mẫu
  -- ===== HẾT CẤU HÌNH =====
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_org uuid; v_crop uuid; v_crop_new boolean := false;
  v_u_kg uuid; v_u_l uuid; v_u_pack uuid; v_u_bottle uuid; v_u_piece uuid;
  v_sys uuid; v_sysver int; v_pid uuid;
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
    create temp table hp_del_cyc (id uuid) on commit drop;
    create temp table hp_del_wk (id uuid) on commit drop;
    create temp table hp_del_partner (id uuid) on commit drop;
    insert into hp_del_cyc select id from production_cycles where owner_org_id = v_org and code like 'MAUHEO-%';
    insert into hp_del_wk select id from worker_profiles where organization_id = v_org and phone like '09122%';
    insert into hp_del_partner select id from partners where organization_id = v_org and note = 'Dữ liệu mẫu heo';
    delete from attendance_records where worker_id in (select id from hp_del_wk);
    alter table sale_receipts disable trigger sale_receipts_guard;
    delete from sale_receipts where sale_id in (select id from sales_records where cycle_id in (select id from hp_del_cyc));
    alter table sale_receipts enable trigger sale_receipts_guard;
    delete from sales_records where cycle_id in (select id from hp_del_cyc);
    delete from harvest_records where cycle_id in (select id from hp_del_cyc);
    delete from expense_records where organization_id = v_org and (cycle_id in (select id from hp_del_cyc) or note like '[Mẫu heo]%');
    alter table bill_payments disable trigger bill_payments_guard;
    delete from bill_payments where bill_id in (select id from purchase_bills where partner_id in (select id from hp_del_partner));
    alter table bill_payments enable trigger bill_payments_guard;
    alter table inventory_transactions disable trigger inventory_txn_guard_mod;
    delete from inventory_transactions where organization_id = v_org and (cycle_id in (select id from hp_del_cyc)
      or location_id in (select id from inventory_locations where organization_id = v_org and description = 'Dữ liệu mẫu heo')
      or material_id in (select id from materials where organization_id = v_org and description = 'Dữ liệu mẫu heo'));
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from purchase_bills where partner_id in (select id from hp_del_partner);
    delete from incident_actions where cycle_id in (select id from hp_del_cyc);
    delete from cycle_incidents where cycle_id in (select id from hp_del_cyc);
    delete from cycle_count_events where cycle_id in (select id from hp_del_cyc);
    delete from cycle_milestones where cycle_id in (select id from hp_del_cyc);
    delete from cycle_feed_plans where cycle_id in (select id from hp_del_cyc);
    delete from activity_logs where cycle_id in (select id from hp_del_cyc);
    delete from production_stages where cycle_id in (select id from hp_del_cyc);
    delete from production_cycles where id in (select id from hp_del_cyc);
    delete from work_rates where worker_id in (select id from hp_del_wk);
    delete from worker_team_memberships where team_id in (select id from worker_teams where organization_id = v_org and description = 'Dữ liệu mẫu heo');
    delete from worker_teams where organization_id = v_org and description = 'Dữ liệu mẫu heo';
    delete from worker_profiles where id in (select id from hp_del_wk);
    delete from material_lots where organization_id = v_org and lot_no ~ '^H[12]-[1-9]-[AB]$';
    delete from inventory_locations where organization_id = v_org and description = 'Dữ liệu mẫu heo';
    delete from materials where organization_id = v_org and description = 'Dữ liệu mẫu heo';
    delete from template_stages where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu heo%');
    delete from template_phases where template_id in (select id from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu heo%');
    delete from cycle_templates where organization_id = v_org and note like 'Dữ liệu mẫu heo%';
    delete from partners where id in (select id from hp_del_partner);
    delete from production_areas where organization_id = v_org and code like 'MAUHEO-%' and parent_id is not null;
    delete from production_areas where organization_id = v_org and code like 'MAUHEO-%';
    delete from crop_types where organization_id = v_org and description = 'Dữ liệu mẫu heo'
       and not exists (select 1 from production_cycles c where c.crop_type_id = crop_types.id);
    raise notice 'Đã xóa dữ liệu mẫu heo của cơ sở %.', v_org;
    return;
  end if;
  if v_mode <> 'THEM' then raise exception 'v_mode phải là THEM hoặc XOA'; end if;

  if exists (select 1 from production_areas where organization_id = v_org and code like 'MAUHEO-%') then
    raise notice 'Cơ sở này đã có dữ liệu mẫu heo, bỏ qua (muốn nạp lại hãy chạy XOA trước).'; return;
  end if;

  select id, version into v_sys, v_sysver from system_templates where code = 'pig_fattening_vietgap';
  if v_sys is null then raise exception 'Thiếu mẫu hệ thống pig_fattening_vietgap (cần đã db push đủ migration).'; end if;
  select id into v_u_kg from units_of_measure where organization_id is null and code = 'kg';
  select id into v_u_l from units_of_measure where organization_id is null and code = 'l';
  select id into v_u_pack from units_of_measure where organization_id is null and code = 'pack';
  select id into v_u_bottle from units_of_measure where organization_id is null and code = 'bottle';
  select id into v_u_piece from units_of_measure where organization_id is null and code = 'piece';

  -- sản phẩm "Heo thịt": dùng cái đã có của cơ sở, chưa có thì tạo
  select id into v_crop from crop_types where organization_id = v_org and kind = 'livestock' and name ilike 'heo thịt%' order by created_at limit 1;
  if v_crop is null then
    v_crop := gen_random_uuid(); v_crop_new := true;
    insert into crop_types (id, organization_id, code, name, kind, description)
      values (v_crop, v_org, 'mauheo-' || substr(v_org::text, 1, 8), 'Heo thịt', 'livestock', 'Dữ liệu mẫu heo');
  end if;

  alter table production_cycles disable trigger production_cycles_quota;
  alter table worker_teams disable trigger worker_teams_leader_guard;

  -- =============================================================== ĐỐI TÁC
  create temp table hp_partner (idx int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into hp_partner (idx, kind, name) values
    (1, 'sup', 'Công ty TNHH Thức ăn chăn nuôi Phú Gia'), (2, 'sup', 'Trại giống heo Tân Hòa'),
    (3, 'sup', 'Đại lý Thuốc thú y Hai Thành'), (4, 'sup', 'Cửa hàng Vật tư chăn nuôi Bảy Lộc'),
    (1, 'cus', 'Thương lái Hai Lúa'), (2, 'cus', 'Công ty CP Chế biến Thực phẩm Đồng Nai'), (3, 'cus', 'Lò mổ Tân Thịnh'),
    (4, 'cus', 'Thương lái Tư Béo'), (5, 'cus', 'Siêu thị Co.opmart Biên Hòa');
  insert into partners (id, organization_id, name, phone, address, goods, note, is_supplier, is_customer, customer_kind)
    select id, v_org, name, '028' || (22340000 + idx * 111 + (case kind when 'sup' then 0 else 5000 end))::text,
           case kind when 'sup' then 'Cửa hàng / đại lý nhà cung cấp ' || idx else 'Điểm nhận heo ' || idx end,
           case when kind = 'sup' then (array['Cám heo các loại', 'Heo giống 20 kg', 'Thuốc thú y, vaccine', 'Thuốc sát trùng, đệm lót, chế phẩm'])[idx] else 'Heo thịt hơi' end,
           'Dữ liệu mẫu heo', kind = 'sup', kind = 'cus',
           case when kind = 'cus' then (array['Đại lý', 'Doanh nghiệp', 'Cửa hàng', 'Đại lý', 'Siêu thị'])[idx] end
      from hp_partner;

  -- =============================================================== VẬT TƯ
  create temp table hp_mat (idx int, id uuid default gen_random_uuid(), name text, unit uuid, grp text, price bigint, wd int, loc int, sup int, thr numeric) on commit drop;
  insert into hp_mat (idx, name, unit, grp, price, wd, loc, sup, thr) values
    (1, 'Cám heo giai đoạn 1 (20–60 kg)', v_u_kg, 'feed', 13500, null, 1, 1, 3000),
    (2, 'Cám heo giai đoạn 2 (61–105 kg)', v_u_kg, 'feed', 12000, null, 1, 1, 3000),
    (3, 'Vaccine theo lịch thú y (chai 50 liều)', v_u_bottle, 'vaccine', 180000, null, 2, 3, 3),
    (4, 'Thuốc kháng sinh thú y', v_u_bottle, 'vet_drug', 250000, 14, 2, 3, 3),
    (5, 'Thuốc tẩy giun sán', v_u_pack, 'vet_drug', 90000, 7, 2, 3, 3),
    (6, 'Thuốc sát trùng chuồng trại', v_u_l, 'disinfectant', 120000, null, 2, 4, 10),
    (7, 'Trấu / mùn cưa đệm lót', v_u_kg, 'other', 1500, null, 2, 4, 200),
    (8, 'Chế phẩm sinh học xử lý chất thải', v_u_kg, 'other', 60000, null, 2, 4, 5),
    (9, 'Heo giống khoảng 20 kg (con)', v_u_piece, 'seed', 1900000, null, 2, 2, 0);
  update hp_mat m set id = e.id from materials e where e.organization_id = v_org and e.name = m.name;
  insert into materials (id, organization_id, name, base_unit_id, material_group, reorder_threshold, withdrawal_days, description)
    select m.id, v_org, m.name, m.unit, m.grp, m.thr, m.wd, 'Dữ liệu mẫu heo' from hp_mat m
     where not exists (select 1 from materials e where e.id = m.id);

  -- =============================================================== PHÂN KHU, CHUỒNG, KHO
  create temp table hp_area (k int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into hp_area (k, name) select g, 'Trại heo ' || chr(64 + g) from generate_series(1, 2) g;
  insert into production_areas (id, organization_id, name, code, kind, area_size, area_unit, location, description)
    select id, v_org, name, 'MAUHEO-PK' || k, 'livestock', 3000, 'm2', 'Khu chăn nuôi – ' || name, 'Dữ liệu mẫu heo' from hp_area;
  create temp table hp_cell (k int, c int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into hp_cell (k, c, name) select k, c, 'Chuồng ' || chr(64 + k) || c from generate_series(1, 2) k, generate_series(1, 5) c;
  insert into production_areas (id, organization_id, parent_id, name, code, kind, housing, area_size, area_unit, description)
    select ce.id, v_org, a.id, ce.name, 'MAUHEO-PK' || ce.k || '-C' || ce.c, 'livestock', 'Chuồng', 300, 'm2', 'Dữ liệu mẫu heo'
      from hp_cell ce join hp_area a on a.k = ce.k;
  create temp table hp_loc (k int, n int, id uuid default gen_random_uuid()) on commit drop;
  insert into hp_loc (k, n) select k, n from generate_series(1, 2) k, generate_series(1, 2) n;
  insert into inventory_locations (id, organization_id, name, description, area_ids)
    select l.id, v_org, (case l.n when 1 then 'Kho thức ăn – ' else 'Kho thuốc – vật tư – ' end) || a.name, 'Dữ liệu mẫu heo', array[a.id]
      from hp_loc l join hp_area a on a.k = l.k;

  -- =============================================================== NHÂN SỰ (2 tổ × 6 người)
  create temp table hp_worker (k int, idx int, n int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into hp_worker (k, idx, n, name)
    select k, i, (k - 1) * 6 + i,
           (array['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'])[1 + (((k - 1) * 6 + i) * 7) % 10] || ' '
           || case when ((k - 1) * 6 + i) % 3 = 0 then 'Thị ' || (array['Hà', 'Hạnh', 'Hoa', 'Lan', 'Linh', 'Mai', 'Thảo', 'Trang', 'Vân', 'Yến'])[1 + (((k - 1) * 6 + i) * 3) % 10]
                   else 'Văn ' || (array['An', 'Bình', 'Cường', 'Dũng', 'Hiếu', 'Hùng', 'Khánh', 'Long', 'Nam', 'Phúc', 'Quân', 'Sơn'])[1 + (((k - 1) * 6 + i) * 5) % 12] end
      from generate_series(1, 2) k, generate_series(1, 6) i;
  insert into worker_profiles (id, organization_id, full_name, phone, status, work_mode)
    select id, v_org, name, '09122' || lpad(n::text, 5, '0'), 'active', case when idx = 1 then 'self_hourly' else 'leader_hourly' end from hp_worker;
  create temp table hp_team (k int, id uuid default gen_random_uuid()) on commit drop;
  insert into hp_team (k) select g from generate_series(1, 2) g;
  insert into worker_teams (id, organization_id, name, leader_worker_id, area_id, description)
    select t.id, v_org, 'Tổ ' || a.name, w.id, a.id, 'Dữ liệu mẫu heo'
      from hp_team t join hp_area a on a.k = t.k join hp_worker w on w.k = t.k and w.idx = 1;
  insert into worker_team_memberships (team_id, worker_id, valid_from)
    select t.id, w.id, v_today - 600 from hp_worker w join hp_team t on t.k = w.k;
  insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from)
    select v_org, 'hour', w.id, case when w.idx = 1 then 38000 else 32000 end, v_today - 600 from hp_worker w;

  -- =============================================================== QUY TRÌNH (mỗi phân khu 2)
  create temp table hp_tpl (k int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into hp_tpl (k, kind, name)
    select a.k, kd.kind, case kd.kind when 'sys' then 'Heo thịt VietGAP – mẫu hệ thống (' else 'Heo thịt – quy trình riêng rút gọn (' end || a.name || ')'
      from hp_area a cross join (values ('sys'), ('own')) kd (kind);
  insert into cycle_templates (id, organization_id, crop_type_id, name, note, is_active, source_system_id, source_version)
    select id, v_org, v_crop, name,
           case kind when 'sys' then 'Dữ liệu mẫu heo. Sao từ mẫu hệ thống Heo thịt VietGAP (25 việc, 5 công đoạn).'
                     else 'Dữ liệu mẫu heo. Quy trình riêng: gộp bớt việc (10 việc), tổng thời gian vẫn khoảng 129 ngày.' end,
           true, case when kind = 'sys' then v_sys end, case when kind = 'sys' then v_sysver end
      from hp_tpl;
  create temp table hp_ph (tpl uuid, seq int, id uuid) on commit drop;
  for r in select * from hp_tpl loop
    for ph in select * from system_template_phases where system_template_id = v_sys order by seq loop
      insert into template_phases (template_id, organization_id, seq, code, name, description)
        values (r.id, v_org, ph.seq, ph.code, ph.name, ph.description) returning id into v_pid;
      insert into hp_ph values (r.id, ph.seq, v_pid);
      if r.kind = 'sys' then
        insert into template_stages (template_id, organization_id, seq, name, duration_days, note, work_type_id, phase_id, importance, start_day, repeat_every_days, guide, materials)
          select r.id, v_org, x.seq, wt.name, x.duration_days, x.note, x.work_type_id, v_pid, x.importance, x.start_day, x.repeat_every_days, x.guide, coalesce(x.materials, '[]'::jsonb)
            from system_template_stages x join work_types wt on wt.id = x.work_type_id
           where x.system_template_id = v_sys and x.phase_id = ph.id;
      end if;
    end loop;
    if r.kind = 'own' then
      insert into template_stages (template_id, organization_id, seq, name, duration_days, work_type_id, phase_id, importance, start_day, repeat_every_days, materials)
        select r.id, v_org, d.seq, wt.name, d.dur, wt.id, (select id from hp_ph where tpl = r.id and seq = d.pseq), d.imp, d.sd, d.rep, '[]'::jsonb
          from (values (1, 1, 'house_cleaning', 4, 1, null::int, 'high'), (1, 2, 'disinfecting', 2, 5, null, 'high'),
                       (2, 3, 'weighing', 1, 10, null, 'high'), (2, 4, 'feeding', 14, 10, 1, 'high'), (2, 5, 'vaccinating', 7, 14, null, 'high'),
                       (3, 6, 'feeding', 49, 24, 1, 'high'), (3, 7, 'weighing', 49, 24, 15, 'normal'),
                       (4, 8, 'feeding', 50, 73, 1, 'high'), (4, 9, 'weighing', 50, 73, 15, 'normal'),
                       (5, 10, 'harvesting_lv', 7, 123, null, 'high')) d (pseq, seq, wcode, dur, sd, rep, imp)
          join work_types wt on wt.organization_id is null and wt.code = d.wcode;
    end if;
  end loop;

  -- =============================================================== VỤ: mỗi chuồng 6 vụ (2 kết thúc, 2 đang chạy, 2 chuẩn bị)
  -- đang chạy A1/A2 chạy song song ở hai ngăn của chuồng, tuổi khác nhau (từ đang chuẩn bị chuồng đến đang xuất chuồng)
  create temp table hp_cyc (id uuid default gen_random_uuid(), k int, c int, slot text, slotno int, tpl uuid, tpl_name text, start_d date, status cycle_status,
                            heads int, sc text, f numeric, in_d date, end_d date, cname text, label text) on commit drop;
  insert into hp_cyc (k, c, slot, slotno, tpl, tpl_name, start_d, status, heads, sc, f, in_d, end_d, cname, label)
    select y.k, y.c, y.slot, y.slotno, tp.id, tp.name, y.start_d,
           (case when y.slot in ('E1', 'E2') then 'ended' when y.slot in ('A1', 'A2') then 'active' else 'preparing' end)::cycle_status,
           y.heads, y.sc,
           case y.sc when 'disease' then 0.93 when 'sick' then 0.92 when 'split' then 1.02 else 1.0 end,
           y.start_d + 9,
           case when y.slot in ('E1', 'E2') then y.start_d + (case y.sc when 'good' then 125 when 'disease' then 129 else 128 end) end,
           y.cname, 'lứa ' || y.slotno
      from (
        select ce.k, ce.c, sl.slot, sl.n as slotno, ce.name as cname,
               case sl.slot when 'E1' then v_today - (420 + 9 * ce.c + 6 * ce.k)
                            when 'E2' then v_today - (250 + 7 * ce.c + 5 * ce.k)
                            when 'A1' then v_today - ((array[8, 30, 60, 95, 124])[ce.c] + (ce.k - 1) * 3)
                            when 'A2' then v_today - ((array[45, 80, 20, 110, 70])[ce.c] + (ce.k - 1) * 2)
                            when 'P1' then v_today + 3 + 3 * ce.c + ce.k
                            else v_today + 45 + 5 * ce.c + 2 * ce.k end as start_d,
               100 + ((ce.k * 11 + ce.c * 7 + sl.n * 5) % 21) as heads,
               case when sl.slot in ('E1', 'E2') then (array['good', 'disease', 'split', 'good'])[1 + ((ce.k + ce.c + sl.n) % 4)]
                    when sl.slot in ('A1', 'A2') then (array['normal', 'sick', 'normal'])[1 + ((ce.k * 3 + ce.c + sl.n) % 3)]
                    else 'plan' end as sc
          from hp_cell ce cross join (values ('E1', 1), ('E2', 2), ('A1', 3), ('A2', 4), ('P1', 5), ('P2', 6)) sl (slot, n)
      ) y
      left join hp_tpl tp on tp.k = y.k and tp.kind = case when y.c % 2 = 1 then 'sys' else 'own' end
                         and not (y.slot = 'P2' and y.c % 2 = 0);   -- vài vụ chuẩn bị chưa gắn quy trình
  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date, end_date, name, code, template_id, template_name,
                                 template_version, plant_count, count_unit, variety_name, seed_source, seed_lot, target_yield_kg, target_weight_kg, budget_amount,
                                 planting_date, cycle_mode, mgmt_model, over_capacity, note)
    select y.id, v_org, ce.id, v_crop, y.status, y.start_d, y.start_d + 128, y.end_d,
           'Heo thịt ' || ce.name || ' – ' || y.label, 'MAUHEO-' || chr(64 + y.k) || y.c || '-L' || y.slotno,
           y.tpl, y.tpl_name, case when y.tpl is not null then 1 end, y.heads, 'con', 'Heo lai 3 máu (Landrace × Yorkshire × Duroc)',
           'Trại giống heo Tân Hòa', 'TH-' || to_char(y.start_d, 'YYMM') || '-' || y.c, y.heads * 100, 105, y.heads * 4600000,
           y.in_d, 'batch', case when y.k = 1 then 'vietgap' else 'managed' end,
           -- vụ vào chuồng khi chuồng còn vụ khác đang nuôi (chuồng chia hai ngăn): đánh dấu như khi chủ xác nhận vượt chỗ
           exists (select 1 from hp_cyc z where z.k = y.k and z.c = y.c and z.id <> y.id and z.start_d < y.start_d and z.start_d + 128 >= y.start_d),
           'Dữ liệu mẫu heo'
      from hp_cyc y join hp_cell ce on ce.k = y.k and ce.c = y.c;

  -- giai đoạn: sao từ quy trình giống create_cycle_from_template
  for r in select id, start_d, tpl from hp_cyc where tpl is not null loop
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
    from hp_cyc y where y.id = ps.cycle_id and y.status in ('ended', 'active');
  -- vụ đang chạy "lệch": việc tiêm vaccine gần nhất đã quá hạn mà chưa làm xong => trễ tiến độ
  update production_stages ps set status = 'in_progress', actual_end = null
   where ps.id in (select distinct on (st2.cycle_id) st2.id
                     from production_stages st2 join hp_cyc y on y.id = st2.cycle_id join work_types wt on wt.id = st2.work_type_id
                    where y.sc = 'sick' and y.status = 'active' and wt.code = 'vaccinating' and st2.status = 'done' and st2.planned_end < v_today - 3
                    order by st2.cycle_id, st2.planned_end desc);

  -- =============================================================== SỐ LƯỢNG: chết / loại thải theo ngày (số con nhập = "Số con" của vụ)
  create temp table hp_ev (id uuid default gen_random_uuid(), cycle_id uuid, d date, kind text, qty int) on commit drop;
  insert into hp_ev (cycle_id, d, kind, qty)
    select y.id,
           y.in_d + case when y.sc in ('disease', 'sick') then 30 + (i.i - 1) * 4 else 12 + (i.i - 1) * (case when y.status = 'ended' then 105 else 60 end / i.n) end,
           case when y.sc in ('disease', 'sick') and i.i % 3 = 0 then 'culled' else 'dead' end,
           i.dd / i.n + case when i.i <= i.dd % i.n then 1 else 0 end
      from (select y2.*, round(y2.heads * (case y2.sc when 'good' then 0.02 when 'disease' then 0.09 when 'split' then 0.03 when 'normal' then 0.015 else 0.07 end))::int as dd,
                   least(case when y2.sc = 'disease' then 6 when y2.sc = 'sick' then 4 else 3 end, round(y2.heads * (case y2.sc when 'good' then 0.02 when 'disease' then 0.09 when 'split' then 0.03 when 'normal' then 0.015 else 0.07 end))::int) as n
              from hp_cyc y2 where y2.status in ('ended', 'active')) y
      cross join lateral generate_series(1, y.n) as i0(i)
      cross join lateral (select i0.i as i, y.n as n, y.dd as dd) i
     where y.in_d + case when y.sc in ('disease', 'sick') then 30 + (i.i - 1) * 4 else 12 + (i.i - 1) * (case when y.status = 'ended' then 105 else 60 end / i.n) end <= v_today - 1;
  insert into cycle_count_events (id, cycle_id, organization_id, event_date, kind, quantity, note, created_by)
    select id, cycle_id, v_org, d, kind, qty,
           case kind when 'dead' then 'Chết, đã xử lý theo quy định thú y' else 'Loại thải: còi cọc, không đạt' end, v_user
      from hp_ev;

  -- =============================================================== NHẬT KÝ VIỆC (các việc đã thực hiện xong)
  create temp table hp_log (id uuid default gen_random_uuid(), cycle_id uuid, stage_id uuid, wt_id uuid, wcode text, sname text, k int, c int, d date, rep int,
                            heads numeric, avg numeric, kg numeric) on commit drop;
  insert into hp_log (cycle_id, stage_id, wt_id, wcode, sname, k, c, d, rep)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.c, g::date, ps.repeat_every_days
      from production_stages ps join hp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp,
                                         (case when wt.code = 'house_cleaning' then greatest(ps.repeat_every_days, 2) else ps.repeat_every_days end || ' days')::interval) g
     where ps.status in ('done', 'in_progress') and ps.repeat_every_days is not null and ps.planned_start <= v_today - 1;
  insert into hp_log (cycle_id, stage_id, wt_id, wcode, sname, k, c, d, rep)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.c, ps.planned_end, null
      from production_stages ps join hp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
     where ps.status = 'done' and ps.repeat_every_days is null
       and not (wt.code = 'treating' and y.sc not in ('disease', 'sick'));   -- chỉ vụ có bệnh mới có việc điều trị
  -- số con còn lại, cân nặng bình quân, lượng cám mỗi ngày theo ngày tuổi
  update hp_log l set heads = y.heads - coalesce((select sum(e.qty) from hp_ev e where e.cycle_id = l.cycle_id and e.d <= l.d), 0),
                      avg = round(20 + greatest(l.d - y.in_d, 0) * 0.74 * y.f, 1)
    from hp_cyc y where y.id = l.cycle_id;
  update hp_log l set kg = round(l.heads * (0.5 + 0.0225 * l.avg) * (0.95 + ((extract(doy from l.d)::int * 7) % 11) * 0.01) * (case when y.sc = 'sick' then 0.85 else 1 end), 1)
    from hp_cyc y where y.id = l.cycle_id and l.wcode = 'feeding';
  insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at, source, data, note, author_name)
    select l.id, v_org, l.cycle_id, l.wt_id, l.stage_id, (l.d + time '07:30') at time zone v_tz, 'online',
           case l.wcode when 'feeding' then jsonb_build_object('feed_kg', l.kg)
                        when 'weighing' then jsonb_build_object('pigs', 10, 'avg_kg', l.avg)
                        else '{}'::jsonb end,
           case l.wcode when 'feeding' then 'Cho ăn ' || l.kg || ' kg cho ' || l.heads::int || ' con'
                        when 'weighing' then 'Cân mẫu 10 con, trung bình ' || l.avg || ' kg/con'
                        else 'Đã hoàn thành: ' || l.sname end, w.name
      from hp_log l join hp_worker w on w.k = l.k and w.idx = 1;

  -- =============================================================== KHO: xuất cho từng việc, nhập 2 đợt có hóa đơn, tồn
  create temp table hp_issue (id uuid default gen_random_uuid(), log_id uuid, cycle_id uuid, k int, mat int, qty numeric, d date) on commit drop;
  insert into hp_issue (log_id, cycle_id, k, mat, qty, d)
    select l.id, l.cycle_id, l.k,
           case l.wcode when 'feeding' then case when l.d - y.in_d <= 63 then 1 else 2 end
                        when 'vaccinating' then 3 when 'treating' then 4 when 'deworming' then 5 when 'disinfecting' then 6 end,
           case l.wcode when 'feeding' then l.kg when 'vaccinating' then ceil(y.heads / 50.0) when 'treating' then 2 when 'deworming' then 1
                        when 'disinfecting' then case when l.rep is null then 15 else 4 end end,
           l.d
      from hp_log l join hp_cyc y on y.id = l.cycle_id where l.wcode in ('feeding', 'vaccinating', 'treating', 'deworming', 'disinfecting') and l.kg is distinct from 0;
  insert into hp_issue (log_id, cycle_id, k, mat, qty, d)
    select l.id, l.cycle_id, l.k, v.mat, v.qty, l.d from hp_log l cross join (values (7, 500), (8, 6)) v (mat, qty) where l.wcode = 'bedding_prep';

  insert into hp_issue (log_id, cycle_id, k, mat, qty, d)
    select null, y.id, y.k, 9, y.heads, y.in_d from hp_cyc y where y.status in ('ended', 'active') and y.in_d <= v_today;

  create temp table hp_rcpt (id uuid default gen_random_uuid(), k int, rnd int, mat int, sup int, qty numeric, cost bigint, d date, bill_id uuid) on commit drop;
  insert into hp_rcpt (k, rnd, mat, sup, qty, cost, d)
    select i.k, 1, i.mat, m.sup, ceil(sum(i.qty) * (case when i.mat = 9 then 1.0 else 1.01 end) + (case when i.mat = 9 then 0 else 5 end)), (m.price * 1.00)::bigint, v_today - 500
      from hp_issue i join hp_mat m on m.idx = i.mat where i.d < v_today - 150 group by i.k, i.mat, m.sup, m.price;
  insert into hp_rcpt (k, rnd, mat, sup, qty, cost, d)
    select i.k, 2, i.mat, m.sup, ceil(sum(i.qty) * (case when i.mat = 9 then 1.0 when i.mat <= 2 then 1.03 else 1.12 end) + (case when i.mat = 9 then 0 when i.mat <= 2 then 400 when i.mat = 3 and i.k = 1 then 2 else 3 end)), (m.price * 1.04)::bigint, v_today - 150
      from hp_issue i join hp_mat m on m.idx = i.mat where i.d >= v_today - 150 group by i.k, i.mat, m.sup, m.price;
  create temp table hp_bill (id uuid default gen_random_uuid(), k int, rnd int, sup int, d date, total bigint) on commit drop;
  insert into hp_bill (k, rnd, sup, d, total) select k, rnd, sup, min(d), sum((qty * cost)::bigint) from hp_rcpt group by k, rnd, sup;
  update hp_rcpt rc set bill_id = b.id from hp_bill b where b.k = rc.k and b.rnd = rc.rnd and b.sup = rc.sup;
  insert into purchase_bills (id, organization_id, partner_id, invoice_no, bill_date, due_date, total_amount, note)
    select b.id, v_org, p.id, 'HDH-' || b.sup || '-' || chr(64 + b.k) || '-' || b.rnd, b.d, b.d + 30, b.total, 'Dữ liệu mẫu heo'
      from hp_bill b join hp_partner p on p.kind = 'sup' and p.idx = b.sup;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, bill_id, lot_no, lot_expiry)
    select rc.id, v_org, l.id, m.id, 'receipt', rc.qty, rc.cost, rc.d, rc.bill_id,
           'H' || rc.rnd || '-' || rc.mat || '-' || chr(64 + rc.k),
           case when rc.mat in (3, 4, 5) then v_today + case when rc.rnd = 2 and rc.mat = 3 and rc.k = 1 then 25 when rc.rnd = 1 then 120 else 300 end end
      from hp_rcpt rc join hp_mat m on m.idx = rc.mat join hp_loc l on l.k = rc.k and l.n = m.loc;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, cycle_id, activity_log_id)
    select i.id, v_org, l.id, m.id, 'issue', -i.qty, m.price, i.d, i.cycle_id, i.log_id
      from hp_issue i join hp_mat m on m.idx = i.mat join hp_loc l on l.k = i.k and l.n = m.loc;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason)
    select gen_random_uuid(), v_org, l.id, m.id, 'adjustment', -20, v_today - 20, 'Kiểm kê: hao hụt cám do chuột, rơi vãi'
      from hp_loc l join hp_mat m on m.idx = 1 and m.loc = l.n where l.n = 1;
  insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
    select gen_random_uuid(), v_org, b.id, b.d + case when b.rnd = 1 then 10 else 20 end,
           round(b.total * case when b.rnd = 1 then 1 else (array[1, 0.5, 0])[1 + (b.k + b.sup) % 3] end)::bigint, 'transfer', 'Dữ liệu mẫu heo'
      from hp_bill b where b.rnd = 1 or (b.k + b.sup) % 3 <> 2;

  -- =============================================================== XUẤT CHUỒNG (thu hoạch), DOANH THU, CÔNG NỢ PHẢI THU
  create temp table hp_h (id uuid default gen_random_uuid(), cycle_id uuid, k int, c int, slotno int, n int, d date, heads int, avg numeric, qty numeric, cust int, price bigint, amount bigint) on commit drop;
  -- một đợt: vụ "tốt", "bệnh" và vụ đang chạy ở cuối lứa; hai đợt: vụ "xuất chia hai đợt"
  insert into hp_h (cycle_id, k, c, slotno, n, d, price)
    select y.id, y.k, y.c, y.slotno, 1,
           case when y.status = 'active' then y.start_d + 123 when y.sc = 'good' then y.start_d + 124 when y.sc = 'disease' then y.start_d + 128 else y.start_d + 120 end,
           (case when y.status = 'active' then 65000 when y.sc = 'good' then 66000 when y.sc = 'disease' then 50000 + ((y.k * y.c) % 3) * 4000 else 68000 end) + y.k * 500 + y.c * 200
      from hp_cyc y where (y.status = 'ended' or (y.status = 'active' and y.start_d + 123 <= v_today - 1));
  insert into hp_h (cycle_id, k, c, slotno, n, d, price)
    select y.id, y.k, y.c, y.slotno, 2, y.start_d + 127, 61000 + y.k * 500 + y.c * 200
      from hp_cyc y where y.status = 'ended' and y.sc = 'split';
  update hp_h h set heads = case when h.n = 1 and y.sc = 'split' then round(0.55 * left_h)::int
                                  when h.n = 1 and y.status = 'active' then round(0.6 * left_h)::int
                                  when h.n = 2 then left_h - round(0.55 * left_h)::int
                                  else left_h end,
                    avg = round(20 + (h.d - y.in_d) * 0.74 * y.f, 1)
    from hp_cyc y, lateral (select y.heads - coalesce((select sum(e.qty) from hp_ev e where e.cycle_id = y.id), 0) as left_h) z
   where y.id = h.cycle_id;
  update hp_h set qty = round(heads * avg, 1), cust = 1 + (k + c + n + slotno) % 5;
  update hp_h set amount = round(qty * price)::bigint;
  insert into harvest_records (id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note, unit_count)
    select id, v_org, cycle_id, (d + time '06:00') at time zone v_tz, null, qty, 'kg', null,
           'Xuất chuồng đợt ' || n || ': ' || heads || ' con, bình quân ' || avg || ' kg/con. Giấy kiểm dịch KD-' || to_char(d, 'YYMMDD') || '-' || c, heads
      from hp_h;
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, buyer_note, partner_id, invoice_no, due_date)
    select h.id, v_org, h.cycle_id, h.d, h.qty, 'kg', h.amount, p.name, p.id, 'BH-' || chr(64 + h.k) || h.c || '-' || h.slotno || '-' || h.n, h.d + case when h.cust % 2 = 0 then 15 else 7 end
      from hp_h h join hp_partner p on p.kind = 'cus' and p.idx = h.cust;
  -- thu tiền: khách số 4 (thương lái Tư Béo) luôn nợ; bán lâu thì đã thu đủ; vừa bán thì chưa thu hoặc thu một phần
  insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
    select gen_random_uuid(), v_org, h.id, h.d + 8,
           round(h.amount * case when v_today - h.d > 20 then 1 else 0.5 end)::bigint, 'transfer', 'Dữ liệu mẫu heo'
      from hp_h h where h.cust <> 4 and (v_today - h.d > 20 or (v_today - h.d > 8 and h.cust % 2 = 0));

  -- =============================================================== CHI PHÍ
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note, partner_id)
    select gen_random_uuid(), v_org, y.id, 'labor'::expense_category, 'cash_paid'::expense_kind,
           (y.heads * 200000 * (case when y.status = 'ended' then 1 else least(1, greatest(0, (v_today - 46 - y.start_d)::numeric / 128)) end))::bigint,
           case when y.status = 'ended' then least(y.start_d + 120, v_today - 1) else v_today - 46 end,
           case when y.status = 'ended' then 'Công chăm sóc, vệ sinh chuồng, xuất chuồng' else 'Công ghi tay giai đoạn trước 45 ngày gần nhất (45 ngày gần nhất tính theo chấm công)' end, null::uuid
      from hp_cyc y where (y.status = 'ended' or (y.status = 'active' and y.start_d < v_today - 46))   -- công trong 45 ngày gần nhất tính từ chấm công, không ghi tay trùng
    union all
    select gen_random_uuid(), v_org, y.id, 'utility', 'allocated', 6000000, least(y.start_d + 60, v_today - 1), 'Phân bổ điện, nước theo chuồng', null
      from hp_cyc y where y.status in ('ended', 'active') and y.start_d < v_today - 1
    union all
    select gen_random_uuid(), v_org, y.id, 'other', 'cash_paid', 3000000, least(y.in_d + 3, v_today - 1), 'Kiểm dịch, vận chuyển heo giống, thú y ngoài', null
      from hp_cyc y where y.status in ('ended', 'active') and y.in_d <= v_today - 1;
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note)
    select gen_random_uuid(), v_org, null::uuid, 'rent'::expense_category, 'cash_paid'::expense_kind, 20000000, v_today - 30 * m, '[Mẫu heo] Thuê đất trại tháng ' || to_char(v_today - 30 * m, 'MM/YYYY') from generate_series(0, 5) m
    union all
    select gen_random_uuid(), v_org, null, 'depreciation', 'allocated', 12000000, v_today - 30 * m, '[Mẫu heo] Khấu hao chuồng trại tháng ' || to_char(v_today - 30 * m, 'MM/YYYY') from generate_series(0, 5) m
    union all
    select gen_random_uuid(), v_org, null, 'other', 'cash_paid', 2500000 + m * 300000, v_today - 30 * m - 5, '[Mẫu heo] Chi phí quản lý, văn phòng' from generate_series(0, 5) m;

  -- =============================================================== LỊCH VACCINE (mốc nhắc), SỰ CỐ, ĐỊNH MỨC THỨC ĂN
  create temp table hp_ms (id uuid default gen_random_uuid(), cycle_id uuid, k int, c int, i int, title text, off int, due date, done boolean) on commit drop;
  insert into hp_ms (cycle_id, k, c, i, title, off)
    select y.id, y.k, y.c, v.i, v.title, v.off
      from hp_cyc y cross join (values (1, 'Tiêm mũi 1: dịch tả heo', 24), (2, 'Tiêm mũi 2: lở mồm long móng', 38), (3, 'Tiêm mũi 3: tai xanh (PRRS)', 52), (4, 'Tiêm nhắc lại: dịch tả heo', 66)) v (i, title, off)
     where y.slot <> 'P2';
  update hp_ms m set due = y.start_d + m.off, done = (y.start_d + m.off <= v_today - 1 and not (y.sc = 'sick' and m.i = 3) and not (y.k = 2 and y.c = 2 and y.slot = 'A1' and m.i = 2))
    from hp_cyc y where y.id = m.cycle_id;
  insert into cycle_milestones (id, cycle_id, organization_id, title, anchor, offset_days, note, done_at, done_by, done_name, kind, lot_no)
    select m.id, m.cycle_id, v_org, m.title, 'start', m.off, 'Mẫu tham khảo, thú y xác nhận',
           case when m.done then (m.due + time '09:00') at time zone v_tz end, case when m.done then v_user end,
           case when m.done then (select w.name from hp_worker w where w.k = m.k and w.idx = 1) end,
           'vaccine', case when m.done then 'VX-' || to_char(m.due, 'YYMM') || '-' || m.i || m.k end
      from hp_ms m;

  create temp table hp_inc (id uuid default gen_random_uuid(), cycle_id uuid, k int, kind text, d date, status text, deaths int, scn text) on commit drop;
  insert into hp_inc (cycle_id, k, kind, d, status, deaths, scn)
    select y.id, y.k, 'pest', y.in_d + 40, 'closed', coalesce((select sum(e.qty) from hp_ev e where e.cycle_id = y.id), 0), 'disease' from hp_cyc y where y.sc = 'disease'
    union all
    select y.id, y.k, 'pest', least(y.in_d + 35, v_today - 3), 'open', coalesce((select sum(e.qty) from hp_ev e where e.cycle_id = y.id), 0), 'sick' from hp_cyc y where y.sc = 'sick' and y.in_d + 10 <= v_today
    union all
    select y.id, y.k, 'weather', y.in_d + 60, 'closed', 0, 'weather' from hp_cyc y where y.sc = 'split' and y.k = 1 and y.c % 2 = 0;
  insert into cycle_incidents (id, cycle_id, organization_id, kind, incident_date, severity, description, loss_quantity, loss_amount, status, closed_at, closed_by, close_note, created_by)
    select i.id, i.cycle_id, v_org, i.kind, i.d,
           case i.scn when 'weather' then 'low' else 'high' end,
           case i.scn when 'disease' then 'Heo bỏ ăn, sốt, ho, thở khó. Nghi bệnh hô hấp; đã cách ly con bệnh và gọi thú y.'
                      when 'sick' then 'Một số heo bỏ ăn, tiêu chảy; lượng cám giảm. Đã báo thú y, đang theo dõi.'
                      else 'Nắng nóng kéo dài, heo giảm ăn, thở nhanh.' end,
           case when i.scn = 'weather' then null else i.deaths end, case when i.scn = 'weather' then null else i.deaths * 3200000 end,
           i.status, case when i.status = 'closed' then (i.d + 12 + time '16:00') at time zone v_tz end, case when i.status = 'closed' then v_user end,
           case when i.status = 'closed' then case i.scn when 'disease' then 'Đã điều trị khỏi, ngừng tử vong; bổ sung vaccine lứa sau.' else 'Đã lắp thêm quạt, phun sương; heo ăn lại bình thường.' end end,
           v_user
      from hp_inc i;
  insert into incident_actions (id, incident_id, cycle_id, organization_id, content, assignee_name, due_date, done, done_at, done_by, created_by)
    select gen_random_uuid(), i.id, i.cycle_id, v_org, a.content, (select w.name from hp_worker w where w.k = i.k and w.idx = 1),
           i.d + a.due, a.dn or i.status = 'closed',
           case when a.dn or i.status = 'closed' then (i.d + a.due + time '10:00') at time zone v_tz end, case when a.dn or i.status = 'closed' then v_user end, v_user
      from hp_inc i
      join (values ('disease', 'Cách ly con bệnh, điều trị theo toa thú y', 1, true), ('disease', 'Tăng cường sát trùng chuồng và hố sát trùng', 3, true),
                   ('sick', 'Cách ly con bệnh, điều trị theo toa thú y', 1, true), ('sick', 'Lấy mẫu gửi xét nghiệm', 3, false), ('sick', 'Rà soát lại thức ăn và nước uống', -29, false),
                   ('weather', 'Lắp thêm quạt, phun sương làm mát', 2, true)) a (scn, content, due, dn) on a.scn = i.scn;
  -- việc khắc phục "rà soát thức ăn" của vụ lệch phải QUÁ HẠN: hạn đặt ở quá khứ
  update incident_actions set due_date = v_today - 4 where content = 'Rà soát lại thức ăn và nước uống' and organization_id = v_org
     and incident_id in (select id from hp_inc);
  update incident_actions set due_date = v_today + 3 where content = 'Lấy mẫu gửi xét nghiệm' and organization_id = v_org and incident_id in (select id from hp_inc);

  -- định mức thức ăn theo ngày tuổi cho vụ đang chạy "bình thường" đã nhập heo (tuổi lúc nhập 60 ngày)
  insert into cycle_feed_plans (cycle_id, organization_id, age_at_start, window_kind, tolerance_pct, norms, updated_by)
    select y.id, v_org, 60, 'week', 20, '[{"from_day":60,"kg":0.95},{"from_day":90,"kg":1.45},{"from_day":130,"kg":2.1},{"from_day":160,"kg":2.6}]'::jsonb, v_user
      from hp_cyc y where y.status = 'active' and y.sc = 'normal' and y.in_d <= v_today - 5;

  -- =============================================================== CHẤM CÔNG (45 ngày gần nhất, gắn vụ đang chạy của phân khu)
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, d::date, ((d::date + time '06:30') at time zone v_tz) + ((w.n * 7 + extract(doy from d)::int) % 20) * interval '1 minute',
           ((d::date + time '15:30') at time zone v_tz), (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, 'confirmed'::attendance_status, 60, 480,
           a.id, (select y.id from hp_cyc y where y.k = w.k and y.status in ('ended', 'active') and d::date between y.start_d and y.start_d + 128
                   order by hashtext(y.id::text || w.id::text || d::text) limit 1), now()
      from hp_worker w join hp_area a on a.k = w.k
      cross join generate_series(v_today - 45, v_today - 2, interval '1 day') d
     where extract(dow from d) <> 0 and (w.n * 13 + extract(doy from d)::int * 7) % 100 >= 8;
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, break_minutes, approved_minutes, area_id, cycle_id, confirmed_at)
    select gen_random_uuid(), v_org, w.id, v_today - 1, ((v_today - 1 + time '06:30') at time zone v_tz), ((v_today - 1 + time '15:30') at time zone v_tz),
           (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, (case when w.n % 3 = 0 then 'needs_confirmation' else 'confirmed' end)::attendance_status, 60,
           case when w.n % 3 = 0 then null else 480 end, a.id,
           (select y.id from hp_cyc y where y.k = w.k and y.status = 'active' order by hashtext(y.id::text || w.id::text) limit 1),
           case when w.n % 3 = 0 then null else now() end
      from hp_worker w join hp_area a on a.k = w.k where extract(dow from v_today - 1) <> 0 and w.n % 11 <> 0;
  insert into attendance_records (id, organization_id, worker_id, work_date, started_at, source, status, break_minutes, area_id, cycle_id)
    select gen_random_uuid(), v_org, w.id, v_today, least(((v_today + time '06:35') at time zone v_tz), now() - interval '5 minutes'),
           (case when w.idx = 1 then 'admin' else 'team_leader' end)::attendance_source, 'open'::attendance_status, 60, a.id,
           (select y.id from hp_cyc y where y.k = w.k and y.status = 'active' order by hashtext(y.id::text || w.id::text) limit 1)
      from hp_worker w join hp_area a on a.k = w.k
     where w.n % 6 <> 4 and extract(dow from v_today) <> 0 and (now() at time zone v_tz)::time > time '07:00';

  alter table production_cycles enable trigger production_cycles_quota;
  alter table worker_teams enable trigger worker_teams_leader_guard;

  select count(*) into n_cnt from production_cycles where owner_org_id = v_org and code like 'MAUHEO-%';
  raise notice 'Đã nạp dữ liệu mẫu heo cho cơ sở %: 2 phân khu, 10 chuồng, 12 nhân sự, % vụ, % nhật ký, % lần xuất chuồng, % sự cố, % biến động số con.',
    v_org, n_cnt, (select count(*) from hp_log), (select count(*) from hp_h), (select count(*) from hp_inc), (select count(*) from hp_ev);
end $$;
