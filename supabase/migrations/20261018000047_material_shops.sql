-- W4+ (D67): GIAN HÀNG VẬT TƯ cho người bán vật tư (đại lý, nhà phân phối) tự đăng ký trên website, tự đăng vật tư, có KIỂM DUYỆT đầy đủ.
-- Cơ chế quản lý: (1) mở gian hàng cần tài khoản email đã xác nhận + số giấy phép kinh doanh, kiểm duyệt viên DUYỆT mới hoạt động (đánh dấu "đã kiểm tra giấy phép");
-- (2) vật tư đăng lần đầu và khi sửa nội dung phải qua duyệt; sửa giá, đơn vị thì áp dụng ngay; (3) tạm khóa gian hàng thì mọi vật tư của gian hàng biến khỏi website;
-- (4) chỉ nhóm vật tư/phụ kiện không hạn chế (chưa bán thuốc BVTV, thuốc thú y); (5) chặn số điện thoại/email/đường dẫn trong nội dung; liên hệ thật của gian hàng chỉ hiện sau đăng nhập;
-- (6) yêu cầu báo giá cho vật tư của gian hàng đi thẳng tới chủ gian hàng; (7) báo cáo vi phạm gian hàng/vật tư; (8) mọi thao tác duyệt ghi nhật ký kiểm toán.

create table material_shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 2 and 100),
  description text check (length(description) <= 500),
  province text not null check (length(trim(province)) between 1 and 60),
  district text check (length(district) <= 60),
  address text check (length(address) <= 200),
  phone text check (length(phone) <= 20),
  license_no text not null check (length(trim(license_no)) between 3 and 60),
  license_issuer text check (length(license_issuer) <= 120),
  license_image text check (license_image is null or (license_image ~ '^data:image/(jpeg|png|webp);base64,' and length(license_image) <= 150000)),
  license_verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'suspended')),
  review_note text check (length(review_note) <= 300),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table material_shops enable row level security;
create policy material_shops_own on material_shops for select to authenticated using (owner_id = auth.uid());

-- Phần công khai của gian hàng đang hoạt động (không có điện thoại, địa chỉ, giấy phép)
create view public_material_shops as
  select id, slug, name, description, province, district, license_verified, created_at from material_shops where status = 'active';

create or replace function shop_is_active(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from material_shops where id = p_id and status = 'active');
$$;

alter table site_materials
  add column shop_id uuid references material_shops(id) on delete cascade,
  add column hidden_by text check (hidden_by in ('owner', 'staff')),
  add column review_note text check (length(review_note) <= 300);
create index on site_materials (shop_id);
drop policy site_materials_public on site_materials;
create policy site_materials_public on site_materials for select to anon, authenticated
  using (status = 'published' and (shop_id is null or shop_is_active(shop_id)));
create policy site_materials_shop_owner on site_materials for select to authenticated
  using (shop_id is not null and exists (select 1 from material_shops s where s.id = shop_id and s.owner_id = auth.uid()));

alter table quote_requests add column shop_id uuid references material_shops(id) on delete set null;
create index on quote_requests (shop_id);

-- Báo cáo vi phạm: thêm gian hàng và vật tư
alter table abuse_reports drop constraint abuse_reports_target_type_check;
alter table abuse_reports add constraint abuse_reports_target_type_check check (target_type in ('trade_post', 'user', 'shop', 'material'));

-- ---------------------------------------------------------------------------
-- Tài khoản website: thêm thông tin gian hàng vật tư
-- ---------------------------------------------------------------------------
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
    'orgs', orgs,
    'material_shop', (select jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status) from material_shops s where s.owner_id = auth.uid()));
end $$;

-- ---------------------------------------------------------------------------
-- Mở gian hàng vật tư
-- ---------------------------------------------------------------------------
create or replace function open_material_shop(p_name text, p_province text, p_district text, p_address text, p_description text, p_phone text,
                                              p_license_no text, p_license_issuer text, p_license_image text) returns uuid
