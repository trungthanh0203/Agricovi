-- Mẫu quy trình hệ thống: HEO THỊT VietGAP (bản tham khảo). Nhập heo 20 kg, nuôi 2 giai đoạn (20–60 kg, 61–105 kg), xuất chuồng; khoảng 129 ngày kể từ ngày 1 chuẩn bị chuồng.
-- Việc nối tiếp ở công đoạn chuẩn bị; từ đó các việc chạy song song và lặp lại (cho ăn mỗi ngày, cân mẫu 15 ngày, sát trùng 7 ngày...).
-- Lịch vaccine và tẩy giun do bác sĩ thú y của trại chốt nên KHÔNG cài cứng: chỉ có việc kèm hướng dẫn. Số ngày và việc là bản nháp, cần thú y và hộ thí điểm duyệt.
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'pig_fattening_vietgap') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('pig_fattening_vietgap', 'livestock', null, 'Heo thịt VietGAP (bản tham khảo)',
            'Quy trình nuôi heo thịt từ 20 kg đến xuất chuồng khoảng 105 kg, 5 công đoạn, khoảng 129 ngày kể từ lúc chuẩn bị chuồng. Lịch vaccine và tẩy giun do bác sĩ thú y của trại chốt. Bản tham khảo: hãy đối chiếu số ngày và việc với kỹ thuật của trại rồi chỉnh lại.',
            'Tham khảo quy trình chăn nuôi heo thịt an toàn sinh học (VietGAP); số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Chuẩn bị chuồng', 'Vệ sinh, sát trùng, để trống chuồng và chuẩn bị nước, đệm lót trước khi nhập heo'),
    (t, 2, '2', 'Nhập heo và cách ly', 'Nhập heo con khoảng 20 kg, cân đầu lứa, theo dõi sức khỏe, tiêm phòng và tẩy giun'),
    (t, 3, '3', 'Giai đoạn 1 (20–60 kg)', 'Nuôi heo từ 20 đến 60 kg: cho ăn, cân mẫu, vệ sinh, sát trùng'),
    (t, 4, '4', 'Giai đoạn 2 (61–105 kg)', 'Nuôi vỗ béo đến khoảng 105 kg, theo dõi thời gian ngưng thuốc'),
    (t, 5, '5', 'Xuất chuồng', 'Cân, kiểm tra hết thời gian ngưng thuốc, xuất heo, vệ sinh và để trống chuồng');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Chuẩn bị chuồng (nối tiếp: ngày 1–9)
      (1,  1, 'house_cleaning',  4, null::int, null::int, 'high',   'Trống chuồng tối thiểu 7 ngày giữa hai lứa.', 'Dọn phân, rửa chuồng, máng ăn, máng uống; để khô.', '[]'),
      (2,  1, 'disinfecting',    2, null, null, 'high',   'Sát trùng chuồng và khu vực xung quanh trước khi nhập heo.', 'Pha thuốc sát trùng đúng nồng độ trên nhãn, phun toàn bộ nền, vách, máng.', '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (3,  1, 'bedding_prep',    2, null, null, 'normal', 'Bỏ qua nếu nuôi chuồng sàn không đệm lót.', 'Trải đệm lót đều, độ dày theo hướng dẫn của loại đệm lót.', '[{"name":"Trấu / mùn cưa / đệm lót sinh học"},{"name":"Chế phẩm sinh học"}]'),
      (4,  1, 'water_checking',  1, null, null, 'normal', 'Kiểm tra nguồn nước uống trước khi nhập heo.', 'Lấy mẫu nước nếu cần theo yêu cầu của VietGAP; ghi kết quả.', '[]'),
      -- 2. Nhập heo và cách ly (ngày 10–23)
      (5,  2, 'weighing',        1, 10, null, 'high',   'Cân đầu lứa (khoảng 20 kg) và đếm số con nhập.', 'Cân mẫu đại diện; ghi số con và cân nặng trung bình.', '[]'),
      (6,  2, 'feeding',        14, 10, 1,    'high',   'Ghi lượng cám mỗi ngày (kg) để tính FCR.', 'Cho ăn đủ bữa, cám đúng giai đoạn, theo dõi lượng ăn thừa.', '[{"name":"Cám heo giai đoạn nhập"}]'),
      (7,  2, 'disinfecting',   14, 10, 3,    'normal', 'Sát trùng định kỳ chuồng, hố sát trùng, lối đi.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (8,  2, 'vaccinating',     7, 14, null, 'high',   'Lịch vaccine do bác sĩ thú y của trại chốt.', 'Ghi tên vaccine, số lô, liều, số con tiêm; báo sự cố nếu gãy kim.', '[{"name":"Vaccine theo lịch thú y"}]'),
      (9,  2, 'deworming',       3, 17, null, 'normal', 'Theo hướng dẫn của thú y.', 'Ghi thuốc tẩy, liều, số con.', '[{"name":"Thuốc tẩy giun sán"}]'),
      -- 3. Giai đoạn 1: 20-60 kg (ngày 24–72)
      (10, 3, 'feeding',        49, 24, 1,    'high',   'Ghi lượng cám mỗi ngày (kg).', 'Cám giai đoạn 1; điều chỉnh lượng theo cân nặng.', '[{"name":"Cám heo giai đoạn 1"}]'),
      (11, 3, 'weighing',       49, 24, 15,   'normal', 'Cân mẫu mỗi 15 ngày để tính tăng trọng (ADG).', 'Cân ngẫu nhiên một số con đại diện.', '[]'),
      (12, 3, 'house_cleaning', 49, 24, 1,    'normal', 'Vệ sinh chuồng hằng ngày.', null, '[]'),
      (13, 3, 'disinfecting',   49, 24, 7,    'normal', 'Sát trùng định kỳ mỗi tuần.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (14, 3, 'waste_handling', 49, 24, 3,    'low',    'Xử lý phân, nước thải, biogas.', null, '[]'),
      (15, 3, 'pest_control',   49, 24, 14,   'low',    'Diệt chuột và côn trùng định kỳ.', null, '[]'),
      (16, 3, 'vaccinating',    15, 30, null, 'normal', 'Lịch vaccine do bác sĩ thú y của trại chốt.', 'Ghi tên vaccine, số lô, liều, số con tiêm.', '[{"name":"Vaccine theo lịch thú y"}]'),
      -- 4. Giai đoạn 2: 61-105 kg (ngày 73–122)
      (17, 4, 'feeding',        50, 73, 1,    'high',   'Ghi lượng cám mỗi ngày (kg).', 'Cám giai đoạn 2 (vỗ béo).', '[{"name":"Cám heo giai đoạn 2"}]'),
      (18, 4, 'weighing',       50, 73, 15,   'normal', 'Cân mẫu mỗi 15 ngày.', null, '[]'),
      (19, 4, 'house_cleaning', 50, 73, 1,    'normal', 'Vệ sinh chuồng hằng ngày.', null, '[]'),
      (20, 4, 'disinfecting',   50, 73, 7,    'normal', 'Sát trùng định kỳ mỗi tuần.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (21, 4, 'waste_handling', 50, 73, 3,    'low',    'Xử lý phân, nước thải, biogas.', null, '[]'),
      (22, 4, 'treating',       50, 73, null, 'high',   'Khi có heo bệnh; thuốc thú y phải ngưng đủ ngày trước khi xuất chuồng.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc thú y"}]'),
      -- 5. Xuất chuồng (ngày 123–129)
      (23, 5, 'weighing',        1, 123, null, 'high',   'Cân trước xuất chuồng.', null, '[]'),
      (24, 5, 'harvesting_lv',   7, 123, null, 'high',   'Kiểm tra hết thời gian ngưng thuốc thú y trước khi xuất.', 'Ghi số con, khối lượng, số giấy kiểm dịch và nơi nhận.', '[]'),
      (25, 5, 'house_cleaning',  3, 127, null, 'normal', 'Vệ sinh và để trống chuồng tối thiểu 7 ngày trước lứa mới.', null, '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
