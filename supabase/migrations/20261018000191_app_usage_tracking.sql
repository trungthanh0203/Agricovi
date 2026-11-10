-- THEO DÕI SỬ DỤNG (D160): trang quản trị nền tảng xem mỗi ngày có tài khoản nào dùng hệ thống, từ lúc nào đến lúc nào, ở thiết bị nào, vào chức năng nào.
-- Nhẹ: app gửi một tín hiệu ngầm mỗi ~60 giây khi đang mở (cập nhật MỘT dòng phiên, không sinh dòng mỗi lần chuyển màn);
-- thời gian ở từng màn cộng dồn trong jsonb. Bảng tổng hợp theo ngày để trang quản trị đọc nhanh.
-- Giữ dữ liệu thô (phiên, đăng nhập) 10 ngày, tổng hợp theo ngày 1 năm; dọn dần khi ghi, không cần công việc nền riêng.
-- Một tài khoản đăng nhập được nhiều máy: mỗi trình duyệt/app cài có một device_id riêng (sinh ở máy), nên phân biệt được từng thiết bị.
-- Ghi: IP và vị trí lấy từ phần đầu (header) của yêu cầu do Cloudflare/Supabase gắn (nếu có), cộng quốc gia + trạm Cloudflare gần nhất do app báo.
-- Không ai đọc trực tiếp các bảng này (không có chính sách); người dùng chỉ ghi được dữ liệu của CHÍNH MÌNH qua usage_ping; chỉ quản trị nền tảng đọc.

-- Phần đầu yêu cầu do PostgREST đặt vào cấu hình phiên (không có khi chạy ngoài API: trả null)
create or replace function usage_request_header(p_name text) returns text
language plpgsql stable as $$
declare h text;
begin
  h := current_setting('request.headers', true);
  if h is null or h = '' then return null; end if;
  return nullif(left(coalesce((h::json) ->> p_name, ''), 200), '');
exception when others then return null;
end $$;

create or replace function usage_merge_screens(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, sum(v)::integer v from (
      select key k, (value)::integer v from jsonb_each_text(coalesce(a, '{}'::jsonb)) where value ~ '^\d{1,9}$'
      union all
      select key, (value)::integer from jsonb_each_text(coalesce(b, '{}'::jsonb)) where value ~ '^\d{1,9}$'
    ) x group by k
  ) y
$$;

create table usage_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  device_id uuid not null,
  device_label text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer not null default 0,
  screens jsonb not null default '{}'::jsonb,
  ip text, country text, region text, city text, colo text,
  standalone boolean not null default false,
  app_version text
);
create index usage_sessions_started_idx on usage_sessions (started_at);
create index usage_sessions_user_idx on usage_sessions (user_id, started_at desc);
create index usage_sessions_live_idx on usage_sessions (last_seen_at) where ended_at is null;

create table usage_logins (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  at timestamptz not null default now(),
  method text check (method is null or length(method) <= 20),
  ip text, country text, city text
);
create index usage_logins_at_idx on usage_logins (at);

create table usage_daily (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  organization_id uuid references organizations(id) on delete set null,
  device_label text,
  sessions integer not null default 0,
  logins integer not null default 0,
  seconds integer not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  screens jsonb not null default '{}'::jsonb,
  last_ip text, last_country text, last_city text,
  primary key (day, user_id, device_id)
);
create index usage_daily_user_idx on usage_daily (user_id, day desc);

alter table usage_sessions enable row level security;
alter table usage_logins enable row level security;
alter table usage_daily enable row level security;
revoke all on usage_sessions, usage_logins, usage_daily from anon, authenticated;
revoke usage on sequence usage_logins_id_seq from anon, authenticated;

-- Dọn dữ liệu cũ: thô > 10 ngày, tổng hợp > 1 năm
create or replace function usage_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from usage_sessions where started_at < now() - interval '10 days';
  delete from usage_logins where at < now() - interval '10 days';
  delete from usage_daily where day < vn_today() - 365;
$$;
revoke execute on function usage_cleanup() from public, anon, authenticated;