language plpgsql security definer set search_path = public as $$
declare base text := slugify(p_name); sl text; r uuid; ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  perform require_verified();
  if exists (select 1 from material_shops where owner_id = auth.uid()) then raise exception 'INVALID: Bạn đã có gian hàng vật tư.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID: Hãy nhập tên gian hàng.'; end if;
  if length(trim(coalesce(p_province, ''))) = 0 then raise exception 'INVALID: Hãy nhập tỉnh/thành.'; end if;
  if length(trim(coalesce(p_license_no, ''))) < 3 then raise exception 'INVALID: Hãy nhập số giấy phép kinh doanh.'; end if;
  if ph is not null and ph !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID: Số điện thoại chưa đúng.'; end if;
  if p_license_image is not null and p_license_image <> '' and (p_license_image !~ '^data:image/(jpeg|png|webp);base64,' or length(p_license_image) > 150000) then raise exception 'INVALID: Ảnh giấy phép cần nhỏ gọn (jpeg, png hoặc webp).'; end if;
  perform check_no_contact(p_name, 'Tên gian hàng');
  perform check_no_contact(p_description, 'Giới thiệu');
  if coalesce(base, '') = '' then base := 'gian-hang'; end if;
  loop
    sl := left(base, 50) || '-' || substr(md5(random()::text), 1, 4);
    exit when not exists (select 1 from material_shops where slug = sl);
  end loop;
  insert into material_shops (owner_id, slug, name, description, province, district, address, phone, license_no, license_issuer, license_image)
  values (auth.uid(), sl, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), trim(p_province), nullif(trim(coalesce(p_district, '')), ''),
          nullif(trim(coalesce(p_address, '')), ''), ph, trim(p_license_no), nullif(trim(coalesce(p_license_issuer, '')), ''), nullif(p_license_image, ''))
  returning id into r;
  perform notify(auth.uid(), 'shop', 'Gian hàng đang chờ kiểm duyệt', trim(p_name), '/gian-hang-vat-tu/quan-ly/');
  return r;
end $$;

create or replace function update_my_shop(p_name text, p_province text, p_district text, p_address text, p_description text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  perform web_guard();
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_province, ''))) = 0 then raise exception 'INVALID: Hãy nhập tên gian hàng và tỉnh/thành.'; end if;
  if ph is not null and ph !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID: Số điện thoại chưa đúng.'; end if;
  perform check_no_contact(p_name, 'Tên gian hàng');
  perform check_no_contact(p_description, 'Giới thiệu');
  update material_shops set name = trim(p_name), province = trim(p_province), district = nullif(trim(coalesce(p_district, '')), ''), address = nullif(trim(coalesce(p_address, '')), ''),
         description = nullif(trim(coalesce(p_description, '')), ''), phone = ph, updated_at = now() where owner_id = auth.uid();
  if not found then raise exception 'NOT_FOUND: Bạn chưa có gian hàng vật tư.'; end if;
end $$;

-- Đổi giấy phép: gian hàng trở lại chờ duyệt (vật tư tạm không hiển thị)
create or replace function update_shop_license(p_no text, p_issuer text, p_image text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if length(trim(coalesce(p_no, ''))) < 3 then raise exception 'INVALID: Hãy nhập số giấy phép kinh doanh.'; end if;
  if p_image is not null and p_image <> '' and (p_image !~ '^data:image/(jpeg|png|webp);base64,' or length(p_image) > 150000) then raise exception 'INVALID: Ảnh giấy phép cần nhỏ gọn (jpeg, png hoặc webp).'; end if;
  update material_shops set license_no = trim(p_no), license_issuer = nullif(trim(coalesce(p_issuer, '')), ''), license_image = nullif(p_image, ''), license_verified = false,
         status = case when status = 'suspended' then status else 'pending' end, updated_at = now() where owner_id = auth.uid();
  if not found then raise exception 'NOT_FOUND: Bạn chưa có gian hàng vật tư.'; end if;
end $$;

create or replace function my_material_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s material_shops;
begin
  perform web_guard();
  select * into s from material_shops where owner_id = auth.uid();
  if s.id is null then return jsonb_build_object('shop', null); end if;
  return jsonb_build_object(
    'shop', to_jsonb(s) - 'owner_id' - 'license_image' || jsonb_build_object('has_license_image', s.license_image is not null),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'slug', m.slug, 'name', m.name, 'brand', m.brand, 'unit', m.unit, 'price_from', m.price_from, 'price_note', m.price_note,
                              'status', m.status, 'hidden_by', m.hidden_by, 'review_note', m.review_note, 'category_id', m.category_id, 'has_image', m.image is not null, 'updated_at', m.updated_at) order by m.updated_at desc)
                             from site_materials m where m.shop_id = s.id), '[]'),
    'quotes_new', (select count(*) from quote_requests q where q.shop_id = s.id and q.status = 'new'));
