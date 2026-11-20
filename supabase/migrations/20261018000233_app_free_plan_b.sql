-- D219: gói Khởi đầu, đợt B (docs/PLAN_GOI_MIEN_PHI.md).
--  1. Nâng cấp thử đầy đủ 30 ngày, MỘT lần mỗi cơ sở (start_full_trial).
--  2. Hết 12 tháng: không ghi thêm bản ghi mới (chỉ xem, sửa/kết thúc/xuất); không xóa dữ liệu.
--  3. Khóa tính năng ở CSDL: chấm công, bảng chấm công giấy, đọc hóa đơn bằng AI. (Xuất báo cáo chạy ở máy khách nên chỉ khóa ở giao diện.)
--  4. Quản trị: danh sách khách tiềm năng (đã dùng hết vụ / sắp hết hạn / đã hết hạn) và cho sửa các cấu hình mới.
-- Chỉ ảnh hưởng gói có cờ is_scoped_trial (đăng ký từ D186); gói trả phí và cơ sở cũ giữ nguyên.

alter table subscriptions
  add column full_trial_until timestamptz,      -- có giá trị = đã dùng lượt nâng cấp thử; còn hiệu lực đến mốc này
  add column full_trial_cycles integer check (full_trial_cycles is null or full_trial_cycles > 0);

insert into platform_settings (key, value, description) values
  ('full_trial_days', '30'::jsonb, 'Số ngày nâng cấp thử đầy đủ (một lần mỗi cơ sở Khởi đầu)'),
  ('free_locked_features', '["attendance","invoice_scan","export_reports"]'::jsonb, 'Tính năng khóa ở gói Khởi đầu: attendance (chấm công, bảng giấy), invoice_scan (đọc hóa đơn AI), export_reports (xuất tệp CSV; chỉ khóa ở giao diện)')
  on conflict (key) do nothing;

-- Đang ở phạm vi hẹp (Khởi đầu) và không trong lượt nâng cấp thử?
create or replace function sub_scoped(s subscriptions) returns boolean
language sql stable as $$
  select coalesce(s.is_scoped_trial, false) and not (s.full_trial_until is not null and now() < s.full_trial_until);
$$;
create or replace function sub_max_cycles(s subscriptions) returns integer
language sql stable as $$
  select case when s.full_trial_until is not null and now() < s.full_trial_until
              then coalesce(s.full_trial_cycles, s.max_cycles) else s.max_cycles end;
$$;
revoke execute on function sub_scoped(subscriptions), sub_max_cycles(subscriptions) from public, anon;
grant execute on function sub_scoped(subscriptions), sub_max_cycles(subscriptions) to authenticated, service_role;

create or replace function org_scoped_trial(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sub_scoped(s) from current_subscription(p_org) s), false);
$$;

-- Hạn mức vụ: theo phạm vi hiệu lực (trong lượt nâng cấp thử dùng hạn mức gói cơ bản)
create or replace function enforce_cycle_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions;
  used integer;
  lim integer;
begin
  select * into sub from current_subscription(new.owner_org_id);

  if sub.id is not null and sub_scoped(sub) then
    if tg_op = 'UPDATE' and old.owner_org_id = new.owner_org_id then
      return new;
    end if;
    select count(*) into used from production_cycles
     where owner_org_id = new.owner_org_id and status <> 'cancelled' and id <> new.id;
    if used >= sub.max_cycles then
      raise exception 'TRIAL_CYCLE_LIMIT: Gói dùng thử chỉ tạo được % vụ. Hãy nâng lên gói trả phí để tạo thêm.', sub.max_cycles
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status not in ('active', 'paused') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'paused') and old.owner_org_id = new.owner_org_id then
    return new;
  end if;
  if sub.id is null then
    raise exception 'QUOTA_NO_SUBSCRIPTION: Tổ chức chưa có gói còn hiệu lực. Vui lòng gia hạn hoặc nâng gói để tạo vụ mới.'
      using errcode = 'P0001';
  end if;
  lim := sub_max_cycles(sub);
  select count(*) into used from production_cycles
   where owner_org_id = new.owner_org_id and status in ('active', 'paused') and id <> new.id;
  if used >= lim then
    raise exception 'QUOTA_EXCEEDED: Đang dùng %/% vụ. Kết thúc một vụ hoặc nâng gói để tạo thêm.', used, lim
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function enforce_trial_household_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions;
  used integer;
