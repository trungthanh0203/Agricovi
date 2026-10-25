-- P1B/P5 (D100): thêm bộ bảng kiểm dùng chung "VietGAP trồng trọt - dưa lưới nhà màng" theo file bảng kiểm của chủ sản phẩm.
-- File ghi "25 tiêu chí core" ở mục lục nhưng bảng chỉ có 18 tiêu chí (11 loại A, 7 loại B): nạp đúng 18 tiêu chí có thật. Chưa đối chiếu với bản chính thức (verified_at trống);
-- mã tiêu chí (1.1, 2.1...) giữ ở đầu nội dung; cột "Hồ sơ minh chứng yêu cầu" của file được lưu ở cột "cách đánh giá".
insert into checklist_templates (code, name, source_note)
values ('vietgap_melon', 'Bảng kiểm tự đánh giá VietGAP dưa lưới nhà màng (18 tiêu chí)',
        'Theo file bảng kiểm của chủ sản phẩm (ghi kèm TCVN 11892-1:2017). Mục lục của file nói 25 tiêu chí nhưng bảng chỉ có 18. Mức A/B và nội dung CHƯA đối chiếu với bản chính thức của đơn vị chứng nhận: hãy đối chiếu rồi sửa nếu lệch.');
insert into checklist_items (template_id, seq, item_text, level, method)
select (select id from checklist_templates where code = 'vietgap_melon'), v.* from (values
  (1, '1.1. Địa điểm nhà màng cao ráo, không bị ngập úng, cách xa nguồn ô nhiễm (bãi rác, nghĩa trang, hóa chất).', 'A', 'Hồ sơ minh chứng: Bản đồ vị trí & Báo cáo đánh giá vùng trồng'),
  (2, '1.2. Đất/Nền nhà màng sạch, có bạt phủ cách ly chống cỏ dại và mầm bệnh từ đất.', 'B', 'Hồ sơ minh chứng: Nhật ký vệ sinh nền & mẫu bạt phủ'),
  (3, '2.1. Nguồn nước tưới đạt tiêu chuẩn an toàn (nước giếng khoan/nước sông qua xử lý), không nhiễm kim loại nặng.', 'A', 'Hồ sơ minh chứng: Kết quả xét nghiệm nước tưới định kỳ'),
  (4, '2.2. Hệ thống bồn chứa phân bón A/B riêng biệt, có mô tơ đảo trộn chống lắng đọng kết tủa.', 'B', 'Hồ sơ minh chứng: Sơ đồ hệ thống Fertigation'),
  (5, '2.3. Phân bón sử dụng thuộc danh mục cho phép, có nguồn gốc rõ ràng, không dùng phân tươi.', 'A', 'Hồ sơ minh chứng: Hóa đơn mua phân bón & Nhãn nhãn hiệu'),
  (6, '3.1. Giống dưa lưới có xuất xứ rõ ràng, có chứng nhận chất lượng, tỷ lệ nảy mầm ≥ 85%.', 'A', 'Hồ sơ minh chứng: Hóa đơn mua hạt giống & Giấy chứng nhận'),
  (7, '3.2. Giá thể mụn dừa đã qua quy trình xả chát Tanin & Lignin hoàn toàn trước khi trồng.', 'A', 'Hồ sơ minh chứng: Nhật ký xử lý giá thể (Xả vôi 7 ngày)'),
  (8, '4.1. Áp dụng quản lý dịch hại tổng hợp IPM (bẫy dính vàng, lưới chắn côn trùng 32-50 mesh).', 'B', 'Hồ sơ minh chứng: Nhật ký theo dõi bẫy dính'),
  (9, '4.2. Chỉ sử dụng thuốc BVTV trong danh mục được phép, đúng liều lượng và nguyên tắc 4 đúng.', 'A', 'Hồ sơ minh chứng: Sổ nhật ký phun thuốc BVTV'),
  (10, '4.3. Tuân thủ nghiêm ngặt thời gian cách ly (PHI) của từng loại thuốc trước khi thu hoạch.', 'A', 'Hồ sơ minh chứng: Sổ nhật ký BVTV & Phiếu kiểm tra PHI'),
  (11, '4.4. Kho chứa thuốc BVTV riêng biệt, có khóa an toàn, bảng cảnh báo và dụng cụ bảo hộ.', 'A', 'Hồ sơ minh chứng: Biên bản kiểm tra an toàn kho'),
  (12, '5.1. Dụng cụ thu hoạch (kéo, rổ, xốp) sạch sẽ, được sát trùng trước khi cắt trái.', 'B', 'Hồ sơ minh chứng: Nhật ký vệ sinh dụng cụ thu hoạch'),
  (13, '5.2. Ngưng cấp dung dịch dinh dưỡng 7 ngày và ngưng tưới nước 5 ngày trước thu hoạch.', 'B', 'Hồ sơ minh chứng: Nhật ký tưới nước & Fertigation'),
  (14, '5.3. Trái dưa lưới được bọc xốp bảo vệ, bao gói bằng vật liệu không gây độc hại.', 'B', 'Hồ sơ minh chứng: Mẫu bao bì & Nhãn truy xuất QR Code'),
  (15, '6.1. Ghi chép nhật ký sản xuất đầy đủ, kịp thời các công đoạn (bón phân, phun thuốc, tưới, thu hoạch).', 'A', 'Hồ sơ minh chứng: Sổ nhật ký điện tử / File Excel VietGAP'),
  (16, '6.2. Lưu trữ hồ sơ nhật ký và chứng từ liên quan ít nhất 12 tháng phục vụ truy xuất.', 'A', 'Hồ sơ minh chứng: Kho hồ sơ lưu trữ'),
  (17, '7.1. Người lao động được trang bị đầy đủ bảo hộ (khẩu trang, găng tay, ủng) khi phun thuốc.', 'B', 'Hồ sơ minh chứng: Biên bản cấp phát bảo hộ lao động'),
  (18, '7.2. Bao bì, chai lọ thuốc BVTV sau sử dụng được thu gom vào bể chứa nguy hại riêng.', 'A', 'Hồ sơ minh chứng: Hình ảnh bể chứa rác thải nguy hại')
) as v(seq, item_text, level, method);
