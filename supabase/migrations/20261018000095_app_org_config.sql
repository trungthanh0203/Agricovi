-- Cấu hình của cơ sở (tab Cấu hình): danh sách các mục nhỏ do chủ/quản lý sửa, ví dụ Nhóm loại sản phẩm, Kiểu nhà/chuồng.
-- Mọi thành viên đọc được; chỉ ghi qua set_org_config. Chưa có dòng nào = dùng giá trị mặc định trong app.
create table org_config (
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{1,40}$'),
  items text[] not null check (cardinality(items) between 1 and 30),
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table org_config enable row level security;
create policy org_config_read on org_config for select to authenticated using (is_org_member(organization_id));
grant select on org_config to authenticated;

create function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('product_groups', 'housing') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  if p_key = 'product_groups' and cardinality(clean) <> 4 then
    raise exception 'INVALID_ITEMS: Nhóm loại sản phẩm cần đúng 4 mục (đổi tên, giữ thứ tự: cây trồng, vật nuôi, thủy sản, khác).';
  end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
revoke execute on function set_org_config(uuid, text, text[]) from public, anon;
grant execute on function set_org_config(uuid, text, text[]) to authenticated, service_role;

-- Kiểu nhà/chuồng của khu: lưu đúng chữ trong cấu hình (không còn 3 mã cố định)
alter table production_areas drop constraint production_areas_housing_check;
update production_areas set housing = case housing when 'closed' then 'Kín' when 'semi_open' then 'Nửa kín hở' when 'open' then 'Hở' else housing end;
alter table production_areas add constraint production_areas_housing_check check (housing is null or length(housing) between 1 and 40);

-- Loại khu dùng chung nhóm loại sản phẩm (thêm Thủy sản); Cơ sở vật chất vẫn là loại riêng của khu
alter table production_areas drop constraint production_areas_kind_check;
alter table production_areas add constraint production_areas_kind_check check (kind in ('crop', 'livestock', 'aquatic', 'facility', 'other'));
