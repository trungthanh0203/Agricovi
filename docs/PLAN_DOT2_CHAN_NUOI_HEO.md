# Kế hoạch Đợt 2: chăn nuôi heo (ưu tiên VietGAP, chừa chỗ cho C.P.) và thiết kế chung với trồng trọt

*Soạn 25/10/2026 từ `Quytrinhnuoiheotrangtrai_VietGAP.md`, `Quytrinhnuoiheotrangtrai_CP.md`, `SosanhnuoiheoCPvaVietGAP.md`. Chờ duyệt. Bổ sung cho `PLAN_DOT1B_SO_NHAT_KY.md` (dưa lưới).*

## 1. Kết luận ngắn
1. **VietGAP khớp thiết kế app hơn** và nên làm trước: nó là bộ *ghi chép tuân thủ* (nhật ký, vaccine, ngưng thuốc, sự cố, bảng kiểm), đúng sở trường của app. C.P. 3F là bộ *chỉ số hiệu quả* (FCR, tăng trọng, hao hụt, báo cáo cho công ty) và **tính được từ chính dữ liệu VietGAP** (cám đã xuất, cân, số con). Làm VietGAP trước thì C.P. chỉ cần thêm lớp chỉ số và báo cáo, không phải làm lại.
2. Hai chuẩn trùng nhau khoảng 70–80 % về dữ liệu (vaccine, thuốc và ngưng thuốc, cám, cân, hao hụt, mật độ, vệ sinh, trống chuồng). Vì vậy làm **một lõi "Heo thịt" dùng chung + hai lớp phủ**: *VietGAP* (bảng kiểm, kim gãy, hồ sơ môi trường, lưu 2 năm) và *C.P.* (FCR/ADG, danh mục cám, báo cáo cho tập đoàn). Không làm hai app/hai bộ màn hình như sơ đồ trong tài liệu so sánh; dùng đúng **gói loại hình** đã thiết kế (D96).
3. **Heo thịt trước, nái sau.** Heo thịt quản lý theo *lô/đợt nuôi* (khớp "vụ" của app). Nái và đực giống cần *hồ sơ từng cá thể* (phối, đẻ, cai sữa, thẻ tai): một mô-đun riêng, làm sau khi lõi chạy ổn và biết hộ nuôi heo của bạn nuôi thịt hay nuôi nái.
4. Phần lớn thứ cần cho heo **cũng có lợi cho dưa** (số lượng cây, phiếu đo, mốc theo ngày, sổ in), nên làm các thành phần chung trước, mỗi thành phần xong là dùng được cho cả hai.

## 2. Khớp với app hiện tại

| Nhu cầu heo VietGAP | Cách khớp | Tình trạng |
|---|---|---|
| Chuồng / dãy chuồng | Trang trại = khu chuồng (mã dãy/ô). Sản phẩm có sẵn loại *vật nuôi* | Có |
| Đợt nuôi (all-in/all-out) | **Vụ** = một lứa nuôi của một dãy/ô | Có |
| Giai đoạn 1 (20–60 kg) / giai đoạn 2 (61–105 kg) | Giai đoạn của quy trình mẫu | Có |
| Tiêm vaccine, tẩy giun, cho ăn, sát trùng, vệ sinh | Việc + form động (gói heo đã có bộ trường sơ bộ) | Có, cần hoàn thiện |
| **Ngưng thuốc thú y trước xuất chuồng**, bắt buộc cảnh báo | Cơ chế cách ly: xuất chuồng sớm phải ghi lý do (D96) | **Có, dùng ngay** |
| Thu hoạch = xuất chuồng (con, kg, người mua) | Thu hoạch/bán; cần đếm *con* ngoài kg | Thiếu số con |
| Sát trùng định kỳ, kiểm tra hố sát trùng, khách/xe ra vào | Nhật ký gắn **khu vực** không cần vụ (đã cho phép) | Có, cần bộ trường |
| Sự cố bệnh, chết, thời tiết | Sự cố (T3) | Cần thêm loại *kim tiêm gãy*, *chết/loại thải* |
| Thức ăn: lô cám, hạn dùng, FIFO | Kho có xuất/nhập theo vật tư | **Thiếu lô và hạn dùng** |
| Số con, chết, loại, mật độ m²/con, tỉ lệ hao | Chỉ có số cây của vụ | **Thiếu biến động số lượng** |
| Cân đàn, tăng trọng (ADG), FCR | Chưa có | **Thiếu** (mục 3) |
| Lịch vaccine theo *ngày tuổi* | Giai đoạn theo ngày kể từ bắt đầu vụ + nhắc việc theo ngày | Cần mốc theo tuổi |
| Trống chuồng tối thiểu 7 ngày | Có ngày kết thúc/bắt đầu vụ của cùng trang trại | Cần kiểm tra và cảnh báo |
| Mẫu nước uống, nước thải, Biogas, giấy phép môi trường | Giấy phép (có); lịch kiểm tra định kỳ chưa có | Thiếu lịch định kỳ |
| Bảng tự kiểm nội bộ VietGAP (45 chỉ tiêu), lưu hồ sơ 2 năm | Chưa có | **Thiếu** (cần bảng chỉ tiêu chính thức) |
| Mã định danh lô/cá thể, truy xuất | Mã vụ và mã QR có sẵn | Có cho lô; cá thể thuộc mô-đun nái |
| Xuất PDF/Excel nhật ký | Kế hoạch L5 | Chưa |

