-- W3 (D60–D61, D65): TÀI KHOẢN TRÊN WEBSITE. Người mua tự đăng ký (email hoặc số điện thoại); chủ cơ sở dùng tài khoản app; nhân viên (tài khoản số điện thoại do chủ tạo)
-- KHÔNG dùng website (ép ở CSDL). Lưu nhà cung cấp/sản phẩm yêu thích, sổ địa chỉ, "Gian hàng của tôi" (sửa nhanh tình trạng cung ứng, nhận yêu cầu báo giá).
-- Đăng nhập bằng số điện thoại dùng lại cơ chế email ẩn n@sdt.<tên miền> của nhân viên (login_email_for_phone); số điện thoại CHƯA xác minh OTP nên không dùng làm bằng chứng danh tính.

create table buyer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  buyer_kind text not null default 'individual' check (buyer_kind in ('individual', 'restaurant', 'trader', 'business', 'farm')),
  company text check (length(company) <= 120),
  tax_code text check (length(tax_code) <= 20),
  phone text check (length(phone) <= 20),
  login_kind text not null default 'email' check (login_kind in ('email', 'phone')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  blocked_reason text check (length(blocked_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on buyer_profiles (created_at desc);
alter table buyer_profiles enable row level security;
create policy buyer_profiles_own on buyer_profiles for select to authenticated using (user_id = auth.uid());

create table buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  recipient text not null check (length(trim(recipient)) between 2 and 80),
  phone text not null check (length(phone) between 8 and 20),
  province text not null check (length(trim(province)) between 1 and 60),
  district text check (length(district) <= 60),
  address text not null check (length(trim(address)) between 3 and 200),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on buyer_addresses (user_id);
alter table buyer_addresses enable row level security;
create policy buyer_addresses_own on buyer_addresses for select to authenticated using (user_id = auth.uid());

create table favorite_suppliers (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public_profiles(profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);
create table favorite_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public_products(listing_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table favorite_suppliers enable row level security;
alter table favorite_products enable row level security;
create policy favorite_suppliers_own on favorite_suppliers for select to authenticated using (user_id = auth.uid());
create policy favorite_products_own on favorite_products for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cổng kiểm tra: mọi chức năng website của người dùng đi qua đây
-- ---------------------------------------------------------------------------
create or replace function is_web_user() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not exists (select 1 from staff_accounts where user_id = auth.uid())
     and not exists (select 1 from buyer_profiles where user_id = auth.uid() and status = 'blocked');
$$;

create or replace function web_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH: Hãy đăng nhập để tiếp tục.'; end if;
  if exists (select 1 from staff_accounts where user_id = auth.uid()) then
    raise exception 'FORBIDDEN: Tài khoản nhân viên không dùng website. Hãy dùng ứng dụng AgriConnect.';
  end if;
  if exists (select 1 from buyer_profiles where user_id = auth.uid() and status = 'blocked') then
    raise exception 'FORBIDDEN: Tài khoản đã bị khóa. Vui lòng liên hệ quản trị.';
  end if;
end $$;

-- Thông tin tài khoản của tôi trên website (nhân viên được báo cờ staff để website đăng xuất, không báo lỗi)
create or replace function get_my_web_account() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u jsonb; bp buyer_profiles; orgs jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH: Hãy đăng nhập để tiếp tục.'; end if;
  if exists (select 1 from staff_accounts where user_id = auth.uid()) then return jsonb_build_object('staff', true); end if;
  select to_jsonb(x) into u from auth.users x where x.id = auth.uid();
  select * into bp from buyer_profiles where user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'type', o.type, 'is_owner', 'owner'::member_role = any (m.roles)) order by o.name), '[]') into orgs
    from organization_memberships m join organizations o on o.id = m.organization_id
   where m.user_id = auth.uid() and m.status = 'active' and can_edit_profile(o.id);
  return jsonb_build_object(
    'staff', false, 'user_id', auth.uid(),
    'email', case when bp.login_kind = 'phone' then null else u->>'email' end,
    'email_verified', coalesce(bp.login_kind = 'email' and u->>'email_confirmed_at' is not null, false),
    'profile', case when bp.user_id is null then null else to_jsonb(bp) - 'blocked_reason' end,
    'orgs', orgs);
end $$;

-- Tạo hồ sơ người mua ở lần đăng nhập đầu (từ thông tin đăng ký lưu trong tài khoản); chạy lại nhiều lần không sao
create or replace function ensure_buyer_profile(p_name text default null, p_kind text default null, p_company text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u jsonb; meta jsonb; nm text; kd text; lk text;
begin
  perform web_guard();
  if not exists (select 1 from buyer_profiles where user_id = auth.uid()) then
    select to_jsonb(x) into u from auth.users x where x.id = auth.uid();
    meta := coalesce(u->'raw_user_meta_data', '{}'::jsonb);
    nm := nullif(trim(coalesce(p_name, meta->>'full_name', split_part(coalesce(u->>'email', ''), '@', 1))), '');
    if nm is null or length(nm) < 2 then raise exception 'INVALID: Hãy nhập họ tên (ít nhất 2 ký tự).'; end if;
    kd := coalesce(nullif(p_kind, ''), meta->>'buyer_kind', 'individual');
    if kd not in ('individual', 'restaurant', 'trader', 'business', 'farm') then kd := 'individual'; end if;
    lk := case when meta->>'login_kind' = 'phone' then 'phone' else 'email' end;
    insert into buyer_profiles (user_id, full_name, buyer_kind, company, phone, login_kind)
    values (auth.uid(), left(nm, 80), kd, nullif(left(trim(coalesce(p_company, meta->>'company', '')), 120), ''), nullif(left(meta->>'phone', 20), ''), lk);
  end if;
  return get_my_web_account();
end $$;

create or replace function update_my_buyer_profile(p_name text, p_kind text, p_company text, p_tax text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID: Hãy nhập họ tên (ít nhất 2 ký tự).'; end if;
  if p_kind not in ('individual', 'restaurant', 'trader', 'business', 'farm') then raise exception 'INVALID: Loại người mua không hợp lệ.'; end if;
  update buyer_profiles set full_name = trim(p_name), buyer_kind = p_kind, company = nullif(trim(coalesce(p_company, '')), ''),
         tax_code = nullif(trim(coalesce(p_tax, '')), ''), phone = nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''), updated_at = now()
   where user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND: Chưa có hồ sơ người mua.'; end if;
  return get_my_web_account();
end $$;

-- ---------------------------------------------------------------------------
-- Yêu thích
-- ---------------------------------------------------------------------------
create or replace function toggle_favorite(p_kind text, p_ref uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if p_kind = 'supplier' then
    if p_on then
      if not exists (select 1 from public_profiles where profile_id = p_ref and is_visible) then raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp này.'; end if;
      if (select count(*) from favorite_suppliers where user_id = auth.uid()) >= 200 then raise exception 'LIMIT: Danh sách yêu thích đã đầy (200).'; end if;
      insert into favorite_suppliers (user_id, profile_id) values (auth.uid(), p_ref) on conflict do nothing;
    else delete from favorite_suppliers where user_id = auth.uid() and profile_id = p_ref; end if;
  elsif p_kind = 'product' then
    if p_on then
      if not exists (select 1 from public_products where listing_id = p_ref and is_visible) then raise exception 'NOT_FOUND: Không tìm thấy sản phẩm này.'; end if;
      if (select count(*) from favorite_products where user_id = auth.uid()) >= 200 then raise exception 'LIMIT: Danh sách yêu thích đã đầy (200).'; end if;
      insert into favorite_products (user_id, listing_id) values (auth.uid(), p_ref) on conflict do nothing;
    else delete from favorite_products where user_id = auth.uid() and listing_id = p_ref; end if;
  else raise exception 'INVALID: Loại yêu thích không hợp lệ.'; end if;
  return p_on;
end $$;

create or replace function list_my_favorites() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return jsonb_build_object(
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('profile_id', p.profile_id, 'slug', p.slug, 'name', p.snapshot->>'display_name', 'province', p.snapshot->>'province',
                                  'tagline', p.snapshot->>'tagline') order by f.created_at desc)
                             from favorite_suppliers f join public_profiles p on p.profile_id = f.profile_id and p.is_visible where f.user_id = auth.uid()), '[]'),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', pp.listing_id, 'name', pp.snapshot->>'name', 'unit', pp.snapshot->>'unit', 'price_from', pp.snapshot->'price_from',
                                  'price_note', pp.snapshot->>'price_note', 'supply_status', pp.supply_status, 'supplier', pr.snapshot->>'display_name', 'province', pr.snapshot->>'province')
                                  order by f.created_at desc)
                            from favorite_products f join public_products pp on pp.listing_id = f.listing_id and pp.is_visible
                            join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible where f.user_id = auth.uid()), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Sổ địa chỉ nhận hàng (tối đa 10)
