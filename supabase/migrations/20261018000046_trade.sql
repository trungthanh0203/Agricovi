-- W4 (D60–D61, D66): GIAO THƯƠNG (tin cần mua / cần bán), BÁO GIÁ, HỘP THƯ, THÔNG BÁO, BÁO CÁO VI PHẠM.
-- Nguyên tắc: khách chỉ thấy danh sách TÓM TẮT (view public_trade_posts); chi tiết chỉ qua hàm get_trade_post() yêu cầu đăng nhập (không nằm trong HTML/dữ liệu công khai);
-- người đăng tin mua ẩn danh tới khi chấp nhận; liên hệ (điện thoại, email) chỉ mở khi HAI bên cùng đồng ý; tin nhắn bị lọc số điện thoại/đường dẫn tới lúc đó;
-- đăng tin/báo giá cần tài khoản email đã xác nhận; tin được duyệt trước (người đã có tin được duyệt và không vi phạm gần đây thì tự duyệt).
-- Bảng chỉ ghi qua hàm (không chính sách ghi); mọi thao tác chỉ thêm hoặc đổi trạng thái, không xóa.

-- ---------------------------------------------------------------------------
-- Yêu cầu báo giá: ghi nhận người gửi nếu đã đăng nhập (để họ xem lại "Yêu cầu của tôi")
-- ---------------------------------------------------------------------------
alter table quote_requests add column user_id uuid references auth.users(id) on delete set null;
create index on quote_requests (user_id);

create or replace function submit_quote_request(p_kind text, p_target text, p_name text, p_phone text, p_email text, p_qty text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''); em text := nullif(lower(trim(coalesce(p_email, ''))), '');
        tname text; tprof uuid; torg uuid; r uuid;
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
    select name into tname from site_materials where slug = p_target and status = 'published';
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
  insert into quote_requests (kind, target_ref, target_name, profile_id, organization_id, sender_name, sender_phone, sender_email, quantity_note, message, user_id)
  values (p_kind, p_target, tname, tprof, torg, trim(p_name), ph, em, nullif(trim(coalesce(p_qty, '')), ''), trim(p_message), case when is_web_user() then auth.uid() end)
  returning id into r;
  -- báo cho chủ/quản lý cơ sở (nếu yêu cầu gắn với một cơ sở)
  if torg is not null then
    perform notify(m.user_id, 'quote', 'Có yêu cầu báo giá mới', coalesce(tname, 'Yêu cầu báo giá'), '/gian-hang/')
       from organization_memberships m where m.organization_id = torg and m.status = 'active' and (m.roles && array['owner', 'manager', 'profile_editor']::member_role[]);
  end if;
  return r;
end $$;

create or replace function my_sent_quotes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select id, kind, target_name, quantity_note, message, status, created_at from quote_requests where user_id = auth.uid() order by created_at desc limit 100) q), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- Thông báo trong website (chuông). Chỉ hàm trong CSDL tạo; người dùng đọc/đánh dấu đã đọc của chính mình.
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (length(kind) <= 30),
  title text not null check (length(title) <= 160),
  body text check (length(body) <= 300),
  link text check (link is null or link ~ '^/[^/\s]'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
alter table notifications enable row level security;

create or replace function notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link) values (p_user, p_kind, left(p_title, 160), left(p_body, 300), p_link);
$$;

create or replace function list_my_notifications(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (
    select id, kind, title, body, link, read_at, created_at from notifications where user_id = auth.uid() order by created_at desc limit least(coalesce(p_limit, 50), 100)) n), '[]');
end $$;

create or replace function unread_notification_count() returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return (select count(*)::int from notifications where user_id = auth.uid() and read_at is null);
end $$;

create or replace function mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