end $$;

create or replace function shop_get_material(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return (select to_jsonb(m) - 'shop_id' - 'updated_by' from site_materials m join material_shops s on s.id = m.shop_id where m.id = p_id and s.owner_id = auth.uid());
end $$;

-- Đăng/sửa vật tư của gian hàng. Gian hàng phải được duyệt (active). Nội dung đổi → phải duyệt lại; giá/đơn vị/nhà phân phối đổi → áp dụng ngay.
create or replace function shop_save_material(p_id uuid, p_category uuid, p_name text, p_brand text, p_summary text, p_ingredients text, p_usage text, p_safety text,
                                              p_unit text, p_price_from numeric, p_price_note text, p_image text, p_submit boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s material_shops; cur site_materials; r uuid; sl text; base text; st text; changed boolean;
begin
  perform web_guard();
  select * into s from material_shops where owner_id = auth.uid();
  if s.id is null then raise exception 'NOT_FOUND: Bạn chưa có gian hàng vật tư.'; end if;
  if s.status <> 'active' then raise exception 'FORBIDDEN: Gian hàng chưa được duyệt hoặc đang bị tạm khóa, chưa đăng vật tư được.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID: Hãy nhập tên vật tư.'; end if;
  if p_price_from is not null and p_price_from < 0 then raise exception 'INVALID: Giá chưa đúng.'; end if;
  if p_image is not null and p_image <> '' and (p_image !~ '^data:image/(jpeg|png|webp);base64,' or length(p_image) > 120000) then raise exception 'INVALID: Ảnh vật tư cần nhỏ gọn (jpeg, png hoặc webp).'; end if;
  perform site_check_material_category(p_category);
  if p_category is null then raise exception 'INVALID: Hãy chọn danh mục vật tư.'; end if;
  perform check_no_contact(p_name, 'Tên vật tư'); perform check_no_contact(p_brand, 'Thương hiệu'); perform check_no_contact(p_summary, 'Mô tả ngắn');
  perform check_no_contact(p_ingredients, 'Thành phần'); perform check_no_contact(p_usage, 'Hướng dẫn'); perform check_no_contact(p_safety, 'Lưu ý an toàn'); perform check_no_contact(p_price_note, 'Giá ghi chữ');
  if p_id is null then
    if (select count(*) from site_materials where shop_id = s.id) >= 200 then raise exception 'LIMIT: Mỗi gian hàng đăng tối đa 200 vật tư.'; end if;
    base := coalesce(nullif(slugify(p_name), ''), 'vat-tu');
    loop
      sl := left(base, 60) || '-' || substr(md5(random()::text), 1, 5);
      exit when not exists (select 1 from site_materials where slug = sl);
    end loop;
    st := case when coalesce(p_submit, false) then 'review' else 'draft' end;
    insert into site_materials (shop_id, category_id, slug, name, brand, summary, ingredients, usage, safety, unit, price_from, price_note, distributor, image, status, updated_by)
    values (s.id, p_category, sl, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), nullif(trim(coalesce(p_summary, '')), ''), nullif(trim(coalesce(p_ingredients, '')), ''),
            nullif(trim(coalesce(p_usage, '')), ''), nullif(trim(coalesce(p_safety, '')), ''), nullif(trim(coalesce(p_unit, '')), ''), p_price_from,
            nullif(trim(coalesce(p_price_note, '')), ''), s.name, nullif(p_image, ''), st, auth.uid())
    returning id into r;
    return jsonb_build_object('id', r, 'status', st);
  end if;
  select * into cur from site_materials where id = p_id and shop_id = s.id for update;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy vật tư của bạn.'; end if;
  changed := (cur.name, cur.brand, cur.summary, cur.ingredients, cur.usage, cur.safety, cur.category_id, cur.image)
             is distinct from (trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), nullif(trim(coalesce(p_summary, '')), ''), nullif(trim(coalesce(p_ingredients, '')), ''),
                               nullif(trim(coalesce(p_usage, '')), ''), nullif(trim(coalesce(p_safety, '')), ''), p_category, nullif(p_image, ''));
  st := cur.status;
  if cur.status = 'published' and changed then st := 'review';
  elsif cur.status = 'draft' and coalesce(p_submit, false) then st := 'review';
  elsif cur.status = 'review' and changed then st := 'review';
  elsif cur.status = 'hidden' and changed then st := 'draft'; end if;
  update site_materials set category_id = p_category, name = trim(p_name), brand = nullif(trim(coalesce(p_brand, '')), ''), summary = nullif(trim(coalesce(p_summary, '')), ''),
         ingredients = nullif(trim(coalesce(p_ingredients, '')), ''), usage = nullif(trim(coalesce(p_usage, '')), ''), safety = nullif(trim(coalesce(p_safety, '')), ''),
         unit = nullif(trim(coalesce(p_unit, '')), ''), price_from = p_price_from, price_note = nullif(trim(coalesce(p_price_note, '')), ''), image = nullif(p_image, ''),
         status = st, review_note = case when st = 'review' then null else review_note end, version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'status', st);
