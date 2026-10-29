-- Chấm công cho cơ sở đông người (D115): ảnh chỉ lưu khi CỜ ĐỎ; số liệu tổng hợp, danh sách phân trang và xác nhận hàng loạt tính ở máy chủ
-- (không còn cắt ở 300 dòng); tối đa 20 máy chấm công mỗi cơ sở.

-- ---------------------------------------------------------------------------
-- 1. Cờ đỏ = máy không thấy mặt, khuôn mặt KHÔNG khớp, phải chụp lại từ 3 lần, quên Ra ca hôm trước, hoặc hai người khác nhau bấm cùng máy trong vòng 6 giây.
--    Khớp chưa chắc, chưa có mẫu hoặc không so được chỉ là cờ nhẹ: không giữ ảnh.
-- ---------------------------------------------------------------------------
drop function kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid);
create function kiosk_punch(p_phone text, p_pin text, p_action text, p_id uuid, p_photo text, p_face_ok boolean default null,
                            p_descriptor jsonb default null, p_attempts integer default 1, p_cycle uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; k uuid; ar uuid; org uuid; o attendance_records; att uuid; nm text; stale boolean := false; fs record; kr attendance_kiosks; keep boolean;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  w := (a ->> 'worker_id')::uuid; k := (a ->> 'kiosk_id')::uuid; ar := nullif(a ->> 'area', '')::uuid; org := (a ->> 'org')::uuid;
  select * into kr from attendance_kiosks where id = k;
  select full_name into nm from worker_profiles where id = w;
  if p_action not in ('in', 'out') then return kiosk_fail('INVALID_ARGUMENT', 'Thao tác không hợp lệ.'); end if;
  if p_photo is null or length(p_photo) < 100 then return kiosk_fail('NO_PHOTO', 'Chưa chụp được ảnh. Hãy cho phép dùng camera rồi thử lại.'); end if;
  if length(p_photo) > 90000 then return kiosk_fail('PHOTO_TOO_BIG', 'Ảnh quá lớn, hãy thử lại.'); end if;
  if exists (select 1 from attendance_photos where id = p_id) then   -- bấm lặp
    return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'duplicate', true);
  end if;
  if p_action = 'in' and p_cycle is not null and not exists (select 1 from kiosk_cycle_options(kr) opt where opt.cid = p_cycle) then
    return kiosk_fail('INVALID_CYCLE', 'Vụ này không có ở máy chấm công này hoặc đã kết thúc. Hãy chọn lại.');
  end if;
  select * into o from attendance_records where worker_id = w and ended_at is null and status <> 'rejected' order by started_at desc limit 1;
  select * into fs from kiosk_face_state(w, face_vec(p_descriptor));
  begin
    if p_action = 'in' then
      if o.id is not null then
        return kiosk_fail('ALREADY_IN', 'Bạn đã vào ca lúc ' || to_char(o.started_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || ' rồi. Hãy bấm Ra ca khi xong việc.');
      end if;
      insert into attendance_records (id, worker_id, work_date, started_at, source, device_recorded_at, kiosk_id, area_id, cycle_id)
        values (p_id, w, vn_today(), now(), 'kiosk', now(), k, ar, p_cycle) returning id into att;
    else
      if o.id is null then return kiosk_fail('NOT_IN', 'Bạn chưa vào ca nên chưa Ra ca được.'); end if;
      stale := o.work_date < vn_today();
      update attendance_records
         set ended_at = now(), status = 'needs_confirmation',
             exception_reason = case when stale then 'Quên ra ca hôm trước (ra ca ở máy chấm công), cần chủ xem lại giờ' else exception_reason end
       where id = o.id returning id into att;
    end if;
    keep := p_face_ok is false or fs.state = 'mismatch' or coalesce(p_attempts, 1) >= 3 or stale
            or exists (select 1 from attendance_photos q where q.kiosk_id = k and q.worker_id <> w and q.taken_at > now() - interval '6 seconds');
    insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok, face_distance, face_attempts)
      values (p_id, org, att, w, k, p_action, case when keep then p_photo end, p_face_ok, fs.dist, least(greatest(coalesce(p_attempts, 1), 1), 9));
  exception when others then
    return kiosk_fail('ERROR', 'Không ghi được: ' || regexp_replace(sqlerrm, '^[A-Z_]+: ', ''));
  end;
  return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'stale', stale, 'face', fs.state);
end $$;

-- Màn xem ảnh: cờ "hai người bấm sát nhau" dùng cửa sổ 6 giây (cơ sở đông người xếp hàng thì 20 giây là bình thường)
create or replace function attendance_photo_review(p_org uuid, p_from date, p_to date)
returns table (ph_id uuid, att_id uuid, wk_id uuid, wk_name text, ph_kind text, ph_at timestamptz, ph_photo text, ph_face_ok boolean,
               ph_flags text[], kiosk_name text, area_name text, ph_distance real)
