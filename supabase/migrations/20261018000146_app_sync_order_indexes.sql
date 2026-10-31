-- Đợt 0 hiệu năng (D136): số đo trên cơ sở thử tải (20.000 nhật ký) cho thấy đồng bộ nhật ký bị lỗi quá thời gian. Truy vấn của app lấy 200 dòng mới nhất toàn bộ
-- cơ sở của người dùng (order by performed_at desc limit 200) mà không có chỉ mục theo cột sắp xếp, nên máy chủ phải kiểm tra quyền (hàm theo từng dòng) cho
-- MỌI dòng rồi mới sắp xếp. Có chỉ mục theo cột sắp xếp thì chỉ duyệt từ mới nhất và dừng khi đủ 200 dòng.
create index if not exists activity_logs_performed_idx on activity_logs (performed_at desc);
create index if not exists harvest_records_harvested_idx on harvest_records (harvested_at desc);
create index if not exists expense_records_date_idx on expense_records (expense_date desc);
create index if not exists sales_records_sold_idx on sales_records (sold_date desc);
create index if not exists cycle_notes_note_date_idx on cycle_notes (note_date desc);
