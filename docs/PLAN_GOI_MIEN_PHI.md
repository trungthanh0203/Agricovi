# Kế hoạch: Gói miễn phí 12 tháng + lên cửa hàng ứng dụng (ĐỀ XUẤT, chờ duyệt)

Ngày soạn: 20/11/2026. Mảng: APP (có phần dùng chung). Đã duyệt; đợt A (D218) và đợt B (D219) đã làm, còn đợt C–D (cửa hàng ứng dụng).

## 1. Mục tiêu và nguyên tắc

- Mục tiêu: càng nhiều hộ/HTX **cài và dùng thật** càng tốt; khi cần làm nhiều hơn thì **nâng cấp trong vài phút**.
- Gói miễn phí phải **dùng được thật** (đủ để thấy lợi ích, ghi được cả một vụ), nhưng **chạm trần đúng lúc cần mở rộng**.
- Không xóa dữ liệu của người dùng miễn phí; hết hạn thì chuyển sang chỉ xem/xuất, để họ không bỏ đi mà còn nợ dữ liệu ở đây.
- Chi phí cho mỗi người miễn phí gần bằng 0 (cắt các tính năng tốn tiền như đọc ảnh hóa đơn bằng AI).

## 2. Hiện trạng (đã kiểm tra trong mã)

- `plan_tiers` có `max_cycles` (số vụ đang chạy), giá, và `scan_per_month`; chưa có hạn mức số khu/ô, số người, hay cờ bật/tắt tính năng theo gói.
- Đăng ký mới nhận **dùng thử 30 ngày** (`platform_settings.trial_days`), giới hạn như gói cơ bản (D5: Hộ 2 vụ, HTX 5 vụ). Cơ sở mới còn phải **chờ quản trị duyệt**.
- Đã có sẵn: bảng `plan_orders` (yêu cầu mua gói), `contact_info` (thông tin liên hệ chỉnh ở quản trị), nhắc hết hạn (`expiry_reminder_days`), quản trị kích hoạt gói + ghi thanh toán thủ công.
- Luật D148: hộ thuộc HTX chưa có gói trả phí riêng chỉ tạo "vụ theo HTX". Giữ nguyên, gói miễn phí tính là "chưa trả phí".

## 3. Đề xuất gói "Khởi đầu" (miễn phí 12 tháng)

| Mục | Hộ Khởi đầu | HTX Khởi đầu |
|---|---|---|
| Giá / thời hạn | 0 đ, 365 ngày từ lúc đăng ký | 0 đ, 365 ngày |
| Vụ đang chạy | **1** | **1** |
| Khu / ô sản xuất | **1 khu, 1 ô** | **1 khu, 1 ô** |
| Người dùng | Chủ + **1** nhân viên | Chủ + 1 nhân viên |
| Nhật ký, ghi việc (có offline), thu hoạch, chi phí, doanh thu | **Có** (lõi để họ thấy giá trị) | Có |
| Kho vật tư | Bản gọn: nhập/xuất, **không** lô/hạn dùng | Như hộ |
| Tổng kết vụ | Xem trên màn hình | Xem trên màn hình |
| Xuất báo cáo (Excel/PDF) | Không (hoặc PDF có dòng "Tạo bằng AgriConnect") | Như hộ |
| Chấm công, lương, phân quyền chi tiết, giao việc nhiều tổ | Không | Không |
| Quản lý hộ thành viên | — | **Thêm được 1 hộ**; hộ đó có gói Khởi đầu riêng: 1 phân khu, 1 ô, 1 vụ riêng (D221) |
| Đọc ảnh bằng AI (hóa đơn, phiếu nhập kho...) | **2 lần/tháng** (D221) | 2 lần/tháng |
| Hiện trên website xúc tiến, công khai vụ, tin giao thương | **Có** (hồ sơ vẫn qua kiểm duyệt; D221) | Có |
| Dung lượng ảnh | Trần thấp (đề xuất 200 MB/cơ sở) | Như hộ |

Lý do chọn:
- Giữ nhật ký + chi phí + thu hoạch để người dùng **tự thấy lời/lỗ của vụ** — đó là thứ họ nhớ và kể lại cho người khác.
- Những thứ chỉ cần khi **làm lớn** (nhiều vụ, nhiều khu, nhiều người, chấm công, HTX nhiều hộ, xuất báo cáo) bị khóa; đó chính là lúc họ sẵn lòng trả tiền.
- Hiện trên website là **kênh kéo khách** miễn phí cho hộ và là quảng cáo cho hệ thống.
- Đối thủ biết cũng không sao: giá trị nằm ở dữ liệu người dùng đã nhập, quy trình mẫu, và đà cộng đồng.

