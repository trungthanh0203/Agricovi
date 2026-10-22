# Sản phẩm trên website lấy từ đâu và nhập bằng cách nào

Website không có "kho sản phẩm" riêng: mỗi loại hàng có **một nguồn và một cách nhập** riêng, để người nhập đúng người chịu trách nhiệm và có kiểm duyệt.

| Loại trên website | Nguồn dữ liệu | Ai nhập | Nhập ở đâu | Kiểm duyệt | Hiển thị ở |
|---|---|---|---|---|---|
| **Nông sản, giống, vật nuôi** (Rau củ quả, Trái cây, Vật nuôi, Gạo…) | Bảng `product_listings` → bản chụp công khai `public_products` | **Nhà cung cấp** (hộ, trang trại, HTX có cơ sở trong app) | **Ứng dụng**: Báo cáo → **Hồ sơ website** → Sản phẩm cung ứng: tên, danh mục, giá "từ", đơn vị, quy cách, mùa vụ, đặt tối thiểu, ≤2 ảnh, liên kết vụ truy xuất | Chủ gửi duyệt hồ sơ; kiểm duyệt viên duyệt (`Duyệt hồ sơ nhà cung cấp`). Sửa giá/mô tả/ảnh thì gửi duyệt lại | Trang chủ (hàng theo danh mục), `/danh-muc/…`, `/san-pham/<mã>`, hồ sơ nhà cung cấp, tìm kiếm |
| Tình trạng cung ứng (Đang có hàng, Dự kiến…) của nông sản | Bảng `supply_offers` | Nhà cung cấp | **Website**: Gian hàng của tôi (`/gian-hang/`) hoặc trong app | **Không cần duyệt**, hiện ngay | Nhãn "Đang có hàng" trên thẻ sản phẩm |
| **Vật tư nông nghiệp do nền tảng nhập** (phân bón, dinh dưỡng, chế phẩm, phụ kiện) | Bảng `site_materials` (không gắn gian hàng) | **Quản trị viên / biên tập viên** | **Quản trị website → Vật tư nông nghiệp**: nhập tay hoặc **nhập CSV** hàng loạt (mọi dòng vào dạng Nháp) | Biên tập viên soạn nháp, tổng biên tập đăng | `/vat-tu/`, `/vat-tu/<tên>`, trang chủ |
| **Vật tư do gian hàng vật tư đăng** | Bảng `site_materials` có `shop_id` | **Người bán vật tư** có gian hàng được duyệt | **Website**: `/gian-hang-vat-tu/quan-ly/` (đăng ký gian hàng ở `/gian-hang-vat-tu/mo/`) | Gian hàng được duyệt trước (giấy phép); vật tư đăng lần đầu và sửa nội dung phải duyệt; sửa giá/đơn vị áp dụng ngay | `/vat-tu/…`, trang gian hàng `/gian-hang-vat-tu/<tên>` |
| Tin cần mua / cần bán (giao thương) | Bảng `trade_posts` | Người mua đăng ký (cần mua); nhà cung cấp (cần bán) | **Website**: `/giao-thuong/dang-tin/` | Duyệt trước; người đã có tin được duyệt thì tự duyệt | `/giao-thuong/` (khách xem tóm tắt, chi tiết sau đăng nhập) |

## Danh mục

Mọi sản phẩm gắn một danh mục trong **cây danh mục** (quản trị website → Danh mục sản phẩm). Nông sản/giống chọn danh mục ở form sản phẩm trong app; vật tư chọn danh mục thuộc nhánh Vật tư hoặc Phụ kiện. Sản phẩm **chưa chọn danh mục** vẫn nằm trong hồ sơ nhà cung cấp và tìm kiếm nhưng **không hiện ở trang danh mục** và hàng theo danh mục trên trang chủ.

## Các cách nhập tóm tắt

1. **Nhà cung cấp tự nhập trong app** (nông sản): chính xác nhất vì cùng dữ liệu với vụ sản xuất và truy xuất.
2. **Quản trị nhập tay** (vật tư nền tảng): từng mặt hàng với đủ thông tin.
3. **Quản trị nhập CSV** (vật tư nền tảng): tệp có tiêu đề Tên, Danh mục, Thương hiệu, Mô tả ngắn, Thành phần, Hướng dẫn, Đơn vị, Giá từ, Giá chữ, Nhà phân phối; tải tệp mẫu trong màn Vật tư.
4. **Người bán vật tư tự đăng** trên website (gian hàng được duyệt).

Chưa có: nhập sản phẩm nông sản hàng loạt bằng CSV cho nhà cung cấp, nhập bằng ảnh hóa đơn hoặc giọng nói (kế hoạch Giai đoạn 2), đồng bộ từ hệ thống bán hàng bên ngoài.
