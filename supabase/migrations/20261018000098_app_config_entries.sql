-- Cấu hình dạng "mục có mã" cho Nhóm loại sản phẩm và Nhóm vật tư: thêm/bớt/đổi tên/dừng mục mà chức năng không hỏng.
--  - Mục có sẵn (builtin) có mã cố định, không xóa được (chỉ dừng); chức năng chạy theo mã gốc (kind / material_group) như cũ.
--  - Mục tự thêm có mã riêng và "tính như" một nhóm gốc; bản ghi lưu nhóm gốc ở cột cũ + mã mục tự thêm ở cột mới (kind_item / group_item).
--  - Xóa mục tự thêm chỉ được khi chưa ai dùng.

alter table org_config alter column items set default '{}';
alter table org_config drop constraint org_config_items_check;
alter table org_config add constraint org_config_items_check check (cardinality(items) <= 30);
alter table org_config add column entries jsonb;

-- chuyển cấu hình đã lưu theo thứ tự cũ sang dạng mục có mã
update org_config c set entries = (
    select jsonb_agg(jsonb_build_object('code', t.code, 'label', u.label, 'base', t.code, 'active', true) order by t.o)
      from unnest(array['crop', 'livestock', 'aquatic', 'other']) with ordinality t(code, o)
      join unnest(c.items) with ordinality u(label, o2) on t.o = u.o2), items = '{}'
 where key = 'product_groups' and cardinality(items) = 4;
update org_config c set entries = (
    select jsonb_agg(jsonb_build_object('code', t.code, 'label', u.label, 'base', t.code, 'active', true) order by t.o)
      from unnest(array['feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other']) with ordinality t(code, o)
      join unnest(c.items) with ordinality u(label, o2) on t.o = u.o2), items = '{}'
 where key = 'material_groups' and cardinality(items) = 8;

alter table crop_types add column kind_item text check (kind_item is null or kind_item ~ '^[a-z0-9_]{1,30}$');
alter table production_areas add column kind_item text check (kind_item is null or kind_item ~ '^[a-z0-9_]{1,30}$');
alter table materials add column group_item text check (group_item is null or group_item ~ '^[a-z0-9_]{1,30}$');

create function set_org_entries(p_org uuid, p_key text, p_entries jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  builtin text[]; e jsonb; code text; lab text; bs text; act boolean;
  codes text[] := '{}'; labels text[] := '{}'; cleaned jsonb := '[]'::jsonb; n integer := 0; old jsonb; r text;
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  builtin := case p_key
    when 'product_groups' then array['crop', 'livestock', 'aquatic', 'other']
    when 'material_groups' then array['feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other']
    else null end;
  if builtin is null then raise exception 'INVALID_KEY: Cấu hình này không có dạng danh sách mục có mã.'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 40 then
    raise exception 'INVALID_ITEMS: Danh sách không hợp lệ (tối đa 40 mục).';
  end if;
  for e in select value from jsonb_array_elements(p_entries) loop
    code := e->>'code'; lab := trim(coalesce(e->>'label', '')); bs := e->>'base'; act := coalesce((e->>'active')::boolean, true);
    if code is null or code !~ '^[a-z0-9_]{1,30}$' then raise exception 'INVALID_ITEMS: Mã mục không hợp lệ.'; end if;
    if length(lab) < 1 or length(lab) > 40 then raise exception 'INVALID_ITEMS: Tên mỗi mục cần từ 1 đến 40 ký tự.'; end if;
    if code = any (codes) then raise exception 'INVALID_ITEMS: Có mục bị trùng mã.'; end if;
    if lower(lab) = any (labels) then raise exception 'INVALID_ITEMS: Tên mục "%" bị trùng.', lab; end if;
    if code = any (builtin) then bs := code;
    elsif bs is null or not (bs = any (builtin)) then raise exception 'INVALID_ITEMS: Mục "%" cần chọn "tính như" một nhóm có sẵn.', lab;
    end if;
    codes := codes || code; labels := labels || lower(lab);
    if act then n := n + 1; end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object('code', code, 'label', lab, 'base', bs, 'active', act));
  end loop;
  if not (builtin <@ codes) then raise exception 'INVALID_ITEMS: Mục có sẵn không xóa được, chỉ dừng.'; end if;
  if n = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục đang dùng.'; end if;

  -- mục tự thêm bị bỏ khỏi danh sách mà vẫn có dữ liệu dùng thì không cho xóa
  select entries into old from org_config where organization_id = p_org and key = p_key;
  if old is not null then
    for r in select x->>'code' from jsonb_array_elements(old) x loop
      if not (r = any (codes)) and not (r = any (builtin)) then
        if (p_key = 'product_groups' and (
              exists (select 1 from crop_types where organization_id = p_org and kind_item = r)
              or exists (select 1 from production_areas where organization_id = p_org and kind_item = r)))
           or (p_key = 'material_groups' and exists (select 1 from materials where organization_id = p_org and group_item = r)) then
          raise exception 'IN_USE: Mục "%" đang được dùng, hãy chọn Dừng thay vì xóa.', (select x->>'label' from jsonb_array_elements(old) x where x->>'code' = r);
        end if;
      end if;
    end loop;
  end if;

  insert into org_config (organization_id, key, items, entries) values (p_org, p_key, '{}', cleaned)
    on conflict (organization_id, key) do update set items = '{}', entries = excluded.entries, updated_at = now();
end $$;
revoke execute on function set_org_entries(uuid, text, jsonb) from public, anon;
grant execute on function set_org_entries(uuid, text, jsonb) to authenticated, service_role;

-- set_org_config chỉ còn cho danh sách tự do (kiểu nhà/chuồng); hai nhóm trên đi qua set_org_entries
create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('housing') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
