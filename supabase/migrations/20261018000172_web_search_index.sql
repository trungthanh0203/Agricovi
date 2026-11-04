-- Chỉ mục tìm kiếm (web): mỗi bảng được tìm có thêm cột search_text (chữ thường, đã bỏ dấu, gom sẵn các trường cần tìm; do CSDL tự tính khi ghi)
-- và chỉ mục GIN trigram, để LIKE '%từ khóa%' dùng chỉ mục thay vì quét bảng và mở cột JSON lớn (có ảnh).
-- Ba hàm tìm kiếm (ô tìm trên đầu trang, danh bạ, sản phẩm theo trang) đổi sang đọc cột này; kết quả và giao diện giữ nguyên.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public_profiles add column if not exists search_text text generated always as (
  fold_vi(coalesce(snapshot->>'display_name', '') || ' ' || coalesce(snapshot->>'province', '') || ' ' || coalesce(snapshot->>'district', '') || ' ' || coalesce(snapshot->>'description', ''))) stored;
alter table public_products add column if not exists search_text text generated always as (
  fold_vi(coalesce(snapshot->>'name', '') || ' ' || coalesce(snapshot->>'crop', ''))) stored;
alter table site_materials add column if not exists search_text text generated always as (
  fold_vi(coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(summary, ''))) stored;
alter table site_articles add column if not exists search_text text generated always as (
  fold_vi(coalesce(title, '') || ' ' || coalesce(summary, ''))) stored;

create index if not exists public_profiles_search_trgm on public_profiles using gin (search_text extensions.gin_trgm_ops);
create index if not exists public_products_search_trgm on public_products using gin (search_text extensions.gin_trgm_ops);
create index if not exists site_materials_search_trgm on site_materials using gin (search_text extensions.gin_trgm_ops);
create index if not exists site_articles_search_trgm on site_articles using gin (search_text extensions.gin_trgm_ops);
create index if not exists public_products_profile_visible_idx on public_products (profile_id) where is_visible;

-- Ô tìm trên đầu trang
create or replace function site_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := fold_vi(trim(coalesce(p_q, '')));
begin
  if length(q) < 2 then return jsonb_build_object('profiles', '[]'::jsonb, 'products', '[]'::jsonb, 'materials', '[]'::jsonb, 'articles', '[]'::jsonb, 'shops', '[]'::jsonb); end if;
  q := '%' || replace(replace(q, '%', ''), '_', '') || '%';
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(x) from (select slug, snapshot->>'display_name' as name, snapshot->>'province' as province from public_profiles
                           where is_visible and search_text like q limit 10) x), '[]'),
    'products', coalesce((select jsonb_agg(x) from (select pp.listing_id as id, pp.snapshot->>'name' as name, pr.snapshot->>'display_name' as profile_name, pr.snapshot->>'province' as province
                           from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
                           where pp.is_visible and pr.is_visible and pp.search_text like q limit 12) x), '[]'),
    'materials', coalesce((select jsonb_agg(x) from (select slug, name, brand from site_materials
                           where status = 'published' and (shop_id is null or shop_is_active(shop_id)) and search_text like q limit 12) x), '[]'),
    'articles', coalesce((select jsonb_agg(x) from (select slug, title, channel from site_articles
                           where status = 'published' and (published_at is null or published_at <= now()) and search_text like q order by published_at desc nulls last limit 10) x), '[]'),
    'shops', coalesce((select jsonb_agg(x) from (select slug, name, province from public_material_shops where fold_vi(name) like q or fold_vi(description) like q limit 8) x), '[]'));
end $$;

-- Danh bạ theo trang: mỗi từ phải khớp trong thông tin hồ sơ HOẶC trong tên/cây trồng của một sản phẩm đang hiển thị
create or replace function public_directory_page(p_q text default null, p_province text default null, p_available boolean default false,
                                                 p_offset integer default 0, p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fq text := replace(replace(fold_vi(trim(coalesce(p_q, ''))), '%', ''), '_', ''); lim integer := least(greatest(coalesce(p_limit, 24), 1), 60);
        off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  with m as (
    select d.* from public_directory d join public_profiles p on p.profile_id = d.profile_id
     where (nullif(trim(coalesce(p_province, '')), '') is null or d.province = p_province)
       and (not coalesce(p_available, false) or exists (select 1 from public_products pp where pp.profile_id = d.profile_id and pp.is_visible and pp.supply_status = 'available'))
       and (fq = '' or not exists (
              select 1 from unnest(string_to_array(fq, ' ')) w
               where w <> '' and not (p.search_text like '%' || w || '%'
                                      or exists (select 1 from public_products x where x.profile_id = d.profile_id and x.is_visible and x.search_text like '%' || w || '%'))))
  )
  select jsonb_build_object(
           'total', (select count(*) from m),
           'provinces', coalesce((select jsonb_agg(pv order by pv) from (select distinct province as pv from public_directory where province is not null and province <> '') x), '[]'::jsonb),
           'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
                      select profile_id, slug, display_name, province, district, description, is_priority from m
                       order by is_priority desc, rank_score desc, display_name offset off limit lim) r), '[]'::jsonb))
    into res;
  return res;
end $$;

-- Sản phẩm theo trang: mỗi từ phải khớp trong tên/cây trồng của sản phẩm HOẶC thông tin nhà cung cấp (tên, tỉnh, huyện, mô tả)
create or replace function public_products_page(p_categories uuid[] default null, p_province text default null, p_q text default null, p_available boolean default false,
                                                p_offset integer default 0, p_limit integer default 24, p_listing uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fq text := replace(replace(fold_vi(trim(coalesce(p_q, ''))), '%', ''), '_', ''); lim integer := least(greatest(coalesce(p_limit, 24), 1), 60);
        off integer := greatest(coalesce(p_offset, 0), 0); res jsonb; cats text[] := case when p_categories is null then null else p_categories::text[] end;
begin
  with base as (
    select pp.listing_id, pp.profile_id, pp.supply_status, pp.supply_updated_on, pp.snapshot, pp.search_text as ptext, pr.search_text as stext,
           pr.slug, pr.snapshot->>'display_name' as display_name, pr.snapshot->>'province' as province
      from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible
     where pp.is_visible and (p_listing is null or pp.listing_id = p_listing)
       and (cats is null or (pp.snapshot->>'category_id') = any (cats))
  ), f as (
    select * from base
     where (nullif(trim(coalesce(p_province, '')), '') is null or province = p_province)
       and (not coalesce(p_available, false) or supply_status = 'available')
       and (fq = '' or not exists (
              select 1 from unnest(string_to_array(fq, ' ')) w
               where w <> '' and not (ptext like '%' || w || '%' or stext like '%' || w || '%')))
  )
  select jsonb_build_object(
           'total', (select count(*) from f),
           'provinces', coalesce((select jsonb_agg(pv order by pv) from (select distinct province as pv from base where province is not null and province <> '') x), '[]'::jsonb),
           'items', coalesce((select jsonb_agg(to_jsonb(r)) from (
                      select f.listing_id, f.profile_id, f.supply_status, f.supply_updated_on,
                             (f.snapshot - 'images') || jsonb_build_object('images', lite_images(f.snapshot->'images')) as snapshot, f.slug, f.display_name, f.province
                        from f order by (f.supply_status = 'available') desc, f.supply_updated_on desc nulls last, f.snapshot->>'name' offset off limit lim) r), '[]'::jsonb))
    into res;
  return res;
end $$;
