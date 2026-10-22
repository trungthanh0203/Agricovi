# Rà soát hiệu năng và an toàn website (W8, D71)

Ngày rà soát: 23/10/2026. Phạm vi: `apps/web` (website), `apps/webadmin` (quản trị website, phục vụ ở `/admin/`), phần CSDL mà website dùng. Ứng dụng (`apps/app`) chỉ được thêm tiêu đề bảo mật cơ bản.

## 1. Điều đã phát hiện và đã sửa

| # | Vấn đề | Hậu quả | Đã làm |
|---|---|---|---|
| 1 | **Ảnh nằm trong CSDL dạng data URL và bị nhúng thẳng vào HTML**; mọi lần đọc danh sách (nhà cung cấp, sản phẩm, vật tư, bài viết, banner) đều tải cả nội dung ảnh | Trang nặng hàng trăm KB đến vài MB, không lưu đệm được từng ảnh, tốn băng thông giữa Worker và CSDL | Migration **0051**: cột `has_image` tính sẵn, view nhẹ `public_profiles_lite` / `public_products_lite` (bỏ nội dung ảnh, giữ chú thích + cờ). Website phục vụ ảnh riêng ở **`/anh/…`** (ETag, 304, lưu đệm trình duyệt 5 phút + biên 1 giờ + làm mới ngầm 1 ngày); HTML chỉ chứa đường dẫn ảnh |
| 2 | **Không có gì bảo đảm trang được lưu đệm ở biên**: trang do Worker dựng ra chỉ được lưu đệm nếu chính Worker làm việc đó (tiêu đề `s-maxage` một mình không đủ) | Mỗi lượt xem có thể phải dựng lại trang và gọi CSDL | `src/middleware.ts` lưu đệm **ở biên bằng Cache API**: chỉ trang `public` có `s-maxage` (tối đa 1 giờ), không bao giờ lưu trang riêng tư; có bản `/en/` riêng |
| 3 | Trang riêng tư (giỏ, đơn, tài khoản…) không khai báo rõ không lưu đệm | Rủi ro bị lưu đệm nhầm bởi lớp trung gian | Gửi `Cache-Control: private, no-store`; dữ liệu cá nhân chỉ tải ở trình duyệt qua hàm có kiểm quyền (đã là nguyên tắc từ W3) |
| 4 | Mỗi trang khi đã đăng nhập gọi 3 lệnh (thông báo chưa đọc, giỏ, yêu thích) | Thêm độ trễ và tải CSDL | Gộp còn **1** lệnh `web_shell_counts()`; danh sách yêu thích chỉ tải ở trang có nút "Lưu" |
| 5 | Thiếu chỉ mục cho truy vấn mới (huy hiệu, đơn theo hồ sơ, vụ công khai theo cơ sở, thông báo chưa đọc) | Chậm dần khi dữ liệu tăng | Thêm 5 chỉ mục ở 0051 |
| 6 | **Thiếu tiêu đề bảo mật** (CSP, chống nhúng khung, nosniff, HSTS, Referrer-Policy, Permissions-Policy) | Dễ bị nhúng/giả mạo giao diện, hạ tầng không có lớp phòng thủ thứ hai khi có lỗi XSS | Gắn ở `middleware.ts` cho mọi trang Astro và `public/_headers` cho `/admin/*`; CSP chỉ cho phép script/kiểu của chính website, kết nối tới chính website và Supabase, không cho nhúng khung, không `object`, `form-action 'self'` |
| 7 | **Hàm trigger** mặc định ai (kể cả khách) cũng có quyền EXECUTE | Bề mặt gọi thừa | Thu hồi hàng loạt ở 0051; trigger vẫn chạy (đã kiểm thử các bộ test cũ) |
| 8 | Chưa có "hợp đồng" kiểm soát những gì khách đọc/gọi được | Thêm bảng/hàm mới có thể vô tình lộ ra | Test **`anon_surface.test.mjs`**: danh sách chính xác bảng/view và hàm khách được dùng; thêm cái mới mà quên cập nhật danh sách hoặc quên `revoke … from public, anon` thì test báo lỗi |

