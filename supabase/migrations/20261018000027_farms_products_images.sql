-- D37: đổi tên cho cả trồng trọt lẫn chăn nuôi: "Khu trồng" -> "Trang trại" (thêm vị trí, diện tích, hình ảnh),
-- "Cây trồng" -> "Sản phẩm" (thêm loại cây trồng/vật nuôi/khác, hình ảnh). Vật tư có hình ảnh.
-- Hình ảnh lưu dạng ảnh nhỏ đã nén ngay trong cột (data URL, tối đa ~300 KB) để khỏi cấu hình kho lưu trữ riêng ở bản thử.
-- Kho: danh sách tồn có "ngày nhập cuối" và thông tin lần điều chỉnh gần nhất; không cho nhập kho sau ngày hôm nay.

alter table materials add column image text check (image is null or length(image) <= 400000);
alter table production_areas
  add column location text check (location is null or length(location) <= 200),
  add column area_size numeric check (area_size is null or area_size >= 0),
  add column area_unit text not null default 'm2' check (area_unit in ('m2', 'ha')),
  add column image text check (image is null or length(image) <= 400000);
alter table crop_types
  add column kind text not null default 'crop' check (kind in ('crop', 'livestock', 'other')),
  add column image text check (image is null or length(image) <= 400000);
alter table org_catalog_overrides add column image text check (image is null or length(image) <= 400000);

-- Tồn kho: thêm ngày nhập cuối và lần điều chỉnh gần nhất (cột mới thêm vào cuối view)
create or replace view inventory_balances with (security_invoker = true) as
select t.organization_id, t.location_id, t.material_id, m.name as material_name,
       sum(t.quantity_delta) as balance,
       sum(t.quantity_delta) < 0 as is_negative,
       count(*) filter (where t.unit_cost is null and t.txn_type = 'receipt') as receipts_missing_cost,
       max(t.txn_date) filter (where t.txn_type = 'receipt') as last_receipt_date,
       max(t.txn_date) filter (where t.txn_type = 'adjustment') as last_adjust_date,
       (array_agg(t.quantity_delta order by t.txn_date desc, t.created_at desc) filter (where t.txn_type = 'adjustment'))[1] as last_adjust_delta,
       (array_agg(t.reason order by t.txn_date desc, t.created_at desc) filter (where t.txn_type = 'adjustment'))[1] as last_adjust_reason
from inventory_transactions t join materials m on m.id = t.material_id
where has_perm(t.organization_id, 'inventory', 'view')
group by t.organization_id, t.location_id, t.material_id, m.name;

-- Nhập kho không được ghi ngày sau hôm nay (giờ Việt Nam)
create or replace function inventory_receipt_date_guard() returns trigger language plpgsql as $$
begin
  if new.txn_type = 'receipt' and new.txn_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'INVALID_DATE: Ngày nhập kho không được sau ngày hôm nay.';
  end if;
  return new;
end $$;
create trigger inventory_receipt_date before insert on inventory_transactions
  for each row execute function inventory_receipt_date_guard();
