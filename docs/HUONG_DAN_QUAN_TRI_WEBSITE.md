# Hướng dẫn quản trị website

Từ D63, **quản trị website là một trang riêng**, không còn nằm trong quản trị của app; từ D64 nó nằm **cùng Worker với website, ở đường dẫn `/admin/`**. Hai trang quản trị:

| Trang | Địa chỉ | Dùng để |
|---|---|---|
| **Quản trị website** | `https://agriconnect.onstudy.workers.dev/admin/` (cùng Worker với website) | Nội dung website, sản phẩm/vật tư, kiểm duyệt, người biên tập |
| Quản trị nền tảng | `https://agricovi.onstudy.workers.dev/quan-tri/` | Cơ sở, gói và giá, thanh toán, cấu hình, nhật ký kiểm toán |

Cả hai dùng chung tài khoản Supabase (cùng email, mật khẩu) nhưng **đăng nhập riêng** vì khác địa chỉ. Không cần tạo Worker riêng; xem `docs/DEPLOY_CLOUDFLARE.md`, mục "Quản trị website".

## 1. Điều kiện (làm một lần)

1. `npx supabase db push` để áp migration **0042, 0043, 0044**. Chưa chạy thì các màn báo lỗi "không tìm thấy bảng/hàm".
2. Đã deploy lại website (lệnh build của website tự build cả quản trị website).
3. Tài khoản của bạn là quản trị viên nền tảng. Nếu chưa, chạy trong Supabase → SQL Editor (thay email):
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = 'email-cua-ban@...';
   ```
   Nên dùng email riêng cho tài khoản quản trị. Người khác chỉ cần được cấp vai trò biên tập (mục 6).

## 2. Các mục của Quản trị website

| Nhóm | Mục | Dùng để |
|---|---|---|
| (đầu) | **Tổng quan** | Việc cần làm (yêu cầu báo giá mới, hồ sơ chờ duyệt, bài/vật tư nháp) và các số liệu của website; bấm vào số để tới đúng mục |
| Nội dung | Bài viết và tin hội chợ | Tin nông nghiệp, tin xuất khẩu, **tin hội chợ** (ngày, địa điểm, đơn vị tổ chức, hẹn giờ đăng). Giá nông sản tham khảo và lịch thời vụ là bài thuộc Tin nông nghiệp |
| | Trang tĩnh | Giới thiệu, Dành cho người bán/mua, Trợ giúp, Điều khoản… (có lưu bản cũ; mục "Trang gợi ý chưa tạo" có nội dung mặc định để bấm Soạn) |
| | Banner trang chủ | Băng chuyền lớn và hai ô nhỏ; đặt thời gian hiển thị |
| | **Các khối trang chủ** | Đổi thứ tự và ẩn/hiện các khối dưới banner (Giao thương, Nhà cung cấp, Trái cây…) |
| | Menu và chân trang | Thanh chuyên mục, menu "Tìm hiểu về", các cột chân trang |
| | Thông tin chung | Tên thương hiệu, hotline, email, địa chỉ, đơn vị vận hành, mạng xã hội, thông tin đăng ký thương mại điện tử |
| | **Bản dịch tiếng Anh** *(biên tập viên, tổng biên tập)* | Website có bản tiếng Anh ở `/en/` (nút VI/EN ở đầu trang). Giao diện cố định đã dịch sẵn. Ở đây dịch phần **bạn soạn**: tab *Cụm từ chung* (menu, banner, tên danh mục, khẩu hiệu — mục "Chữ còn thiếu" tự liệt kê chữ chưa có bản dịch, bạn chỉ việc gõ tiếng Anh rồi Lưu), tab *Trang tĩnh* và *Bài viết* (dịch tiêu đề, mô tả/tóm tắt, nội dung). Chưa dịch thì bản EN hiện tiếng Việt. Nội dung người dùng tự nhập (tên sản phẩm, tin đăng…) không được dịch tự động. Thay đổi hiện sau khoảng 1 phút |
| Sản phẩm | Danh mục sản phẩm | Cây danh mục (không xóa, chỉ tắt "Đang dùng") |
| | Vật tư nông nghiệp | Nhập tay hoặc nhập từ **CSV** (có tệp mẫu; mọi dòng vào dạng Nháp) |
| Tiếp nhận và kiểm duyệt | Yêu cầu báo giá | Hàng đợi khách gửi từ website: liên hệ lại, chuyển cho nhà cung cấp, bấm Đã xử lý hoặc Rác |
| | **Gian hàng vật tư** *(kiểm duyệt viên, tổng biên tập)* | Duyệt gian hàng người bán vật tư tự đăng ký: đối chiếu số giấy phép (và ảnh), duyệt (đánh dấu "Đã kiểm tra giấy phép" nếu đã đối chiếu), từ chối kèm lý do, tạm khóa (vật tư của gian hàng biến khỏi website), mở lại |
| | **Duyệt vật tư gian hàng** *(kiểm duyệt viên, tổng biên tập)* | Duyệt vật tư gian hàng đăng lần đầu hoặc sửa nội dung; từ chối kèm lý do; ẩn vật tư vi phạm |
| | **Duyệt tin giao thương** *(kiểm duyệt viên, tổng biên tập)* | Duyệt hoặc từ chối tin người dùng đăng (xem nội dung, ảnh, số tin đã được duyệt của người đăng); ẩn tin vi phạm. Người đã có tin được duyệt sẽ tự được duyệt tin sau |
| | **Báo cáo vi phạm** *(kiểm duyệt viên, tổng biên tập)* | Xem báo cáo của người dùng; ẩn tin, khóa người đăng hoặc bỏ qua |
| | Duyệt hồ sơ nhà cung cấp *(quản trị viên)* | Xem trước đúng như website sẽ hiện, duyệt và công khai, yêu cầu sửa, tạm ẩn |
| | Vụ công khai (truy xuất) *(quản trị viên)* | Tạm ẩn vụ sai hoặc vi phạm |
| Hệ thống | Người biên tập *(quản trị viên)* | Cấp vai trò cho người khác bằng email |
| | Nhật ký thao tác *(tổng biên tập, quản trị viên)* | Ai đã làm gì, lúc nào trên website |

## 3. Cách đăng một nội dung

1. Bấm **+ Thêm …**, điền các ô. Địa chỉ (không dấu) tự sinh từ tiêu đề, sửa được.
2. Chọn **Trạng thái**: *Nháp* (chỉ nhân sự thấy), *Chờ duyệt*, *Đã đăng* (hiện trên website), *Đã gỡ* (ẩn, giữ lại).
3. Bấm **Lưu**. Website cập nhật trong khoảng **1 phút**, không cần deploy lại.
4. Biên tập viên chỉ chọn được *Nháp* và *Chờ duyệt*; **tổng biên tập hoặc quản trị viên** mới đăng, gỡ và sửa bản đã đăng.

Cách viết nội dung bài và trang: dòng trống = đoạn mới; `## Tiêu đề nhỏ`; dòng bắt đầu `- ` là danh sách; một dòng `[[Chữ trên nút|/đường-dẫn]]` tạo nút. Không cần HTML.

