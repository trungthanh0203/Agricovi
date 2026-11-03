-- Mẫu quy trình hệ thống: DÂU TÂY trồng luống phủ màng, tưới nhỏ giọt (bản tham khảo, vùng cao như Đà Lạt, Mộc Châu).
-- Thêm sản phẩm dùng chung "Dâu tây" và hai việc cây trồng còn thiếu: Làm đất, lên luống; Phủ màng, lắp ống tưới (biểu mẫu chuẩn nằm ở app, standardFields.ts).
-- Cây con trồng khoảng tháng 9–10, thu quả liên tục khoảng 3 tháng; tổng khoảng 184 ngày. Chuẩn bị đất nối tiếp 14 ngày, từ đó các việc chăm sóc chạy song song và lặp lại theo chu kỳ.
-- Số ngày, chu kỳ và việc là bản nháp theo kỹ thuật phổ biến, cần đối chiếu với vườn và cán bộ khuyến nông. Liều phân, thuốc KHÔNG cài cứng.
insert into crop_types (code, name) values ('strawberry', 'Dâu tây')
on conflict (code) where organization_id is null do nothing;

insert into work_types (code, name, field_schema, applies_to) values
  ('bed_prep', 'Làm đất, lên luống',      '[]', array['crop']),
  ('mulching', 'Phủ màng, lắp ống tưới',  '[]', array['crop'])
on conflict (code) where organization_id is null do nothing;

