# Phân tích: giao diện máy tính cho app (chờ chủ sản phẩm chọn phương án)

Ngày soạn: 21/11/2026. Mảng: APP. Chưa làm gì trong mã. Số "phiên" là ước lượng thô của tôi (1 phiên = một buổi làm việc gọn có sửa mã, kiểm tra bằng typecheck và xem thử ở vài độ rộng màn hình), chưa đo thực tế.

## 1. Hiện trạng (đã kiểm tra trong mã)

- App có khoảng **26.000 dòng giao diện**, ~20 màn hình lớn, ~150 thành phần; **một file kiểu dáng 1.007 dòng**.
- Chỉ có **2 điểm ngắt cho màn rộng** (560 px: lưới ô chức năng 4 cột; 720 px: lưới thống kê 4 cột). Còn lại là bố cục điện thoại.
- Trên máy tính hiện nay: nội dung **kéo giãn hết bề ngang** (không giới hạn bề rộng), thanh chuyển mục **cố định dưới đáy toàn màn hình**, menu là ngăn kéo bên trái, biểu mẫu và bảng dài ngang rất xa nhau. Dùng được nhưng **trông như app điện thoại phóng to**, khó đọc và dễ gây ấn tượng "chưa hoàn thiện" với chủ cơ sở lớn, HTX, kế toán.
- Trang quản trị nền tảng (`apps/admin`, ~1.400 dòng) đã là giao diện máy tính riêng, nhưng dành cho người vận hành, không phải người dùng.
- Cài đặt hiện là **một PWA** (`display: standalone`, `start_url: /`); có sẵn hướng dẫn cài `InstallGuide`.

## 2. Các phương án

### A. Một app, bố cục tự co giãn theo màn hình (khuyến nghị)
Cùng mã, cùng địa chỉ, cùng dữ liệu. Chỉ **thêm** luật cho màn rộng (`@media (min-width: …)`), nên **giao diện điện thoại giữ nguyên** (rủi ro hỏng bản điện thoại rất thấp).

| Bước | Làm gì | Ước lượng | Hiệu quả |
|---|---|---|---|
| **A1. Khung máy tính** | Từ 1024 px: **thanh menu dọc bên trái** thay thanh dưới đáy và ngăn kéo (dùng lại đúng các mục sẵn có); nội dung giới hạn ~1200 px, căn giữa; thẻ/biểu đồ chia 2–3 cột; bảng hiện đủ cột (bỏ kiểu gập 50% màn hình); biểu mẫu không kéo dài hết màn; cỡ chữ và khoảng cách vừa chuột | **1–2 phiên** (chủ yếu CSS ~200–300 dòng + sửa khung `Shell` ~100 dòng) | Chiếm ~70–80% giá trị: trông như phần mềm máy tính |
| **A2. Các màn chính dạng 2 cột** | Danh sách bên trái, chi tiết bên phải (Vụ, Nhật ký, Kho, Chi phí/Thu hoạch/Bán hàng, Chấm công); biểu mẫu thêm mới mở dạng khung bên cạnh thay vì phủ cả màn | **4–8 phiên**, làm dần, màn nào dùng nhiều làm trước | Làm việc nhanh hơn rõ rệt cho người ngồi bàn |
| **A3. Tiện ích máy tính** | Phím tắt (Enter lưu, Esc đóng), nhập nhanh dạng bảng cho chi phí/kho, in và xuất tệp gọn, kéo-thả ảnh | **2–4 phiên** | Hợp người làm sổ sách |

Chi phí tài nguyên: **không tốn hạ tầng thêm**, không đổi CSDL, không cần chạy test CSDL (chỉ typecheck + xem thử bằng ảnh chụp ở 3 độ rộng). Dung lượng app tăng không đáng kể. Mỗi bước phát hành độc lập được.

