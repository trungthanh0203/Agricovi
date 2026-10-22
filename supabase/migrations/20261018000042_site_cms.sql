-- W1 (D60–D61, docs/PLAN_WEBSITE.md): KHUNG QUẢN TRỊ NỘI DUNG WEBSITE (CMS).
-- Vai trò biên tập, banner, trang tĩnh (có lịch sử phiên bản), menu, cài đặt chung. Website (khóa anon) chỉ đọc nội dung ĐÃ ĐĂNG.
-- Ghi chỉ qua hàm có kiểm quyền + kiểm phiên bản + nhật ký kiểm toán; không có chính sách ghi trực tiếp vào bảng.

-- ---------------------------------------------------------------------------
-- Vai trò biên tập (quản trị viên nền tảng luôn đủ quyền)
--   chief_editor = tổng biên tập (đăng, gỡ, sửa mọi nội dung); editor = biên tập viên (soạn nháp, gửi duyệt);
--   moderator = kiểm duyệt viên (duyệt hồ sơ/tin về sau; hiện chỉ đọc nội dung nháp)
-- ---------------------------------------------------------------------------
create table platform_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('chief_editor', 'editor', 'moderator')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table platform_roles enable row level security;
-- Không có chính sách: không ai đọc/ghi trực tiếp qua API; chỉ các hàm bên dưới (security definer).

create or replace function has_site_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (select 1 from platform_roles where user_id = auth.uid() and role = any (p_roles));
$$;

create or replace function site_guard(p_roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_site_role(p_roles) then
    raise exception 'FORBIDDEN: Bạn chưa được cấp quyền quản trị nội dung website.';
  end if;
end $$;

-- Vai trò của tôi: 'admin' (quản trị nền tảng) và/hoặc các vai trò biên tập
create or replace function get_my_site_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r order by r), '{}') from (
    select 'admin'::text r where is_platform_admin()
    union select role from platform_roles where user_id = auth.uid()) x;
$$;

-- Quản trị viên cấp/thu hồi vai trò biên tập theo email
create or replace function admin_set_site_role(p_email text, p_role text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  perform admin_guard();
  if p_role not in ('chief_editor', 'editor', 'moderator') then raise exception 'INVALID: Vai trò không hợp lệ.'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'NOT_FOUND: Không có tài khoản với email này. Người đó cần đăng ký trước.'; end if;
  if p_on then
    insert into platform_roles (user_id, role, granted_by) values (u, p_role, auth.uid()) on conflict do nothing;
  else
    delete from platform_roles where user_id = u and role = p_role;
  end if;
  perform admin_audit(null, case when p_on then 'site_role_grant' else 'site_role_revoke' end, 'platform_roles', u::text, null,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role), null);
end $$;

create or replace function admin_list_site_roles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', u.email, 'role', r.role, 'created_at', r.created_at) order by u.email, r.role)
                     from platform_roles r join auth.users u on u.id = r.user_id), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- Trang tĩnh (Giới thiệu, Dành cho người bán…). Thân bài là văn bản đơn giản (website tự thoát ký tự khi hiển thị).
-- ---------------------------------------------------------------------------
create table site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  title text not null check (length(trim(title)) between 1 and 160),
  description text check (length(description) <= 300),
  body text not null default '' check (length(body) <= 60000),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'hidden')),
  published_at timestamptz,
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table site_pages enable row level security;
create policy site_pages_public on site_pages for select to anon, authenticated using (status = 'published');
create policy site_pages_staff on site_pages for select to authenticated using (has_site_role(array['chief_editor', 'editor', 'moderator']));

create table site_page_versions (
  page_id uuid not null references site_pages(id) on delete cascade,
  version integer not null,
  title text not null,
  description text,
  body text not null,
  status text not null,
  saved_by uuid references auth.users(id),
  saved_at timestamptz not null default now(),
  primary key (page_id, version)
);
alter table site_page_versions enable row level security;
create policy site_page_versions_staff on site_page_versions for select to authenticated using (has_site_role(array['chief_editor', 'editor']));

