# Kế hoạch: đổi thương hiệu sang Acovin (ĐÃ LÀM, D226)

> **Kết quả chốt:** tên là **Acovin** (không phải Acovina; đã bỏ chữ "a" cuối trong logo), tên miền `acovin.com`, đổi cả tên miền email ẩn và tên dịch vụ Cloudflare, có dùng khẩu hiệu, có bản trắng của logo. Chi tiết: `docs/DECISIONS_APP.md` D226 và `docs/DEPLOY_CLOUDFLARE.md` (mục cuối). Nội dung bên dưới là bản kế hoạch ban đầu.

Ngày soạn: 21/11/2026. Chưa sửa gì. Số "phiên" là ước lượng thô của tôi (1 phiên = một buổi làm gọn), chưa đo.

## 1. Ảnh bạn gửi

- Một ảnh 1376 × 768, **3 khung**: *Logo kèm khẩu hiệu* ("Acovina" + "Kết nối nông nghiệp số Việt Nam"), *Favicon* (chữ A + lá + vòng mạch trên nền trắng vuông), *Icon không khẩu hiệu* (chữ A + "Acovina").
- Nền **xám nhạt, không trong suốt**; mỗi logo chỉ cao khoảng 170–230 px. Màu: xanh lá (chữ A, lá) và **xanh navy** (chữ "Acovina").
- Tách thành 3 tệp: cắt đúng 3 khung, bỏ nền xám thành trong suốt (có làm mịn viền), bỏ chữ chú thích dưới ảnh ("ACOVINA LOGO WITH SLOGAN"...).

**Giới hạn thành thật về chất lượng:** ảnh nhỏ. Phóng lớn lên 512 px (biểu tượng cài đặt app) hoặc 1200 px (ảnh chia sẻ Facebook) sẽ **hơi mềm**. Dùng tạm được; để dùng lâu dài nên xin **bản gốc độ phân giải cao (từ 2000 px) hoặc tệp vector (SVG)** từ nơi bạn tạo logo. Tôi làm quy trình sao cho thay logo mới chỉ cần thả tệp rồi chạy lại một lệnh.

## 2. Bộ tệp thương hiệu tôi sẽ xuất ra

Từ 3 khung, tôi dựng đủ bộ (hiện app và website mỗi nơi đang giữ một bản riêng, tổng khoảng 20 tệp):

| Tệp | Dùng ở đâu |
|---|---|
| `acovina-logo` (kèm khẩu hiệu), `acovina-icon` (không khẩu hiệu), `acovina-mark` (chỉ chữ A + lá) | Nguồn gốc, đều nền trong suốt |
| `favicon.ico` (16/32/48), `favicon-16`, `favicon-32` | Thẻ trình duyệt (app, website, webadmin) |
| `apple-touch-icon` 180, `icon-192`, `icon-512`, `icon-maskable-512` | Cài app lên điện thoại/máy tính (cần nền đặc, chữ A nằm trong vùng an toàn) |
| `logo-header`, `logo-horizontal`, `logo-vertical`, `welcome` | Thanh đầu app/website, màn chào, đăng nhập |
| `og-default` (1200 × 630) | Ảnh hiện khi dán đường dẫn lên Facebook/Zalo |

**Một việc thiết kế cần bạn đồng ý:** thanh đầu app và website nền **xanh lá đậm**, chữ "Acovina" màu **navy** sẽ **không đọc được** trên nền đó. Tôi đề xuất làm thêm **bản trắng** (chữ A + lá + chữ đều trắng) cho thanh đầu và màn chào; bản màu giữ cho nền sáng. Làm được từ ảnh hiện có, độ nét phụ thuộc mục 1.

## 3. Phạm vi đổi tên: đổi gì, giữ gì

Hiện hệ thống gọi bằng hai tên: **Agricovi** (127 tệp) và **AgriConnect** (218 tệp, phần lớn là tên kỹ thuật). Nguyên tắc: **mọi chữ người dùng nhìn thấy đổi thành "Acovina"; tên kỹ thuật bên trong giữ nguyên** để khỏi vỡ dữ liệu và đăng nhập.

### Đổi (người dùng nhìn thấy)
| Nhóm | Ví dụ | Quy mô |
|---|---|---|
| Chữ trên app và quản trị | Tiêu đề trang, tên app cài đặt (`manifest`), dòng "Agricovi · phiên bản", hướng dẫn, thông báo đẩy, màn đăng nhập | ~40 chỗ ở `apps/app`, `apps/admin` |
| Website | Tiêu đề, mô tả SEO, tên trong dữ liệu cấu trúc, chân trang, menu "Tìm hiểu về...", trang hướng dẫn | ~65 chỗ ở `apps/web`, `apps/webadmin` |
| Nội dung dùng chung | Nội dung mặc định website, trang hướng dẫn (`packages/shared`) | ~130 chỗ |
| Thông báo lỗi từ máy chủ (9 câu có chữ Agricovi/AgriConnect) | "Hãy liên hệ Agricovi qua Zalo..." | Sửa ở một chỗ phía app (thay tên khi hiển thị), **không cần viết lại hàm CSDL** |
| Thư gửi đi và bot | Tên người gửi email đặt hàng, tên bot đọc tin | Mã + bạn đặt lại 1 khóa cấu hình (mục 5) |
| Hướng dẫn và tài liệu đang dùng với người dùng | `HUONG_DAN_*`, trang hướng dẫn trong website | Sửa; tài liệu lịch sử (`DECISIONS_*`) **giữ nguyên**, thêm một mục ghi quyết định đổi tên |
| Ảnh thương hiệu | Mục 2 | ~20 tệp |