## 4. Thứ tự gợi ý khi bắt đầu

1. **Thông tin chung** → 2. **Banner trang chủ** → 3. **Danh mục sản phẩm** (xem lại cây có sẵn) → 4. **Vật tư** (10–20 mặt hàng, dùng CSV nếu có bảng giá) → 5. **Tin hội chợ** và vài bài **Tin nông nghiệp** → 6. **Trang tĩnh** (soạn Giới thiệu, Dành cho người bán/mua; thay trang pháp lý khi có văn bản chính thức) → 7. **Các khối trang chủ** (ẩn khối chưa có nội dung) → 8. Mở website, kiểm tra từng trang trên điện thoại.

## 5. Quyền theo vai trò

| Vai trò | Làm được |
|---|---|
| Quản trị viên nền tảng | Mọi thứ, kể cả duyệt hồ sơ, vụ công khai, cấp vai trò |
| Tổng biên tập | Đăng/gỡ/sửa mọi nội dung, menu, thông tin chung, trang chủ, danh mục; xem nhật ký thao tác |
| Biên tập viên | Soạn nháp và gửi duyệt bài, vật tư, trang, banner |
| Kiểm duyệt viên | Xem nội dung nháp; **duyệt tin giao thương và xử lý báo cáo vi phạm** (không sửa nội dung website) |

## 6. Cấp vai trò cho nhân sự

Quản trị website → **Người biên tập**, nhập email người đó và chọn vai trò. Người đó phải có tài khoản AgriConnect (đăng ký bằng email) trước, rồi đăng nhập trang Quản trị website bằng email của mình; họ không vào được Quản trị nền tảng.

## 7. Lưu ý

- Ảnh chỉ 1 ảnh mỗi chỗ và tự thu nhỏ; ảnh quá phức tạp có thể bị từ chối, hãy chọn ảnh nhỏ hơn.
- Yêu cầu báo giá chứa thông tin cá nhân của khách: chỉ dùng để liên hệ báo giá, không chia sẻ ra ngoài.
- Chưa nhập thuốc bảo vệ thực vật và thuốc thú y (hàng hạn chế) cho tới khi có tư vấn pháp lý.
- Nên bật **Cloudflare Access** cho đường dẫn `/admin/*` của website.
- Chạy thử trên máy cá nhân: `npm run dev:webadmin` (cần biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
