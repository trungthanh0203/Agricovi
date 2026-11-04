-- Quản trị tin tức khi đăng đều đặn hằng tuần (web): (1) phân trang tin cho website, (2) danh sách quản trị có lọc/phân trang, (3) duyệt hàng loạt,
-- (4) tự xếp mục con theo từ khóa cho tin tự động, (5) tự xóa bản nháp tự động quá 15 ngày chưa ai duyệt.

-- ---------------------------------------------------------------------------
-- 1. Website: một trang tin của chuyên mục (khách đọc được). p_mode: all | upcoming | past | schedule (hội chợ)
-- ---------------------------------------------------------------------------
create or replace function site_articles_page(p_channel text, p_section text default null, p_mode text default 'all', p_offset integer default 0, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; lim integer := least(greatest(coalesce(p_limit, 12), 1), 50);
        off integer := greatest(coalesce(p_offset, 0), 0); mode text := coalesce(p_mode, 'all'); res jsonb;
begin
  if p_channel not in ('nong_nghiep', 'xuat_khau', 'hoi_cho') then return jsonb_build_object('total', 0, 'items', '[]'::jsonb); end if;
  with f as (
    select id, channel, section, slug, title, summary, has_image, source_name, source_url, event_start, event_end, event_place, event_organizer, published_at
      from site_articles
     where status = 'published' and (published_at is null or published_at <= now()) and channel = p_channel
       and (nullif(p_section, '') is null or section = p_section)
       and case mode when 'upcoming' then (event_start is null or coalesce(event_end, event_start) >= today)
                     when 'past' then (event_start is not null and coalesce(event_end, event_start) < today)
                     else true end
  )
  select jsonb_build_object('total', (select count(*) from f),
           'items', coalesce((select jsonb_agg(to_jsonb(r)) from (
              select * from f
               order by case when mode in ('upcoming', 'schedule') then event_start end asc nulls last,
                        case when mode = 'past' then event_start end desc nulls last,
                        published_at desc nulls last, id
               offset off limit lim) r), '[]'::jsonb))
    into res;
  return res;
end $$;
revoke execute on function site_articles_page(text, text, text, integer, integer) from public;
grant execute on function site_articles_page(text, text, text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Quản trị: danh sách bài có lọc và phân trang, KHÔNG trả thân bài (nhẹ). p_pending = bản nháp/chờ duyệt có nguồn dẫn (tin tự động hoặc dẫn lại)
-- ---------------------------------------------------------------------------
create or replace function site_list_articles(p_pending boolean default false, p_channel text default null, p_section text default null, p_status text default null,
                                              p_q text default null, p_offset integer default 0, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fq text := replace(replace(fold_vi(trim(coalesce(p_q, ''))), '%', ''), '_', ''); lim integer := least(greatest(coalesce(p_limit, 30), 1), 100);
        off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  perform site_guard(array['chief_editor', 'editor']);
  with f as (
    select id, channel, section, slug, title, status, published_at, source_name, source_url, event_start, event_place, created_at, updated_at, updated_by, version
      from site_articles
     where (not coalesce(p_pending, false) or (status in ('draft', 'review') and source_url is not null))
       and (nullif(p_channel, '') is null or channel = p_channel)
       and (nullif(p_section, '') is null or section = p_section)
       and (nullif(p_status, '') is null or status = p_status)
       and (fq = '' or search_text like '%' || fq || '%')
  )
  select jsonb_build_object('total', (select count(*) from f),
           'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
              select * from f order by case when coalesce(p_pending, false) then created_at else updated_at end desc, id offset off limit lim) r), '[]'::jsonb))
    into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Duyệt hàng loạt (tổng biên tập và biên tập viên đều dùng được): publish | hide | delete | move
--    Chỉ đăng bài đang nháp/chờ duyệt/đã ẩn; chỉ xóa bài chưa đăng; chuyển mục chỉ đổi chuyên mục và mục con.
-- ---------------------------------------------------------------------------
create or replace function site_bulk_articles(p_ids uuid[], p_action text, p_channel text default null, p_section text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  if array_length(p_ids, 1) > 100 then raise exception 'INVALID: Mỗi lần chỉ xử lý tối đa 100 bài.'; end if;
  if p_action = 'publish' then
    update site_articles set status = 'published', published_at = coalesce(published_at, now()), version = version + 1, updated_by = auth.uid(), updated_at = now()
     where id = any (p_ids) and status in ('draft', 'review', 'hidden');
  elsif p_action = 'hide' then
    update site_articles set status = 'hidden', version = version + 1, updated_by = auth.uid(), updated_at = now()
     where id = any (p_ids) and status in ('published', 'review', 'draft');
  elsif p_action = 'delete' then
    delete from site_articles where id = any (p_ids) and status in ('draft', 'review', 'hidden');
  elsif p_action = 'move' then
    if p_channel not in ('nong_nghiep', 'xuat_khau', 'hoi_cho') then raise exception 'INVALID: Chuyên mục không hợp lệ.'; end if;
    update site_articles set channel = p_channel, section = case when p_channel = 'hoi_cho' then null else nullif(trim(coalesce(p_section, '')), '') end,
           event_start = case when p_channel = 'hoi_cho' then event_start end, event_end = case when p_channel = 'hoi_cho' then event_end end,
           event_place = case when p_channel = 'hoi_cho' then event_place end, event_organizer = case when p_channel = 'hoi_cho' then event_organizer end,
           version = version + 1, updated_by = auth.uid(), updated_at = now()
     where id = any (p_ids);
  else
    raise exception 'INVALID: Thao tác không hợp lệ.';
  end if;
  get diagnostics n = row_count;
  perform admin_audit(null, 'site_article_bulk_' || p_action, 'site_articles', null, null, jsonb_build_object('count', n), null);
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tin tự động: quy tắc xếp mục con theo từ khóa (mỗi nguồn tối đa 12 quy tắc, quy tắc khớp đầu tiên thắng; không khớp thì dùng mục con mặc định của nguồn)
-- ---------------------------------------------------------------------------
alter table site_news_sources add column if not exists rules jsonb not null default '[]'::jsonb;
alter table site_news_sources add constraint site_news_sources_rules_check check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 12);