-- ---------------------------------------------------------------------------
-- Giao thương
-- ---------------------------------------------------------------------------
create table trade_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  kind text not null check (kind in ('buy', 'sell')),
  category_id uuid references product_categories(id) on delete set null,
  product_name text check (length(product_name) <= 60),
  title text not null check (length(title) <= 200),
  quantity numeric check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 20),
  price_min numeric check (price_min >= 0),
  price_max numeric check (price_max >= 0),
  province text not null check (length(trim(province)) between 1 and 60),
  district text check (length(district) <= 60),
  when_date date,                                   -- tin mua: cần hàng trước ngày; tin bán: có hàng từ ngày
  quality text[] not null default '{}' check (cardinality(quality) <= 8),
  description text check (length(description) <= 500),
  images text[] not null default '{}' check (cardinality(images) <= 2),
  status text not null default 'pending' check (status in ('pending', 'published', 'closed', 'rejected', 'hidden')),
  review_note text check (length(review_note) <= 300),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min)
);
create index on trade_posts (status, expires_at desc);
create index on trade_posts (user_id, created_at desc);
alter table trade_posts enable row level security;

-- Khách chỉ thấy phần TÓM TẮT của tin đã duyệt và còn hạn (không mô tả, không ảnh, không người đăng)
create view public_trade_posts as
  select p.id, p.kind, p.title, p.category_id, (select c.name from product_categories c where c.id = p.category_id) as category_name,
         p.province, p.quantity, p.unit, p.expires_at, p.created_at
    from trade_posts p where p.status = 'published' and p.expires_at > now();

create table trade_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references trade_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  price numeric check (price >= 0),
  quantity numeric check (quantity > 0),
  deliver_date date,
  note text check (length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index on trade_responses (post_id);
alter table trade_responses enable row level security;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references trade_posts(id) on delete set null,
  response_id uuid references trade_responses(id) on delete set null,
  title text not null check (length(title) <= 200),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_contact boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on conversation_members (user_id);
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check (length(body) between 1 and 1000),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('trade_post', 'user')),
  target_id uuid not null,
  reason text not null check (length(trim(reason)) between 5 and 300),
  status text not null default 'open' check (status in ('open', 'handled', 'dismissed')),
  note text check (length(note) <= 300),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index abuse_reports_open_unique on abuse_reports (reporter_id, target_type, target_id) where status = 'open';
alter table abuse_reports enable row level security;

-- ---------------------------------------------------------------------------
-- Hàm dùng chung (nội bộ)
-- ---------------------------------------------------------------------------
-- Đăng tin/báo giá cần tài khoản email đã xác nhận (số điện thoại chưa xác minh OTP)
create or replace function require_verified() returns void
language plpgsql stable security definer set search_path = public as $$
declare u jsonb; viaemail boolean;
begin
  perform web_guard();
  select to_jsonb(x) into u from auth.users x where x.id = auth.uid();
  select login_kind = 'email' into viaemail from buyer_profiles where user_id = auth.uid();
  if not (coalesce(viaemail, true) and u->>'email_confirmed_at' is not null) then
    raise exception 'VERIFY: Cần tài khoản đăng ký bằng email và đã xác nhận email để đăng tin hoặc gửi báo giá.';
  end if;
end $$;

-- Chặn số điện thoại, email, đường dẫn, tài khoản mạng xã hội trong nội dung (giữ giao dịch trong hệ thống tới khi hai bên đồng ý)
create or replace function check_no_contact(p_text text, p_what text) returns void
language plpgsql immutable as $$
begin
  if p_text is null then return; end if;
  if p_text ~ '(\d[\s.\-]*){8,}' or p_text ~* '(https?://|www\.)' or p_text ~* '[^\s@]+@[^\s@]+\.[a-z]{2,}' or p_text ~* '(zalo|viber|telegram|facebook|messenger|fb\.com|fb\.me|whatsapp)' then
    raise exception 'CONTACT: % không được chứa số điện thoại, email, đường dẫn hoặc tài khoản mạng xã hội. Liên hệ sẽ được mở khi hai bên cùng đồng ý trong hộp thư.', p_what;
  end if;
end $$;

create or replace function trade_image_ok(p_images text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(i ~ '^data:image/(jpeg|png|webp);base64,' and length(i) <= 150000), true) from unnest(coalesce(p_images, '{}')) i;
$$;