do $$
declare t uuid;
begin
  if exists (select 1 from system_templates where code = 'strawberry_mulch_drip') then return; end if;
  insert into system_templates (code, kind, crop_type_id, name, description, source)
    values ('strawberry_mulch_drip', 'crop', (select id from crop_types where organization_id is null and code = 'strawberry'),
            'Dâu tây luống phủ màng, tưới nhỏ giọt (bản tham khảo)',
            'Quy trình trồng dâu tây trên luống cao phủ màng, tưới nhỏ giọt kết hợp bón phân qua nước, 6 công đoạn, khoảng 184 ngày (chuẩn bị đất 14 ngày, trồng và hồi phục, sinh trưởng, ra hoa đậu quả, thu hoạch khoảng 100 ngày, kết thúc vụ). Các việc tưới, bón, tỉa, phun phòng bệnh chạy song song và lặp lại theo chu kỳ. Bản tham khảo: hãy đối chiếu với giống, vùng trồng và kỹ thuật của vườn rồi chỉnh lại.',
            'Tham khảo kỹ thuật trồng dâu tây phổ biến (luống phủ màng, tưới nhỏ giọt) và thực tế vùng dâu Lâm Đồng, Sơn La; số ngày là bản nháp')
    returning id into t;

  insert into system_template_phases (system_template_id, seq, code, name, description) values
    (t, 1, '1', 'Chuẩn bị đất và luống', 'Làm đất, bón lót, lên luống, phủ màng, lắp ống tưới và xử lý đất trước khi trồng'),
    (t, 2, '2', 'Trồng và hồi phục', 'Trồng cây con sạch bệnh, tưới giữ ẩm, dặm cây chết, bỏ hoa đầu cho cây khỏe'),
    (t, 3, '3', 'Sinh trưởng', 'Cây ra lá, ra rễ; bón thúc đạm-lân, tỉa lá già, cắt tua, phòng bệnh lá'),
    (t, 4, '4', 'Ra hoa, đậu quả', 'Thụ phấn, chuyển bón nhiều kali, tỉa hoa quả dị dạng, phòng mốc xám và phấn trắng'),
    (t, 5, '5', 'Thu hoạch', 'Thu quả chín đỏ 2–3 ngày một lần, bón nuôi quả, kiểm tra thời gian cách ly thuốc'),
    (t, 6, '6', 'Kết thúc vụ', 'Thu dọn cây, màng phủ, ống tưới và vệ sinh vườn');

  insert into system_template_stages (system_template_id, phase_id, seq, work_type_id, duration_days, start_day, repeat_every_days, importance, note, guide, materials)
  select t, (select id from system_template_phases ph where ph.system_template_id = t and ph.seq = v.phase_seq),
         v.seq, (select id from work_types where organization_id is null and code = v.wcode), v.days, v.start_day, v.rep, v.imp, v.note, v.guide, v.mats::jsonb
    from (values
      -- 1. Chuẩn bị đất và luống (nối tiếp: ngày 1–14)
      (1,  1, 'bed_prep',     3, null::int, null::int, 'high',   'Cày xới sâu, nhặt cỏ và tàn dư vụ trước; đất tơi xốp, thoát nước tốt, pH khoảng 5,5–6,5.', 'Nên phơi đất vài ngày. Đất chua thì bón vôi theo kết quả đo pH. Tránh đất vừa trồng cà chua, khoai tây, ớt (dễ mang bệnh héo).', '[{"name":"Vôi bột (nếu đất chua)"}]'),
      (2,  1, 'fertilizing',  2, null, null, 'high',   'Bón lót phân hữu cơ hoai mục và phân lân, trộn đều với đất.', 'Dùng phân hữu cơ đã ủ hoai, không dùng phân tươi. Liều theo kết quả phân tích đất hoặc hướng dẫn của cán bộ khuyến nông.', '[{"name":"Phân hữu cơ hoai mục"},{"name":"Phân lân"}]'),
      (3,  1, 'bed_prep',     2, null, null, 'high',   'Lên luống cao khoảng 25–30 cm, mặt luống rộng khoảng 80–100 cm, rãnh thoát nước giữa các luống.', 'Mặt luống hơi vồng để nước không đọng. Luống cao giúp thoát nước, hạn chế thối rễ và quả chạm đất.', '[]'),
      (4,  1, 'mulching',     2, null, null, 'high',   'Lắp ống tưới nhỏ giọt rồi phủ màng phủ luống, đục lỗ trồng so le hai hàng.', 'Màng phủ giữ ẩm, hạn chế cỏ, giữ quả sạch. Mỗi luống 1–2 dây tưới nhỏ giọt; kiểm tra các đầu nhỏ giọt không tắc.', '[{"name":"Màng phủ luống"},{"name":"Ống tưới nhỏ giọt"}]'),
      (5,  1, 'irrigation',   2, null, null, 'normal', 'Tưới đẫm luống để đất đủ ẩm và rửa bớt muối trước khi trồng.', 'Chạy thử hệ thống tưới, sửa chỗ rò rỉ.', '[]'),
      (6,  1, 'spraying',     1, null, null, 'normal', 'Xử lý đất, nấm bệnh trước khi trồng (chế phẩm sinh học hoặc thuốc theo quy định).', 'Có thể dùng chế phẩm vi sinh đối kháng (ví dụ Trichoderma). Ghi tên thuốc, liều, thời gian cách ly.', '[{"name":"Chế phẩm vi sinh / thuốc xử lý đất"}]'),
      -- 2. Trồng và hồi phục (ngày 15–35)
      (7,  2, 'transplanting', 3, 15, null, 'high',   'Chọn cây con khỏe, sạch bệnh, có 3–4 lá thật, rễ trắng; trồng vào lỗ so le hai hàng.', 'Khoảng cách cây khoảng 25–30 cm. Trồng nông, không lấp kín đọt (cổ rễ ngang mặt luống). Tưới ngay sau trồng. Trồng chiều mát. Ghi nguồn cây giống và số lượng.', '[{"name":"Cây dâu tây giống"}]'),
      (8,  2, 'irrigation',   21, 15, 1,   'high',   'Tưới giữ ẩm đều 3 tuần đầu để cây bén rễ, tránh héo.', 'Tưới ngắn, nhiều lần trong ngày nếu nắng nóng; không để úng gốc.', '[]'),
      (9,  2, 'replanting',   5,  21, null, 'low',   'Dặm cây chết hoặc yếu bằng cây cùng tuổi.', 'Dặm sớm trong 1 tuần đầu để cây phát triển đồng đều.', '[{"name":"Cây dâu tây giống dự phòng"}]'),
      (10, 2, 'pruning',      7,  29, null, 'low',   'Tỉa bỏ hoa đầu và lá vàng, lá già để cây tập trung ra rễ và lá.', 'Việc này không bắt buộc, tùy giống và vùng trồng. Cắt bỏ lá bệnh đem ra khỏi vườn.', '[]'),
      -- 3. Sinh trưởng (ngày 36–55)
      (11, 3, 'irrigation',   20, 36, 1,   'high',   'Tưới nhỏ giọt hằng ngày theo độ ẩm đất.', 'Giữ đất ẩm đều, không khô rồi úng. Sáng tưới là tốt nhất.', '[]'),
      (12, 3, 'fertilizing',  20, 36, 7,   'high',   'Bón thúc qua nước tưới mỗi tuần, ưu tiên đạm và lân giúp ra lá và rễ.', 'Dùng phân tan hoàn toàn trong nước (ví dụ loại cân đối NPK). EC dung dịch khoảng 1,0–1,5 mS/cm, pH 5,5–6,5; ghi EC và pH. Liều theo hướng dẫn nhà sản xuất.', '[{"name":"Phân tan trong nước (NPK cân đối)"}]'),
      (13, 3, 'pruning',      20, 36, 7,   'normal', 'Mỗi tuần tỉa lá già, lá vàng, lá bệnh và cắt bỏ tua (dây bò).', 'Tua cắt sát gốc để cây dồn dinh dưỡng cho quả. Vườn thông thoáng ít bệnh hơn. Đem bỏ lá, tua bệnh ra ngoài vườn.', '[]'),
      (14, 3, 'spraying',     20, 36, 10,  'normal', 'Phun phòng bệnh lá (thán thư, đốm lá, phấn trắng) và sâu hại (nhện đỏ, rệp, bọ trĩ) theo chu kỳ.', 'Ưu tiên biện pháp sinh học, luân phiên hoạt chất để tránh kháng thuốc. Ghi thuốc, liều và thời gian cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 4. Ra hoa, đậu quả (ngày 56–80)
      (15, 4, 'irrigation',   25, 56, 1,   'high',   'Tưới đều, không để khô khi ra hoa, không úng gốc.', 'Thiếu nước thì quả nhỏ, thừa nước quả nhạt và dễ thối.', '[]'),
      (16, 4, 'fertilizing',  25, 56, 7,   'high',   'Chuyển sang bón nhiều kali, giảm đạm, nuôi hoa và quả.', 'Dùng phân tan có tỷ lệ kali cao; có thể bổ sung canxi, bo giúp quả cứng và đậu quả tốt. EC khoảng 1,2–1,8 mS/cm; ghi EC và pH.', '[{"name":"Phân tan nhiều kali"},{"name":"Canxi, bo (nếu cần)"}]'),
      (17, 4, 'pollination',  25, 56, 2,   'normal', 'Hỗ trợ thụ phấn: thả ong hoặc để cây tự thụ, quạt nhẹ trong nhà màng.', 'Quả méo, dị dạng thường do thụ phấn kém. Không phun thuốc độc với ong khi đang có hoa.', '[]'),
      (18, 4, 'pruning',      25, 56, 7,   'normal', 'Tỉa hoa quả dị dạng, hoa nhỏ muộn, lá già che quả; cắt tua.', 'Mỗi cụm chỉ giữ số quả vừa đủ để quả to đều.', '[]'),
      (19, 4, 'spraying',     25, 56, 7,   'high',   'Phun phòng mốc xám, phấn trắng, thán thư quả và nhện, rệp, bọ trĩ.', 'Mốc xám phát triển mạnh khi ẩm, mát; giữ vườn thoáng, lấy bỏ quả thối. Kiểm tra thời gian cách ly trước khi thu.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 5. Thu hoạch (ngày 81–180)
      (20, 5, 'harvesting',   100, 81, 2,  'high',   'Thu quả chín đỏ khoảng 80–100% mặt quả, thu vào sáng sớm, 2–3 ngày một lần.', 'Bấm cả cuống, nhẹ tay, không rửa; xếp một lớp trong hộp, giữ mát. Phân loại theo kích cỡ, hình thức; ghi khối lượng và nơi nhận. Tuyệt đối kiểm tra hết thời gian cách ly thuốc.', '[{"name":"Hộp, khay đựng quả"}]'),
      (21, 5, 'irrigation',   100, 81, 1,  'high',   'Tưới nhỏ giọt hằng ngày; tưới ít hơn khi trời lạnh, nhiều hơn khi nắng nóng.', null, '[]'),
      (22, 5, 'fertilizing',  100, 81, 7,  'high',   'Bón nuôi quả mỗi tuần qua nước tưới, giữ tỷ lệ kali cao.', 'Giảm hoặc ngừng bón khi cuối vụ, cây yếu. Ghi EC, pH.', '[{"name":"Phân tan nhiều kali"}]'),
      (23, 5, 'pruning',      100, 81, 7,  'normal', 'Tỉa lá già, lá bệnh, cắt tua và nhặt quả thối, quả hỏng ra khỏi vườn.', 'Quả thối để lại là nguồn lây mốc xám rất nhanh.', '[]'),
      (24, 5, 'spraying',     100, 81, 10, 'normal', 'Phun phòng bệnh, sâu hại khi cần; chọn thuốc cách ly ngắn.', 'Chỉ dùng thuốc được phép trên dâu tây. Phun sau khi thu hoạch trong ngày, không phun sát ngày thu. Ghi thuốc, liều, ngày cách ly.', '[{"name":"Thuốc / chế phẩm phòng trừ sâu bệnh"}]'),
      -- 6. Kết thúc vụ (ngày 181–184)
      (25, 6, 'other',        4,  181, null, 'normal', 'Thu dọn cây tàn, màng phủ, ống tưới; đem bỏ cây bệnh, vệ sinh vườn.', 'Không để tàn dư cây bệnh trong vườn. Nên luân canh hoặc xử lý đất trước vụ sau.', '[]')
    ) as v(seq, phase_seq, wcode, days, start_day, rep, imp, note, guide, mats);
end $$;
