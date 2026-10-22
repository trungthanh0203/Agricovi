-- W7 (D69): ĐÁNH GIÁ NHÀ CUNG CẤP sau đơn hoàn tất + hộp tin website cho app.
-- Nguyên tắc: chỉ người mua của đơn đã hoàn tất mới đánh giá (mỗi đơn một lần, trong 30 ngày), nên không thể tự khen hay đánh giá khống;
-- nhà cung cấp trả lời một lần và có thể báo "đánh giá không đúng" để kiểm duyệt xem xét; kiểm duyệt viên ẩn/hiện được (có lý do + nhật ký);
-- công khai chỉ gồm số sao, nhận xét, trả lời, tên người mua rút gọn (không email, điện thoại, mã đơn); nội dung bị lọc liên hệ.

create table supplier_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references web_orders(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text check (length(comment) <= 300),
  reply text check (length(reply) <= 300),
  replied_at timestamptz,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  hidden_reason text check (length(hidden_reason) <= 300),
  flagged boolean not null default false,
  flag_reason text check (length(flag_reason) <= 300),
  created_at timestamptz not null default now()
);
create index on supplier_reviews (profile_id, created_at desc);
create index on supplier_reviews (organization_id, created_at desc);
alter table supplier_reviews enable row level security;

-- Công khai: tên người mua rút gọn ("Khách An"), không có mã đơn/người dùng
create view public_reviews as
  select r.id, r.profile_id, r.stars, r.comment, r.reply, r.replied_at, r.created_at,
         'Khách ' || coalesce(nullif((regexp_split_to_array(trim((select b.full_name from buyer_profiles b where b.user_id = r.buyer_id)), '\s+'))[array_length(regexp_split_to_array(trim((select b.full_name from buyer_profiles b where b.user_id = r.buyer_id)), '\s+'), 1)], ''), 'ẩn danh') as buyer_label
    from supplier_reviews r join public_profiles p on p.profile_id = r.profile_id and p.is_visible
   where r.status = 'visible';
create view public_supplier_ratings as
  select r.profile_id, round(avg(r.stars)::numeric, 1) as avg_stars, count(*)::int as review_count
    from supplier_reviews r join public_profiles p on p.profile_id = r.profile_id and p.is_visible
   where r.status = 'visible' group by r.profile_id;
grant select on public_reviews, public_supplier_ratings to anon, authenticated;

-- Người mua: đánh giá đơn đã hoàn tất
create or replace function review_order(p_order uuid, p_stars integer, p_comment text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o web_orders; rid uuid; cm text := nullif(trim(coalesce(p_comment, '')), '');
begin
  perform require_verified();
  select * into o from web_orders where id = p_order and buyer_id = auth.uid();
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  if o.status <> 'completed' then raise exception 'INVALID: Chỉ đánh giá được khi đơn đã hoàn tất.'; end if;
  if o.completed_at < now() - interval '30 days' then raise exception 'INVALID: Đã quá 30 ngày kể từ khi đơn hoàn tất nên không đánh giá được nữa.'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'INVALID: Hãy chọn số sao từ 1 đến 5.'; end if;
  if p_stars <= 2 and length(coalesce(cm, '')) < 5 then raise exception 'INVALID: Hãy cho biết lý do bạn chưa hài lòng (ít nhất 5 ký tự).'; end if;
  perform check_no_contact(cm, 'Nhận xét');
  if exists (select 1 from supplier_reviews where order_id = p_order) then raise exception 'INVALID: Bạn đã đánh giá đơn này rồi.'; end if;
  insert into supplier_reviews (order_id, buyer_id, organization_id, profile_id, stars, comment) values (p_order, auth.uid(), o.organization_id, o.profile_id, p_stars, cm) returning id into rid;
  perform notify_order_sellers(o.organization_id, 'Khách vừa đánh giá ' || p_stars || ' sao', o.code || coalesce(' — ' || cm, ''), p_order);
  return rid;
end $$;

-- Đánh giá của đơn (cho người mua hoặc nhà cung cấp của đơn) + có đánh giá được không
create or replace function get_order_review(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o web_orders; side text; r supplier_reviews;
begin
  perform web_guard();
  select * into o from web_orders where id = p_order;
  side := case when o.id is null then null else order_side(o.buyer_id, o.organization_id) end;
  if side is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng.'; end if;
  select * into r from supplier_reviews where order_id = p_order;
  return jsonb_build_object('side', side,
    'can_review', side = 'buyer' and r.id is null and o.status = 'completed' and o.completed_at >= now() - interval '30 days',
    'review', case when r.id is null then null else jsonb_build_object('id', r.id, 'stars', r.stars, 'comment', r.comment, 'reply', r.reply, 'replied_at', r.replied_at,
                'status', r.status, 'hidden_reason', case when side = 'seller' then r.hidden_reason end, 'flagged', r.flagged, 'created_at', r.created_at) end);
end $$;

-- Nhà cung cấp: danh sách đánh giá của các cơ sở mình quản lý
create or replace function my_shop_reviews() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id, r.stars, r.comment, r.reply, r.replied_at, r.status, r.flagged, r.created_at, o.code as order_code, o.id as order_id, o.supplier_name,
           (select b.full_name from buyer_profiles b where b.user_id = r.buyer_id) as buyer_name
      from supplier_reviews r join web_orders o on o.id = r.order_id
     where can_edit_profile(r.organization_id) order by r.created_at desc limit 200) x), '[]');
