-- Mẫu quy trình hệ thống: TÔM THẺ CHÂN TRẮNG nuôi AO LÓT BẠT (bản tham khảo). Chuẩn bị ao khoảng 15 ngày, thả giống, nuôi 3 giai đoạn (mỗi giai đoạn khoảng 30 ngày), thu hoạch; tổng khoảng 115 ngày.
-- Việc ở công đoạn chuẩn bị nối tiếp; từ đó các việc chạy song song và lặp lại (cho ăn, đo môi trường nước hằng ngày, kiểm tra sàng ăn, cân mẫu 10 ngày...).
-- Số ngày, chu kỳ và việc là bản nháp theo thông tin kỹ thuật chung, cần đối chiếu với trại và kỹ sư thủy sản. Liều thuốc, chế phẩm, tỉ lệ thay nước KHÔNG cài cứng.
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'shrimp_lined_pond') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('shrimp_lined_pond', 'aquatic', null, 'Tôm thẻ chân trắng, ao lót bạt (bản tham khảo)',
            'Quy trình nuôi tôm thẻ chân trắng trong ao lót bạt, 6 công đoạn, khoảng 115 ngày (chuẩn bị ao 15 ngày, nuôi khoảng 100 ngày). Các việc chăm sóc và đo môi trường nước chạy song song, lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu với kỹ thuật của trại rồi chỉnh lại.',
            'Tham khảo thông tin kỹ thuật nuôi tôm thẻ chân trắng; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Cải tạo và chuẩn bị ao', 'Vệ sinh bạt, sát trùng, lấy nước, xử lý nước và gây màu nước trước khi thả giống'),
    (t, 2, '2', 'Thả giống', 'Kiểm tra giống, thuần giống và thả; theo dõi sát môi trường những ngày đầu'),
    (t, 3, '3', 'Nuôi giai đoạn 1', 'Khoảng 30 ngày đầu sau thả: cho ăn, đo môi trường nước, kiểm tra sức khỏe'),
    (t, 4, '4', 'Nuôi giai đoạn 2', 'Ngày 31–60 sau thả: tăng cường kiểm tra sàng ăn, thay nước, cân mẫu'),
    (t, 5, '5', 'Nuôi giai đoạn 3', 'Ngày 61–90 sau thả: duy trì môi trường, theo dõi bệnh, chuẩn bị thu'),
    (t, 6, '6', 'Thu hoạch', 'Cân mẫu, kiểm tra ngưng thuốc/hóa chất, thu tỉa hoặc thu toàn bộ, vệ sinh ao');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Cải tạo và chuẩn bị ao (nối tiếp: ngày 1–15)
      (1,  1, 'pond_cleaning',    3, null::int, null::int, 'high',   'Rửa sạch bạt, đáy ao, hệ thống cấp thoát nước, quạt, sàng ăn.', 'Dọn sạch bùn, rửa bạt, kiểm tra bạt có rách không, vá chỗ hở.', '[]'),
      (2,  1, 'disinfecting_aq',  2, null, null, 'high',   'Sát trùng ao và dụng cụ trước khi lấy nước.', 'Dùng chất sát trùng đúng liều ghi trên nhãn; phơi khô theo hướng dẫn.', '[{"name":"Chất sát trùng ao"}]'),
      (3,  1, 'pond_preparing',   3, null, null, 'high',   'Lấy nước qua túi lọc vào ao.', 'Lấy nước qua lưới lọc nhiều lớp; đo mực nước.', '[]'),
      (4,  1, 'water_treating',   3, null, null, 'high',   'Xử lý nước, diệt khuẩn và mầm bệnh.', 'Ghi chế phẩm hoặc hóa chất đã dùng và liều; chờ hết thời gian ngưng theo nhãn.', '[{"name":"Chất xử lý nước, diệt khuẩn"}]'),
      (5,  1, 'water_treating',   3, null, null, 'normal', 'Gây màu nước, ổn định pH, độ kiềm.', 'Bổ sung khoáng, chế phẩm vi sinh; chạy quạt đều.', '[{"name":"Chế phẩm vi sinh, khoáng"}]'),
      (6,  1, 'water_measuring',  1, null, null, 'high',   'Kiểm tra các chỉ số nước đạt trước khi thả giống.', 'Ghi pH, nhiệt độ, oxy, độ mặn, độ trong.', '[]'),
      -- 2. Thả giống (ngày 16–18)
      (7,  2, 'stocking',         1, 16, null, 'high',   'Kiểm tra giống sạch bệnh và thuần giống trước khi thả.', 'Thả buổi sáng sớm hoặc chiều mát; ghi số lượng, nơi mua, kết quả kiểm dịch, mật độ.', '[{"name":"Tôm giống"}]'),
      (8,  2, 'water_measuring',  3, 16, 1,    'high',   'Đo sát môi trường những ngày đầu sau thả.', 'Đo sáng và chiều; ghi pH, nhiệt độ, oxy, độ mặn.', '[]'),
      (9,  2, 'health_checking',  3, 16, 1,    'high',   'Quan sát tôm sau thả: bơi, bám, ăn.', 'Kiểm tra tôm chết, hoạt động; ghi dấu hiệu bất thường.', '[]'),
      -- 3. Nuôi giai đoạn 1 (ngày 19–45)
      (10, 3, 'feeding_aq',      27, 19, 1,    'high',   'Ghi tổng lượng cho ăn mỗi ngày (kg), chia nhiều cữ.', 'Cho ăn theo bảng cỡ tôm và lượng ăn thực tế; giảm khi trời xấu hoặc oxy thấp.', '[{"name":"Thức ăn công nghiệp theo cỡ tôm"}]'),
      (11, 3, 'water_measuring', 27, 19, 1,    'high',   'Đo hằng ngày, sáng và chiều.', 'Nhập nhanh: số đo lần trước điền sẵn, chỉ sửa chỉ số thay đổi; chú ý cảnh báo vàng.', '[]'),
      (12, 3, 'health_checking', 27, 19, 2,    'normal', 'Kiểm tra sức khỏe tôm 2 ngày một lần.', null, '[]'),
      (13, 3, 'feed_tray_checking', 15, 31, 1, 'normal', 'Kiểm tra sàng ăn sau mỗi cữ để chỉnh lượng cho ăn.', 'Xem lượng thức ăn còn trên sàng; còn nhiều thì giảm, hết sạch thì tăng.', '[]'),
      (14, 3, 'water_treating',  27, 19, 7,    'normal', 'Bổ sung chế phẩm vi sinh, khoáng theo chu kỳ.', null, '[{"name":"Chế phẩm vi sinh, khoáng"}]'),
      (15, 3, 'weighing_aq',     27, 19, 10,   'normal', 'Cân mẫu mỗi 10 ngày để tính tăng trọng và FCR.', 'Chài hoặc bắt mẫu ngẫu nhiên; ghi số con và khối lượng trung bình.', '[]'),
      -- 4. Nuôi giai đoạn 2 (ngày 46–75)
      (16, 4, 'feeding_aq',      30, 46, 1,    'high',   'Ghi tổng lượng cho ăn mỗi ngày (kg).', null, '[{"name":"Thức ăn công nghiệp theo cỡ tôm"}]'),
      (17, 4, 'feed_tray_checking', 30, 46, 1, 'normal', 'Kiểm tra sàng ăn sau mỗi cữ.', null, '[]'),
      (18, 4, 'water_measuring', 30, 46, 1,    'high',   'Đo hằng ngày, sáng và chiều.', null, '[]'),
      (19, 4, 'health_checking', 30, 46, 2,    'normal', 'Kiểm tra sức khỏe tôm 2 ngày một lần.', null, '[]'),
      (20, 4, 'water_changing',  30, 46, 5,    'normal', 'Thay nước hoặc siphon đáy theo độ trong, độ mặn và chất lượng nước.', 'Ghi tỉ lệ nước thay; giữ độ mặn ổn định.', '[]'),
      (21, 4, 'water_treating',  30, 46, 7,    'normal', 'Xử lý nước, bổ sung chế phẩm theo chu kỳ.', null, '[{"name":"Chế phẩm vi sinh, khoáng"}]'),
      (22, 4, 'weighing_aq',     30, 46, 10,   'normal', 'Cân mẫu mỗi 10 ngày.', null, '[]'),
      (23, 4, 'treating_aq',     30, 46, null, 'low',    'Khi tôm có dấu hiệu bệnh; thuốc, hóa chất phải ngưng đủ ngày trước khi thu hoạch.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc, chế phẩm trị bệnh"}]'),
      -- 5. Nuôi giai đoạn 3 (ngày 76–105)
      (24, 5, 'feeding_aq',      30, 76, 1,    'high',   'Ghi tổng lượng cho ăn mỗi ngày (kg).', null, '[{"name":"Thức ăn công nghiệp theo cỡ tôm"}]'),
      (25, 5, 'feed_tray_checking', 30, 76, 1, 'normal', 'Kiểm tra sàng ăn sau mỗi cữ.', null, '[]'),
      (26, 5, 'water_measuring', 30, 76, 1,    'high',   'Đo hằng ngày, sáng và chiều.', null, '[]'),
      (27, 5, 'health_checking', 30, 76, 2,    'normal', 'Kiểm tra sức khỏe tôm 2 ngày một lần.', null, '[]'),
      (28, 5, 'water_changing',  30, 76, 3,    'normal', 'Thay nước hoặc siphon đáy thường xuyên hơn khi tôm lớn.', null, '[]'),
      (29, 5, 'water_treating',  30, 76, 7,    'normal', 'Xử lý nước, bổ sung chế phẩm theo chu kỳ.', null, '[{"name":"Chế phẩm vi sinh, khoáng"}]'),
      (30, 5, 'weighing_aq',     30, 76, 10,   'normal', 'Cân mẫu mỗi 10 ngày; cân kỹ để chọn ngày thu.', null, '[]'),
      (31, 5, 'treating_aq',     30, 76, null, 'low',    'Khi tôm có dấu hiệu bệnh; thuốc, hóa chất phải ngưng đủ ngày trước khi thu hoạch.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc, chế phẩm trị bệnh"}]'),
      -- 6. Thu hoạch (ngày 106–115)
      (32, 6, 'weighing_aq',      1, 106, null, 'high',   'Cân mẫu trước khi thu để chốt cỡ và giá.', null, '[]'),
      (33, 6, 'water_measuring', 10, 106, 1,    'normal', 'Đo môi trường nước trong những ngày thu.', null, '[]'),
      (34, 6, 'harvesting_aq',   10, 106, null, 'high',   'Kiểm tra hết thời gian ngưng thuốc, hóa chất trước khi thu.', 'Chọn thu tỉa hoặc thu toàn bộ; ghi cỡ thu, khối lượng, nơi nhận.', '[]'),
      (35, 6, 'pond_cleaning',    2, 114, null, 'normal', 'Vệ sinh ao sau khi thu xong.', null, '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