## 3. Thành phần chung cần xây (dùng cho cả dưa và heo)
1. **Biến động số lượng của vụ** (mới): nhập/trồng, dặm, chết, loại, chuyển, xuất. Cho ra *số còn lại*, *tỉ lệ hao*, *mật độ* (số lượng ÷ diện tích). Dưa dùng cho số cây, heo cho số con. Là nền cho FCR và mật độ.
2. **Phiếu đo tổng quát** (mở rộng L4): đo theo vụ hoặc theo khu chuồng. Dưa: nhiệt độ, độ ẩm, EC, pH. Heo: cân mẫu (số con cân, cân nặng trung bình), nhiệt độ chuồng, độ ẩm. Có ngưỡng và biểu đồ.
3. **Chỉ số tính** (mới, nhỏ): ADG = tăng trọng ÷ ngày nuôi; **FCR = cám đã xuất cho vụ ÷ tăng trọng** (lấy từ xuất kho, không nhập hai lần); tỉ lệ hao; ngày nuôi; giá thành mỗi kg. Phục vụ lớp phủ C.P. và báo cáo năng suất.
4. **Mốc của quy trình hai chiều**: mốc *lùi từ ngày thu/xuất* (ngưng phân, ngưng thuốc) và mốc *tiến theo ngày tuổi* (vaccine). Tự sinh nhắc việc ở Trang chủ.
5. **Lô và hạn dùng của vật tư** (mới): số lô, hạn sử dụng, nhắc quá hạn, xuất theo FIFO. Dùng cho cám, vaccine, thuốc, phân, thuốc BVTV.
6. **Sổ mẫu in/Excel và bảng kiểm** (L5): một định nghĩa sổ dùng cho dưa VietGAP và heo VietGAP; *bảng kiểm nội bộ* là một dạng biểu mẫu (mỗi chỉ tiêu Đạt/Không/Không áp dụng + bằng chứng), kết quả theo năm.
7. **Lịch kiểm tra định kỳ** (mới, nhỏ): nhắc lặp lại (mẫu nước, nước thải, kiểm tra hố sát trùng, tự đánh giá hằng năm) kèm kết quả và tệp đính kèm.

## 4. Lộ trình gộp trồng trọt + chăn nuôi (đề xuất)
Làm theo thứ tự này, mỗi bước dùng được ngay và có test CSDL gọn:

| Bước | Nội dung | Dưa | Heo |
|---|---|---|---|
| **A** | L1 Dữ liệu nền + **lô và hạn dùng** vật tư; sự cố thêm *nguyên nhân* và loại *kim gãy / chết, loại thải / thiết bị* | ✔ | ✔ |
| **B** | **Biến động số lượng** + mật độ + tỉ lệ hao; thu hoạch/xuất ghi thêm *số con/số quả* | ✔ | ✔ |
| **C** | **Phiếu đo tổng quát** + ngưỡng + biểu đồ + cân và ADG/FCR (L4 mở rộng) | ✔ | ✔ |
| **D** | **Quy trình mẫu có mốc hai chiều + nhắc** (L3): quy trình dưa lưới; quy trình *heo thịt* (giai đoạn 1/2, lịch vaccine theo ngày tuổi, tẩy giun, trống chuồng) | ✔ | ✔ |
| **E** | **Sổ mẫu in/Excel + bảng kiểm VietGAP + lịch kiểm tra định kỳ** (L5) | ✔ | ✔ |
| **F** | **Gói loại hình trọn bộ**: *Dưa lưới VietGAP*, *Heo thịt VietGAP*, lớp phủ *C.P.* (FCR/ADG, danh mục cám, báo cáo cho công ty) | ✔ | ✔ |
| **G** | Mô-đun **nái/đực giống** (cá thể, phối, ngày dự kiến đẻ = phối + 114 ngày, đẻ, cai sữa, thẻ tai) | | ✔ |
| **H** | Hồ sơ nhân công, truy xuất công khai theo lô (tùy chọn) | ✔ | ✔ |

