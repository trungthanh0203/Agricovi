-- D202: sửa lỗi nút Xem ở khung "Cần xử lý" (D197/D198). Số "công chờ xác nhận" và "ca quên ra ca" đếm MỌI NGÀY nên bảng phải liệt kê được mọi ngày,
-- nhưng attendance_list chỉ nhận khoảng ≤ 92 ngày và attendance_bulk_confirm chỉ ≤ 31 ngày ("Hãy chọn khoảng ngày không quá 92 ngày").
-- Hai tập này (công chờ xác nhận, ca đang mở) vốn nhỏ và có giới hạn dòng, nên khi lọc theo chúng thì bỏ giới hạn số ngày; các lọc khác giữ nguyên giới hạn.

create or replace function attendance_list(p_org uuid, p_from date, p_to date, p_status text default null, p_q text default null,
                                           p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); off integer := greatest(coalesce(p_offset, 0), 0);
        q text := nullif(trim(coalesce(p_q, '')), ''); tot integer; res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from > 92 and coalesce(p_status, '') not in ('pending', 'open')) then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 92 ngày.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) - 'total' order by x.started_at desc), '[]'::jsonb), coalesce(max(x.total), 0)::integer into res, tot
    from (select a.id, a.worker_id, w.full_name as worker_name, a.work_date, a.started_at, a.ended_at, a.break_minutes, a.declared_minutes, a.approved_minutes,
                 a.status, a.source, a.exception_reason, a.cycle_id,
                 exists (select 1 from attendance_photos ph where ph.attendance_id = a.id and ph.photo is not null) as has_photo,
                 count(*) over () as total
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
           order by a.started_at desc limit lim offset off) x;
  return jsonb_build_object('total', tot, 'rows', res);
end $$;

-- Xác nhận hàng loạt: chỉ động tới công chờ xác nhận, tối đa 1000 dòng mỗi lần nên không cần giới hạn số ngày
create or replace function attendance_bulk_confirm(p_org uuid, p_from date, p_to date, p_q text default null, p_dry boolean default false) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r record; n integer := 0; skipped integer := 0; q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được xác nhận hàng loạt.'; end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày hợp lệ.';
  end if;
  for r in
    select a.id from attendance_records a join worker_profiles w on w.id = a.worker_id
     where a.organization_id = p_org and a.work_date between p_from and p_to
       and a.status = 'needs_confirmation' and a.ended_at is not null and a.exception_reason is null
       and coalesce(a.declared_minutes, 0) between 1 and 960
       and not exists (select 1 from attendance_photos ph where ph.attendance_id = a.id and ph.photo is not null)
       and (q is null or w.full_name ilike '%' || q || '%')
     order by a.started_at limit 1000
  loop
    if p_dry then n := n + 1; continue; end if;
    begin
      perform confirm_attendance(r.id, null);
      n := n + 1;
    exception when others then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('count', n, 'skipped', skipped);
end $$;