### Khi hết 12 tháng
Chuyển sang **chỉ xem + xuất dữ liệu** (không ghi mới, vụ đang chạy vẫn xem được), nhắc trước 60/30/7 ngày. Quản trị có thể **gia hạn tay** cho người đáng giữ. Không xóa dữ liệu.

### Gói trả phí hiện có
Giữ nguyên bảng giá. Đề xuất đổi **dùng thử 30 ngày** thành "nâng cấp thử đầy đủ 30 ngày" **một lần** cho cơ sở đang ở gói Khởi đầu (bấm nút là được), để họ nếm đủ tính năng trước khi trả tiền.

## 4. Nâng cấp dễ và nhanh (phần quyết định doanh thu)

1. **Chạm trần là lúc bán hàng**: khi bấm tạo vụ thứ 2, thêm khu, thêm nhân viên thứ 2, xuất báo cáo… hiện hộp ngắn: "Gói Khởi đầu chỉ có 1 vụ. Muốn làm thêm? [Xem gói] [Gửi yêu cầu]". Không chặn kiểu cụt, không báo lỗi khó hiểu.
2. **Một chạm gửi yêu cầu**: dùng lại `plan_orders` (chọn gói, tự điền tên/SĐT cơ sở). Quản trị nhận thông báo, gọi/Zalo lại trong ngày.
3. **Thanh toán đơn giản**: chuyển khoản kèm mã đơn (VietQR có sẵn số tiền + nội dung); quản trị bấm xác nhận → gói bật ngay (đã có luồng kích hoạt). Giai đoạn sau mới nối cổng tự xác nhận (payOS/SePay).
4. Nút **Zalo/gọi điện** ở tab Hỗ trợ (đã có `contact_info`).
5. Trang quản trị: danh sách "cơ sở chạm trần" + "sắp hết hạn" để chủ sản phẩm **chủ động liên hệ** — khách tiềm năng nóng nhất.

## 5. Kỹ thuật (tóm tắt, làm sau khi duyệt)

Migration mới `..._app_free_plan.sql`:
- `plan_tiers` thêm `max_plots`, `max_staff`, `features jsonb` (bật/tắt tính năng); thêm 2 dòng gói Khởi đầu (giá 0); cho phép nhiều gói "mặc định khi đăng ký".
- Hàm kiểm hạn mức mở rộng (đang có kiểm số vụ): thêm kiểm số ô/khu, số nhân viên, và `plan_has_feature(org, 'xuat_bao_cao')…` ép **ở CSDL** (trigger/hàm), giao diện chỉ phản ánh.
- Đăng ký mới: tự cấp gói Khởi đầu (`status active`, 365 ngày) thay vì dùng thử 30 ngày + chờ duyệt.
- Hết hạn → trạng thái chỉ-đọc (chặn ghi mới ở CSDL, không chặn đọc/xuất).
- Test: hạn mức, tính năng bị khóa, hết hạn chỉ đọc, gia hạn tay, hộ thuộc HTX (D148) vẫn đúng.

Giao diện: hộp "chạm trần" dùng chung, dòng "Gói của bạn: Khởi đầu — còn X ngày" ở Cơ sở của tôi, màn nâng cấp ngắn.

## 6. Rủi ro và cách chặn

| Rủi ro | Cách xử lý |
|---|---|
| **Tạo nhiều tài khoản để lách trần 1 vụ** | Mỗi SĐT/email chỉ 1 cơ sở miễn phí; chống bot (Turnstile) khi đăng ký; chấp nhận rò rỉ nhỏ — người làm thật sẽ cần nhiều hơn |
| Đăng ký tự động làm **hết duyệt tay** → rác, hồ sơ bậy lên website | Tự duyệt tài khoản/dùng app; **hồ sơ lên website vẫn duyệt tay** (D7 giữ) |
| Gánh hỗ trợ khi hàng nghìn người miễn phí hỏi | Hướng dẫn ngắn trong app, trang câu hỏi thường gặp, hỗ trợ ưu tiên cho gói trả phí |
| Chi phí hạ tầng | Free tier Supabase có trần (dung lượng/ số người dùng hằng tháng). Cần tính dự báo: khi vượt vài nghìn cơ sở phải lên gói trả phí của Supabase (chi phí cố định nhỏ so với doanh thu 1–2 khách mua). Đặt trần ảnh, tắt AI cho miễn phí |
| Hết hạn rồi người dùng bỏ đi | Không xóa dữ liệu, chỉ xem/xuất; nhắc sớm; gia hạn tay có chọn lọc |

