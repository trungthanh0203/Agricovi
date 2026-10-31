# HTX quản lý hộ thành viên: phân tầng dữ liệu, quyền và báo cáo (ĐỀ XUẤT, chờ chủ sản phẩm chốt)

Tình huống: hộ **đã tự đăng ký dùng thử** (cơ sở riêng, chủ là chính hộ) → HTX mời bằng email → hộ chấp nhận → hộ thuộc HTX. (Hộ do HTX tạo hộ đã có hướng riêng: D147.)

## 1. Hiện trạng (đã đọc mã, chưa đổi gì)
- Hộ vẫn là **một cơ sở độc lập**, nối với HTX bằng `cooperative_memberships`. Mỗi hộ chỉ thuộc **một** HTX đang hoạt động.
- HTX thấy: danh sách hộ và hồ sơ hộ do **HTX tự nhập** (mã hộ, địa chỉ, sản phẩm, diện tích...), số vụ "ghi theo HTX". HTX **không** tự động thấy nhật ký, thu hoạch, kho, chi phí, doanh thu của hộ.
- Vụ "ghi theo HTX" (chủ vụ là HTX, trên khu trồng của hộ) là phần HTX thật sự sở hữu và xem được. Hộ **không rời** HTX khi còn vụ loại này đang chạy.
- Hậu quả: HTX **chưa có đủ dữ liệu để báo cáo, truy xuất nguồn gốc, kiểm soát chất lượng** theo từng hộ, còn hộ **chưa biết rõ** HTX được xem gì.

## 2. Nguyên tắc đề xuất
1. **Dữ liệu thuộc về hộ.** HTX chỉ được xem/nhập phần hộ **đồng ý rõ ràng, theo mục đích** (quản lý sản xuất, truy xuất, mua bán với HTX). Ghi lại ai đồng ý, lúc nào, mức nào.
2. **Chia mức, không "tất cả hoặc không".** Mức càng nhạy cảm (tài chính) càng chặt.
3. **Hộ luôn biết và kiểm soát:** xem được HTX đang được xem gì, nhật ký truy cập, thu hồi đồng ý bất kỳ lúc nào.
4. **Quyền sửa/nhập hộ chỉ khi hộ ủy quyền**, mọi thao tác của HTX trên dữ liệu hộ đều ghi dấu "do HTX nhập" và hộ thấy.
5. **Phân quyền ép ở CSDL** (RLS), không chỉ ẩn nút; báo cáo cấp trên **chỉ tính hộ đã cho phép**.

## 3. Ba mức chia sẻ (hộ chọn khi chấp nhận lời mời, đổi được sau)
| Mức | Nội dung | HTX được | Mặc định đề xuất |
|---|---|---|---|
| **1. Hồ sơ và vụ ghi theo HTX** | Hồ sơ hộ, khu trồng, vụ do HTX làm chủ | Xem (như hiện nay) | Bắt buộc để vào HTX |
| **2. Sản xuất và truy xuất** | Nhật ký việc, vật tư đã dùng, thu hoạch, sự cố, thời gian cách ly của **các vụ của hộ** | **Chỉ xem** | Bắt buộc nếu HTX thu mua/truy xuất/chứng nhận (VietGAP...); hộ vẫn thấy rõ |
| **3. Tài chính** | Chi phí, doanh thu, khách hàng, công nợ riêng của hộ | Không xem | **Mặc định không**; hộ tự bật. Riêng giao dịch **giữa hộ và HTX** (thu mua, ứng vật tư, công nợ) luôn hiện cho cả hai bên |
Tùy chọn thêm: **Ủy quyền nhập hộ** (HTX/quản lý HTX được ghi nhật ký, thu hoạch thay hộ; hợp với hộ lớn tuổi). Mặc định tắt; bản ghi nhập hộ có nhãn riêng.

## 4. Ai thấy gì, báo cáo theo cấp
| Cấp | Thấy | Báo cáo |
|---|---|---|
| **Hộ** (chủ và người của hộ) | Toàn bộ dữ liệu của hộ; HTX đã xem gì | Báo cáo của hộ (như hiện nay) + phần giao dịch với HTX |
| **Tổ/cụm hộ** (nếu HTX chia cụm; sau) | Hộ trong cụm theo mức đã chia sẻ | Tổng hợp cụm |
| **HTX** (chủ, quản lý HTX) | Hộ theo **mức đã chia sẻ**; vụ của chính HTX đầy đủ | Sản lượng và vụ theo hộ/sản phẩm/mùa; **hộ chậm ghi nhật ký**; vật tư/cách ly cần chú ý; sự cố; (nếu hộ bật mức 3) chi phí–doanh thu; công nợ HTX–hộ |
| **Nền tảng** (quản trị) | Thông tin cấu hình, gói, kiểm toán; **không** xem dữ liệu sản xuất/tài chính của hộ | Thống kê tổng hợp ẩn danh |

