-- Mẫu quy trình hệ thống: ỚT CHUÔNG NGỌT (gồm ớt chuông sô-cô-la) trồng nhà màng, luống phủ màng, tưới nhỏ giọt, có giàn dây (bản tham khảo).
-- Ớt chuông sô-cô-la chỉ khác ớt chuông thường ở màu quả (chín chuyển nâu sô-cô-la) nên dùng chung một quy trình, khác ở ghi chú thu hoạch.
-- Ươm cây con khoảng 35 ngày, trồng, thu quả liên tục khoảng 100 ngày; tổng khoảng 205 ngày. Việc ươm và chuẩn bị đất chạy song song; từ đó các việc chăm sóc chạy song song và lặp lại theo chu kỳ.
-- Số ngày, chu kỳ và việc là bản nháp theo kỹ thuật phổ biến vùng mát (cao nguyên), cần đối chiếu với giống, vùng trồng và cán bộ khuyến nông. Liều phân, thuốc KHÔNG cài cứng.
insert into crop_types (code, name) values ('bell_pepper', 'Ớt chuông')
on conflict (code) where organization_id is null do nothing;

do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'bell_pepper_greenhouse') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('bell_pepper_greenhouse', 'crop', (select id from crop_types where organization_id is null and code = 'bell_pepper'),
            'Ớt chuông ngọt, ớt chuông sô-cô-la, nhà màng (bản tham khảo)',
            'Quy trình trồng ớt chuông ngọt (kể cả giống sô-cô-la) trong nhà màng, luống phủ màng, tưới nhỏ giọt kết hợp bón phân qua nước, có giàn dây, 7 công đoạn, khoảng 205 ngày (ươm cây con 35 ngày, thu quả liên tục khoảng 100 ngày). Việc ươm cây con và chuẩn bị đất chạy song song; các việc tưới, bón, tỉa, buộc dây, phun phòng bệnh lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu với giống, vùng trồng và kỹ thuật của vườn rồi chỉnh lại.',
            'Tham khảo kỹ thuật trồng ớt chuông nhà màng phổ biến ở vùng cao nguyên; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Ươm cây con', 'Ngâm ủ, gieo hạt vào khay, chăm cây con khoảng 35 ngày đến khi có 4–6 lá thật'),
    (t, 2, '2', 'Chuẩn bị đất và luống', 'Làm đất, bón lót, lên luống, phủ màng, lắp ống tưới và xử lý đất; làm song song lúc cây con còn trong khay'),
    (t, 3, '3', 'Trồng và hồi phục', 'Ra cây con vào luống, tưới giữ ẩm, dặm cây chết'),
    (t, 4, '4', 'Sinh trưởng', 'Cây ra thân lá, tỉa chồi nách, buộc dây lên giàn, bón thúc, phòng sâu bệnh'),
    (t, 5, '5', 'Ra hoa, đậu quả', 'Thụ phấn, chuyển bón nhiều kali và canxi, tỉa hoa quả đầu và quả dị dạng'),
    (t, 6, '6', 'Thu hoạch', 'Thu quả liên tục 5–7 ngày một lần, bón nuôi quả, kiểm tra thời gian cách ly thuốc'),
    (t, 7, '7', 'Kết thúc vụ', 'Thu dọn cây, giàn dây, màng phủ, ống tưới và vệ sinh nhà màng');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Ươm cây con (ngày 1–35)
      (1,  1, 'seed_soaking',  1,  1,   null::int, 'normal', 'Ngâm ủ hạt giống cho nứt nanh.', 'Ngâm nước ấm khoảng 3–4 giờ rồi ủ ẩm nơi ấm. Ghi lô hạt giống, nguồn mua.', '[{"name":"Hạt giống ớt chuông"}]'),
      (2,  1, 'tray_sowing',   1,  2,   null, 'high',   'Gieo hạt vào khay giá thể; ghi lô hạt giống.', 'Gieo mỗi hốc 1 hạt, phủ nhẹ giá thể, giữ ẩm. Giá thể sạch, thoát nước tốt. Ớt chuông nảy mầm chậm hơn ớt cay, cần ấm.', '[{"name":"Giá thể gieo ươm"}]'),
      (3,  1, 'irrigation',    33, 3,   1,    'normal', 'Tưới nhẹ giữ ẩm đều cho cây con trong khay.', 'Tưới phun sương, không để khô rồi úng; che nắng gắt buổi trưa.', '[]'),
      (4,  1, 'fertilizing',   20, 15,  7,    'normal', 'Bón phân loãng cho cây con khi đã có lá thật.', 'Dùng phân tan hoàn toàn, pha loãng hơn hướng dẫn cho cây trưởng thành. EC thấp khoảng 0,8–1,2 mS/cm.', '[{"name":"Phân tan trong nước (loãng)"}]'),
      (5,  1, 'spraying',      20, 15,  7,    'normal', 'Phòng thối cổ rễ, chết cây con và bọ trĩ, rệp.', 'Ưu tiên chế phẩm sinh học. Ghi thuốc, liều và thời gian cách ly. Dùng khay, giá thể sạch để giảm bệnh.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 2. Chuẩn bị đất và luống (ngày 21–33, song song với ươm)
      (6,  2, 'bed_prep',      3,  21,  null, 'high',   'Cày xới sâu, nhặt cỏ và tàn dư vụ trước; đất tơi xốp, thoát nước tốt, pH khoảng 6,0–6,8.', 'Tránh đất vừa trồng cà chua, khoai tây, ớt, cà tím (dễ mang bệnh héo xanh). Đất chua thì bón vôi theo kết quả đo pH. Nên phơi đất vài ngày.', '[{"name":"Vôi bột (nếu đất chua)"}]'),
      (7,  2, 'fertilizing',   2,  24,  null, 'high',   'Bón lót phân hữu cơ hoai mục và phân lân, trộn đều với đất.', 'Dùng phân hữu cơ đã ủ hoai, không dùng phân tươi. Liều theo kết quả phân tích đất hoặc hướng dẫn của cán bộ khuyến nông.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân lân"}]'),
      (8,  2, 'bed_prep',      2,  26,  null, 'high',   'Lên luống cao khoảng 25–30 cm, mặt luống rộng khoảng 80–100 cm, rãnh thoát nước giữa các luống.', 'Mặt luống hơi vồng để nước không đọng. Luống cao giúp thoát nước, hạn chế thối rễ và héo xanh.', '[]'),
      (9,  2, 'mulching',      2,  28,  null, 'high',   'Lắp ống tưới nhỏ giọt rồi phủ màng phủ luống, đục lỗ trồng so le hai hàng.', 'Mỗi luống 1–2 dây tưới nhỏ giọt; kiểm tra đầu nhỏ giọt không tắc. Màng phủ giữ ẩm, hạn chế cỏ.', '[{"name":"Màng phủ luống"},{"name":"Ống tưới nhỏ giọt"}]'),
      (10, 2, 'irrigation',    2,  30,  null, 'normal', 'Tưới đẫm luống để đất đủ ẩm trước khi trồng; chạy thử hệ thống tưới.', 'Sửa chỗ rò rỉ.', '[]'),
      (11, 2, 'spraying',      1,  32,  null, 'normal', 'Xử lý đất, nấm bệnh trước khi trồng (chế phẩm sinh học hoặc thuốc theo quy định).', 'Có thể dùng chế phẩm vi sinh đối kháng. Ghi tên thuốc, liều, thời gian cách ly.', '[{"name":"Chế phẩm vi sinh / thuốc xử lý đất"}]'),
      -- 3. Trồng và hồi phục (ngày 36–55)
      (12, 3, 'transplanting', 3,  36,  null, 'high',   'Trồng cây con 4–6 lá thật, khỏe, sạch bệnh, vào lỗ so le hai hàng.', 'Khoảng cách khoảng 40–50 cm giữa các cây. Trồng chiều mát, tưới ngay sau trồng, không lấp quá cổ rễ. Ghi nguồn cây giống và số lượng.', '[{"name":"Cây ớt chuông giống"}]'),
      (13, 3, 'irrigation',    20, 36,  1,    'high',   'Tưới giữ ẩm đều 3 tuần đầu để cây bén rễ.', 'Tưới ngắn, nhiều lần trong ngày nếu nắng nóng; không để úng gốc.', '[]'),
      (14, 3, 'replanting',    5,  41,  null, 'low',    'Dặm cây chết hoặc yếu bằng cây cùng tuổi.', 'Dặm sớm trong 1 tuần đầu để cây đồng đều.', '[{"name":"Cây ớt chuông dự phòng"}]'),
      -- 4. Sinh trưởng (ngày 50–70)
      (15, 4, 'trellising',    45, 50,  10,   'normal', 'Cắm cọc hoặc căng dây, buộc thân lên giàn, 10 ngày kiểm tra và buộc lại một lần.', 'Ớt chuông quả nặng, thân giòn, dễ gãy; buộc lỏng tay, buộc từ sớm. Cần cho đến hết vụ thu.', '[{"name":"Cọc, dây buộc"}]'),
      (16, 4, 'irrigation',    15, 56,  1,    'high',   'Tưới nhỏ giọt hằng ngày theo độ ẩm đất.', 'Giữ đất ẩm đều, không khô rồi úng; thiếu nước dễ thối đít quả sau này.', '[]'),
      (17, 4, 'fertilizing',   15, 56,  7,    'high',   'Bón thúc qua nước tưới mỗi tuần, đạm và kali cân đối.', 'Phân tan hoàn toàn trong nước. EC dung dịch khoảng 1,5–2,0 mS/cm, pH 5,8–6,5; ghi EC và pH. Liều theo hướng dẫn nhà sản xuất.', '[{"name":"Phân tan trong nước (NPK cân đối)"}]'),
      (18, 4, 'pruning',       15, 56,  7,    'normal', 'Tỉa chồi nách dưới điểm phân nhánh chữ Y, tỉa lá gốc già, lá vàng, giữ khoảng 2–4 thân chính.', 'Vườn thông thoáng ít bệnh hơn. Đem bỏ lá, cành bệnh ra khỏi vườn. Tỉa vào lúc khô ráo, dụng cụ sạch.', '[]'),
      (19, 4, 'spraying',      15, 56,  7,    'normal', 'Phun phòng rầy, rệp, bọ trĩ, nhện đỏ và bệnh phấn trắng, thán thư, héo xanh.', 'Ưu tiên biện pháp sinh học, luân phiên hoạt chất để tránh kháng thuốc. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 5. Ra hoa, đậu quả (ngày 71–100)
      (20, 5, 'irrigation',    30, 71,  1,    'high',   'Tưới đều, không để khô khi ra hoa, không úng gốc.', 'Thiếu nước rồi tưới ào ạt làm rụng hoa, nứt quả và thối đít quả.', '[]'),
      (21, 5, 'fertilizing',   30, 71,  7,    'high',   'Chuyển sang bón nhiều kali, bổ sung canxi và bo, giảm đạm.', 'Canxi giúp phòng thối đít quả; bo giúp đậu quả. EC khoảng 1,8–2,5 mS/cm; ghi EC và pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo"}]'),
      (22, 5, 'pollination',   30, 71,  2,    'normal', 'Hỗ trợ thụ phấn trong nhà màng: rung nhẹ cây hoặc thả ong.', 'Nhiệt độ quá cao (trên khoảng 32 °C) hoặc quá thấp làm rụng hoa. Không phun thuốc độc với ong khi đang có hoa.', '[]'),
      (23, 5, 'pruning',       30, 71,  7,    'normal', 'Tỉa bỏ hoa, quả đầu tiên ở các đốt thấp để cây khỏe; tỉa quả dị dạng, chồi nách.', 'Mỗi cây chỉ giữ số quả vừa đủ để quả to đều. Chồi nách tiếp tục tỉa hằng tuần.', '[]'),
      (24, 5, 'spraying',      30, 71,  7,    'high',   'Phun phòng bệnh và sâu hại: bọ trĩ, rệp, sâu đục quả, thán thư, thối quả.', 'Kiểm tra thời gian cách ly trước khi thu. Chỉ dùng thuốc được phép trên ớt chuông.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 6. Thu hoạch (ngày 101–200)
      (25, 6, 'harvesting',    100, 101, 5,   'high',   'Thu quả đạt kích cỡ, bóng; 5–7 ngày thu một lần. Giống sô-cô-la thu khi vỏ chuyển hẳn sang nâu sô-cô-la.', 'Cắt cả cuống bằng kéo sạch, nhẹ tay. Thu quả xanh sớm thì cây ra nhiều quả hơn nhưng ít ngọt; để chín màu sô-cô-la, đỏ, vàng thì lâu hơn khoảng 2–3 tuần và ngọt hơn. Ghi khối lượng, phân loại, nơi nhận. Kiểm tra hết thời gian cách ly thuốc trước khi thu.', '[{"name":"Thùng, khay đựng quả"}]'),
      (26, 6, 'irrigation',    100, 101, 1,   'high',   'Tưới nhỏ giọt hằng ngày; ít hơn khi trời lạnh, nhiều hơn khi nắng nóng.', null, '[]'),
      (27, 6, 'fertilizing',   100, 101, 7,   'high',   'Bón nuôi quả mỗi tuần qua nước tưới, giữ tỷ lệ kali, canxi cao.', 'Giảm hoặc ngừng bón khi cuối vụ, cây yếu. Ghi EC, pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo"}]'),
      (28, 6, 'pruning',       100, 101, 7,   'normal', 'Tỉa chồi nách, lá già, lá bệnh và nhặt quả thối, quả hỏng ra khỏi vườn.', 'Quả thối để lại là nguồn lây bệnh rất nhanh.', '[]'),
      (29, 6, 'spraying',      100, 101, 10,  'normal', 'Phun phòng bệnh, sâu hại khi cần; chọn thuốc cách ly ngắn.', 'Phun sau khi thu hoạch trong ngày, không phun sát ngày thu. Ghi thuốc, liều, ngày cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 7. Kết thúc vụ (ngày 201–205)
      (30, 7, 'other',         5,  201, null, 'normal', 'Thu dọn cây tàn, giàn dây, màng phủ, ống tưới; đem bỏ cây bệnh, vệ sinh nhà màng.', 'Không để tàn dư cây bệnh trong vườn. Nên luân canh hoặc xử lý đất trước vụ sau.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
