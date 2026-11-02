-- Ảnh chèn vào trang tĩnh của website: biên tập viên tải ảnh từ máy lên, nhận mã, chèn vào nội dung bằng ![mô tả](/anh/pg/<mã>).
-- Ảnh lưu nén dạng data URL như banner. Bảng KHÔNG cấp quyền cho khách; website đọc từng ảnh qua hàm public_page_image(mã), nên không liệt kê được ảnh chưa dùng.
create table site_page_images (
  id uuid primary key default gen_random_uuid(),
  image text not null check (image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(image) <= 400000),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table site_page_images enable row level security;
revoke all on site_page_images from public, anon, authenticated;

create or replace function site_upload_page_image(p_image text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_image is null or p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'INVALID: Hãy chọn một tệp ảnh jpeg, png hoặc webp.'; end if;
  if length(p_image) > 400000 then raise exception 'INVALID: Ảnh quá lớn, hãy chọn ảnh nhỏ hơn.'; end if;
  insert into site_page_images (image) values (p_image) returning id into r;
  return r;
end $$;

create or replace function public_page_image(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select image from site_page_images where id = p_id;
$$;

revoke execute on function site_upload_page_image(text), public_page_image(uuid) from public, anon;
grant execute on function site_upload_page_image(text) to authenticated;
grant execute on function public_page_image(uuid) to anon, authenticated;