end $$;

create or replace function shop_set_material_status(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare cur site_materials;
begin
  perform web_guard();
  select m.* into cur from site_materials m join material_shops s on s.id = m.shop_id where m.id = p_id and s.owner_id = auth.uid() for update of m;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy vật tư của bạn.'; end if;
  if p_action = 'submit' and cur.status = 'draft' then update site_materials set status = 'review', review_note = null, updated_at = now() where id = p_id;
  elsif p_action = 'withdraw' and cur.status = 'review' then update site_materials set status = 'draft', updated_at = now() where id = p_id;
  elsif p_action = 'hide' and cur.status = 'published' then update site_materials set status = 'hidden', hidden_by = 'owner', updated_at = now() where id = p_id;
  elsif p_action = 'show' and cur.status = 'hidden' and cur.hidden_by = 'owner' then update site_materials set status = 'published', hidden_by = null, updated_at = now() where id = p_id;
  else raise exception 'INVALID: Thao tác này không áp dụng được với trạng thái hiện tại của vật tư.'; end if;
end $$;

create or replace function shop_delete_material(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  delete from site_materials m using material_shops s where m.id = p_id and s.id = m.shop_id and s.owner_id = auth.uid() and m.status = 'draft';
  if not found then raise exception 'INVALID: Chỉ xóa được vật tư đang ở dạng nháp. Vật tư đã đăng hãy ẩn đi.'; end if;
end $$;

-- Liên hệ thật của gian hàng: chỉ cho người đã đăng nhập (chống thu thập hàng loạt)
create or replace function get_shop_contact(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return (select jsonb_build_object('name', name, 'phone', phone, 'address', address, 'province', province, 'district', district) from material_shops where slug = p_slug and status = 'active');
end $$;

-- Yêu cầu báo giá gửi tới gian hàng
create or replace function my_shop_quotes(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select r.id, r.kind, r.target_name, r.sender_name, r.sender_phone, r.sender_email, r.quantity_note, r.message, r.status, r.note, r.created_at
      from quote_requests r join material_shops s on s.id = r.shop_id where s.owner_id = auth.uid() and (p_status is null or r.status = p_status)
     order by r.created_at desc limit 200) q), '[]');
end $$;

create or replace function set_shop_quote(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if p_status not in ('new', 'handled') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  update quote_requests r set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now()
   from material_shops s where r.id = p_id and s.id = r.shop_id and s.owner_id = auth.uid();
  if not found then raise exception 'FORBIDDEN: Bạn không có quyền xử lý yêu cầu này.'; end if;
end $$;

-- Báo giá vật tư của gian hàng đi thẳng tới chủ gian hàng
create or replace function submit_quote_request(p_kind text, p_target text, p_name text, p_phone text, p_email text, p_qty text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''); em text := nullif(lower(trim(coalesce(p_email, ''))), '');
        tname text; tprof uuid; torg uuid; tshop uuid; r uuid;
begin
  if p_kind not in ('material', 'product', 'profile', 'general') then raise exception 'INVALID: Loại yêu cầu không hợp lệ.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID: Hãy nhập họ tên.'; end if;
  if ph is null and em is null then raise exception 'INVALID: Hãy nhập số điện thoại hoặc email để nhà cung cấp liên hệ lại.'; end if;
  if ph is not null and ph !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID: Số điện thoại chưa đúng.'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID: Email chưa đúng.'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 then raise exception 'INVALID: Hãy nhập nội dung cần báo giá.'; end if;
  if p_message ~* '(https?://|www\.)' then raise exception 'INVALID: Nội dung không được chứa đường dẫn.'; end if;
  if (select count(*) from quote_requests where created_at > now() - interval '24 hours'
        and ((ph is not null and sender_phone = ph) or (em is not null and sender_email = em))) >= 3 then
    raise exception 'RATE_LIMIT: Bạn đã gửi nhiều yêu cầu hôm nay. Vui lòng thử lại vào ngày mai hoặc liên hệ trực tiếp.';
  end if;
  if (select count(*) from quote_requests where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'RATE_LIMIT: Hệ thống đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.';
  end if;
  if p_kind = 'material' then
    select name, shop_id into tname, tshop from site_materials where slug = p_target and status = 'published' and (shop_id is null or shop_is_active(shop_id));
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy vật tư này.'; end if;
  elsif p_kind = 'product' then
    select pp.snapshot->>'name', pp.profile_id, pr.organization_id into tname, tprof, torg
      from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
     where pp.listing_id::text = p_target and pp.is_visible and pr.is_visible;
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy sản phẩm này.'; end if;
  elsif p_kind = 'profile' then
    select snapshot->>'display_name', profile_id, organization_id into tname, tprof, torg from public_profiles where slug = p_target and is_visible;
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp này.'; end if;
  end if;
  insert into quote_requests (kind, target_ref, target_name, profile_id, organization_id, shop_id, sender_name, sender_phone, sender_email, quantity_note, message, user_id)
  values (p_kind, p_target, tname, tprof, torg, tshop, trim(p_name), ph, em, nullif(trim(coalesce(p_qty, '')), ''), trim(p_message), case when is_web_user() then auth.uid() end)
  returning id into r;
  if torg is not null then
    perform notify(m.user_id, 'quote', 'Có yêu cầu báo giá mới', coalesce(tname, 'Yêu cầu báo giá'), '/gian-hang/')
       from organization_memberships m where m.organization_id = torg and m.status = 'active' and (m.roles && array['owner', 'manager', 'profile_editor']::member_role[]);
  end if;
  if tshop is not null then
    perform notify(s.owner_id, 'quote', 'Có yêu cầu báo giá vật tư', coalesce(tname, 'Yêu cầu báo giá'), '/gian-hang-vat-tu/quan-ly/#bao-gia') from material_shops s where s.id = tshop;
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo vi phạm: gian hàng và vật tư
-- ---------------------------------------------------------------------------
create or replace function report_abuse(p_type text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if p_type = 'trade_post' then
    if not exists (select 1 from trade_posts where id = p_id and status = 'published') then raise exception 'NOT_FOUND: Không tìm thấy tin này.'; end if;
  elsif p_type = 'user' then
    if not exists (select 1 from buyer_profiles where user_id = p_id) then raise exception 'NOT_FOUND: Không tìm thấy người dùng.'; end if;
  elsif p_type = 'shop' then
    if not exists (select 1 from material_shops where id = p_id and status = 'active') then raise exception 'NOT_FOUND: Không tìm thấy gian hàng.'; end if;
  elsif p_type = 'material' then
    if not exists (select 1 from site_materials where id = p_id and status = 'published') then raise exception 'NOT_FOUND: Không tìm thấy vật tư.'; end if;
  else raise exception 'INVALID: Loại báo cáo không hợp lệ.'; end if;
  if (select count(*) from abuse_reports where reporter_id = auth.uid() and created_at > now() - interval '24 hours') >= 10 then raise exception 'RATE_LIMIT: Bạn đã báo cáo nhiều lần hôm nay.'; end if;
  insert into abuse_reports (reporter_id, target_type, target_id, reason) values (auth.uid(), p_type, p_id, trim(p_reason));
exception when unique_violation then
  raise exception 'INVALID: Bạn đã báo cáo mục này, chúng tôi sẽ xem xét.';
end $$;

-- ---------------------------------------------------------------------------
-- Quản trị: duyệt gian hàng, duyệt vật tư, xử lý báo cáo
-- ---------------------------------------------------------------------------
create or replace function site_list_shops(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select s.id, s.slug, s.name, s.description, s.province, s.district, s.address, s.phone, s.license_no, s.license_issuer, s.license_image, s.license_verified, s.status, s.review_note, s.created_at,
           bp.full_name as owner_name, (select u.email from auth.users u where u.id = s.owner_id) as owner_email,
           (select count(*) from site_materials m where m.shop_id = s.id and m.status = 'published') as published_materials,
           (select count(*) from site_materials m where m.shop_id = s.id and m.status = 'review') as review_materials,
           (select count(*) from abuse_reports a where a.target_type = 'shop' and a.target_id = s.id and a.status = 'open') as open_reports
      from material_shops s left join buyer_profiles bp on bp.user_id = s.owner_id
     where p_status is null or s.status = p_status order by s.created_at desc limit 200) x), '[]');
end $$;

create or replace function site_review_shop(p_id uuid, p_decision text, p_reason text, p_license_verified boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare s material_shops; ns text;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  select * into s from material_shops where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND: Không tìm thấy gian hàng.'; end if;
  ns := case p_decision when 'approve' then 'active' when 'restore' then 'active' when 'reject' then 'rejected' when 'suspend' then 'suspended' end;
  if ns is null then raise exception 'INVALID: Quyết định không hợp lệ.'; end if;
  if ns in ('rejected', 'suspended') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  update material_shops set status = ns, review_note = nullif(trim(coalesce(p_reason, '')), ''), license_verified = case when p_decision = 'approve' then coalesce(p_license_verified, false) else license_verified end,
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_id;
  perform notify(s.owner_id, 'shop', case ns when 'active' then 'Gian hàng của bạn đã được duyệt' when 'rejected' then 'Gian hàng chưa được duyệt' else 'Gian hàng bị tạm khóa' end,
                 s.name || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), ''), '/gian-hang-vat-tu/quan-ly/');
  perform admin_audit(null, 'site_shop_' || p_decision, 'material_shops', p_id::text, jsonb_build_object('status', s.status), jsonb_build_object('status', ns, 'license_verified', p_license_verified), p_reason);
end $$;

create or replace function site_list_shop_materials(p_status text default 'review') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select m.id, m.name, m.brand, m.summary, m.ingredients, m.usage, m.safety, m.unit, m.price_from, m.price_note, m.image, m.status, m.review_note, m.updated_at,
           (select c.name from product_categories c where c.id = m.category_id) as category_name, s.name as shop_name, s.status as shop_status, s.license_verified,
           (select count(*) from abuse_reports a where a.target_type = 'material' and a.target_id = m.id and a.status = 'open') as open_reports
      from site_materials m join material_shops s on s.id = m.shop_id
     where p_status is null or m.status = p_status order by m.updated_at desc limit 100) x), '[]');