## 5. An toàn và pháp lý (cần cố vấn pháp lý xác nhận trước khi áp dụng thật)
- Hộ là cá nhân: dữ liệu cá nhân (tên, điện thoại, địa chỉ, tài chính) cần **đồng ý rõ ràng, mục đích cụ thể, quyền rút lại** (tinh thần Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân). Lưu bằng chứng đồng ý (người, thời điểm, mức, phiên bản điều khoản).
- Quan hệ HTX–xã viên (Luật Hợp tác xã 2023): quyền xem sổ sách của xã viên với HTX; quyền riêng tư dữ liệu sản xuất–tài chính **riêng của hộ** vẫn thuộc hộ nếu điều lệ HTX không quy định khác. Nên cho HTX **tải điều khoản/thỏa thuận dữ liệu** của mình lên để hộ đọc trước khi đồng ý.
- **Nhật ký truy cập:** ghi khi HTX xem/xuất dữ liệu hộ; hộ xem được.
- **Rời HTX:** ngừng xem dữ liệu mới ngay; HTX giữ **bản chụp đã dùng cho lô hàng/truy xuất/giao dịch đã phát sinh** (cần cho trách nhiệm truy xuất), không giữ quyền xem tiếp; hộ **xuất toàn bộ dữ liệu của mình** (CSV).
- Người của hộ (tài khoản riêng) luôn **chỉ thấy cơ sở của hộ**; không thấy HTX hay hộ khác.
- Quản lý HTX chỉ xem hộ theo quyền `coop`; mọi thao tác nhạy cảm vẫn chỉ chủ.

## 6. Lộ trình triển khai đề xuất
| Đợt | Việc | Ghi chú |
|---|---|---|
| **A** | Bảng `coop_data_sharing` (hộ, HTX, mức 2/3, ủy quyền nhập, người đồng ý, thời điểm, thu hồi lúc); màn **đồng ý khi chấp nhận lời mời** (3 mức, nói rõ HTX thấy gì); hộ đổi/thu hồi ở "Cơ sở của tôi" | Migration + test quyền |
| **B** | Mở **quyền đọc có điều kiện** cho HTX: nhật ký, thu hoạch, vật tư, sự cố của vụ hộ theo mức; mở rộng hàm `readable_cycle_ids` (đã tối ưu D138) thay vì sửa từng chính sách; **nhật ký truy cập** | Test: hộ A không đọc được hộ B; HTX chỉ thấy hộ đã đồng ý; thu hồi có hiệu lực ngay |
| **C** | **Báo cáo HTX** tổng hợp theo hộ (sản lượng, vụ, hộ chậm ghi nhật ký, cách ly, sự cố; tài chính nếu bật) + xuất CSV | Hàm máy chủ, phân trang |
| **D** | **Ủy quyền nhập hộ** có nhãn "do HTX nhập" | Cần đồng ý riêng |
| **E** | **Rời HTX có xuất dữ liệu**, bản chụp truy xuất; **chuyển quyền chủ** cho hộ do HTX tạo (thay A1, D133) | Chốt quy tắc pháp lý |
| **F** (sau) | Cụm/tổ hộ trong HTX, báo cáo theo cụm | |

## 7. Cần chủ sản phẩm chốt
1. **Mức 2 (xem sản xuất) bắt buộc** khi vào HTX, hay hộ tự chọn? Đề xuất: **bắt buộc nếu HTX bật "truy xuất/thu mua"**, còn lại hộ chọn.
2. **Mức 3 (tài chính) mặc định không**, chỉ giao dịch với HTX hiển thị chung. Đồng ý?
3. **Ủy quyền nhập hộ** có làm không, và ai trong HTX được dùng (chủ, quản lý HTX)?
4. Quy tắc **rời HTX**: HTX giữ bản chụp truy xuất bao lâu? (đề xuất 24 tháng, cần cố vấn pháp lý).
