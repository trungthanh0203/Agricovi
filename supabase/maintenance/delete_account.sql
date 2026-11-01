-- XÓA MỘT TÀI KHOẢN VÀ TOÀN BỘ THÔNG TIN LIÊN QUAN để đăng ký lại từ đầu (xóa vĩnh viễn, KHÔNG hoàn tác được).
--
-- Xóa gồm:
--   · tài khoản đăng nhập (email bên dưới) và hồ sơ của tài khoản;
--   · MỌI CƠ SỞ mà tài khoản là chủ duy nhất (hộ hoặc HTX) cùng toàn bộ dữ liệu: khu, vụ, nhật ký, kho, chi phí, doanh thu, thu hoạch, nhân sự,
--     chấm công, công nợ, phiếu thu mua, quy trình mẫu, gói dịch vụ và thanh toán, hồ sơ website của cơ sở...;
--   · nếu là HTX: các hộ thành viên do HTX tạo ("do HTX quản lý") cũng bị xóa theo; hộ có tài khoản riêng chỉ bị gỡ khỏi HTX, giữ nguyên dữ liệu;
--   · tài khoản nhân viên và máy chấm công do cơ sở đó tạo (tài khoản số điện thoại);
--   · tư cách thành viên của tài khoản ở các cơ sở khác (dữ liệu của cơ sở khác giữ nguyên, chỉ bỏ liên kết tới người này);
--   · lời mời gửi tới email này.
-- KHÔNG xóa: danh mục dùng chung (cây trồng, loại việc, đơn vị, bảng gói), và dữ liệu của người khác.
--
-- CÁCH DÙNG (Supabase → SQL Editor):
--   1. Sửa v_email. Chạy lần đầu với v_confirm = 'KHONG': script chỉ LIỆT KÊ những gì sẽ bị xóa (xem ở thông báo/NOTICE), không xóa gì.
--   2. Kiểm tra danh sách. Đúng thì đổi v_confirm thành 'XOA-TAI-KHOAN' rồi chạy lại để xóa thật.
--   3. Sau đó đăng ký lại tài khoản trên app. Trên thiết bị đã dùng: xóa dữ liệu trang (hoặc gỡ app cài) để bỏ bản lưu offline cũ.
-- Nên sao lưu (Supabase → Database → Backups) trước khi xóa thật nếu có nghi ngờ. Không dùng cho tài khoản quản trị nền tảng (script từ chối).

create or replace function pg_temp.purge_rows(p_rel regclass, p_cond text, p_depth integer default 0) returns void
language plpgsql as $$
declare fk record; v_rel text := p_rel::text;
begin
  if p_depth > 14 then raise exception 'Chuỗi khóa ngoại quá sâu tại %', v_rel; end if;
  for fk in
    select c.conrelid::regclass as child, c.conrelid as child_oid, a.attname as ccol, ra.attname as rcol, c.confdeltype as del,
           a.attnotnull as notnull, cardinality(c.conkey) as ncols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = p_rel and n.nspname = 'public'
  loop
    if fk.ncols > 1 then raise exception 'Khóa ngoại nhiều cột tại %', fk.child; end if;
    if fk.child_oid = p_rel::oid then
      -- bảng tự tham chiếu (khu cha–ô, vụ nối tiếp...): gỡ liên kết trước khi xóa
      execute format('update %s set %I = null where %I in (select %I from %s where %s)', fk.child, fk.ccol, fk.ccol, fk.rcol, v_rel, p_cond);
    elsif p_rel = 'auth.users'::regclass and not fk.notnull then
      -- dấu vết "người tạo/người ghi" trong dữ liệu của cơ sở KHÁC: giữ dữ liệu, chỉ bỏ liên kết tới người bị xóa
      execute format('update %s set %I = null where %I in (select %I from %s where %s)', fk.child, fk.ccol, fk.ccol, fk.rcol, v_rel, p_cond);
    elsif fk.del in ('a', 'r', 'c') then
      perform pg_temp.purge_rows(fk.child, format('%I in (select %I from %s where %s)', fk.ccol, fk.rcol, v_rel, p_cond), p_depth + 1);
    end if;   -- 'n' (đặt rỗng) và 'd': để CSDL tự xử lý khi xóa dòng cha
  end loop;
  execute format('delete from %s where %s', v_rel, p_cond);
end $$;

do $$
declare
  -- ===== BẮT ĐẦU CẤU HÌNH =====
  v_email   constant text := 'nguyentruonggiang123@gmail.com';   -- tài khoản cần xóa
  v_confirm constant text := 'KHONG';                            -- 'KHONG' = chỉ xem trước; 'XOA-TAI-KHOAN' = xóa thật
  -- ===== HẾT CẤU HÌNH =====
  v_user uuid; v_orgs uuid[]; v_users uuid[]; v_staff uuid[]; r record; v_cnt bigint;
