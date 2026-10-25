# Triển khai tên miền agricovi.com (thương hiệu Agricovi — Kết nối nông nghiệp Việt)

Mô hình địa chỉ (D74):

| Địa chỉ | Là gì | Worker trên Cloudflare |
|---|---|---|
| `https://agricovi.com` (và `www.agricovi.com` chuyển về đây) | Website công khai + quản trị website ở `/admin/` | `agriconnect` (giữ nguyên tên) |
| `https://app.agricovi.com` | Ứng dụng quản lý cơ sở + quản trị nền tảng ở `/quan-tri/` | `agricovi` (giữ nguyên tên) |
| `lienhe@agricovi.com` | Nhận thư liên hệ | Cloudflare Email Routing |
| `noreply@agricovi.com` | Gửi thư xác nhận/đặt lại mật khẩu | Dịch vụ gửi thư (SMTP) |

Địa chỉ cũ `*.workers.dev` **vẫn chạy song song** (mã QR đã in và app đã cài từ địa chỉ cũ không hỏng). Không đổi tên Worker: đổi tên sẽ tạo Worker mới và mất gắn kết tên miền.

Làm theo thứ tự. Bước 1–4 là bắt buộc để website/app chạy trên tên miền; bước 5–10 làm ngay sau đó.

## Bước 1. Đưa tên miền về Cloudflare
1. Đăng nhập Cloudflare → **Add a domain** (Onboard a domain) → nhập `agricovi.com` → chọn gói **Free**.
2. Cloudflare cho **2 nameserver** (dạng `xxx.ns.cloudflare.com`). Vào trang quản lý nơi bạn mua tên miền → mục **Nameservers / DNS** → đổi sang 2 nameserver đó. (Mua ở Cloudflare Registrar thì bỏ qua bước này.)
3. Chờ trạng thái **Active** (thường vài phút, tối đa 24 giờ). Khi Active mới làm tiếp.
4. Trong **SSL/TLS** chọn chế độ **Full (strict)**; bật **Always Use HTTPS** (SSL/TLS → Edge Certificates).

## Bước 2. Gắn `app.agricovi.com` cho ứng dụng
Cloudflare → **Workers & Pages** → chọn Worker **`agricovi`** → **Settings → Domains & Routes → Add → Custom domain** → nhập `app.agricovi.com` → Add. Cloudflare tự tạo bản ghi DNS và chứng chỉ HTTPS (1–5 phút). Mở `https://app.agricovi.com` kiểm tra thấy màn đăng nhập app.

## Bước 3. Gắn `agricovi.com` cho website
1. Worker **`agriconnect`** → **Settings → Domains & Routes → Add → Custom domain**: thêm `agricovi.com`, rồi thêm tiếp `www.agricovi.com`.
2. Chuyển `www` về tên chính (để Google không coi là 2 website): Cloudflare → tên miền `agricovi.com` → **Rules → Redirect Rules → Create rule**:
   - Tên: `www về agricovi.com`; điều kiện: *Hostname* **equals** `www.agricovi.com`.
   - Then: **Dynamic**, biểu thức `concat("https://agricovi.com", http.request.uri.path)`, mã **301**, bật **Preserve query string** → Deploy.
3. Mở `https://agricovi.com` thấy website; `https://agricovi.com/admin/` thấy đăng nhập quản trị website; `https://agricovi.com/en/` là bản tiếng Anh.

## Bước 4. Cập nhật mã và triển khai lại (tôi đã sửa sẵn trong kho)
Trong kho đã đổi: tên thương hiệu thành **Agricovi**, khẩu hiệu "Kết nối nông nghiệp Việt", và địa chỉ trong `apps/app/.env.production` (`VITE_APP_URL=https://app.agricovi.com`, `VITE_PUBLIC_SITE_URL=https://agricovi.com`, `VITE_WEBADMIN_URL=https://agricovi.com/admin/`) và `apps/web/.env.production` (`PUBLIC_APP_URL=https://app.agricovi.com`). Bạn chỉ cần:
1. `git push` (Cloudflare tự build cả hai Worker; app dùng lệnh deploy `npm run deploy:app` như đã cấu hình).
2. Nếu chưa đẩy các migration mới: `npx supabase db push` (cần đủ đến 0053) rồi deploy website.
3. Kiểm tra: chân trang website có nút "Mở trên điện thoại" trỏ `app.agricovi.com`; mã QR của vụ mới tạo dẫn tới `https://agricovi.com/truyxuat/…`.