## 7. Đưa lên App Store và Google Play

Hiện app là PWA. Cách đóng gói:
- **Google Play**: đóng gói PWA thành ứng dụng Android (TWA / Bubblewrap) — nhanh, ít việc. Phí tài khoản nhà phát triển một lần ~25 USD.
- **App Store**: bắt buộc bọc bằng Capacitor và phải có tính năng "như ứng dụng" (thông báo đẩy, camera chụp ảnh…) vì Apple từ chối ứng dụng chỉ là website bọc lại. Phí 99 USD/năm; tài khoản **tổ chức** cần mã D-U-N-S (mất vài tuần), tài khoản cá nhân đơn giản hơn nhưng tên nhà phát triển là tên cá nhân.
- Cả hai nơi **bắt buộc**: chính sách riêng tư (có trang công khai), **xóa tài khoản ngay trong app**, khai báo dữ liệu thu thập, và tài khoản thử cho người duyệt (nên là một cơ sở mẫu có dữ liệu — đã có cơ chế tự duyệt nên thuận lợi).
- **Điểm cần kiểm tra kỹ trước khi nộp**: luật thanh toán của Apple/Google về việc bán gói trong app. Phương án an toàn: **bản trên cửa hàng KHÔNG hiện giá và KHÔNG có liên kết/nút thanh toán**; chỉ có thông tin "Liên hệ nhà cung cấp"; việc mua diễn ra ngoài (Zalo, web, điện thoại). Quy định thay đổi theo thời điểm, tôi sẽ đối chiếu lại lúc chuẩn bị hồ sơ nộp chứ không đoán trước.
- Thứ tự khuyến nghị: **Android PWA cài thẳng + Google Play trước**, iOS sau (khó và lâu hơn). Người dùng iPhone trong lúc chờ vẫn dùng bản web ("Thêm vào MH chính").

## 8. Lộ trình đề xuất

| Đợt | Nội dung | Ghi chú |
|---|---|---|
| A | Gói Khởi đầu: CSDL + hạn mức + đăng ký tự duyệt + hết hạn chỉ đọc + hộp chạm trần + gửi yêu cầu nâng cấp | Làm trước, cần `db push` |
| B | Quản trị: danh sách chạm trần/sắp hết hạn, gia hạn tay; trang giới thiệu + hướng dẫn cài app (để dán vào nhóm Facebook) | Có thể bắt đầu quảng bá bằng PWA từ đây |
| C | Chính sách riêng tư, xóa tài khoản, tài khoản thử cho người duyệt | Điều kiện để lên cửa hàng |
| D | Google Play, rồi App Store | Sau khi A–C ổn định vài tuần với người dùng thật |
| E | (Sau) tự xác nhận thanh toán, mời bạn bè, dấu "Tạo bằng AgriConnect" trên báo cáo | Tăng trưởng |

**Đừng quảng cáo rộng trước khi xong đợt A–B**: nếu người dùng đổ về mà đăng ký phải chờ duyệt, hoặc chạm trần mà không biết mua ở đâu, bạn mất đúng người cần giữ nhất.

## 9. Các con số/quyết định đề xuất chờ chủ sản phẩm duyệt

1. 1 vụ + **1 khu + 1 ô** + chủ và **1 nhân viên**: đồng ý hay muốn chỉ có chủ (chặt hơn)?
2. Báo cáo xuất: khóa hẳn, hay cho PDF có dòng "Tạo bằng AgriConnect" (kéo người mới)?
3. Hết 12 tháng: chỉ xem/xuất (đề xuất) hay cho gia hạn miễn phí thêm theo điều kiện?
4. ~~Nâng cấp thử đầy đủ 30 ngày~~ (đã bỏ, D221): có/không?
5. Đăng ký **tự duyệt**, chỉ hồ sơ lên website duyệt tay: đồng ý?
6. Tài khoản nhà phát triển App Store: tên cá nhân hay công ty (cần D-U-N-S)?

## Cập nhật 21/11/2026 (D221)
Chủ sản phẩm chỉnh: (1) HTX thêm được 1 hộ, hộ có 1 phân khu/1 ô/1 vụ riêng; (2) gói Khởi đầu được công khai vụ và tin giao thương; (3) đọc ảnh bằng AI cho dùng 2 lần mỗi tháng; (4) bỏ nâng cấp thử 30 ngày vì app chưa triển khai rộng.