### B. Làm một app máy tính riêng (không khuyến nghị)
Một bản giao diện tách riêng dùng chung CSDL và thư viện. **25–40+ phiên**, hai bộ mã giao diện phải sửa song song mỗi lần thêm tính năng (**bảo trì gấp đôi**), hai lần phát hành và hai lần kiểm tra. Lợi: tự do thiết kế tuyệt đối. Hại: chậm, dễ lệch tính năng giữa hai bản, mỗi quyết định như "gói Khởi đầu khóa gì" phải làm hai nơi.

### C. Chỉ làm vừa đủ (A1 rồi dừng)
Đủ để không bị chê khi quảng bá; để dữ liệu sử dụng quyết định có làm A2/A3 không.

## 3. Cài đặt: "bản điện thoại" và "bản máy tính"

Về kỹ thuật chỉ cần **một app**; **hai lựa chọn nằm ở cách cài**, không phải hai bản mã:

| Thiết bị | Cách cài | Ghi chú |
|---|---|---|
| Android | Google Play (đợt D) hoặc "Cài đặt ứng dụng" từ trình duyệt | Như kế hoạch cửa hàng |
| iPhone / iPad | App Store (đợt D, làm sau) hoặc "Thêm vào MH chính" | |
| **Windows / Mac / Linux** | Chrome hoặc Edge: nút **"Cài về máy tính"** (cửa sổ riêng, biểu tượng ở màn hình/menu Start). Tùy chọn sau: đưa lên **Microsoft Store** qua PWABuilder | Không cần gói phát hành mới |

Việc cần làm cho cài đặt (nhỏ, **0,5–1 phiên**, gộp vào A1): trang/hộp **"Chọn cách cài: Điện thoại hoặc Máy tính"** (tự đoán theo thiết bị, cho đổi tay), thêm tab "Máy tính" vào `InstallGuide` (nút cài một chạm bằng `beforeinstallprompt`, hướng dẫn Edge/Chrome/Safari Mac), bổ sung `screenshots` dạng màn rộng trong manifest để trình duyệt hiện khung cài đẹp, cho phép cửa sổ máy tính đổi cỡ.

Lưu ý: người dùng đăng nhập cùng tài khoản trên điện thoại và máy tính thấy **cùng dữ liệu** (lưu ở máy chủ); bản lưu offline là riêng từng thiết bị.

## 4. Liên quan tới kế hoạch kinh doanh

- Người ngồi máy tính thường là **chủ cơ sở lớn, HTX, kế toán**: đúng nhóm có khả năng trả tiền. Gói Khởi đầu hiện khóa xuất tệp; giao diện máy tính tốt + xuất báo cáo là **động lực nâng cấp** tự nhiên.
- Nên làm **A1 trước khi quảng cáo rộng trên Facebook** (người xem nhóm Facebook cũng hay mở link trên máy tính).
- Đo trước khi đầu tư sâu: thêm ghi nhận độ rộng màn hình vào theo dõi sử dụng có sẵn (`usageTracker`) để biết tỷ lệ người dùng máy tính thật rồi mới quyết A2/A3.

## 5. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Làm hỏng bản điện thoại | Chỉ thêm luật `@media (min-width)`; kiểm tra ảnh chụp trước/sau ở 375 px |
| 150 thành phần có cách dàn trang riêng, một số biểu mẫu/bảng lệch | Làm A1 theo lớp chung (`.content`, `.card`, `.grid`, `.inline-form`) trước, vá từng màn sau |
| Màn có chức năng chỉ hợp điện thoại (chấm công khuôn mặt, quét QR, chụp ảnh) | Giữ nguyên, ẩn hoặc chuyển sang tải ảnh từ máy tính |

## 6. Đề xuất

**Phương án A, làm theo thứ tự A1 (kèm lựa chọn cài đặt) → đo → A2/A3 theo nhu cầu thật.** Ước lượng cho bước đầu: **2–3 phiên** (khung máy tính + lựa chọn cài đặt), không đụng CSDL, không cần `db push`.