-- Tín hiệu sử dụng của CHÍNH người gọi.
--  p_session: mã phiên (app sinh); p_device: mã thiết bị (sinh một lần ở máy); p_seconds: số giây sử dụng kể từ tín hiệu trước (tối đa 300);
--  p_screens: {"mã màn": giây} cộng dồn kể từ tín hiệu trước (mã dạng chữ thường/số/gạch dưới, tối đa 30 mã); p_login: cách đăng nhập nếu vừa đăng nhập;
--  p_ended: phiên kết thúc (đóng app / đăng xuất).
create or replace function usage_ping(
  p_session uuid, p_org uuid, p_device uuid, p_label text, p_standalone boolean, p_version text,
  p_seconds integer, p_screens jsonb, p_country text, p_colo text, p_login text default null, p_ended boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sec integer := greatest(0, least(coalesce(p_seconds, 0), 300));
  v_scr jsonb;
  v_ip text; v_ctry text; v_rgn text; v_cty text; v_col text;
  s usage_sessions; fresh boolean := false; v_day date := vn_today(); v_lbl text := left(nullif(trim(coalesce(p_label, '')), ''), 120);
begin
  if uid is null then raise exception 'FORBIDDEN: Bạn chưa đăng nhập.'; end if;
  if p_session is null or p_device is null then raise exception 'BAD_REQUEST: Thiếu mã phiên hoặc mã thiết bị.'; end if;
  if p_org is not null and not is_org_member(p_org) then p_org := null; end if;

  -- chỉ nhận mã màn hợp lệ, tối đa 30 mã, mỗi mã tối đa 300 giây
  select coalesce(jsonb_object_agg(key, least(300, value::integer)), '{}'::jsonb) into v_scr
    from (select key, value from jsonb_each_text(coalesce(p_screens, '{}'::jsonb))
           where key ~ '^[a-z0-9_]{1,30}(/[a-z0-9_]{1,30})?$' and value ~ '^\d{1,4}$' limit 30) t;

  v_ip := coalesce(usage_request_header('cf-connecting-ip'), usage_request_header('x-real-ip'), nullif(trim(split_part(coalesce(usage_request_header('x-forwarded-for'), ''), ',', 1)), ''));
  v_ctry := coalesce(usage_request_header('cf-ipcountry'), left(nullif(upper(trim(coalesce(p_country, ''))), ''), 2));
  v_rgn := usage_request_header('cf-region');
  v_cty := usage_request_header('cf-ipcity');
  v_col := left(nullif(upper(trim(coalesce(p_colo, ''))), ''), 8);

  select * into s from usage_sessions where id = p_session;
  if s.id is not null and s.user_id <> uid then raise exception 'FORBIDDEN: Mã phiên không hợp lệ.'; end if;
  if s.id is null then
    insert into usage_sessions (id, user_id, organization_id, device_id, device_label, standalone, app_version, seconds, screens, ip, country, region, city, colo, ended_at)
    values (p_session, uid, p_org, p_device, v_lbl, coalesce(p_standalone, false), left(p_version, 20), sec, v_scr, left(v_ip, 64), v_ctry, v_rgn, v_cty, v_col, case when p_ended then now() end);
    fresh := true;
  else
    update usage_sessions set last_seen_at = now(), seconds = least(seconds + sec, 86400), screens = usage_merge_screens(screens, v_scr),
           organization_id = coalesce(p_org, organization_id), ended_at = case when p_ended then now() else ended_at end,
           ip = coalesce(left(v_ip, 64), usage_sessions.ip), country = coalesce(v_ctry, usage_sessions.country), region = coalesce(v_rgn, usage_sessions.region),
           city = coalesce(v_cty, usage_sessions.city), colo = coalesce(v_col, usage_sessions.colo)
     where id = p_session;
  end if;

  if p_login is not null then
    insert into usage_logins (user_id, device_id, method, ip, country, city) values (uid, p_device, left(p_login, 20), left(v_ip, 64), v_ctry, v_cty);
  end if;

  insert into usage_daily (day, user_id, device_id, organization_id, device_label, sessions, logins, seconds, screens, last_ip, last_country, last_city)
  values (v_day, uid, p_device, p_org, v_lbl, case when fresh then 1 else 0 end, case when p_login is not null then 1 else 0 end, sec, v_scr, left(v_ip, 64), v_ctry, v_cty)
  on conflict (day, user_id, device_id) do update set
    sessions = usage_daily.sessions + case when fresh then 1 else 0 end,
    logins = usage_daily.logins + case when p_login is not null then 1 else 0 end,
    seconds = least(usage_daily.seconds + sec, 86400),
    last_at = now(), screens = usage_merge_screens(usage_daily.screens, v_scr),
    organization_id = coalesce(p_org, usage_daily.organization_id), device_label = coalesce(v_lbl, usage_daily.device_label),
    last_ip = coalesce(left(v_ip, 64), usage_daily.last_ip), last_country = coalesce(v_ctry, usage_daily.last_country), last_city = coalesce(v_cty, usage_daily.last_city);

  if random() < 0.02 then perform usage_cleanup(); end if;   -- dọn dần, không cần công việc nền
end $$;
revoke execute on function usage_ping(uuid, uuid, uuid, text, boolean, text, integer, jsonb, text, text, text, boolean) from public, anon;
grant execute on function usage_ping(uuid, uuid, uuid, text, boolean, text, integer, jsonb, text, text, text, boolean) to authenticated, service_role;

-- ============================================================ QUẢN TRỊ NỀN TẢNG (đọc)
-- Tên hiển thị của tài khoản: tên đã đặt, hoặc họ tên nhân sự, hoặc phần đầu địa chỉ đăng nhập
create or replace function usage_user_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select display_name from user_profiles where user_id = p_user),
    (select w.full_name from worker_profiles w where w.user_id = p_user order by w.created_at limit 1),
    (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user))
