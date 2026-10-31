-- Đợt 4 (D143): attendance_summary 24 giây trên 85.000 lượt chấm công do kiểm quyền từng dòng (security invoker).
-- Quản trị nhân sự (is_workforce_admin) đi đường nhanh bỏ qua kiểm quyền từng dòng (đã kiểm một lần); tổ trưởng/người làm vẫn đi đường cũ (chỉ thấy người của mình).
-- Kết quả không đổi. Thêm chỉ mục cho ca đang mở và lọc ảnh theo khoảng thời gian.

create index if not exists attendance_open_org_idx on attendance_records (organization_id) where ended_at is null and status <> 'rejected';

create or replace function attendance_summary_core(p_org uuid, p_day date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare m0 date := date_trunc('month', p_day)::date;
begin
  return jsonb_build_object(
    'workers', (select count(*) from worker_profiles where organization_id = p_org and status = 'active'),
    'present', (select count(distinct worker_id) from attendance_records where organization_id = p_org and work_date = p_day and status <> 'rejected'),
    'in_shift', (select count(*) from attendance_records where organization_id = p_org and ended_at is null and status <> 'rejected'),
    'stale', (select count(*) from attendance_records where organization_id = p_org and ended_at is null and status <> 'rejected' and work_date < vn_today()),
    'done', (select count(*) from attendance_records where organization_id = p_org and work_date = p_day and ended_at is not null and status <> 'rejected'),
    'pending', (select count(*) from attendance_records where organization_id = p_org and status = 'needs_confirmation' and ended_at is not null),
    'flagged', (select count(*) from attendance_photos where organization_id = p_org and photo is not null
                  and taken_at >= (p_day::timestamp at time zone 'Asia/Ho_Chi_Minh') and taken_at < ((p_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')),
    'flagged_week', (select count(*) from attendance_photos where organization_id = p_org and photo is not null
                       and taken_at >= ((p_day - 6)::timestamp at time zone 'Asia/Ho_Chi_Minh') and taken_at < ((p_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')),
    'month_minutes', coalesce((select sum(approved_minutes) from attendance_records
                                where organization_id = p_org and status = 'confirmed' and work_date >= m0 and work_date < (m0 + interval '1 month')::date), 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'minutes', t.m) order by t.m desc)
                       from (select w.full_name as name, sum(a.approved_minutes) as m
                               from attendance_records a join worker_profiles w on w.id = a.worker_id
                              where a.organization_id = p_org and a.status = 'confirmed' and a.work_date >= m0 and a.work_date < (m0 + interval '1 month')::date
                              group by w.id, w.full_name order by m desc limit 8) t), '[]'::jsonb));
end $$;

create or replace function attendance_summary_fast(p_org uuid, p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN'; end if;
  return attendance_summary_core(p_org, p_day);
end $$;

create or replace function attendance_summary(p_org uuid, p_day date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if is_workforce_admin(p_org) then return attendance_summary_fast(p_org, p_day); end if;
  return attendance_summary_core(p_org, p_day);
end $$;

revoke execute on function attendance_summary_core(uuid, date), attendance_summary_fast(uuid, date) from public, anon;
grant execute on function attendance_summary_core(uuid, date), attendance_summary_fast(uuid, date), attendance_summary(uuid, date) to authenticated;
