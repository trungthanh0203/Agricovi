-- AgriConnect - migration khởi đầu: tổ chức, thành viên, HTX-hộ, gói dịch vụ, vụ trồng, hạn mức, RLS.
-- Tham chiếu: v1.1 mục 2, 5, 6; v1.2 mục 3, 4, 9, 10. Đây là KHUNG: các bảng sản xuất/kho/chấm công
-- sẽ thêm ở các migration sau theo backlog.

-- gen_random_uuid() có sẵn trong PostgreSQL 13+, không cần extension.

-- ---------------------------------------------------------------------------
-- Kiểu liệt kê
-- ---------------------------------------------------------------------------
create type org_type as enum ('household', 'cooperative');
create type member_role as enum ('owner', 'manager', 'worker', 'inventory_finance',
                                 'cooperative_manager', 'profile_editor');
create type member_status as enum ('invited', 'active', 'revoked');
create type cycle_status as enum ('preparing', 'active', 'paused', 'ended', 'cancelled');
create type subscription_status as enum ('trial', 'active', 'expired', 'suspended');
create type coop_link_status as enum ('invited', 'active', 'left', 'declined');

-- ---------------------------------------------------------------------------
-- Tiện ích chung
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Quản trị nền tảng (v1.1 mục 2.3). Không mặc định có quyền xem dữ liệu vận hành riêng tư.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Cấu hình nền tảng (admin chỉnh được; không hard-code trong code) - v1.2 mục 3.1
-- ---------------------------------------------------------------------------
create table platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into platform_settings (key, value, description) values
  ('trial_days', '30'::jsonb, 'Số ngày dùng thử khi đăng ký mới'),
  ('expiry_reminder_days', '[14, 7, 1]'::jsonb, 'Nhắc trước khi hết hạn (số ngày)'),
  ('ranking', '{"shuffle_within_group": true, "profile_completeness_weight": 1, "freshness_weight": 1, "freshness_days": 30}'::jsonb,
   'Tham số xếp hạng hiển thị trên website');

-- ---------------------------------------------------------------------------
-- Tổ chức, thành viên
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  type org_type not null,
  name text not null check (length(trim(name)) > 0),
  declared_member_count integer check (declared_member_count is null or declared_member_count >= 0), -- chỉ HTX, hiển thị
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on organizations
  for each row execute function set_updated_at();

create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null,
  status member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on organization_memberships (user_id) where status = 'active';
create trigger org_memberships_updated before update on organization_memberships
  for each row execute function set_updated_at();

create or replace function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid() and status = 'active');
$$;

create or replace function has_org_role(org uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships
    where organization_id = org and user_id = auth.uid() and status = 'active'
      and role = any (roles));
$$;

-- ---------------------------------------------------------------------------
-- Liên kết Hộ - HTX: mỗi hộ tối đa 1 HTX đang hoạt động (FR-COOP-006)
-- ---------------------------------------------------------------------------
create table cooperative_memberships (
  id uuid primary key default gen_random_uuid(),
  household_org_id uuid not null references organizations(id) on delete cascade,
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  status coop_link_status not null default 'invited',
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (household_org_id <> cooperative_org_id)
);
create unique index one_active_coop_per_household
  on cooperative_memberships (household_org_id) where status = 'active';
create trigger coop_memberships_updated before update on cooperative_memberships
  for each row execute function set_updated_at();

create or replace function enforce_coop_link_types() returns trigger language plpgsql as $$
begin
  if (select type from organizations where id = new.household_org_id) <> 'household' then
    raise exception 'household_org_id phải là tổ chức loại hộ';
  end if;
  if (select type from organizations where id = new.cooperative_org_id) <> 'cooperative' then
    raise exception 'cooperative_org_id phải là tổ chức loại HTX';
  end if;
  return new;
end $$;
create trigger coop_link_types before insert or update on cooperative_memberships
  for each row execute function enforce_coop_link_types();