-- ---------------------------------------------------------------------------
-- Đăng tin
-- ---------------------------------------------------------------------------
create or replace function create_trade_post(p_kind text, p_category uuid, p_product text, p_quantity numeric, p_unit text, p_price_min numeric, p_price_max numeric,
                                             p_province text, p_district text, p_when date, p_days integer, p_quality text[], p_description text, p_images text[],
                                             p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cat product_categories; r uuid; st text; ttl text; ndays integer := least(greatest(coalesce(p_days, 14), 1), 30); lim integer;
begin
  perform require_verified();
  if p_kind not in ('buy', 'sell') then raise exception 'INVALID: Loại tin không hợp lệ.'; end if;
  if p_kind = 'sell' and (p_org is null or not can_edit_profile(p_org)) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý cơ sở được đăng tin cần bán (chọn cơ sở của bạn).';
  end if;
  if p_kind = 'buy' and p_org is not null then raise exception 'INVALID: Tin cần mua không gắn với cơ sở.'; end if;
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
  lim := case when p_kind = 'buy' then 5 else 10 end;
  if (select count(*) from trade_posts where user_id = auth.uid() and kind = p_kind and status in ('pending', 'published') and expires_at > now()) >= lim then
    raise exception 'LIMIT: Bạn đang có quá nhiều tin còn hiệu lực (tối đa % tin cùng loại). Hãy đóng bớt tin cũ.', lim;
  end if;
  if (select count(*) from trade_posts where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'RATE_LIMIT: Bạn đã đăng nhiều tin hôm nay. Vui lòng thử lại vào ngày mai.';
  end if;
  ttl := case when p_kind = 'buy' then 'Cần mua ' else 'Cần bán ' end || coalesce(nullif(trim(p_product), ''), cat.name)
         || ' ' || trim(trailing '.' from regexp_replace(p_quantity::text, '(\.\d*?)0+$', '\1')) || ' ' || trim(p_unit) || ' · ' || trim(p_province);
  -- người đã có tin được duyệt và không bị từ chối/ẩn trong 30 ngày thì tự duyệt
  st := case when exists (select 1 from trade_posts where user_id = auth.uid() and status = 'published')
              and not exists (select 1 from trade_posts where user_id = auth.uid() and status in ('rejected', 'hidden') and updated_at > now() - interval '30 days')
             then 'published' else 'pending' end;
  insert into trade_posts (user_id, organization_id, kind, category_id, product_name, title, quantity, unit, price_min, price_max, province, district, when_date,
                           quality, description, images, status, expires_at)
  values (auth.uid(), p_org, p_kind, cat.id, nullif(trim(coalesce(p_product, '')), ''), ttl, p_quantity, trim(p_unit), p_price_min, p_price_max, trim(p_province),
          nullif(trim(coalesce(p_district, '')), ''), p_when, coalesce(p_quality, '{}'), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_images, '{}'), st,
          now() + make_interval(days => ndays))
  returning id into r;
  if st = 'pending' then perform notify(auth.uid(), 'trade', 'Tin của bạn đang chờ duyệt', ttl, '/giao-thuong/cua-toi/'); end if;
  return jsonb_build_object('id', r, 'status', st);
end $$;

create or replace function list_my_trade_posts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select p.id, p.kind, p.title, p.status, p.review_note, p.expires_at, p.created_at, (p.expires_at <= now()) as expired,
           (select count(*) from trade_responses r where r.post_id = p.id and r.status = 'open') as open_responses,
           (select count(*) from trade_responses r where r.post_id = p.id) as responses
      from trade_posts p where p.user_id = auth.uid() order by p.created_at desc limit 100) x), '[]');
end $$;

create or replace function close_trade_post(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  update trade_posts set status = 'closed', updated_at = now() where id = p_id and user_id = auth.uid() and status in ('pending', 'published');
  if not found then raise exception 'NOT_FOUND: Không tìm thấy tin hoặc tin không còn hiệu lực.'; end if;
end $$;

create or replace function extend_trade_post(p_id uuid, p_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  update trade_posts set expires_at = now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 30)), updated_at = now()
   where id = p_id and user_id = auth.uid() and status in ('pending', 'published');
  if not found then raise exception 'NOT_FOUND: Không tìm thấy tin hoặc tin đã đóng.'; end if;
end $$;

