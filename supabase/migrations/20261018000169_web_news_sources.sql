-- Tin tức tự động (web): lấy tiêu đề + tóm tắt + đường dẫn nguồn từ nguồn cấp RSS về làm BẢN NHÁP trong site_articles; biên tập viên duyệt rồi mới đăng.
-- Chỉ lưu tiêu đề, đoạn tóm tắt ngắn và liên kết về nguồn (không sao chép nguyên bài) để tôn trọng bản quyền.
create table site_news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  feed_url text not null check (feed_url ~ '^https://[^\s]+$' and length(feed_url) <= 500),
  channel text not null check (channel in ('nong_nghiep', 'xuat_khau', 'hoi_cho')),
  section text check (section is null or section ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  keywords text[] not null default '{}',                       -- có từ khóa thì chỉ lấy bài chứa ít nhất một từ khóa (không phân biệt dấu/hoa thường)
  is_active boolean not null default true,
  max_items integer not null default 10 check (max_items between 1 and 30),
  last_run_at timestamptz,
  last_status text,
  last_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table site_news_sources enable row level security;
revoke all on site_news_sources from public, anon, authenticated;

create or replace function site_list_news_sources() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor', 'editor']);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from site_news_sources s), '[]'::jsonb);
end $$;

create or replace function site_save_news_source(p_id uuid, p_name text, p_feed_url text, p_channel text, p_section text, p_keywords text, p_active boolean, p_max integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; kw text[] := coalesce((select array_agg(k) from (select trim(x) k from unnest(string_to_array(coalesce(p_keywords, ''), ',')) x) t where k <> ''), '{}');
begin
  perform site_guard(array['chief_editor', 'editor']);
  if trim(coalesce(p_feed_url, '')) !~ '^https://[^\s]+$' then raise exception 'INVALID: Địa chỉ nguồn tin phải bắt đầu bằng https://'; end if;
  if p_id is null then
    insert into site_news_sources (name, feed_url, channel, section, keywords, is_active, max_items, updated_by)
    values (trim(p_name), trim(p_feed_url), p_channel, nullif(trim(coalesce(p_section, '')), ''), kw, coalesce(p_active, true), coalesce(p_max, 10), auth.uid()) returning id into r;
  else
    update site_news_sources set name = trim(p_name), feed_url = trim(p_feed_url), channel = p_channel, section = nullif(trim(coalesce(p_section, '')), ''),
           keywords = kw, is_active = coalesce(p_active, true), max_items = coalesce(p_max, 10), updated_by = auth.uid() where id = p_id returning id into r;
    if r is null then raise exception 'NOT_FOUND: Không tìm thấy nguồn tin.'; end if;
  end if;
  perform admin_audit(null, 'site_news_source_save', 'site_news_sources', r::text, null, jsonb_build_object('feed', p_feed_url), null);
  return r;
end $$;

create or replace function site_delete_news_source(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform site_guard(array['chief_editor']);
  delete from site_news_sources where id = p_id;
  perform admin_audit(null, 'site_news_source_delete', 'site_news_sources', p_id::text, null, null, null);
end $$;

-- Chỉ Edge Function news-fetch (khóa service_role) gọi: nhận các tin đã đọc từ nguồn, bỏ tin trùng đường dẫn, tạo bản nháp. Trả về số bài mới.
create or replace function news_ingest(p_source uuid, p_items jsonb, p_error text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare s site_news_sources; it jsonb; n integer := 0; ttl text; lnk text; sl text;
begin
  select * into s from site_news_sources where id = p_source;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy nguồn tin.'; end if;
  if p_error is null and jsonb_typeof(p_items) = 'array' then
    for it in select * from jsonb_array_elements(p_items) loop
      ttl := left(trim(coalesce(it ->> 'title', '')), 200);
      lnk := trim(coalesce(it ->> 'link', ''));
      continue when ttl = '' or lnk !~ '^https://[^\s]+$' or length(lnk) > 600;
      continue when exists (select 1 from site_articles where source_url = lnk);
      sl := trim(both '-' from left(regexp_replace(fold_vi(ttl), '[^a-z0-9]+', '-', 'g'), 80));
      if sl = '' then sl := 'tin'; end if;
      sl := sl || '-' || substr(md5(lnk), 1, 6);
      insert into site_articles (channel, section, slug, title, summary, body, source_name, source_url, status)
      values (s.channel, s.section, sl, ttl, nullif(left(trim(coalesce(it ->> 'summary', '')), 400), ''), '', left(s.name, 120), lnk, 'draft')
      on conflict (slug) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end if;
  update site_news_sources set last_run_at = now(), last_count = n,
         last_status = case when p_error is not null then left('Lỗi: ' || p_error, 300) when n = 0 then 'Không có tin mới' else 'Đã lấy ' || n || ' tin vào bản nháp' end
   where id = p_source;
  return n;
end $$;

revoke execute on function site_list_news_sources(), site_save_news_source(uuid, text, text, text, text, text, boolean, integer), site_delete_news_source(uuid), news_ingest(uuid, jsonb, text) from public, anon;
revoke execute on function news_ingest(uuid, jsonb, text) from authenticated;
grant execute on function site_list_news_sources(), site_save_news_source(uuid, text, text, text, text, text, boolean, integer), site_delete_news_source(uuid) to authenticated;