-- ---------------------------------------------------------------------------
-- Gói dịch vụ (v1.2 mục 3). Giá/hạn mức là dữ liệu cấu hình.
-- ---------------------------------------------------------------------------
create table plan_tiers (
  id uuid primary key default gen_random_uuid(),
  org_type org_type not null,
  name text not null,
  max_cycles integer not null check (max_cycles > 0),
  price_per_quarter bigint not null check (price_per_quarter >= 0), -- VND
  ranking_weight numeric not null default 0,
  is_trial_default boolean not null default false, -- gói dùng thử mặc định cho loại tổ chức này
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_trial_default_per_type on plan_tiers (org_type) where is_trial_default;
create trigger plan_tiers_updated before update on plan_tiers
  for each row execute function set_updated_at();

insert into plan_tiers (org_type, name, max_cycles, price_per_quarter, ranking_weight, is_trial_default) values
  ('household',   'Hộ cơ bản',    2,  300000, 1, true),
  ('household',   'Hộ nâng cao',  5,  500000, 2, false),
  ('cooperative', 'HTX cơ bản',   5, 1500000, 3, true),
  ('cooperative', 'HTX nâng cao', 10, 3000000, 4, false);

-- Đăng ký gói: lưu BẢN CHỤP điều khoản tại thời điểm đăng ký (FR-PLAN-007)
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_tier_id uuid not null references plan_tiers(id),
  status subscription_status not null,
  max_cycles integer not null check (max_cycles > 0),            -- snapshot
  price_per_quarter bigint not null check (price_per_quarter >= 0), -- snapshot
  ranking_weight numeric not null default 0,                      -- snapshot
  period_start timestamptz not null,
  period_end timestamptz not null,
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index on subscriptions (organization_id, period_end desc);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

create table payment_records (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete restrict,
  amount bigint not null check (amount >= 0),
  paid_at date not null,
  method text,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Gói đang hiệu lực của một tổ chức (trial/active còn hạn)
create or replace function current_subscription(org uuid)
returns subscriptions language sql stable security definer set search_path = public as $$
  select s.* from subscriptions s
  where s.organization_id = org
    and s.status in ('trial', 'active')
    and now() >= s.period_start and now() < s.period_end
  order by s.period_end desc
  limit 1;
$$;

-- Tự cấp gói dùng thử khi tạo tổ chức (FR-PLAN-004)
create or replace function grant_trial_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tier plan_tiers;
  days integer;
begin
  select * into tier from plan_tiers
   where org_type = new.type and is_trial_default and is_active limit 1;
  if tier.id is null then
    return new; -- chưa cấu hình gói dùng thử: tổ chức không có gói, không tạo được vụ
  end if;
  select coalesce((value #>> '{}')::integer, 30) into days from platform_settings where key = 'trial_days';
  insert into subscriptions (organization_id, plan_tier_id, status, max_cycles, price_per_quarter,
                             ranking_weight, period_start, period_end)
  values (new.id, tier.id, 'trial', tier.max_cycles, tier.price_per_quarter,
          tier.ranking_weight, now(), now() + make_interval(days => coalesce(days, 30)));
  return new;
end $$;
create trigger organizations_grant_trial after insert on organizations
  for each row execute function grant_trial_subscription();

-- Người tạo tổ chức tự thành owner
create or replace function add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into organization_memberships (organization_id, user_id, role, status)
    values (new.id, new.created_by, 'owner', 'active')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger organizations_creator_owner after insert on organizations
  for each row execute function add_creator_as_owner();

-- ---------------------------------------------------------------------------
-- Danh mục cây trồng, khu trồng, vụ trồng (lõi tối thiểu)
-- ---------------------------------------------------------------------------
create table crop_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into crop_types (code, name) values ('melon', 'Dưa lưới');

create table production_areas (
  id uuid primary key,  -- UUID có thể tạo ở thiết bị (offline)
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on production_areas (organization_id);
create trigger production_areas_updated before update on production_areas
  for each row execute function set_updated_at();

create table production_cycles (
  id uuid primary key,  -- UUID có thể tạo ở thiết bị (offline) => upsert idempotent
  owner_org_id uuid not null references organizations(id) on delete cascade, -- chủ sở hữu dữ liệu & hạn mức
  area_id uuid not null references production_areas(id),
  crop_type_id uuid not null references crop_types(id),
  status cycle_status not null default 'preparing',
  start_date date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on production_cycles (owner_org_id, status);
create trigger production_cycles_updated before update on production_cycles
  for each row execute function set_updated_at();

-- Hạn mức vụ đồng thời (FR-PLAN-003). Ép ở CSDL: không lách được bằng offline hay gọi API trực tiếp.
-- Vụ 'active' và 'paused' được tính; 'preparing', 'ended', 'cancelled' thì không.
create or replace function enforce_cycle_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions;
  used integer;
begin
  if new.status not in ('active', 'paused') then
    return new;
  end if;
  -- Chỉ kiểm tra khi vụ MỚI đi vào trạng thái tính hạn mức (insert, hoặc chuyển từ trạng thái không tính)
  if tg_op = 'UPDATE' and old.status in ('active', 'paused') and old.owner_org_id = new.owner_org_id then
    return new;
  end if;

  select * into sub from current_subscription(new.owner_org_id);
  if sub.id is null then
    raise exception 'QUOTA_NO_SUBSCRIPTION: Tổ chức chưa có gói còn hiệu lực. Vui lòng gia hạn hoặc nâng gói để tạo vụ mới.'
      using errcode = 'P0001';
  end if;

  select count(*) into used from production_cycles
   where owner_org_id = new.owner_org_id
     and status in ('active', 'paused')
     and id <> new.id;

  if used >= sub.max_cycles then
    raise exception 'QUOTA_EXCEEDED: Đang dùng %/% vụ. Kết thúc một vụ hoặc nâng gói để tạo thêm.', used, sub.max_cycles
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger production_cycles_quota before insert or update of status, owner_org_id on production_cycles
  for each row execute function enforce_cycle_quota();

-- ---------------------------------------------------------------------------
-- Audit (khung dùng chung) - NFR-SEC-005
-- ---------------------------------------------------------------------------
create table audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index on audit_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS (NFR-SEC-002, NFR-SEC-009). Mặc định từ chối; chỉ mở đúng phạm vi.
-- ---------------------------------------------------------------------------
alter table platform_admins enable row level security;
alter table platform_settings enable row level security;
alter table organizations enable row level security;
alter table organization_memberships enable row level security;
alter table cooperative_memberships enable row level security;
alter table plan_tiers enable row level security;
alter table subscriptions enable row level security;
alter table payment_records enable row level security;
alter table crop_types enable row level security;
alter table production_areas enable row level security;
alter table production_cycles enable row level security;
alter table audit_events enable row level security;

-- platform_admins: không ai đọc qua API (chỉ hàm security definer is_platform_admin)

-- platform_settings: người đăng nhập đọc; chỉ admin sửa
create policy settings_read on platform_settings for select to authenticated using (true);
create policy settings_admin_write on platform_settings for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- organizations
create policy org_read on organizations for select to authenticated
  using (is_org_member(id) or is_platform_admin());
create policy org_insert on organizations for insert to authenticated
  with check (created_by = auth.uid());
create policy org_update on organizations for update to authenticated
  using (has_org_role(id, array['owner']::member_role[]))
  with check (has_org_role(id, array['owner']::member_role[]));

-- memberships: thành viên thấy danh sách của tổ chức mình; owner quản lý
create policy memb_read on organization_memberships for select to authenticated
  using (is_org_member(organization_id) or user_id = auth.uid());
create policy memb_owner_write on organization_memberships for all to authenticated
  using (has_org_role(organization_id, array['owner']::member_role[]))
  with check (has_org_role(organization_id, array['owner']::member_role[]));

-- liên kết hộ-HTX: hai bên đều thấy; hộ owner hoặc HTX owner/cooperative_manager quản lý
create policy coop_read on cooperative_memberships for select to authenticated
  using (is_org_member(household_org_id) or is_org_member(cooperative_org_id));
create policy coop_write on cooperative_memberships for all to authenticated
  using (has_org_role(household_org_id, array['owner']::member_role[])
      or has_org_role(cooperative_org_id, array['owner', 'cooperative_manager']::member_role[]))
  with check (has_org_role(household_org_id, array['owner']::member_role[])
      or has_org_role(cooperative_org_id, array['owner', 'cooperative_manager']::member_role[]));

-- gói: ai đăng nhập đọc được danh mục gói đang bán; chỉ admin sửa
create policy tiers_read on plan_tiers for select to authenticated using (is_active or is_platform_admin());
create policy tiers_admin_write on plan_tiers for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- đăng ký gói & thanh toán: thành viên tổ chức đọc; chỉ admin ghi (thu tiền thủ công)
create policy subs_read on subscriptions for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());
create policy subs_admin_write on subscriptions for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy pay_read on payment_records for select to authenticated
  using (is_platform_admin() or exists (
    select 1 from subscriptions s where s.id = subscription_id and has_org_role(s.organization_id, array['owner']::member_role[])));
create policy pay_admin_write on payment_records for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- danh mục cây: đọc chung; admin sửa
create policy crop_read on crop_types for select to authenticated using (true);
create policy crop_admin_write on crop_types for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- khu trồng & vụ: chỉ thành viên của tổ chức sở hữu. Vụ riêng của hộ KHÔNG hiển thị cho HTX (FR-COOP-010)
-- vì tổ chức sở hữu là hộ và HTX không phải thành viên của tổ chức đó.
create policy areas_read on production_areas for select to authenticated
  using (is_org_member(organization_id));
create policy areas_write on production_areas for all to authenticated
  using (has_org_role(organization_id, array['owner', 'manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner', 'manager']::member_role[]));

create policy cycles_read on production_cycles for select to authenticated
  using (is_org_member(owner_org_id));
create policy cycles_write on production_cycles for all to authenticated
  using (has_org_role(owner_org_id, array['owner', 'manager']::member_role[]))
  with check (has_org_role(owner_org_id, array['owner', 'manager']::member_role[]));

-- audit: chủ tổ chức đọc; ghi qua hàm/trigger security definer, không ghi trực tiếp từ client
create policy audit_read on audit_events for select to authenticated
  using (has_org_role(organization_id, array['owner']::member_role[]) or is_platform_admin());
