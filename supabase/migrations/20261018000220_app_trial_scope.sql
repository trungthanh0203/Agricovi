-- D186: gói dùng thử có phạm vi (docs/PLAN_GOI_DUNG_THU.md, bước 1a).
-- Cơ sở mới đăng ký dùng thử: hộ chỉ tạo 1 vụ; HTX chỉ thêm 1 hộ và 1 vụ; không công khai lên website.
-- Ép ở CSDL (trigger). Cơ sở đang dùng thử từ trước KHÔNG đổi: chỉ đăng ký mới có cờ is_scoped_trial.
-- Vụ mẫu xem 24 giờ và khóa tính năng làm ở migration sau.

alter table subscriptions
  add column max_households integer check (max_households is null or max_households > 0),   -- bản chụp; null = không giới hạn
  add column is_scoped_trial boolean not null default false;

insert into platform_settings (key, value, description) values
  ('trial_scope_enabled', 'true'::jsonb, 'Bật phạm vi hẹp cho dùng thử mới (hạn mức vụ/hộ, không công khai website)'),
  ('trial_max_cycles', '1'::jsonb, 'Số vụ tối đa của cơ sở dùng thử mới'),
  ('trial_max_households', '1'::jsonb, 'Số hộ tối đa của HTX dùng thử mới')
  on conflict (key) do nothing;

-- Cấp gói dùng thử: cơ sở mới có phạm vi hẹp (số vụ, số hộ lấy từ cấu hình nền tảng)
create or replace function grant_trial_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tier plan_tiers;
  days integer;
  v_cycles integer;
  v_households integer;
  v_scoped boolean;
begin
  select * into tier from plan_tiers
   where org_type = new.type and is_trial_default and is_active limit 1;
  if tier.id is null then
    return new;
  end if;
  select coalesce((value #>> '{}')::integer, 30) into days from platform_settings where key = 'trial_days';
  select coalesce((value #>> '{}')::integer, 1) into v_cycles from platform_settings where key = 'trial_max_cycles';
  select coalesce((value #>> '{}')::integer, 1) into v_households from platform_settings where key = 'trial_max_households';
  select coalesce((value #>> '{}')::boolean, true) into v_scoped from platform_settings where key = 'trial_scope_enabled';
  insert into subscriptions (organization_id, plan_tier_id, status, max_cycles, price_per_quarter,
                             ranking_weight, period_start, period_end, max_households, is_scoped_trial)
  values (new.id, tier.id, 'trial',
          case when coalesce(v_scoped, true) then greatest(coalesce(v_cycles, 1), 1) else tier.max_cycles end,
          tier.price_per_quarter, tier.ranking_weight, now(), now() + make_interval(days => coalesce(days, 30)),
          case when coalesce(v_scoped, true) and new.type = 'cooperative' then greatest(coalesce(v_households, 1), 1) end,
          coalesce(v_scoped, true));
  return new;
end $$;

-- Cơ sở đang trong dùng thử có phạm vi?
create or replace function org_scoped_trial(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.is_scoped_trial from current_subscription(p_org) s), false);
$$;
revoke execute on function org_scoped_trial(uuid) from public, anon;
grant execute on function org_scoped_trial(uuid) to authenticated;

-- Hạn mức vụ: dùng thử có phạm vi tính TẤT CẢ vụ chưa hủy (kể cả đã kết thúc), để không tạo hết vụ này đến vụ khác
create or replace function enforce_cycle_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions;
  used integer;
begin
  select * into sub from current_subscription(new.owner_org_id);

  if sub.id is not null and sub.is_scoped_trial then
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
  select count(*) into used from production_cycles
   where owner_org_id = new.owner_org_id and status in ('active', 'paused') and id <> new.id;
  if used >= sub.max_cycles then
    raise exception 'QUOTA_EXCEEDED: Đang dùng %/% vụ. Kết thúc một vụ hoặc nâng gói để tạo thêm.', used, sub.max_cycles
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Hạn mức hộ của HTX dùng thử: hộ đang tham gia (và lời mời đang chờ) không quá max_households
create or replace function enforce_trial_household_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions;
  used integer;
begin
  if tg_table_name = 'cooperative_memberships' and to_jsonb(new)->>'status' <> 'active' then return new; end if;
  if tg_table_name = 'cooperative_invitations' and to_jsonb(new)->>'status' <> 'pending' then return new; end if;
  select * into sub from current_subscription(new.cooperative_org_id);
  if sub.id is null or not sub.is_scoped_trial or sub.max_households is null then
    return new;
  end if;
  select count(*) into used from cooperative_memberships where cooperative_org_id = new.cooperative_org_id and status = 'active';
  -- lời mời đang chờ cũng chiếm chỗ, trừ khi chính lời mời đó đang được nhận (hộ tự tham gia): chỉ đếm khi mời mới hoặc HTX tự tạo hộ
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
create trigger coop_memberships_trial_cap before insert on cooperative_memberships
  for each row execute function enforce_trial_household_cap();
create trigger coop_invitations_trial_cap before insert on cooperative_invitations
  for each row execute function enforce_trial_household_cap();

-- Dùng thử có phạm vi không công khai lên website: hồ sơ, vụ, tin giao thương
create or replace function block_scoped_trial_publish() returns trigger
language plpgsql security definer set search_path = public as $$
declare publishing boolean; j jsonb := to_jsonb(new);
begin
  if new.organization_id is null or not org_scoped_trial(new.organization_id) then
    return new;
  end if;
  publishing := case tg_table_name
    when 'public_cycles' then (j->>'is_visible')::boolean
    when 'business_profiles' then j->>'status' in ('pending_review', 'published')
    when 'trade_posts' then j->>'status' in ('pending', 'published')
    else false end;
  if publishing then
    raise exception 'TRIAL_NO_PUBLISH: Tài khoản dùng thử chưa được công khai lên website. Hãy nâng lên gói trả phí để công khai.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger public_cycles_trial_block before insert or update on public_cycles
  for each row execute function block_scoped_trial_publish();
create trigger business_profiles_trial_block before insert or update on business_profiles
  for each row execute function block_scoped_trial_publish();
create trigger trade_posts_trial_block before insert or update on trade_posts
  for each row execute function block_scoped_trial_publish();
