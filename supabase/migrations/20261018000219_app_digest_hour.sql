-- H2 lát 2b (D184): mỗi người tự chọn GIỜ nhận bản tin sáng và bật/tắt bản tin (ở Tài khoản → Thông báo).
-- Lịch của CSDL đổi từ "mỗi ngày 7 giờ" sang "mỗi giờ" (xem supabase/maintenance/schedule_morning_digest.sql); mỗi lần chỉ gửi cho những người có giờ đã chọn
-- đúng bằng giờ hiện tại (giờ Việt Nam). Người đã chọn giờ nào thì giờ đó được gửi, nên không dùng giờ im lặng cho bản tin (giờ im lặng để dành cho thông báo tức thời).

alter table notification_prefs add column digest_hour smallint not null default 7 check (digest_hour between 0 and 23);

-- Người dùng đổi bản tin của mình (giữ nguyên giờ im lặng)
create or replace function set_digest_prefs(p_enabled boolean, p_hour integer) returns notification_prefs
language plpgsql security definer set search_path = public as $$
declare r notification_prefs;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Hãy đăng nhập lại.'; end if;
  if p_hour is null or p_hour < 0 or p_hour > 23 then raise exception 'INVALID_ARGUMENT: Giờ nhận bản tin từ 0 đến 23.'; end if;
  insert into notification_prefs (user_id, morning_digest, digest_hour) values (auth.uid(), coalesce(p_enabled, true), p_hour)
  on conflict (user_id) do update set morning_digest = excluded.morning_digest, digest_hour = excluded.digest_hour, updated_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function set_digest_prefs(boolean, integer) from public, anon;
grant execute on function set_digest_prefs(boolean, integer) to authenticated, service_role;

-- Chọn người cần gửi: giờ họ chọn (mặc định 7) khớp giờ hiện tại, chưa gửi hôm nay, có việc để nhắc. p_hour để thử; bỏ trống = giờ Việt Nam hiện tại.
drop function claim_morning_digests(date);
create or replace function claim_morning_digests(p_day date default null, p_hour integer default null) returns table (user_id uuid, counts jsonb)
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, vn_today()); h integer := coalesce(p_hour, extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::integer); u record; c jsonb; total int;
begin
  for u in
    select distinct s.user_id uid
      from push_subscriptions s left join notification_prefs p on p.user_id = s.user_id
     where coalesce(p.morning_digest, true) and coalesce(p.digest_hour, 7) = h
       and not exists (select 1 from push_digest_log l where l.user_id = s.user_id and l.day = d)
  loop
    c := morning_digest_counts(u.uid, d);
    total := (c->'tasks'->>'crop')::int + (c->'tasks'->>'livestock')::int + (c->'tasks'->>'aquatic')::int + (c->'tasks'->>'other')::int
           + (c->>'vaccine')::int + (c->>'milestones')::int + (c->>'assets')::int + (c->>'payables')::int + (c->>'receivables')::int + (c->>'licenses')::int;
    if total = 0 then continue; end if;
    insert into push_digest_log (user_id, day, counts) values (u.uid, d, c) on conflict do nothing;
    if found then user_id := u.uid; counts := c; return next; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
revoke execute on function claim_morning_digests(date, integer) from public, anon, authenticated;
grant execute on function claim_morning_digests(date, integer) to service_role;
