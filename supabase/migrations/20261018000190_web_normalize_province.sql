-- Tỉnh/thành ở tin giao thương và địa chỉ nhận hàng nay chọn từ danh sách 34 tỉnh/thành (packages/shared/src/provinces.ts).
-- Dữ liệu gõ tay trước đó được đưa về tên chuẩn khi KHỚP CHẮC CHẮN (bỏ dấu, bỏ "TP."/"Thành phố"/"Tỉnh" ở đầu, vài cách gọi quen thuộc của TP. Hồ Chí Minh).
-- Tên không khớp (ví dụ tỉnh đã sáp nhập như "Long An") được GIỮ NGUYÊN để chủ sản phẩm xem bằng web_list_unmatched_provinces(); không tự đoán.

create or replace function web_canon_province(t text) returns text
language sql immutable set search_path = public as $$
  with norm as (
    select regexp_replace(regexp_replace(fold_vi(trim(coalesce(t, ''))), '[.,]', ' ', 'g'), '^(tp|thanh pho|tinh)\s+', '') as k
  ), std(name) as (
    select unnest(array['Hà Nội', 'TP. Hồ Chí Minh', 'Hải Phòng', 'Đà Nẵng', 'Cần Thơ', 'Huế',
      'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Tĩnh',
      'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lạng Sơn', 'Lào Cai', 'Lâm Đồng', 'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi',
      'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'Tuyên Quang', 'Vĩnh Long'])
  )
  select coalesce(
    (select s.name from std s, norm n where regexp_replace(regexp_replace(fold_vi(s.name), '[.,]', ' ', 'g'), '^(tp|thanh pho|tinh)\s+', '') = n.k limit 1),
    (select 'TP. Hồ Chí Minh' from norm n where n.k in ('hcm', 'tphcm', 'tp hcm', 'sai gon', 'sg', 'hochiminh')),
    (select 'Hà Nội' from norm n where n.k in ('hn', 'hanoi')),
    (select 'Đà Nẵng' from norm n where n.k = 'danang'),
    (select 'Cần Thơ' from norm n where n.k = 'cantho'),
    (select 'Hải Phòng' from norm n where n.k = 'haiphong')
  );
$$;

-- Chuẩn hóa dữ liệu hiện có (chỉ những hàng khớp và đang khác tên chuẩn)
update trade_posts set province = web_canon_province(province)
 where web_canon_province(province) is not null and province is distinct from web_canon_province(province);
update buyer_addresses set province = web_canon_province(province)
 where web_canon_province(province) is not null and province is distinct from web_canon_province(province);

-- Cho chủ sản phẩm / quản trị nền tảng xem các tên chưa khớp (để tự quyết định, ví dụ tỉnh đã sáp nhập)
create or replace function web_list_unmatched_provinces() returns table (source text, province text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where user_id = auth.uid()) then raise exception 'FORBIDDEN: Chỉ quản trị nền tảng được xem.'; end if;
  return query
    select 'tin giao thương'::text, t.province, count(*) from trade_posts t where web_canon_province(t.province) is null group by t.province
    union all
    select 'địa chỉ nhận hàng'::text, a.province, count(*) from buyer_addresses a where web_canon_province(a.province) is null group by a.province
    order by 1, 3 desc;
end $$;

revoke execute on function web_canon_province(text), web_list_unmatched_provinces() from public, anon;
grant execute on function web_list_unmatched_provinces() to authenticated;
