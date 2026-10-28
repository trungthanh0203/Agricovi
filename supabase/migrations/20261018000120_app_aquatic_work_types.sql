-- Ba việc có sẵn cho thủy sản (tôm, cá): Thả giống, Kiểm tra sàng ăn, Kiểm tra sức khỏe. Biểu mẫu chuẩn nằm ở app (standardFields.ts, khóa theo mã).
-- Phiếu đo môi trường nước dùng việc "Đo môi trường nước" đã có; ngưỡng cảnh báo và điền sẵn lần đo trước nằm trong biểu mẫu chuẩn.
insert into work_types (code, name, field_schema, applies_to) values
  ('stocking',          'Thả giống',                       '[]', array['aquatic']),
  ('feed_tray_checking','Kiểm tra sàng ăn',                '[]', array['aquatic']),
  ('health_checking',   'Kiểm tra sức khỏe thủy sản',      '[]', array['aquatic'])
on conflict (code) where organization_id is null do nothing;