## 2. Điều đã kiểm tra và không cần sửa

- **XSS**: mọi chữ do người dùng nhập đưa vào HTML đều qua `esc()`; liên kết lấy từ nội dung quản trị qua `safeHref()`; ảnh qua `img()` (chỉ `data:image/jpeg|png|webp` hoặc `/anh/…`). Đã rà toàn bộ mẫu chuỗi trong `apps/web/src` (321 vị trí chèn): không thấy chỗ nào chèn chưa mã hóa dữ liệu của người dùng. Bản dịch tiếng Anh do quản trị nhập cũng bị mã hóa `<`, `>`, `&` khi chèn (có test).
- **Quyền dữ liệu**: dữ liệu riêng (đơn, giỏ, tài khoản, địa chỉ, thông báo, báo giá gốc, đánh giá gốc, liên hệ) chỉ qua hàm có `web_guard()`; test `anon_surface` khẳng định khách không đọc được trực tiếp.
- **Chống lạm dụng**: yêu cầu báo giá, tin nhắn, đăng tin, đơn hàng, báo cáo vi phạm đều có giới hạn tần suất ở CSDL. Chuyển hướng sau đăng nhập chỉ nhận đường dẫn nội bộ (`nextUrl`).
- **Ảnh phục vụ**: chỉ jpeg/png/webp đúng định dạng, `Content-Security-Policy: default-src 'none'` và `nosniff` trên từng ảnh, mã đối tượng phải đúng dạng UUID, chỉ đọc bằng khóa anon nên vẫn chịu chính sách RLS (nội dung đã đăng).
- **Phông chữ/script ngoài**: website không nạp tài nguyên từ bên thứ ba (phông hệ thống) nên CSP chặt được.

## 3. Việc nên làm tiếp (chưa làm, có lý do)

1. **Chuyển ảnh sang kho riêng (Supabase Storage hoặc Cloudflare R2)** — đã nằm trong kế hoạch G2-1. Khi đó `/anh/…` chỉ cần chuyển hướng tới kho; nên tạo ảnh thu nhỏ nhiều kích cỡ. Hiện đã đỡ nhiều nhờ bước 1 ở trên.
2. **Quy tắc giới hạn tần suất ở Cloudflare (WAF/Rate limiting)** cho `/dang-ky`, `/dang-nhap`, `/bao-gia`, `/anh/…`: cấu hình trên bảng điều khiển, không nằm trong mã. Giới hạn ở CSDL đã có nhưng chặn ở biên rẻ hơn.
3. **Turnstile (chống robot)** cho biểu mẫu đăng ký và báo giá khi lượng truy cập thật tăng (khóa `PUBLIC_TURNSTILE_SITE_KEY` đã có sẵn tên trong cấu hình, chưa dùng).
4. **CSP chặt hơn** (bỏ `unsafe-inline`) cần đổi cách Astro nhúng script (dùng hash/nonce); làm khi có thời gian, hiện đã khóa nguồn tải.
5. **Đo thật trên điện thoại cấu hình thấp, mạng 3G** (Lighthouse/WebPageTest) sau khi triển khai; số liệu ở đây là phân tích thiết kế, chưa phải số đo.
6. **Đưa HTML/ảnh qua gói nén Brotli** đã do Cloudflare tự làm; không cần thêm.

## 4. Cách kiểm tra sau khi triển khai

- Mở một trang bất kỳ, xem tiêu đề phản hồi: có `content-security-policy`, `x-frame-options`, `x-content-type-options`; lần thứ hai có `x-edge-cache: HIT`.
- Xem một trang có ảnh: HTML không còn `data:image/...`, ảnh tải từ `/anh/...`.
- Mở `/en/` và bấm nút VI/EN ở đầu trang.
- Chạy `npm run test:db:file -- supabase/tests/anon_surface.test.mjs` sau mỗi migration có thêm bảng/hàm.
