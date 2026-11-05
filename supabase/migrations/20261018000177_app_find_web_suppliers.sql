-- Tìm nhà cung ứng trong app từ GIAN HÀNG VẬT TƯ đang hoạt động trên website (docs/PLAN_TIM_NHA_CUNG_UNG.md).
-- Quyết định của chủ sản phẩm (1/11/2026): giai đoạn này CHO PHÉP chép luôn điện thoại và địa chỉ gian hàng khi bấm "Thêm vào nhà cung ứng"
-- (cách B), vì app và website dùng chung CSDL. Chỉ người dùng app đã đăng nhập, là thành viên của cơ sở, gọi được.
-- Chỉ ĐỌC bảng của website (material_shops, site_materials); không đổi cấu trúc của chúng.

alter table partners add column web_shop_id uuid;  -- gian hàng website mà nhà cung ứng này được thêm từ đó (không ràng buộc khóa ngoại để không chặn website)
create unique index partners_web_shop_uq on partners (organization_id, web_shop_id) where web_shop_id is not null;

create or replace function app_find_suppliers(p_org uuid, p_q text default null, p_province text default null, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := fold_vi(trim(coalesce(p_q, ''))); prov text := replace(fold_vi(trim(coalesce(p_province, ''))), 'tp. ', '');
        lim integer := greatest(1, least(coalesce(p_limit, 20), 50)); total integer; rows jsonb;
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem nhà cung ứng.'; end if;
  select count(*) into total from material_shops s
   where s.status = 'active'
     and (prov = '' or fold_vi(s.province) like '%' || prov || '%')
     and (q = '' or fold_vi(s.name || ' ' || coalesce(s.description, '')) like '%' || q || '%'
          or exists (select 1 from site_materials m where m.shop_id = s.id and m.status = 'published' and m.search_text like '%' || q || '%'));
  select coalesce(jsonb_agg(r order by r ->> 'name'), '[]') into rows from (
    select jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'province', s.province, 'ward', s.district,
      'address', s.address, 'phone', s.phone, 'license_verified', s.license_verified,
      'material_count', (select count(*) from site_materials m where m.shop_id = s.id and m.status = 'published'),
      'materials', coalesce((select jsonb_agg(x.name) from (select m.name from site_materials m where m.shop_id = s.id and m.status = 'published' order by m.sort_order, m.name limit 6) x), '[]'),
      'added_partner_id', (select p.id from partners p where p.organization_id = p_org and p.web_shop_id = s.id)
    ) r
      from material_shops s
     where s.status = 'active'
       and (prov = '' or fold_vi(s.province) like '%' || prov || '%')
       and (q = '' or fold_vi(s.name || ' ' || coalesce(s.description, '')) like '%' || q || '%'
            or exists (select 1 from site_materials m where m.shop_id = s.id and m.status = 'published' and m.search_text like '%' || q || '%'))
     order by s.license_verified desc, s.name
     limit lim offset greatest(0, coalesce(p_offset, 0))
  ) x;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- Thêm gian hàng vào nhà cung ứng của cơ sở: sao tên, điện thoại, địa chỉ, tỉnh, xã, loại hàng; người dùng chỉ thêm ghi chú.
-- Gọi lặp trả lại nhà cung ứng đã có; trùng tên với nhà cung ứng cũ thì nối vào nhà cung ứng đó (chỉ điền chỗ còn trống).
create or replace function add_supplier_from_web(p_org uuid, p_shop uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s material_shops; cur partners; goods_txt text; pid uuid;
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền thêm nhà cung ứng.'; end if;
  select * into s from material_shops where id = p_shop and status = 'active';
  if s.id is null then raise exception 'NOT_FOUND: Gian hàng này không còn hoạt động trên website.'; end if;
  select * into cur from partners where organization_id = p_org and web_shop_id = p_shop;
  if cur.id is not null then return jsonb_build_object('id', cur.id, 'status', 'existing'); end if;
  select left(string_agg(x.name, ', '), 300) into goods_txt
    from (select m.name from site_materials m where m.shop_id = p_shop and m.status = 'published' order by m.sort_order, m.name limit 6) x;

  select * into cur from partners where organization_id = p_org and lower(trim(name)) = lower(trim(s.name));
  if cur.id is not null then
    update partners set web_shop_id = p_shop, is_supplier = true,
           phone = coalesce(phone, s.phone), address = coalesce(address, s.address), province = coalesce(province, s.province),
           ward = coalesce(ward, s.district), goods = coalesce(goods, goods_txt)
     where id = cur.id;
    return jsonb_build_object('id', cur.id, 'status', 'linked');
  end if;

  pid := gen_random_uuid();
  insert into partners (id, organization_id, name, phone, address, province, ward, goods, note, is_supplier, is_customer, web_shop_id)
    values (pid, p_org, s.name, s.phone, s.address, s.province, s.district, goods_txt, nullif(left(trim(coalesce(p_note, '')), 500), ''), true, false, p_shop);
  return jsonb_build_object('id', pid, 'status', 'created');
end $$;

revoke execute on function app_find_suppliers(uuid, text, text, integer, integer), add_supplier_from_web(uuid, uuid, text) from public, anon;
grant execute on function app_find_suppliers(uuid, text, text, integer, integer), add_supplier_from_web(uuid, uuid, text) to authenticated, service_role;