$$;
revoke execute on function usage_user_name(uuid) from public, anon, authenticated;

create or replace function admin_usage_summary(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, vn_today());
begin
  perform admin_guard();
  return jsonb_build_object(
    'day', d,
    'accounts', (select count(distinct user_id) from usage_daily where day = d),
    'devices', (select count(*) from usage_daily where day = d),
    'sessions', (select coalesce(sum(sessions), 0) from usage_daily where day = d),
    'seconds', (select coalesce(sum(seconds), 0) from usage_daily where day = d),
    'logins', (select coalesce(sum(logins), 0) from usage_daily where day = d),
    'online_now', (select count(distinct user_id) from usage_sessions where ended_at is null and last_seen_at > now() - interval '2 minutes'));
end $$;
revoke execute on function admin_usage_summary(date) from public, anon;
grant execute on function admin_usage_summary(date) to authenticated, service_role;

-- Bảng theo tài khoản trong một ngày; sắp xếp theo cột và phân trang ở máy chủ.
-- p_sort: 1 tên, 2 cơ sở, 3 vào lúc, 4 thấy lần cuối, 5 số phiên, 6 thời gian dùng, 7 số thiết bị
create or replace function admin_usage_accounts(p_day date default null, p_org uuid default null, p_search text default null,
  p_sort integer default 4, p_desc boolean default true, p_limit integer default 30, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, vn_today()); lim integer := greatest(1, least(coalesce(p_limit, 30), 100)); off integer := greatest(0, coalesce(p_offset, 0));
  col text; total bigint; rows jsonb; s text := nullif(trim(coalesce(p_search, '')), ''); base text;
