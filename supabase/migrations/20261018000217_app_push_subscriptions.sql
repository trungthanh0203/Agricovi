-- H2 lát 1 (D182): thông báo đẩy (Web Push). Mỗi thiết bị của mỗi người một dòng đăng ký; tùy chọn nhận thông báo theo người.
-- Lát 1 chỉ dựng đường ống: đăng ký thiết bị, gửi thử cho chính mình (Edge Function `send-push`). Chưa có thông báo tự sinh (lát 2: bản tin sáng).
-- Riêng tư: người dùng chỉ thấy và xóa được thiết bị của chính mình; khóa đẩy (p256dh, auth) KHÔNG đọc được từ phía app, chỉ máy chủ (service_role) dùng để gửi.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 200),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
-- chỉ cho đọc cột không nhạy cảm của thiết bị mình (khóa đẩy bị thu hồi quyền cột bên dưới)
create policy push_own_read on push_subscriptions for select to authenticated using (user_id = auth.uid());
revoke all on push_subscriptions from authenticated, anon;
grant select (id, user_id, endpoint, user_agent, created_at, last_seen_at) on push_subscriptions to authenticated;

-- Tùy chọn nhận thông báo (lát 2 dùng: bản tin sáng, giờ im lặng)
create table notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  morning_digest boolean not null default true,
  quiet_from time not null default '21:00',
  quiet_to time not null default '06:00',
  updated_at timestamptz not null default now()
);
alter table notification_prefs enable row level security;
create policy notif_prefs_own on notification_prefs for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on notification_prefs from authenticated, anon;

-- Đăng ký (hoặc cập nhật) một thiết bị. Cùng một địa chỉ đẩy đăng nhập người khác thì chuyển sang người đó (một thiết bị, một người nhận).
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Hãy đăng nhập lại.'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'INVALID_ARGUMENT: Địa chỉ nhận thông báo của máy không hợp lệ.'; end if;
  if p_p256dh is null or length(p_p256dh) not between 20 and 200 or p_auth is null or length(p_auth) not between 10 and 100 then raise exception 'INVALID_ARGUMENT: Khóa nhận thông báo của máy không hợp lệ.'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = now()
  returning id into v_id;
  -- mỗi người tối đa 10 thiết bị: bỏ các thiết bị cũ nhất
  delete from push_subscriptions where id in (
    select id from push_subscriptions where user_id = auth.uid() order by last_seen_at desc offset 10);
  return v_id;
end $$;

create or replace function remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Hãy đăng nhập lại.'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- Tùy chọn: bật/tắt bản tin sáng và giờ im lặng (lát 2 dùng)
create or replace function set_notification_prefs(p_morning boolean, p_quiet_from time, p_quiet_to time) returns notification_prefs
language plpgsql security definer set search_path = public as $$
declare r notification_prefs;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Hãy đăng nhập lại.'; end if;
  insert into notification_prefs (user_id, morning_digest, quiet_from, quiet_to)
  values (auth.uid(), coalesce(p_morning, true), coalesce(p_quiet_from, '21:00'), coalesce(p_quiet_to, '06:00'))
  on conflict (user_id) do update set morning_digest = excluded.morning_digest, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, updated_at = now()
  returning * into r;
  return r;
end $$;

revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function remove_push_subscription(text) from public, anon;
revoke execute on function set_notification_prefs(boolean, time, time) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated, service_role;
grant execute on function remove_push_subscription(text) to authenticated, service_role;
grant execute on function set_notification_prefs(boolean, time, time) to authenticated, service_role;
