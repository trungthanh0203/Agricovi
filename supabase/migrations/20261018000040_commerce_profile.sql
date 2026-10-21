-- D55: HỒ SƠ THƯƠNG MẠI soạn và xuất bản ngay trong app (giai đoạn 2). Bổ sung thông tin xúc tiến thương mại cho website:
-- giới thiệu, năng lực, phương thức canh tác, liên kết; sản phẩm có quy cách, đơn vị, mùa vụ, giá tham khảo, đặt tối thiểu, liên kết vụ truy xuất;
-- ảnh lưu nén trong cột (như ảnh khác, A33); chứng chỉ lấy từ Giấy phép, chứng chỉ của cơ sở (chủ chọn cái nào hiện công khai);
-- xem trước đúng như website sẽ hiện; gửi duyệt lại khi đã xuất bản.

alter table business_profiles
  add column tagline text check (tagline is null or length(tagline) <= 160),
  add column website_url text check (website_url is null or length(website_url) <= 300),
  add column facebook_url text check (facebook_url is null or length(facebook_url) <= 300),
  add column established_year integer check (established_year is null or established_year between 1900 and 2100),
  add column total_area numeric check (total_area is null or total_area >= 0),
  add column area_unit text not null default 'ha' check (area_unit in ('m2', 'ha')),
  add column practices text check (practices is null or length(practices) <= 500),        -- phương thức canh tác
  add column capacity_note text check (capacity_note is null or length(capacity_note) <= 500); -- năng lực, sản lượng

alter table product_listings
  add column unit text check (unit is null or length(unit) <= 30),                  -- đơn vị bán (kg, thùng...)
  add column season text check (season is null or length(season) <= 120),           -- mùa vụ, ví dụ "Tháng 10 - 12"
  add column price_note text check (price_note is null or length(price_note) <= 120), -- giá tham khảo (chữ tự do)
  add column min_order text check (min_order is null or length(min_order) <= 120),
  add column cycle_id uuid references production_cycles(id) on delete set null;     -- vụ để người mua xem truy xuất

alter table product_images add column image text check (image is null or length(image) <= 400000);
alter table product_images alter column storage_path drop not null;

alter table certification_records add column license_id uuid references org_licenses(id) on delete cascade;
create unique index certification_license_unique on certification_records (license_id) where license_id is not null;

-- Liên hệ đổi thì phải xác nhận lại; chỉ chủ xác nhận thông tin liên hệ
create or replace function bp_contact_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if (new.contact_phone, new.contact_email, new.contact_zalo, new.website_url, new.facebook_url)
         is distinct from (old.contact_phone, old.contact_email, old.contact_zalo, old.website_url, old.facebook_url)
       and new.contact_confirmed_at is not distinct from old.contact_confirmed_at then
      new.contact_confirmed_at := null;
    end if;
    if new.contact_confirmed_at is distinct from old.contact_confirmed_at and new.contact_confirmed_at is not null
       and current_user in ('authenticated') and not has_org_role(new.organization_id, array['owner']::member_role[]) then
      raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xác nhận thông tin liên hệ.';
    end if;
  end if;
  return new;
end $$;
create trigger business_profiles_contact_guard before update on business_profiles for each row execute function bp_contact_guard();

-- ---------------------------------------------------------------------------
-- Bản chụp công khai (website chỉ đọc): thêm thông tin thương mại
-- ---------------------------------------------------------------------------
create or replace function build_profile_snapshot(p_profile uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare bp business_profiles; snap jsonb;
begin
  select * into bp from business_profiles where id = p_profile;
  snap := jsonb_build_object(
    'display_name', bp.display_name, 'tagline', bp.tagline, 'description', bp.description,
    'province', bp.province,
    'district', case when bp.location_precision in ('district', 'commune') then bp.district end,
    'commune',  case when bp.location_precision = 'commune' then bp.commune end,
    'established_year', bp.established_year, 'total_area', bp.total_area, 'area_unit', bp.area_unit,
    'practices', bp.practices, 'capacity_note', bp.capacity_note);
  if 'contact' = any (p_scope) and bp.contact_confirmed_at is not null then
    snap := snap || jsonb_build_object('contact', jsonb_build_object(
      'phone', bp.contact_phone, 'email', bp.contact_email, 'zalo', bp.contact_zalo, 'website', bp.website_url, 'facebook', bp.facebook_url));
  end if;
  if 'images' = any (p_scope) then
    snap := snap || jsonb_build_object('images', coalesce((
      select jsonb_agg(jsonb_build_object('src', coalesce(image, storage_path), 'caption', caption) order by sort_order, created_at)
      from product_images where business_profile_id = p_profile and listing_id is null and is_public_allowed), '[]'::jsonb));
  end if;
  if 'certifications' = any (p_scope) then
    snap := snap || jsonb_build_object('certifications', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'issuer', c.issuer, 'status', c.status, 'number', l.number,
                                          'issued', l.issued_date, 'expires', l.expires_date) order by c.name)
      from certification_records c left join org_licenses l on l.id = c.license_id
      where c.business_profile_id = p_profile and c.listing_id is null), '[]'::jsonb));
  end if;
  return snap;
