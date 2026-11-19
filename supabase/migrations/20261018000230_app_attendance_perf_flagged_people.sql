-- D203: (1) bảng công nhanh hơn khi cơ sở đông người (200 nhân viên × 30 ngày); (2) khung Cần xử lý hiện số NGƯỜI có ảnh nghi vấn.
--
-- (1) attendance_list chậm khi cơ sở đông người: với 6000 công (200 người × 30 ngày) mất 1,2–2,4 giây trên bản chạy thử. Đo cho thấy hai nguyên nhân:
--     (a) chính sách bảo mật hàng (RLS) của bảng công gọi hàm kiểm quyền cho TỪNG công (6000 lần): giống attendance_summary, chủ/quản lý được kiểm quyền MỘT lần
--         rồi chạy hàm lõi bằng quyền hàm (attendance_list_fast); tổ trưởng/người thường vẫn đi đường cũ có RLS;
--     (b) cột phụ (có ảnh cờ đỏ...) tính cho mọi công rồi mới sắp xếp và cắt 50 dòng: viết lại hai bước, chọn 50 mã công trước (sắp xếp + đếm tổng) rồi mới tính
--         cột phụ cho 50 dòng đó.
--     Kết quả trả về giữ nguyên, không đổi giao diện.
-- (2) attendance_summary_core thêm khóa flagged_people = số người khác nhau có ảnh cờ đỏ trong ngày (flagged giữ nguyên là số ảnh).

create or replace function attendance_list_core(p_org uuid, p_from date, p_to date, p_status text default null, p_q text default null,
                                                p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); off integer := greatest(coalesce(p_offset, 0), 0);
        q text := nullif(trim(coalesce(p_q, '')), ''); tot integer; res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from > 92 and coalesce(p_status, '') not in ('pending', 'open')) then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 92 ngày.';
  end if;
  with pg as (
    select a.id, a.started_at, count(*) over () as total
      from attendance_records a join worker_profiles w on w.id = a.worker_id
     where a.organization_id = p_org and a.work_date between p_from and p_to
       and (q is null or w.full_name ilike '%' || q || '%')
       and case coalesce(p_status, '')
             when 'pending' then a.status = 'needs_confirmation' and a.ended_at is not null
             when 'open' then a.ended_at is null and a.status <> 'rejected'
             when 'confirmed' then a.status = 'confirmed'
             when 'rejected' then a.status = 'rejected'
             when 'flagged' then a.exception_reason is not null or exists (select 1 from attendance_photos ph where ph.attendance_id = a.id and ph.photo is not null)
             else true end
     order by a.started_at desc limit lim offset off)
  select coalesce(jsonb_agg(to_jsonb(x) - 'total' order by x.started_at desc), '[]'::jsonb), coalesce(max(x.total), 0)::integer into res, tot
    from (select pg.total, a.id, a.worker_id, w.full_name as worker_name, a.work_date, a.started_at, a.ended_at, a.break_minutes, a.declared_minutes, a.approved_minutes,
                 a.status, a.source, a.exception_reason, a.cycle_id,
                 exists (select 1 from attendance_photos ph where ph.attendance_id = a.id and ph.photo is not null) as has_photo
            from pg join attendance_records a on a.id = pg.id join worker_profiles w on w.id = a.worker_id) x;
  return jsonb_build_object('total', tot, 'rows', res);
end $$;

-- Chủ/quản lý: kiểm quyền MỘT lần rồi chạy lõi bằng quyền hàm (bỏ qua RLS từng dòng); người khác (tổ trưởng, người thường) đi đường có RLS
create or replace function attendance_list_fast(p_org uuid, p_from date, p_to date, p_status text default null, p_q text default null,
                                                p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN'; end if;
  return attendance_list_core(p_org, p_from, p_to, p_status, p_q, p_limit, p_offset);
end $$;
create or replace function attendance_list(p_org uuid, p_from date, p_to date, p_status text default null, p_q text default null,
                                           p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if is_workforce_admin(p_org) then return attendance_list_fast(p_org, p_from, p_to, p_status, p_q, p_limit, p_offset); end if;
  return attendance_list_core(p_org, p_from, p_to, p_status, p_q, p_limit, p_offset);
end $$;
revoke execute on function attendance_list_core(uuid, date, date, text, text, integer, integer), attendance_list_fast(uuid, date, date, text, text, integer, integer) from public, anon;
grant execute on function attendance_list_core(uuid, date, date, text, text, integer, integer), attendance_list_fast(uuid, date, date, text, text, integer, integer), attendance_list(uuid, date, date, text, text, integer, integer) to authenticated;

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
    'flagged_people', (select count(distinct worker_id) from attendance_photos where organization_id = p_org and photo is not null
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