-- Chi tiết tin: CẦN ĐĂNG NHẬP. Người đăng tin mua ẩn danh với người xem; chủ tin thấy danh sách báo giá.
create or replace function get_trade_post(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p trade_posts; mine boolean; prof jsonb; me jsonb; owner_resp jsonb;
begin
  perform web_guard();
  select * into p from trade_posts where id = p_id;
  if p.id is null then raise exception 'NOT_FOUND: Không tìm thấy tin này.'; end if;
  mine := p.user_id = auth.uid();
  if not mine and not (p.status = 'published' and p.expires_at > now()) and not has_site_role(array['chief_editor', 'moderator']) then
    raise exception 'NOT_FOUND: Tin này không còn hiển thị.';
  end if;
  if p.kind = 'sell' and p.organization_id is not null then
    select jsonb_build_object('name', b.display_name, 'slug', b.slug, 'province', b.province) into prof
      from business_profiles b where b.organization_id = p.organization_id and b.status = 'published' limit 1;
    if prof is null then select jsonb_build_object('name', o.name) into prof from organizations o where o.id = p.organization_id; end if;
  end if;
  select to_jsonb(r) - 'post_id' into me from trade_responses r where r.post_id = p.id and r.user_id = auth.uid();
  if mine then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'price', r.price, 'quantity', r.quantity, 'deliver_date', r.deliver_date, 'note', r.note, 'created_at', r.created_at,
             'name', coalesce(o.name, bp.full_name), 'company', bp.company, 'buyer_kind', bp.buyer_kind,
             'conversation_id', (select c.id from conversations c where c.response_id = r.id)) order by r.created_at desc), '[]') into owner_resp
      from trade_responses r left join organizations o on o.id = r.organization_id left join buyer_profiles bp on bp.user_id = r.user_id where r.post_id = p.id;
  end if;
  return jsonb_build_object('id', p.id, 'kind', p.kind, 'title', p.title, 'status', p.status, 'review_note', case when mine then p.review_note end,
    'category_id', p.category_id, 'category_name', (select name from product_categories where id = p.category_id),
    'product_name', p.product_name, 'quantity', p.quantity, 'unit', p.unit, 'price_min', p.price_min, 'price_max', p.price_max,
    'province', p.province, 'district', p.district, 'when_date', p.when_date, 'quality', to_jsonb(p.quality), 'description', p.description, 'images', to_jsonb(p.images),
    'expires_at', p.expires_at, 'created_at', p.created_at, 'expired', p.expires_at <= now(), 'is_owner', mine,
    'poster', case when p.kind = 'sell' then prof else jsonb_build_object('anonymous', true, 'label', 'Người mua tại ' || p.province) end,
    'my_response', me, 'responses', owner_resp);
end $$;

