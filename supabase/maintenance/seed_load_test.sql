-- NẠP DỮ LIỆU GIẢ ĐỂ ĐO HIỆU NĂNG (Đợt 0 trong docs/PLAN_HIEU_NANG.md). CHỈ chạy trên dự án Supabase DÙNG THỬ, KHÔNG chạy trên dự án có người dùng thật.
-- Tạo MỘT cơ sở tên "ZZ_THU_TAI" (hộ) thuộc tài khoản của bạn, gồm (ở quy mô 1):
--   300 người làm · 10 phân khu · 30 vụ đang chạy · ~1.200 giai đoạn · 20.000 nhật ký việc · 3.000 thu hoạch · 2.000 lần bán · 6.000 chi phí
--   · 60 vật tư, 3 kho, ~10.000 giao dịch kho · ~85.000 lượt chấm công.
-- Mọi dòng gắn vào cơ sở này; chạy xong đăng nhập app bằng tài khoản của bạn, chọn cơ sở ZZ_THU_TAI để đo.
--
-- CÁCH DÙNG (chạy bằng tay trong Supabase → SQL Editor):
--   1. Sửa 3 dòng v_confirm, v_owner_email, v_part ngay dưới chữ "BẮT ĐẦU CẤU HÌNH".
--      v_confirm  : đổi KHONG thành TAO-DU-LIEU-THU (cho phép chạy).
--      v_owner_email: email tài khoản của bạn (đã đăng ký app).
--      v_part     : 0 = chạy tất cả một lần (nếu trình soạn thảo cho phép chạy lâu); hoặc chạy LẦN LƯỢT từng phần, mỗi lần một số:
--                   1 = cơ sở, người làm, phân khu, vụ, giai đoạn, vật tư  → 2 = nhật ký việc → 3 = thu hoạch, bán, chi phí → 4 = giao dịch kho
--                   → 5 = chấm công (nửa đầu) → 6 = chấm công (nửa sau).   99 = XÓA toàn bộ dữ liệu thử tải này.
--   2. Bấm Run. Mỗi phần chạy được lại an toàn: phần đã có dữ liệu sẽ tự bỏ qua (không nhân đôi).
--   3. Đo xong, chạy lại với v_part = 99 để dọn.
-- Hệ số v_scale: 1 = như trên; 0.1 = một phần mười (thử nhanh).

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_confirm     constant text    := 'KHONG';                  -- ĐỔI thành 'TAO-DU-LIEU-THU' để cho phép chạy
  v_owner_email constant text    := 'email-cua-ban@...';      -- email tài khoản chủ cơ sở thử tải
  v_part        constant integer := 0;                        -- 0 = tất cả; 1..6 từng phần; 99 = dọn
  v_scale       constant numeric := 1;                        -- quy mô
  -- ===== HẾT CẤU HÌNH =====
  v_org_name constant text := 'ZZ_THU_TAI';
  v_user uuid; v_org uuid; v_unit uuid; v_crop uuid;
  n_workers int := greatest(3, round(300 * v_scale));
  n_areas int := greatest(2, round(10 * v_scale));
  n_cycles int := greatest(3, round(30 * v_scale));
  n_logs int := greatest(50, round(20000 * v_scale));
  n_harvest int := greatest(10, round(3000 * v_scale));
  n_sales int := greatest(10, round(2000 * v_scale));
  n_expense int := greatest(10, round(6000 * v_scale));
  n_materials int := greatest(5, round(60 * v_scale));
  n_receipts int := greatest(20, round(1500 * v_scale));
  n_issues int := greatest(60, round(8500 * v_scale));
  n_days int := greatest(10, round(330 * least(v_scale, 1)));
  v_cnt bigint;
  v_wt uuid[];
