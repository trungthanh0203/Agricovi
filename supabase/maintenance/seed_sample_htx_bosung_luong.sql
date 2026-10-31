-- BỔ SUNG cho dữ liệu mẫu HTX đã nạp bằng seed_sample_htx.sql (không cần xóa và nạp lại):
--   1. Mỗi nhân sự mẫu thuộc ĐÚNG MỘT tổ, tổ thuộc đúng một phân khu (sửa nếu bị lệch); công chấm của người đó ghi đúng phân khu của tổ.
--   2. Đơn giá công theo giờ: nhân viên 30.000đ/giờ, tổ trưởng 35.000đ/giờ (ghi vào bảng đơn giá, thay các đơn giá giờ riêng cũ của những người này).
-- Chạy lại nhiều lần an toàn. Chỉ đụng nhân sự mẫu (số điện thoại bắt đầu 09119000). Dán vào Supabase → SQL Editor, sửa v_email nếu cần, bấm Run.

do $$
declare
  v_email    constant text := 'trungthanhfx23@gmail.com';
  v_org_name constant text := '';     -- để rỗng = tự chọn cơ sở HTX của tài khoản
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_org uuid; n_team int; n_rate int; n_att int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %.', v_email; end if;
  select o.id into v_org
    from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   where (v_org_name = '' or o.name = v_org_name)
   order by (o.type = 'cooperative') desc, o.created_at limit 1;
  if v_org is null then raise exception 'Không tìm thấy cơ sở của tài khoản %.', v_email; end if;
  if not exists (select 1 from worker_profiles where organization_id = v_org and phone like '09119000%') then
    raise exception 'Cơ sở này chưa có nhân sự mẫu. Hãy chạy seed_sample_htx.sql trước.';
  end if;

  -- 1. Mỗi người mẫu đúng một tổ: số thứ tự n (1..50) → phân khu (n-1)/10+1; xóa các tổ khác của người đó, thêm tổ đúng nếu thiếu
  create temp table smp_fix (wid uuid, tid uuid, leader boolean) on commit drop;
  insert into smp_fix
    select w.id, t.id, ((right(w.phone, 5)::int - 1) % 10 = 0)
      from worker_profiles w
      join production_areas a on a.organization_id = v_org and a.code = 'MAU-PK' || (((right(w.phone, 5)::int - 1) / 10) + 1)
      join worker_teams t on t.organization_id = v_org and t.area_id = a.id and t.description like 'Dữ liệu mẫu%'
     where w.organization_id = v_org and w.phone like '09119000%';
  delete from worker_team_memberships m using smp_fix f where m.worker_id = f.wid and m.team_id <> f.tid;
  insert into worker_team_memberships (team_id, worker_id, valid_from)
    select f.tid, f.wid, v_today - 300 from smp_fix f
     where not exists (select 1 from worker_team_memberships m where m.worker_id = f.wid and m.team_id = f.tid);
  get diagnostics n_team = row_count;
  -- tổ trưởng đúng người đầu tổ
  alter table worker_teams disable trigger worker_teams_leader_guard;
  update worker_teams t set leader_worker_id = f.wid from smp_fix f where f.tid = t.id and f.leader and t.leader_worker_id is distinct from f.wid;
  alter table worker_teams enable trigger worker_teams_leader_guard;
  -- công chấm ghi đúng phân khu của tổ
  update attendance_records ar set area_id = t.area_id from smp_fix f join worker_teams t on t.id = f.tid
   where ar.worker_id = f.wid and ar.area_id is distinct from t.area_id;
  get diagnostics n_att = row_count;

  -- 2. Đơn giá giờ: tổ trưởng 35.000, nhân viên 30.000
  delete from work_rates r using smp_fix f where r.worker_id = f.wid and r.rate_type = 'hour';
  insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from)
    select v_org, 'hour', f.wid, case when f.leader then 35000 else 30000 end, v_today - 365 from smp_fix f;
  get diagnostics n_rate = row_count;

  raise notice 'Đã cập nhật: % đơn giá giờ (tổ trưởng 35.000, nhân viên 30.000), % dòng công chấm sửa phân khu, % dòng tổ bổ sung.', n_rate, n_att, n_team;
end $$;
