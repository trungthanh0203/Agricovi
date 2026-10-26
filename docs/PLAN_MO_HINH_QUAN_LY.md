# Kế hoạch: Mô hình quản lý chọn khi tạo vụ (đề xuất, chờ chủ sản phẩm quyết)

*Soạn 26/10/2026. Mục tiêu: sau khi tạo vụ nuôi trồng, chủ cơ sở chọn 1 trong 4–5 mô hình quản lý phổ biến; app chỉ hiện các chức năng và việc nhập liệu của mô hình đó. Không đổi quyền hay dữ liệu: quyền vẫn do CSDL ép; mô hình chỉ quyết định HIỆN GÌ và gợi ý LÀM GÌ.*

## 1. Ý kiến
Hữu ích và thiết thực: giải quyết đúng vấn đề "hộ nhỏ thấy quá nhiều mục". Đã có nền: chế độ đơn giản/đầy đủ (D101), quyền theo mục (`has_perm`), sơ đồ luồng ở Trang chủ. Mô hình nâng "đơn giản/đầy đủ" (2 mức, theo cơ sở) thành các **cấu hình có tên, có luồng việc riêng, chọn theo vụ**.

Nhận xét thêm:
1. **Hai trục khác nhau, không nên trộn**: (a) *quy mô nhân sự* (4 mức của bạn) và (b) *mục tiêu tuân thủ/bán hàng* (VietGAP, truy xuất, website). Đề xuất 4 mô hình theo trục (a) + 2 "gói thêm" theo trục (b).
2. Chỉ **ẩn/hiện và gợi ý**; không khóa dữ liệu. Chủ nâng cấp mô hình bất cứ lúc nào (1→2→3→4) mà không mất gì.
3. **An toàn thực phẩm**: mô hình không ghi việc thì app không biết ngày phun thuốc nên **không cảnh báo cách ly**. Phải có nhắc rõ, và gói VietGAP luôn bật ghi việc.

## 2. Các mô hình đề xuất
| # | Mô hình | Ai dùng | Hiện (ngoài phần chung: Phân khu, Vụ, Sản phẩm, Quy trình chuẩn) | Ẩn |
|---|---|---|---|---|
| 1 | **Gia đình tự làm** | Chủ + người nhà 1–3 người | Chi phí (kể cả tiền công người nhà nhập tay), Thu hoạch, Doanh thu, Tổng kết vụ | Ghi việc, Chấm công, Kho/Vật tư, Nhân sự, Tổ, Chức vụ, Bảng lương |
| 2 | **Chủ + 1–2 người làm công tháng** | Thuê lương tháng, chỉ chủ đăng nhập | Như 1 + hồ sơ người làm (không tài khoản), lương tháng cố định, Ghi việc (chủ ghi, tùy chọn), Kho/Vật tư (tùy chọn) | Chấm công vào/ra ca, Tổ, Chức vụ |
| 3 | **Chủ + 1 quản lý điều hành** | Quản lý có tài khoản, chấm công và nhập mọi dữ liệu hộ người làm | Như 2 + Kho/Vật tư, Chấm công do quản lý chấm hộ, Ghi việc, Báo cáo tuần, Chức vụ (quản lý) | Vào/ra ca của từng người, Tổ nhiều cấp |
| 4 | **Cơ sở lớn, nhân viên có tài khoản** | Mỗi người tự đăng nhập, vào ca/ra ca | Toàn bộ: Nhân sự, Phòng/Tổ, Chức vụ và quyền, Chấm công GPS, Bảng lương, Báo cáo theo nhu cầu | Không ẩn gì (= chế độ đầy đủ) |
| + | **Gói VietGAP/truy xuất** (thêm vào mô hình 2–4) | Cần sổ nhật ký, bảng kiểm | Ghi việc bắt buộc, Sổ nhật ký, Bảng kiểm, Giấy phép, Lô/hạn vật tư | — |
| + | **Gói bán qua website** (thêm vào bất kỳ) | Muốn công khai, nhận đơn | Hồ sơ website, Đơn khách, Công khai vụ | — |

Trường hợp khác có thể gặp (làm sau, theo phản hồi): **giao khoán** (trả theo sản lượng/khoán công), **gia công cho công ty** (nhận giống–cám, tiền công theo kg), **HTX quản lý hộ** (đã có loại cơ sở HTX).

## 3. Cách hoạt động
- **Chọn lúc nào**: ngay sau "Tạo vụ", một bước "Chọn cách quản lý vụ này": 4–5 thẻ, mỗi thẻ ghi *dành cho ai / bạn sẽ dùng / bạn sẽ không thấy*; có gợi ý sẵn theo số người đang có trong cơ sở; bấm "Để sau" thì dùng mô hình của cơ sở.
- **Lưu ở đâu**: mô hình **mặc định của cơ sở** (cột trên `organizations`) và **của từng vụ** (cột trên `production_cycles`, rỗng = theo cơ sở). Gói thêm là danh sách cờ.
- **Menu**: tab và mục hiện theo **hợp** các mô hình của các vụ đang chạy (cơ sở chạy cả vụ kiểu 1 lẫn kiểu 4 vẫn thấy đủ cho vụ kiểu 4). Trong **Chi tiết vụ** chỉ hiện các khung đúng mô hình đó.
- **Trang chủ**: sơ đồ luồng đổi theo mô hình. Ví dụ mô hình 1: *Tạo phân khu → Tạo vụ → Ghi chi phí → Thu hoạch → Doanh thu → Tổng kết*. Mô hình 4: sơ đồ hiện nay (Cấu hình → Khai báo → Sản xuất → Báo cáo → Hồ sơ web → Website).
- **Việc cần làm tiếp của vụ**: danh sách ngắn theo mô hình ("Bạn đã ghi 3 khoản chi, chưa có thu hoạch").
- **Đổi mô hình**: ở Chi tiết vụ hoặc Cấu hình; có tóm tắt "sẽ hiện thêm / ẩn đi những mục nào".