-- ---------------------------------------------------------------------------
-- Quan tâm / báo giá
-- ---------------------------------------------------------------------------
create or replace function respond_trade_post(p_post uuid, p_price numeric, p_quantity numeric, p_date date, p_note text, p_org uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p trade_posts; r uuid; who text;
begin
  perform require_verified();
  select * into p from trade_posts where id = p_post;
  if p.id is null or p.status <> 'published' or p.expires_at <= now() then raise exception 'NOT_FOUND: Tin này không còn nhận báo giá.'; end if;
  if p.user_id = auth.uid() then raise exception 'INVALID: Bạn không thể báo giá vào tin của chính mình.'; end if;
  if p.kind = 'buy' and (p_org is null or not can_edit_profile(p_org)) then
    raise exception 'FORBIDDEN: Báo giá cho tin cần mua do chủ hoặc quản lý cơ sở thực hiện (chọn cơ sở của bạn).';
  end if;
  if p.kind = 'sell' and p_org is not null then raise exception 'INVALID: Quan tâm tin cần bán không gắn với cơ sở.'; end if;
  if p_price is not null and p_price < 0 then raise exception 'INVALID: Giá chưa đúng.'; end if;
  perform check_no_contact(p_note, 'Ghi chú');
  if (select count(*) from trade_responses where post_id = p_post) >= 100 then raise exception 'LIMIT: Tin này đã nhận đủ báo giá.'; end if;
  insert into trade_responses (post_id, user_id, organization_id, price, quantity, deliver_date, note)
  values (p_post, auth.uid(), p_org, p_price, p_quantity, p_date, nullif(trim(coalesce(p_note, '')), ''))
  returning id into r;
  select coalesce((select name from organizations where id = p_org), (select full_name from buyer_profiles where user_id = auth.uid()), 'Một người dùng') into who;
  perform notify(p.user_id, 'trade', case when p.kind = 'buy' then 'Có báo giá mới cho tin của bạn' else 'Có người quan tâm tin của bạn' end, who || ' · ' || p.title, '/giao-thuong/tin/' || p.id);
  return r;
exception when unique_violation then
  raise exception 'INVALID: Bạn đã gửi cho tin này rồi.';
end $$;

create or replace function withdraw_trade_response(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  update trade_responses set status = 'withdrawn' where id = p_id and user_id = auth.uid() and status = 'open';
  if not found then raise exception 'NOT_FOUND: Không tìm thấy hoặc không còn rút được.'; end if;
end $$;

-- Chủ tin chấp nhận (mở trao đổi trong hộp thư) hoặc từ chối một báo giá
create or replace function decide_trade_response(p_response uuid, p_accept boolean, p_share boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare r trade_responses; p trade_posts; c uuid;
begin
  perform web_guard();
  select * into r from trade_responses where id = p_response;
  select * into p from trade_posts where id = r.post_id;
  if r.id is null or p.user_id <> auth.uid() then raise exception 'FORBIDDEN: Bạn không có quyền xử lý báo giá này.'; end if;
  if r.status <> 'open' then raise exception 'INVALID: Báo giá này đã được xử lý.'; end if;
  if not p_accept then
    update trade_responses set status = 'declined' where id = r.id;
    perform notify(r.user_id, 'trade', 'Báo giá chưa được chọn', p.title, '/giao-thuong/tin/' || p.id);
    return null;
  end if;
  update trade_responses set status = 'accepted' where id = r.id;
  insert into conversations (post_id, response_id, title) values (p.id, r.id, p.title) returning id into c;
  insert into conversation_members (conversation_id, user_id, share_contact) values (c, p.user_id, coalesce(p_share, false)), (c, r.user_id, false);
  insert into messages (conversation_id, sender_id, body, is_system) values (c, null, 'Người đăng tin đã chấp nhận báo giá. Hai bên trao đổi tại đây. Số điện thoại và email chỉ hiện khi cả hai cùng bấm "Chia sẻ liên hệ".', true);
  perform notify(r.user_id, 'trade', 'Báo giá của bạn được chấp nhận', p.title, '/hop-thu/?c=' || c);
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Hộp thư
-- ---------------------------------------------------------------------------
create or replace function is_conversation_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = p_conv and user_id = auth.uid());
$$;

create or replace function list_my_conversations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.last_message_at desc) from (
    select c.id, c.title, c.post_id, c.last_message_at,
           (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
           (select count(*) from messages m where m.conversation_id = c.id and m.created_at > cm.last_read_at and m.sender_id is distinct from auth.uid())::int as unread,
           (select coalesce(string_agg(coalesce(o.name, bp.full_name), ', '), '') from conversation_members cm2
              join buyer_profiles bp on bp.user_id = cm2.user_id
              left join trade_responses r on r.id = c.response_id and r.user_id = cm2.user_id
              left join organizations o on o.id = r.organization_id
             where cm2.conversation_id = c.id and cm2.user_id <> auth.uid()) as with_whom
      from conversations c join conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
     order by c.last_message_at desc limit 100) x), '[]');
end $$;