### Giữ nguyên (không đổi, và vì sao)
| Gì | Vì sao giữ |
|---|---|
| **Tên miền email ẩn đăng nhập bằng số điện thoại** (`...@sdt.agricovi.com`, cấu hình `login_email_domain`) | Mọi tài khoản nhân viên, chủ đăng ký bằng điện thoại, máy chấm công đã tạo dùng chuỗi này để đăng nhập. **Đổi là mất đăng nhập hàng loạt.** Người dùng không bao giờ thấy chuỗi này. |
| Tên gói mã nguồn `@agriconnect/*`, tên thư mục | Chỉ là định danh nội bộ, đổi tốn công và dễ lỗi mà không có lợi ích |
| Tên khóa lưu trên máy (`agricovi.ref`, `agricovi.contact_info`, `agriconnect-acc`) | Chỉ là bộ nhớ nội bộ; đổi làm mất mã giới thiệu đang lưu |
| Các tệp migration CSDL đã tạo | Không sửa tệp đã tạo; không cần |

## 4. Việc phụ thuộc quyết định của bạn

- **Tên miền:** các địa chỉ `agricovi.com`, `app.agricovi.com` hiện chỉ là **địa chỉ dự kiến** (domain chưa mua). Tôi gom về **một nơi cấu hình** (`packages/shared/src/brand.ts` + biến môi trường) nên khi bạn mua tên miền mới (ví dụ `acovina.vn`, `acovina.com`) chỉ sửa một chỗ. **Nên kiểm tra tên miền còn trống và tra cứu nhãn hiệu "Acovina" tại Cục Sở hữu trí tuệ trước khi in ấn, chạy quảng cáo**, vì tôi không xác minh được việc này.
- **Tên dịch vụ Cloudflare** (`agricovi` cho app, `agriconnect` cho website): đổi tên tạo địa chỉ `workers.dev` mới. Vì tên miền chính thức chưa gắn, **đổi ngay bây giờ gần như không tốn gì**; nếu bạn đã gắn tên miền thử thì giữ nguyên tên và chỉ đổi chữ hiển thị.
- **Khẩu hiệu "Kết nối nông nghiệp số Việt Nam":** tôi đề xuất dùng ở màn chào, mô tả website và ảnh chia sẻ.

## 5. Việc bạn phải tự làm sau khi tôi đổi xong

1. Cập nhật khóa cấu hình tên người gửi email (`RESEND_FROM`) và dòng tên miền nếu có; triển khai lại các hàm máy chủ `plan-order`, `send-push`, `news-fetch` (tôi chỉ commit, bạn chạy).
2. Trong Supabase: đổi địa chỉ website cho đăng nhập/xác minh nếu thay tên miền (chỉ khi đổi miền).
3. Quản trị → Cấu hình → Thông tin liên hệ: điền lại tên công ty, email theo thương hiệu mới (dữ liệu này nằm trong CSDL, tôi không tự sửa).
4. Người đã cài app trên điện thoại/máy tính sẽ **thấy tên và biểu tượng cũ cho tới khi gỡ cài lại** (Android đổi dần, iPhone không tự đổi biểu tượng). App chưa phát hành rộng nên ảnh hưởng nhỏ; làm **trước** khi quảng bá là thời điểm tốt nhất.

## 6. Lộ trình và công sức (ước lượng)

| Bước | Việc | Ước lượng |
|---|---|---|
| 0 | Bạn chốt các quyết định ở mục 7; (tuỳ chọn) gửi ảnh gốc độ phân giải cao | trao đổi ngắn |
| 1 | Tách 3 tệp từ ảnh, xóa nền, dựng bộ tệp mục 2 (kèm bản trắng), đưa bản xem thử cho bạn duyệt | 1–2 phiên |
| 2 | Gom tên/khẩu hiệu/địa chỉ về `brand.ts`; đổi chữ hiển thị ở app, quản trị, website, thông báo lỗi, hàm máy chủ, tài liệu hướng dẫn | 2–3 phiên |
| 3 | Đưa ảnh vào đúng chỗ (app, website, quản trị, manifest, ảnh chia sẻ), kiểm tra thanh đầu/màn chào trên điện thoại và máy tính, rà soát sót chữ cũ bằng tìm kiếm | 1 phiên |
| 4 | Ghi quyết định D226, hướng dẫn các việc bạn tự làm (mục 5) | gộp vào bước 3 |

Chỉ sửa giao diện, chữ và cấu hình: **không cần migration, không cần `db push`**; kiểm tra bằng typecheck và xem thử trên khung trình duyệt.

**Thứ tự đề xuất:** đổi tên **trước**, rồi mới làm bộ ảnh quảng cáo Facebook (để ảnh quảng cáo dùng đúng logo và chữ mới, không phải làm lại).

## 7. Quyết định cần bạn chốt

1. **Đổi hẳn tên hiển thị thành "Acovina"** ở mọi nơi người dùng thấy, giữ nguyên tên kỹ thuật bên trong (đề xuất: đồng ý).
2. **Giữ nguyên tên miền email ẩn đăng nhập** (đề xuất: giữ, đổi sẽ mất đăng nhập).
3. **Làm bản trắng của logo** cho thanh đầu nền xanh (đề xuất: đồng ý).
4. **Có ảnh gốc độ phân giải cao hoặc SVG không?** Nếu có, gửi trước để chất lượng tốt hơn; nếu chưa, dùng bản từ ảnh hiện tại và thay sau.
5. **Cloudflare:** đổi luôn tên dịch vụ sang `acovina-*` (chưa gắn tên miền chính thức) hay giữ?
6. **Tên miền** đã có hay chưa; nếu chưa, tôi để một địa chỉ tạm trong cấu hình.
7. **Dùng khẩu hiệu** "Kết nối nông nghiệp số Việt Nam" ở màn chào, mô tả website, ảnh chia sẻ?
