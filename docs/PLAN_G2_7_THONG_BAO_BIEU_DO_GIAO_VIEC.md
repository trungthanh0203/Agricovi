# Kế hoạch G2-7 — Giao việc, thông báo đẩy, biểu đồ (và báo cáo định kỳ) (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: D40 (giao việc, "việc được giao" ở Tài khoản), D58-7 (thông báo đẩy ưu tiên: công chờ xác nhận, nhắc việc theo ngày, công nợ đến hạn), D35 (nhắc việc theo ghi chú ngày), D41/D48 (số liệu Trang chủ, báo cáo theo nhu cầu), D76–D78 (công nợ, đơn website), `PLAN_GIAI_DOAN_2_APP.md`.
Trạng thái: **phần BIỂU ĐỒ (C1, C2, C3) đã làm xong về code ngày 23/10/2026** (chủ sản phẩm chọn làm trước; D79, migration 0061). Giao việc (T1–T2), thông báo (N1–N4) **chưa làm**, chờ duyệt mục 8. **Báo cáo tuần (N4) đã làm ở dạng tính khi mở (D80, migration 0062); chỉ còn thông báo sáng thứ Hai chờ các lát thông báo.** Giao việc và thông báo: chủ sản phẩm chọn làm sau.

Ba việc độc lập nhau về kỹ thuật nhưng **liên kết về giá trị**: giao việc và công nợ/đơn tạo ra "việc cần nhắc", thông báo đẩy là cách nhắc, biểu đồ là cách nhìn nhanh số liệu. Vì vậy chia thành các lát nhỏ có thể làm, thử và dùng độc lập (mục 6).

## 1. Hiện trạng đã kiểm tra

- Đã có: ghi chú nhắc việc theo ngày (Trang chủ → Nhắc việc), khối "Tôi cần làm" (công chờ xác nhận, ca đang mở, giấy phép sắp hết hạn, hóa đơn mua và khoản phải thu quá hạn), tổ lao động có tổ trưởng, báo cáo theo nhu cầu có xuất CSV.
- Chưa có: giao việc cho người/tổ; thông báo đẩy ra điện thoại (app dùng Service Worker sinh tự động, không có mã xử lý `push`); biểu đồ (mọi số liệu là bảng và thẻ số); thông báo trong app (chuông).
- Website đã có bảng thông báo riêng (`notifications`) cho người dùng website. **App dùng bảng riêng `app_notifications`** để không đụng phần website (đường dẫn trong thông báo của app trỏ vào màn trong app).

## 2. GIAO VIỆC

**Mục tiêu:** chủ/quản lý giao một đầu việc cho một người hoặc cả một tổ, người nhận thấy ở Trang chủ, làm xong thì ghi việc và tự đánh dấu hoàn thành.

**Dữ liệu (migration `..._app_*`):**
- Bảng `task_assignments`: cơ sở; vụ và giai đoạn (không bắt buộc); loại việc (chọn từ Đầu việc, hoặc chữ tự do); tiêu đề và chi tiết; **hạn làm (ngày)**; mức ưu tiên (thường/gấp); **người nhận** (một lao động, kể cả lao động không có tài khoản do tổ trưởng chấm hộ) **hoặc một tổ**; trạng thái (đang làm / xong / hủy); ai giao, lúc nào; ai làm xong, lúc nào, ghi chú; phiên bản + mã thao tác (sửa/hủy có kiểm tra xung đột như các mục khác).
- Cột `task_id` (không bắt buộc) trên nhật ký việc: khi người nhận **ghi việc từ nút "Làm việc này"**, nhật ký mang mã việc và **máy chủ tự đánh dấu xong** (kể cả khi ghi lúc mất mạng rồi đồng bộ sau, đúng quy tắc offline D24).
- Quyền: **chủ và quản lý** giao cho mọi người; **tổ trưởng** giao cho người trong tổ mình; người nhận chỉ xem việc của mình/tổ mình; quản lý xem tất cả. Không thêm mục quyền riêng.