end $$;

create or replace function reply_review(p_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare r supplier_reviews; tx text := nullif(trim(coalesce(p_reply, '')), '');
begin
  perform web_guard();
  select * into r from supplier_reviews where id = p_id for update;
  if r.id is null or not can_edit_profile(r.organization_id) then raise exception 'NOT_FOUND: Không tìm thấy đánh giá.'; end if;
  if r.status <> 'visible' then raise exception 'INVALID: Đánh giá này đang bị ẩn, chưa trả lời được.'; end if;
  if r.reply is not null then raise exception 'INVALID: Bạn đã trả lời đánh giá này rồi.'; end if;
  if tx is null or length(tx) < 2 then raise exception 'INVALID: Hãy nhập nội dung trả lời.'; end if;
  perform check_no_contact(tx, 'Trả lời');
  update supplier_reviews set reply = tx, replied_at = now() where id = p_id;
  perform notify(r.buyer_id, 'order', 'Nhà cung cấp đã trả lời đánh giá của bạn', left(tx, 120), '/don-hang/' || r.order_id);
end $$;

-- Nhà cung cấp báo "đánh giá không đúng sự thật/vi phạm" để kiểm duyệt xem xét (không tự ẩn được)
create or replace function flag_review(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r supplier_reviews;
begin
  perform web_guard();
  select * into r from supplier_reviews where id = p_id for update;
  if r.id is null or not can_edit_profile(r.organization_id) then raise exception 'NOT_FOUND: Không tìm thấy đánh giá.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  perform check_no_contact(p_reason, 'Lý do');
  update supplier_reviews set flagged = true, flag_reason = left(trim(p_reason), 300) where id = p_id;
end $$;

-- Kiểm duyệt
create or replace function site_list_reviews(p_filter text default 'flagged') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id, r.stars, r.comment, r.reply, r.status, r.hidden_reason, r.flagged, r.flag_reason, r.created_at, o.code as order_code, o.supplier_name,
           (select b.full_name from buyer_profiles b where b.user_id = r.buyer_id) as buyer_name
      from supplier_reviews r join web_orders o on o.id = r.order_id
     where case coalesce(p_filter, 'all') when 'flagged' then r.flagged and r.status = 'visible' when 'hidden' then r.status = 'hidden' else true end
     order by r.created_at desc limit 200) x), '[]');
end $$;

create or replace function site_set_review_hidden(p_id uuid, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r supplier_reviews; ns text := case when p_hidden then 'hidden' else 'visible' end;
begin
  perform site_guard(array['chief_editor', 'moderator']);
  select * into r from supplier_reviews where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy đánh giá.'; end if;
  if p_hidden and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'INVALID: Hãy ghi lý do ẩn (ít nhất 5 ký tự).'; end if;
  update supplier_reviews set status = ns, hidden_reason = case when p_hidden then left(trim(p_reason), 300) else null end, flagged = case when p_hidden then flagged else false end where id = p_id;
  if p_hidden then perform notify(r.buyer_id, 'order', 'Đánh giá của bạn đã bị ẩn', left(trim(p_reason), 150), '/don-hang/' || r.order_id); end if;
  perform admin_audit(null, case when p_hidden then 'site_review_hide' else 'site_review_restore' end, 'supplier_reviews', p_id::text, jsonb_build_object('status', r.status), jsonb_build_object('status', ns), p_reason);
end $$;

-- Hộp tin website cho APP: số việc đang chờ của một cơ sở (chỉ người quản lý hồ sơ cơ sở đó xem được; không lộ nội dung)
create or replace function org_web_inbox(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not can_edit_profile(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem mục này.'; end if;
  return jsonb_build_object(
    'orders_new', (select count(*)::int from web_orders where organization_id = p_org and status = 'placed'),
    'orders_todo', (select count(*)::int from web_orders where organization_id = p_org and status in ('placed', 'accepted', 'preparing', 'shipped')),
    'quotes_new', (select count(*)::int from quote_requests where organization_id = p_org and status = 'new'),
    'reviews_unreplied', (select count(*)::int from supplier_reviews where organization_id = p_org and status = 'visible' and reply is null));
end $$;

revoke all on supplier_reviews from public, anon, authenticated;
revoke execute on function review_order(uuid, integer, text), get_order_review(uuid), my_shop_reviews(), reply_review(uuid, text), flag_review(uuid, text),
  site_list_reviews(text), site_set_review_hidden(uuid, boolean, text), org_web_inbox(uuid) from public, anon;
grant execute on function review_order(uuid, integer, text), get_order_review(uuid), my_shop_reviews(), reply_review(uuid, text), flag_review(uuid, text),
  site_list_reviews(text), site_set_review_hidden(uuid, boolean, text), org_web_inbox(uuid) to authenticated;
