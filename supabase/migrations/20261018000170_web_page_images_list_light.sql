-- Thư viện ảnh trang tĩnh: danh sách KHÔNG trả nội dung ảnh (có thể hàng chục MB); giao diện xem ảnh qua /anh/pg/<mã> (được lưu đệm).
create or replace function site_list_page_images(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'created_at', x.created_at,
             'used_in', coalesce((select jsonb_agg(p.slug order by p.slug) from site_pages p where position('/anh/pg/' || x.id::text in p.body) > 0), '[]'::jsonb))
           order by x.created_at desc)
    from (select id, created_at from site_page_images order by created_at desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) x), '[]'::jsonb);
end $$;