language plpgsql stable security definer set search_path = public as $$
declare lo float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_maybe_distance'), 0.5);
        hi float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_mismatch_distance'), 0.6);
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem ảnh chấm công.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 31 ngày.';
  end if;
  return query
    select p.id, p.attendance_id, p.worker_id, w.full_name, p.kind, p.taken_at, p.photo, p.face_ok,
           array_remove(array[
             case when p.face_ok is false then 'no_face' end,
             case when p.face_ok is null then 'unchecked' end,
             case when exists (select 1 from attendance_photos q where q.kiosk_id = p.kiosk_id and q.worker_id <> p.worker_id
                                  and q.taken_at between p.taken_at - interval '6 seconds' and p.taken_at + interval '6 seconds') then 'fast_pair' end,
             case when p.kind = 'out' and a.exception_reason is not null then 'forgot_out' end,
             case when p.face_distance >= hi then 'face_mismatch' when p.face_distance >= lo then 'face_maybe' end,
             case when not exists (select 1 from worker_face_profiles f where f.worker_id = p.worker_id) then 'no_ref'
                  when p.face_distance is null then 'no_descriptor' end,
             case when p.face_attempts >= 3 then 'retries' end
           ], null),
           k.name, ar.name, p.face_distance
      from attendance_photos p
      join worker_profiles w on w.id = p.worker_id
      join attendance_records a on a.id = p.attendance_id
      left join attendance_kiosks k on k.id = p.kiosk_id
      left join production_areas ar on ar.id = a.area_id
     where p.organization_id = p_org and p.photo is not null
       and (p.taken_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
     order by p.taken_at desc
     limit 300;
end $$;

-- Tối đa 20 máy chấm công đang dùng mỗi cơ sở
create or replace function kiosk_precheck(p_actor uuid, p_org uuid, p_area uuid, p_name text, p_consent boolean)
returns table (auth_email text)
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  if not exists (select 1 from organization_memberships m where m.organization_id = p_org and m.user_id = p_actor
                    and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được liên kết máy chấm công.';
  end if;
  if coalesce(p_name, '') = '' or length(trim(p_name)) > 60 then raise exception 'INVALID_NAME: Hãy đặt tên máy (ví dụ "Máy cổng nhà màng").'; end if;
  if not coalesce(p_consent, false) then
    raise exception 'CONSENT_REQUIRED: Cần xác nhận đã báo và được người làm đồng ý cho chụp ảnh khi chấm công.';
  end if;
  if p_area is not null and not exists (select 1 from production_areas a where a.id = p_area and a.organization_id = p_org) then
    raise exception 'INVALID_AREA: Phân khu không thuộc cơ sở này.';
  end if;
  if (select count(*) from attendance_kiosks where organization_id = p_org and active) >= 20 then
    raise exception 'LIMIT: Mỗi cơ sở có tối đa 20 máy chấm công đang dùng. Hãy ngừng một máy trước.';
  end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  return query select 'kiosk-' || replace(gen_random_uuid()::text, '-', '') || '@kiosk.' || coalesce(dom, 'agricovi.com');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Số liệu và danh sách chấm công tính ở máy chủ (chạy với quyền người gọi: tổ trưởng chỉ thấy người trong tổ nhờ chính sách RLS có sẵn)
-- ---------------------------------------------------------------------------
create index if not exists attendance_org_status_idx on attendance_records (organization_id, status, work_date);

create function attendance_summary(p_org uuid, p_day date) returns jsonb
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
                  and (taken_at at time zone 'Asia/Ho_Chi_Minh')::date = p_day),
    'flagged_week', (select count(*) from attendance_photos where organization_id = p_org and photo is not null
                       and (taken_at at time zone 'Asia/Ho_Chi_Minh')::date between p_day - 6 and p_day),
    'month_minutes', coalesce((select sum(approved_minutes) from attendance_records
                                where organization_id = p_org and status = 'confirmed' and work_date >= m0 and work_date < (m0 + interval '1 month')::date), 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'minutes', t.m) order by t.m desc)
                       from (select w.full_name as name, sum(a.approved_minutes) as m
                               from attendance_records a join worker_profiles w on w.id = a.worker_id
                              where a.organization_id = p_org and a.status = 'confirmed' and a.work_date >= m0 and a.work_date < (m0 + interval '1 month')::date
                              group by w.id, w.full_name order by m desc limit 8) t), '[]'::jsonb));
end $$;

create function attendance_list(p_org uuid, p_from date, p_to date, p_status text default null, p_q text default null,
                                p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); off integer := greatest(coalesce(p_offset, 0), 0);
        q text := nullif(trim(coalesce(p_q, '')), ''); tot integer; res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
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

-- Xác nhận hàng loạt các công "hợp lệ": đã Ra ca, không có ngoại lệ, không có ảnh cờ đỏ, giờ làm hợp lý. Chỉ chủ/quản lý.
create function attendance_bulk_confirm(p_org uuid, p_from date, p_to date, p_q text default null, p_dry boolean default false) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r record; n integer := 0; skipped integer := 0; q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được xác nhận hàng loạt.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 31 ngày.';
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

revoke execute on function kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid), attendance_photo_review(uuid, date, date),
  attendance_summary(uuid, date), attendance_list(uuid, date, date, text, text, integer, integer), attendance_bulk_confirm(uuid, date, date, text, boolean)
  from public, anon;
grant execute on function kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid), attendance_photo_review(uuid, date, date),
  attendance_summary(uuid, date), attendance_list(uuid, date, date, text, text, integer, integer), attendance_bulk_confirm(uuid, date, date, text, boolean)
  to authenticated;
revoke execute on function kiosk_precheck(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function kiosk_precheck(uuid, uuid, uuid, text, boolean) to service_role;