## 4. Việc cần làm (theo giai đoạn, mỗi giai đoạn dùng được độc lập)
| GĐ | Nội dung | Cỡ |
|---|---|---|
| A | Bảng định nghĩa mô hình trong mã (`lib/models.ts`: mục hiện, luồng Trang chủ, mô tả thẻ) + test thuần; thay `SIMPLE_HIDDEN` bằng mô hình | vừa |
| B | CSDL: cột mô hình ở cơ sở và vụ, gói thêm; hàm đặt mô hình (chỉ chủ/quản lý); test quyền | nhỏ |
| C | Màn chọn mô hình sau khi tạo vụ + đổi mô hình ở Chi tiết vụ/Cấu hình | vừa |
| D | Menu và Chi tiết vụ theo hợp các mô hình; Trang chủ có luồng riêng từng mô hình | vừa–lớn |
| E | Việc cần làm tiếp theo vụ; nhắc cách ly khi không ghi việc | vừa |
| F | **Khoảng trống dữ liệu cho mô hình 2**: người làm *không tài khoản* trả *lương tháng cố định* không cần chấm công (hiện người không tài khoản bắt buộc thuộc tổ có tổ trưởng và chấm theo giờ/sản lượng) | vừa (có migration) |
| G | Lối tắt "Ghi tiền công" ở Chi phí cho mô hình 1 (nhóm Nhân công, chọn người nhà); cân nhắc | nhỏ |

Thứ tự đề xuất: **A → B → C → D**, rồi E, F, G theo phản hồi dùng thử.

## 5. Cần chủ sản phẩm quyết
1. Mô hình chọn **theo vụ** (đề xuất) hay chỉ theo cơ sở?
2. Đồng ý **4 mô hình + 2 gói thêm** ở mục 2? Đặt tên lại cho dễ hiểu với người dùng?
3. Mô hình 1 có cho **ghi việc nhẹ** (tùy chọn) để vẫn nhắc cách ly khi dùng thuốc, hay ẩn hẳn?
4. Làm khoảng trống F (người làm không tài khoản, lương tháng) trong đợt này?
5. Chế độ đơn giản/đầy đủ hiện có: **thay hẳn** bằng mô hình (1,2 ≈ đơn giản; 4 ≈ đầy đủ)?

## 6. Quyết định của chủ sản phẩm (26/10/2026) — thay cho mục 2 và 5 khi khác nhau
1. Mô hình chọn **theo vụ**; cơ sở có mô hình mặc định.
2. **4 mô hình + 1 gói thêm "Chuẩn VietGAP"**. Bán qua website không còn là gói: có sẵn ở mô hình 2, 3, 4.
   Tên: ① Tự làm trong gia đình · ② Chủ và người làm công tháng · ③ Có người quản lý điều hành · ④ Có nhiều nhân viên, mỗi người một tài khoản.
3. Mô hình 1 có **ghi việc nhẹ tùy chọn**.
4. Làm khoảng trống F: người làm **không tài khoản, lương tháng cố định**, không chấm công.
5. **Thay hẳn** chế độ đơn giản/đầy đủ bằng mô hình (① ② ≈ đơn giản; ④ ≈ đầy đủ). Bản xem trước màn chọn đã gửi cho chủ sản phẩm duyệt.
6. Cách ly dựa vào **giai đoạn phun thuốc của quy trình** (mốc "ngưng thuốc N ngày trước thu") thay vì bắt buộc ghi việc. Lưu ý: mốc chỉ theo ngày thu dự kiến của quy trình, không biết loại thuốc cụ thể; cách ly chính xác theo từng thuốc chỉ có khi có ghi việc dùng thuốc (gói VietGAP luôn bật).

## 7. Tiến độ (26/10/2026)
- Chủ sản phẩm đổi: **Chuẩn VietGAP là mô hình số 5** (không còn là gói thêm); chế độ đơn giản/đầy đủ **tạm khóa, luôn đầy đủ**.
- Đã xong về code: A (bảng mô hình), B (migration 0102–0103), C (màn "Chọn cách quản lý vụ" sau khi tạo vụ + "Cách quản lý vụ này" trong Chi tiết vụ), D (menu theo hợp các mô hình của vụ đang chạy). Trang chủ giữ nguyên.
- Còn lại: E (việc cần làm tiếp theo vụ, nhắc cách ly mô hình 1–2), G (lối tắt ghi tiền công).
