-- Mẫu quy trình hệ thống: CÀ CHUA BI trồng nhà màng, luống phủ màng, tưới nhỏ giọt, giàn dây, giống sinh trưởng vô hạn (bản tham khảo).
-- Ươm cây con khoảng 25 ngày, trồng, thu quả liên tục khoảng 90 ngày; tổng khoảng 180 ngày. Việc ươm và chuẩn bị đất chạy song song; từ đó các việc chăm sóc chạy song song và lặp lại theo chu kỳ.
-- Giống sinh trưởng hữu hạn (thấp, không cần giàn cao) thì bỏ bớt việc tỉa chồi nách và buộc dây. Số ngày, chu kỳ và việc là bản nháp theo kỹ thuật phổ biến, cần đối chiếu với giống, vùng trồng và cán bộ khuyến nông. Liều phân, thuốc KHÔNG cài cứng.
insert into crop_types (code, name) values ('cherry_tomato', 'Cà chua bi')
on conflict (code) where organization_id is null do nothing;

do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'cherry_tomato_greenhouse') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('cherry_tomato_greenhouse', 'crop', (select id from crop_types where organization_id is null and code = 'cherry_tomato'),
            'Cà chua bi nhà màng, giàn dây (bản tham khảo)',
            'Quy trình trồng cà chua bi sinh trưởng vô hạn trong nhà màng, luống phủ màng, tưới nhỏ giọt kết hợp bón phân qua nước, có giàn dây, 7 công đoạn, khoảng 180 ngày (ươm cây con 25 ngày, thu quả liên tục khoảng 90 ngày). Việc ươm cây con và chuẩn bị đất chạy song song; các việc tưới, bón, tỉa chồi, buộc dây, phun phòng bệnh lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu với giống, vùng trồng và kỹ thuật của vườn rồi chỉnh lại.',
            'Tham khảo kỹ thuật trồng cà chua bi nhà màng phổ biến và khuyến cáo IPM; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Ươm cây con', 'Ngâm ủ, gieo hạt vào khay, chăm cây con khoảng 25 ngày đến khi có 4–5 lá thật (hoặc dùng cây ghép mua sẵn)'),
    (t, 2, '2', 'Chuẩn bị đất và giàn', 'Phơi đất, bón lót, lên luống, phủ màng, lắp ống tưới, dựng giàn dây; làm song song lúc cây con còn trong khay'),
    (t, 3, '3', 'Trồng và hồi phục', 'Ra cây con vào luống, tưới giữ ẩm, dặm cây chết, buộc dây đầu tiên'),
    (t, 4, '4', 'Sinh trưởng', 'Cây vươn thân lá: tỉa chồi nách, buộc dây lên giàn, bón thúc, phòng bệnh lá và héo'),
    (t, 5, '5', 'Ra hoa, đậu quả', 'Hỗ trợ thụ phấn, chuyển bón nhiều kali và canxi, tỉa chồi và lá gốc, phòng sương mai, thối quả'),
    (t, 6, '6', 'Thu hoạch', 'Thu quả chín đỏ 2–3 ngày một lần, bón nuôi quả, kiểm tra thời gian cách ly thuốc'),
    (t, 7, '7', 'Kết thúc vụ', 'Thu dọn cây, giàn dây, màng phủ, ống tưới và vệ sinh nhà màng');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Ươm cây con (ngày 1–25)
      (1,  1, 'seed_soaking',   1,  1,   null::int, 'normal', 'Ngâm ủ hạt giống cho nứt nanh.', 'Ngâm nước ấm khoảng 3–4 giờ rồi ủ ẩm nơi ấm. Ghi lô hạt giống, nguồn mua. Nếu mua cây ghép sẵn (ghép gốc cà tím giảm héo xanh) thì bỏ qua công đoạn này.', '[{"name":"Hạt giống cà chua bi"}]'),
      (2,  1, 'tray_sowing',    1,  2,   null, 'high',   'Gieo hạt vào khay giá thể; ghi lô hạt giống.', 'Gieo mỗi hốc 1 hạt, phủ nhẹ giá thể, giữ ẩm. Giá thể và khay sạch để giảm bệnh cây con.', '[{"name":"Giá thể gieo ươm"}]'),
      (3,  1, 'irrigation',     23, 3,   1,    'normal', 'Tưới nhẹ giữ ẩm đều cho cây con trong khay.', 'Tưới phun sương, không để khô rồi úng; che nắng gắt buổi trưa.', '[]'),
      (4,  1, 'fertilizing',    12, 14,  7,    'normal', 'Bón phân loãng cho cây con khi đã có lá thật.', 'Dùng phân tan hoàn toàn, pha loãng hơn hướng dẫn cho cây trưởng thành. EC thấp khoảng 0,8–1,2 mS/cm.', '[{"name":"Phân tan trong nước (loãng)"}]'),
      (5,  1, 'spraying',       12, 14,  7,    'normal', 'Phòng thối cổ rễ, chết cây con và rệp, bọ phấn.', 'Ưu tiên chế phẩm sinh học. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 2. Chuẩn bị đất và giàn (ngày 12–24, song song với ươm)
      (6,  2, 'bed_prep',       3,  12,  null, 'high',   'Cày xới sâu, phơi ải đất, nhặt cỏ và tàn dư vụ trước; pH khoảng 6,0–6,8.', 'Phơi ải hoặc ngâm đất để diệt mầm bệnh, trứng và nhộng trong đất. Tránh đất vừa trồng cà chua, ớt, khoai tây, cà tím (dễ mang bệnh héo xanh). Đất chua thì bón vôi theo kết quả đo pH.', '[{"name":"Vôi bột (nếu đất chua)"}]'),
      (7,  2, 'fertilizing',    2,  15,  null, 'high',   'Bón lót phân hữu cơ hoai mục và phân lân, trộn đều với đất.', 'Dùng phân hữu cơ đã ủ hoai, không dùng phân tươi. Liều theo kết quả phân tích đất hoặc hướng dẫn của cán bộ khuyến nông.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân lân"}]'),
      (8,  2, 'bed_prep',       2,  17,  null, 'high',   'Lên luống cao khoảng 25–30 cm, mặt luống rộng khoảng 80–100 cm, rãnh thoát nước.', 'Luống cao giúp thoát nước, hạn chế thối rễ và héo xanh.', '[]'),
      (9,  2, 'mulching',       2,  19,  null, 'high',   'Lắp ống tưới nhỏ giọt rồi phủ màng phủ luống, đục lỗ trồng so le hai hàng.', 'Mỗi luống 1–2 dây tưới nhỏ giọt; kiểm tra đầu nhỏ giọt không tắc.', '[{"name":"Màng phủ luống"},{"name":"Ống tưới nhỏ giọt"}]'),
      (10, 2, 'trellising',     3,  21,  null, 'high',   'Dựng giàn: cọc hoặc dây thép/dây giàn kéo thẳng đứng dọc luống.', 'Giàn chắc, đủ cao cho cây leo đến khoảng 2 m trở lên; cà chua bi sinh trưởng vô hạn sẽ rất cao và nặng.', '[{"name":"Cọc, dây giàn"}]'),
      (11, 2, 'irrigation',     1,  23,  null, 'normal', 'Tưới đẫm luống trước khi trồng; chạy thử hệ thống tưới.', 'Sửa chỗ rò rỉ.', '[]'),
      (12, 2, 'spraying',       1,  24,  null, 'normal', 'Xử lý đất, nấm bệnh trước khi trồng (chế phẩm sinh học hoặc thuốc theo quy định).', 'Có thể dùng chế phẩm vi sinh đối kháng. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Chế phẩm vi sinh / thuốc xử lý đất"}]'),
      -- 3. Trồng và hồi phục (ngày 26–45)
      (13, 3, 'transplanting',  3,  26,  null, 'high',   'Trồng cây con 4–5 lá thật, khỏe, sạch bệnh, vào lỗ so le hai hàng.', 'Khoảng cách cây khoảng 40–50 cm. Trồng chiều mát, tưới ngay sau trồng. Ghi nguồn cây giống và số lượng.', '[{"name":"Cây cà chua bi giống"}]'),
      (14, 3, 'irrigation',     20, 26,  1,    'high',   'Tưới giữ ẩm đều 3 tuần đầu để cây bén rễ.', 'Tưới ngắn, nhiều lần trong ngày nếu nắng nóng; không để úng gốc.', '[]'),
      (15, 3, 'replanting',     5,  31,  null, 'low',    'Dặm cây chết hoặc yếu bằng cây cùng tuổi.', 'Dặm sớm trong 1 tuần đầu để cây đồng đều.', '[{"name":"Cây cà chua bi dự phòng"}]'),
      (16, 3, 'trellising',     8,  38,  4,    'normal', 'Buộc thân cây đầu tiên vào giàn, 4 ngày buộc lại một lần.', 'Buộc lỏng tay, không siết vào thân.', '[{"name":"Dây buộc"}]'),
      -- 4. Sinh trưởng (ngày 46–60)
      (17, 4, 'irrigation',     15, 46,  1,    'high',   'Tưới nhỏ giọt hằng ngày theo độ ẩm đất.', 'Giữ đất ẩm đều, không khô rồi úng; tưới thất thường dễ nứt quả và thối đít quả về sau.', '[]'),
      (18, 4, 'fertilizing',    15, 46,  7,    'high',   'Bón thúc qua nước tưới mỗi tuần, đạm và kali cân đối.', 'Phân tan hoàn toàn trong nước. EC khoảng 1,5–2,0 mS/cm, pH 5,8–6,5; ghi EC và pH. Liều theo hướng dẫn nhà sản xuất.', '[{"name":"Phân tan trong nước (NPK cân đối)"}]'),
      (19, 4, 'pruning',        15, 46,  5,    'high',   'Tỉa chồi nách mỗi 5 ngày, bẻ chồi non bằng tay; tỉa lá gốc già, lá vàng.', 'Giống sinh trưởng vô hạn thường để 1 thân chính. Bẻ chồi lúc còn nhỏ, vết cắt nhỏ ít nhiễm bệnh. Giống sinh trưởng hữu hạn thì bỏ bước này.', '[]'),
      (20, 4, 'trellising',     15, 46,  7,    'normal', 'Quấn hoặc buộc thân lên giàn mỗi tuần theo chiều cao cây.', 'Buộc dưới chùm quả; cây cao thì hạ dây hoặc xoay dây theo kỹ thuật của giàn.', '[{"name":"Dây buộc"}]'),
      (21, 4, 'spraying',       15, 46,  7,    'normal', 'Phun phòng sương mai, mốc sương, đốm lá; rầy, bọ phấn, nhện, sâu xanh.', 'Ưu tiên biện pháp sinh học và quản lý dịch hại tổng hợp (IPM); luân phiên hoạt chất để tránh kháng thuốc. Ghi thuốc, liều, thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 5. Ra hoa, đậu quả (ngày 61–85)
      (22, 5, 'irrigation',     25, 61,  1,    'high',   'Tưới đều, không để khô khi ra hoa, không úng gốc.', 'Tưới thất thường làm rụng hoa, nứt quả, thối đít quả.', '[]'),
      (23, 5, 'fertilizing',    25, 61,  7,    'high',   'Chuyển sang bón nhiều kali, bổ sung canxi và bo, giảm đạm.', 'Kali và canxi giúp đậu quả nhiều, hạn chế rụng hoa non và thối đít quả. EC khoảng 1,8–2,5 mS/cm; ghi EC và pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo"}]'),
      (24, 5, 'pollination',    25, 61,  2,    'normal', 'Hỗ trợ thụ phấn trong nhà màng: rung nhẹ giàn/chùm hoa vào buổi sáng, hoặc thả ong.', 'Nhiệt độ quá cao (trên khoảng 32 °C) hoặc ẩm quá làm hạt phấn kém, rụng hoa. Không phun thuốc độc với ong khi đang có hoa.', '[]'),
      (25, 5, 'pruning',        25, 61,  5,    'high',   'Tiếp tục tỉa chồi nách, tỉa lá gốc già; tỉa bớt quả dị dạng.', 'Giữ vườn thông thoáng để giảm sương mai, mốc xám. Đem bỏ lá, chồi bệnh ra khỏi vườn.', '[]'),
      (26, 5, 'spraying',       25, 61,  7,    'high',   'Phun phòng sương mai, mốc sương, thối quả; rầy, bọ phấn, ruồi đục quả, sâu đục quả.', 'Kiểm tra thời gian cách ly trước khi thu. Chỉ dùng thuốc được phép trên cà chua.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 6. Thu hoạch (ngày 86–175)
      (27, 6, 'harvesting',     90, 86,  2,    'high',   'Thu quả chín đỏ đều, 2–3 ngày một lần, hái cả chùm hoặc từng quả theo yêu cầu.', 'Từ chín xanh đến chín đỏ khoảng 10–12 ngày; thu vào sáng sớm, nhẹ tay, tránh dập. Phân loại theo kích cỡ, màu sắc; ghi khối lượng, nơi nhận. Kiểm tra hết thời gian cách ly thuốc trước khi thu.', '[{"name":"Khay, hộp đựng quả"}]'),
      (28, 6, 'irrigation',     90, 86,  1,    'high',   'Tưới nhỏ giọt hằng ngày; ít hơn khi trời lạnh, nhiều hơn khi nắng nóng.', null, '[]'),
      (29, 6, 'fertilizing',    90, 86,  7,    'high',   'Bón nuôi quả mỗi tuần qua nước tưới, giữ tỷ lệ kali, canxi cao.', 'Giảm hoặc ngừng bón khi cuối vụ, cây yếu. Ghi EC, pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo"}]'),
      (30, 6, 'pruning',        90, 86,  5,    'normal', 'Tỉa lá gốc già, chồi nách, nhặt quả thối ra khỏi vườn; gần cuối vụ bấm ngọn để quả to đều.', 'Quả thối để lại là nguồn lây bệnh rất nhanh. Bấm ngọn khi gần hết thời gian thu hoạch dự kiến.', '[]'),
      (31, 6, 'spraying',       90, 86,  10,   'normal', 'Phun phòng bệnh, sâu hại khi cần; chọn thuốc cách ly ngắn.', 'Phun sau khi thu hoạch trong ngày, không phun sát ngày thu. Ghi thuốc, liều, ngày cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 7. Kết thúc vụ (ngày 176–180)
      (32, 7, 'other',          5,  176, null, 'normal', 'Thu dọn cây tàn, giàn dây, màng phủ, ống tưới; đem bỏ cây bệnh, vệ sinh nhà màng.', 'Không để tàn dư cây bệnh trong vườn. Nên luân canh hoặc xử lý đất trước vụ sau.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
