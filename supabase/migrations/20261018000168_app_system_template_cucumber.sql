-- Mẫu quy trình hệ thống: DƯA CHUỘT (dưa leo) trồng nhà màng, luống phủ màng, tưới nhỏ giọt, leo giàn dây (bản tham khảo).
-- Ươm cây con khoảng 14 ngày, trồng, thu quả liên tục khoảng 48 ngày; tổng khoảng 104 ngày. Việc ươm và chuẩn bị đất chạy song song; từ đó các việc chăm sóc chạy song song và lặp lại theo chu kỳ.
-- Giống dưa chuột Nhật, Hà Lan trồng nhà màng thường tự đậu quả không cần thụ phấn (việc Thụ phấn để mức thấp, bỏ qua nếu giống tự đậu quả). Số ngày, chu kỳ và việc là bản nháp theo kỹ thuật phổ biến, cần đối chiếu với giống, vùng trồng và cán bộ khuyến nông. Liều phân, thuốc KHÔNG cài cứng.
insert into crop_types (code, name) values ('cucumber', 'Dưa chuột')
on conflict (code) where organization_id is null do nothing;

do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'cucumber_greenhouse') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('cucumber_greenhouse', 'crop', (select id from crop_types where organization_id is null and code = 'cucumber'),
            'Dưa chuột (dưa leo) nhà màng, giàn dây (bản tham khảo)',
            'Quy trình trồng dưa chuột trong nhà màng, luống phủ màng, tưới nhỏ giọt kết hợp bón phân qua nước, leo giàn dây, 7 công đoạn, khoảng 104 ngày (ươm cây con 14 ngày, thu quả liên tục khoảng 48 ngày). Việc ươm cây con và chuẩn bị đất chạy song song; các việc tưới, bón, tỉa nhánh, dẫn dây, phun phòng bệnh lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu với giống, vùng trồng và kỹ thuật của vườn rồi chỉnh lại.',
            'Tham khảo kỹ thuật trồng dưa chuột nhà màng phổ biến; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Ươm cây con', 'Ngâm ủ, gieo hạt vào khay, chăm cây con khoảng 14 ngày đến khi có 2–3 lá thật'),
    (t, 2, '2', 'Chuẩn bị đất và giàn', 'Làm đất, bón lót, lên luống, phủ màng, lắp ống tưới, dựng giàn; làm song song lúc cây con còn trong khay'),
    (t, 3, '3', 'Trồng và hồi phục', 'Ra cây con vào luống, tưới giữ ẩm, dặm cây chết'),
    (t, 4, '4', 'Sinh trưởng và leo giàn', 'Cây vươn dây leo: dẫn dây lên giàn, tỉa nhánh bên thấp, bón thúc, phòng bệnh lá'),
    (t, 5, '5', 'Ra hoa, đậu quả', 'Chuyển bón nhiều kali, tỉa quả đầu và quả dị dạng, phòng sương mai, phấn trắng'),
    (t, 6, '6', 'Thu hoạch', 'Thu quả non hằng ngày hoặc cách ngày, bón nuôi quả, kiểm tra thời gian cách ly thuốc'),
    (t, 7, '7', 'Kết thúc vụ', 'Thu dọn cây, giàn dây, màng phủ, ống tưới và vệ sinh nhà màng');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Ươm cây con (ngày 1–14)
      (1,  1, 'seed_soaking',   1,  1,   null::int, 'normal', 'Ngâm ủ hạt giống cho nứt nanh.', 'Ngâm nước ấm khoảng 3–4 giờ rồi ủ ẩm nơi ấm. Ghi lô hạt giống, nguồn mua.', '[{"name":"Hạt giống dưa chuột"}]'),
      (2,  1, 'tray_sowing',    1,  2,   null, 'high',   'Gieo hạt vào khay giá thể; ghi lô hạt giống.', 'Gieo mỗi hốc 1 hạt, phủ nhẹ giá thể, giữ ẩm. Giá thể và khay sạch để giảm bệnh cây con.', '[{"name":"Giá thể gieo ươm"}]'),
      (3,  1, 'irrigation',     11, 3,   1,    'normal', 'Tưới nhẹ giữ ẩm đều cho cây con trong khay.', 'Tưới phun sương, không để khô rồi úng; che nắng gắt buổi trưa.', '[]'),
      (4,  1, 'spraying',       6,  9,   5,    'normal', 'Phòng thối cổ rễ, chết cây con và rệp, bọ trĩ.', 'Ưu tiên chế phẩm sinh học. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 2. Chuẩn bị đất và giàn (ngày 3–14, song song với ươm)
      (5,  2, 'bed_prep',       3,  3,   null, 'high',   'Cày xới sâu, phơi đất, nhặt cỏ và tàn dư vụ trước; pH khoảng 6,0–6,8.', 'Tránh đất vừa trồng bầu bí, dưa các loại (dễ mang bệnh héo, thối thân). Đất chua thì bón vôi theo kết quả đo pH.', '[{"name":"Vôi bột (nếu đất chua)"}]'),
      (6,  2, 'fertilizing',    2,  6,   null, 'high',   'Bón lót phân hữu cơ hoai mục và phân lân, trộn đều với đất.', 'Dùng phân hữu cơ đã ủ hoai, không dùng phân tươi. Liều theo kết quả phân tích đất hoặc hướng dẫn của cán bộ khuyến nông.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân lân"}]'),
      (7,  2, 'bed_prep',       2,  8,   null, 'high',   'Lên luống cao khoảng 25–30 cm, mặt luống rộng khoảng 80–100 cm, rãnh thoát nước.', 'Luống cao giúp thoát nước, hạn chế thối rễ và thối thân.', '[]'),
      (8,  2, 'mulching',       2,  10,  null, 'high',   'Lắp ống tưới nhỏ giọt rồi phủ màng phủ luống, đục lỗ trồng so le hai hàng.', 'Mỗi luống 1–2 dây tưới nhỏ giọt; kiểm tra đầu nhỏ giọt không tắc.', '[{"name":"Màng phủ luống"},{"name":"Ống tưới nhỏ giọt"}]'),
      (9,  2, 'trellising',     2,  12,  null, 'high',   'Dựng giàn: cọc hoặc dây thép/lưới giàn thẳng đứng dọc luống.', 'Giàn chắc, cao khoảng 2 m. Dưa chuột leo nhanh, quả nặng dần nên cần giàn vững.', '[{"name":"Cọc, dây hoặc lưới giàn"}]'),
      (10, 2, 'irrigation',     1,  13,  null, 'normal', 'Tưới đẫm luống trước khi trồng; chạy thử hệ thống tưới.', 'Sửa chỗ rò rỉ.', '[]'),
      (11, 2, 'spraying',       1,  14,  null, 'normal', 'Xử lý đất, nấm bệnh trước khi trồng (chế phẩm sinh học hoặc thuốc theo quy định).', 'Có thể dùng chế phẩm vi sinh đối kháng. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Chế phẩm vi sinh / thuốc xử lý đất"}]'),
      -- 3. Trồng và hồi phục (ngày 15–28)
      (12, 3, 'transplanting',  2,  15,  null, 'high',   'Trồng cây con 2–3 lá thật, khỏe, sạch bệnh, vào lỗ so le hai hàng.', 'Khoảng cách cây khoảng 40–50 cm. Trồng chiều mát, tưới ngay sau trồng, không làm đứt rễ. Ghi nguồn cây giống và số lượng.', '[{"name":"Cây dưa chuột giống"}]'),
      (13, 3, 'irrigation',     14, 15,  1,    'high',   'Tưới giữ ẩm đều 2 tuần đầu để cây bén rễ.', 'Tưới ngắn, nhiều lần trong ngày nếu nắng nóng; không để úng gốc.', '[]'),
      (14, 3, 'replanting',     4,  18,  null, 'low',    'Dặm cây chết hoặc yếu bằng cây cùng tuổi.', 'Dặm sớm trong 1 tuần đầu để cây đồng đều.', '[{"name":"Cây dưa chuột dự phòng"}]'),
      -- 4. Sinh trưởng và leo giàn (ngày 29–42)
      (15, 4, 'irrigation',     14, 29,  1,    'high',   'Tưới nhỏ giọt hằng ngày theo độ ẩm đất.', 'Giữ đất ẩm đều; dưa chuột cần nhiều nước, thiếu nước làm quả đắng và méo.', '[]'),
      (16, 4, 'fertilizing',    14, 29,  7,    'high',   'Bón thúc qua nước tưới mỗi tuần, đạm và kali cân đối.', 'Phân tan hoàn toàn trong nước. EC khoảng 1,5–2,0 mS/cm, pH 5,8–6,5; ghi EC và pH. Liều theo hướng dẫn nhà sản xuất.', '[{"name":"Phân tan trong nước (NPK cân đối)"}]'),
      (17, 4, 'pruning',        14, 29,  4,    'high',   'Tỉa bỏ nhánh bên và quả ở các đốt thấp (dưới khoảng 40–50 cm), giữ 1 thân chính.', 'Tỉa lúc nhánh còn nhỏ, vết cắt nhỏ ít nhiễm bệnh. Tỉa lá gốc già, lá vàng cho thoáng gốc. Đem bỏ lá, nhánh bệnh ra khỏi vườn.', '[]'),
      (18, 4, 'trellising',     14, 29,  3,    'normal', 'Dẫn và buộc thân lên giàn 3 ngày một lần theo chiều cao cây.', 'Buộc lỏng tay, buộc dưới đốt, không siết vào thân. Xoay dây theo chiều giàn.', '[{"name":"Dây buộc, kẹp"}]'),
      (19, 4, 'spraying',       14, 29,  7,    'normal', 'Phun phòng sương mai, phấn trắng, thán thư; rệp, bọ trĩ, nhện đỏ, ruồi đục lá.', 'Ưu tiên biện pháp sinh học, luân phiên hoạt chất để tránh kháng thuốc. Bọ trĩ, rệp truyền virus khảm. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 5. Ra hoa, đậu quả (ngày 43–52)
      (20, 5, 'irrigation',     10, 43,  1,    'high',   'Tưới đều, không để khô khi ra hoa, không úng gốc.', 'Tưới thất thường làm rụng hoa, quả méo, quả đắng.', '[]'),
      (21, 5, 'fertilizing',    10, 43,  7,    'high',   'Chuyển sang bón nhiều kali, bổ sung canxi, giảm đạm.', 'Kali giúp quả chắc, đẹp; canxi giúp giảm thối đầu quả. EC khoảng 1,8–2,3 mS/cm; ghi EC và pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo"}]'),
      (22, 5, 'pollination',    10, 43,  2,    'low',    'Chỉ làm nếu giống không tự đậu quả: rung nhẹ giàn hoặc thả ong.', 'Giống dưa chuột Nhật, Hà Lan đơn tính cái thường tự đậu quả, bỏ qua việc này. Không phun thuốc độc với ong khi đang có hoa.', '[]'),
      (23, 5, 'pruning',        10, 43,  4,    'normal', 'Tiếp tục tỉa nhánh bên, lá gốc già; tỉa bỏ quả đầu và quả dị dạng.', 'Quả đầu tiên nên bỏ sớm để cây khỏe. Giữ vườn thông thoáng để giảm sương mai và phấn trắng.', '[]'),
      (24, 5, 'spraying',       10, 43,  7,    'high',   'Phun phòng sương mai, phấn trắng; bọ trĩ, rệp, nhện đỏ.', 'Kiểm tra thời gian cách ly trước khi thu. Chỉ dùng thuốc được phép trên dưa chuột.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 6. Thu hoạch (ngày 53–100)
      (25, 6, 'harvesting',     48, 53,  2,    'high',   'Thu quả đạt kích cỡ theo giống, còn non, vỏ bóng; hằng ngày hoặc cách ngày.', 'Dùng kéo sạch cắt cả cuống, nhẹ tay, tránh dập. Thu đúng cỡ để cây tiếp tục ra quả; để già quả làm cây kiệt. Phân loại theo kích cỡ, hình dáng; ghi khối lượng và nơi nhận. Kiểm tra hết thời gian cách ly thuốc trước khi thu.', '[{"name":"Thùng, khay đựng quả"}]'),
      (26, 6, 'irrigation',     48, 53,  1,    'high',   'Tưới nhỏ giọt hằng ngày; ít hơn khi trời lạnh, nhiều hơn khi nắng nóng.', null, '[]'),
      (27, 6, 'fertilizing',    48, 53,  7,    'high',   'Bón nuôi quả mỗi tuần qua nước tưới, giữ tỷ lệ kali cao.', 'Giảm hoặc ngừng bón khi cuối vụ, cây yếu. Ghi EC, pH.', '[{"name":"Phân tan nhiều kali"}]'),
      (28, 6, 'pruning',        48, 53,  4,    'normal', 'Tỉa lá gốc già, nhánh bên, nhặt quả hỏng, quả thối ra khỏi vườn; bấm ngọn khi cây chạm đỉnh giàn.', 'Quả hỏng để lại là nguồn lây bệnh. Bấm ngọn khi dây leo hết chiều cao giàn để cây ra nhánh quả.', '[]'),
      (29, 6, 'trellising',     48, 53,  4,    'normal', 'Tiếp tục dẫn và buộc dây lên giàn, hạ dây khi cần.', null, '[{"name":"Dây buộc, kẹp"}]'),
      (30, 6, 'spraying',       48, 53,  10,   'normal', 'Phun phòng bệnh, sâu hại khi cần; chọn thuốc cách ly ngắn.', 'Phun sau khi thu hoạch trong ngày, không phun sát ngày thu. Ghi thuốc, liều, ngày cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 7. Kết thúc vụ (ngày 101–104)
      (31, 7, 'other',          4,  101, null, 'normal', 'Thu dọn cây tàn, giàn dây, màng phủ, ống tưới; đem bỏ cây bệnh, vệ sinh nhà màng.', 'Không để tàn dư cây bệnh trong vườn. Nên luân canh hoặc xử lý đất trước vụ sau.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