begin
  perform admin_guard();
  col := case coalesce(p_sort, 4) when 1 then 'lower(name)' when 2 then 'lower(org_name)' when 3 then 'first_at' when 4 then 'last_at' when 5 then 'sessions' when 6 then 'seconds' when 7 then 'devices' else 'last_at' end;
  base := format($q$
    select z.* from (
      select x.user_id, usage_user_name(x.user_id) as name, u.email as email, o.name as org_name, x.org_id, x.first_at, x.last_at, x.sessions, x.seconds, x.devices
        from (select user_id, (array_agg(organization_id order by last_at desc) filter (where organization_id is not null))[1] as org_id,
                     min(first_at) as first_at, max(last_at) as last_at, sum(sessions)::bigint as sessions, sum(seconds)::bigint as seconds, count(*) as devices
                from usage_daily where day = %L::date and (%L::uuid is null or organization_id = %L::uuid) group by user_id) x
        join auth.users u on u.id = x.user_id
        left join organizations o on o.id = x.org_id) z
     where (%L::text is null or lower(coalesce(z.name, '')) like '%%' || lower(%L::text) || '%%' or lower(coalesce(z.email, '')) like '%%' || lower(%L::text) || '%%'
            or lower(coalesce(z.org_name, '')) like '%%' || lower(%L::text) || '%%')
  $q$, d, p_org, p_org, s, s, s, s);
  execute 'select count(*) from (' || base || ') c' into total;
  execute 'select coalesce(jsonb_agg(jsonb_build_array(user_id, name, email, org_name, first_at, last_at, sessions, seconds, devices, top, org_id)), ''[]''::jsonb) from ('
    || 'select t.*, (select string_agg(k, '', '' order by v desc) from (select key k, sum((value)::integer) v from usage_daily d2, jsonb_each_text(d2.screens) '
    || 'where d2.day = ' || quote_literal(d::text) || '::date and d2.user_id = t.user_id and value ~ ''^\d+$'' group by key order by sum((value)::integer) desc limit 3) q) as top '
    || 'from (' || base || ') t order by ' || col || case when coalesce(p_desc, true) then ' desc' else ' asc' end || ' nulls last, name asc limit ' || lim || ' offset ' || off || ') y' into rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;
revoke execute on function admin_usage_accounts(date, uuid, text, integer, boolean, integer, integer) from public, anon;
grant execute on function admin_usage_accounts(date, uuid, text, integer, boolean, integer, integer) to authenticated, service_role;

-- Chi tiết một tài khoản trong một ngày: các thiết bị (phân biệt máy), từng phiên (còn dữ liệu thô 10 ngày gần nhất), thời gian ở từng chức năng, có dùng cùng lúc nhiều máy không
create or replace function admin_usage_account_day(p_user uuid, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, vn_today()); overlap boolean;
begin
  perform admin_guard();
  select exists (
    select 1 from usage_sessions a join usage_sessions b on a.user_id = b.user_id and a.device_id <> b.device_id and a.id < b.id
     where a.user_id = p_user and (a.started_at at time zone 'Asia/Ho_Chi_Minh')::date = d and (b.started_at at time zone 'Asia/Ho_Chi_Minh')::date = d
       and a.started_at < b.last_seen_at and b.started_at < a.last_seen_at) into overlap;
  return jsonb_build_object(
    'user', jsonb_build_object('id', p_user, 'name', usage_user_name(p_user), 'email', (select email from auth.users where id = p_user)),
    'day', d, 'overlap', overlap,
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device_id', x.device_id, 'label', x.device_label, 'sessions', x.sessions, 'logins', x.logins, 'seconds', x.seconds,
                          'first_at', x.first_at, 'last_at', x.last_at, 'ip', x.last_ip, 'country', x.last_country, 'city', x.last_city, 'screens', x.screens,
                          'org', (select name from organizations where id = x.organization_id)) order by x.first_at)
                         from usage_daily x where x.user_id = p_user and x.day = d), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'device_id', s.device_id, 'label', s.device_label, 'started_at', s.started_at, 'last_seen_at', s.last_seen_at,
                          'ended_at', s.ended_at, 'seconds', s.seconds, 'ip', s.ip, 'country', s.country, 'city', s.city, 'colo', s.colo, 'standalone', s.standalone,
                          'version', s.app_version, 'screens', s.screens) order by s.started_at)
                         from usage_sessions s where s.user_id = p_user and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date = d), '[]'::jsonb));
end $$;
revoke execute on function admin_usage_account_day(uuid, date) from public, anon;
grant execute on function admin_usage_account_day(uuid, date) to authenticated, service_role;

-- Chức năng được dùng nhiều nhất trong p_days ngày gần nhất (tối đa 365)
create or replace function admin_usage_screens(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n integer := greatest(1, least(coalesce(p_days, 7), 365));
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('screen', t.k, 'users', t.users, 'seconds', t.secs) order by t.secs desc)
    from (select key k, count(distinct x.user_id) users, sum((value)::integer) secs
            from usage_daily x, jsonb_each_text(x.screens)
           where x.day > vn_today() - n and value ~ '^\d+$' group by key) t), '[]'::jsonb);
end $$;
revoke execute on function admin_usage_screens(integer) from public, anon;
grant execute on function admin_usage_screens(integer) to authenticated, service_role;
