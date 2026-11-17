# Đề xuất hoàn thiện để triển khai: nhà màng và nuôi heo (16/11/2026, chờ chủ sản phẩm duyệt)

Căn cứ: `STATUS_APP.md`, `DECISIONS_APP.md`, `PHAN_TICH_DAP_UNG_NGHIEP_VU.md` (25/10), `PLAN_DOT3_MAU_HEO_THUY_SAN.md`, `KE_HOACH_HOAN_THIEN_APP.md`, `DINH_VI_SAN_PHAM_UU_TIEN.md`. Đây là rà tài liệu và tìm trong mã; **Claude chưa chạy app trên máy thật**. Chưa mục nào trong phần "Đề xuất" được làm.

## 1. Kết luận ngắn

- **Về chức năng: phần lõi đã đủ để chạy thử có kiểm soát** ở cả hai ngành. Nhà màng và heo đều có quy trình mẫu, nhật ký việc kèm vật tư, kho theo lô, chi phí, công, thu hoạch hoặc xuất chuồng, giá thành, lãi lỗ, truy xuất, sổ VietGAP in được.
- **Về độ tin cậy: chưa đủ để bán đại trà.** Nút thắt không phải thiếu tính năng mà là: (1) nhiều migration chưa `db push` (từ 0016 đến 0215 theo ghi chú), (2) phần lớn tính năng mới ghi "chưa kiểm giao diện trên máy thật", (3) mới có một hộ dưa lưới thí điểm, chưa có hộ nuôi heo thí điểm.
- Khoảng trống còn lại chủ yếu là **vận hành hằng ngày** (giao việc, nhắc việc, thông báo đẩy), không phải nghiệp vụ lõi.

## 2. Đã có (theo tài liệu)

| Nhu cầu | Nhà màng | Heo |
|---|---|---|
| Quy trình mẫu, việc lặp lại, tự dời lịch | Có: dưa lưới, dâu, ớt chuông, cà chua bi, dưa chuột | Có: `pig_fattening_vietgap` (nháp, chưa chuyên gia duyệt) |
| Cấp nhà màng / chuồng dưới phân khu, ươm gối vụ | Có (D124–D125) | Có (chuồng); cảnh báo trống chuồng 7 ngày |
| Nhật ký việc, vật tư xuất theo lô FIFO, hạn dùng | Có | Có |
| Thời gian cách ly / ngừng thuốc, sự cố và xử lý | Có | Có |
| Số con, hao hụt + cảnh báo ngưỡng | Số cây | Có (cộng dồn và 7 ngày) |
| Cân mẫu, ADG, FCR, định mức thức ăn, dự báo xuất chuồng | Không áp dụng | Có |
| Lịch vaccine theo ngày tuổi | Không áp dụng | Có (lịch tham khảo, cần thú y xác nhận) |
| Số đo (pH, EC, nhiệt, ẩm) kèm ngưỡng | Có (nhập tay) | Một phần (nhiệt/ẩm chuồng nhập tay) |
| Chi phí, công, chấm công, phiếu khoán, lương, giá thành, lãi lỗ | Có | Có |
| Thu mua, bán, công nợ, hợp đồng, bảng kê | Có | Có |
| Kiểm kho theo đợt | Có | Có |
| Sổ nhật ký VietGAP, bảng kiểm, truy xuất QR | Có (dưa lưới 18 tiêu chí) | Có (sổ heo) |
| Dữ liệu mẫu để thử | Chưa có bộ nhà màng riêng | Có (60 vụ) |

## 3. Còn thiếu hoặc còn rủi ro

### 3.1 Điều kiện bắt buộc trước khi triển khai (không phải code mới)
1. Người dùng `db push` toàn bộ migration, deploy lại `staff-accounts`, rồi thử máy thật (camera, khuôn mặt, in sổ, đọc hóa đơn).
2. Một hộ nuôi heo dùng thử một lứa thật (A4 của đợt 3). Heo chưa có hộ thí điểm.
3. Chuyên gia duyệt quy trình mẫu dưa lưới và heo (thú y duyệt lịch vaccine, định mức thức ăn).

