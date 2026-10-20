-- D40 (P4): tên hiển thị của người dùng (sửa được ở Hồ sơ). Dùng cho tên người làm trong nhật ký/giao dịch mới.
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  updated_at timestamptz not null default now()
);
alter table user_profiles enable row level security;
create policy user_profiles_own_read on user_profiles for select to authenticated using (user_id = auth.uid());
-- ghi chỉ qua hàm set_display_name

create or replace function set_display_name(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Cần đăng nhập.'; end if;
  if length(n) < 2 or length(n) > 80 then raise exception 'INVALID_NAME: Tên hiển thị cần từ 2 đến 80 ký tự.'; end if;
  insert into user_profiles (user_id, display_name) values (auth.uid(), n)
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();
  return n;
end $$;
revoke execute on function set_display_name(text) from public, anon;
grant execute on function set_display_name(text) to authenticated, service_role;

-- Tên người làm ghi vào bản ghi mới: ưu tiên tên hiển thị người dùng tự đặt
create or replace function author_display_name(p_user uuid, p_org uuid, p_area_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.display_name from user_profiles p where p.user_id = p_user),
    (select w.full_name from worker_profiles w
      where w.user_id = p_user and w.organization_id in (p_org, p_area_org)
      order by (w.organization_id = p_org) desc limit 1),
    (select nullif(split_part(u.email, '@', 1), '') from auth.users u where u.id = p_user)
  );
$$;
