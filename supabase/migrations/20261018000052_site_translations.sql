-- W8 (D71): BẢN DỊCH TIẾNG ANH của nội dung do quản trị soạn (trang tĩnh, bài viết, cụm từ chung như menu/banner/tên danh mục/cài đặt).
-- Tiếng Việt vẫn là bản gốc và là bản duy nhất cần để đăng; chưa có bản dịch thì website hiện tiếng Việt.
--  kind 'glossary': ref = câu tiếng Việt, fields {en}     → dùng cho mọi chữ xuất hiện nguyên câu (menu, banner, tên danh mục, khẩu hiệu…)
--  kind 'page'    : ref = địa chỉ trang, fields {title, description, body}
--  kind 'article' : ref = địa chỉ bài viết, fields {title, summary, body}
create table site_translations (
  kind text not null check (kind in ('glossary', 'page', 'article')),
  ref text not null check (length(ref) between 1 and 300),
  lang text not null default 'en' check (lang = 'en'),
  fields jsonb not null check (jsonb_typeof(fields) = 'object' and length(fields::text) <= 70000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (kind, ref, lang)
);
alter table site_translations enable row level security;
create policy site_translations_read on site_translations for select to anon, authenticated using (true);   -- nội dung công khai của website
grant select on site_translations to anon, authenticated;

-- Lưu (hoặc xóa nếu mọi trường để trống) một bản dịch. Chỉ tổng biên tập và biên tập viên.
create or replace function site_save_translation(p_kind text, p_ref text, p_fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text; clean jsonb := '{}'::jsonb; lim integer;
begin
  perform site_guard(array['chief_editor', 'editor']);
  if p_kind not in ('glossary', 'page', 'article') then raise exception 'INVALID: Loại bản dịch không hợp lệ.'; end if;
  if length(trim(coalesce(p_ref, ''))) = 0 or length(p_ref) > 300 then raise exception 'INVALID: Hãy nhập nội dung gốc.'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'INVALID: Bản dịch không hợp lệ.'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_fields) loop
    if not (k = any (case p_kind when 'glossary' then array['en'] when 'page' then array['title', 'description', 'body'] else array['title', 'summary', 'body'] end)) then
      raise exception 'INVALID: Trường % không hợp lệ.', k;
    end if;
    lim := case when k = 'body' then 60000 when k in ('title') then 200 when k in ('description', 'summary') then 400 else 600 end;
    if length(coalesce(v, '')) > lim then raise exception 'INVALID: Nội dung "%" quá dài (tối đa % ký tự).', k, lim; end if;
    if nullif(trim(coalesce(v, '')), '') is not null then clean := clean || jsonb_build_object(k, trim(v)); end if;
  end loop;
  if clean = '{}'::jsonb then
    delete from site_translations where kind = p_kind and ref = p_ref and lang = 'en';
  else
    insert into site_translations (kind, ref, lang, fields, updated_by) values (p_kind, trim(p_ref), 'en', clean, auth.uid())
    on conflict (kind, ref, lang) do update set fields = excluded.fields, updated_by = auth.uid(), updated_at = now();
  end if;
end $$;

revoke all on site_translations from public, anon, authenticated;
grant select on site_translations to anon, authenticated;
revoke execute on function site_save_translation(text, text, jsonb) from public, anon;
grant execute on function site_save_translation(text, text, jsonb) to authenticated;