-- ---------------------------------------------------------------------------
create or replace function save_buyer_address(p_id uuid, p_label text, p_recipient text, p_phone text, p_province text, p_district text, p_address text, p_default boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid; ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  perform web_guard();
  if ph !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID: Số điện thoại người nhận chưa đúng.'; end if;
  if coalesce(p_default, false) then update buyer_addresses set is_default = false where user_id = auth.uid(); end if;
  if p_id is null then
    if (select count(*) from buyer_addresses where user_id = auth.uid()) >= 10 then raise exception 'LIMIT: Tối đa 10 địa chỉ.'; end if;
    insert into buyer_addresses (user_id, label, recipient, phone, province, district, address, is_default)
    values (auth.uid(), trim(p_label), trim(p_recipient), ph, trim(p_province), nullif(trim(coalesce(p_district, '')), ''), trim(p_address),
            coalesce(p_default, false) or not exists (select 1 from buyer_addresses where user_id = auth.uid()))
    returning id into r;
    return r;
  end if;
  update buyer_addresses set label = trim(p_label), recipient = trim(p_recipient), phone = ph, province = trim(p_province),
         district = nullif(trim(coalesce(p_district, '')), ''), address = trim(p_address), is_default = coalesce(p_default, false)
   where id = p_id and user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND: Không tìm thấy địa chỉ.'; end if;
  return p_id;
end $$;

create or replace function delete_buyer_address(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  delete from buyer_addresses where id = p_id and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Gian hàng của tôi (chủ, quản lý, biên tập hồ sơ): xem sản phẩm, sửa NHANH tình trạng cung ứng; yêu cầu báo giá gửi tới cơ sở
-- Sửa giá, mô tả, ảnh vẫn làm trong app và gửi duyệt (D55); tình trạng cung ứng hiện ngay không cần duyệt lại.
-- ---------------------------------------------------------------------------
create or replace function my_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return jsonb_build_object('orgs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'org_name', o.name,
      'profile', (select jsonb_build_object('id', b.id, 'display_name', b.display_name, 'status', b.status, 'slug', b.slug) from business_profiles b where b.organization_id = o.id limit 1),
      'quotes_new', (select count(*) from quote_requests q where q.organization_id = o.id and q.status = 'new'),
      'listings', coalesce((select jsonb_agg(jsonb_build_object(
          'id', l.id, 'name', l.name, 'unit', l.unit, 'price_from', l.price_from, 'price_note', l.price_note, 'include', l.include_in_publication,
          'supply', (select jsonb_build_object('status', s.status, 'expected_from', s.expected_from, 'expected_to', s.expected_to, 'updated_on', s.status_updated_on)
                       from supply_offers s where s.listing_id = l.id order by s.created_at desc limit 1)) order by l.created_at)
                         from product_listings l where l.organization_id = o.id), '[]'))
      order by o.name)
    from organizations o where exists (select 1 from organization_memberships m where m.organization_id = o.id and m.user_id = auth.uid() and m.status = 'active') and can_edit_profile(o.id)), '[]'));