## Bước 5. Cho phép địa chỉ mới đăng nhập (Supabase)
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://app.agricovi.com`
- **Redirect URLs** (mỗi dòng một địa chỉ): `https://app.agricovi.com/**`, `https://agricovi.com/**`, `https://www.agricovi.com/**`. Giữ các dòng `workers.dev` đến khi mọi người đã chuyển.

Hàm `staff-accounts` và `web-accounts` cho phép gọi từ mọi địa chỉ nên **không cần sửa**.

## Bước 6. Tên miền email ẩn của tài khoản nhân viên (`login_email_domain`)
Tài khoản nhân viên và người đăng ký bằng số điện thoại dùng email ẩn dạng `0912345678@sdt.<tên miền>`. Giờ `agricovi.com` đã là của bạn nên dùng được an toàn.
- **Đã có tài khoản điện thoại rồi** (dù là tên miền cũ hay `example.com`): **không đổi gì**; tài khoản cũ giữ email cũ, vẫn đăng nhập bình thường.
- **Dự án thật mới, chưa có tài khoản điện thoại nào**: chạy một lần ở Supabase → SQL Editor:
  ```sql
  update platform_settings set value = '"agricovi.com"' where key = 'login_email_domain';
  ```
- **Quy tắc bắt buộc:** không bao giờ tạo bản ghi MX hay "catch-all" cho `sdt.agricovi.com` (hay `*.agricovi.com`). Nhờ đó không ai nhận được thư gửi tới các địa chỉ ẩn này. Nhận thư thật chỉ ở các địa chỉ cụ thể như `lienhe@agricovi.com` (bước 8).

## Bước 7. Gửi thư xác nhận từ `noreply@agricovi.com` (SMTP)
Dịch vụ thư mặc định của Supabase chỉ cho vài thư mỗi giờ nên cần SMTP riêng trước khi mở cho người dùng thật.
1. Tạo tài khoản ở một dịch vụ gửi thư giao dịch (Resend, Brevo hoặc Amazon SES — gói miễn phí đủ lúc đầu). Thêm tên miền `agricovi.com` (hoặc `mail.agricovi.com`) và làm theo hướng dẫn: nó sẽ đưa **bản ghi DNS (SPF, DKIM, thường cả DMARC)**.
2. Cloudflare → **DNS → Records** → thêm đúng các bản ghi đó (loại TXT/CNAME; với CNAME chọn **DNS only** — mây xám). Chờ dịch vụ báo *Verified*.
3. Supabase → **Authentication → SMTP Settings → Enable custom SMTP**: *Sender email* `noreply@agricovi.com`, *Sender name* `Agricovi`, Host/Port/Username/Password lấy từ dịch vụ thư.
4. Supabase → **Authentication → Email Templates**: sửa các mẫu "Confirm signup" và "Reset password" sang tiếng Việt, ký tên Agricovi.
5. Thử đăng ký một email mới ở `https://agricovi.com/dang-ky/` và đặt lại mật khẩu: thư phải đến hộp thư chính (không vào thư rác).

## Bước 8. Nhận thư liên hệ `lienhe@agricovi.com`
Cloudflare → tên miền → **Email → Email Routing → Enable** (tự thêm bản ghi MX/SPF cho tên miền chính). Tạo địa chỉ `lienhe@agricovi.com` → chuyển tiếp tới Gmail của bạn → bấm liên kết xác nhận trong Gmail. **Không bật Catch-all.** (Bản ghi MX này chỉ áp dụng cho `agricovi.com`, không ảnh hưởng quy tắc ở bước 6.)