### 3.2 Thiếu chức năng (xếp theo ảnh hưởng đến triển khai)

| # | Việc | Ngành | Vì sao cần | Cỡ |
|---|---|---|---|---|
| H1 | **Giao việc và việc hôm nay** (giao cho người hoặc tổ, hạn, xong thì tự đánh dấu) | Cả hai | Chủ có người làm thuê cần biết ai làm gì; đang hoãn từ trước | L |
| H2 | **Thông báo đẩy** (nhắc việc, mũi tiêm, cách ly, vượt ngưỡng, công chờ duyệt) | Cả hai | App tự nhắc thì mới giữ được nhịp ghi chép; hiện nhắc chỉ hiện khi mở app. iPhone hạn chế hơn Android | L |
| H3 | **Bộ dữ liệu mẫu nhà màng** (như `seed_sample_heo.sql`) | Nhà màng | Để thử và demo giá thành, năng suất, nhiều nhà màng | S |
| H4 | **Lô sản phẩm và phân loại chất lượng** (loại 1, loại 2; heo: phân loại khi xuất) | Cả hai | Giá bán theo loại; hiện chưa có (mới có một phần ở thu hoạch) | M |
| H5 | **Dự trù vật tư theo vụ so với tồn kho, nhắc mua** | Cả hai | Chưa có; từ quy trình mẫu đã có sẵn vật tư dự kiến nên tính được | M |
| H6 | **Năng suất theo diện tích** (kg/m² nhà màng, chi phí/m²) rõ ràng ở tổng kết vụ | Nhà màng | Chủ nhà màng so vụ theo diện tích; cần kiểm lại xem đã hiện đủ chưa | S |
| H7 | **Heo: xuất bán theo cân và theo loại**, so giá thành/kg với giá bán/kg ngay lúc bán | Heo | Xem lãi lỗ lúc xuất, không đợi tổng kết | S–M |
| H8 | **Heo nái, đàn sinh sản, từng cá thể** | Heo | Chỉ cần nếu có trại nái; hiện hoãn (D1–D5). Trại heo thịt nuôi theo lứa không cần | L, chờ khách |
| H9 | **Tài sản, máy móc, khấu hao, bảo dưỡng** (máy bơm, quạt, hệ thống tưới) | Nhà màng | Chưa có; khấu hao đang nhập tay | M |
| H10 | **Nhắc kiểm kho định kỳ ở Trang chủ** | Cả hai | Đã ghi "chưa làm" ở D168 | S |

### 3.3 Cố ý không làm
Cảm biến và tự động hóa điều khiển (mục 12 báo cáo đối thủ, chờ khách thật), chẩn đoán sâu bệnh bằng ảnh, AI khuyến nghị: xem báo cáo đối thủ.

## 4. Thứ tự đề xuất

1. **Giai đoạn 0 (không code, làm ngay):** `db push`, thử máy thật, tìm hộ heo thí điểm, mời chuyên gia duyệt. Đây là điều kiện để mọi thứ sau có ý nghĩa.
2. **Giai đoạn 1 (nhỏ, làm được ngay): H3, H6, H7, H10.** Ít rủi ro, giúp thử và demo tốt hơn.
3. **Giai đoạn 2 (làm sau phản hồi hộ thí điểm): H2 rồi H1.** Nặng nhất, chạm cả CSDL, giao diện và hạ tầng thông báo.
4. **Giai đoạn 3 (theo nhu cầu thật): H4, H5, H9, rồi H8 nếu có trại nái.**

## 5. Cần chủ sản phẩm quyết

1. Đồng ý thứ tự trên không? Có muốn đổi H1/H2 lên trước giai đoạn 1 không?
2. Có hộ nuôi heo nào dùng thử không, quy mô lứa bao nhiêu con, có nuôi nái không (quyết định H8)?
3. Ai duyệt chuyên môn dưa lưới và heo?
4. Nhà màng: có cần bộ dữ liệu mẫu riêng (H3) để demo cho khách không?
