-- Hồ sơ thương mại và website công khai. Tham chiếu: v1.1 mục 3.6, 4.7, 4.8, 5.4, 9; v1.2 mục 5.
-- Nguyên tắc: website chỉ đọc public_* (bản chụp bất biến đã duyệt). "Đã xuất bản" != "đã xác minh chất lượng".

create table platform_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_reviewers enable row level security; -- không policy: chỉ truy cập qua hàm

create or replace function is_platform_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_reviewers where user_id = auth.uid());
$$;

create type publication_status as enum
  ('draft', 'missing_info', 'pending_consent', 'pending_review', 'published', 'changes_requested', 'hidden', 'withdrawn');
create type location_precision as enum ('province', 'district', 'commune');
create type supply_status as enum ('producing', 'expected', 'available', 'out_of_stock', 'paused');
create type cert_status as enum ('self_declared', 'document_received', 'document_checked', 'verified', 'expired_or_unverifiable');
create type inquiry_status as enum ('new', 'read', 'replied', 'spam');
create type review_decision as enum ('approved', 'rejected', 'changes_requested');
create type service_request_status as enum ('requested', 'accepted', 'in_progress', 'awaiting_owner_confirmation', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Dữ liệu NỘI BỘ của hồ sơ (bản nháp, chỉnh sửa tự do trước khi xuất bản)
-- ---------------------------------------------------------------------------
create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  slug text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  description text,
  province text,
  district text,
  commune text,
  location_precision location_precision not null default 'province', -- mức địa chỉ công khai do cơ sở chọn
  contact_phone text,
  contact_email text,
  contact_zalo text,
  contact_confirmed_at timestamptz,             -- thông tin liên hệ đã được cơ sở xác nhận
  status publication_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger business_profiles_updated before update on business_profiles for each row execute function set_updated_at();
create trigger business_profiles_bump before update on business_profiles for each row execute function bump_version();

create table product_listings (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  crop_type_id uuid references crop_types(id),
  name text not null,
  description text,
  specification text,                            -- quy cách
  include_in_publication boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on product_listings (business_profile_id);
create trigger product_listings_updated before update on product_listings for each row execute function set_updated_at();

create table product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  listing_id uuid references product_listings(id) on delete cascade,
  storage_path text not null,
  caption text,
  is_public_allowed boolean not null default false,  -- ảnh chưa cho phép thì không bao giờ ra website
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Tình trạng cung ứng: lịch sử chỉ thêm; mỗi dòng có ngày cập nhật (FR-WEB-010)
create table supply_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references product_listings(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  status supply_status not null,
  expected_from date,
  expected_to date,
  capacity_note text,
  status_updated_on date not null default current_date,
  confirmed_by_org boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (expected_to is null or expected_from is null or expected_to >= expected_from),
  -- "Đang có hàng" phải do cơ sở xác nhận, không suy ra từ dữ liệu dự kiến (FR-WEB-010)
  check (status <> 'available' or confirmed_by_org)
);
create index on supply_offers (listing_id, created_at desc);

create table certification_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  listing_id uuid references product_listings(id) on delete cascade,
  name text not null,
  issuer text,
  status cert_status not null default 'self_declared',
  document_path text,
  verification_basis text,                       -- căn cứ/quy trình xác minh
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'verified' or (verification_basis is not null and checked_by is not null and checked_at is not null)),
  check (status <> 'document_checked' or (checked_by is not null and checked_at is not null))
);

-- Chỉ kiểm duyệt viên nền tảng mới được nâng trạng thái chứng nhận quá "đã nhận tài liệu" (FR-WEB-011)
-- (không dùng security definer để current_user phản ánh vai trò người gọi)
create or replace function cert_status_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('document_checked', 'verified', 'expired_or_unverifiable')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not (is_platform_reviewer() or current_user in ('postgres', 'service_role')) then
    raise exception 'CERT_FORBIDDEN: Chỉ kiểm duyệt viên nền tảng được đặt trạng thái %', new.status;
  end if;
  return new;
end $$;
create trigger cert_status_guard_trg before insert or update on certification_records
  for each row execute function cert_status_guard();

create table publication_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  scope text[] not null,                         -- 'profile','contact','images','certifications'
  text_version text not null,                    -- phiên bản nội dung đồng ý đã hiển thị
  granted_by uuid not null references auth.users(id) default auth.uid(),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (scope <@ array['profile','contact','images','certifications']::text[]),
  check (array_length(scope, 1) >= 1)
);
create index on publication_consents (business_profile_id, granted_at desc);

