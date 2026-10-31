-- DỮ LIỆU MẪU CHO HTX CÓ CÁC HỘ THÀNH VIÊN (HTX + 5 hộ): từ phân khu, quy trình, vụ, ghi việc, kho, chi phí đến thu hoạch, doanh thu,
-- cộng phần mới của mô hình HTX–hộ: hộ đồng ý chia sẻ, danh mục bao tiêu, PHIẾU THU MUA (công nợ HTX phải trả hộ / hộ phải thu HTX).
--
-- HỘ: dùng lại các hộ thành viên đang có của HTX (hộ do HTX tạo và hộ đã có tài khoản đã chấp nhận lời mời); nếu chưa đủ 5 hộ thì TẠO THÊM hộ do HTX quản lý
-- tên "Hộ mẫu ..." cho đủ 5. Nếu HTX có hơn 5 hộ thì dùng 5 hộ đầu tiên (theo ngày tham gia).
-- MỖI HỘ: 1 phân khu + 2 nhà màng + 1 kho + 8 vật tư (nhập kho có hóa đơn, xuất theo việc, tồn) + 2 nhà cung ứng (công nợ phải trả) + 6 vụ
--   (mỗi nhà màng 3 vụ nối tiếp: đã kết thúc, đang sản xuất, đang chuẩn bị). Hộ do HTX quản lý: mọi vụ là "vụ theo HTX". Hộ có tài khoản riêng:
--   vụ đã kết thúc là "vụ riêng" của hộ (từ lúc dùng thử, bán một phần cho HTX, một phần cho khách của hộ), vụ đang chạy và chuẩn bị là "vụ theo HTX".
-- NHẬT KÝ ghi cho mọi việc ĐÃ THỰC HIỆN XONG (việc lặp ghi từng lần) và xuất vật tư tương ứng.
-- HTX: danh mục bao tiêu (dưa lưới), quy trình mẫu (mẫu hệ thống + quy trình riêng), 3 khách hàng, doanh thu bán lô hàng thu mua + công nợ phải thu.
-- PHIẾU THU MUA: mỗi phiếu thu hoạch được HTX thu mua (hộ có tài khoản riêng: 60% sản lượng của vụ riêng, phần còn lại hộ bán cho khách của hộ);
--   trả tiền theo tuổi phiếu (cũ: đã trả đủ; vừa: trả một phần; mới: chưa trả; hộ thứ 5 luôn còn nợ nặng, có phiếu quá hạn).
--
-- Dữ liệu của chính HTX (nhân sự, tổ, chấm công, kho HTX...) làm bằng seed_sample_htx.sql (cùng email). File này độc lập, chạy trước hay sau đều được.
-- LƯU Ý: không tạo được tài khoản đăng nhập bằng SQL; muốn thử đăng nhập của hộ do HTX tạo hãy dùng nút "Cấp tài khoản đăng nhập cho hộ" trong app.
-- Hộ có tài khoản riêng: file KHÔNG đổi việc đồng ý chia sẻ của hộ (chỉ tạo nếu chưa có, mặc định chưa chia sẻ); hộ do HTX tạo thì bật chia sẻ.
--
-- CÁCH DÙNG: Supabase → SQL Editor, dán toàn bộ, sửa v_email nếu cần, Run. Chạy lại: đã có dữ liệu mẫu thì bỏ qua.
-- Xóa dữ liệu mẫu: đổi v_mode thành 'XOA' (chỉ xóa các dòng mẫu và các hộ "Hộ mẫu" do file này tạo; hộ có sẵn của bạn giữ nguyên).

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_email constant text := 'plaumai.tnb@gmail.com';   -- tài khoản chủ HTX
  v_mode  constant text := 'THEM';                    -- 'THEM' hoặc 'XOA'
  -- ===== HẾT CẤU HÌNH =====
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_coop uuid; v_crop uuid; v_sys uuid; v_sysver int; v_pid uuid;
  v_u_kg uuid; v_u_l uuid; v_u_pack uuid; v_u_piece uuid;
  v_n int; v_new int; i int;
  r record; s record; ph record;
  cur int; st int; en int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %. Hãy đăng ký app bằng email này trước.', v_email; end if;
  select o.id into v_coop
    from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   where o.type = 'cooperative' order by o.created_at limit 1;
  if v_coop is null then raise exception 'Tài khoản % chưa là chủ của hợp tác xã nào.', v_email; end if;
  perform set_config('statement_timeout', '0', true);
  perform set_config('agri.legacy_cycle_insert', 'on', true);
  perform set_config('agri.withdrawal_exempt', '1', true);

  -- =============================================================== XÓA
  if v_mode = 'XOA' then
    create temp table del_cyc (id uuid) on commit drop;
    create temp table del_part (id uuid) on commit drop;
    insert into del_cyc select id from production_cycles where code like 'MAUHO-%' and (owner_org_id = v_coop or owner_org_id in (select household_org_id from cooperative_memberships where cooperative_org_id = v_coop) or area_id in (select id from production_areas where code like 'MAUHO-%'));
    insert into del_part select id from partners where note like 'Dữ liệu mẫu hộ%' and (organization_id = v_coop or organization_id in (select household_org_id from cooperative_memberships where cooperative_org_id = v_coop));
    delete from procurement_payments where receipt_id in (select id from procurement_receipts where cooperative_org_id = v_coop and note like '%[Mẫu hộ]%');
    delete from procurement_receipts where cooperative_org_id = v_coop and note like '%[Mẫu hộ]%';
    alter table sale_receipts disable trigger sale_receipts_guard;
    delete from sale_receipts where sale_id in (select id from sales_records where cycle_id in (select id from del_cyc));
    alter table sale_receipts enable trigger sale_receipts_guard;
    delete from sales_records where cycle_id in (select id from del_cyc);
    delete from harvest_records where cycle_id in (select id from del_cyc);
    delete from expense_records where cycle_id in (select id from del_cyc);
    alter table bill_payments disable trigger bill_payments_guard;
    delete from bill_payments where bill_id in (select id from purchase_bills where partner_id in (select id from del_part));
    alter table bill_payments enable trigger bill_payments_guard;
    alter table inventory_transactions disable trigger inventory_txn_guard_mod;
    delete from inventory_transactions where cycle_id in (select id from del_cyc)
       or location_id in (select id from inventory_locations where description like 'Dữ liệu mẫu hộ%')
       or material_id in (select id from materials where description like 'Dữ liệu mẫu hộ%');
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from purchase_bills where partner_id in (select id from del_part);
    delete from activity_logs where cycle_id in (select id from del_cyc);
    delete from production_stages where cycle_id in (select id from del_cyc);
    delete from production_cycles where id in (select id from del_cyc);
    delete from material_lots where lot_no ~ '^H[0-9]-[1-8]$';
    delete from inventory_locations where description like 'Dữ liệu mẫu hộ%';
    delete from materials where description like 'Dữ liệu mẫu hộ%';
    delete from template_stages where template_id in (select id from cycle_templates where note like 'Dữ liệu mẫu hộ%');
    delete from template_phases where template_id in (select id from cycle_templates where note like 'Dữ liệu mẫu hộ%');
    delete from cycle_templates where note like 'Dữ liệu mẫu hộ%';
    delete from partners where id in (select id from del_part);
    delete from production_areas where code like 'MAUHO-%' and parent_id is not null;
    delete from production_areas where code like 'MAUHO-%';
    -- hộ do file này tạo: xóa hẳn (đã hết dữ liệu mẫu)
    delete from cooperative_memberships where cooperative_org_id = v_coop and household_org_id in (select id from organizations where managed_by_org = v_coop and name like 'Hộ mẫu %');
    delete from organizations where managed_by_org = v_coop and name like 'Hộ mẫu %';
    raise notice 'Đã xóa dữ liệu mẫu hộ của HTX %.', v_coop;
    return;
  end if;
  if v_mode <> 'THEM' then raise exception 'v_mode phải là THEM hoặc XOA'; end if;
  if exists (select 1 from production_areas where code like 'MAUHO-%' and organization_id in (select household_org_id from cooperative_memberships where cooperative_org_id = v_coop)) then
    raise notice 'HTX này đã có dữ liệu mẫu hộ, bỏ qua (muốn nạp lại hãy chạy XOA trước).'; return;
  end if;

  select id into v_crop from crop_types where code = 'melon';
  select id, version into v_sys, v_sysver from system_templates where code = 'melon_greenhouse';
  if v_crop is null or v_sys is null then raise exception 'Thiếu sản phẩm Dưa lưới hoặc mẫu hệ thống melon_greenhouse (cần đã db push đủ migration).'; end if;
  select id into v_u_kg from units_of_measure where organization_id is null and code = 'kg';
  select id into v_u_l from units_of_measure where organization_id is null and code = 'l';
  select id into v_u_pack from units_of_measure where organization_id is null and code = 'pack';
  select id into v_u_piece from units_of_measure where organization_id is null and code = 'piece';

  alter table production_cycles disable trigger production_cycles_quota;

  -- =============================================================== 5 HỘ: dùng hộ có sẵn, thiếu thì tạo
  create temp table smp_hh (k int, id uuid, name text, managed boolean) on commit drop;
  insert into smp_hh (k, id, name, managed)
    select (row_number() over (order by cm.joined_at nulls last, o.created_at))::int, o.id, o.name, coalesce(o.managed_by_org = v_coop, false)
      from cooperative_memberships cm join organizations o on o.id = cm.household_org_id
     where cm.cooperative_org_id = v_coop and cm.status = 'active'
     order by cm.joined_at nulls last, o.created_at limit 5;
  select count(*) into v_n from smp_hh;
  v_new := 5 - v_n;
  for i in 1 .. greatest(v_new, 0) loop
    declare v_id uuid; v_name text := 'Hộ mẫu ' || (array['Nguyễn Văn Ba', 'Trần Thị Cúc', 'Lê Văn Dũng', 'Phạm Thị Em', 'Võ Văn Phát'])[i];
    begin
      insert into organizations (type, name, created_by, managed_by_org) values ('household', v_name, v_user, v_coop) returning id into v_id;
      insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at) values (v_id, v_coop, 'active', now());
      insert into smp_hh (k, id, name, managed) values (v_n + i, v_id, v_name, true);
    end;
  end loop;
  raise notice 'Dùng % hộ có sẵn, tạo thêm % hộ.', v_n, greatest(v_new, 0);

  -- hộ do HTX quản lý: bật chia sẻ sản xuất; hộ có tài khoản riêng: giữ ý của hộ (chưa có thì mặc định chưa chia sẻ)
  insert into coop_data_sharing (household_org_id, cooperative_org_id, share_production, consented_by, consented_at)
    select h.id, v_coop, h.managed, case when h.managed then v_user end, case when h.managed then now() end from smp_hh h
  on conflict (household_org_id) do update set share_production = excluded.share_production, consented_by = excluded.consented_by, consented_at = excluded.consented_at, updated_at = now()
    where (select managed_by_org from organizations where id = coop_data_sharing.household_org_id) = v_coop;
  -- danh mục bao tiêu
  insert into coop_procurement_items (cooperative_org_id, crop_type_id, ref_price_per_kg, is_active) values (v_coop, v_crop, 26000, true)
    on conflict (cooperative_org_id, crop_type_id) do nothing;

  -- =============================================================== ĐỐI TÁC
  -- khách hàng của HTX (bán lô hàng đã thu mua)
  create temp table smp_cus (idx int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_cus (idx, name) values (1, 'Siêu thị Co.opmart (mẫu hộ)'), (2, 'Chợ đầu mối Thủ Đức (mẫu hộ)'), (3, 'Công ty Thực phẩm Sạch Việt (mẫu hộ)');
  insert into partners (id, organization_id, name, phone, goods, note, is_supplier, is_customer, customer_kind)
    select id, v_coop, name, '028' || (22340000 + idx * 211)::text, 'Dưa lưới thương phẩm', 'Dữ liệu mẫu hộ', false, true, (array['Siêu thị', 'Chợ đầu mối', 'Doanh nghiệp'])[idx] from smp_cus;
  -- nhà cung ứng (2) và khách (1) của từng hộ
  create temp table smp_hp (k int, kind text, idx int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_hp (k, kind, idx, name)
    select h.k, 'sup', 1, 'Đại lý Phân bón ' || chr(64 + h.k) from smp_hh h
    union all select h.k, 'sup', 2, 'Cửa hàng Thuốc BVTV và Giống ' || chr(64 + h.k) from smp_hh h
    union all select h.k, 'cus', 1, 'Thương lái ' || chr(64 + h.k) from smp_hh h;
  insert into partners (id, organization_id, name, phone, goods, note, is_supplier, is_customer, customer_kind)
    select p.id, h.id, p.name, '0909' || lpad((p.k * 100 + p.idx)::text, 6, '0'),
           case when p.kind = 'sup' then (array['Phân NPK, phân hữu cơ', 'Thuốc BVTV, hạt giống, vật tư'])[p.idx] else 'Dưa lưới' end,
           'Dữ liệu mẫu hộ', p.kind = 'sup', p.kind = 'cus', case when p.kind = 'cus' then 'Thương lái' end
      from smp_hp p join smp_hh h on h.k = p.k;

  -- =============================================================== VẬT TƯ (mỗi hộ 8 loại; có sẵn cùng tên thì dùng lại)
  create temp table smp_mat (k int, idx int, id uuid default gen_random_uuid(), name text, unit uuid, grp text, price bigint, wd int, sup int) on commit drop;
  insert into smp_mat (k, idx, name, unit, grp, price, wd, sup)
    select h.k, m.idx, m.name, m.unit, m.grp, m.price, m.wd, m.sup from smp_hh h cross join (values
      (1, 'Phân NPK 20-20-15', v_u_kg, 'fertilizer', 18000::bigint, null::int, 1), (2, 'Phân hữu cơ vi sinh', v_u_kg, 'fertilizer', 9000, null, 1),
      (3, 'Phân bón lá Growmore', v_u_kg, 'fertilizer', 95000, null, 1), (4, 'Thuốc trừ nấm Ridomil Gold', v_u_kg, 'pesticide', 420000, 7, 2),
      (5, 'Thuốc trừ sâu sinh học Bt', v_u_l, 'pesticide', 260000, 5, 2), (6, 'Hạt giống dưa lưới F1', v_u_pack, 'seed', 350000, null, 2),
      (7, 'Giá thể xơ dừa', v_u_kg, 'other', 3500, null, 1), (8, 'Dây treo và kẹp cây', v_u_piece, 'other', 1500, null, 2)) m (idx, name, unit, grp, price, wd, sup);
  update smp_mat m set id = e.id from materials e, smp_hh h where h.k = m.k and e.organization_id = h.id and e.name = m.name;
  insert into materials (id, organization_id, name, base_unit_id, material_group, reorder_threshold, withdrawal_days, description)
    select m.id, h.id, m.name, m.unit, m.grp, 20, m.wd, 'Dữ liệu mẫu hộ' from smp_mat m join smp_hh h on h.k = m.k
     where not exists (select 1 from materials e where e.id = m.id);

  -- =============================================================== PHÂN KHU, NHÀ MÀNG, KHO
  create temp table smp_area (k int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_area (k, name) select h.k, 'Phân khu ' || h.name from smp_hh h;
  insert into production_areas (id, organization_id, name, code, kind, area_size, area_unit, description)
    select a.id, h.id, a.name, 'MAUHO-H' || a.k, 'crop', 2000, 'm2', 'Dữ liệu mẫu hộ' from smp_area a join smp_hh h on h.k = a.k;
  create temp table smp_cell (k int, c int, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_cell (k, c, name) select h.k, c, 'Nhà màng H' || h.k || '-' || c from smp_hh h, generate_series(1, 2) c;
  insert into production_areas (id, organization_id, parent_id, name, code, kind, housing, area_size, area_unit, description)
    select ce.id, h.id, a.id, ce.name, 'MAUHO-H' || ce.k || '-NM' || ce.c, 'crop', 'Nhà màng', 1000, 'm2', 'Dữ liệu mẫu hộ'
      from smp_cell ce join smp_area a on a.k = ce.k join smp_hh h on h.k = ce.k;
  create temp table smp_loc (k int, id uuid default gen_random_uuid()) on commit drop;
  insert into smp_loc (k) select k from smp_hh;
  insert into inventory_locations (id, organization_id, name, description, area_ids)
    select l.id, h.id, 'Kho vật tư ' || h.name, 'Dữ liệu mẫu hộ', array[a.id] from smp_loc l join smp_hh h on h.k = l.k join smp_area a on a.k = l.k;

  -- =============================================================== QUY TRÌNH: HTX (cho vụ theo HTX) và hộ có tài khoản riêng (cho vụ riêng)
  create temp table smp_tpl (owner_org uuid, k int, kind text, id uuid default gen_random_uuid(), name text) on commit drop;
  insert into smp_tpl (owner_org, k, kind, name)
    select v_coop, 0, kd.kind, case kd.kind when 'sys' then 'Dưa lưới nhà màng – mẫu hệ thống (mẫu hộ)' else 'Dưa lưới nhà màng – quy trình riêng của HTX (mẫu hộ)' end from (values ('sys'), ('own')) kd (kind)
    union all
    select h.id, h.k, kd.kind, case kd.kind when 'sys' then 'Dưa lưới nhà màng – mẫu hệ thống (mẫu hộ)' else 'Dưa lưới nhà màng – quy trình riêng (mẫu hộ)' end
      from smp_hh h cross join (values ('sys'), ('own')) kd (kind) where not h.managed;
  insert into cycle_templates (id, organization_id, crop_type_id, name, note, is_active, source_system_id, source_version)
    select id, owner_org, v_crop, name,
           case kind when 'sys' then 'Dữ liệu mẫu hộ. Sao từ mẫu hệ thống Dưa lưới nhà màng (17 việc, 7 công đoạn).' else 'Dữ liệu mẫu hộ. Quy trình riêng: gộp bớt việc (10 việc), tổng 79 ngày như mẫu.' end,
           true, case when kind = 'sys' then v_sys end, case when kind = 'sys' then v_sysver end
      from smp_tpl;
  create temp table smp_ph (tpl uuid, seq int, id uuid) on commit drop;
  for r in select * from smp_tpl loop
    for ph in select * from system_template_phases where system_template_id = v_sys order by seq loop
      insert into template_phases (template_id, organization_id, seq, code, name, description) values (r.id, r.owner_org, ph.seq, ph.code, ph.name, ph.description) returning id into v_pid;
      insert into smp_ph values (r.id, ph.seq, v_pid);
      if r.kind = 'sys' then
        insert into template_stages (template_id, organization_id, seq, name, duration_days, note, work_type_id, phase_id, importance, start_day, repeat_every_days, guide, materials)
          select r.id, r.owner_org, x.seq, wt.name, x.duration_days, x.note, x.work_type_id, v_pid, x.importance, x.start_day, x.repeat_every_days, x.guide, coalesce(x.materials, '[]'::jsonb)
            from system_template_stages x join work_types wt on wt.id = x.work_type_id where x.system_template_id = v_sys and x.phase_id = ph.id;
      end if;
    end loop;
    if r.kind = 'own' then
      insert into template_stages (template_id, organization_id, seq, name, duration_days, work_type_id, phase_id, importance, start_day, repeat_every_days, materials)
        select r.id, r.owner_org, d.seq, wt.name, d.dur, wt.id, (select id from smp_ph where tpl = r.id and seq = d.pseq), d.imp, d.sd, d.rep, '[]'::jsonb
          from (values (1, 1, 'substrate_prep', 7, 1, null::int, 'high'), (2, 2, 'irrigation', 14, 8, 1, 'normal'), (3, 3, 'transplanting', 10, 22, null, 'high'),
                       (4, 4, 'fertilizing', 10, 32, 5, 'high'), (4, 5, 'spraying', 10, 32, 7, 'normal'), (5, 6, 'pollination', 9, 42, 1, 'high'),
                       (6, 7, 'fertilizing', 22, 51, 5, 'high'), (6, 8, 'spraying', 22, 51, 7, 'high'), (6, 9, 'irrigation', 22, 51, 1, 'normal'),
                       (7, 10, 'harvesting', 7, 73, null, 'high')) d (pseq, seq, wcode, dur, sd, rep, imp)
          join work_types wt on wt.organization_id is null and wt.code = d.wcode;
    end if;
  end loop;

  -- =============================================================== VỤ (mỗi nhà màng: đã kết thúc, đang sản xuất, đang chuẩn bị)
  create temp table smp_cyc (id uuid default gen_random_uuid(), k int, c int, slot text, owner_org uuid, hh uuid, tpl uuid, start_d date, status cycle_status) on commit drop;
  insert into smp_cyc (k, c, slot, owner_org, hh, tpl, start_d, status)
    select ce.k, ce.c, sl.slot,
           case when sl.slot = 'ended' and not h.managed then h.id else v_coop end, h.id,
           (select t.id from smp_tpl t where t.owner_org = (case when sl.slot = 'ended' and not h.managed then h.id else v_coop end)
              and t.kind = case when ce.c % 2 = 1 then 'sys' else 'own' end limit 1),
           case sl.slot when 'ended' then v_today - (125 + 8 * ce.k + 4 * ce.c)
                        when 'active' then v_today - ((array[12, 68])[ce.c] + ce.k - 1)
                        else v_today + (81 - ((array[12, 68])[ce.c] + ce.k - 1)) end,
           (case sl.slot when 'ended' then 'ended' when 'active' then 'active' else 'preparing' end)::cycle_status
      from smp_cell ce join smp_hh h on h.k = ce.k cross join (values ('ended'), ('active'), ('preparing')) sl (slot);
  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date, end_date, name, code, template_id, template_name,
                                 template_version, planted_area_m2, plant_count, variety_name, target_yield_kg, budget_amount, sowing_date, planting_date, note)
    select y.id, y.owner_org, ce.id, v_crop, y.status, y.start_d, y.start_d + 78, case when y.status = 'ended' then y.start_d + 78 end,
           'Dưa lưới ' || ce.name || ' – vụ ' || (case y.slot when 'ended' then 1 when 'active' then 2 else 3 end) || case when y.owner_org = v_coop then ' (theo HTX)' else ' (vụ riêng)' end,
           'MAUHO-H' || y.k || 'C' || y.c || '-V' || (case y.slot when 'ended' then 1 when 'active' then 2 else 3 end),
           tp.id, tp.name, 1, 1000, 2800, 'Dưa lưới Kim Cương F1', 5500, 55000000, y.start_d + 2, y.start_d + 21, 'Dữ liệu mẫu hộ'
      from smp_cyc y join smp_cell ce on ce.k = y.k and ce.c = y.c join cycle_templates tp on tp.id = y.tpl;
  for r in select id, start_d, tpl, owner_org from smp_cyc loop
    cur := 1;
    for s in select t.*, p.code as p_code, p.name as p_name from template_stages t left join template_phases p on p.id = t.phase_id where t.template_id = r.tpl order by t.seq loop
      st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
      insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end, work_type_id, template_stage_id, duration_days, note,
                                     phase_code, phase_name, importance, repeat_every_days, guide, materials)
        values (r.id, r.owner_org, s.name, s.seq, r.start_d + st - 1, r.start_d + en - 1, s.work_type_id, s.id, s.duration_days, s.note,
                s.p_code, s.p_name, s.importance, s.repeat_every_days, s.guide, s.materials);
      if s.start_day is null then cur := en + 1; end if;
    end loop;
  end loop;
  update production_stages ps set
      status = case when y.status = 'ended' or ps.planned_end < v_today then 'done' when ps.planned_start <= v_today then 'in_progress' else 'pending' end,
      actual_start = case when y.status = 'ended' or ps.planned_start <= v_today then ps.planned_start end,
      actual_end = case when y.status = 'ended' or ps.planned_end < v_today then ps.planned_end end
    from smp_cyc y where y.id = ps.cycle_id and y.status in ('ended', 'active');

  -- =============================================================== NHẬT KÝ VIỆC (các việc đã thực hiện xong)
  create temp table smp_log (id uuid default gen_random_uuid(), cycle_id uuid, stage_id uuid, wt_id uuid, wcode text, sname text, k int, owner_org uuid, d date) on commit drop;
  insert into smp_log (cycle_id, stage_id, wt_id, wcode, sname, k, owner_org, d)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.owner_org, g::date
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, (ps.repeat_every_days || ' days')::interval) g
     where ps.status in ('done', 'in_progress') and ps.repeat_every_days is not null and ps.planned_start <= v_today - 1;
  insert into smp_log (cycle_id, stage_id, wt_id, wcode, sname, k, owner_org, d)
    select ps.cycle_id, ps.id, ps.work_type_id, wt.code, ps.name, y.k, y.owner_org, ps.planned_end
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
     where ps.status = 'done' and ps.repeat_every_days is null;
  insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at, source, data, note, author_name)
    select l.id, l.owner_org, l.cycle_id, l.wt_id, l.stage_id, (l.d + time '08:30') at time zone v_tz, 'online', '{}'::jsonb, 'Đã hoàn thành: ' || l.sname, 'Chủ ' || h.name
      from smp_log l join smp_hh h on h.k = l.k;

  -- =============================================================== KHO của hộ: xuất theo việc, nhập có hóa đơn, tồn; công nợ phải trả nhà cung ứng
  create temp table smp_issue (id uuid default gen_random_uuid(), log_id uuid, cycle_id uuid, k int, mat int, qty numeric, d date) on commit drop;
  insert into smp_issue (log_id, cycle_id, k, mat, qty, d)
    select l.id, l.cycle_id, l.k,
           case l.wcode when 'fertilizing' then (array[3, 1, 2])[1 + extract(doy from l.d)::int % 3] when 'spraying' then (array[4, 5])[1 + extract(doy from l.d)::int % 2]
                        when 'substrate_prep' then 7 when 'tray_sowing' then 6 when 'trellising' then 8 end,
           case l.wcode when 'fertilizing' then (array[2, 25, 40])[1 + extract(doy from l.d)::int % 3] when 'spraying' then 1.2 when 'substrate_prep' then 900
                        when 'tray_sowing' then 3 when 'trellising' then 1500 end, l.d
      from smp_log l where l.wcode in ('fertilizing', 'spraying', 'substrate_prep', 'tray_sowing', 'trellising');
  create temp table smp_rcpt (id uuid default gen_random_uuid(), k int, mat int, sup int, qty numeric, cost bigint, d date, bill_id uuid) on commit drop;
  insert into smp_rcpt (k, mat, sup, qty, cost, d)
    select i.k, i.mat, m.sup, ceil(sum(i.qty) * 1.25 + 5), m.price, v_today - 215
      from smp_issue i join smp_mat m on m.k = i.k and m.idx = i.mat group by i.k, i.mat, m.sup, m.price;
  create temp table smp_bill (id uuid default gen_random_uuid(), k int, sup int, d date, total bigint) on commit drop;
  insert into smp_bill (k, sup, d, total) select k, sup, min(d), sum((qty * cost)::bigint) from smp_rcpt group by k, sup;
  update smp_rcpt rc set bill_id = b.id from smp_bill b where b.k = rc.k and b.sup = rc.sup;
  insert into purchase_bills (id, organization_id, partner_id, invoice_no, bill_date, due_date, total_amount, note)
    select b.id, h.id, p.id, 'HD-H' || b.k || '-' || b.sup, b.d, b.d + 30, b.total, 'Dữ liệu mẫu hộ'
      from smp_bill b join smp_hh h on h.k = b.k join smp_hp p on p.k = b.k and p.kind = 'sup' and p.idx = b.sup;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, bill_id, lot_no, lot_expiry)
    select rc.id, h.id, l.id, m.id, 'receipt', rc.qty, rc.cost, rc.d, rc.bill_id, 'H' || rc.k || '-' || rc.mat, case when rc.mat <= 5 then v_today + 300 end
      from smp_rcpt rc join smp_hh h on h.k = rc.k join smp_mat m on m.k = rc.k and m.idx = rc.mat join smp_loc l on l.k = rc.k;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, cycle_id, activity_log_id)
    select i.id, h.id, l.id, m.id, 'issue', -i.qty, m.price, i.d, i.cycle_id, i.log_id
      from smp_issue i join smp_hh h on h.k = i.k join smp_mat m on m.k = i.k and m.idx = i.mat join smp_loc l on l.k = i.k;
  insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
    select gen_random_uuid(), h.id, b.id, b.d + 20, round(b.total * (array[1, 0.5, 0])[1 + (b.k + b.sup) % 3])::bigint, 'transfer', 'Dữ liệu mẫu hộ'
      from smp_bill b join smp_hh h on h.k = b.k where (b.k + b.sup) % 3 <> 2;

  -- =============================================================== THU HOẠCH
  create temp table smp_h (id uuid default gen_random_uuid(), cycle_id uuid, k int, c int, n int, owner_org uuid, d date, qty numeric, to_coop boolean, price bigint, amount bigint, cust int) on commit drop;
  insert into smp_h (cycle_id, k, c, n, owner_org, d, qty)
    select ps.cycle_id, y.k, y.c, (row_number() over (partition by ps.cycle_id order by g))::int, y.owner_org, g::date, round((330 + random() * 160)::numeric, 1)
      from production_stages ps join smp_cyc y on y.id = ps.cycle_id join work_types wt on wt.id = ps.work_type_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, interval '1 day') g
     where wt.code = 'harvesting' and ps.status in ('done', 'in_progress') and ps.planned_start <= v_today - 1;
  -- vụ theo HTX: HTX thu mua toàn bộ; vụ riêng của hộ: 60% sản lượng bán cho HTX, còn lại hộ bán cho khách của hộ
  update smp_h set to_coop = (owner_org = v_coop) or (n % 5 < 3), price = 23000 + k * 400 + c * 200, cust = 1 + (k + c + n) % 3;
  update smp_h set amount = round(qty * price)::bigint;
  insert into harvest_records (id, organization_id, cycle_id, harvested_at, grade, quantity, unit, loss_quantity, note)
    select id, owner_org, cycle_id, (d + time '06:30') at time zone v_tz, case when n % 3 = 0 then 'B' else 'A' end, qty, 'kg', round((4 + random() * 8)::numeric, 1), 'Dữ liệu mẫu hộ' from smp_h;

  -- =============================================================== PHIẾU THU MUA HTX–HỘ + trả tiền
  create temp table smp_pr (id uuid default gen_random_uuid(), hid uuid, k int, d date, qty numeric, price bigint, amount bigint, cycle_id uuid, harvest_id uuid, n int, c int) on commit drop;
  insert into smp_pr (hid, k, d, qty, price, amount, cycle_id, harvest_id, n, c)
    select hh.id, h.k, h.d, h.qty, h.price, h.amount, h.cycle_id, h.id, h.n, h.c from smp_h h join smp_hh hh on hh.k = h.k where h.to_coop;
  insert into procurement_receipts (id, cooperative_org_id, household_org_id, cycle_id, crop_type_id, harvest_id, receipt_date, quantity, unit_price, amount, due_date, invoice_no, note)
    select p.id, v_coop, p.hid, p.cycle_id, v_crop, p.harvest_id, p.d, p.qty, p.price, p.amount, p.d + case when p.k = 5 then 10 when p.k % 2 = 0 then 15 else 30 end,
           'PM-H' || p.k || 'C' || p.c || '-' || p.n, 'Thu mua dưa lưới theo phiếu thu hoạch [Mẫu hộ]' from smp_pr p;
  -- hộ số 5 luôn còn nợ (quá hạn); phiếu cũ trả đủ; phiếu vừa trả một phần; phiếu mới chưa trả
  insert into procurement_payments (id, receipt_id, cooperative_org_id, household_org_id, paid_on, amount, method, note)
    select gen_random_uuid(), p.id, v_coop, p.hid, p.d + 12,
           round(p.amount * case when v_today - p.d > 45 then 1 else 0.5 end)::bigint, case when p.k % 2 = 0 then 'cash' else 'transfer' end, 'Dữ liệu mẫu hộ'
      from smp_pr p where p.k <> 5 and v_today - p.d > 14;

  -- =============================================================== DOANH THU
  -- (a) HTX bán lô hàng đã thu mua của vụ theo HTX cho 3 khách hàng của HTX
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, partner_id, invoice_no, due_date)
    select gen_random_uuid(), v_coop, h.cycle_id, h.d, h.qty, 'kg', round(h.qty * (h.price + 5000))::bigint, c.id, 'BH-H' || h.k || 'C' || h.c || '-' || h.n,
           h.d + case when h.cust % 2 = 0 then 15 else 30 end
      from smp_h h join smp_cus c on c.idx = h.cust where h.owner_org = v_coop;
  -- (b) hộ bán phần còn lại của vụ riêng cho khách của hộ
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, unit, amount, partner_id, invoice_no, due_date)
    select gen_random_uuid(), h.owner_org, h.cycle_id, h.d, h.qty, 'kg', round(h.qty * (h.price + 3000))::bigint, p.id, 'BL-H' || h.k || 'C' || h.c || '-' || h.n, h.d + 20
      from smp_h h join smp_hp p on p.k = h.k and p.kind = 'cus' and p.idx = 1 where not h.to_coop;
  insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
    select gen_random_uuid(), sr.organization_id, sr.id, sr.sold_date + 10,
           round(sr.amount * case when v_today - sr.sold_date > 50 then 1 else 0.6 end)::bigint, 'transfer', 'Dữ liệu mẫu hộ'
      from sales_records sr
     where sr.cycle_id in (select id from smp_cyc) and sr.partner_id is not null and v_today - sr.sold_date > 20
       and sr.partner_id not in (select id from smp_cus where idx = 3);   -- khách số 3 của HTX luôn còn nợ

  -- =============================================================== CHI PHÍ (theo chủ vụ)
  insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note)
    select gen_random_uuid(), y.owner_org, y.id, 'labor'::expense_category, 'cash_paid'::expense_kind, ((9 + (y.k + y.c) % 4) * 1000000 * case when y.status = 'ended' then 1 else 0.5 end)::bigint,
           case when y.status = 'ended' then y.start_d + 76 else least(y.start_d + 45, v_today - 1) end, 'Công chăm sóc, làm giàn, thu hoạch'
      from smp_cyc y where y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), y.owner_org, y.id, 'material', 'cash_paid', ((4 + y.k % 3) * 1000000)::bigint, y.start_d + 3, 'Mua vật tư đầu vụ'
      from smp_cyc y where y.status in ('ended', 'active')
    union all
    select gen_random_uuid(), y.owner_org, y.id, 'utility', 'allocated', 1500000, least(y.start_d + 60, v_today - 1), 'Phân bổ điện, nước theo diện tích nhà màng'
      from smp_cyc y where y.status in ('ended', 'active');

  alter table production_cycles enable trigger production_cycles_quota;
  raise notice 'Đã nạp mẫu: 5 hộ, % vụ, % nhật ký, % lần thu hoạch, % phiếu thu mua.', (select count(*) from smp_cyc), (select count(*) from smp_log), (select count(*) from smp_h), (select count(*) from smp_pr);
end $$;
