-- Quản trị website TÁCH RIÊNG khỏi quản trị nền tảng (D63): bổ sung phần CSDL cho trang quản trị website mới.
-- (1) cài đặt 'home' (thứ tự và ẩn/hiện các khối trang chủ); (2) tổng quan website; (3) nhật ký thao tác website.

alter table site_settings drop constraint site_settings_key_check;
alter table site_settings add constraint site_settings_key_check check (key in ('brand', 'contact', 'social', 'legal', 'home'));

create or replace function site_save_setting(p_key text, p_value jsonb, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare cur site_settings;
begin
  perform site_guard(array['chief_editor']);
  if p_key not in ('brand', 'contact', 'social', 'legal', 'home') then raise exception 'INVALID: Mục cài đặt không hợp lệ.'; end if;
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

-- Tổng quan cho mọi người có vai trò quản trị/biên tập website
create or replace function site_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare adm boolean := is_platform_admin();
begin
  perform site_guard(array['chief_editor', 'editor', 'moderator']);
  return jsonb_build_object(
    'quotes_new', (select count(*) from quote_requests where status = 'new'),
    'articles', jsonb_build_object('draft', (select count(*) from site_articles where status = 'draft'), 'review', (select count(*) from site_articles where status = 'review'),
      'published', (select count(*) from site_articles where status = 'published' and (published_at is null or published_at <= now())),
      'scheduled', (select count(*) from site_articles where status = 'published' and published_at > now())),
    'materials', jsonb_build_object('draft', (select count(*) from site_materials where status = 'draft'), 'review', (select count(*) from site_materials where status = 'review'),
      'published', (select count(*) from site_materials where status = 'published')),
    'pages', jsonb_build_object('draft', (select count(*) from site_pages where status in ('draft', 'review')), 'published', (select count(*) from site_pages where status = 'published')),
    'banners_active', (select count(*) from site_banners where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
    'profiles_pending', case when adm then (select count(*) from business_profiles where status = 'pending_review') end,
    'profiles_public', (select count(*) from public_profiles where is_visible),
    'cycles_public', (select count(*) from public_cycles where is_visible),
    'products_public', (select count(*) from public_products where is_visible));
end $$;

-- Nhật ký thao tác website (chỉ các thao tác site_*), cho tổng biên tập/quản trị viên
create or replace function site_list_audit(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'actor', u.email, 'action', a.action, 'entity', a.entity, 'entity_id', a.entity_id) order by a.id desc)
                     from (select * from audit_events where action like 'site\_%' order by id desc limit greatest(1, least(coalesce(p_limit, 100), 500))) a
                     left join auth.users u on u.id = a.actor_id), '[]');
end $$;

revoke execute on function site_overview(), site_list_audit(integer) from public, anon;
grant execute on function site_overview(), site_list_audit(integer) to authenticated;
