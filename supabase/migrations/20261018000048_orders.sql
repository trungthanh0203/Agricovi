-- W5 (D61, D68): GIỎ HÀNG VÀ ĐƠN ĐẶT HÀNG NÔNG SẢN; sửa tin giao thương; tìm kiếm có gian hàng vật tư.
-- Đơn đặt hàng là YÊU CẦU MUA gửi nhà cung cấp, CHƯA thanh toán trực tuyến; thanh toán và giao nhận do hai bên thỏa thuận, hệ thống ghi nhận trạng thái.
-- Nguyên tắc: mỗi đơn thuộc MỘT nhà cung cấp; giá, tên, đơn vị là BẢN CHỤP lúc đặt (không đổi khi nhà cung cấp sửa giá sau); chỉ nhà cung cấp báo giá chính thức và người mua đồng ý
-- thì đơn mới thành đơn chốt; mọi chuyển trạng thái chạy qua một bảng chuyển hợp lệ, có khóa dòng, ghi nhật ký (chỉ thêm) và thông báo bên kia;
-- người mua cần tài khoản email đã xác nhận; không đặt vào cơ sở của chính mình; hàng hết/tạm ngừng không đặt được; quản trị nền tảng không đọc nội dung đơn.

-- ---------------------------------------------------------------------------
-- 1. Sửa tin giao thương
-- ---------------------------------------------------------------------------
create or replace function update_trade_post(p_id uuid, p_category uuid, p_product text, p_quantity numeric, p_unit text, p_price_min numeric, p_price_max numeric,
                                             p_province text, p_district text, p_when date, p_days integer, p_quality text[], p_description text, p_images text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur trade_posts; cat product_categories; ttl text; st text; textchg boolean; trusted boolean; newprod text; newdesc text;
begin
  perform require_verified();
  select * into cur from trade_posts where id = p_id for update;
  if cur.id is null or cur.user_id <> auth.uid() then raise exception 'NOT_FOUND: Không tìm thấy tin của bạn.'; end if;
  if cur.status = 'closed' then raise exception 'INVALID: Tin đã đóng không sửa được. Hãy đăng tin mới.'; end if;
  select * into cat from product_categories where id = p_category and is_active and not restricted;
  if cat.id is null then raise exception 'INVALID: Hãy chọn loại sản phẩm.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID: Hãy nhập số lượng.'; end if;
  if length(trim(coalesce(p_unit, ''))) = 0 then raise exception 'INVALID: Hãy chọn đơn vị.'; end if;
  if length(trim(coalesce(p_province, ''))) = 0 then raise exception 'INVALID: Hãy nhập tỉnh/thành.'; end if;
  if p_price_min is not null and p_price_max is not null and p_price_max < p_price_min then raise exception 'INVALID: Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất.'; end if;
  if cardinality(coalesce(p_quality, '{}')) > 8 then raise exception 'INVALID: Chọn tối đa 8 yêu cầu chất lượng.'; end if;
  if not trade_image_ok(p_images) or cardinality(coalesce(p_images, '{}')) > 2 then raise exception 'INVALID: Tối đa 2 ảnh, mỗi ảnh nhỏ gọn (jpeg, png hoặc webp).'; end if;
  perform check_no_contact(p_product, 'Tên sản phẩm');
  perform check_no_contact(p_description, 'Mô tả');
  newprod := nullif(trim(coalesce(p_product, '')), '');
  newdesc := nullif(trim(coalesce(p_description, '')), '');
  ttl := case when cur.kind = 'buy' then 'Cần mua ' else 'Cần bán ' end || coalesce(newprod, cat.name)
         || ' ' || trim(trailing '.' from regexp_replace(p_quantity::text, '(\.\d*?)0+$', '\1')) || ' ' || trim(p_unit) || ' · ' || trim(p_province);
  -- sửa chữ/ảnh/loại sản phẩm của tin đã hiển thị thì phải duyệt lại (trừ người đã có nhiều tin được duyệt và không vi phạm gần đây); sửa số lượng, giá, ngày không cần
  textchg := (cur.category_id, cur.product_name, cur.description, cur.images) is distinct from (cat.id, newprod, newdesc, coalesce(p_images, '{}'));
  trusted := (select count(*) from trade_posts where user_id = auth.uid() and status = 'published' and id <> p_id) >= 2
             and not exists (select 1 from trade_posts where user_id = auth.uid() and status in ('rejected', 'hidden') and updated_at > now() - interval '30 days');
  st := cur.status;
  if cur.status in ('rejected', 'hidden') then st := 'pending';
  elsif cur.status = 'published' and textchg and not trusted then st := 'pending';
  end if;
  update trade_posts set category_id = cat.id, product_name = newprod, title = ttl, quantity = p_quantity, unit = trim(p_unit), price_min = p_price_min, price_max = p_price_max,
         province = trim(p_province), district = nullif(trim(coalesce(p_district, '')), ''), when_date = p_when, quality = coalesce(p_quality, '{}'), description = newdesc,
         images = coalesce(p_images, '{}'), status = st, review_note = case when st = 'pending' then null else review_note end,
         expires_at = case when p_days is null then expires_at else now() + make_interval(days => least(greatest(p_days, 1), 30)) end, updated_at = now()
   where id = p_id;
  if st = 'pending' and cur.status <> 'pending' then perform notify(auth.uid(), 'trade', 'Tin đã sửa và đang chờ duyệt lại', ttl, '/giao-thuong/cua-toi/'); end if;
  return jsonb_build_object('id', p_id, 'status', st);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tìm kiếm: thêm gian hàng vật tư
-- ---------------------------------------------------------------------------
create or replace function site_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := fold_vi(trim(coalesce(p_q, '')));
begin
  if length(q) < 2 then return jsonb_build_object('profiles', '[]'::jsonb, 'products', '[]'::jsonb, 'materials', '[]'::jsonb, 'articles', '[]'::jsonb, 'shops', '[]'::jsonb); end if;
  q := '%' || replace(replace(q, '%', ''), '_', '') || '%';
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(x) from (select slug, snapshot->>'display_name' as name, snapshot->>'province' as province from public_profiles
                           where is_visible and (fold_vi(snapshot->>'display_name') like q or fold_vi(snapshot->>'description') like q) limit 10) x), '[]'),
    'products', coalesce((select jsonb_agg(x) from (select pp.listing_id as id, pp.snapshot->>'name' as name, pr.snapshot->>'display_name' as profile_name, pr.snapshot->>'province' as province
                           from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
                           where pp.is_visible and pr.is_visible and (fold_vi(pp.snapshot->>'name') like q or fold_vi(pp.snapshot->>'crop') like q) limit 12) x), '[]'),
    'materials', coalesce((select jsonb_agg(x) from (select slug, name, brand from site_materials
                           where status = 'published' and (shop_id is null or shop_is_active(shop_id)) and (fold_vi(name) like q or fold_vi(brand) like q or fold_vi(summary) like q) limit 12) x), '[]'),
    'articles', coalesce((select jsonb_agg(x) from (select slug, title, channel from site_articles
                           where status = 'published' and (published_at is null or published_at <= now()) and (fold_vi(title) like q or fold_vi(summary) like q) order by published_at desc nulls last limit 10) x), '[]'),
    'shops', coalesce((select jsonb_agg(x) from (select slug, name, province from public_material_shops where fold_vi(name) like q or fold_vi(description) like q limit 8) x), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Giỏ hàng
-- ---------------------------------------------------------------------------
create table cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public_products(listing_id) on delete cascade,
  name text not null,
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table cart_items enable row level security;

create or replace function cart_set_item(p_listing uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare pp public_products; pr public_profiles;
begin
  perform web_guard();
  if p_qty is null or p_qty <= 0 then
    delete from cart_items where user_id = auth.uid() and listing_id = p_listing;
    return;
  end if;
  if p_qty > 1000000 then raise exception 'INVALID: Số lượng quá lớn.'; end if;
  select * into pp from public_products where listing_id = p_listing and is_visible;
  select * into pr from public_profiles where profile_id = pp.profile_id and is_visible;
  if pp.listing_id is null or pr.profile_id is null then raise exception 'NOT_FOUND: Sản phẩm này không còn bán.'; end if;
  if pp.supply_status in ('out_of_stock', 'paused') then raise exception 'INVALID: Sản phẩm này tạm hết hàng hoặc tạm ngừng bán.'; end if;
  if can_edit_profile(pr.organization_id) then raise exception 'INVALID: Bạn không thể đặt hàng của chính cơ sở mình.'; end if;
  if not exists (select 1 from cart_items where user_id = auth.uid() and listing_id = p_listing) and (select count(*) from cart_items where user_id = auth.uid()) >= 50 then
    raise exception 'LIMIT: Giỏ hàng tối đa 50 sản phẩm.';
  end if;
  insert into cart_items (user_id, listing_id, name, quantity) values (auth.uid(), p_listing, left(pp.snapshot->>'name', 200), p_qty)
  on conflict (user_id, listing_id) do update set quantity = excluded.quantity, name = excluded.name, updated_at = now();
end $$;

-- Thêm vào giỏ: cộng dồn số lượng nếu đã có
create or replace function cart_add_item(p_listing uuid, p_qty numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare cur numeric; nq numeric;
begin
  perform web_guard();
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID: Hãy nhập số lượng lớn hơn 0.'; end if;
  select quantity into cur from cart_items where user_id = auth.uid() and listing_id = p_listing;
  nq := coalesce(cur, 0) + p_qty;
  perform cart_set_item(p_listing, least(nq, 1000000));
  return least(nq, 1000000);
end $$;

create or replace function cart_count() returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return (select count(*)::int from cart_items where user_id = auth.uid());
end $$;

-- Giỏ hàng gộp theo nhà cung cấp; dòng không còn bán được báo riêng
create or replace function cart_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return jsonb_build_object(
    'groups', coalesce((select jsonb_agg(g order by g->>'supplier') from (
      select jsonb_build_object('profile_id', pr.profile_id, 'slug', pr.slug, 'supplier', pr.snapshot->>'display_name', 'province', pr.snapshot->>'province',
        'items', jsonb_agg(jsonb_build_object('listing_id', ci.listing_id, 'name', pp.snapshot->>'name', 'unit', pp.snapshot->>'unit', 'price_from', pp.snapshot->'price_from',
          'price_note', pp.snapshot->>'price_note', 'min_order', pp.snapshot->>'min_order', 'supply_status', pp.supply_status, 'quantity', ci.quantity,
          'sellable', pp.supply_status is null or pp.supply_status not in ('out_of_stock', 'paused')) order by ci.created_at)) as g
        from cart_items ci join public_products pp on pp.listing_id = ci.listing_id and pp.is_visible
        join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible
       where ci.user_id = auth.uid() group by pr.profile_id, pr.slug, pr.snapshot->>'display_name', pr.snapshot->>'province') s), '[]'),
    'gone', coalesce((select jsonb_agg(jsonb_build_object('listing_id', ci.listing_id, 'name', ci.name)) from cart_items ci
                       where ci.user_id = auth.uid() and not exists (select 1 from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible
                                                                       where pp.listing_id = ci.listing_id and pp.is_visible)), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Đơn đặt hàng
-- ---------------------------------------------------------------------------
create table web_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete restrict,
  profile_id uuid references business_profiles(id) on delete set null,
  supplier_name text not null,
  status text not null default 'placed' check (status in ('placed', 'quoted', 'accepted', 'preparing', 'shipped', 'delivered', 'completed', 'cancelled', 'rejected')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  recipient text not null check (length(trim(recipient)) between 2 and 80),
  recipient_phone text not null check (length(recipient_phone) between 8 and 20),
  province text not null check (length(trim(province)) between 1 and 60),
  district text check (length(district) <= 60),
  address text not null check (length(trim(address)) between 3 and 200),
  desired_date date,
  buyer_note text check (length(buyer_note) <= 300),
  seller_note text check (length(seller_note) <= 300),
  shipping_fee numeric not null default 0 check (shipping_fee >= 0),
  deliver_date date,
  quoted_total numeric check (quoted_total >= 0),
  cancel_reason text check (length(cancel_reason) <= 300),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quoted_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz
);
create index on web_orders (buyer_id, created_at desc);
create index on web_orders (organization_id, created_at desc);
create index on web_orders (status, delivered_at);
alter table web_orders enable row level security;

create table web_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references web_orders(id) on delete cascade,
  listing_id uuid,
  name text not null,
  unit text,
  list_price numeric check (list_price >= 0),           -- giá niêm yết lúc đặt (bản chụp, không đổi)
  unit_price numeric check (unit_price >= 0),           -- đơn giá nhà cung cấp báo/chốt
  quantity numeric(12, 3) not null check (quantity > 0), -- số lượng người mua đặt
  agreed_quantity numeric(12, 3) check (agreed_quantity > 0),  -- số lượng nhà cung cấp chốt (≤ số lượng đặt)
  position integer not null default 0
);
create index on web_order_items (order_id);
alter table web_order_items enable row level security;

create table web_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references web_orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('buyer', 'seller', 'system')),
  kind text not null check (length(kind) <= 30),
  from_status text,
  to_status text,
  note text check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index on web_order_events (order_id, created_at);
alter table web_order_events enable row level security;

-- Nhật ký chỉ thêm (đúng nguyên tắc của hệ thống): chặn sửa/xóa kể cả với hàm
create or replace function web_order_events_append_only() returns trigger language plpgsql as $$
begin raise exception 'APPEND_ONLY: Nhật ký đơn hàng chỉ được thêm, không sửa hoặc xóa.'; end $$;
create trigger web_order_events_no_update before update or delete on web_order_events for each row execute function web_order_events_append_only();

-- Người mua không đổi được thông tin bản chụp của đơn qua đường khác ngoài hàm
create or replace function order_side(p_buyer uuid, p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p_buyer = auth.uid() then 'buyer' when p_org is not null and can_edit_profile(p_org) then 'seller' end;
$$;

create or replace function order_total(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when bool_or(i.unit_price is null) then null
              else coalesce(sum(round(i.unit_price * coalesce(i.agreed_quantity, i.quantity))), 0) + (select o.shipping_fee from web_orders o where o.id = p_order) end
    from web_order_items i where i.order_id = p_order;
$$;

create or replace function order_event(p_order uuid, p_role text, p_kind text, p_from text, p_to text, p_note text) returns void
language sql security definer set search_path = public as $$
  insert into web_order_events (order_id, actor_id, actor_role, kind, from_status, to_status, note)
  values (p_order, case when p_role = 'system' then null else auth.uid() end, p_role, p_kind, p_from, p_to, left(p_note, 300));
$$;

create or replace function notify_order_sellers(p_org uuid, p_title text, p_body text, p_order uuid) returns void
language sql security definer set search_path = public as $$
  select notify(m.user_id, 'order', p_title, p_body, '/don-hang/' || p_order)
    from organization_memberships m where m.organization_id = p_org and m.status = 'active' and (m.roles && array['owner', 'manager', 'profile_editor']::member_role[]);
$$;

-- Đơn đã giao quá 7 ngày mà người mua chưa xác nhận thì tự hoàn tất (gọi mỗi khi liệt kê/mở đơn)
create or replace function complete_overdue_orders() returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id, buyer_id, organization_id, status from web_orders where status = 'delivered' and delivered_at < now() - interval '7 days' for update skip locked loop
    update web_orders set status = 'completed', completed_at = now(), version = version + 1, updated_at = now() where id = o.id;
    insert into web_order_events (order_id, actor_id, actor_role, kind, from_status, to_status, note) values (o.id, null, 'system', 'auto_completed', o.status, 'completed', 'Tự hoàn tất sau 7 ngày kể từ khi giao');
  end loop;
end $$;

-- Đặt hàng: lấy các dòng giỏ của MỘT nhà cung cấp
create or replace function checkout_cart(p_profile uuid, p_address uuid, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr public_profiles; addr buyer_addresses; oid uuid; cd text; n integer; matched integer; k integer := 0; r record;
begin
  perform require_verified();
  select * into pr from public_profiles where profile_id = p_profile and is_visible;
  if pr.profile_id is null then raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp này.'; end if;
  if can_edit_profile(pr.organization_id) then raise exception 'INVALID: Bạn không thể đặt hàng của chính cơ sở mình.'; end if;
  select * into addr from buyer_addresses where id = p_address and user_id = auth.uid();
  if addr.id is null then raise exception 'INVALID: Hãy chọn địa chỉ nhận hàng (thêm địa chỉ ở Tài khoản của tôi).'; end if;
  if p_date is not null and p_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'INVALID: Ngày muốn nhận hàng không được ở quá khứ.'; end if;
  perform check_no_contact(p_note, 'Ghi chú');
  select count(*) into n from cart_items ci join public_products pp on pp.listing_id = ci.listing_id and pp.profile_id = p_profile
   where ci.user_id = auth.uid();
  select count(*) into matched from cart_items ci join public_products pp on pp.listing_id = ci.listing_id and pp.profile_id = p_profile and pp.is_visible
   where ci.user_id = auth.uid();
  if n = 0 then raise exception 'INVALID: Giỏ hàng của bạn không có sản phẩm nào của nhà cung cấp này.'; end if;
  if matched <> n then raise exception 'INVALID: Có sản phẩm không còn bán. Hãy tải lại giỏ hàng và bỏ sản phẩm đó.'; end if;
  if exists (select 1 from cart_items ci join public_products pp on pp.listing_id = ci.listing_id and pp.profile_id = p_profile
              where ci.user_id = auth.uid() and pp.supply_status in ('out_of_stock', 'paused')) then
    raise exception 'INVALID: Có sản phẩm tạm hết hàng hoặc tạm ngừng bán. Hãy bỏ sản phẩm đó khỏi giỏ.';
  end if;
  if (select count(*) from web_orders where buyer_id = auth.uid() and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'RATE_LIMIT: Bạn đã gửi nhiều đơn hôm nay. Vui lòng thử lại vào ngày mai.';
  end if;
  loop
    cd := 'DH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from web_orders where code = cd);
  end loop;
  insert into web_orders (code, buyer_id, organization_id, profile_id, supplier_name, recipient, recipient_phone, province, district, address, desired_date, buyer_note)
  values (cd, auth.uid(), pr.organization_id, pr.profile_id, coalesce(pr.snapshot->>'display_name', 'Nhà cung cấp'), addr.recipient, addr.phone, addr.province, addr.district, addr.address,
          p_date, nullif(trim(coalesce(p_note, '')), ''))
  returning id into oid;
  for r in select ci.listing_id, ci.quantity, pp.snapshot from cart_items ci join public_products pp on pp.listing_id = ci.listing_id and pp.profile_id = p_profile
            where ci.user_id = auth.uid() order by ci.created_at loop
    k := k + 1;
    insert into web_order_items (order_id, listing_id, name, unit, list_price, unit_price, quantity, position)
    values (oid, r.listing_id, left(r.snapshot->>'name', 200), r.snapshot->>'unit', nullif(r.snapshot->>'price_from', '')::numeric, nullif(r.snapshot->>'price_from', '')::numeric, r.quantity, k);
  end loop;
  delete from cart_items ci using public_products pp where ci.user_id = auth.uid() and pp.listing_id = ci.listing_id and pp.profile_id = p_profile;
  perform order_event(oid, 'buyer', 'created', null, 'placed', p_note);
  perform notify_order_sellers(pr.organization_id, 'Có đơn đặt hàng mới', cd || ' · ' || (select full_name from buyer_profiles where user_id = auth.uid()), oid);
  perform notify(auth.uid(), 'order', 'Đã gửi đơn đặt hàng', cd || ' · ' || coalesce(pr.snapshot->>'display_name', ''), '/don-hang/' || oid);
  return oid;
end $$;

-- Mua lại: thêm các sản phẩm còn bán của đơn cũ vào giỏ
create or replace function reorder(p_order uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare o web_orders; r record; k integer := 0;
begin
  perform web_guard();
  select * into o from web_orders where id = p_order and buyer_id = auth.uid();
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  for r in select i.listing_id, i.quantity from web_order_items i join public_products pp on pp.listing_id = i.listing_id and pp.is_visible
            where i.order_id = p_order and (pp.supply_status is null or pp.supply_status not in ('out_of_stock', 'paused')) loop
    begin
      perform cart_set_item(r.listing_id, r.quantity);
      k := k + 1;
    exception when others then null;
    end;
  end loop;
  return k;
end $$;

create or replace function list_orders(p_role text, p_status text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  perform complete_overdue_orders();
  if p_role not in ('buyer', 'seller') then raise exception 'INVALID: Vai trò không hợp lệ.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select o.id, o.code, o.status, o.payment_status, o.supplier_name, o.recipient, o.created_at, o.updated_at, order_total(o.id) as total,
           (select count(*)::int from web_order_items i where i.order_id = o.id) as item_count,
           (select string_agg(i.name, ', ' order by i.position) from web_order_items i where i.order_id = o.id) as item_names
      from web_orders o
     where ((p_role = 'buyer' and o.buyer_id = auth.uid()) or (p_role = 'seller' and can_edit_profile(o.organization_id)))
       and (p_status is null or o.status = p_status)
     order by o.updated_at desc limit 200) x), '[]');
end $$;

-- Chi tiết đơn cho bên mua hoặc bên bán, kèm các thao tác được phép ở trạng thái hiện tại
create or replace function get_order(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o web_orders; side text; acts text[] := '{}'; contact jsonb;
begin
  perform web_guard();
  perform complete_overdue_orders();
  select * into o from web_orders where id = p_id;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  side := order_side(o.buyer_id, o.organization_id);
  if side is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  if side = 'buyer' then
    if o.status = 'quoted' then acts := array['accept', 'cancel'];
    elsif o.status in ('placed', 'accepted') then acts := array['cancel'];
    elsif o.status in ('shipped', 'delivered') then acts := array['receive'];
    end if;
  else
    if o.status = 'placed' then acts := array['quote', 'reject'];
    elsif o.status = 'quoted' then acts := array['quote', 'reject'];
    elsif o.status = 'accepted' then acts := array['prepare', 'seller_cancel', 'payment'];
    elsif o.status = 'preparing' then acts := array['ship', 'seller_cancel', 'payment'];
    elsif o.status = 'shipped' then acts := array['deliver', 'payment'];
    elsif o.status in ('delivered', 'completed') then acts := array['payment'];
    end if;
  end if;
  -- liên hệ nhà cung cấp (nếu đã công khai trong hồ sơ) chỉ hiện cho người mua khi đơn đã được chốt
  if side = 'buyer' and o.status in ('accepted', 'preparing', 'shipped', 'delivered', 'completed') then
    select snapshot->'contact' into contact from public_profiles where profile_id = o.profile_id;
  end if;
  return jsonb_build_object('id', o.id, 'code', o.code, 'side', side, 'status', o.status, 'payment_status', o.payment_status, 'supplier_name', o.supplier_name,
    'profile_slug', (select slug from public_profiles where profile_id = o.profile_id),
    'recipient', o.recipient, 'recipient_phone', o.recipient_phone, 'province', o.province, 'district', o.district, 'address', o.address, 'desired_date', o.desired_date,
    'buyer_note', o.buyer_note, 'seller_note', o.seller_note, 'shipping_fee', o.shipping_fee, 'deliver_date', o.deliver_date, 'quoted_total', o.quoted_total,
    'total', order_total(o.id), 'cancel_reason', o.cancel_reason, 'version', o.version, 'created_at', o.created_at, 'updated_at', o.updated_at,
    'buyer_name', case when side = 'seller' then (select full_name from buyer_profiles where user_id = o.buyer_id) end,
    'supplier_contact', contact, 'actions', to_jsonb(acts),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'listing_id', i.listing_id, 'name', i.name, 'unit', i.unit, 'list_price', i.list_price, 'unit_price', i.unit_price,
                         'quantity', i.quantity, 'agreed_quantity', i.agreed_quantity) order by i.position) from web_order_items i where i.order_id = o.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'role', e.actor_role, 'from', e.from_status, 'to', e.to_status, 'note', e.note, 'at', e.created_at) order by e.created_at, e.id)
                          from web_order_events e where e.order_id = o.id), '[]'));
end $$;

-- Nhà cung cấp báo giá / xác nhận (và báo lại nếu sửa): bắt buộc đủ đơn giá mọi dòng; số lượng chốt không vượt số lượng đặt
create or replace function quote_order(p_id uuid, p_items jsonb, p_shipping numeric, p_note text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare o web_orders; x jsonb; it web_order_items; up numeric; q numeric; prev text;
begin
  perform web_guard();
  select * into o from web_orders where id = p_id for update;
  if o.id is null or order_side(o.buyer_id, o.organization_id) is distinct from 'seller' then raise exception 'FORBIDDEN: Bạn không có quyền xử lý đơn này.'; end if;
  if o.status not in ('placed', 'quoted') then raise exception 'INVALID: Đơn này không còn ở bước báo giá.'; end if;
  if p_shipping is not null and p_shipping < 0 then raise exception 'INVALID: Phí giao hàng chưa đúng.'; end if;
  if p_date is not null and p_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'INVALID: Ngày giao dự kiến không được ở quá khứ.'; end if;
  perform check_no_contact(p_note, 'Ghi chú');
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID: Danh sách dòng hàng không hợp lệ.'; end if;
    for x in select * from jsonb_array_elements(p_items) loop
      select * into it from web_order_items where id = (x->>'id')::uuid and order_id = p_id;
      if it.id is null then raise exception 'INVALID: Dòng hàng không thuộc đơn này.'; end if;
      up := nullif(x->>'unit_price', '')::numeric;
      q := nullif(x->>'quantity', '')::numeric;
      if up is not null and up < 0 then raise exception 'INVALID: Đơn giá chưa đúng.'; end if;
      if q is not null and (q <= 0 or q > it.quantity) then raise exception 'INVALID: Số lượng chốt phải lớn hơn 0 và không vượt số lượng đặt (%).', it.quantity; end if;
      update web_order_items set unit_price = coalesce(up, unit_price), agreed_quantity = coalesce(q, agreed_quantity) where id = it.id;
    end loop;
  end if;
  if exists (select 1 from web_order_items where order_id = p_id and (unit_price is null or unit_price <= 0)) then
    raise exception 'INVALID: Hãy nhập đơn giá cho tất cả các dòng hàng trước khi báo giá.';
  end if;
  prev := o.status;
  update web_orders set status = 'quoted', shipping_fee = coalesce(p_shipping, shipping_fee), seller_note = nullif(trim(coalesce(p_note, '')), ''), deliver_date = p_date,
         quoted_at = now(), version = version + 1, updated_at = now() where id = p_id;
  update web_orders set quoted_total = order_total(p_id) where id = p_id;
  perform order_event(p_id, 'seller', 'quoted', prev, 'quoted', p_note);
  perform notify(o.buyer_id, 'order', 'Nhà cung cấp đã báo giá cho đơn của bạn', o.code || ' · ' || o.supplier_name, '/don-hang/' || p_id);
end $$;

-- Bảng chuyển trạng thái hợp lệ (một nơi duy nhất)
create or replace function order_action(p_id uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o web_orders; side text; ns text; ok boolean := false; need_reason boolean := false; who text;
begin
  perform web_guard();
  select * into o from web_orders where id = p_id for update;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  side := order_side(o.buyer_id, o.organization_id);
  if side is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  perform check_no_contact(p_note, 'Ghi chú');
  if side = 'buyer' then
    if p_action = 'accept' and o.status = 'quoted' then ns := 'accepted'; ok := true;
    elsif p_action = 'cancel' and o.status in ('placed', 'quoted', 'accepted') then ns := 'cancelled'; ok := true;
    elsif p_action = 'receive' and o.status in ('shipped', 'delivered') then ns := 'completed'; ok := true;
    end if;
  else
    if p_action = 'reject' and o.status in ('placed', 'quoted') then ns := 'rejected'; ok := true; need_reason := true;
    elsif p_action = 'prepare' and o.status = 'accepted' then ns := 'preparing'; ok := true;
    elsif p_action = 'ship' and o.status = 'preparing' then ns := 'shipped'; ok := true;
    elsif p_action = 'deliver' and o.status = 'shipped' then ns := 'delivered'; ok := true;
    elsif p_action = 'seller_cancel' and o.status in ('accepted', 'preparing') then ns := 'cancelled'; ok := true; need_reason := true;
    end if;
  end if;
  if not ok then raise exception 'INVALID: Thao tác này không áp dụng được với trạng thái hiện tại của đơn (có thể bên kia vừa thay đổi). Hãy tải lại.'; end if;
  if need_reason and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  update web_orders set status = ns, version = version + 1, updated_at = now(),
         accepted_at = case when ns = 'accepted' then now() else accepted_at end,
         delivered_at = case when ns = 'delivered' then now() else delivered_at end,
         completed_at = case when ns = 'completed' then now() else completed_at end,
         cancel_reason = case when ns in ('cancelled', 'rejected') then nullif(trim(coalesce(p_note, '')), '') else cancel_reason end
   where id = p_id;
  perform order_event(p_id, side, p_action, o.status, ns, p_note);
  who := o.code || ' · ' || o.supplier_name;
  if side = 'buyer' then
    perform notify_order_sellers(o.organization_id, case p_action when 'accept' then 'Người mua đã đồng ý báo giá' when 'cancel' then 'Người mua đã hủy đơn' else 'Người mua đã nhận hàng' end, who, p_id);
  else
    perform notify(o.buyer_id, 'order', case p_action when 'reject' then 'Nhà cung cấp từ chối đơn' when 'prepare' then 'Đơn đang được chuẩn bị' when 'ship' then 'Đơn đang được giao'
                                                 when 'deliver' then 'Đơn đã giao, hãy xác nhận đã nhận hàng' else 'Nhà cung cấp đã hủy đơn' end, who || coalesce(' — ' || nullif(trim(coalesce(p_note, '')), ''), ''), '/don-hang/' || p_id);
  end if;
end $$;

-- Nhà cung cấp ghi nhận thanh toán (thanh toán ngoài hệ thống)
create or replace function set_order_payment(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare o web_orders;
begin
  perform web_guard();
  select * into o from web_orders where id = p_id for update;
  if o.id is null or order_side(o.buyer_id, o.organization_id) is distinct from 'seller' then raise exception 'FORBIDDEN: Bạn không có quyền xử lý đơn này.'; end if;
  if p_status not in ('unpaid', 'partial', 'paid') then raise exception 'INVALID: Tình trạng thanh toán không hợp lệ.'; end if;
  if o.status not in ('accepted', 'preparing', 'shipped', 'delivered', 'completed') then raise exception 'INVALID: Chỉ ghi nhận thanh toán cho đơn đã được chốt.'; end if;
  perform check_no_contact(p_note, 'Ghi chú');
  update web_orders set payment_status = p_status, updated_at = now(), version = version + 1 where id = p_id;
  perform order_event(p_id, 'seller', 'payment', o.payment_status, p_status, p_note);
  if o.payment_status is distinct from p_status then perform notify(o.buyer_id, 'order', 'Cập nhật thanh toán của đơn', o.code || ' · ' || o.supplier_name, '/don-hang/' || p_id); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke all on cart_items, web_orders, web_order_items, web_order_events from public, anon, authenticated;
revoke execute on function update_trade_post(uuid, uuid, text, numeric, text, numeric, numeric, text, text, date, integer, text[], text, text[]),
  cart_set_item(uuid, numeric), cart_add_item(uuid, numeric), cart_count(), cart_get(), checkout_cart(uuid, uuid, date, text), reorder(uuid), list_orders(text, text), get_order(uuid),
  quote_order(uuid, jsonb, numeric, text, date), order_action(uuid, text, text), set_order_payment(uuid, text, text),
  order_side(uuid, uuid), order_total(uuid), order_event(uuid, text, text, text, text, text), notify_order_sellers(uuid, text, text, uuid), complete_overdue_orders(),
  web_order_events_append_only() from public, anon;
revoke execute on function order_side(uuid, uuid), order_total(uuid), order_event(uuid, text, text, text, text, text), notify_order_sellers(uuid, text, text, uuid), complete_overdue_orders() from authenticated;
grant execute on function update_trade_post(uuid, uuid, text, numeric, text, numeric, numeric, text, text, date, integer, text[], text, text[]),
  cart_set_item(uuid, numeric), cart_add_item(uuid, numeric), cart_count(), cart_get(), checkout_cart(uuid, uuid, date, text), reorder(uuid), list_orders(text, text), get_order(uuid),
  quote_order(uuid, jsonb, numeric, text, date), order_action(uuid, text, text), set_order_payment(uuid, text, text) to authenticated;
grant execute on function site_search(text) to anon, authenticated;