**Màn hình:**
- **Sản xuất → Giao việc** (đặt sau Mùa vụ): tạo việc (chọn người hoặc tổ, vụ/giai đoạn, đầu việc, hạn, ghi chú), danh sách theo trạng thái (Đang làm, Quá hạn, Đã xong, Đã hủy), sửa/hủy, xem ai đã làm.
- **Trang chủ → khối "Việc được giao cho tôi"** (đứng đầu "Tôi cần làm"): việc của tôi và của tổ tôi, hạn, nút **Làm việc này** (mở Ghi việc điền sẵn vụ, giai đoạn, đầu việc, nội dung = tiêu đề) và **Đánh dấu xong** (khi việc không cần ghi nhật ký).
- **Tài khoản → Việc được giao** (đủ lịch sử của tôi), **Lịch của vụ** có dấu việc được giao theo ngày hạn.

**Không làm lần này:** việc lặp lại theo lịch, chuỗi phê duyệt, giao việc cho cả cơ sở khác.

## 3. THÔNG BÁO

Hai tầng, tầng 1 làm trước vì không cần hạ tầng ngoài:

**Tầng 1 — hộp thông báo trong app (chuông 🔔 ở thanh trên):** bảng `app_notifications` (người nhận, loại, tiêu đề, nội dung ngắn, màn đích trong app, đã đọc, thời điểm), hàng đợi `notification_outbox`, hàm tạo thông báo có **khóa chống trùng** (cùng loại, cùng người, cùng ngày thì không tạo lại). Có số chưa đọc, đánh dấu đã đọc, bấm là mở đúng màn.

**Tầng 2 — thông báo đẩy ra điện thoại (Web Push):**
- **Dữ liệu:** `push_subscriptions` (mỗi thiết bị của mỗi người một dòng: địa chỉ đẩy, khóa; riêng tư theo người dùng), `notification_prefs` (bật/tắt từng loại, giờ im lặng).
- **Trong app:** chuyển Service Worker sang dạng tự viết (vẫn giữ lưu sẵn để dùng offline và chặn `/quan-tri/`), thêm xử lý `push` và `notificationclick` (bấm là mở đúng màn). Nút **Bật thông báo** ở Tài khoản → Thông báo, **chỉ xin quyền khi người dùng bấm**, không bao giờ xin ngay lúc mở app; hiện rõ trạng thái (đang bật / bị chặn / máy không hỗ trợ) và hướng dẫn bật lại.
- **Máy chủ:** Edge Function `send-push` (khóa VAPID chỉ nằm ở máy chủ) gửi theo hàng đợi, tự xóa thiết bị đã hết hạn; lịch chạy bằng `pg_cron` + `pg_net` (hàng đợi mỗi phút; tạo nhắc việc hằng ngày lúc 7 giờ sáng giờ Việt Nam).
- **Loại thông báo (mặc định bật), theo thứ tự đã chốt ở D58-7 rồi bổ sung:**
  1. **Công chờ xác nhận** (cho tổ trưởng/quản lý/chủ): tóm tắt theo giờ, không gửi từng ca.
  2. **Nhắc việc theo ngày**: ghi chú nhắc đến hạn, **việc được giao** mới và đến hạn/quá hạn.
  3. **Công nợ đến hạn**: hóa đơn mua và khoản phải thu quá hạn hoặc trong 3 ngày tới.
  4. **Đơn và yêu cầu báo giá mới từ website** (cho người xử lý website).
  5. Giấy phép sắp hết hạn (30 ngày và 7 ngày).
