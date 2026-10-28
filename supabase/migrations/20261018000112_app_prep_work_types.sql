-- Hai việc có sẵn chuẩn bị nền cho vật nuôi và thủy sản (tương tự "tạo giá thể" của cây trồng). Biểu mẫu chuẩn nằm ở app (standardFields.ts, khóa theo mã).
insert into work_types (code, name, field_schema, applies_to) values
  ('bedding_prep',   'Chuẩn bị đệm lót chuồng', '[]', array['livestock']),
  ('pond_preparing', 'Cải tạo ao, bể',          '[]', array['aquatic'])
on conflict (code) where organization_id is null do nothing;