end $$;

create or replace function site_review_shop_material(p_id uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m site_materials; owner uuid; ns text;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  select * into m from site_materials where id = p_id and shop_id is not null;
  if m.id is null then raise exception 'NOT_FOUND: Không tìm thấy vật tư của gian hàng.'; end if;
  select owner_id into owner from material_shops where id = m.shop_id;
  ns := case p_decision when 'approve' then 'published' when 'reject' then 'draft' when 'hide' then 'hidden' end;
  if ns is null then raise exception 'INVALID: Quyết định không hợp lệ.'; end if;
  if ns <> 'published' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  if ns = 'published' and not shop_is_active(m.shop_id) then raise exception 'INVALID: Gian hàng chưa hoạt động nên chưa duyệt vật tư được.'; end if;
  update site_materials set status = ns, hidden_by = case when ns = 'hidden' then 'staff' else null end, review_note = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now(), updated_by = auth.uid() where id = p_id;
  perform notify(owner, 'shop', case ns when 'published' then 'Vật tư đã được duyệt' when 'draft' then 'Vật tư chưa được duyệt' else 'Vật tư bị ẩn' end,
                 m.name || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), ''), '/gian-hang-vat-tu/quan-ly/');
  perform admin_audit(null, 'site_shopmat_' || p_decision, 'site_materials', p_id::text, jsonb_build_object('status', m.status), jsonb_build_object('status', ns), p_reason);
