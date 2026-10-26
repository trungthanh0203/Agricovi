-- Thêm cấu hình "Nhóm vật tư" (material_groups): đúng 8 mục theo thứ tự cố định, chỉ đổi tên gọi.
create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[]; need integer;
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('product_groups', 'housing', 'material_groups') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  need := case p_key when 'product_groups' then 4 when 'material_groups' then 8 else null end;
  if need is not null and cardinality(clean) <> need then
    raise exception 'INVALID_ITEMS: Cấu hình này cần đúng % mục (chỉ đổi tên gọi, giữ thứ tự mặc định).', need;
  end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