begin
  if v_confirm <> 'TAO-DU-LIEU-THU' then
    raise exception 'DUNG LAI: chua xac nhan. Doi KHONG thanh TAO-DU-LIEU-THU trong dong v_confirm neu that su muon nap du lieu gia.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(v_owner_email);
  if v_user is null then raise exception 'Khong tim thay tai khoan voi email %. Hay dang ky app bang email nay truoc.', v_owner_email; end if;
  perform set_config('statement_timeout', '0', true);
  perform set_config('agri.legacy_cycle_insert', 'on', true);   -- cho phép tạo vụ không qua quy trình mẫu (dữ liệu thử)

  select id into v_org from organizations where name = v_org_name and created_by = v_user;

  -- ---------------------------------------------------------------- 99: dọn
  if v_part = 99 then
    if v_org is null then raise notice 'Khong co du lieu thu tai de don.'; return; end if;
    delete from attendance_records where organization_id = v_org;
    alter table inventory_transactions disable trigger inventory_txn_guard_mod;   -- giao dịch kho thường không xóa được; riêng dữ liệu thử thì dọn
    delete from inventory_transactions where organization_id = v_org;
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from activity_logs where organization_id = v_org;
    delete from harvest_records where organization_id = v_org;
    delete from sales_records where organization_id = v_org;
    delete from expense_records where organization_id = v_org;
    delete from production_stages where organization_id = v_org;
    delete from production_cycles where owner_org_id = v_org;
    delete from materials where organization_id = v_org;
    delete from inventory_locations where organization_id = v_org;
    delete from worker_profiles where organization_id = v_org;
    delete from production_areas where organization_id = v_org;
    delete from organizations where id = v_org;
    raise notice 'Da don xong du lieu thu tai.';
    return;
  end if;

  select id into v_unit from units_of_measure where organization_id is null order by code limit 1;
  select id into v_crop from crop_types order by code limit 1;
  select array_agg(id) into v_wt from (select id from work_types where organization_id is null order by code limit 12) w;

  -- ---------------------------------------------------------------- 1: cơ sở, người làm, phân khu, vụ, giai đoạn, vật tư, kho
  if v_part in (0, 1) then
    if v_org is null then
      insert into organizations (type, name, created_by) values ('household', v_org_name, v_user) returning id into v_org;
      update subscriptions set max_cycles = 1000, period_end = now() + interval '1 year' where organization_id = v_org;   -- để thử không bị chặn hạn mức
    end if;
    select count(*) into v_cnt from worker_profiles where organization_id = v_org;
    if v_cnt = 0 then
      insert into worker_profiles (organization_id, full_name, phone)
        select v_org, 'Người làm ' || lpad(g::text, 3, '0'), '09' || lpad((10000000 + g)::text, 8, '0') from generate_series(1, n_workers) g;
      insert into production_areas (id, organization_id, name)
        select gen_random_uuid(), v_org, 'Phân khu ' || g from generate_series(1, n_areas) g;
      insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, name)
        select gen_random_uuid(), v_org, (select id from production_areas where organization_id = v_org order by name offset (g - 1) % n_areas limit 1),
               v_crop, 'active', current_date - (g * 7 % 300), 'Vụ thử ' || g
          from generate_series(1, n_cycles) g;
      insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end, status)
        select c.id, v_org, 'Việc ' || s, s, c.start_date + s * 3, c.start_date + s * 3 + 2, 'done'
          from production_cycles c, generate_series(1, 40) s where c.owner_org_id = v_org;
      insert into inventory_locations (organization_id, name) select v_org, 'Kho ' || g from generate_series(1, 3) g;
      insert into materials (organization_id, name, base_unit_id)
        select v_org, 'Vật tư thử ' || lpad(g::text, 3, '0'), v_unit from generate_series(1, n_materials) g;
      raise notice 'Phan 1 xong: % nguoi lam, % phan khu, % vu.', n_workers, n_areas, n_cycles;
    else raise notice 'Phan 1 da co du lieu, bo qua.'; end if;
  end if;
  if v_org is null then raise exception 'Chua co co so thu tai: hay chay phan 1 truoc.'; end if;

  -- ---------------------------------------------------------------- 2: nhật ký việc
  if v_part in (0, 2) then
    select count(*) into v_cnt from activity_logs where organization_id = v_org;
    if v_cnt = 0 then
      insert into activity_logs (id, organization_id, cycle_id, work_type_id, performed_at, note)
        select gen_random_uuid(), v_org, (select id from production_cycles where owner_org_id = v_org order by id offset (g % n_cycles) limit 1),
               v_wt[1 + g % array_length(v_wt, 1)], now() - (random() * n_days || ' days')::interval, 'Nhật ký thử tải số ' || g
          from generate_series(1, n_logs) g;
      raise notice 'Phan 2 xong: % nhat ky.', n_logs;
    else raise notice 'Phan 2 da co du lieu, bo qua.'; end if;
  end if;

  -- ---------------------------------------------------------------- 3: thu hoạch, bán, chi phí
  if v_part in (0, 3) then
    select count(*) into v_cnt from harvest_records where organization_id = v_org;
    if v_cnt = 0 then
      insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity)
        select gen_random_uuid(), v_org, (select id from production_cycles where owner_org_id = v_org order by id offset (g % n_cycles) limit 1),
               now() - (random() * n_days || ' days')::interval, round((50 + random() * 500)::numeric, 1)
          from generate_series(1, n_harvest) g;
      insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount)
        select gen_random_uuid(), v_org, (select id from production_cycles where owner_org_id = v_org order by id offset (g % n_cycles) limit 1),
               current_date - (random() * n_days)::int, round((20 + random() * 300)::numeric, 1), (500000 + random() * 20000000)::bigint
          from generate_series(1, n_sales) g;
      insert into expense_records (id, organization_id, cycle_id, category, amount, expense_date)
        select gen_random_uuid(), v_org, case when g % 4 = 0 then null else (select id from production_cycles where owner_org_id = v_org order by id offset (g % n_cycles) limit 1) end,
               (array['labor', 'utility', 'rent', 'other'])[1 + g % 4]::expense_category, (100000 + random() * 5000000)::bigint, current_date - (random() * n_days)::int
          from generate_series(1, n_expense) g;
      raise notice 'Phan 3 xong: % thu hoach, % ban, % chi phi.', n_harvest, n_sales, n_expense;
    else raise notice 'Phan 3 da co du lieu, bo qua.'; end if;
  end if;

  -- ---------------------------------------------------------------- 4: giao dịch kho (nhập trước, xuất sau)
  if v_part in (0, 4) then
    select count(*) into v_cnt from inventory_transactions where organization_id = v_org;
    if v_cnt = 0 then
      insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date)
        select gen_random_uuid(), v_org, (select id from inventory_locations where organization_id = v_org order by name limit 1), m.id, 'receipt', 1000000, 20000 + (random() * 80000)::int,
               current_date - n_days - 5
          from materials m where m.organization_id = v_org;
      insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date)
        select gen_random_uuid(), v_org, (select id from inventory_locations where organization_id = v_org order by name limit 1),
               (select id from materials where organization_id = v_org order by name offset (g % n_materials) limit 1), 'receipt', 100 + (random() * 900)::int,
               20000 + (random() * 80000)::int, current_date - (random() * n_days)::int
          from generate_series(1, n_receipts) g;
      insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason, issue_kind)
        select gen_random_uuid(), v_org, (select id from inventory_locations where organization_id = v_org order by name limit 1),
               (select id from materials where organization_id = v_org order by name offset (g % n_materials) limit 1), 'issue', -(1 + (random() * 20)::int),
               current_date - (random() * (n_days - 1))::int, 'Dữ liệu thử tải', 'other'
          from generate_series(1, n_issues) g;
      raise notice 'Phan 4 xong: % giao dich kho.', n_materials + n_receipts + n_issues;
    else raise notice 'Phan 4 da co du lieu, bo qua.'; end if;
  end if;

  -- ---------------------------------------------------------------- 5, 6: chấm công (nửa đầu / nửa sau số người làm)
  if v_part in (0, 5, 6) then
    for k in 0..1 loop
      continue when (v_part = 5 and k = 1) or (v_part = 6 and k = 0);
      select count(*) into v_cnt from attendance_records a join worker_profiles w on w.id = a.worker_id
       where a.organization_id = v_org and (abs(hashtext(w.id::text)) % 2) = k;
      if v_cnt = 0 then
        insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, source, status, approved_minutes, declared_minutes)
          select gen_random_uuid(), v_org, w.id, d::date, ((d::date + time '07:00') at time zone 'Asia/Ho_Chi_Minh') + (random() * interval '25 minutes'),
                 ((d::date + time '16:00') at time zone 'Asia/Ho_Chi_Minh'), 'admin', 'confirmed', 480, 480
            from worker_profiles w, generate_series(current_date - n_days, current_date - 1, interval '1 day') d
           where w.organization_id = v_org and (abs(hashtext(w.id::text)) % 2) = k and random() > 0.15;
        raise notice 'Phan cham cong nua % xong.', k;
      else raise notice 'Phan cham cong nua % da co du lieu, bo qua.', k; end if;
    end loop;
  end if;
end $$;
