-- G2-1 (D75): KHO ẢNH RIÊNG (Supabase Storage) cho ảnh vận hành của app: trang trại, sản phẩm, vật tư, giấy phép/chứng chỉ.
-- Trước đây ảnh nằm trong cột dạng data URL (D37/A33). Từ nay ảnh là tệp JPEG trong kho 'org-media', cột image chỉ giữ tham chiếu ngắn 'storage:<đường dẫn>'.
-- Cột image cũ (data URL) vẫn đọc được song song để chuyển dần; ảnh công khai của website KHÔNG đổi ở migration này.
--
-- Đường dẫn: <mã cơ sở>/<loại>/<mã ảnh>.jpg (ảnh đầy đủ) và <mã cơ sở>/<loại>/<mã ảnh>_t.jpg (ảnh nhỏ). Loại: areas, crops, materials, licenses, overrides.
-- Kho là RIÊNG TƯ: chỉ người trong cơ sở đọc được; chỉ người có quyền sửa mục tương ứng mới ghi/xóa được.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-media', 'org-media', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- Mã cơ sở lấy từ đường dẫn; sai định dạng thì trả null (chính sách sẽ từ chối)
create or replace function media_org(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(areas|crops|materials|licenses|overrides)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
revoke execute on function media_org(text) from public, anon;
grant execute on function media_org(text) to authenticated, service_role;

create policy org_media_read on storage.objects for select to authenticated
  using (bucket_id = 'org-media' and media_org(name) is not null
         and (is_org_member(media_org(name)) or can_read_org_config(media_org(name))));

create policy org_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-media' and media_org(name) is not null
              and (has_org_role(media_org(name), array['owner', 'manager']::member_role[])
                   or has_perm(media_org(name), 'declare', 'edit') or has_perm(media_org(name), 'inventory', 'edit')));

create policy org_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-media' and media_org(name) is not null
         and (has_org_role(media_org(name), array['owner', 'manager']::member_role[])
              or has_perm(media_org(name), 'declare', 'edit') or has_perm(media_org(name), 'inventory', 'edit')));
-- Không có chính sách UPDATE: ảnh không bao giờ bị ghi đè (đường dẫn mới cho mỗi ảnh), nên lưu đệm lâu được.