create or replace function get_conversation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations; res jsonb;
begin
  perform web_guard();
  if not is_conversation_member(p_id) then raise exception 'FORBIDDEN: Bạn không thuộc cuộc trao đổi này.'; end if;
  select * into c from conversations where id = p_id;
  update conversation_members set last_read_at = now() where conversation_id = p_id and user_id = auth.uid();
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and link = '/hop-thu/?c=' || p_id;
  select jsonb_build_object('id', c.id, 'title', c.title, 'post_id', c.post_id,
    'me_share', (select share_contact from conversation_members where conversation_id = p_id and user_id = auth.uid()),
    'other_share', coalesce((select bool_and(share_contact) from conversation_members where conversation_id = p_id and user_id <> auth.uid()), false),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'me', cm.user_id = auth.uid(),
                  'name', coalesce(o.name, bp.full_name))), '[]')
                  from conversation_members cm join buyer_profiles bp on bp.user_id = cm.user_id
                  left join trade_responses r on r.id = c.response_id and r.user_id = cm.user_id left join organizations o on o.id = r.organization_id
                 where cm.conversation_id = p_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.sender_id = auth.uid(), 'system', m.is_system, 'body', m.body, 'at', m.created_at) order by m.created_at)
                            from (select * from messages where conversation_id = p_id order by created_at desc limit 200) m), '[]')) into res;
  return res;
end $$;

create or replace function send_message(p_conv uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare body text := trim(coalesce(p_body, '')); both_shared boolean;
begin
  perform web_guard();
  if not is_conversation_member(p_conv) then raise exception 'FORBIDDEN: Bạn không thuộc cuộc trao đổi này.'; end if;
  if length(body) = 0 or length(body) > 1000 then raise exception 'INVALID: Tin nhắn cần từ 1 đến 1000 ký tự.'; end if;
  select bool_and(share_contact) into both_shared from conversation_members where conversation_id = p_conv;
  if not coalesce(both_shared, false) then perform check_no_contact(body, 'Tin nhắn'); end if;
  if (select count(*) from messages where conversation_id = p_conv and sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'RATE_LIMIT: Bạn gửi tin quá nhanh. Vui lòng chờ một chút.';
  end if;
  insert into messages (conversation_id, sender_id, body) values (p_conv, auth.uid(), body);
  update conversations set last_message_at = now() where id = p_conv;
  update conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = auth.uid();
  -- báo cho người kia (không dồn thông báo: chỉ khi chưa có thông báo chưa đọc của cuộc này)
  perform notify(cm.user_id, 'message', 'Tin nhắn mới', (select title from conversations where id = p_conv), '/hop-thu/?c=' || p_conv)
     from conversation_members cm where cm.conversation_id = p_conv and cm.user_id <> auth.uid()
      and not exists (select 1 from notifications n where n.user_id = cm.user_id and n.read_at is null and n.link = '/hop-thu/?c=' || p_conv and n.kind = 'message');
end $$;

create or replace function set_share_contact(p_conv uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  update conversation_members set share_contact = coalesce(p_on, false) where conversation_id = p_conv and user_id = auth.uid();
  if not found then raise exception 'FORBIDDEN: Bạn không thuộc cuộc trao đổi này.'; end if;
  insert into messages (conversation_id, sender_id, body, is_system)
  values (p_conv, null, case when coalesce(p_on, false) then 'Một bên đã đồng ý chia sẻ liên hệ.' else 'Một bên đã thu hồi chia sẻ liên hệ.' end, true);
  update conversations set last_message_at = now() where id = p_conv;
end $$;

-- Liên hệ của bên kia: CHỈ khi hai bên cùng đồng ý
create or replace function get_conversation_contacts(p_conv uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u jsonb;
begin
  perform web_guard();
  if not is_conversation_member(p_conv) then raise exception 'FORBIDDEN: Bạn không thuộc cuộc trao đổi này.'; end if;
  if exists (select 1 from conversation_members where conversation_id = p_conv and not share_contact) then
    raise exception 'LOCKED: Liên hệ chỉ hiện khi cả hai bên cùng bấm "Chia sẻ liên hệ".';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(o.name, bp.full_name), 'phone', bp.phone,
                    'email', case when bp.login_kind = 'email' then (select x.email from auth.users x where x.id = bp.user_id) end))
                     from conversation_members cm join buyer_profiles bp on bp.user_id = cm.user_id
                     join conversations c on c.id = cm.conversation_id
                     left join trade_responses r on r.id = c.response_id and r.user_id = cm.user_id left join organizations o on o.id = r.organization_id
                    where cm.conversation_id = p_conv and cm.user_id <> auth.uid()), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo vi phạm
-- ---------------------------------------------------------------------------
create or replace function report_abuse(p_type text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform web_guard();
  if p_type = 'trade_post' then
    if not exists (select 1 from trade_posts where id = p_id and status = 'published') then raise exception 'NOT_FOUND: Không tìm thấy tin này.'; end if;
  elsif p_type = 'user' then
    if not exists (select 1 from buyer_profiles where user_id = p_id) then raise exception 'NOT_FOUND: Không tìm thấy người dùng.'; end if;
  else raise exception 'INVALID: Loại báo cáo không hợp lệ.'; end if;
  if (select count(*) from abuse_reports where reporter_id = auth.uid() and created_at > now() - interval '24 hours') >= 10 then raise exception 'RATE_LIMIT: Bạn đã báo cáo nhiều lần hôm nay.'; end if;
  insert into abuse_reports (reporter_id, target_type, target_id, reason) values (auth.uid(), p_type, p_id, trim(p_reason));
exception when unique_violation then
  raise exception 'INVALID: Bạn đã báo cáo mục này, chúng tôi sẽ xem xét.';
end $$;

-- ---------------------------------------------------------------------------
-- Quản trị website: duyệt tin, xử lý báo cáo, tổng quan
-- ---------------------------------------------------------------------------
create or replace function site_list_trade_posts(p_status text default 'pending', p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select p.id, p.kind, p.title, p.status, p.review_note, p.category_id, (select name from product_categories where id = p.category_id) as category_name,
           p.product_name, p.quantity, p.unit, p.price_min, p.price_max, p.province, p.district, p.when_date, p.quality, p.description, p.images, p.expires_at, p.created_at,
           bp.full_name as poster_name, bp.buyer_kind, bp.company, (select o.name from organizations o where o.id = p.organization_id) as org_name,
           (select count(*) from trade_posts q where q.user_id = p.user_id and q.status = 'published') as poster_published,
           (select count(*) from abuse_reports a where a.target_type = 'trade_post' and a.target_id = p.id and a.status = 'open') as open_reports
      from trade_posts p left join buyer_profiles bp on bp.user_id = p.user_id
     where p_status is null or p.status = p_status order by p.created_at desc limit least(coalesce(p_limit, 100), 300)) x), '[]');
