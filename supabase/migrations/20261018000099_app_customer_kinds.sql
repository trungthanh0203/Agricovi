-- Loại khách hàng thành danh sách cấu hình tự do (Cấu hình → Loại khách). Loại khách chỉ để phân loại/hiển thị, không chức năng nào chạy theo nó,
-- nên lưu đúng chữ như kiểu nhà/chuồng: thêm, bớt, đổi tên thoải mái; khách cũ giữ nguyên chữ đã chọn.
alter table partners drop constraint partners_customer_kind_check;
update partners set customer_kind = case customer_kind
  when 'retail' then 'Bán lẻ' when 'trader' then 'Thương lái' when 'market' then 'Siêu thị / bếp ăn'
  when 'enterprise' then 'Doanh nghiệp' when 'coop' then 'HTX khác' when 'other' then 'Khác' else customer_kind end;
alter table partners add constraint partners_customer_kind_check check (customer_kind is null or length(customer_kind) between 1 and 40);

create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('housing', 'customer_kinds') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