-- ---------------------------------------------------------------------------
-- Banner (băng chuyền trang chủ 'hero' và hai ô phụ 'side')
-- ---------------------------------------------------------------------------
create table site_banners (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('hero', 'side')),
  title text not null check (length(trim(title)) between 1 and 120),
  subtitle text check (length(subtitle) <= 200),
  image text check (image is null or image = '' or (image ~ '^data:image/(jpeg|png|webp);base64,' and length(image) <= 400000)),
  link text check (link is null or link = '' or link ~ '^(/[^/\s]|https://[^\s]+)'),
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'hidden')),
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table site_banners enable row level security;
create policy site_banners_public on site_banners for select to anon, authenticated
  using (status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy site_banners_staff on site_banners for select to authenticated using (has_site_role(array['chief_editor', 'editor', 'moderator']));

-- ---------------------------------------------------------------------------
-- Menu và cài đặt chung (công khai ngay khi lưu; chỉ tổng biên tập/quản trị sửa)
-- ---------------------------------------------------------------------------
create table site_menus (
  key text primary key check (key in ('header_nav', 'about_menu', 'footer_cols')),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table site_menus enable row level security;
create policy site_menus_public on site_menus for select to anon, authenticated using (true);

create table site_settings (
  key text primary key check (key in ('brand', 'contact', 'social', 'legal')),
  value jsonb not null default '{}' check (jsonb_typeof(value) = 'object'),
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
create policy site_settings_public on site_settings for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Hàm ghi
-- ---------------------------------------------------------------------------
-- Quy tắc trạng thái: biên tập viên chỉ làm việc với bản nháp/chờ duyệt; đăng, gỡ và sửa bản đã đăng cần tổng biên tập/quản trị.
create or replace function site_check_status(p_old text, p_new text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if has_site_role(array['chief_editor']) then return; end if;
  if p_new not in ('draft', 'review') or coalesce(p_old, 'draft') not in ('draft', 'review') then
    raise exception 'FORBIDDEN: Chỉ tổng biên tập hoặc quản trị viên được đăng, gỡ hoặc sửa nội dung đã đăng.';
  end if;
end $$;

create or replace function site_save_page(p_id uuid, p_slug text, p_title text, p_description text, p_body text, p_status text, p_version integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur site_pages; sl text := lower(trim(coalesce(p_slug, ''))); r uuid;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if sl in ('co-so', 'danh-ba', 'truyxuat', 'quan-tri', 'api', 'admin', 'dang-nhap', 'dang-ky', 'giao-thuong', 'tin-tuc', 'san-pham', 'vat-tu', 'gio-hang', 'don-hang', 'tai-khoan', 'tim-kiem', 'danh-muc', 'su-kien', 'hoi-cho') then
    raise exception 'INVALID: Địa chỉ "%" đã dành cho chức năng khác. Hãy chọn tên khác.', sl;
  end if;
  if sl !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID: Địa chỉ chỉ gồm chữ thường không dấu, số và dấu gạch ngang.'; end if;
  if p_status not in ('draft', 'review', 'published', 'hidden') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  if p_id is null then
    perform site_check_status(null, p_status);
    insert into site_pages (slug, title, description, body, status, published_at, updated_by)
    values (sl, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_body, ''), p_status,
            case when p_status = 'published' then now() end, auth.uid())
    returning id into r;
    perform admin_audit(null, 'site_page_create', 'site_pages', r::text, null, jsonb_build_object('slug', sl, 'status', p_status), null);
    return r;
  end if;
  select * into cur from site_pages where id = p_id for update;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy trang.'; end if;
  if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa trang này. Hãy tải lại bản mới rồi sửa lại.'; end if;
  perform site_check_status(cur.status, p_status);
  insert into site_page_versions (page_id, version, title, description, body, status, saved_by)
  values (cur.id, cur.version, cur.title, cur.description, cur.body, cur.status, cur.updated_by);
  update site_pages set slug = sl, title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), body = coalesce(p_body, ''),
         status = p_status, published_at = case when p_status = 'published' then coalesce(cur.published_at, now()) else cur.published_at end,
         version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform admin_audit(null, 'site_page_update', 'site_pages', p_id::text, jsonb_build_object('status', cur.status, 'slug', cur.slug),
    jsonb_build_object('status', p_status, 'slug', sl), null);
  return p_id;
end $$;

create or replace function site_delete_page(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur site_pages;
begin
  perform site_guard(array['chief_editor']);
  select * into cur from site_pages where id = p_id;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy trang.'; end if;
  delete from site_pages where id = p_id;
  perform admin_audit(null, 'site_page_delete', 'site_pages', p_id::text, jsonb_build_object('slug', cur.slug, 'title', cur.title), null, null);
end $$;

create or replace function site_save_banner(p_id uuid, p_slot text, p_title text, p_subtitle text, p_image text, p_link text, p_sort integer,
                                            p_starts timestamptz, p_ends timestamptz, p_status text, p_version integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur site_banners; r uuid;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_status not in ('draft', 'review', 'published', 'hidden') then raise exception 'INVALID: Trạng thái không hợp lệ.'; end if;
  if p_id is null then
    perform site_check_status(null, p_status);
    insert into site_banners (slot, title, subtitle, image, link, sort_order, starts_at, ends_at, status, updated_by)
    values (p_slot, trim(p_title), nullif(trim(coalesce(p_subtitle, '')), ''), nullif(p_image, ''), nullif(trim(coalesce(p_link, '')), ''),
            coalesce(p_sort, 0), p_starts, p_ends, p_status, auth.uid())
    returning id into r;
    perform admin_audit(null, 'site_banner_create', 'site_banners', r::text, null, jsonb_build_object('slot', p_slot, 'status', p_status), null);
    return r;
  end if;
  select * into cur from site_banners where id = p_id for update;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy banner.'; end if;
  if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa banner này. Hãy tải lại bản mới rồi sửa lại.'; end if;
  perform site_check_status(cur.status, p_status);
  update site_banners set slot = p_slot, title = trim(p_title), subtitle = nullif(trim(coalesce(p_subtitle, '')), ''), image = nullif(p_image, ''),
         link = nullif(trim(coalesce(p_link, '')), ''), sort_order = coalesce(p_sort, 0), starts_at = p_starts, ends_at = p_ends, status = p_status,
         version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform admin_audit(null, 'site_banner_update', 'site_banners', p_id::text, jsonb_build_object('status', cur.status), jsonb_build_object('status', p_status), null);
  return p_id;
end $$;

create or replace function site_delete_banner(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  delete from site_banners where id = p_id;
  perform admin_audit(null, 'site_banner_delete', 'site_banners', p_id::text, null, null, null);
end $$;

create or replace function site_save_menu(p_key text, p_items jsonb, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare cur site_menus;
begin
  perform site_guard(array['chief_editor']);
  if p_key not in ('header_nav', 'about_menu', 'footer_cols') then raise exception 'INVALID: Menu không hợp lệ.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID: Nội dung menu phải là danh sách.'; end if;
  select * into cur from site_menus where key = p_key for update;
  if not found then
    insert into site_menus (key, items, updated_by) values (p_key, p_items, auth.uid());
  else
    if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa menu này. Hãy tải lại bản mới rồi sửa lại.'; end if;
    update site_menus set items = p_items, version = cur.version + 1, updated_by = auth.uid(), updated_at = now() where key = p_key;
  end if;
  perform admin_audit(null, 'site_menu_save', 'site_menus', p_key, null, null, null);
end $$;

create or replace function site_save_setting(p_key text, p_value jsonb, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare cur site_settings;
begin
  perform site_guard(array['chief_editor']);
  if p_key not in ('brand', 'contact', 'social', 'legal') then raise exception 'INVALID: Mục cài đặt không hợp lệ.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'INVALID: Giá trị cài đặt phải là một đối tượng.'; end if;
  select * into cur from site_settings where key = p_key for update;
  if not found then
    insert into site_settings (key, value, updated_by) values (p_key, p_value, auth.uid());
  else
    if cur.version <> p_version then raise exception 'CONFLICT: Người khác vừa sửa mục này. Hãy tải lại bản mới rồi sửa lại.'; end if;
    update site_settings set value = p_value, version = cur.version + 1, updated_by = auth.uid(), updated_at = now() where key = p_key;
  end if;
  perform admin_audit(null, 'site_setting_save', 'site_settings', p_key, null, null, null);
end $$;

-- Quyền thực thi: mặc định cấp PUBLIC, phải thu hồi (bẫy 3 trong CLAUDE.md)
revoke execute on function has_site_role(text[]), site_guard(text[]), site_check_status(text, text), get_my_site_roles(),
  admin_set_site_role(text, text, boolean), admin_list_site_roles(),
  site_save_page(uuid, text, text, text, text, text, integer), site_delete_page(uuid),
  site_save_banner(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, integer), site_delete_banner(uuid),
  site_save_menu(text, jsonb, integer), site_save_setting(text, jsonb, integer)
  from public, anon;
revoke execute on function site_guard(text[]), site_check_status(text, text) from authenticated;
grant execute on function has_site_role(text[]), get_my_site_roles(), admin_set_site_role(text, text, boolean), admin_list_site_roles(),
  site_save_page(uuid, text, text, text, text, text, integer), site_delete_page(uuid),
  site_save_banner(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, integer), site_delete_banner(uuid),
  site_save_menu(text, jsonb, integer), site_save_setting(text, jsonb, integer)
  to authenticated;

-- Bảng: chỉ cho ĐỌC (RLS lọc nội dung đã đăng); mọi thao tác ghi đi qua hàm site_* ở trên.
revoke all on site_pages, site_page_versions, site_banners, site_menus, site_settings, platform_roles from public, anon, authenticated;
grant select on site_pages, site_banners, site_menus, site_settings to anon, authenticated;
grant select on site_page_versions to authenticated;
