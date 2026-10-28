-- Mỗi việc dùng chung chỉ áp dụng cho MỘT đối tượng sản xuất: tách các việc dùng chung nhiều đối tượng (vật nuôi + thủy sản) và việc dùng cho tất cả
-- (Thu hoạch, Việc khác) thành các việc riêng, đổi tên cho dễ phân biệt. Mã cũ giữ cho đối tượng đầu tiên (nhật ký, quy trình, bản chỉnh đang dùng không đổi);
-- đối tượng còn lại được mã mới có hậu tố _aq (thủy sản) hoặc _lv (vật nuôi). Tăng trọng/FCR nhận việc "Cân mẫu ..." theo tên nên không đổi.

update work_types set name = 'Cho vật nuôi ăn',              applies_to = array['livestock'] where organization_id is null and code = 'feeding';
update work_types set name = 'Phối trộn thức ăn chăn nuôi',  applies_to = array['livestock'] where organization_id is null and code = 'feed_mixing';
update work_types set name = 'Điều trị bệnh vật nuôi',       applies_to = array['livestock'] where organization_id is null and code = 'treating';
update work_types set name = 'Cân mẫu vật nuôi',             applies_to = array['livestock'] where organization_id is null and code = 'weighing';
update work_types set name = 'Sát trùng chuồng trại',        applies_to = array['livestock'] where organization_id is null and code = 'disinfecting';
update work_types set name = 'Thu hoạch cây trồng',          applies_to = array['crop']      where organization_id is null and code = 'harvesting';
update work_types set name = 'Việc khác (cây trồng)',        applies_to = array['crop']      where organization_id is null and code = 'other';

insert into work_types (code, name, field_schema, applies_to) values
  ('feeding_aq',     'Cho thủy sản ăn',              '[]', array['aquatic']),
  ('feed_mixing_aq', 'Phối trộn thức ăn thủy sản',   '[]', array['aquatic']),
  ('treating_aq',    'Điều trị bệnh thủy sản',       '[]', array['aquatic']),
  ('weighing_aq',    'Cân mẫu thủy sản',             '[]', array['aquatic']),
  ('disinfecting_aq','Sát trùng ao, bể',             '[]', array['aquatic']),
  ('harvesting_lv',  'Xuất chuồng (thu hoạch vật nuôi)', '[]', array['livestock']),
  ('harvesting_aq',  'Thu hoạch thủy sản',           '[]', array['aquatic']),
  ('other_lv',       'Việc khác (vật nuôi)',         '[]', array['livestock']),
  ('other_aq',       'Việc khác (thủy sản)',         '[]', array['aquatic'])
on conflict (code) where organization_id is null do nothing;

-- Bản chỉnh của cơ sở trên việc cũ được chép sang việc mới của đối tượng chuyển đi (không chép tên/mô tả để hai việc khác tên)
create temp table _split (old_code text, new_code text, kind text) on commit drop;
insert into _split values
  ('feeding', 'feeding_aq', 'aquatic'), ('feed_mixing', 'feed_mixing_aq', 'aquatic'), ('treating', 'treating_aq', 'aquatic'),
  ('weighing', 'weighing_aq', 'aquatic'), ('disinfecting', 'disinfecting_aq', 'aquatic'),
  ('harvesting', 'harvesting_lv', 'livestock'), ('harvesting', 'harvesting_aq', 'aquatic'),
  ('other', 'other_lv', 'livestock'), ('other', 'other_aq', 'aquatic');

-- 1) bản chỉnh "mọi loại": chép biểu mẫu, trạng thái dùng/dừng, vật tư
insert into org_catalog_overrides (organization_id, item_kind, item_id, kind, field_schema, is_active, material_ids)
select o.organization_id, 'work_type', n.id, '', o.field_schema, o.is_active, o.material_ids
  from _split s
  join work_types old on old.organization_id is null and old.code = s.old_code
  join work_types n on n.organization_id is null and n.code = s.new_code
  join org_catalog_overrides o on o.item_kind = 'work_type' and o.item_id = old.id and o.kind = ''
on conflict (organization_id, item_kind, item_id, kind) do nothing;

-- 2) bản chỉnh riêng cho đúng đối tượng chuyển đi: thành biểu mẫu của việc mới
insert into org_catalog_overrides (organization_id, item_kind, item_id, kind, field_schema, is_active)
select o.organization_id, 'work_type', n.id, '', o.field_schema, o.is_active
  from _split s
  join work_types old on old.organization_id is null and old.code = s.old_code
  join work_types n on n.organization_id is null and n.code = s.new_code
  join org_catalog_overrides o on o.item_kind = 'work_type' and o.item_id = old.id and o.kind = s.kind and o.field_schema is not null
on conflict (organization_id, item_kind, item_id, kind) do update set field_schema = excluded.field_schema;
