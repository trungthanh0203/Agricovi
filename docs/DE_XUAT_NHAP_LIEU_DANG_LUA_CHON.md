# Rà soát ô nhập tay có thể đổi thành lựa chọn (website + quản trị website)

Ngày rà soát: 09/11/2026. Mảng WEB. **Đã duyệt và làm xong ngày 09/11/2026: A1–A6 và B1** (migration 0190). Chưa làm: B2 và nhóm C (chờ chủ sản phẩm chọn).

Nguyên tắc: ô nào có tập giá trị hữu hạn và dùng để lọc/thống kê/liên kết thì cho chọn; ô mô tả riêng của người dùng (tên, địa chỉ cụ thể, ghi chú) giữ gõ tay.

## Đã là lựa chọn (không cần làm)
Loại tài khoản khi đăng ký, "Bạn là" ở hồ sơ, tỉnh/thành ở Danh bạ, Giá nông sản, Lịch mùa vụ, Tin giao thương (bộ lọc), tỉnh/thành ở mở/sửa gian hàng vật tư, đơn vị và danh mục khi đăng tin giao thương, danh mục vật tư, hình thức thanh toán, số sao đánh giá.

## A. Nên làm ngay (ảnh hưởng độ thống nhất dữ liệu và bộ lọc)

| # | Nơi | Hiện nay | Đề xuất |
|---|---|---|---|
| A1 | Đăng tin giao thương (`giao-thuong/dang-tin`) | **Tỉnh/thành gõ tay**, gợi ý mẫu "Long An" (tỉnh này đã sáp nhập vào Tây Ninh) nên tin gõ khác bộ lọc `tinh` sẽ không lọc ra | Chọn từ danh sách 34 tỉnh/thành (`PROVINCES`). Thêm kiểm tra trong hàm CSDL; tin cũ gõ tay: đối chiếu và chuyển về tên chuẩn (xem "Dữ liệu cũ") |
| A2 | Tài khoản > Địa chỉ nhận hàng | **Tỉnh/thành gõ tay** | Chọn từ 34 tỉnh/thành |
| A3 | Vật tư của gian hàng (`gian-hang-vat-tu/quan-ly`) và quản trị > Vật tư | **Đơn vị gõ tay** ("kg, bao, chai…") nên có "Kg", "kilogram", "ki-lô" lẫn nhau | Chọn từ danh sách đơn vị chuẩn dùng chung (mở rộng `TRADE_UNITS`: kg, g, tấn, lít, ml, chai, lọ, gói, hộp, bao, thùng, túi, can, cái, bộ…), có mục "Khác" kèm ô gõ. Nhập CSV vật tư tự quy đổi về đơn vị chuẩn |
| A4 | Yêu cầu báo giá (`bao-gia`) | **Số lượng gõ tự do** ("200 kg mỗi tuần") | Tách: ô số + chọn đơn vị + chọn "Một lần / Mỗi tuần / Mỗi tháng". Nội dung ghép lại khi lưu nên không đổi CSDL |
| A5 | Menu và chân trang (Quản trị website > Cài đặt) | **Gõ từng dòng "Tên \| đường dẫn"**, sai một ký tự là link hỏng | Trình soạn có nút "Thêm mục": chọn trang đích từ danh sách (trang tĩnh, chuyên mục tin, danh mục, Giao thương, Hội chợ…) hoặc "Địa chỉ ngoài", tên tự điền; kéo/nút lên-xuống để sắp xếp |
| A6 | Quản trị > Banner, "Liên kết khi bấm" | Gõ đường dẫn | Cùng bộ chọn trang đích như A5 + mục "Địa chỉ ngoài (https://…)" |

## B. "Quận/huyện" đang lỗi thời

Từ 2025 nước ta chỉ còn 2 cấp (tỉnh/thành và xã/phường); `PROVINCES` đã theo đúng 34 đơn vị, nhưng các biểu mẫu vẫn ghi **"Quận/huyện"**: đăng tin giao thương, mở/sửa gian hàng vật tư, địa chỉ nhận hàng.

- **B1 (đề xuất làm ngay):** đổi nhãn thành **"Xã/phường"**; vẫn gõ tay (cột CSDL tên `district` giữ nguyên, chỉ đổi chữ hiển thị).
- **B2 (để sau, tùy chọn):** chọn xã/phường theo tỉnh đã chọn. Danh sách khoảng 3.300 xã/phường nên chỉ tải khi người dùng chọn tỉnh; cần nguồn dữ liệu chính thức. Chỉ làm khi có yêu cầu thật.

## C. Làm khi duyệt (ít ảnh hưởng hơn)

| # | Nơi | Đề xuất |
|---|---|---|
| C1 | Tài khoản > Địa chỉ > "Tên gọi (Nhà, Cơ quan…)" | Chọn: Nhà / Cơ quan / Kho / Cửa hàng / Khác (khác thì gõ) |
| C2 | Gian hàng vật tư > "Nơi cấp" giấy phép | Chọn cơ quan cấp phổ biến + "Khác". **Cần bạn xác nhận danh sách tên cơ quan đang hiện hành** (tên sở đổi nhiều sau sáp nhập), mình không tự đặt |
| C3 | Quản trị > Bài viết hội chợ: "Nơi diễn ra" | Tách: chọn Tỉnh/thành + gõ địa điểm cụ thể (để lọc theo tỉnh sau này) |
| C4 | Quản trị > Bài viết: "Nguồn tin" | Gợi ý chọn từ danh sách nguồn tin tự động đã tạo, vẫn cho gõ tên khác |
| C5 | Quản trị > Vật tư: "Thương hiệu" | Gợi ý (danh sách xổ xuống nhưng vẫn gõ được) từ thương hiệu đã có để khỏi viết lệch ("Bayer" / "BAYER") |
| C6 | Đăng tin giao thương: "Tên sản phẩm" | Gợi ý theo danh mục đã chọn (vẫn gõ được) |

## D. Giữ gõ tay (không đổi)
Họ tên, tên đơn vị, địa chỉ cụ thể, ghi chú, nội dung/tiêu đề, mô tả, thành phần/cách dùng vật tư, email, MST, từ khóa tìm kiếm, mã vụ, số điện thoại. Riêng điện thoại/MST: chỉ thêm kiểm tra định dạng, không phải lựa chọn.

## Dữ liệu cũ
Sau khi chuyển A1/A2 sang danh sách chuẩn, tin giao thương và địa chỉ đã gõ tay trước đó có thể lệch tên. Đề xuất một migration (`..._web_*.sql`) đối chiếu tên không dấu với `PROVINCES` và chuyển về tên chuẩn; bản nào không khớp được thì để nguyên và liệt kê cho bạn xem, không tự đoán.

## Thứ tự đề xuất
1. A1, A2, B1 (tỉnh/thành + nhãn xã/phường)
2. A3, A4 (đơn vị và số lượng)
3. A5, A6 (chọn trang đích cho menu/banner)
4. C1–C6 nếu bạn muốn

Ước lượng: mục 1 nhỏ, mục 2 nhỏ-vừa, mục 3 vừa (đổi trình soạn menu), mục 4 nhỏ từng cái.
