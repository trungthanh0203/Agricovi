-- Giai đoạn việc chuẩn cho cây trồng (ươm giống, ra vườn, dặm, treo dây). Biểu mẫu nằm ở app (standardFields.ts, khóa theo mã), nên field_schema để trống.
-- Thay cho "bộ mẫu theo loại hình" (dưa lưới) đã bỏ khỏi màn Giai đoạn việc.
insert into work_types (code, name, field_schema, applies_to) values
  ('seed_soaking',  'Ngâm ủ hạt giống',        '[]', array['crop']),
  ('tray_sowing',   'Gieo hạt vào khay',       '[]', array['crop']),
  ('transplanting', 'Ra vườn / trồng cây con', '[]', array['crop']),
  ('replanting',    'Dặm cây',                 '[]', array['crop']),
  ('trellising',    'Treo dây / lên giàn',     '[]', array['crop'])
on conflict (code) where organization_id is null do nothing;