drop function if exists site_save_news_source(uuid, text, text, text, text, text, boolean, integer);
create or replace function site_save_news_source(p_id uuid, p_name text, p_feed_url text, p_channel text, p_section text, p_keywords text, p_active boolean, p_max integer, p_rules jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; kw text[] := coalesce((select array_agg(k) from (select trim(x) k from unnest(string_to_array(coalesce(p_keywords, ''), ',')) x) t where k <> ''), '{}');
        rl jsonb; clean jsonb := '[]'::jsonb; sec text;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if trim(coalesce(p_feed_url, '')) !~ '^https://[^\s]+$' then raise exception 'INVALID: Địa chỉ nguồn tin phải bắt đầu bằng https://'; end if;
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then raise exception 'INVALID: Quy tắc xếp mục không hợp lệ.'; end if;
  for rl in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) loop
    sec := nullif(trim(coalesce(rl ->> 'section', '')), '');
    if sec is not null and sec !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID: Mục con trong quy tắc không hợp lệ.'; end if;
    if jsonb_typeof(rl -> 'keywords') = 'array' and exists (select 1 from jsonb_array_elements_text(rl -> 'keywords') k where trim(k) <> '') then
      clean := clean || jsonb_build_array(jsonb_build_object('section', sec, 'keywords',
                 (select jsonb_agg(left(trim(k), 60)) from jsonb_array_elements_text(rl -> 'keywords') k where trim(k) <> '')));
    end if;
  end loop;
  if p_id is null then
    insert into site_news_sources (name, feed_url, channel, section, keywords, is_active, max_items, rules, updated_by)
    values (trim(p_name), trim(p_feed_url), p_channel, nullif(trim(coalesce(p_section, '')), ''), kw, coalesce(p_active, true), coalesce(p_max, 10), clean, auth.uid()) returning id into r;
  else
    update site_news_sources set name = trim(p_name), feed_url = trim(p_feed_url), channel = p_channel, section = nullif(trim(coalesce(p_section, '')), ''),
           keywords = kw, is_active = coalesce(p_active, true), max_items = coalesce(p_max, 10), rules = clean, updated_by = auth.uid() where id = p_id returning id into r;
    if r is null then raise exception 'NOT_FOUND: Không tìm thấy nguồn tin.'; end if;
  end if;
  perform admin_audit(null, 'site_news_source_save', 'site_news_sources', r::text, null, jsonb_build_object('feed', p_feed_url), null);
  return r;
end $$;
revoke execute on function site_save_news_source(uuid, text, text, text, text, text, boolean, integer, jsonb) from public, anon;
grant execute on function site_save_news_source(uuid, text, text, text, text, text, boolean, integer, jsonb) to authenticated;

create or replace function news_ingest(p_source uuid, p_items jsonb, p_error text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare s site_news_sources; it jsonb; rl jsonb; n integer := 0; ttl text; lnk text; sl text; sec text; hay text;
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
      -- mục con: quy tắc từ khóa khớp đầu tiên, không có thì mục mặc định của nguồn (tin hội chợ không có mục con)
      sec := s.section;
      hay := fold_vi(coalesce(it ->> 'title', '') || ' ' || coalesce(it ->> 'summary', ''));
      for rl in select * from jsonb_array_elements(s.rules) loop
        if exists (select 1 from jsonb_array_elements_text(rl -> 'keywords') k
                    where replace(replace(fold_vi(trim(k)), '%', ''), '_', '') <> '' and hay like '%' || replace(replace(fold_vi(trim(k)), '%', ''), '_', '') || '%') then
          sec := nullif(rl ->> 'section', '');
          exit;
        end if;
      end loop;
      if s.channel = 'hoi_cho' then sec := null; end if;
      insert into site_articles (channel, section, slug, title, summary, body, source_name, source_url, status)
      values (s.channel, sec, sl, ttl, nullif(left(trim(coalesce(it ->> 'summary', '')), 400), ''), '', left(s.name, 120), lnk, 'draft')
      on conflict (slug) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end if;
  update site_news_sources set last_run_at = now(), last_count = n,
         last_status = case when p_error is not null then left('Lỗi: ' || p_error, 300) when n = 0 then 'Không có tin mới' else 'Đã lấy ' || n || ' tin vào bản nháp' end
   where id = p_source;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Tự xóa bản nháp tin tự động quá 15 ngày chưa ai đụng tới (updated_by rỗng = chưa ai mở/duyệt). Edge Function news-fetch gọi sau mỗi lần chạy.
-- ---------------------------------------------------------------------------
create or replace function news_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from site_articles where status = 'draft' and source_url is not null and updated_by is null and created_at < now() - interval '15 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function site_list_articles(boolean, text, text, text, text, integer, integer), site_bulk_articles(uuid[], text, text, text), news_cleanup() from public, anon;
revoke execute on function news_cleanup() from authenticated;
grant execute on function site_list_articles(boolean, text, text, text, text, integer, integer), site_bulk_articles(uuid[], text, text, text) to authenticated;