end $$;

create or replace function set_listing_supply(p_listing uuid, p_status text, p_from date, p_to date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  perform web_guard();
  select organization_id into org from product_listings where id = p_listing;
  if org is null or not can_edit_profile(org) then raise exception 'FORBIDDEN: Bạn không có quyền sửa sản phẩm này.'; end if;
  if p_status not in ('producing', 'expected', 'available', 'out_of_stock', 'paused') then raise exception 'INVALID: Tình trạng không hợp lệ.'; end if;
  if p_to is not null and p_from is not null and p_to < p_from then raise exception 'INVALID: Ngày kết thúc phải sau ngày bắt đầu.'; end if;
  -- đặt "Đang có hàng" qua website nghĩa là cơ sở xác nhận
  insert into supply_offers (listing_id, organization_id, status, expected_from, expected_to, capacity_note, confirmed_by_org, status_updated_on)
  values (p_listing, org, p_status::supply_status, p_from, p_to, nullif(trim(coalesce(p_note, '')), ''), true, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
end $$;

create or replace function my_quote_requests(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select r.id, r.kind, r.target_name, r.sender_name, r.sender_phone, r.sender_email, r.quantity_note, r.message, r.status, r.note, r.created_at,
           (select o.name from organizations o where o.id = r.organization_id) as org_name
      from quote_requests r
     where r.organization_id is not null and can_edit_profile(r.organization_id) and (p_status is null or r.status = p_status)
     order by r.created_at desc limit 200) q), '[]');