Ưu tiên chăn nuôi nên đặt **bước D (quy trình heo) và gói Heo thịt VietGAP** ngay sau A–C; không đợi gói dưa hoàn tất. Gói dưa (L2) làm xen vào vì nhỏ.

## 5. Chỗ tài liệu cần kiểm lại trước khi đưa vào app
Tài liệu nhắc nhiều số liệu pháp lý và kỹ thuật chưa kiểm chứng. App **không cài cứng**; hiển thị là *gợi ý, cần đối chiếu* và cho trang trại/thú y sửa:
1. **Khoảng cách và mật độ không thống nhất** giữa các tài liệu: khoảng cách khu dân cư 100–400 m (C.P.) và 300–500 m (VietGAP); mật độ nái chửa 1,5–1,8 và 1,8–2,2 m²/con; cách ly nái 30–45 ngày và 14–30 ngày; trống chuồng 7–30 ngày và tối thiểu 7 ngày. Cần lấy từ văn bản chính thức hoặc tư vấn của thú y.
2. **Lịch vaccine** trong tài liệu C.P. là "tổng quát", không phải quy định. Tài liệu so sánh nói C.P. tiêm cả ASF nhưng bảng lịch không có ASF. Lịch cụ thể do **bác sĩ thú y của trại** chốt, app chỉ lưu và nhắc theo lịch đó.
3. **Số hiệu pháp lý** (Quyết định 4653/QĐ-BNN-CN, TT 18/2023, biểu mẫu "QT-09B", "3.26", "45 hay 41–45 chỉ tiêu"): cần văn bản/bảng kiểm gốc. Số chỉ tiêu bảng kiểm đang ghi lệch (41, 45), nên **cần bạn gửi bảng kiểm chính thức** để làm đúng.
4. **Cắt đuôi, mài răng nanh** thường quy trong lịch heo con: có thể trái yêu cầu phúc lợi động vật của VietGAP. Không đặt mặc định cho heo thịt; chỉ để làm tùy chọn khi thú y yêu cầu.
5. Thời gian nuôi "5–6 tháng từ sau cai sữa" chưa khớp với mốc 165 ngày tuổi (khoảng 4,5 tháng sau cai sữa). Độ dài giai đoạn lấy theo quy trình thực của trại.

## 6. Việc cần chủ sản phẩm quyết định / cung cấp (kèm đề xuất)
1. Duyệt hướng: **lõi Heo thịt dùng chung, VietGAP làm trước, C.P. là lớp phủ**; bước A–F như mục 4 (đề xuất: duyệt).
2. Hộ nuôi heo hiện có nuôi **heo thịt hay nái**, chuồng **kín hay hở**, có **gia công cho C.P.** (C.P. cấp giống và cám, trại nhận tiền công) hay tự nuôi bán? Gia công thay cách tính doanh thu và lãi (tiền công trên kg tăng trọng, thưởng FCR), có thể cần một bước riêng sau.
3. Gửi **bảng kiểm VietGAP chăn nuôi heo chính thức** (số chỉ tiêu, nội dung từng chỉ tiêu) và, nếu có, **mẫu sổ nhật ký thực tế** của hộ nuôi heo để làm sổ in giống như phần dưa.
4. Cho phép đếm *con* thay *kg* làm đơn vị chính khi xuất chuồng, kèm cân tổng (đề xuất: ghi cả số con và kg).
5. Nái và đực giống làm sau lõi heo thịt (đề xuất: sau bước F, trừ khi hộ của bạn nuôi nái).
