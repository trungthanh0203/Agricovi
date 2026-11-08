-- Thêm 3 danh sách cấu hình theo cơ sở để các ô trước đây gõ tay thành chọn từ danh sách (D159, nhóm B):
--   license_types = loại giấy phép / chứng chỉ, harvest_grades = phân loại khi thu hoạch, count_units = đơn vị đếm của vụ (cây, con, quả…).
-- Giữ đúng luật cũ của set_org_config (chỉ chủ hoặc quản lý; mục sạch, không trùng, tối đa 40 ký tự; use_phases chỉ yes/no), chỉ mở rộng danh sách khóa hợp lệ.

create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('housing', 'customer_kinds', 'use_phases', 'license_types', 'harvest_grades', 'count_units') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  if p_key = 'use_phases' and clean not in (array['yes'], array['no']) then raise exception 'INVALID_ITEMS: Chỉ nhận yes hoặc no.'; end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
revoke execute on function set_org_config(uuid, text, text[]) from public, anon;
grant execute on function set_org_config(uuid, text, text[]) to authenticated, service_role;