begin
  if tg_table_name = 'cooperative_memberships' and to_jsonb(new)->>'status' <> 'active' then return new; end if;
  if tg_table_name = 'cooperative_invitations' and to_jsonb(new)->>'status' <> 'pending' then return new; end if;
  select * into sub from current_subscription(new.cooperative_org_id);
  if sub.id is null or not sub_scoped(sub) or sub.max_households is null then
    return new;
  end if;
  select count(*) into used from cooperative_memberships where cooperative_org_id = new.cooperative_org_id and status = 'active';
  if tg_table_name = 'cooperative_invitations'
     or exists (select 1 from organizations h where h.id = (to_jsonb(new)->>'household_org_id')::uuid and h.managed_by_org = new.cooperative_org_id) then
    used := used + (select count(*) from cooperative_invitations where cooperative_org_id = new.cooperative_org_id and status = 'pending');
  end if;
  if used >= sub.max_households then
    raise exception 'TRIAL_HOUSEHOLD_LIMIT: Gói dùng thử chỉ thêm được % hộ. Hãy nâng lên gói trả phí để thêm hộ.', sub.max_households
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Nâng cấp thử đầy đủ, một lần
-- ---------------------------------------------------------------------------
create or replace function start_full_trial(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sub subscriptions; tier plan_tiers; days integer; until_ts timestamptz;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở bấm nâng cấp thử được.';
  end if;
  select * into sub from subscriptions
   where organization_id = p_org and is_scoped_trial order by period_end desc limit 1 for update;
  if sub.id is null then
    raise exception 'NOT_ELIGIBLE: Chỉ cơ sở đang dùng gói Khởi đầu mới nâng cấp thử được.';
  end if;
  if sub.full_trial_until is not null then
    raise exception 'ALREADY_USED: Cơ sở đã dùng lượt nâng cấp thử rồi. Muốn dùng đầy đủ hãy đăng ký gói trả phí.';
  end if;
  if sub.status not in ('trial', 'active') or now() >= sub.period_end then
    raise exception 'EXPIRED: Gói Khởi đầu đã hết hạn. Hãy liên hệ hỗ trợ để đăng ký gói trả phí.';
  end if;
  select t.* into tier from plan_tiers t join organizations o on o.type = t.org_type
   where o.id = p_org and t.is_trial_default and t.is_active limit 1;
  select coalesce((value #>> '{}')::integer, 30) into days from platform_settings where key = 'full_trial_days';
  until_ts := least(now() + make_interval(days => greatest(coalesce(days, 30), 1)), sub.period_end);
  update subscriptions set full_trial_until = until_ts, full_trial_cycles = coalesce(tier.max_cycles, 2)
   where id = sub.id;
  return jsonb_build_object('until', until_ts, 'max_cycles', coalesce(tier.max_cycles, 2));
end $$;
revoke execute on function start_full_trial(uuid) from public, anon;
grant execute on function start_full_trial(uuid) to authenticated;

-- Tình trạng gói Khởi đầu của cơ sở (cho giao diện): phạm vi hiệu lực, còn bao nhiêu ngày, đã dùng lượt thử chưa
create or replace function my_free_plan_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sub subscriptions;
begin
  if not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  select * into sub from subscriptions where organization_id = p_org and is_scoped_trial order by period_end desc limit 1;
  if sub.id is null then return jsonb_build_object('free', false); end if;
  return jsonb_build_object(
    'free', true,
    'scoped', sub_scoped(sub) and now() < sub.period_end,           -- đang bị giới hạn (không trong lượt thử)
    'expired', now() >= sub.period_end and (select cs.id from current_subscription(p_org) cs) is null,
    'period_end', sub.period_end,
    'days_left', greatest(ceil(extract(epoch from sub.period_end - now()) / 86400)::integer, 0),
    'full_trial_used', sub.full_trial_until is not null,
    'full_trial_until', case when sub.full_trial_until > now() then sub.full_trial_until end,
    'locked_features', coalesce((select value from platform_settings where key = 'free_locked_features'), '[]'::jsonb)
  );
end $$;
revoke execute on function my_free_plan_state(uuid) from public, anon;
grant execute on function my_free_plan_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hết hạn: chỉ xem. Chặn THÊM bản ghi mới (sửa, kết thúc vụ, hủy vẫn được)
-- ---------------------------------------------------------------------------
create or replace function org_free_expired(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.is_scoped_trial and now() >= s.period_end
                     from subscriptions s where s.organization_id = p_org order by s.period_end desc limit 1), false)
     and (select cs.id from current_subscription(p_org) cs) is null;
$$;
revoke execute on function org_free_expired(uuid) from public, anon;

create or replace function block_free_expired_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); v_org uuid;
begin
  v_org := coalesce(j->>'organization_id', j->>'owner_org_id')::uuid;
  if v_org is not null and org_free_expired(v_org) then
    raise exception 'FREE_EXPIRED: Gói Khởi đầu (miễn phí) đã hết hạn nên chưa ghi thêm được. Dữ liệu của bạn vẫn được giữ và xem được. Hãy nâng cấp để tiếp tục.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger activity_logs_free_expired before insert on activity_logs for each row execute function block_free_expired_write();
create trigger harvest_records_free_expired before insert on harvest_records for each row execute function block_free_expired_write();
create trigger expense_records_free_expired before insert on expense_records for each row execute function block_free_expired_write();
create trigger sales_records_free_expired before insert on sales_records for each row execute function block_free_expired_write();
create trigger inventory_transactions_free_expired before insert on inventory_transactions for each row execute function block_free_expired_write();
create trigger production_cycles_free_expired before insert on production_cycles for each row execute function block_free_expired_write();
create trigger production_areas_free_expired before insert on production_areas for each row execute function block_free_expired_write();

-- ---------------------------------------------------------------------------
-- 3. Khóa tính năng
-- ---------------------------------------------------------------------------
create or replace function org_feature_locked(p_org uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select org_scoped_trial(p_org)
     and coalesce((select value from platform_settings where key = 'free_locked_features'), '[]'::jsonb) ? p_feature;
$$;
revoke execute on function org_feature_locked(uuid, text) from public, anon;

create or replace function block_locked_feature() returns trigger
language plpgsql security definer set search_path = public as $$
declare feat text := tg_argv[0]; v_org uuid := (to_jsonb(new)->>'organization_id')::uuid;
begin
  if v_org is not null and org_feature_locked(v_org, feat) then
    raise exception 'FEATURE_LOCKED: Tính năng này có ở gói trả phí. Vào Cơ sở của tôi → Gói dịch vụ để nâng cấp (hoặc bấm nâng cấp thử đầy đủ 30 ngày).'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger attendance_records_locked before insert on attendance_records for each row execute function block_locked_feature('attendance');
create trigger timesheet_sheets_locked before insert on timesheet_sheets for each row execute function block_locked_feature('attendance');

-- Hạn mức đọc hóa đơn: Khởi đầu (ngoài lượt nâng cấp thử) bị khóa nếu invoice_scan nằm trong danh sách khóa
create or replace function invoice_scan_quota(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st text; lim integer := 0; used integer; sub subscriptions; month_start timestamptz;
begin
  st := org_sub_status(p_org);
  select * into sub from subscriptions where organization_id = p_org order by period_end desc limit 1;
  if st = 'trial' then
    if org_feature_locked(p_org, 'invoice_scan') then
      lim := 0;
    else
      lim := coalesce((select (value #>> '{}')::integer from platform_settings where key = 'invoice_scan_trial_limit'), 2);
    end if;
  elsif st = 'active' and sub.id is not null then
    select coalesce(t.scan_per_month, 0) into lim from plan_tiers t where t.id = sub.plan_tier_id;
  end if;
  month_start := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  select count(*) into used from invoice_scans
   where organization_id = p_org and created_at >= month_start
     and (status = 'ok' or (status = 'pending' and created_at > now() - interval '3 minutes'));
  return jsonb_build_object('status', st, 'limit', lim, 'used', used, 'remaining', greatest(lim - used, 0));
end $$;
revoke execute on function invoice_scan_quota(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Quản trị
-- ---------------------------------------------------------------------------
-- Cấu hình được sửa ở trang quản trị: thêm các khóa của gói Khởi đầu
create or replace function admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare prev jsonb; e record;
begin
  perform admin_guard();
  if p_key not in ('trial_days', 'ranking', 'login_email_domain', 'staff_temp_password_days', 'expiry_reminder_days', 'contact_info',
                   'free_max_areas', 'free_max_cells', 'free_max_staff', 'signup_auto_approve', 'full_trial_days', 'free_locked_features') then
    raise exception 'INVALID_KEY: Cấu hình này không được sửa ở đây.';
  end if;
  if p_key in ('free_max_areas', 'free_max_cells', 'free_max_staff', 'full_trial_days')
     and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 3650) then
    raise exception 'INVALID_VALUE: Hãy nhập số từ 0 đến 3650.';
  end if;
  if p_key = 'signup_auto_approve' and p_value not in ('0'::jsonb, '1'::jsonb, 'true'::jsonb, 'false'::jsonb) then
    raise exception 'INVALID_VALUE: Nhập 1 (bật) hoặc 0 (tắt).';
  end if;
  if p_key = 'free_locked_features' then
    if jsonb_typeof(p_value) <> 'array' then raise exception 'INVALID_VALUE: Hãy nhập danh sách, ví dụ ["attendance","invoice_scan","export_reports"].'; end if;
    for e in select value from jsonb_array_elements(p_value) loop
      if e.value not in ('"attendance"'::jsonb, '"invoice_scan"'::jsonb, '"export_reports"'::jsonb) then
        raise exception 'INVALID_VALUE: Tính năng khóa chỉ gồm "attendance", "invoice_scan" và "export_reports".';
      end if;
    end loop;
  end if;
  if p_key = 'contact_info' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'INVALID_VALUE: Thông tin liên hệ phải là một bộ các mục.'; end if;
    for e in select key, value from jsonb_each(p_value) loop
      if e.key not in ('company', 'address', 'phone', 'zalo', 'website', 'email', 'facebook', 'youtube') then
        raise exception 'INVALID_VALUE: Mục "%" không hợp lệ.', e.key;
      end if;
      if jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 300 then
        raise exception 'INVALID_VALUE: Mục "%" phải là chữ, tối đa 300 ký tự.', e.key;
      end if;
      if e.key in ('website', 'facebook', 'youtube') and (e.value #>> '{}') <> '' and (e.value #>> '{}') !~* '^https?://\S+$' then
        raise exception 'INVALID_VALUE: Đường dẫn "%" phải bắt đầu bằng http:// hoặc https://.', e.key;
      end if;
      if e.key = 'email' and (e.value #>> '{}') <> '' and (e.value #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'INVALID_VALUE: Email chưa đúng dạng.';
      end if;
    end loop;
  end if;
  select value into prev from platform_settings where key = p_key;
  insert into platform_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  perform admin_audit(null, 'set_setting', 'platform_setting', p_key, to_jsonb(prev), p_value, null);
end $$;

-- Khách tiềm năng của gói Khởi đầu. p_filter: 'used' (đã dùng hết số vụ) | 'expiring' (còn <= 30 ngày) | 'expired' | null (tất cả)
create or replace function admin_free_plan_leads(p_filter text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_key) from (
    select o.id, o.name, o.type::text as type,
           (select s2.phone from owner_signups s2 where s2.organization_id = o.id limit 1) as phone,
           s.period_end,
           greatest(ceil(extract(epoch from s.period_end - now()) / 86400)::integer, 0) as days_left,
           (now() >= s.period_end) as expired,
           (s.full_trial_until is not null) as full_trial_used,
           (select count(*) from production_cycles c where c.owner_org_id = o.id and c.status <> 'cancelled') as cycles_used,
           s.max_cycles,
           (select max(received_at) from activity_logs a where a.organization_id = o.id) as last_activity,
           (select count(*) from plan_orders po where po.organization_id = o.id and po.status = 'pending') as pending_orders,
           s.period_end as sort_key
      from organizations o
      join lateral (select * from subscriptions x where x.organization_id = o.id and x.is_scoped_trial order by x.period_end desc limit 1) s on true
     where not exists (select 1 from subscriptions p where p.organization_id = o.id and p.status = 'active' and not p.is_scoped_trial and p.period_end > now())
       and (p_filter is null
            or (p_filter = 'used' and (select count(*) from production_cycles c where c.owner_org_id = o.id and c.status <> 'cancelled') >= s.max_cycles and now() < s.period_end)
            or (p_filter = 'expiring' and now() < s.period_end and s.period_end < now() + interval '30 days')
            or (p_filter = 'expired' and now() >= s.period_end))
  ) r), '[]'::jsonb);
end $$;
revoke execute on function admin_free_plan_leads(text) from public, anon;
grant execute on function admin_free_plan_leads(text) to authenticated;

-- Hàm trigger không gọi trực tiếp được từ API công khai (test anon_surface)
revoke execute on function enforce_free_plan_caps(), block_free_expired_write(), block_locked_feature(),
  block_scoped_trial_publish(), enforce_trial_household_cap(), enforce_cycle_quota() from public, anon, authenticated;