end $$;

create or replace function build_product_snapshot(p_listing uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pl product_listings; snap jsonb; v_code text;
begin
  select * into pl from product_listings where id = p_listing;
  select code into v_code from public_cycles where cycle_id = pl.cycle_id and is_visible;
  snap := jsonb_build_object('name', pl.name, 'description', pl.description, 'specification', pl.specification,
    'crop_type_id', pl.crop_type_id, 'crop', (select name from crop_types where id = pl.crop_type_id),
    'unit', pl.unit, 'season', pl.season, 'price_note', pl.price_note, 'min_order', pl.min_order, 'trace_code', v_code);
  if 'images' = any (p_scope) then
    snap := snap || jsonb_build_object('images', coalesce((
      select jsonb_agg(jsonb_build_object('src', coalesce(image, storage_path), 'caption', caption) order by sort_order, created_at)
      from product_images where listing_id = p_listing and is_public_allowed), '[]'::jsonb));
  end if;
  if 'certifications' = any (p_scope) then
    snap := snap || jsonb_build_object('certifications', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'issuer', issuer, 'status', status)) from certification_records where listing_id = p_listing), '[]'::jsonb));
  end if;
  return snap;
end $$;

-- ---------------------------------------------------------------------------
-- Xem trước đúng như website sẽ hiện (người soạn hồ sơ và kiểm duyệt viên)
-- ---------------------------------------------------------------------------
create or replace function preview_profile(p_profile uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare bp business_profiles;
begin
  select * into bp from business_profiles where id = p_profile;
  if bp.id is null or not (can_edit_profile(bp.organization_id) or is_platform_reviewer()) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem trước hồ sơ này.';
  end if;
  return jsonb_build_object(
    'profile', build_profile_snapshot(p_profile, coalesce(p_scope, '{}')),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'snapshot', build_product_snapshot(l.id, coalesce(p_scope, '{}')),
                                   'supply_status', so.status, 'supply_updated_on', so.status_updated_on) order by l.created_at)
                            from product_listings l
                            left join lateral (select status, status_updated_on from supply_offers where listing_id = l.id order by created_at desc limit 1) so on true
                           where l.business_profile_id = p_profile and l.include_in_publication), '[]'));
end $$;

-- Gói xem xét cho kiểm duyệt viên: phạm vi chủ đã đồng ý + bản xem trước
create or replace function review_pack(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c publication_consents;
begin
  if not is_platform_reviewer() then raise exception 'FORBIDDEN: Chỉ kiểm duyệt viên được xem.'; end if;
  c := latest_active_consent(p_profile);
  return jsonb_build_object('scope', to_jsonb(c.scope), 'consent_at', c.granted_at, 'preview', preview_profile(p_profile, c.scope));
end $$;

-- ---------------------------------------------------------------------------
-- Gửi duyệt: cho phép gửi lại khi đang xuất bản (bản công khai cũ giữ nguyên tới khi duyệt xong)
-- ---------------------------------------------------------------------------
create or replace function submit_profile_for_review(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare bp business_profiles; consent publication_consents; rid uuid;
begin
  select * into bp from business_profiles where id = p_profile;
  if bp.id is null then raise exception 'NOT_FOUND: Hồ sơ không tồn tại'; end if;
  if not has_org_role(bp.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được gửi duyệt hồ sơ';
  end if;
  if bp.status not in ('draft', 'missing_info', 'pending_consent', 'changes_requested', 'hidden', 'withdrawn', 'published') then
    raise exception 'INVALID_STATE: Hồ sơ đang chờ duyệt rồi, không gửi thêm được.';
  end if;
  if bp.display_name is null or length(trim(bp.display_name)) < 2 or bp.description is null or length(trim(bp.description)) < 20 or bp.province is null then
    raise exception 'MISSING_INFO: Hồ sơ cần có tên, mô tả (ít nhất 20 ký tự) và tỉnh/thành.';
  end if;
  consent := latest_active_consent(p_profile);
  if consent.id is null then
    raise exception 'NO_CONSENT: Cần xác nhận đồng ý công khai trước khi gửi duyệt.';
  end if;
  insert into publication_reviews (business_profile_id, consent_id, submitted_by) values (p_profile, consent.id, auth.uid()) returning id into rid;
  update business_profiles set status = 'pending_review', status_changed_at = now() where id = p_profile;
  return rid;
end $$;

-- approve_and_publish chỉ nhận hồ sơ đang chờ duyệt: giữ nguyên. Hồ sơ đang xuất bản được gửi lại sẽ ở 'pending_review'.
revoke execute on function preview_profile(uuid, text[]), review_pack(uuid), submit_profile_for_review(uuid) from public, anon;
grant execute on function preview_profile(uuid, text[]), review_pack(uuid), submit_profile_for_review(uuid) to authenticated, service_role;