end $$;

create or replace function site_review_trade_post(p_id uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p trade_posts; ns text;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  select * into p from trade_posts where id = p_id;
  if p.id is null then raise exception 'NOT_FOUND: Không tìm thấy tin.'; end if;
  ns := case p_decision when 'approve' then 'published' when 'restore' then 'published' when 'reject' then 'rejected' when 'hide' then 'hidden' end;
  if ns is null then raise exception 'INVALID: Quyết định không hợp lệ.'; end if;
  if ns in ('rejected', 'hidden') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  update trade_posts set status = ns, review_note = nullif(trim(coalesce(p_reason, '')), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_id;
  perform notify(p.user_id, 'trade', case ns when 'published' then 'Tin của bạn đã được duyệt' when 'rejected' then 'Tin của bạn chưa được duyệt' else 'Tin của bạn đã bị ẩn' end,
                 p.title || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), ''), case when ns = 'published' then '/giao-thuong/tin/' || p.id else '/giao-thuong/cua-toi/' end);
  perform admin_audit(null, 'site_trade_' || p_decision, 'trade_posts', p_id::text, jsonb_build_object('status', p.status), jsonb_build_object('status', ns), p_reason);
end $$;

create or replace function site_list_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select a.id, a.target_type, a.target_id, a.reason, a.status, a.note, a.created_at,
           (select bp.full_name from buyer_profiles bp where bp.user_id = a.reporter_id) as reporter,
           case when a.target_type = 'trade_post' then (select t.title from trade_posts t where t.id = a.target_id)
                else (select bp.full_name from buyer_profiles bp where bp.user_id = a.target_id) end as target_label,
           case when a.target_type = 'trade_post' then (select t.status from trade_posts t where t.id = a.target_id) end as target_status
      from abuse_reports a where p_status is null or a.status = p_status order by a.created_at desc limit 200) x), '[]');
end $$;

