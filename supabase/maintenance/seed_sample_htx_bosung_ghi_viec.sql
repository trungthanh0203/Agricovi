-- BỔ SUNG nhật ký ghi việc cho các vụ MẪU đã kết thúc và đang sản xuất (dữ liệu từ seed_sample_htx.sql).
-- Chỉ thêm phần còn THIẾU, không nhân đôi: việc đã xong mà chưa có nhật ký thì thêm 1 nhật ký (ngày kết thúc việc);
-- việc lặp (tưới, bón, phun...) thì thêm nhật ký cho những lần chưa ghi. Đồng thời đặt lại trạng thái việc theo thời gian hiện tại
-- (vụ đã kết thúc: mọi việc xong; vụ đang sản xuất: việc có hạn trước hôm nay là xong, đang trong hạn là đang làm).
-- Chạy lại nhiều lần an toàn. Kết quả hiện ở thông báo cuối (số nhật ký trước/sau). Dán vào Supabase → SQL Editor, sửa v_email nếu cần, bấm Run.
-- Ghi chú: script này chỉ thêm nhật ký việc, không thêm xuất kho vật tư (số tồn kho giữ nguyên).

do $$
declare
  v_email    constant text := 'trungthanhfx23@gmail.com';
  v_org_name constant text := '';     -- để rỗng = tự chọn cơ sở HTX của tài khoản
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_user uuid; v_org uuid; n_before int; n_after int; n_cyc int; n_stage_fix int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %.', v_email; end if;
  select o.id into v_org
    from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   where (v_org_name = '' or o.name = v_org_name)
   order by (o.type = 'cooperative') desc, o.created_at limit 1;
  if v_org is null then raise exception 'Không tìm thấy cơ sở của tài khoản %.', v_email; end if;
  select count(*) into n_cyc from production_cycles where owner_org_id = v_org and code like 'MAU-%' and status in ('ended', 'active');
  if n_cyc = 0 then raise exception 'Cơ sở này chưa có vụ mẫu đang chạy/đã kết thúc. Hãy chạy seed_sample_htx.sql trước.'; end if;

  select count(*) into n_before from activity_logs l join production_cycles c on c.id = l.cycle_id where c.owner_org_id = v_org and c.code like 'MAU-%';

  -- 1. trạng thái việc theo thời gian hiện tại (chỉ vụ mẫu đã kết thúc / đang sản xuất)
  update production_stages ps set
      status = case when c.status = 'ended' or ps.planned_end < v_today then 'done' when ps.planned_start <= v_today then 'in_progress' else 'pending' end,
      actual_start = case when c.status = 'ended' or ps.planned_start <= v_today then ps.planned_start end,
      actual_end = case when c.status = 'ended' or ps.planned_end < v_today then ps.planned_end end
    from production_cycles c
   where c.id = ps.cycle_id and c.owner_org_id = v_org and c.code like 'MAU-%' and c.status in ('ended', 'active')
     and (ps.status is distinct from (case when c.status = 'ended' or ps.planned_end < v_today then 'done' when ps.planned_start <= v_today then 'in_progress' else 'pending' end));
  get diagnostics n_stage_fix = row_count;

  -- 2. nhật ký còn thiếu
  create temp table smp_need (cycle_id uuid, stage_id uuid, wt_id uuid, sname text, d date, leader text) on commit drop;
  -- việc lặp: mỗi lần (từ ngày bắt đầu, cách nhau repeat_every_days, tới hết hạn hoặc hôm qua)
  insert into smp_need
    select ps.cycle_id, ps.id, ps.work_type_id, ps.name, g::date, null
      from production_stages ps join production_cycles c on c.id = ps.cycle_id
      cross join lateral generate_series(ps.planned_start::timestamp, least(ps.planned_end, v_today - 1)::timestamp, (ps.repeat_every_days || ' days')::interval) g
     where c.owner_org_id = v_org and c.code like 'MAU-%' and c.status in ('ended', 'active') and ps.status in ('done', 'in_progress')
       and ps.repeat_every_days is not null and ps.planned_start <= v_today - 1 and ps.work_type_id is not null;
  -- việc không lặp đã xong: 1 nhật ký vào ngày kết thúc
  insert into smp_need
    select ps.cycle_id, ps.id, ps.work_type_id, ps.name, ps.planned_end, null
      from production_stages ps join production_cycles c on c.id = ps.cycle_id
     where c.owner_org_id = v_org and c.code like 'MAU-%' and c.status in ('ended', 'active') and ps.status = 'done'
       and ps.repeat_every_days is null and ps.work_type_id is not null;
  -- người ghi: tổ trưởng của phân khu chứa nhà màng
  update smp_need n set leader = w.full_name
    from production_cycles c join production_areas ce on ce.id = c.area_id
         join worker_teams t on t.organization_id = v_org and t.area_id = ce.parent_id and t.description like 'Dữ liệu mẫu%'
         join worker_profiles w on w.id = t.leader_worker_id
   where c.id = n.cycle_id;
  insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at, source, data, note, author_name)
    select gen_random_uuid(), v_org, n.cycle_id, n.wt_id, n.stage_id, (n.d + time '08:30') at time zone v_tz, 'online', '{}'::jsonb, 'Đã hoàn thành: ' || n.sname, n.leader
      from smp_need n
     where not exists (select 1 from activity_logs l where l.stage_id = n.stage_id and l.voided_at is null
                         and (l.performed_at at time zone v_tz)::date = n.d);

  select count(*) into n_after from activity_logs l join production_cycles c on c.id = l.cycle_id where c.owner_org_id = v_org and c.code like 'MAU-%';
  raise notice 'Nhật ký của vụ mẫu: trước % → sau % (thêm % dòng); sửa trạng thái % việc.', n_before, n_after, n_after - n_before, n_stage_fix;
end $$;