end $$;

-- Báo cáo: nhãn đối tượng và hành động xử lý cho gian hàng/vật tư
create or replace function site_list_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select a.id, a.target_type, a.target_id, a.reason, a.status, a.note, a.created_at,
           (select bp.full_name from buyer_profiles bp where bp.user_id = a.reporter_id) as reporter,
           case a.target_type when 'trade_post' then (select t.title from trade_posts t where t.id = a.target_id)
                              when 'shop' then (select s.name from material_shops s where s.id = a.target_id)
                              when 'material' then (select m.name from site_materials m where m.id = a.target_id)
                              else (select bp.full_name from buyer_profiles bp where bp.user_id = a.target_id) end as target_label,
           case a.target_type when 'trade_post' then (select t.status from trade_posts t where t.id = a.target_id)
                              when 'shop' then (select s.status from material_shops s where s.id = a.target_id)
                              when 'material' then (select m.status from site_materials m where m.id = a.target_id) end as target_status
      from abuse_reports a where p_status is null or a.status = p_status order by a.created_at desc limit 200) x), '[]');
end $$;

create or replace function site_handle_report(p_id uuid, p_status text, p_note text, p_action text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a abuse_reports; owner uuid; shop uuid;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  if p_status not in ('handled', 'dismissed') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  select * into a from abuse_reports where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy báo cáo.'; end if;
  if p_action = 'hide_post' and a.target_type = 'trade_post' then
    perform site_review_trade_post(a.target_id, 'hide', coalesce(nullif(trim(p_note), ''), 'Bị báo cáo vi phạm'));
  elsif p_action = 'hide_material' and a.target_type = 'material' then
    perform site_review_shop_material(a.target_id, 'hide', coalesce(nullif(trim(p_note), ''), 'Bị báo cáo vi phạm'));
  elsif p_action = 'suspend_shop' and a.target_type in ('shop', 'material') then
    shop := case when a.target_type = 'shop' then a.target_id else (select shop_id from site_materials where id = a.target_id) end;
    if shop is not null then perform site_review_shop(shop, 'suspend', coalesce(nullif(trim(p_note), ''), 'Bị báo cáo vi phạm'), false); end if;
  elsif p_action = 'block_user' then
    owner := case a.target_type when 'user' then a.target_id
                                when 'trade_post' then (select user_id from trade_posts where id = a.target_id)
                                when 'shop' then (select owner_id from material_shops where id = a.target_id)
                                when 'material' then (select s.owner_id from site_materials m join material_shops s on s.id = m.shop_id where m.id = a.target_id) end;
    if owner is not null then
      update buyer_profiles set status = 'blocked', blocked_reason = left(coalesce(nullif(trim(p_note), ''), 'Vi phạm quy tắc'), 300), updated_at = now() where user_id = owner;
      perform admin_audit(null, 'site_user_blocked', 'buyer_profiles', owner::text, null, jsonb_build_object('report', p_id), p_note);
    end if;
  elsif p_action is not null then raise exception 'INVALID: Hành động không hợp lệ.';
  end if;
  update abuse_reports set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now() where id = p_id;
  perform admin_audit(null, 'site_report_' || p_status, 'abuse_reports', p_id::text, null, jsonb_build_object('action', p_action), p_note);
end $$;

-- Tổng quan: thêm gian hàng chờ duyệt và vật tư chờ duyệt
create or replace function site_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare adm boolean := is_platform_admin();
begin
  perform site_guard(array['chief_editor', 'editor', 'moderator']);
  return jsonb_build_object(
    'quotes_new', (select count(*) from quote_requests where status = 'new'),
    'articles', jsonb_build_object('draft', (select count(*) from site_articles where status = 'draft'), 'review', (select count(*) from site_articles where status = 'review'),
      'published', (select count(*) from site_articles where status = 'published' and (published_at is null or published_at <= now())),
      'scheduled', (select count(*) from site_articles where status = 'published' and published_at > now())),
    'materials', jsonb_build_object('draft', (select count(*) from site_materials where status = 'draft' and shop_id is null), 'review', (select count(*) from site_materials where status = 'review' and shop_id is null),
      'published', (select count(*) from site_materials where status = 'published')),
    'pages', jsonb_build_object('draft', (select count(*) from site_pages where status in ('draft', 'review')), 'published', (select count(*) from site_pages where status = 'published')),
    'banners_active', (select count(*) from site_banners where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
    'profiles_pending', case when adm then (select count(*) from business_profiles where status = 'pending_review') end,
    'profiles_public', (select count(*) from public_profiles where is_visible),
    'cycles_public', (select count(*) from public_cycles where is_visible),
    'products_public', (select count(*) from public_products where is_visible),
    'trade_pending', (select count(*) from trade_posts where status = 'pending'),
    'trade_published', (select count(*) from trade_posts where status = 'published' and expires_at > now()),
    'reports_open', (select count(*) from abuse_reports where status = 'open'),
    'users_total', (select count(*) from buyer_profiles),
    'shops_pending', (select count(*) from material_shops where status = 'pending'),
    'shops_active', (select count(*) from material_shops where status = 'active'),
    'shop_materials_review', (select count(*) from site_materials where status = 'review' and shop_id is not null));
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke all on material_shops from public, anon, authenticated;
grant select on material_shops to authenticated;
revoke all on public_material_shops from public, anon, authenticated;
grant select on public_material_shops to anon, authenticated;
grant select on site_materials to anon, authenticated;

revoke execute on function open_material_shop(text, text, text, text, text, text, text, text, text), update_my_shop(text, text, text, text, text, text), update_shop_license(text, text, text),
  my_material_shop(), shop_get_material(uuid), shop_save_material(uuid, uuid, text, text, text, text, text, text, text, numeric, text, text, boolean),
  shop_set_material_status(uuid, text), shop_delete_material(uuid), get_shop_contact(text), my_shop_quotes(text), set_shop_quote(uuid, text, text),
  site_list_shops(text), site_review_shop(uuid, text, text, boolean), site_list_shop_materials(text), site_review_shop_material(uuid, text, text) from public, anon;
grant execute on function open_material_shop(text, text, text, text, text, text, text, text, text), update_my_shop(text, text, text, text, text, text), update_shop_license(text, text, text),
  my_material_shop(), shop_get_material(uuid), shop_save_material(uuid, uuid, text, text, text, text, text, text, text, numeric, text, text, boolean),
  shop_set_material_status(uuid, text), shop_delete_material(uuid), get_shop_contact(text), my_shop_quotes(text), set_shop_quote(uuid, text, text),
  site_list_shops(text), site_review_shop(uuid, text, text, boolean), site_list_shop_materials(text), site_review_shop_material(uuid, text, text) to authenticated;
revoke execute on function shop_is_active(uuid) from public;
grant execute on function shop_is_active(uuid) to anon, authenticated;
