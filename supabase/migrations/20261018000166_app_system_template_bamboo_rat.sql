-- Mẫu quy trình hệ thống: DÚI nuôi thương phẩm (nuôi lấy thịt) trong chuồng ô riêng (bản tham khảo). Nhập dúi giống đã cai sữa, nuôi khoảng 8 tháng, xuất bán; tổng khoảng 255 ngày kể từ ngày 1 chuẩn bị chuồng.
-- Đặc thù dúi (khác heo, gà): nuôi MỖI CON MỘT Ô (dúi hung dữ, cắn nhau), chuồng tối và yên tĩnh (dúi sống hang, hoạt động ban đêm), ăn thực vật tươi sạch (tre, nứa, mía, sắn, củ, cỏ), thức ăn mốc gây bệnh đường ruột,
-- và là loài có thể thuộc nhóm động vật hoang dã nên phải xác nhận thủ tục, mã số cơ sở, sổ theo dõi và giấy tờ nguồn gốc với Kiểm lâm tỉnh.
-- Lịch sinh sản (ghép đôi, mang thai, cai sữa) và lịch thuốc thú y KHÔNG cài cứng vì số liệu chưa chắc chắn: số ngày là bản nháp, thời điểm xuất chốt theo cân mẫu thực tế. Sản phẩm "Dúi" cơ sở tự thêm (loại vật nuôi).
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'bamboo_rat_fattening') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('bamboo_rat_fattening', 'livestock', null, 'Dúi nuôi thương phẩm, ô riêng (bản tham khảo)',
            'Quy trình nuôi dúi lấy thịt từ dúi giống đã cai sữa đến xuất bán, 5 công đoạn, khoảng 255 ngày kể từ lúc chuẩn bị chuồng. Đặc thù: mỗi con một ô riêng, chuồng tối và yên tĩnh, thức ăn thực vật tươi sạch không mốc, cần hồ sơ pháp lý và giấy tờ nguồn gốc. Bản tham khảo: hãy đối chiếu với hộ nuôi dúi thật và thú y, xác nhận thủ tục với Kiểm lâm rồi chỉnh lại.',
            'Tham khảo mô hình nuôi dúi của các hộ nuôi và quy định quản lý động vật rừng; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Chuẩn bị chuồng và hồ sơ', 'Kiểm tra thủ tục pháp lý, vệ sinh và sát trùng chuồng, chuẩn bị nền ô, chống dúi thoát và chuột, rắn'),
    (t, 2, '2', 'Nhập giống và thích nghi', 'Nhập dúi giống có giấy tờ, đánh dấu từng con vào từng ô, cân đầu lứa, theo dõi ăn uống, phân những tuần đầu'),
    (t, 3, '3', 'Nuôi giai đoạn 1', 'Dúi nhỏ lớn dần: cho ăn thức ăn xanh và củ, cân mẫu hằng tháng, kiểm tra từng ô'),
    (t, 4, '4', 'Nuôi giai đoạn 2', 'Nuôi vỗ đến cỡ bán: tăng thức ăn giàu tinh bột, theo dõi sức khỏe, chuẩn bị xuất bán'),
    (t, 5, '5', 'Xuất bán', 'Cân, hoàn thiện giấy tờ nguồn gốc, xuất bán, vệ sinh và để trống chuồng');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Chuẩn bị chuồng và hồ sơ (nối tiếp: ngày 1–11)
      (1,  1, 'other_lv',       2, null::int, null::int, 'high',   'Xác nhận loài nuôi và thủ tục với Kiểm lâm tỉnh: đăng ký, mã số cơ sở, sổ theo dõi nuôi.', 'Dúi có thể thuộc nhóm động vật hoang dã. Hỏi Chi cục Kiểm lâm tỉnh để biết loài nuôi có phải đăng ký không, cần giấy tờ gì khi mua giống và khi bán. Lưu hóa đơn, giấy xác nhận nguồn gốc.', '[]'),
      (2,  1, 'house_cleaning', 3, null, null, 'high',   'Dọn, rửa chuồng và từng ô nuôi; để khô hoàn toàn.', 'Mỗi con một ô riêng. Ô phải khô ráo, thoát nước, nền chắc để dúi không đào chui thoát.', '[]'),
      (3,  1, 'disinfecting',   2, null, null, 'high',   'Sát trùng chuồng, ô nuôi và dụng cụ trước khi nhập dúi.', 'Pha thuốc sát trùng đúng nồng độ trên nhãn; để khô và hết mùi rồi mới nhập dúi.', '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (4,  1, 'bedding_prep',   2, null, null, 'normal', 'Trải lớp lót nền ô (trấu, mùn cưa sạch) và đặt ống hoặc hộc cho dúi chui nằm.', 'Dúi sống hang, thích chỗ tối. Ống/hộc đủ rộng cho một con; chuồng nên tối, yên tĩnh, thoáng mát, tránh nắng và ồn.', '[{"name":"Trấu / mùn cưa sạch"},{"name":"Ống chui / hộc nằm"}]'),
      (5,  1, 'pest_control',   2, null, null, 'high',   'Chống chuột, rắn, kiến; kiểm tra lỗ hở, cửa ô để dúi không thoát.', 'Chuột, rắn có thể vào ăn thức ăn hoặc hại dúi con; bịt kín khe, lưới chắn cửa thoát nước.', '[]'),
      -- 2. Nhập giống và thích nghi (ngày 12–39)
      (6,  2, 'other_lv',       1, 12, null, 'high',   'Nhập dúi giống khỏe, đã cai sữa, có giấy tờ nguồn gốc; đánh mã từng con vào từng ô.', 'Chọn con nhanh nhẹn, lông mượt, không ghẻ, không vết thương. Ghi nơi mua, số lượng, giới tính, mã ô của từng con. Không thả chung nhiều con vào một ô.', '[{"name":"Dúi giống"}]'),
      (7,  2, 'weighing',       1, 12, null, 'high',   'Cân đầu lứa và ghi số con nhập.', 'Cân từng con hoặc mẫu đại diện; ghi cân nặng trung bình.', '[]'),
      (8,  2, 'feeding',       28, 12, 1,    'high',   'Ghi lượng thức ăn cho mỗi ngày; cho ăn buổi chiều tối.', 'Thức ăn thực vật tươi sạch: tre, nứa, mía, sắn, khoai, cỏ voi, chuối... Không cho thức ăn ôi, mốc (mốc gây bệnh đường ruột). Tập ăn dần, lúc đầu cho ít để dúi quen.', '[{"name":"Thức ăn xanh, củ quả (tre, mía, sắn, cỏ)"}]'),
      (9,  2, 'other_lv',      28, 12, 1,    'normal', 'Theo dõi thích nghi: dúi có ăn không, phân bình thường không, có sợ hãi, cắn chuồng.', 'Ghi con bỏ ăn, phân lỏng, vết thương. Con yếu tách riêng và báo thú y.', '[]'),
      (10, 2, 'house_cleaning',28, 12, 2,    'normal', 'Dọn phân, thức ăn thừa, thay lớp lót ướt.', 'Giữ nền khô; ẩm ướt dễ sinh bệnh ngoài da và đường ruột.', '[]'),
      (11, 2, 'disinfecting',  28, 12, 7,    'normal', 'Sát trùng chuồng định kỳ mỗi tuần.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (12, 2, 'deworming',      3, 20, null, 'normal', 'Tẩy giun sán theo hướng dẫn của thú y.', 'Không tự quyết liều. Ghi thuốc, liều, số con.', '[{"name":"Thuốc tẩy giun sán"}]'),
      -- 3. Nuôi giai đoạn 1 (ngày 40–129)
      (13, 3, 'feeding',       90, 40, 1,    'high',   'Ghi lượng thức ăn mỗi ngày; cho ăn buổi chiều tối.', 'Thức ăn xanh và củ là chính; có thể bổ sung ít cám, bắp, khoáng theo hướng dẫn. Thức ăn rửa sạch, để ráo.', '[{"name":"Thức ăn xanh, củ quả"},{"name":"Cám, bắp, khoáng (nếu dùng)"}]'),
      (14, 3, 'weighing',      90, 40, 30,   'normal', 'Cân mẫu mỗi tháng để tính tăng trọng.', 'Cân ngẫu nhiên một số con đại diện; chốt thời điểm xuất theo cân thực tế.', '[]'),
      (15, 3, 'other_lv',      90, 40, 3,    'normal', 'Kiểm tra từng ô 3 ngày một lần: ăn uống, ghẻ, vết thương, bỏ ăn.', 'Dúi cắn nhau hoặc cắn chuồng có thể trầy răng, chảy máu; phát hiện sớm và báo thú y.', '[]'),
      (16, 3, 'house_cleaning',90, 40, 2,    'normal', 'Dọn phân, thức ăn thừa, thay lớp lót ướt.', null, '[]'),
      (17, 3, 'disinfecting',  90, 40, 14,   'normal', 'Sát trùng chuồng định kỳ hai tuần một lần.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (18, 3, 'waste_handling',90, 40, 7,    'low',    'Xử lý phân, nước thải.', null, '[]'),
      (19, 3, 'pest_control',  90, 40, 14,   'low',    'Diệt chuột, côn trùng định kỳ; kiểm tra lỗ hở.', null, '[]'),
      (20, 3, 'treating',      90, 40, null, 'low',    'Khi có dúi bệnh hoặc vết thương.', 'Tách con bệnh sang ô riêng, báo thú y. Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc thú y"}]'),
      -- 4. Nuôi giai đoạn 2 (ngày 130–239)
      (21, 4, 'feeding',      110, 130, 1,   'high',   'Ghi lượng thức ăn mỗi ngày; tăng thức ăn giàu tinh bột để vỗ.', 'Thêm sắn, khoai, bắp theo cỡ con. Vẫn giữ thức ăn xanh để tiêu hóa tốt.', '[{"name":"Thức ăn xanh, củ quả"},{"name":"Sắn, khoai, bắp"}]'),
      (22, 4, 'weighing',     110, 130, 30,  'normal', 'Cân mẫu mỗi tháng để chọn thời điểm xuất.', null, '[]'),
      (23, 4, 'other_lv',     110, 130, 3,   'normal', 'Kiểm tra từng ô 3 ngày một lần: ăn uống, ghẻ, vết thương.', null, '[]'),
      (24, 4, 'house_cleaning',110,130, 2,   'normal', 'Dọn phân, thức ăn thừa, thay lớp lót ướt.', null, '[]'),
      (25, 4, 'disinfecting', 110, 130, 14,  'normal', 'Sát trùng chuồng định kỳ hai tuần một lần.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (26, 4, 'waste_handling',110,130, 7,   'low',    'Xử lý phân, nước thải.', null, '[]'),
      (27, 4, 'treating',     110, 130, null,'low',    'Khi có dúi bệnh hoặc vết thương; thuốc phải ngưng đủ ngày trước khi xuất.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc thú y"}]'),
      -- 5. Xuất bán (ngày 240–255)
      (28, 5, 'weighing',       1, 240, null,'high',   'Cân mẫu trước khi bán để chốt cỡ và giá.', null, '[]'),
      (29, 5, 'other_lv',       3, 240, null,'high',   'Chuẩn bị giấy tờ nguồn gốc, xác nhận vận chuyển và hợp đồng/biên nhận với nơi nhận.', 'Dúi bán ra phải rõ nguồn gốc nuôi; hỏi Kiểm lâm giấy tờ cần có khi vận chuyển. Lưu bản sao.', '[]'),
      (30, 5, 'harvesting_lv', 10, 243, null,'high',   'Kiểm tra hết thời gian ngưng thuốc thú y trước khi bán.', 'Ghi số con, khối lượng, nơi nhận, giấy tờ đi kèm.', '[]'),
      (31, 5, 'house_cleaning', 3, 253, null,'normal', 'Vệ sinh và để trống chuồng trước lứa mới.', null, '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