-- p_action: 'hide_post' (ẩn tin bị báo cáo), 'block_user' (khóa người đăng/người bị báo cáo) hoặc null (chỉ đóng báo cáo)
create or replace function site_handle_report(p_id uuid, p_status text, p_note text, p_action text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a abuse_reports; owner uuid;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  if p_status not in ('handled', 'dismissed') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  select * into a from abuse_reports where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy báo cáo.'; end if;
  if p_action = 'hide_post' and a.target_type = 'trade_post' then
    perform site_review_trade_post(a.target_id, 'hide', coalesce(nullif(trim(p_note), ''), 'Bị báo cáo vi phạm'));
  elsif p_action = 'block_user' then
    owner := case when a.target_type = 'user' then a.target_id else (select user_id from trade_posts where id = a.target_id) end;
    if owner is not null then
      update buyer_profiles set status = 'blocked', blocked_reason = left(coalesce(nullif(trim(p_note), ''), 'Vi phạm quy tắc giao thương'), 300), updated_at = now() where user_id = owner;
      perform admin_audit(null, 'site_user_blocked', 'buyer_profiles', owner::text, null, jsonb_build_object('report', p_id), p_note);
    end if;
  elsif p_action is not null then raise exception 'INVALID: Hành động không hợp lệ.';
  end if;
  update abuse_reports set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now() where id = p_id;
  perform admin_audit(null, 'site_report_' || p_status, 'abuse_reports', p_id::text, null, jsonb_build_object('action', p_action), p_note);
end $$;

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
    'materials', jsonb_build_object('draft', (select count(*) from site_materials where status = 'draft'), 'review', (select count(*) from site_materials where status = 'review'),
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
    'users_total', (select count(*) from buyer_profiles));
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke all on notifications, trade_posts, trade_responses, conversations, conversation_members, messages, abuse_reports from public, anon, authenticated;
revoke all on public_trade_posts from public, anon, authenticated;
grant select on public_trade_posts to anon, authenticated;

revoke execute on function notify(uuid, text, text, text, text), require_verified(), check_no_contact(text, text), trade_image_ok(text[]), is_conversation_member(uuid),
  my_sent_quotes(), list_my_notifications(integer), unread_notification_count(), mark_notifications_read(uuid[]),
  create_trade_post(text, uuid, text, numeric, text, numeric, numeric, text, text, date, integer, text[], text, text[], uuid), list_my_trade_posts(), close_trade_post(uuid),
  extend_trade_post(uuid, integer), get_trade_post(uuid), respond_trade_post(uuid, numeric, numeric, date, text, uuid), withdraw_trade_response(uuid),
  decide_trade_response(uuid, boolean, boolean), list_my_conversations(), get_conversation(uuid), send_message(uuid, text), set_share_contact(uuid, boolean),
  get_conversation_contacts(uuid), report_abuse(text, uuid, text), site_list_trade_posts(text, integer), site_review_trade_post(uuid, text, text),
  site_list_reports(text), site_handle_report(uuid, text, text, text), site_overview() from public, anon;
revoke execute on function notify(uuid, text, text, text, text), require_verified(), check_no_contact(text, text), trade_image_ok(text[]) from authenticated;
grant execute on function is_conversation_member(uuid), my_sent_quotes(), list_my_notifications(integer), unread_notification_count(), mark_notifications_read(uuid[]),
  create_trade_post(text, uuid, text, numeric, text, numeric, numeric, text, text, date, integer, text[], text, text[], uuid), list_my_trade_posts(), close_trade_post(uuid),
  extend_trade_post(uuid, integer), get_trade_post(uuid), respond_trade_post(uuid, numeric, numeric, date, text, uuid), withdraw_trade_response(uuid),
  decide_trade_response(uuid, boolean, boolean), list_my_conversations(), get_conversation(uuid), send_message(uuid, text), set_share_contact(uuid, boolean),
  get_conversation_contacts(uuid), report_abuse(text, uuid, text), site_list_trade_posts(text, integer), site_review_trade_post(uuid, text, text),
  site_list_reports(text), site_handle_report(uuid, text, text, text), site_overview() to authenticated;
-- gửi yêu cầu báo giá vẫn cho khách (đã cấp ở 0043); thu hồi lại không cần vì create or replace giữ nguyên quyền
