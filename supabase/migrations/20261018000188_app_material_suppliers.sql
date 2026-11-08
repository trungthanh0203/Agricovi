-- NHÀ CUNG CẤP THEO VẬT TƯ (giống): khi tạo/sửa vụ chọn giống từ danh mục vật tư (nhóm "Giống"), app tự liệt kê các nhà cung cấp của giống đó
-- thay vì để người dùng gõ tay. Nguồn: (1) các hóa đơn mua đã có dòng nhập kho của vật tư đó, (2) liên kết do người dùng chọn lần trước (bảng này).

create table material_suppliers (
  organization_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (material_id, partner_id)
);
create index material_suppliers_org_idx on material_suppliers (organization_id);
alter table material_suppliers enable row level security;   -- không có chính sách: chỉ qua hàm bên dưới
revoke all on material_suppliers from anon, authenticated;

-- Nhà cung cấp của một vật tư: đã bán cho cơ sở (theo hóa đơn chưa hủy, kèm số lần mua và ngày gần nhất) hoặc đã được liên kết. Cần xem mục Chi phí (như xem danh bạ nhà cung ứng).
create or replace function get_material_suppliers(p_org uuid, p_material uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'view') then
    raise exception 'FORBIDDEN: Cần quyền xem mục Chi phí để xem nhà cung ứng.';
  end if;
  if not exists (select 1 from materials where id = p_material and organization_id = p_org) then
    raise exception 'NOT_FOUND: Không tìm thấy vật tư.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('partner_id', x.id, 'name', x.name, 'phone', x.phone, 'purchases', x.n, 'last_date', x.last_date) order by x.n desc, x.last_date desc nulls last, x.name)
      from (
        select p.id, p.name, p.phone, coalesce(b.n, 0) as n, b.last_date
          from partners p
          left join (
            select pb.partner_id, count(distinct pb.id) as n, max(pb.bill_date) as last_date
              from inventory_transactions t
              join purchase_bills pb on pb.id = t.bill_id and pb.voided_at is null
             where t.organization_id = p_org and t.material_id = p_material and t.txn_type = 'receipt'
             group by pb.partner_id
          ) b on b.partner_id = p.id
         where p.organization_id = p_org and p.is_supplier and p.is_active
           and (b.partner_id is not null or exists (select 1 from material_suppliers ms where ms.material_id = p_material and ms.partner_id = p.id))
      ) x), '[]'::jsonb);
end $$;
revoke execute on function get_material_suppliers(uuid, uuid) from public, anon;
grant execute on function get_material_suppliers(uuid, uuid) to authenticated, service_role;

-- Ghi nhớ "vật tư này mua của nhà cung cấp kia" (khi người dùng chọn nhà cung cấp cho giống lúc tạo vụ); gọi lặp không sao
create or replace function link_material_supplier(p_org uuid, p_material uuid, p_partner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (has_perm(p_org, 'inventory', 'edit') and has_perm(p_org, 'expenses', 'view')) then
    raise exception 'FORBIDDEN: Cần quyền sửa mục Kho và xem mục Chi phí.';
  end if;
  if not exists (select 1 from materials where id = p_material and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy vật tư.'; end if;
  if not exists (select 1 from partners where id = p_partner and organization_id = p_org and is_supplier) then raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp.'; end if;
  insert into material_suppliers (organization_id, material_id, partner_id) values (p_org, p_material, p_partner) on conflict do nothing;
end $$;
revoke execute on function link_material_supplier(uuid, uuid, uuid) from public, anon;
grant execute on function link_material_supplier(uuid, uuid, uuid) to authenticated, service_role;