## Bước 9. Cập nhật nội dung hiển thị (Quản trị website)
Vào `https://agricovi.com/admin/` → **Thông tin chung** và sửa:
- Tên thương hiệu: `Agricovi`; khẩu hiệu: `Kết nối nông nghiệp Việt` (nếu trước đó đã lưu giá trị cũ thì giá trị đã lưu thắng mặc định).
- Hotline, email `lienhe@agricovi.com`, địa chỉ, đơn vị vận hành, bản quyền (ví dụ `© 2026 Agricovi`), các liên kết mạng xã hội.
- Rà **Trang tĩnh**, **Banner**, **Menu**, **Bài viết** xem còn chữ "AgriConnect" thì sửa. Vào **Bản dịch tiếng Anh** kiểm tra mục "Chữ còn thiếu".

## Bước 10. Bảo vệ trang quản trị (khuyến nghị mạnh)
Cloudflare → **Zero Trust → Access → Applications → Add → Self-hosted**: tạo hai ứng dụng, mỗi cái cho phép đúng email nhân sự của bạn (kiểu *One-time PIN*, miễn phí đến 50 người):
- `agricovi.com/admin/*`
- `app.agricovi.com/quan-tri/*`

Đây là lớp bảo vệ thứ hai ngoài việc đăng nhập và phân quyền ở CSDL.

## Bước 11. Công cụ tìm kiếm và chia sẻ
- **Google Search Console** → thêm thuộc tính *Domain* `agricovi.com` (xác minh bằng bản ghi TXT ở Cloudflare DNS) → gửi sơ đồ trang `https://agricovi.com/sitemap.xml` (đã có cả bản `/en/`).
- Dán thử một đường dẫn sản phẩm vào Zalo/Facebook để kiểm tra ảnh và tiêu đề hiển thị.

## Bước 12. Người dùng đã cài app cũ
Ứng dụng cài từ địa chỉ `workers.dev` là bản riêng, **dữ liệu chưa đồng bộ không chuyển sang địa chỉ mới**. Nhờ mọi người mở app cũ khi có mạng cho đồng bộ hết (không còn "chờ gửi"), rồi mở `https://app.agricovi.com`, đăng nhập và "Thêm vào màn hình chính" lại; sau đó gỡ app cũ. Giữ địa chỉ cũ chạy thêm vài tuần.

## Danh sách kiểm tra cuối
- [ ] `agricovi.com`, `www.agricovi.com` (chuyển về tên chính), `app.agricovi.com` mở được bằng HTTPS.
- [ ] `agricovi.com/admin/` và `app.agricovi.com/quan-tri/` đăng nhập được và đã bật Access.
- [ ] Supabase: Site URL + Redirect URLs đúng; SMTP riêng gửi thư tới hộp thư chính.
- [ ] Không có MX/catch-all cho `sdt.agricovi.com` hay `*.agricovi.com`.
- [ ] Quản trị website → Thông tin chung đã là Agricovi; không còn chữ AgriConnect trên trang.
- [ ] Đã đăng ký Search Console và gửi sitemap.
- [ ] Còn việc pháp lý P7 trước khi mở đặt hàng cho người dùng thật (chưa liên quan tên miền).

## Nếu có sự cố
- *Mở tên miền báo lỗi 522/1014/"chưa có Worker"*: kiểm tra tên miền ở trạng thái Active (bước 1) và đã **Add custom domain** đúng Worker (bước 2–3).
- *Đăng nhập xong quay về địa chỉ lạ hoặc báo "redirect not allowed"*: bước 5 thiếu địa chỉ.
- *Thư xác nhận không đến*: kiểm tra SMTP (bước 7) và thư rác; xem Supabase → Logs → Auth.
- Muốn quay lại tạm thời: dùng địa chỉ `workers.dev` cũ (vẫn chạy).
