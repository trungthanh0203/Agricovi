# Quyết định CHUNG (nền tảng, gói, tài khoản, hạ tầng)

Quyết định dùng cho cả app lẫn website. Phần riêng: `DECISIONS_APP.md`, `DECISIONS_WEB.md`. Mục **[GIẢ ĐỊNH]** là cách đội phát triển hiểu khi triển khai, chờ chủ sản phẩm xác nhận.

| # | Quyết định | Ngày | Nguồn | Tác động |
|---|---|---|---|---|
| D1 | App là PWA; hạ tầng GitHub + Supabase + Cloudflare; mua domain trước khi pilot | 18/10/2026 | Chủ sản phẩm | v1.2 mục 2 |
| D2 | Chấm công/lương là module trong app sản xuất; tính theo **giờ** cộng dồn theo tháng và theo **sản lượng**; bỏ quy đổi giờ-ngày công | 18/10/2026 | Chủ sản phẩm | v1.2 mục 7 |
| D3 | Cây đầu tiên: dưa lưới | 18/10/2026 | Chủ sản phẩm | v1.2 mục 8 |
| D4 | Gói theo **số vụ đang chạy cùng lúc**; Hộ 2 vụ 300k/quý, 5 vụ 500k/quý; HTX 5 vụ 1.500k/quý, 10 vụ 3.000k/quý; dùng thử 1 tháng; mọi giá trị cấu hình trong CSDL | 18/10/2026 | Chủ sản phẩm | v1.2 mục 3 |
| D5 | Vụ *Tạm dừng* tính vào hạn mức; dùng thử giới hạn như gói cơ bản | 18/10/2026 | Chủ sản phẩm | v1.2 mục 3.1 |
| D6 | HTX khai báo số hộ tùy ý, hạn mức chỉ theo tổng vụ; mỗi hộ tối đa 1 HTX; hộ có thể dùng cả gói HTX lẫn gói riêng | 18/10/2026 | Chủ sản phẩm | v1.2 mục 4 |
| D7 | Vị trí top website: cách (a) — mọi cơ sở đã duyệt đều hiện, gói trả phí chỉ ưu tiên thứ tự | 18/10/2026 | Chủ sản phẩm | v1.2 mục 5 |
| D8 | **Hộ chỉ có 1 cơ sở**; **HTX thêm được nhiều cơ sở** (hộ thành viên) | Sau pilot thử bước 6 | Chủ sản phẩm | Migration 0010 |
| D9 | Đưa app cho người dùng thật thử **sau khi xong bước C** (kho, chi phí, thu hoạch, tổng kết vụ) | Sau pilot thử bước 6 | Chủ sản phẩm | Lộ trình |
| D11 | Nhân viên đăng nhập bằng **số điện thoại**; chủ cơ sở tạo tài khoản; mật khẩu tạm do **hệ thống sinh ngẫu nhiên**, hiện một lần; nhân viên **bắt buộc đổi** ở lần đầu | Sau bước A | Chủ sản phẩm | Migration 0011, Edge Function `staff-accounts` |
| D12 | Chủ Hộ/HTX tự đăng ký bằng **email** (chưa dùng số điện thoại/OTP) | Sau bước A | Chủ sản phẩm | — |
| D13 | Tên miền ghép email ẩn là **cấu hình trong CSDL** (`platform_settings.login_email_domain`), tạm `agricovi.com`; đổi sau khi có tên miền thật | Sau bước A | Chủ sản phẩm | Tài khoản cũ giữ email đã lưu |

## Cách tôi triển khai D11–D14 (đã làm, migration 0011 + Edge Function)

- Số điện thoại được ghép thành email ẩn `<sdt>@sdt.<tên miền>`; người dùng chỉ thấy ô "Số điện thoại".
- Hệ thống sinh mật khẩu tạm 8 ký tự ngẫu nhiên (bỏ ký tự dễ nhầm). Hết hạn sau 7 ngày (`staff_temp_password_days`).
- **Máy chủ khóa dữ liệu** của tài khoản nhân viên cho tới khi mật khẩu được đổi thật sự (so sánh băm trong Auth), không chỉ ẩn ở giao diện. Mật khẩu tạm hết hạn thì chủ phải đặt lại.
- Tài khoản nhân viên **không tự tạo cơ sở**; mỗi số điện thoại chỉ dùng cho một tài khoản nhân viên.
- Quên mật khẩu của nhân viên: chủ cơ sở bấm "Đặt lại mật khẩu" (nhận mật khẩu tạm mới).
- Kiểu phân hệ (D10) lưu ở `worker_profiles.work_mode`.

## Cảnh báo bảo mật về tên miền email ẩn (D13)

Hệ thống Auth có thể gửi thư (đặt lại mật khẩu) tới email ẩn. Vì vậy `sdt.<tên miền>` **phải do bạn kiểm soát và không có hộp thư nhận** (không bật catch-all). Nếu tên miền thuộc người khác hoặc hết hạn rồi người lạ mua lại, họ có thể nhận thư và chiếm tài khoản nhân viên. `agricovi.com` hiện chỉ là giá trị tạm; **bạn phải sở hữu tên miền này (hoặc đổi) trước khi dùng thật.**

## Cách tôi triển khai D8 (đã làm, migration 0010)

- `create_organization` chỉ cho tạo cơ sở **đầu tiên**. Tài khoản đã là chủ một cơ sở sẽ bị từ chối (`ORG_LIMIT`).
- HTX thêm cơ sở bằng **hai cách**:
  1. **Mời hộ đã có tài khoản** bằng email. Chủ hộ đăng nhập bằng đúng email đó sẽ thấy lời mời và chấp nhận. Không cần gửi thư.
  2. **Tạo hộ thành viên** cho người chưa có tài khoản/điện thoại. HTX là bên quản lý (`managed_by_org`), người tạo là chủ của hộ đó.
- Người được mời làm nhân viên/quản lý (vai trò trong một cơ sở) **không bị ép tạo cơ sở**; họ nhận lời mời ngay sau khi đăng ký.

| D74 | **Thương hiệu Agricovi và tên miền agricovi.com (25/10/2026)**: thương hiệu hiển thị đổi từ AgriConnect thành **Agricovi** (nghĩa: *Kết nối nông nghiệp Việt*; khẩu hiệu mặc định "Kết nối nông nghiệp Việt"). Tên miền `agricovi.com` do chủ sản phẩm sở hữu: **website `agricovi.com`** (+ `/admin/` quản trị website, `www` chuyển về tên chính), **app `app.agricovi.com`** (+ `/quan-tri/` quản trị nền tảng), thư liên hệ `lienhe@agricovi.com` (Email Routing, không catch-all), thư hệ thống `noreply@agricovi.com` (SMTP riêng). Tên Worker (`agriconnect` cho website, `agricovi` cho app), tên gói `@agriconnect/*` và khóa lưu cục bộ giữ nguyên để không mất gắn kết. `login_email_domain` = `agricovi.com` là hợp lệ (tên miền đã thuộc chủ sản phẩm) nhưng **tuyệt đối không tạo MX/catch-all cho `sdt.agricovi.com`**; tài khoản điện thoại đã tạo giữ email cũ. Địa chỉ `workers.dev` cũ giữ chạy song song để mã QR đã in và app đã cài không hỏng. Hướng dẫn từng bước: `docs/TRIEN_KHAI_TEN_MIEN.md` | 25/10/2026 | Chủ sản phẩm | `docs/TRIEN_KHAI_TEN_MIEN.md`, `.env.production` của app và website |
