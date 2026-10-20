-- XÓA HẾT DỮ LIỆU THỬ (tài khoản, cơ sở, vụ, nhật ký, kho, chi phí, ...) để làm lại từ đầu.
-- GIỮ LẠI: cây trồng/giống/loại việc dùng chung, đơn vị dùng chung, bảng gói (plan_tiers), cấu hình nền tảng (platform_settings).
-- KHÔNG xóa cấu trúc bảng, không đụng tới migration. Chạy MỘT LẦN trong Supabase → SQL Editor, bằng tay.
--
-- CÁCH DÙNG:
--   1. Đọc kỹ: sau khi chạy sẽ MẤT TẤT CẢ tài khoản, cơ sở và dữ liệu đã nhập. Không hoàn tác được.
--   2. Trong khối bên dưới, tìm dòng có chữ v_confirm, đổi chữ KHONG thành XOA-HET (giữ nguyên dấu nháy) rồi bấm Run.
--   3. Đăng ký lại tài khoản chủ cơ sở trên app. Muốn có tài khoản quản trị nền tảng thì thêm lại sau khi đăng ký:
--        insert into platform_admins (user_id) select id from auth.users where email = 'email-cua-ban@...';
--   4. Trên điện thoại/máy tính đã dùng app: xóa dữ liệu trang (hoặc gỡ app cài) để bỏ bản lưu offline cũ.
-- Nếu sau này thêm bảng dùng chung mới (danh mục do nền tảng cấp), phải thêm vào danh sách GIỮ LẠI bên dưới.

do $$
declare
  v_confirm constant text := 'KHONG';   -- ĐỔI thành 'XOA-HET' để cho phép chạy
  v_tenant text;
begin
  if v_confirm <> 'XOA-HET' then
    raise exception 'DUNG LAI: chua xac nhan. Doi KHONG thanh XOA-HET trong dong v_confirm neu that su muon xoa het du lieu.';
  end if;

  -- 1. Chụp lại dữ liệu dùng chung (lệnh TRUNCATE ... CASCADE bên dưới sẽ xóa cả các bảng này vì chúng có khóa ngoại tới tổ chức)
  create temp table k_crop_types      on commit drop as select * from crop_types;
  create temp table k_crop_varieties  on commit drop as select * from crop_varieties;
  create temp table k_crop_profiles   on commit drop as select * from crop_profiles;
  create temp table k_work_types      on commit drop as select * from work_types where organization_id is null;
  create temp table k_task_templates  on commit drop as select * from task_templates;
  create temp table k_units           on commit drop as select * from units_of_measure where organization_id is null;
  create temp table k_plan_tiers      on commit drop as select * from plan_tiers;
  create temp table k_settings        on commit drop as select * from platform_settings;

  -- 2. Xóa dữ liệu của mọi bảng còn lại trong schema public
  select string_agg(format('%I.%I', schemaname, tablename), ', ') into v_tenant
    from pg_tables
   where schemaname = 'public'
     and tablename not in ('crop_types', 'crop_varieties', 'crop_profiles', 'work_types', 'task_templates',
                           'units_of_measure', 'plan_tiers', 'platform_settings');
  execute 'truncate table ' || v_tenant || ' restart identity cascade';

  -- 3. Khôi phục dữ liệu dùng chung (thứ tự theo khóa ngoại)
  insert into crop_types      select * from k_crop_types      on conflict do nothing;
  insert into crop_varieties  select * from k_crop_varieties  on conflict do nothing;
  insert into crop_profiles   select * from k_crop_profiles   on conflict do nothing;
  insert into work_types      select * from k_work_types      on conflict do nothing;
  insert into task_templates  select * from k_task_templates  on conflict do nothing;
  insert into units_of_measure select * from k_units          on conflict do nothing;
  insert into plan_tiers      select * from k_plan_tiers      on conflict do nothing;
  insert into platform_settings (key, value, description, updated_at, updated_by)
    select key, value, description, updated_at, null from k_settings on conflict do nothing;

  -- 4. Xóa tài khoản đăng nhập (các bảng của app đã trống nên không còn khóa ngoại chặn)
  delete from auth.users;

  raise notice 'Da xoa het du lieu. Hay dang ky lai tai khoan chu co so tren app.';
end $$;
