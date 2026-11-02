-- Thư viện ảnh trang tĩnh: liệt kê ảnh đã tải lên (kèm trang đang dùng) và xóa ảnh chưa dùng.
create or replace function site_list_page_images(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'image', x.image, 'created_at', x.created_at,
             'used_in', coalesce((select jsonb_agg(p.slug order by p.slug) from site_pages p where position('/anh/pg/' || x.id::text in p.body) > 0), '[]'::jsonb))
           order by x.created_at desc)
    from (select * from site_page_images order by created_at desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) x), '[]'::jsonb);
end $$;

create or replace function site_delete_page_image(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare used text;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if not exists (select 1 from site_page_images where id = p_id) then raise exception 'NOT_FOUND: Không tìm thấy ảnh này.'; end if;
  select string_agg(slug, ', ') into used from site_pages where position('/anh/pg/' || p_id::text in body) > 0;
  if used is not null then raise exception 'INVALID: Ảnh đang dùng trong trang: %. Hãy gỡ dòng ảnh khỏi trang đó (và lưu) rồi xóa ảnh.', used; end if;
  delete from site_page_images where id = p_id;
  perform admin_audit(null, 'site_page_image_delete', 'site_page_images', p_id::text, null, null, null);
end $$;

revoke execute on function site_list_page_images(integer), site_delete_page_image(uuid) from public, anon;
grant execute on function site_list_page_images(integer), site_delete_page_image(uuid) to authenticated;