create table publication_reviews (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  consent_id uuid references publication_consents(id),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewer_id uuid references auth.users(id),
  decision review_decision,
  note text,
  decided_at timestamptz
);

create table profile_service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_profile_id uuid references business_profiles(id),
  status service_request_status not null default 'requested',
  scope text,
  assigned_to uuid references auth.users(id),
  authorized_at timestamptz,                     -- cơ sở ủy quyền hỗ trợ biên tập
  authorization_scope text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid references product_listings(id) on delete set null,
  sender_name text not null,
  sender_phone text,
  sender_email text,
  message text not null check (length(message) between 1 and 2000),
  status inquiry_status not null default 'new',
  created_at timestamptz not null default now(),
  check (sender_phone is not null or sender_email is not null)
);
create index on contact_inquiries (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Dữ liệu CÔNG KHAI: bản chụp bất biến do hàm xuất bản tạo. Website chỉ đọc các bảng này.
-- ---------------------------------------------------------------------------
create table public_profiles (
  profile_id uuid primary key references business_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null unique,
  snapshot jsonb not null,
  is_visible boolean not null default true,
  review_id uuid references publication_reviews(id),
  published_at timestamptz not null default now(),
  version integer not null default 1
);

create table public_products (
  listing_id uuid primary key references product_listings(id) on delete cascade,
  profile_id uuid not null references public_profiles(profile_id) on delete cascade,
  snapshot jsonb not null,
  supply_status supply_status,
  supply_updated_on date,
  is_visible boolean not null default true
);
create index on public_products (profile_id);

create or replace function slugify(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(t,
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Dựng bản chụp từ dữ liệu nháp, CHỈ gồm nhóm thông tin có trong phạm vi đồng ý (FR-WEB-007/013)
create or replace function build_profile_snapshot(p_profile uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare bp business_profiles; snap jsonb;
begin
  select * into bp from business_profiles where id = p_profile;
  snap := jsonb_build_object(
    'display_name', bp.display_name,
    'description', bp.description,
    'province', bp.province,
    'district', case when bp.location_precision in ('district','commune') then bp.district end,
    'commune',  case when bp.location_precision = 'commune' then bp.commune end);
  if 'contact' = any (p_scope) and bp.contact_confirmed_at is not null then
    snap := snap || jsonb_build_object('contact', jsonb_build_object(
      'phone', bp.contact_phone, 'email', bp.contact_email, 'zalo', bp.contact_zalo));
  end if;
  if 'images' = any (p_scope) then
    snap := snap || jsonb_build_object('images', coalesce((
      select jsonb_agg(jsonb_build_object('path', storage_path, 'caption', caption) order by sort_order)
      from product_images where business_profile_id = p_profile and listing_id is null and is_public_allowed), '[]'::jsonb));
  end if;
  if 'certifications' = any (p_scope) then
    snap := snap || jsonb_build_object('certifications', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'issuer', issuer, 'status', status))
      from certification_records where business_profile_id = p_profile and listing_id is null), '[]'::jsonb));
  end if;
  return snap;
end $$;

create or replace function build_product_snapshot(p_listing uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pl product_listings; snap jsonb;
begin
  select * into pl from product_listings where id = p_listing;
  snap := jsonb_build_object('name', pl.name, 'description', pl.description, 'specification', pl.specification,
    'crop_type_id', pl.crop_type_id);
  if 'images' = any (p_scope) then
    snap := snap || jsonb_build_object('images', coalesce((
      select jsonb_agg(jsonb_build_object('path', storage_path, 'caption', caption) order by sort_order)
      from product_images where listing_id = p_listing and is_public_allowed), '[]'::jsonb));
  end if;
  if 'certifications' = any (p_scope) then
    snap := snap || jsonb_build_object('certifications', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'issuer', issuer, 'status', status))
      from certification_records where listing_id = p_listing), '[]'::jsonb));
  end if;
  return snap;
end $$;

-- ---------------------------------------------------------------------------
-- Quy trình: gửi duyệt (chủ cơ sở) -> duyệt & xuất bản (kiểm duyệt viên) -> ẩn/rút
-- ---------------------------------------------------------------------------
create or replace function latest_active_consent(p_profile uuid) returns publication_consents
language sql stable security definer set search_path = public as $$
  select c.* from publication_consents c
   where c.business_profile_id = p_profile and c.revoked_at is null
   order by c.granted_at desc limit 1;
