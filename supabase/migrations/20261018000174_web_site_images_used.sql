-- Dọn ảnh không dùng trong kho site-images: danh sách tham chiếu ảnh còn được dùng (banner, bài viết, vật tư, sổ ảnh trang tĩnh), kể cả bản nháp/đã ẩn.
create or replace function site_list_used_images() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  return coalesce((
    select jsonb_agg(distinct r) from (
      select image as r from site_banners where image like 'sb:%'
      union all select image from site_articles where image like 'sb:%'
      union all select image from site_materials where image like 'sb:%'
      union all select image from site_page_images where image like 'sb:%'
    ) x), '[]'::jsonb);
end $$;
revoke execute on function site_list_used_images() from public, anon;
grant execute on function site_list_used_images() to authenticated;
