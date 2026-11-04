-- Phân trang danh bạ và sản phẩm ở CSDL (web): website chỉ lấy một trang (vài chục mục) thay vì nạp tất cả hồ sơ/sản phẩm rồi lọc trong bộ nhớ.
-- Hai hàm đọc công khai (khách gọi được), chỉ trả nội dung công khai đã duyệt. Từ khóa tìm không phân biệt dấu/hoa thường, mọi từ đều phải khớp.

create or replace function public_directory_page(p_q text default null, p_province text default null, p_available boolean default false,
                                                 p_offset integer default 0, p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fq text := replace(replace(fold_vi(trim(coalesce(p_q, ''))), '%', ''), '_', ''); lim integer := least(greatest(coalesce(p_limit, 24), 1), 60);
        off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  with f as (
    select d.*, (select string_agg(coalesce(pp.snapshot->>'name', '') || ' ' || coalesce(pp.snapshot->>'crop', ''), ' ')
                   from public_products pp where pp.profile_id = d.profile_id and pp.is_visible) as prod_text
      from public_directory d
     where (nullif(trim(coalesce(p_province, '')), '') is null or d.province = p_province)
       and (not coalesce(p_available, false) or exists (select 1 from public_products pp where pp.profile_id = d.profile_id and pp.is_visible and pp.supply_status = 'available'))
  ), m as (
    select * from f
     where fq = '' or not exists (
             select 1 from unnest(string_to_array(fq, ' ')) w
              where w <> '' and fold_vi(coalesce(f.display_name, '') || ' ' || coalesce(f.province, '') || ' ' || coalesce(f.district, '') || ' ' || coalesce(f.description, '') || ' ' || coalesce(f.prod_text, '')) not like '%' || w || '%')
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

-- Sản phẩm của nhà cung cấp theo trang. p_categories: danh mục (đã gồm danh mục con); p_listing: lấy đúng một sản phẩm.
create or replace function public_products_page(p_categories uuid[] default null, p_province text default null, p_q text default null, p_available boolean default false,
                                                p_offset integer default 0, p_limit integer default 24, p_listing uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fq text := replace(replace(fold_vi(trim(coalesce(p_q, ''))), '%', ''), '_', ''); lim integer := least(greatest(coalesce(p_limit, 24), 1), 60);
        off integer := greatest(coalesce(p_offset, 0), 0); res jsonb; cats text[] := case when p_categories is null then null else p_categories::text[] end;
begin
  with base as (
    select pp.listing_id, pp.profile_id, pp.supply_status, pp.supply_updated_on, pp.snapshot, pr.slug, pr.snapshot->>'display_name' as display_name, pr.snapshot->>'province' as province
      from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible
     where pp.is_visible and (p_listing is null or pp.listing_id = p_listing)
       and (cats is null or (pp.snapshot->>'category_id') = any (cats))
  ), f as (
    select * from base
     where (nullif(trim(coalesce(p_province, '')), '') is null or province = p_province)
       and (not coalesce(p_available, false) or supply_status = 'available')
       and (fq = '' or not exists (
              select 1 from unnest(string_to_array(fq, ' ')) w
               where w <> '' and fold_vi(coalesce(snapshot->>'name', '') || ' ' || coalesce(snapshot->>'crop', '') || ' ' || coalesce(display_name, '')) not like '%' || w || '%'))
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

revoke execute on function public_directory_page(text, text, boolean, integer, integer), public_products_page(uuid[], text, text, boolean, integer, integer, uuid) from public;
grant execute on function public_directory_page(text, text, boolean, integer, integer), public_products_page(uuid[], text, text, boolean, integer, integer, uuid) to anon, authenticated;