- **Riêng tư:** nội dung đẩy **không ghi số tiền và tên khách** (hiện trên màn hình khóa), chỉ ví dụ "Có 2 hóa đơn mua quá hạn"; chi tiết xem trong app. Giờ im lặng mặc định 21:00–06:00 (trừ khi đặt khác); mỗi loại tắt được.
- **Giới hạn kỹ thuật phải nói thẳng:**
  - **Android + Chrome:** hoạt động tốt.
  - **iPhone:** chỉ nhận được khi app đã **thêm vào Màn hình chính** (iOS 16.4 trở lên) và người dùng cho phép; nếu không thì chỉ có chuông trong app. App hiện hướng dẫn thêm vào Màn hình chính.
  - Thông báo đẩy **không bảo đảm tới nơi** (tiết kiệm pin, mất mạng). Vì vậy mọi việc quan trọng **vẫn hiện ở "Tôi cần làm" và chuông**, không chỉ dựa vào đẩy.
- **Chi phí:** Web Push không tính phí; Edge Function và `pg_cron` nằm trong gói Supabase. Cần bạn bật hai tiện ích `pg_cron` và `pg_net` (Database → Extensions) và tạo khóa VAPID (một lệnh).

## 4. BIỂU ĐỒ

**Cách làm:** viết **thành phần biểu đồ riêng bằng SVG** (cột, đường, bánh/vòng, thanh tiến độ), không thêm thư viện lớn: nhẹ, nhanh, nằm trong gói tải lười của Báo cáo, có chế độ tối, có **bản bảng thay thế** cho người dùng trình đọc màn hình, màu có kèm chữ (đúng `DESIGN_DASHBOARD.md`).

**Nơi dùng (từng bước):**
1. **Báo cáo theo nhu cầu:** nút chuyển **Bảng | Biểu đồ**; nhóm theo tháng/ngày thì cột hoặc đường, nhóm theo loại/khách/nhà cung ứng thì cột ngang hoặc vòng.
2. **Trang chủ:** thẻ **"Xu hướng 6 tháng"** (chi phí so với doanh thu, thu hoạch). Số liệu tính **ở máy chủ theo kỳ đầy đủ** (hàm mới `get_period_series`, kiểm quyền theo mục) thay vì chỉ 200 bản ghi gần nhất như hiện nay (D41).
3. **Tổng kết vụ:** vòng cơ cấu chi phí, giá thành mỗi kg so với kỳ trước.
4. **Công nợ:** thanh tuổi nợ (quá hạn / sắp đến hạn / còn hạn) cho phải trả và phải thu.
5. **Chấm công/tiền công:** giờ công theo người hoặc theo tổ (bộ lọc **theo người/tổ** đã nêu ở kế hoạch Giai đoạn 2).

## 5. BÁO CÁO ĐỊNH KỲ (tùy chọn, làm sau cùng)

Tóm tắt **mỗi tuần** (sáng thứ Hai 7 giờ) cho chủ cơ sở: số việc đã ghi, thu hoạch, chi phí, doanh thu, công nợ quá hạn, vụ trễ tiến độ. Gửi dưới dạng **một thông báo trong app (và đẩy nếu bật)** trỏ vào màn Báo cáo, **không gửi email** (không cần dịch vụ thư). Bật/tắt trong Tài khoản → Thông báo. Làm sau khi thông báo đẩy chạy ổn.

## 6. Các lát nhỏ, thứ tự đề xuất