end $$;

create or replace function set_my_quote(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  perform web_guard();
  if p_status not in ('new', 'handled') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  select organization_id into org from quote_requests where id = p_id;
  if org is null or not can_edit_profile(org) then raise exception 'FORBIDDEN: Bạn không có quyền xử lý yêu cầu này.'; end if;
  update quote_requests set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Dành cho Edge Function đăng ký bằng số điện thoại (chỉ service_role)
-- ---------------------------------------------------------------------------
create or replace function web_phone_precheck(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := normalize_vn_phone(p_phone); e text;
begin
  if n is null then raise exception 'INVALID: Số điện thoại chưa đúng.'; end if;
  e := login_email_for_phone(n);
  if exists (select 1 from staff_accounts where phone = n) or exists (select 1 from auth.users where lower(email) = lower(e)) then
    raise exception 'EXISTS: Số điện thoại này đã có tài khoản. Hãy đăng nhập hoặc dùng số khác.';
  end if;
  if (select count(*) from buyer_profiles where login_kind = 'phone' and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'RATE_LIMIT: Hệ thống đang nhận quá nhiều đăng ký. Vui lòng thử lại sau ít phút.';
  end if;
  return e;
end $$;

-- ---------------------------------------------------------------------------
-- Quản trị website: người dùng website
-- ---------------------------------------------------------------------------
create or replace function site_list_users(p_search text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform site_guard(array['chief_editor']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select b.user_id, b.full_name, b.buyer_kind, b.company, b.phone, b.login_kind, b.status, b.blocked_reason, b.created_at,
           case when b.login_kind = 'email' then u.email end as email,
           (select count(*) from favorite_suppliers f where f.user_id = b.user_id) as favorites
      from buyer_profiles b left join auth.users u on u.id = b.user_id
     where q is null or fold_vi(b.full_name) like '%' || fold_vi(q) || '%' or lower(coalesce(u.email, '')) like '%' || lower(q) || '%' or coalesce(b.phone, '') like '%' || q || '%'
     order by b.created_at desc limit least(coalesce(p_limit, 100), 300)) x), '[]');
end $$;

create or replace function site_set_user_status(p_user uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  if p_status not in ('active', 'blocked') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  if p_status = 'blocked' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do khóa (ít nhất 5 ký tự).'; end if;
  update buyer_profiles set status = p_status, blocked_reason = case when p_status = 'blocked' then trim(p_reason) end, updated_at = now() where user_id = p_user;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy người dùng.'; end if;
  perform admin_audit(null, 'site_user_' || p_status, 'buyer_profiles', p_user::text, null, jsonb_build_object('reason', p_reason), p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke all on buyer_profiles, buyer_addresses, favorite_suppliers, favorite_products from public, anon, authenticated;
grant select on buyer_profiles, buyer_addresses, favorite_suppliers, favorite_products to authenticated;

revoke execute on function is_web_user(), web_guard(), get_my_web_account(), ensure_buyer_profile(text, text, text), update_my_buyer_profile(text, text, text, text, text),
  toggle_favorite(text, uuid, boolean), list_my_favorites(), save_buyer_address(uuid, text, text, text, text, text, text, boolean), delete_buyer_address(uuid),
  my_shop(), set_listing_supply(uuid, text, date, date, text), my_quote_requests(text), set_my_quote(uuid, text, text), web_phone_precheck(text),
  site_list_users(text, integer), site_set_user_status(uuid, text, text) from public, anon;
revoke execute on function web_guard(), web_phone_precheck(text) from authenticated;
grant execute on function is_web_user(), get_my_web_account(), ensure_buyer_profile(text, text, text), update_my_buyer_profile(text, text, text, text, text),
  toggle_favorite(text, uuid, boolean), list_my_favorites(), save_buyer_address(uuid, text, text, text, text, text, text, boolean), delete_buyer_address(uuid),
  my_shop(), set_listing_supply(uuid, text, date, date, text), my_quote_requests(text), set_my_quote(uuid, text, text),
  site_list_users(text, integer), site_set_user_status(uuid, text, text) to authenticated;
grant execute on function web_phone_precheck(text) to service_role;
