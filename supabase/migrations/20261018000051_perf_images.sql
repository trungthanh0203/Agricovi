-- W8 (D71): HIỆU NĂNG. Ảnh đang nằm trong CSDL dạng data URL (không có kho ảnh riêng). Trước đây trang danh sách tải CẢ ảnh trong mọi lần đọc và nhúng thẳng vào HTML
-- (hàng trăm KB–MB mỗi trang, không lưu đệm được). Từ nay: danh sách chỉ đọc phần chữ + cờ "có ảnh"; ảnh được phục vụ riêng qua /anh/… (lưu đệm, ETag).

-- Cờ "có ảnh" tính sẵn để danh sách không phải đọc cột ảnh
alter table site_banners add column has_image boolean generated always as (coalesce(image, '') <> '') stored;
alter table site_materials add column has_image boolean generated always as (coalesce(image, '') <> '') stored;
alter table site_articles add column has_image boolean generated always as (coalesce(image, '') <> '') stored;

-- Bản "nhẹ" của hồ sơ và sản phẩm công khai: bỏ nội dung ảnh, chỉ giữ chú thích + cờ ok (ảnh hợp lệ để phục vụ) theo ĐÚNG THỨ TỰ trong mảng
create or replace function lite_images(p_images jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('caption', i->>'caption', 'ok', coalesce(i->>'src', '') ~ '^data:image/(jpeg|png|webp);base64,') order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) with ordinality as t(i, n);
$$;

create view public_profiles_lite as
  select profile_id, organization_id, slug, published_at, (snapshot - 'images') || jsonb_build_object('images', lite_images(snapshot->'images')) as snapshot
    from public_profiles where is_visible;
create view public_products_lite as
  select listing_id, profile_id, supply_status, supply_updated_on, (snapshot - 'images') || jsonb_build_object('images', lite_images(snapshot->'images')) as snapshot
    from public_products where is_visible;
grant select on public_profiles_lite, public_products_lite to anon, authenticated;

-- Chỉ mục cho các truy vấn mới (huy hiệu, danh sách đơn theo hồ sơ, vụ công khai theo cơ sở, chứng chỉ theo hồ sơ)
create index if not exists web_orders_profile_status_idx on web_orders (profile_id, status);
create index if not exists public_cycles_org_visible_idx on public_cycles (organization_id) where is_visible;
create index if not exists certification_records_profile_status_idx on certification_records (business_profile_id, status);
create index if not exists trade_posts_category_idx on trade_posts (category_id, status, expires_at desc);
create index if not exists notifications_user_unread_idx on notifications (user_id) where read_at is null;

-- Một lệnh gọi thay cho hai (số thông báo chưa đọc + số sản phẩm trong giỏ) mỗi lần mở trang khi đã đăng nhập
create or replace function web_shell_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform web_guard();
  return jsonb_build_object('unread', (select count(*)::int from notifications where user_id = auth.uid() and read_at is null),
                            'cart', (select count(*)::int from cart_items where user_id = auth.uid()));
end $$;
revoke execute on function web_shell_counts() from public, anon;
grant execute on function web_shell_counts() to authenticated;

-- An toàn: hàm trigger không bao giờ được gọi trực tiếp bởi khách (EXECUTE mặc định cấp cho PUBLIC); thu hồi hàng loạt.
-- Trigger vẫn chạy bình thường vì quyền EXECUTE của hàm trigger chỉ kiểm lúc tạo trigger.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute 'revoke execute on function ' || r.sig || ' from public, anon';
  end loop;
end $$;
