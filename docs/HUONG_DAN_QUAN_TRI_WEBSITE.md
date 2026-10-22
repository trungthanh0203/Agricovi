# Hướng dẫn vào trang quản trị để quản lý website

Dành cho quản trị viên nền tảng và nhân sự biên tập. Trang quản trị nằm **cùng địa chỉ với ứng dụng**, thêm `/quan-tri/` ở cuối (D54).

## 1. Điều kiện (làm một lần)

1. Đã chạy `npx supabase db push` để áp migration **0042** (khung CMS) và **0043** (danh mục, vật tư, bài viết, báo giá). Chưa chạy thì các màn Website báo lỗi "không tìm thấy bảng/hàm".
2. Ứng dụng đã được triển khai lại sau khi có mã mới (trang quản trị được build kèm ứng dụng).
3. Tài khoản của bạn đã là quản trị viên nền tảng. Nếu chưa, vào Supabase → SQL Editor, chạy (thay email):
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = 'email-cua-ban@...';
   ```
   Nên dùng một email riêng cho tài khoản quản trị.

## 2. Vào trang quản trị

- Mở `địa-chỉ-ứng-dụng/quan-tri/` (ví dụ `https://app.ten-mien/quan-tri/`), đăng nhập bằng email và mật khẩu của tài khoản quản trị.
- Hoặc: trong ứng dụng, tab **Tài khoản**, cuối trang có biểu tượng khóa 🔒 (chỉ quản trị viên thấy) dẫn tới đây.
- Thanh bên trái có hai nhóm: **Nền tảng** (cơ sở, gói, thanh toán, duyệt hồ sơ, cấu hình) và **Website** (nội dung website).

## 3. Nhóm Website: mỗi mục dùng để làm gì

| Mục | Dùng để | Ghi chú |
|---|---|---|
| Bài viết và tin hội chợ | Đăng tin nông nghiệp, tin xuất khẩu, **tin hội chợ**; giá nông sản tham khảo và lịch thời vụ là bài thuộc mục tương ứng của Tin nông nghiệp | Hội chợ nhập thêm ngày bắt đầu/kết thúc, địa điểm, đơn vị tổ chức; website tự chia "Sắp diễn ra" và "Đã diễn ra". Có hẹn giờ đăng |
| Vật tư nông nghiệp | Nhập vật tư (tên, danh mục, thương hiệu, thành phần, hướng dẫn, giá "từ", nhà phân phối, 1 ảnh) | Nhập tay hoặc **Nhập từ tệp CSV** (có tệp mẫu để tải); mọi dòng nhập CSV vào dạng **Nháp**, kiểm tra rồi đăng |
| Danh mục sản phẩm | Cây danh mục hiện ở menu Danh mục và trang danh mục | Không xóa, chỉ tắt "Đang dùng"; nhánh Vật tư/Phụ kiện dành cho vật tư admin nhập |
| Yêu cầu báo giá | Hàng đợi yêu cầu khách gửi từ website | Liên hệ lại khách, chuyển cho nhà cung cấp, bấm **Đã xử lý** hoặc **Rác** |
| Trang tĩnh | Giới thiệu, Dành cho người bán/mua, Trợ giúp, Điều khoản… | Mục "Trang gợi ý chưa tạo" có nội dung mặc định để bấm **Soạn** rồi sửa; trang pháp lý chỉ là khung, hãy thay bằng văn bản chính thức |
| Banner trang chủ | Băng chuyền lớn và hai ô nhỏ bên phải | Chọn ảnh ngang, tự thu nhỏ; đặt thời gian hiển thị tùy ý |
| Menu và chân trang | Sửa thanh chuyên mục, menu "Tìm hiểu về", các cột chân trang | Mỗi dòng dạng `Tên | /đường-dẫn`; dòng bắt đầu bằng `- ` là mục con |
| Thông tin chung | Tên thương hiệu, hotline, email, địa chỉ, đơn vị vận hành, mạng xã hội, thông tin đăng ký thương mại điện tử | Để trống thì chân trang không hiện mục đó |
| Người biên tập | Cấp vai trò cho người khác bằng email (chỉ quản trị viên) | Người đó phải đăng ký tài khoản trước |

## 4. Cách đăng một nội dung

1. Bấm **+ Thêm …**, điền các ô. Địa chỉ (không dấu) tự sinh từ tiêu đề, sửa được.
2. Chọn **Trạng thái**: *Nháp* (chỉ nhân sự thấy), *Chờ duyệt*, *Đã đăng* (hiện trên website), *Đã gỡ* (ẩn, giữ lại).
3. Bấm **Lưu**. Website cập nhật trong khoảng **1 phút** (bộ nhớ đệm), không cần deploy lại.
4. Biên tập viên chỉ chọn được *Nháp* và *Chờ duyệt*; **Tổng biên tập hoặc quản trị viên** mới đăng, gỡ và sửa bản đã đăng.
5. Trang tĩnh có lưu **bản cũ**: mở trang, kéo xuống "Các bản cũ", bấm "Dùng lại nội dung này".

Cách viết nội dung bài và trang: dòng trống = đoạn mới; `## Tiêu đề nhỏ`; dòng bắt đầu `- ` là danh sách; một dòng `[[Chữ trên nút|/đường-dẫn]]` tạo nút. Không cần HTML.

## 5. Thứ tự gợi ý khi bắt đầu

1. **Thông tin chung** (tên, hotline, email, mạng xã hội).
2. **Banner trang chủ**: 2–3 banner lớn, 2 ô nhỏ.
3. **Danh mục sản phẩm**: xem lại cây có sẵn, chỉnh tên/thứ tự cho phù hợp.
4. **Vật tư nông nghiệp**: 10–20 vật tư mẫu (dùng CSV nếu có sẵn bảng giá).
5. **Tin hội chợ** và vài bài **Tin nông nghiệp**.
6. **Trang tĩnh**: soạn Giới thiệu, Dành cho người bán/mua; thay trang pháp lý khi có văn bản.
7. Mở website, kiểm tra từng trang trên điện thoại.

## 6. Cấp quyền cho nhân sự biên tập

Website → **Người biên tập**, nhập email người đó và chọn vai trò:

- **Tổng biên tập**: đăng, gỡ, sửa mọi nội dung, menu, thông tin chung, danh mục.
- **Biên tập viên**: soạn nháp và gửi duyệt.
- **Kiểm duyệt viên**: xem nội dung nháp (duyệt hồ sơ và tin giao thương ở các lát sau).

Người được cấp đăng nhập chính trang `/quan-tri/` và chỉ thấy nhóm Website.

## 7. Lưu ý

- Ảnh chỉ 1 ảnh mỗi chỗ và tự thu nhỏ; ảnh quá phức tạp có thể bị từ chối, hãy chọn ảnh nhỏ hơn.
- Yêu cầu báo giá chứa thông tin cá nhân của khách: chỉ dùng để liên hệ báo giá, không chia sẻ ra ngoài.
- Chưa nhập thuốc bảo vệ thực vật và thuốc thú y (hàng hạn chế) cho tới khi có tư vấn pháp lý.
- Mọi thao tác ghi đều có trong **Nền tảng → Nhật ký kiểm toán** (ai làm gì, lúc nào).
- Chạy thử trên máy cá nhân: `npm run dev:admin` (cần biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