$$;

create or replace function submit_profile_for_review(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare bp business_profiles; consent publication_consents; rid uuid;
begin
  select * into bp from business_profiles where id = p_profile;
  if bp.id is null then raise exception 'Hồ sơ không tồn tại'; end if;
  -- chỉ chủ cơ sở gửi duyệt; nhân viên hỗ trợ không xác nhận thay (v1.1 3.6)
  if not has_org_role(bp.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được gửi duyệt hồ sơ';
  end if;
  if bp.status not in ('draft', 'missing_info', 'pending_consent', 'changes_requested', 'hidden', 'withdrawn') then
    raise exception 'INVALID_STATE: Không thể gửi duyệt ở trạng thái %', bp.status;
  end if;
  if bp.display_name is null or bp.description is null or bp.province is null then
    update business_profiles set status = 'missing_info', status_changed_at = now() where id = p_profile;
    raise exception 'MISSING_INFO: Hồ sơ thiếu tên, mô tả hoặc tỉnh/thành';
  end if;
  consent := latest_active_consent(p_profile);
  if consent.id is null then
    update business_profiles set status = 'pending_consent', status_changed_at = now() where id = p_profile;
    raise exception 'NO_CONSENT: Cần xác nhận đồng ý công khai trước khi gửi duyệt';
  end if;
  insert into publication_reviews (business_profile_id, consent_id, submitted_by)
    values (p_profile, consent.id, auth.uid()) returning id into rid;
  update business_profiles set status = 'pending_review', status_changed_at = now() where id = p_profile;
  return rid;
end $$;

create or replace function approve_and_publish(p_profile uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare bp business_profiles; consent publication_consents; rv publication_reviews; v_slug text; pl record;
begin
  if not is_platform_reviewer() then raise exception 'FORBIDDEN: Chỉ kiểm duyệt viên được duyệt hồ sơ'; end if;
  select * into bp from business_profiles where id = p_profile for update;
  if bp.status <> 'pending_review' then raise exception 'INVALID_STATE: Hồ sơ không ở trạng thái chờ duyệt'; end if;
  consent := latest_active_consent(p_profile);
  if consent.id is null then raise exception 'NO_CONSENT: Sự đồng ý công khai đã bị rút hoặc chưa có'; end if;

  select * into rv from publication_reviews
   where business_profile_id = p_profile and decision is null order by submitted_at desc limit 1 for update;
  update publication_reviews set decision = 'approved', reviewer_id = auth.uid(), note = p_note, decided_at = now()
   where id = rv.id;

  v_slug := coalesce(bp.slug, slugify(bp.display_name));
  if exists (select 1 from business_profiles where slug = v_slug and id <> p_profile) then
    v_slug := v_slug || '-' || substr(replace(p_profile::text, '-', ''), 1, 6);
  end if;
  update business_profiles set slug = v_slug, status = 'published', status_changed_at = now() where id = p_profile;

  insert into public_profiles (profile_id, organization_id, slug, snapshot, review_id)
    values (p_profile, bp.organization_id, v_slug, build_profile_snapshot(p_profile, consent.scope), rv.id)
  on conflict (profile_id) do update
    set slug = excluded.slug, snapshot = excluded.snapshot, is_visible = true,
        review_id = excluded.review_id, published_at = now(), version = public_profiles.version + 1;

  -- sản phẩm: xóa bản chụp cũ rồi dựng lại từ các sản phẩm được phép công khai
  delete from public_products where profile_id = p_profile;
  for pl in select id from product_listings where business_profile_id = p_profile and include_in_publication loop
    insert into public_products (listing_id, profile_id, snapshot, supply_status, supply_updated_on)
    select pl.id, p_profile, build_product_snapshot(pl.id, consent.scope),
           so.status, so.status_updated_on
    from (select 1) x
    left join lateral (select status, status_updated_on from supply_offers
                        where listing_id = pl.id order by created_at desc limit 1) so on true;
  end loop;
end $$;

create or replace function review_profile(p_profile uuid, p_decision review_decision, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare rv publication_reviews;
begin
  if not is_platform_reviewer() then raise exception 'FORBIDDEN: Chỉ kiểm duyệt viên được xử lý hồ sơ'; end if;
  if p_decision = 'approved' then raise exception 'Dùng approve_and_publish cho quyết định duyệt'; end if;
  if p_note is null or length(trim(p_note)) = 0 then raise exception 'Cần ghi lý do để cơ sở chỉnh sửa'; end if;
  select * into rv from publication_reviews
   where business_profile_id = p_profile and decision is null order by submitted_at desc limit 1 for update;
  if rv.id is null then raise exception 'INVALID_STATE: Không có yêu cầu duyệt đang chờ'; end if;
  update publication_reviews set decision = p_decision, reviewer_id = auth.uid(), note = p_note, decided_at = now() where id = rv.id;
  update business_profiles set status = 'changes_requested', status_changed_at = now() where id = p_profile;
end $$;

-- Cơ sở rút đồng ý / tạm ẩn / ngừng công khai (FR-WEB-012, NFR-SEC-006). Có hiệu lực ngay lập tức.
create or replace function hide_profile(p_profile uuid, p_withdraw boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare bp business_profiles;
begin
  select * into bp from business_profiles where id = p_profile for update;
  if bp.id is null then raise exception 'Hồ sơ không tồn tại'; end if;
  if not (has_org_role(bp.organization_id, array['owner']::member_role[]) or is_platform_reviewer()) then
    raise exception 'FORBIDDEN';
  end if;
  update public_profiles set is_visible = false where profile_id = p_profile;
  update public_products set is_visible = false where profile_id = p_profile;
  if p_withdraw then
    update publication_consents set revoked_at = now(), revoked_by = auth.uid()
     where business_profile_id = p_profile and revoked_at is null;
  end if;
  update business_profiles set status = case when p_withdraw then 'withdrawn' else 'hidden' end::publication_status,
         status_changed_at = now() where id = p_profile;
end $$;

-- Cập nhật tình trạng cung ứng trên bản chụp công khai (chỉ trường cung ứng, không đụng nội dung đã duyệt)
create or replace function propagate_supply() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public_products set supply_status = new.status, supply_updated_on = new.status_updated_on
   where listing_id = new.listing_id;
  return new;
end $$;
create trigger supply_offers_propagate after insert on supply_offers
  for each row execute function propagate_supply();

-- ---------------------------------------------------------------------------
-- Danh bạ công khai + xếp hạng theo gói (kiểu "a": mọi hồ sơ đã duyệt đều hiện; gói chỉ ưu tiên thứ tự)
-- ---------------------------------------------------------------------------
-- Quyền EXECUTE của hàm trong view được kiểm tra theo NGƯỜI GỌI (anon), không theo chủ view.
-- Vì vậy dùng một hàm hẹp chỉ trả hệ số ưu tiên (không lộ giá/hạn gói) và chỉ cấp hàm này cho anon.
create or replace function public_org_priority(org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select (current_subscription(org)).ranking_weight;
$$;

create view public_directory as
with cfg as (
  select coalesce((value->>'freshness_days')::int, 30)             as freshness_days,
         coalesce((value->>'profile_completeness_weight')::numeric, 1) as cw,
         coalesce((value->>'freshness_weight')::numeric, 1)        as fw
  from platform_settings where key = 'ranking'
  union all select 30, 1, 1 where not exists (select 1 from platform_settings where key = 'ranking')
  limit 1
), base as (
  select p.profile_id, p.slug, p.snapshot, p.published_at, p.organization_id,
         s.w is not null as has_plan, coalesce(s.w, 0) as plan_weight,
         (case when coalesce(p.snapshot->>'description','') <> '' then 1 else 0 end)
         + (case when jsonb_array_length(coalesce(p.snapshot->'images','[]'::jsonb)) > 0 then 1 else 0 end)
         + (case when p.snapshot ? 'contact' then 1 else 0 end)
         + (case when exists (select 1 from public_products pp where pp.profile_id = p.profile_id and pp.is_visible) then 1 else 0 end)
           as completeness,
         exists (select 1 from public_products pp, cfg
                  where pp.profile_id = p.profile_id and pp.is_visible
                    and pp.supply_updated_on >= current_date - cfg.freshness_days) as fresh
  from public_profiles p
  left join lateral (select public_org_priority(p.organization_id) as w) s on true
  where p.is_visible
)
select b.profile_id, b.slug,
       b.snapshot->>'display_name' as display_name,
       b.snapshot->>'province'     as province,
       b.snapshot->>'district'     as district,
       b.snapshot->>'description'  as description,
       b.published_at,
       -- ưu tiên chỉ khi gói còn hạn VÀ thông tin cung ứng còn mới (điều kiện hưởng ưu tiên, v1.2 mục 5.3)
       (b.has_plan and b.fresh and b.plan_weight > 0) as is_priority,
       b.completeness, b.fresh, b.plan_weight,
       (case when b.has_plan and b.fresh then b.plan_weight else 0 end) * 1000
         + b.completeness * (select cw from cfg) + (case when b.fresh then 1 else 0 end) * (select fw from cfg) as rank_score
from base b;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table business_profiles enable row level security;
alter table product_listings enable row level security;
alter table product_images enable row level security;
alter table supply_offers enable row level security;
alter table certification_records enable row level security;
alter table publication_consents enable row level security;
alter table publication_reviews enable row level security;
alter table profile_service_requests enable row level security;
alter table contact_inquiries enable row level security;
alter table public_profiles enable row level security;
alter table public_products enable row level security;

-- vai trò được sửa nội dung hồ sơ: chủ, quản lý, biên tập hồ sơ
create or replace function can_edit_profile(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(org, array['owner','manager','profile_editor']::member_role[]);
$$;

create policy bp_read on business_profiles for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy bp_insert on business_profiles for insert to authenticated
  with check (can_edit_profile(organization_id) and status = 'draft');
-- Cập nhật nội dung: không được tự đặt trạng thái xuất bản (chỉ qua hàm). Trigger bên dưới giữ nguyên status.
create policy bp_update on business_profiles for update to authenticated
  using (can_edit_profile(organization_id)) with check (can_edit_profile(organization_id));

create or replace function protect_profile_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and current_user in ('authenticated', 'anon') then
    raise exception 'FORBIDDEN: Trạng thái hồ sơ chỉ đổi qua quy trình gửi duyệt/xuất bản';
  end if;
  return new;
end $$;
create trigger business_profiles_protect before update on business_profiles
  for each row execute function protect_profile_status();

create policy pl_read on product_listings for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy pl_write on product_listings for all to authenticated
  using (can_edit_profile(organization_id)) with check (can_edit_profile(organization_id));

create policy pi_read on product_images for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy pi_write on product_images for all to authenticated
  using (can_edit_profile(organization_id)) with check (can_edit_profile(organization_id));

create policy so_read on supply_offers for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy so_insert on supply_offers for insert to authenticated
  with check (can_edit_profile(organization_id));
-- lịch sử cung ứng chỉ thêm: không update/delete

create policy cert_read on certification_records for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy cert_write on certification_records for all to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer())
  with check (can_edit_profile(organization_id) or is_platform_reviewer());

-- Đồng ý công khai: CHỈ chủ cơ sở được xác nhận (nhân viên hỗ trợ không xác nhận thay)
create policy consent_read on publication_consents for select to authenticated
  using (can_edit_profile(organization_id) or is_platform_reviewer());
create policy consent_insert on publication_consents for insert to authenticated
  with check (has_org_role(organization_id, array['owner']::member_role[]) and granted_by = auth.uid());
create policy consent_revoke on publication_consents for update to authenticated
  using (has_org_role(organization_id, array['owner']::member_role[]))
  with check (has_org_role(organization_id, array['owner']::member_role[]));

create policy review_read on publication_reviews for select to authenticated
  using (is_platform_reviewer()
         or exists (select 1 from business_profiles b where b.id = business_profile_id and can_edit_profile(b.organization_id)));
-- ghi qua hàm security definer

create policy psr_read on profile_service_requests for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());
create policy psr_insert on profile_service_requests for insert to authenticated
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));
create policy psr_update on profile_service_requests for update to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]) or is_platform_admin())
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]) or is_platform_admin());

-- Liên hệ từ người mua: ghi qua Edge Function (Turnstile + service_role). Cơ sở đọc/xử lý của mình.
create policy inquiry_read on contact_inquiries for select to authenticated
  using (can_edit_profile(organization_id));
create policy inquiry_update on contact_inquiries for update to authenticated
  using (can_edit_profile(organization_id)) with check (can_edit_profile(organization_id));

-- Dữ liệu công khai: ai cũng đọc được phần đang hiển thị
create policy public_profiles_read on public_profiles for select to anon, authenticated using (is_visible);
create policy public_products_read on public_products for select to anon, authenticated using (is_visible);