| Lát | Nội dung | Cỡ | CSDL | Cần bạn làm |
|---|---|---|---|---|
| T1 | **Giao việc**: bảng, hàm giao/sửa/hủy, tự hoàn thành khi ghi việc, test quyền | L | Có | — |
| T2 | **Giao việc**: màn Giao việc, khối ở Trang chủ, Tài khoản, dấu trên Lịch vụ, nút "Làm việc này" | L | Không | — |
| N1 | **Chuông thông báo trong app** + `app_notifications`, hàng đợi, chống trùng; sinh thông báo cho việc mới được giao | M | Có | — |
| N2 | **Thông báo đẩy**: Service Worker tự viết, đăng ký thiết bị, `send-push`, bật/tắt và giờ im lặng | L | Có | Tạo khóa VAPID, bật `pg_cron` + `pg_net`, deploy hàm, thử trên Android và iPhone |
| N3 | **Các loại thông báo tự sinh**: công chờ xác nhận, nhắc việc, công nợ, đơn website, giấy phép | M | Có | — |
| C1 | **Biểu đồ trong Báo cáo theo nhu cầu** (thành phần SVG, chuyển Bảng/Biểu đồ) | M | Không | — |
| C2 | **Biểu đồ Trang chủ và tổng kết vụ** + hàm `get_period_series` | M | Có | — |
| C3 | Biểu đồ công nợ, giờ công theo người/tổ | S–M | Không/nhỏ | — |
| N4 | **Báo cáo định kỳ hằng tuần** | S–M | Có | — |

**Thứ tự gợi ý:** T1 → T2 → N1 → N2 → N3 → C1 → C2 → C3 → N4.
Lý do: giao việc và chuông trong app dùng được ngay, không phụ thuộc hạ tầng ngoài; thông báo đẩy cần bạn thiết lập và thử trên điện thoại thật nên đặt sau khi đã có thứ để nhắc; biểu đồ độc lập, có thể chen vào bất cứ lúc nào (C1 rất nhẹ). Nếu bạn muốn thấy kết quả đẹp mắt sớm, có thể đưa C1–C2 lên trước N2.

## 7. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| iPhone không nhận được thông báo đẩy | Hướng dẫn thêm vào Màn hình chính; chuông trong app và "Tôi cần làm" luôn có |
| Thông báo quá nhiều làm phiền | Khóa chống trùng, gộp theo giờ/ngày, giờ im lặng, tắt từng loại |
| Lộ thông tin trên màn hình khóa | Nội dung đẩy không có số tiền, tên khách; chi tiết trong app |
| Đổi Service Worker làm hỏng chạy offline hoặc cập nhật app | Giữ đúng cấu hình lưu sẵn hiện có; thử kỹ chạy offline và cập nhật bản mới; làm riêng lát N2 |
| Giao việc nhầm người hoặc người nhận không biết | Thông báo ngay khi giao; hiện "ai giao, lúc nào"; người giao hủy/sửa được |
| Biểu đồ nặng làm chậm app | Thành phần SVG tự viết, tải lười cùng tab Báo cáo; không thêm thư viện |
| Hai chat dẫm nhau ở thông báo | App dùng bảng `app_notifications` riêng; không sửa `notifications` của website |

## 8. Cần bạn xác nhận

1. **Thứ tự làm** T1 → T2 → N1 → N2 → N3 → C1 → C2 → C3 → N4 (hoặc đưa biểu đồ lên trước)?
2. **Ai được giao việc**: chủ và quản lý giao cho mọi người, tổ trưởng giao cho người trong tổ; giao cho một người **hoặc cả tổ**?
3. **Lao động không có tài khoản** (chấm hộ) cũng nhận việc được giao, do tổ trưởng/quản lý theo dõi và đánh dấu xong?
4. **Nội dung đẩy không ghi số tiền, tên khách**, giờ im lặng mặc định 21:00–06:00?
5. **Loại thông báo mặc định bật**: 5 loại ở mục 3 có đủ chưa, hay muốn thêm/bớt (ví dụ kho sắp hết)?
6. **Không gửi email**, chỉ dùng chuông trong app và thông báo đẩy?
7. **Báo cáo định kỳ hằng tuần** (sáng thứ Hai 7 giờ): làm ở lát cuối, đồng ý?
8. **Biểu đồ tự vẽ bằng SVG**, không dùng thư viện biểu đồ ngoài?
9. Bạn sẵn sàng làm các việc thiết lập ở lát N2 (khóa VAPID, bật `pg_cron` và `pg_net`, deploy hàm, thử trên Android và iPhone)?