begin
  perform set_config('statement_timeout', '0', true);
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise notice 'Không có tài khoản nào với email % (có thể đã xóa rồi). Không làm gì.', v_email; return; end if;
  if exists (select 1 from platform_admins where user_id = v_user) or exists (select 1 from platform_roles where user_id = v_user) then
    raise exception 'DUNG LAI: % là tài khoản quản trị nền tảng, script này không xóa loại tài khoản đó.', v_email;
  end if;

  -- cơ sở mà tài khoản là chủ duy nhất: sẽ bị xóa (cơ sở còn chủ khác thì chỉ bỏ tài khoản này khỏi cơ sở)
  select coalesce(array_agg(o.id), '{}') into v_orgs
    from organizations o
   where exists (select 1 from organization_memberships m where m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[]))
     and not exists (select 1 from organization_memberships m where m.organization_id = o.id and m.user_id <> v_user and m.status = 'active' and 'owner' = any (m.roles::text[]));
  -- hộ do HTX tạo và quản lý
  v_orgs := v_orgs || coalesce(array(select o.id from organizations o where o.managed_by_org = any (v_orgs) and not (o.id = any (v_orgs))), '{}');

  -- tài khoản nhân viên và máy chấm công của các cơ sở đó
  select coalesce(array_agg(distinct x), '{}') into v_staff from (
    select s.user_id as x from staff_accounts s where s.organization_id = any (v_orgs)
    union select k.user_id from attendance_kiosks k where k.organization_id = any (v_orgs)) q;
  v_users := array[v_user] || v_staff;

  raise notice '=== SẼ XÓA tài khoản % (%) ===', v_email, v_user;
  raise notice 'Cơ sở bị xóa (% cơ sở):', coalesce(cardinality(v_orgs), 0);
  for r in select o.id, o.name, o.type, o.managed_by_org is not null as managed,
                  (select count(*) from production_cycles c where c.owner_org_id = o.id) as cycles,
                  (select count(*) from worker_profiles w where w.organization_id = o.id) as workers,
                  (select count(*) from organization_memberships m where m.organization_id = o.id) as members
             from organizations o where o.id = any (v_orgs) order by o.type, o.name loop
    raise notice '  - % [%]% — % vụ, % hồ sơ lao động, % thành viên', r.name, r.type, case when r.managed then ' (hộ do HTX quản lý)' else '' end, r.cycles, r.workers, r.members;
  end loop;
  raise notice 'Tài khoản nhân viên / máy chấm công bị xóa theo: %', coalesce(cardinality(v_staff), 0);
  select count(*) into v_cnt from organization_memberships m where m.user_id = v_user and not (m.organization_id = any (v_orgs));
  raise notice 'Cơ sở khác mà tài khoản chỉ là thành viên (chỉ gỡ liên kết, dữ liệu giữ nguyên): %', v_cnt;
  select count(*) into v_cnt from (select cooperative_org_id from cooperative_memberships where household_org_id = any (v_orgs)
    union all select household_org_id from cooperative_memberships where cooperative_org_id = any (v_orgs) and not (household_org_id = any (v_orgs))) q;
  raise notice 'Liên kết HTX–hộ bị gỡ: %', v_cnt;

  if v_confirm <> 'XOA-TAI-KHOAN' then
    raise notice '>>> CHỈ XEM TRƯỚC, CHƯA XÓA GÌ. Đúng danh sách thì đổi v_confirm thành XOA-TAI-KHOAN rồi chạy lại.';
    return;
  end if;

  -- tắt các trigger bảo vệ (nhật ký kho/thu tiền không xóa được, dấu vết kiểm toán...) trong lúc xóa; bật lại ở cuối
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table %s disable trigger user', r.t);
  end loop;

  perform pg_temp.purge_rows('organizations'::regclass, 'id = any (' || quote_literal(v_orgs::text) || '::uuid[])');
  -- nhật ký kiểm toán không có khóa ngoại: xóa dấu vết của các cơ sở đã xóa; ở cơ sở khác chỉ bỏ tên người thực hiện
  delete from audit_events where organization_id = any (v_orgs);
  update audit_events set actor_id = null where actor_id = any (v_users);
  delete from organization_invitations where lower(email) = lower(v_email);
  delete from cooperative_invitations where lower(email) = lower(v_email);
  perform pg_temp.purge_rows('auth.users'::regclass, 'id = any (' || quote_literal(v_users::text) || '::uuid[])');

  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table %s enable trigger user', r.t);
  end loop;

  raise notice 'ĐÃ XÓA tài khoản %, % cơ sở và % tài khoản nhân viên/máy chấm công. Có thể đăng ký lại từ đầu.', v_email, coalesce(cardinality(v_orgs), 0), coalesce(cardinality(v_staff), 0);
end $$;
