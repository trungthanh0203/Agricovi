-- W2 (D60–D61, docs/PLAN_WEBSITE.md): DANH MỤC SẢN PHẨM, VẬT TƯ DO QUẢN TRỊ VIÊN NHẬP, TIN TỨC/HỘI CHỢ, YÊU CẦU BÁO GIÁ, TÌM KIẾM.
-- Ảnh vẫn lưu nén trong cột (quyết định: chưa dùng Storage; mỗi chỗ chỉ 1–2 ảnh, ảnh nhỏ) nên cột ảnh bị chặn dung lượng thấp.
-- Website (anon) chỉ đọc nội dung ĐÃ ĐĂNG; ghi qua hàm site_* có kiểm quyền (dùng lại site_guard/site_check_status của 0042).

-- Chuỗi tiếng Việt không dấu, chữ thường (để tìm kiếm "dua luoi" ra "dưa lưới")
create or replace function fold_vi(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
$$;

-- ---------------------------------------------------------------------------
-- Cây danh mục (nông sản, giống, vật tư, phụ kiện); quản trị website sửa được
-- ---------------------------------------------------------------------------
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references product_categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  name text not null check (length(trim(name)) between 1 and 80),
  branch text not null check (branch in ('nong_san', 'giong', 'vat_tu', 'phu_kien')),
  description text check (length(description) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  restricted boolean not null default false,   -- hàng hạn chế (thuốc BVTV, thú y): cần giấy phép, chưa mở
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index on product_categories (parent_id);
alter table product_categories enable row level security;
create policy product_categories_public on product_categories for select to anon, authenticated using (is_active);
create policy product_categories_staff on product_categories for select to authenticated using (has_site_role(array['chief_editor', 'editor', 'moderator']));

insert into product_categories (slug, name, branch, sort_order) values
  ('rau-cu-qua', 'Rau củ quả', 'nong_san', 10), ('trai-cay', 'Trái cây', 'nong_san', 20), ('vat-nuoi', 'Vật nuôi', 'nong_san', 30),
  ('gao-nong-san-kho', 'Gạo, nông sản khô', 'nong_san', 40), ('giong', 'Giống, cây giống', 'giong', 50),
  ('vat-tu-nong-nghiep', 'Vật tư nông nghiệp', 'vat_tu', 60), ('phu-kien-thiet-bi', 'Phụ kiện, thiết bị', 'phu_kien', 70);
insert into product_categories (parent_id, slug, name, branch, sort_order)
select p.id, c.slug, c.name, p.branch, c.sort_order from product_categories p join (values
  ('rau-cu-qua', 'rau-an-la', 'Rau ăn lá', 1), ('rau-cu-qua', 'rau-an-qua', 'Rau ăn quả', 2), ('rau-cu-qua', 'cu-nam', 'Củ, nấm', 3),
  ('trai-cay', 'trai-cay-nhiet-doi', 'Trái cây nhiệt đới', 1), ('trai-cay', 'dua-luoi-dua-hau', 'Dưa lưới, dưa hấu', 2),
  ('vat-nuoi', 'gia-suc', 'Gia súc', 1), ('vat-nuoi', 'gia-cam', 'Gia cầm', 2), ('vat-nuoi', 'thuy-san', 'Thủy sản', 3), ('vat-nuoi', 'trung-sua-mat-ong', 'Trứng, sữa, mật ong', 4),
  ('giong', 'hat-giong', 'Hạt giống', 1), ('giong', 'cay-giong', 'Cây giống', 2), ('giong', 'con-giong', 'Con giống', 3),
  ('vat-tu-nong-nghiep', 'phan-bon', 'Phân bón', 1), ('vat-tu-nong-nghiep', 'dinh-duong', 'Dinh dưỡng, kích thích sinh trưởng', 2),
  ('vat-tu-nong-nghiep', 'che-pham-sinh-hoc', 'Chế phẩm sinh học', 3), ('vat-tu-nong-nghiep', 'thuc-an-chan-nuoi', 'Thức ăn chăn nuôi, thủy sản', 4),
  ('phu-kien-thiet-bi', 'he-thong-tuoi', 'Hệ thống tưới', 1), ('phu-kien-thiet-bi', 'nha-mang-mang-phu', 'Nhà màng, màng phủ', 2),
  ('phu-kien-thiet-bi', 'dung-cu-may-moc', 'Dụng cụ, máy móc nhỏ', 3), ('phu-kien-thiet-bi', 'bao-bi', 'Bao bì, tem nhãn', 4)
) as c(parent_slug, slug, name, sort_order) on c.parent_slug = p.slug;

-- Sản phẩm của nhà cung cấp: thêm danh mục và giá "từ" (số, để hiển thị "Từ 40.000đ"); giá chữ tự do (price_note) giữ nguyên
alter table product_listings
  add column category_id uuid references product_categories(id) on delete set null,
  add column price_from numeric check (price_from is null or price_from >= 0);

create or replace function build_product_snapshot(p_listing uuid, p_scope text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pl product_listings; snap jsonb; v_code text; cat product_categories;
begin
  select * into pl from product_listings where id = p_listing;
  select code into v_code from public_cycles where cycle_id = pl.cycle_id and is_visible;
  select * into cat from product_categories where id = pl.category_id;
  snap := jsonb_build_object('name', pl.name, 'description', pl.description, 'specification', pl.specification,
    'crop_type_id', pl.crop_type_id, 'crop', (select name from crop_types where id = pl.crop_type_id),
    'unit', pl.unit, 'season', pl.season, 'price_note', pl.price_note, 'min_order', pl.min_order, 'trace_code', v_code,
    'price_from', pl.price_from, 'category_id', cat.id, 'category_slug', cat.slug, 'category_name', cat.name);
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

create or replace function site_save_category(p_id uuid, p_parent uuid, p_slug text, p_name text, p_branch text, p_desc text, p_sort integer,
                                              p_active boolean, p_restricted boolean, p_version integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur product_categories; r uuid;
begin
  perform site_guard(array['chief_editor']);
  if p_id is not null and p_parent = p_id then raise exception 'INVALID: Danh mục không thể là con của chính nó.'; end if;
  if p_id is null then
    insert into product_categories (parent_id, slug, name, branch, description, sort_order, is_active, restricted)
    values (p_parent, lower(trim(p_slug)), trim(p_name), p_branch, nullif(trim(coalesce(p_desc, '')), ''), coalesce(p_sort, 0), coalesce(p_active, true), coalesce(p_restricted, false))
    returning id into r;
    perform admin_audit(null, 'site_category_create', 'product_categories', r::text, null, jsonb_build_object('slug', p_slug), null);
    return r;
  end if;
  select * into cur from product_categories where id = p_id for update;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy danh mục.'; end if;
  if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa danh mục này. Hãy tải lại bản mới rồi sửa lại.'; end if;
  update product_categories set parent_id = p_parent, slug = lower(trim(p_slug)), name = trim(p_name), branch = p_branch,
         description = nullif(trim(coalesce(p_desc, '')), ''), sort_order = coalesce(p_sort, 0), is_active = coalesce(p_active, true),
         restricted = coalesce(p_restricted, false), version = cur.version + 1, updated_at = now()
   where id = p_id;
  perform admin_audit(null, 'site_category_update', 'product_categories', p_id::text, null, jsonb_build_object('slug', p_slug, 'active', p_active), null);
  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Vật tư nông nghiệp do quản trị viên nhập (đợt đầu; người bán vật tư tự đăng sẽ làm sau)
-- ---------------------------------------------------------------------------
create table site_materials (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references product_categories(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(trim(name)) between 1 and 160),
  brand text check (length(brand) <= 80),
  summary text check (length(summary) <= 300),
  ingredients text check (length(ingredients) <= 500),
  usage text check (length(usage) <= 1500),
  safety text check (length(safety) <= 800),
  unit text check (length(unit) <= 30),
  price_from numeric check (price_from is null or price_from >= 0),
  price_note text check (length(price_note) <= 120),
  distributor text check (length(distributor) <= 200),
  image text check (image is null or image = '' or (image ~ '^data:image/(jpeg|png|webp);base64,' and length(image) <= 200000)),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'hidden')),
  sort_order integer not null default 0,
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on site_materials (category_id);
alter table site_materials enable row level security;
create policy site_materials_public on site_materials for select to anon, authenticated using (status = 'published');
create policy site_materials_staff on site_materials for select to authenticated using (has_site_role(array['chief_editor', 'editor', 'moderator']));

create or replace function site_check_material_category(p_cat uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_cat is not null and not exists (select 1 from product_categories where id = p_cat and branch in ('vat_tu', 'phu_kien') and not restricted) then
    raise exception 'INVALID: Vật tư chỉ thuộc nhóm Vật tư nông nghiệp hoặc Phụ kiện, thiết bị (chưa mở nhóm hàng hạn chế).';
  end if;
end $$;

create or replace function site_save_material(p_id uuid, p_category uuid, p_slug text, p_name text, p_brand text, p_summary text, p_ingredients text, p_usage text,
                                              p_safety text, p_unit text, p_price_from numeric, p_price_note text, p_distributor text, p_image text,
                                              p_status text, p_sort integer, p_version integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur site_materials; r uuid; sl text := lower(trim(coalesce(p_slug, '')));
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_status not in ('draft', 'review', 'published', 'hidden') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  if sl !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID: Địa chỉ chỉ gồm chữ thường không dấu, số và dấu gạch ngang.'; end if;
  perform site_check_material_category(p_category);
  if p_id is null then
    perform site_check_status(null, p_status);
    insert into site_materials (category_id, slug, name, brand, summary, ingredients, usage, safety, unit, price_from, price_note, distributor, image, status, sort_order, updated_by)
    values (p_category, sl, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), nullif(trim(coalesce(p_summary, '')), ''), nullif(trim(coalesce(p_ingredients, '')), ''),
            nullif(trim(coalesce(p_usage, '')), ''), nullif(trim(coalesce(p_safety, '')), ''), nullif(trim(coalesce(p_unit, '')), ''), p_price_from,
            nullif(trim(coalesce(p_price_note, '')), ''), nullif(trim(coalesce(p_distributor, '')), ''), nullif(p_image, ''), p_status, coalesce(p_sort, 0), auth.uid())
    returning id into r;
    perform admin_audit(null, 'site_material_create', 'site_materials', r::text, null, jsonb_build_object('slug', sl, 'status', p_status), null);
    return r;
  end if;
  select * into cur from site_materials where id = p_id for update;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vật tư.'; end if;
  if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa vật tư này. Hãy tải lại bản mới rồi sửa lại.'; end if;
  perform site_check_status(cur.status, p_status);
  update site_materials set category_id = p_category, slug = sl, name = trim(p_name), brand = nullif(trim(coalesce(p_brand, '')), ''),
         summary = nullif(trim(coalesce(p_summary, '')), ''), ingredients = nullif(trim(coalesce(p_ingredients, '')), ''), usage = nullif(trim(coalesce(p_usage, '')), ''),
         safety = nullif(trim(coalesce(p_safety, '')), ''), unit = nullif(trim(coalesce(p_unit, '')), ''), price_from = p_price_from,
         price_note = nullif(trim(coalesce(p_price_note, '')), ''), distributor = nullif(trim(coalesce(p_distributor, '')), ''), image = nullif(p_image, ''),
         status = p_status, sort_order = coalesce(p_sort, 0), version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform admin_audit(null, 'site_material_update', 'site_materials', p_id::text, jsonb_build_object('status', cur.status), jsonb_build_object('status', p_status), null);
  return p_id;
end $$;

create or replace function site_delete_material(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  delete from site_materials where id = p_id;
  perform admin_audit(null, 'site_material_delete', 'site_materials', p_id::text, null, null, null);
end $$;

-- Nhập hàng loạt (từ CSV): luôn vào dạng NHÁP; trùng địa chỉ thì bỏ qua và báo lại. Tối đa 200 dòng mỗi lần.
create or replace function site_import_materials(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; n integer := 0; skipped jsonb := '[]'; sl text; cat uuid;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then raise exception 'INVALID: Mỗi lần nhập tối đa 200 dòng.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if length(trim(coalesce(x->>'name', ''))) = 0 then skipped := skipped || jsonb_build_array(jsonb_build_object('name', x->>'name', 'why', 'thiếu tên')); continue; end if;
    sl := slugify(x->>'name');
    if sl = '' or exists (select 1 from site_materials where slug = sl) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('name', x->>'name', 'why', 'trùng địa chỉ hoặc tên không hợp lệ')); continue;
    end if;
    select id into cat from product_categories where slug = lower(trim(coalesce(x->>'category', ''))) and branch in ('vat_tu', 'phu_kien') and not restricted;
    begin
      insert into site_materials (category_id, slug, name, brand, summary, ingredients, usage, unit, price_from, price_note, distributor, status, updated_by)
      values (cat, sl, trim(x->>'name'), nullif(left(trim(coalesce(x->>'brand', '')), 80), ''), nullif(left(trim(coalesce(x->>'summary', '')), 300), ''),
              nullif(left(trim(coalesce(x->>'ingredients', '')), 500), ''), nullif(left(trim(coalesce(x->>'usage', '')), 1500), ''),
              nullif(left(trim(coalesce(x->>'unit', '')), 30), ''), nullif(regexp_replace(coalesce(x->>'price_from', ''), '[^0-9]', '', 'g'), '')::numeric,
              nullif(left(trim(coalesce(x->>'price_note', '')), 120), ''), nullif(left(trim(coalesce(x->>'distributor', '')), 200), ''), 'draft', auth.uid());
      n := n + 1;
    exception when others then
      skipped := skipped || jsonb_build_array(jsonb_build_object('name', x->>'name', 'why', 'dữ liệu không hợp lệ'));
    end;
  end loop;
  perform admin_audit(null, 'site_material_import', 'site_materials', null, null, jsonb_build_object('created', n, 'skipped', jsonb_array_length(skipped)), null);
  return jsonb_build_object('created', n, 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- Tin tức, kiến thức, tin xuất khẩu và TIN HỘI CHỢ (cùng một bảng; hội chợ có thêm ngày, nơi tổ chức)
-- ---------------------------------------------------------------------------
create table site_articles (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('nong_nghiep', 'xuat_khau', 'hoi_cho')),
  section text check (section is null or section ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- mục con, ví dụ trong-nuoc, ky-thuat, gia-nong-san
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  title text not null check (length(trim(title)) between 1 and 200),
  summary text check (length(summary) <= 400),
  body text not null default '' check (length(body) <= 60000),
  image text check (image is null or image = '' or (image ~ '^data:image/(jpeg|png|webp);base64,' and length(image) <= 200000)),
  source_name text check (length(source_name) <= 120),   -- nguồn tin (nếu dẫn lại)
  source_url text check (source_url is null or source_url = '' or source_url ~ '^https://[^\s]+'),
  event_start date,
  event_end date,
  event_place text check (length(event_place) <= 200),
  event_organizer text check (length(event_organizer) <= 200),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'hidden')),
  published_at timestamptz,
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (event_end is null or event_start is null or event_end >= event_start),
  check (channel = 'hoi_cho' or (event_start is null and event_end is null))
);
create index on site_articles (channel, status, published_at desc);
alter table site_articles enable row level security;
create policy site_articles_public on site_articles for select to anon, authenticated using (status = 'published' and (published_at is null or published_at <= now()));
create policy site_articles_staff on site_articles for select to authenticated using (has_site_role(array['chief_editor', 'editor', 'moderator']));

create or replace function site_save_article(p_id uuid, p_channel text, p_section text, p_slug text, p_title text, p_summary text, p_body text, p_image text,
                                             p_source_name text, p_source_url text, p_event_start date, p_event_end date, p_event_place text, p_event_organizer text,
                                             p_status text, p_published_at timestamptz, p_version integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur site_articles; r uuid; sl text := lower(trim(coalesce(p_slug, '')));
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_status not in ('draft', 'review', 'published', 'hidden') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  if sl !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID: Địa chỉ chỉ gồm chữ thường không dấu, số và dấu gạch ngang.'; end if;
  if p_id is null then
    perform site_check_status(null, p_status);
    insert into site_articles (channel, section, slug, title, summary, body, image, source_name, source_url, event_start, event_end, event_place, event_organizer, status, published_at, updated_by)
    values (p_channel, nullif(trim(coalesce(p_section, '')), ''), sl, trim(p_title), nullif(trim(coalesce(p_summary, '')), ''), coalesce(p_body, ''), nullif(p_image, ''),
            nullif(trim(coalesce(p_source_name, '')), ''), nullif(trim(coalesce(p_source_url, '')), ''), p_event_start, p_event_end,
            nullif(trim(coalesce(p_event_place, '')), ''), nullif(trim(coalesce(p_event_organizer, '')), ''), p_status,
            case when p_status = 'published' then coalesce(p_published_at, now()) end, auth.uid())
    returning id into r;
    perform admin_audit(null, 'site_article_create', 'site_articles', r::text, null, jsonb_build_object('slug', sl, 'channel', p_channel, 'status', p_status), null);
    return r;
  end if;
  select * into cur from site_articles where id = p_id for update;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy bài viết.'; end if;
  if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa bài này. Hãy tải lại bản mới rồi sửa lại.'; end if;
  perform site_check_status(cur.status, p_status);
  update site_articles set channel = p_channel, section = nullif(trim(coalesce(p_section, '')), ''), slug = sl, title = trim(p_title),
         summary = nullif(trim(coalesce(p_summary, '')), ''), body = coalesce(p_body, ''), image = nullif(p_image, ''),
         source_name = nullif(trim(coalesce(p_source_name, '')), ''), source_url = nullif(trim(coalesce(p_source_url, '')), ''),
         event_start = p_event_start, event_end = p_event_end, event_place = nullif(trim(coalesce(p_event_place, '')), ''),
         event_organizer = nullif(trim(coalesce(p_event_organizer, '')), ''), status = p_status,
         published_at = case when p_status = 'published' then coalesce(p_published_at, cur.published_at, now()) else cur.published_at end,
         version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform admin_audit(null, 'site_article_update', 'site_articles', p_id::text, jsonb_build_object('status', cur.status), jsonb_build_object('status', p_status), null);
  return p_id;
end $$;

create or replace function site_delete_article(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  delete from site_articles where id = p_id;
  perform admin_audit(null, 'site_article_delete', 'site_articles', p_id::text, null, null, null);
end $$;

-- ---------------------------------------------------------------------------
-- Yêu cầu báo giá (khách chưa cần tài khoản). Chống lạm dụng ở CSDL: giới hạn theo liên hệ và theo giờ; Turnstile sẽ thêm ở lớp website khi có khóa.
-- ---------------------------------------------------------------------------
create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('material', 'product', 'profile', 'general')),
  target_ref text check (length(target_ref) <= 120),
  target_name text check (length(target_name) <= 200),
  profile_id uuid references business_profiles(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  sender_name text not null check (length(trim(sender_name)) between 2 and 80),
  sender_phone text check (length(sender_phone) <= 20),
  sender_email text check (length(sender_email) <= 120),
  quantity_note text check (length(quantity_note) <= 120),
  message text not null check (length(trim(message)) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'handled', 'spam')),
  note text check (length(note) <= 500),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_phone is not null or sender_email is not null)
);
create index on quote_requests (status, created_at desc);
alter table quote_requests enable row level security;   -- không chính sách: chỉ ghi/đọc qua hàm

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
  insert into quote_requests (kind, target_ref, target_name, profile_id, organization_id, sender_name, sender_phone, sender_email, quantity_note, message)
  values (p_kind, p_target, tname, tprof, torg, trim(p_name), ph, em, nullif(trim(coalesce(p_qty, '')), ''), trim(p_message))
  returning id into r;
  return r;
end $$;

create or replace function site_list_quotes(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor', 'moderator']);
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc)
                     from (select id, kind, target_ref, target_name, sender_name, sender_phone, sender_email, quantity_note, message, status, note, handled_at, created_at,
                                  (select o.name from organizations o where o.id = quote_requests.organization_id) as org_name
                             from quote_requests where p_status is null or status = p_status
                            order by created_at desc limit least(coalesce(p_limit, 100), 300)) q), '[]');
end $$;

create or replace function site_set_quote(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor', 'moderator']);
  if p_status not in ('new', 'handled', 'spam') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  update quote_requests set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now() where id = p_id;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy yêu cầu.'; end if;
  perform admin_audit(null, 'site_quote_set', 'quote_requests', p_id::text, null, jsonb_build_object('status', p_status), null);
end $$;

-- ---------------------------------------------------------------------------
-- Tìm kiếm toàn site (không dấu): cơ sở, sản phẩm của cơ sở, vật tư, bài viết
-- ---------------------------------------------------------------------------
create or replace function site_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := fold_vi(trim(coalesce(p_q, '')));
begin
  if length(q) < 2 then return jsonb_build_object('profiles', '[]'::jsonb, 'products', '[]'::jsonb, 'materials', '[]'::jsonb, 'articles', '[]'::jsonb); end if;
  q := '%' || replace(replace(q, '%', ''), '_', '') || '%';
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(x) from (select slug, snapshot->>'display_name' as name, snapshot->>'province' as province from public_profiles
                           where is_visible and (fold_vi(snapshot->>'display_name') like q or fold_vi(snapshot->>'description') like q) limit 10) x), '[]'),
    'products', coalesce((select jsonb_agg(x) from (select pp.listing_id as id, pp.snapshot->>'name' as name, pr.snapshot->>'display_name' as profile_name, pr.snapshot->>'province' as province
                           from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
                           where pp.is_visible and pr.is_visible and (fold_vi(pp.snapshot->>'name') like q or fold_vi(pp.snapshot->>'crop') like q) limit 12) x), '[]'),
    'materials', coalesce((select jsonb_agg(x) from (select slug, name, brand from site_materials
                           where status = 'published' and (fold_vi(name) like q or fold_vi(brand) like q or fold_vi(summary) like q) limit 12) x), '[]'),
    'articles', coalesce((select jsonb_agg(x) from (select slug, title, channel from site_articles
                           where status = 'published' and (published_at is null or published_at <= now()) and (fold_vi(title) like q or fold_vi(summary) like q) order by published_at desc nulls last limit 10) x), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke all on product_categories, site_materials, site_articles, quote_requests from public, anon, authenticated;
grant select on product_categories, site_materials, site_articles to anon, authenticated;

revoke execute on function fold_vi(text), site_save_category(uuid, uuid, text, text, text, text, integer, boolean, boolean, integer),
  site_check_material_category(uuid),
  site_save_material(uuid, uuid, text, text, text, text, text, text, text, text, numeric, text, text, text, text, integer, integer), site_delete_material(uuid),
  site_import_materials(jsonb),
  site_save_article(uuid, text, text, text, text, text, text, text, text, text, date, date, text, text, text, timestamptz, integer), site_delete_article(uuid),
  submit_quote_request(text, text, text, text, text, text, text), site_list_quotes(text, integer), site_set_quote(uuid, text, text), site_search(text)
  from public, anon;
revoke execute on function site_check_material_category(uuid) from authenticated;
-- Hàm mà website (anon) được gọi
grant execute on function fold_vi(text), submit_quote_request(text, text, text, text, text, text, text), site_search(text) to anon, authenticated;
-- Hàm quản trị (kiểm quyền bên trong)
grant execute on function site_save_category(uuid, uuid, text, text, text, text, integer, boolean, boolean, integer),
  site_save_material(uuid, uuid, text, text, text, text, text, text, text, text, numeric, text, text, text, text, integer, integer), site_delete_material(uuid),
  site_import_materials(jsonb),
  site_save_article(uuid, text, text, text, text, text, text, text, text, text, date, date, text, text, text, timestamptz, integer), site_delete_article(uuid),
  site_list_quotes(text, integer), site_set_quote(uuid, text, text)
  to authenticated;
