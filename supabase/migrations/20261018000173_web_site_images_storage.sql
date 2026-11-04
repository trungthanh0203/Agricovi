-- Kho ảnh CÔNG KHAI của website (web, bổ sung G2-1 của app): kho 'site-images' (công khai, chỉ đọc qua địa chỉ công khai của Supabase Storage).
-- Ảnh banner, bài viết, vật tư, trang tĩnh do biên tập viên tải lên thành tệp JPEG; cột image chỉ giữ tham chiếu ngắn 'sb:site/<loại>/<mã>.jpg'.
-- Ảnh cũ dạng data URL vẫn đọc được song song. Website phục vụ ảnh qua /anh/... (chuyển hướng tới kho, có lưu đệm ở biên).
-- Ảnh hồ sơ/sản phẩm của nhà cung cấp (do app tạo) dùng chung cơ chế đọc 'sb:' ở lite_images và /anh/sp, /anh/cs; phần ghi do bên APP làm (xem docs/STATUS_APP.md).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

create or replace function site_image_path_ok(p_name text) returns boolean
language sql immutable as $$
  select coalesce(p_name ~ '^site/(banners|articles|materials|pages)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$', false);
$$;
revoke execute on function site_image_path_ok(text) from public, anon;
grant execute on function site_image_path_ok(text) to authenticated, service_role;

-- Chỉ tổng biên tập và biên tập viên tải lên/xóa; không có chính sách UPDATE (đường dẫn mới cho mỗi ảnh nên lưu đệm lâu được)
create policy site_images_select on storage.objects for select to authenticated using (bucket_id = 'site-images');
create policy site_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and site_image_path_ok(name) and has_site_role(array['chief_editor', 'editor']));
create policy site_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and site_image_path_ok(name) and has_site_role(array['chief_editor', 'editor']));

-- Cho phép tham chiếu 'sb:' ở các cột ảnh của nội dung website
do $$
declare t record; c record; lim integer;
begin
  for t in select * from (values ('site_banners', 400000), ('site_materials', 200000), ('site_articles', 200000), ('site_page_images', 400000)) v(tbl, n) loop
    for c in select conname from pg_constraint where conrelid = t.tbl::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%data:image%' loop
      execute format('alter table %I drop constraint %I', t.tbl, c.conname);
    end loop;
    lim := t.n;
    if t.tbl = 'site_page_images' then
      execute 'alter table site_page_images add constraint site_page_images_image_ref check (image ~ ''^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'' and length(image) <= 400000 or image ~ ''^sb:site/pages/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'')';
    else
      execute format('alter table %I add constraint %I check (image is null or image = '''' or (image ~ ''^data:image/(jpeg|png|webp);base64,'' and length(image) <= %s) or image ~ ''^sb:site/(banners|articles|materials)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'')', t.tbl, t.tbl || '_image_ref', lim);
    end if;
  end loop;
end $$;

-- Ảnh nhẹ của hồ sơ/sản phẩm: tham chiếu 'sb:' cũng được coi là ảnh hợp lệ (website đổi thành /anh/... rồi chuyển hướng tới kho)
create or replace function lite_images(p_images jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('caption', i->>'caption', 'ok', coalesce(i->>'src', '') ~ '^(data:image/(jpeg|png|webp);base64,|sb:)') order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) with ordinality as t(i, n);
$$;

-- Ảnh trang tĩnh: mã do trình duyệt tạo (cũng là tên tệp), CSDL ghi sổ để liệt kê/xóa/kiểm tra đang dùng
create or replace function site_register_page_image(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_id is null then raise exception 'INVALID: Thiếu mã ảnh.'; end if;
  insert into site_page_images (id, image) values (p_id, 'sb:site/pages/' || p_id::text || '.jpg');
  return p_id;
end $$;
revoke execute on function site_register_page_image(uuid) from public, anon;
grant execute on function site_register_page_image(uuid) to authenticated;
