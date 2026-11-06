-- Mẫu quy trình hệ thống (BẢN NHÁP, cần cán bộ khuyến nông / thú y địa phương thẩm định trước khi dùng thật) cho vườn cây lâu năm và đàn nuôi liên tục,
-- dùng theo KỲ (migration 0182): NHO (một vụ trong năm, khoảng 135 ngày), NA (một năm, 365 ngày), DÊ và BÒ (một quý, 90 ngày).
-- Số ngày, chu kỳ và việc là bản nháp tham khảo; KHÔNG cài cứng liều thuốc, lịch tiêm phòng, lịch sinh sản vì phụ thuộc giống, vùng và hướng dẫn thú y/khuyến nông. Khi áp dụng, cơ sở sửa lại theo điều kiện thực tế.

insert into crop_types (code, name) values ('grape', 'Nho') on conflict (code) where organization_id is null do nothing;
insert into crop_types (code, name) values ('custard_apple', 'Na (mãng cầu ta)') on conflict (code) where organization_id is null do nothing;

-- ===================================================================== NHO
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'grape_season') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('grape_season', 'crop', (select id from crop_types where organization_id is null and code = 'grape'),
            'Nho: một mùa vụ trong năm, giàn (bản nháp theo kỳ)',
            'Quy trình MỘT KỲ (một mùa vụ) của vườn nho trên giàn: cắt tỉa và phục hồi, ra chồi tạo cành, ra hoa đậu trái, nuôi trái, thu hoạch; khoảng 135 ngày. Mỗi mùa mở một kỳ mới. Bản nháp, cần thẩm định theo giống và vùng trồng.',
            'Bản nháp tham khảo kỹ thuật chăm sóc nho trên giàn; số ngày thay đổi theo giống và vùng')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Cắt tỉa và phục hồi', 'Cắt tỉa cành sau thu hoạch hoặc đầu mùa, vệ sinh vườn, bón phục hồi, tưới giữ ẩm'),
    (t, 2, '2', 'Ra chồi và tạo cành', 'Tỉa chồi, uốn buộc cành lên giàn, bón thúc, phòng bệnh lá'),
    (t, 3, '3', 'Ra hoa và đậu trái', 'Tỉa chùm hoa, chuyển phân kali, phòng nấm bệnh giai đoạn hoa'),
    (t, 4, '4', 'Nuôi trái', 'Tỉa trái, bao chùm, tưới và bón nuôi trái, phòng bệnh'),
    (t, 5, '5', 'Thu hoạch', 'Thu chùm chín, kiểm tra thời gian cách ly, dọn vườn');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      (1,  1, 'pruning',     7,  1,  null::int, 'high',   'Cắt tỉa cành, chừa mắt theo kỹ thuật của giống; dọn cành lá bệnh.', 'Số mắt chừa và thời điểm cắt theo hướng dẫn của cán bộ khuyến nông địa phương. Ghi ngày cắt tỉa để tính ngày ra hoa, thu hoạch.', '[]'),
      (2,  1, 'fertilizing', 3,  6,  null,      'high',   'Bón phục hồi sau cắt tỉa (phân hữu cơ hoai, phân cân đối).', 'Liều theo tuổi cây và phân tích đất, không bón quá tay.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân NPK"}]'),
      (3,  1, 'irrigation',  20, 1,  3,         'normal', 'Tưới giữ ẩm đều, không để úng.', 'Tưới nhỏ giọt hoặc rãnh tùy vườn; nho sợ úng gốc.', '[]'),
      (4,  2, 'pruning',     25, 15, 7,         'normal', 'Tỉa chồi thừa, giữ chồi khỏe để làm cành mang trái.', null, '[]'),
      (5,  2, 'trellising',  15, 20, null,      'normal', 'Uốn, buộc cành lên giàn cho đều.', 'Buộc lỏng tay để không thắt cành.', '[]'),
      (6,  2, 'fertilizing', 25, 25, 15,        'normal', 'Bón thúc theo đợt, ưu tiên đạm và lân giai đoạn cành.', 'Chia nhỏ nhiều lần; ghi loại phân, lượng.', '[{"name":"Phân bón lá / NPK"}]'),
      (7,  2, 'spraying',    30, 15, 10,        'normal', 'Phòng sương mai, phấn trắng, thán thư giai đoạn lá non.', 'Ưu tiên chế phẩm sinh học; ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng bệnh"}]'),
      (8,  3, 'pruning',     10, 45, null,      'high',   'Tỉa chùm hoa, bỏ chùm nhỏ và dị dạng.', null, '[]'),
      (9,  3, 'spraying',    20, 45, 7,         'high',   'Phòng nấm bệnh trong giai đoạn hoa, đậu trái.', 'Không phun lúc nở hoa rộ nếu thuốc ảnh hưởng thụ phấn; hỏi cán bộ kỹ thuật.', '[{"name":"Thuốc / chế phẩm phòng bệnh"}]'),
      (10, 3, 'fertilizing', 25, 55, 12,        'normal', 'Chuyển bón nhiều kali để nuôi trái.', null, '[{"name":"Phân kali"}]'),
      (11, 4, 'pruning',     10, 70, null,      'normal', 'Tỉa trái, giữ số trái hợp lý trên chùm.', null, '[]'),
      (12, 4, 'other',       10, 75, null,      'normal', 'Bao chùm bảo vệ trái khỏi sâu bệnh, chim, nắng gắt.', null, '[{"name":"Túi bao chùm"}]'),
      (13, 4, 'irrigation',  35, 70, 3,         'high',   'Tưới đều nuôi trái; giảm nước trước khi thu để trái ngọt.', null, '[]'),
      (14, 4, 'spraying',    30, 70, 10,        'normal', 'Phòng bệnh giai đoạn trái; ngưng thuốc đủ ngày trước thu hoạch.', 'Ghi thời gian cách ly từng loại thuốc.', '[{"name":"Thuốc / chế phẩm phòng bệnh"}]'),
      (15, 5, 'harvesting',  20, 110, 2,        'high',   'Thu chùm chín theo độ ngọt (Brix) và màu; ghi sản lượng từng đợt.', 'Kiểm tra hết thời gian cách ly trước khi thu; ghi Brix nếu có.', '[]'),
      (16, 5, 'other',       5,  130, null,     'low',    'Dọn vườn, thu dọn túi bao và cành bỏ; chuẩn bị mùa sau.', null, '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;

-- ===================================================================== NA
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'custard_apple_year') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('custard_apple_year', 'crop', (select id from crop_types where organization_id is null and code = 'custard_apple'),
            'Na (mãng cầu ta): chăm sóc theo năm (bản nháp theo kỳ)',
            'Quy trình MỘT KỲ (một năm) của vườn na đã cho trái: cắt tỉa và phục hồi, ra lá ra hoa, thụ phấn bổ sung, nuôi trái và bao trái, thu hoạch rải, dọn vườn; 365 ngày. Bản nháp, cần thẩm định theo giống và vùng trồng.',
            'Bản nháp tham khảo kỹ thuật chăm sóc na; số ngày thay đổi theo giống, vùng và cách xử lý ra hoa')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Cắt tỉa và phục hồi', 'Cắt tỉa, vệ sinh vườn, bón phục hồi sau thu hoạch'),
    (t, 2, '2', 'Ra lá và ra hoa', 'Tưới, bón thúc, phòng sâu bệnh giai đoạn lá non và nụ hoa'),
    (t, 3, '3', 'Thụ phấn và đậu trái', 'Thụ phấn bổ sung bằng tay giúp đậu trái đều, đẹp'),
    (t, 4, '4', 'Nuôi trái', 'Tỉa trái, bao trái, bón nuôi trái, phòng bệnh'),
    (t, 5, '5', 'Thu hoạch', 'Thu trái chín rải nhiều đợt, kiểm tra thời gian cách ly'),
    (t, 6, '6', 'Dọn vườn', 'Thu dọn, vệ sinh vườn, chuẩn bị năm sau');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      (1,  1, 'pruning',     15,  1,   null::int, 'high',   'Cắt tỉa cành già, cành sâu bệnh, tạo tán thông thoáng.', 'Thời điểm và mức cắt theo hướng dẫn kỹ thuật địa phương.', '[]'),
      (2,  1, 'other',       10,  1,   null,      'normal', 'Vệ sinh vườn: dọn cỏ, cành lá, trái rụng.', null, '[]'),
      (3,  1, 'fertilizing', 10,  12,  null,      'high',   'Bón phục hồi sau thu hoạch (hữu cơ và phân cân đối).', 'Liều theo tuổi cây và phân tích đất.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân NPK"}]'),
      (4,  2, 'irrigation',  120, 30,  4,         'normal', 'Tưới giữ ẩm vào mùa khô, tránh úng.', null, '[]'),
      (5,  2, 'fertilizing', 120, 40,  30,        'normal', 'Bón thúc theo đợt, tăng dần kali khi ra hoa.', 'Chia nhỏ nhiều lần.', '[{"name":"Phân NPK"},{"name":"Phân kali"}]'),
      (6,  2, 'spraying',    120, 30,  15,        'normal', 'Phòng rệp sáp, sâu đục và nấm bệnh trên lá, nụ.', 'Ưu tiên chế phẩm sinh học; ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng sâu bệnh"}]'),
      (7,  3, 'pollination', 30,  150, 1,         'high',   'Thụ phấn bổ sung bằng tay vào buổi sáng khi hoa nở.', 'Làm hằng ngày trong rộ hoa; ghi số cây, số hoa đã thụ phấn.', '[]'),
      (8,  4, 'pruning',     20,  190, null,      'normal', 'Tỉa trái dị dạng, bỏ trái dư để trái lớn đều.', null, '[]'),
      (9,  4, 'other',       20,  200, null,      'normal', 'Bao trái bảo vệ khỏi sâu, ruồi đục trái.', null, '[{"name":"Túi bao trái"}]'),
      (10, 4, 'fertilizing', 60,  200, 30,        'normal', 'Bón nuôi trái.', null, '[{"name":"Phân kali"}]'),
      (11, 4, 'spraying',    100, 190, 10,        'normal', 'Phòng sâu bệnh giai đoạn trái; ngưng thuốc đủ ngày trước thu hoạch.', 'Ghi thời gian cách ly từng loại thuốc.', '[{"name":"Thuốc / chế phẩm phòng sâu bệnh"}]'),
      (12, 5, 'harvesting',  45,  300, 3,         'high',   'Thu trái chín rải nhiều đợt; ghi sản lượng từng đợt.', 'Kiểm tra hết thời gian cách ly trước khi thu.', '[]'),
      (13, 6, 'other',       15,  345, null,      'low',    'Thu dọn, vệ sinh vườn, chuẩn bị kỳ sau.', null, '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;

-- ===================================================================== DÊ
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'goat_herd_quarter') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('goat_herd_quarter', 'livestock', null,
            'Dê: đàn nuôi liên tục, lịch chăm sóc một quý (bản nháp theo kỳ)',
            'Lịch chăm sóc MỘT KỲ (một quý, 90 ngày) cho đàn dê nuôi liên tục: chăm sóc hằng ngày, sức khỏe và phòng bệnh, theo dõi sinh sản, cân dê con và hậu bị, xuất bán và loại thải. Bản nháp, lịch tiêm phòng và tẩy giun do cán bộ thú y địa phương quyết định.',
            'Bản nháp tham khảo chăm sóc đàn dê; không cài cứng liều thuốc và lịch tiêm phòng')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Chăm sóc hằng ngày', 'Thức ăn, nước uống, vệ sinh chuồng, xử lý phân'),
    (t, 2, '2', 'Sức khỏe và phòng bệnh', 'Kiểm tra sức khỏe, tẩy giun, tiêm phòng, sát trùng'),
    (t, 3, '3', 'Sinh sản và đàn con', 'Theo dõi động dục, phối giống, dê sắp đẻ, cân dê con và hậu bị'),
    (t, 4, '4', 'Xuất bán và tổng kết', 'Xuất dê thịt và dê giống, loại thải, tổng kết kỳ');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      (1,  1, 'feeding',        90, 1,  1,    'high',   'Cho ăn cỏ, lá và thức ăn bổ sung; ghi lượng thức ăn.', 'Khẩu phần theo nhóm (đực giống, cái sinh sản, hậu bị, con non). Thức ăn sạch, không mốc.', '[{"name":"Cỏ, lá"},{"name":"Thức ăn bổ sung"}]'),
      (2,  1, 'water_checking', 90, 1,  1,    'high',   'Kiểm tra nước uống sạch, đủ.', null, '[]'),
      (3,  1, 'house_cleaning', 90, 1,  2,    'normal', 'Dọn phân, vệ sinh chuồng và sàn.', 'Chuồng khô, thoáng, sàn cao thoát phân.', '[]'),
      (4,  1, 'waste_handling', 90, 1,  7,    'low',    'Xử lý phân, nước thải.', null, '[]'),
      (5,  2, 'other_lv',       90, 1,  7,    'high',   'Kiểm tra sức khỏe từng nhóm: ăn uống, phân, mắt, lông, đi lại; tách con bệnh.', 'Phát hiện sớm tiêu chảy, ghẻ, khập khiễng; báo thú y.', '[]'),
      (6,  2, 'deworming',      5,  15, null, 'normal', 'Tẩy giun sán cho cả đàn theo hướng dẫn của thú y.', 'Không tự quyết liều. Ghi thuốc, liều, số con, ngày; thuốc có thời gian ngưng trước khi bán.', '[{"name":"Thuốc tẩy giun sán"}]'),
      (7,  2, 'vaccinating',    7,  30, null, 'high',   'Tiêm phòng theo lịch của cán bộ thú y địa phương.', 'Ghi loại vaccine, lô, số con, người tiêm.', '[{"name":"Vaccine"}]'),
      (8,  2, 'disinfecting',   90, 1,  14,   'normal', 'Sát trùng chuồng định kỳ.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (9,  2, 'treating',       90, 1,  null, 'low',    'Khi có dê bệnh: tách riêng, điều trị theo thú y.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc thú y"}]'),
      (10, 3, 'other_lv',       90, 1,  3,    'normal', 'Theo dõi dê cái động dục, phối giống, dê sắp đẻ; ghi ngày phối, ngày đẻ.', 'Ghi vào sự kiện số đầu: mới sinh, chuyển nhóm khi dê con đủ tháng.', '[]'),
      (11, 3, 'weighing',       3,  45, 30,   'normal', 'Cân mẫu dê con và hậu bị để theo dõi tăng trọng.', null, '[]'),
      (12, 4, 'harvesting_lv',  20, 70, null, 'high',   'Xuất bán dê thịt, dê giống, dê loại thải; ghi số con, khối lượng, nơi nhận.', 'Kiểm tra hết thời gian ngưng thuốc thú y trước khi bán. Ghi sự kiện "Xuất" theo nhóm.', '[]'),
      (13, 4, 'other_lv',       2,  88, null, 'low',    'Tổng kết kỳ: số đầu cuối kỳ từng nhóm, chết, loại, chi phí và doanh thu.', 'Xem báo cáo Biến động đàn rồi đóng kỳ.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;

-- ===================================================================== BÒ
do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'cattle_herd_quarter') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('cattle_herd_quarter', 'livestock', null,
            'Bò: đàn nuôi liên tục, lịch chăm sóc một quý (bản nháp theo kỳ)',
            'Lịch chăm sóc MỘT KỲ (một quý, 90 ngày) cho đàn bò nuôi liên tục (bò sinh sản, bò thịt): chăm sóc hằng ngày, sức khỏe và tiêm phòng, theo dõi sinh sản, cân định kỳ, xuất bán và tổng kết. Bản nháp, lịch tiêm phòng và tẩy giun do cán bộ thú y địa phương quyết định.',
            'Bản nháp tham khảo chăm sóc đàn bò; không cài cứng liều thuốc và lịch tiêm phòng')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Chăm sóc hằng ngày', 'Thức ăn thô xanh, thức ăn tinh, nước uống, vệ sinh chuồng'),
    (t, 2, '2', 'Sức khỏe và phòng bệnh', 'Kiểm tra sức khỏe, tẩy giun, tiêm phòng, sát trùng'),
    (t, 3, '3', 'Sinh sản và bê nghé', 'Theo dõi động dục, phối giống, bò sắp đẻ, cân bê nghé và bò hậu bị'),
    (t, 4, '4', 'Xuất bán và tổng kết', 'Xuất bò thịt, bê giống, loại thải; tổng kết kỳ');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      (1,  1, 'feeding',        90, 1,  1,    'high',   'Cho ăn cỏ, rơm ủ, thức ăn tinh; ghi lượng thức ăn.', 'Khẩu phần theo nhóm (bò cái sinh sản, bò thịt, bê nghé, hậu bị). Thức ăn sạch, không mốc.', '[{"name":"Cỏ, rơm"},{"name":"Thức ăn tinh"}]'),
      (2,  1, 'water_checking', 90, 1,  1,    'high',   'Kiểm tra nước uống sạch, đủ.', null, '[]'),
      (3,  1, 'house_cleaning', 90, 1,  2,    'normal', 'Dọn phân, vệ sinh chuồng, sân chơi.', null, '[]'),
      (4,  1, 'waste_handling', 90, 1,  7,    'low',    'Xử lý phân, nước thải (hầm biogas, ủ phân).', null, '[]'),
      (5,  2, 'other_lv',       90, 1,  7,    'high',   'Kiểm tra sức khỏe từng nhóm: ăn uống, nhai lại, phân, mắt, móng, vú (bò sữa).', 'Phát hiện sớm tiêu chảy, ghẻ, viêm vú, què; báo thú y.', '[]'),
      (6,  2, 'deworming',      5,  15, null, 'normal', 'Tẩy giun sán theo hướng dẫn của thú y.', 'Không tự quyết liều. Ghi thuốc, liều, số con, ngày; thuốc có thời gian ngưng trước khi bán.', '[{"name":"Thuốc tẩy giun sán"}]'),
      (7,  2, 'vaccinating',    7,  30, null, 'high',   'Tiêm phòng theo lịch của cán bộ thú y địa phương (ví dụ lở mồm long móng, tụ huyết trùng).', 'Ghi loại vaccine, lô, số con, người tiêm.', '[{"name":"Vaccine"}]'),
      (8,  2, 'disinfecting',   90, 1,  14,   'normal', 'Sát trùng chuồng định kỳ.', null, '[{"name":"Thuốc sát trùng chuồng trại"}]'),
      (9,  2, 'treating',       90, 1,  null, 'low',    'Khi có bò bệnh: tách riêng, điều trị theo thú y.', 'Ghi triệu chứng, thuốc, liều, thời gian ngưng thuốc.', '[{"name":"Thuốc thú y"}]'),
      (10, 3, 'other_lv',       90, 1,  3,    'normal', 'Theo dõi bò cái động dục, phối giống, bò sắp đẻ; ghi ngày phối, ngày đẻ.', 'Ghi vào sự kiện số đầu: mới sinh, chuyển nhóm khi bê nghé đủ tháng.', '[]'),
      (11, 3, 'weighing',       3,  45, 30,   'normal', 'Cân hoặc đo mẫu bê nghé và hậu bị để theo dõi tăng trọng.', null, '[]'),
      (12, 4, 'harvesting_lv',  20, 70, null, 'high',   'Xuất bán bò thịt, bê giống, bò loại thải; ghi số con, khối lượng, nơi nhận.', 'Kiểm tra hết thời gian ngưng thuốc thú y trước khi bán. Ghi sự kiện "Xuất" theo nhóm.', '[]'),
      (13, 4, 'other_lv',       2,  88, null, 'low',    'Tổng kết kỳ: số đầu cuối kỳ từng nhóm, chết, loại, chi phí và doanh thu.', 'Xem báo cáo Biến động đàn rồi đóng kỳ.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
