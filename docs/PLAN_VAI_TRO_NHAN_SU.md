# Thiết kế lại Vai trò – Quyền – Nhân sự – Tiền công (đề xuất, chờ chủ sản phẩm duyệt)

Ngày soạn: 24/10/2026. Chưa làm code. Khi được duyệt sẽ ghi thành D83–D85 trong `DECISIONS_APP.md` (thay thế D44, D49, D82 phần vai trò có sẵn).

## 1. Chỉ còn 3 vai trò cho mọi cơ sở

| Vai trò | Ý nghĩa |
|---|---|
| **Chủ cơ sở** | Có mọi quyền ở mọi chức năng. Chỉ chủ: mời/tạm dừng người, đặt quyền, đặt lương và giá công, tính và khóa lương, gói dịch vụ, giấy phép, hồ sơ website. |
| **Quản lý** | Điều hành sản xuất hằng ngày; chỉ có **quyền tối thiểu** (mục 2). Chủ cấp thêm khi cần. |
| **Nhân viên** | Làm việc và ghi chép của chính mình; **quyền tối thiểu** (mục 2). |

Các vai trò cũ không còn là vai trò: Kho & chi phí → nhân viên + cấp thêm quyền Kho/Chi phí/Doanh thu; Biên tập hồ sơ → nhân viên + quyền Hồ sơ website; Quản lý HTX → quản lý + quyền Hộ thành viên. Tổ trưởng vẫn là chỉ định theo tổ. Trang quản trị "Tên vai trò" (D82) giữ lại, chỉ còn 3 tên.

## 2. Danh sách quyền tối thiểu (cần bạn duyệt)

Ký hiệu: ✔ có · 👁 chỉ xem · — không có.

| Chức năng | Nhân viên | Quản lý | Chủ |
|---|---|---|---|
| Vào ca / Ra ca, chấm công của mình | ✔ | ✔ | ✔ |
| Ghi nhật ký việc và vật tư đã dùng (kể cả offline) | ✔ | ✔ | ✔ |
| Sửa/hủy nhật ký **của mình** | ✔ | ✔ | ✔ |
| Sửa/hủy nhật ký của người khác | — | ✔ | ✔ |
| Xem vụ, lịch, quy trình của vụ | ✔ (vụ đang chạy) | ✔ | ✔ |
| Tạo vụ, sửa giai đoạn, bắt đầu/hoàn thành giai đoạn | — | ✔ | ✔ |
| Ghi thu hoạch | ✔ (của mình) | ✔ | ✔ |
| Xem Trang chủ: thống kê sản xuất, nhắc việc | ✔ (phần của mình) | ✔ | ✔ |
| Kho: xem tồn, lịch sử | — | 👁 | ✔ |
| Kho: nhập, điều chỉnh, danh mục vật tư | — | — | ✔ |
| Chi phí, Doanh thu, Công nợ, Tổng kết vụ, Báo cáo tuần/theo nhu cầu | — | — | ✔ |
| Khai báo (trang trại, sản phẩm, quy trình mẫu, đầu việc, nhà cung ứng, khách) | — | 👁 | ✔ |
| Nhân sự: xem danh sách người và tổ | — | 👁 | ✔ |
| Chấm công của cả cơ sở: xác nhận, duyệt yêu cầu sửa công | — | ✔ | ✔ |
| Mời người, tạo tài khoản, đặt quyền, tạm dừng | — | — | ✔ |
| Lương, giá công, thưởng/phạt, tính và khóa lương | — | — | ✔ |
| Xem tiền công **của mình** | ✔ | ✔ | ✔ |
| Hồ sơ website, đơn khách từ website | — | — | ✔ |
| Giấy phép, chứng chỉ | 👁 | 👁 | ✔ |
| Mã QR truy xuất của vụ, mã QR tài khoản | ✔ | ✔ | ✔ |
| Gói dịch vụ | — | — | ✔ |

**Quyền chủ có thể cấp thêm cho từng người** (mỗi mục chọn Không / Chỉ xem / Xem và sửa), dùng cơ chế "cấp riêng" đã có (D27): Kho, Thu hoạch (của cả cơ sở), Chi phí, Doanh thu và khách hàng, Công nợ, Tổng kết và báo cáo, Khai báo, Nhân sự (hồ sơ người), Chấm công (xác nhận), **Tiền công (xem/tính lương)**, Hồ sơ website và đơn khách, Hộ thành viên (HTX), Giấy phép.

## 3. Cơ sở đặc thù cần chia quyền nhiều hơn

**Đề xuất làm trước: "Mẫu quyền".** Chủ tự tạo các mẫu có tên tùy ý (ví dụ "Thủ kho", "Kế toán", "Tổ trưởng vườn", "Cán bộ kỹ thuật"), mỗi mẫu là một bộ quyền ở mục 2. Gán mẫu cho người thì người đó được cộng quyền của mẫu. Vai trò chính vẫn chỉ 3 loại, mẫu quyền chỉ là phím tắt để khỏi tích từng mục. Đã có sẵn hạ tầng (bảng `org_positions` D44/D49), chỉ đổi tên và bỏ phần "dựa trên vai trò".

**Làm sau, khi có cơ sở thật sự cần: "Phạm vi dữ liệu".** Giới hạn một người chỉ thấy/sửa trang trại hoặc tổ được giao (công ty nhiều trang trại, HTX nhiều vùng). Phức tạp hơn vì phải đổi chính sách xem dữ liệu ở CSDL; không nên làm khi chưa có yêu cầu cụ thể.

Không đề xuất tự do tạo thêm "vai trò" mới: làm hệ thống khó hiểu, khó hướng dẫn, dễ sai quyền.

## 4. Thiết kế lại Nhân sự (xoay quanh từng người)

Hiện nay thông tin một người nằm rải ở 4 nơi (Nhân sự, Phòng/Tổ, Vai trò, Đơn giá công). Đề xuất gộp: **Tổ chức → Nhân sự = danh sách người; bấm vào một người mở hồ sơ gồm 4 thẻ thu gọn:**

1. **Thông tin và tài khoản**: tên, số điện thoại, có dùng app hay không (người không dùng app vẫn được chấm công hộ), tạm dừng/cho làm lại, đặt lại mật khẩu.
2. **Vai trò và quyền**: Quản lý hoặc Nhân viên, quyền cấp thêm, mẫu quyền.
3. **Phòng / Tổ**: chọn tổ (đổi tổ có ngày hiệu lực).
4. **Trả công**: cấu hình riêng cho người này (mục 5).

Phòng / Tổ giữ là mục riêng chỉ để tạo tổ và chọn tổ trưởng. Mục "Vai trò" rút thành "Mẫu quyền". Mục "Đơn giá công" ở Khai báo bỏ (chuyển vào hồ sơ từng người).

Các trường hợp phải đủ: có/không dùng app, nhân viên thời vụ theo ngày, tạm dừng/nghỉ việc (giữ dữ liệu cũ), đổi tổ, đổi giá giữa kỳ, sửa công, tạm ứng, kỳ lương đã khóa.

## 5. Trả công theo từng người (bỏ giá chung theo tổ/cơ sở)

Bỏ hẳn giá công theo tổ và theo cơ sở. Mỗi người có một hoặc nhiều dòng "Cách trả công", mỗi dòng có **ngày hiệu lực** (đổi giá chỉ áp dụng từ ngày đó, kỳ cũ không đổi):

- **Theo giờ**: đồng/giờ.
- **Theo sản lượng**: đồng/đơn vị (kg, giỏ, cây…), có thể riêng theo loại việc.
- **Lương cố định theo tháng** (đề xuất thêm, cho quản lý, bảo vệ, kỹ thuật…): số tiền/tháng, tính theo kỳ lương.

Có thể kết hợp (ví dụ lương tháng + sản lượng). Khi tính lương mà người có công nhưng chưa có giá thì app báo rõ "Chưa nhập giá công cho: …" và không tính bậy. Chỉ chủ (hoặc người được cấp quyền Tiền công) xem và sửa giá; quản lý mặc định không thấy lương người khác.

## 6. Thưởng, phạt, tạm ứng khi tính lương

CSDL đã có bảng thưởng/khấu trừ/tạm ứng (`pay_adjustments`); sẽ làm lại giao diện cho dễ dùng: ở **Báo cáo → Tiền công**, mỗi người trong kỳ có nút **＋ Thưởng**, **＋ Phạt**, **＋ Tạm ứng** (nhập số tiền và **lý do bắt buộc**). Bảng lương hiện: Công + Thưởng − Phạt − Tạm ứng = **Thực nhận**; từng khoản có lý do và người nhập. Chỉ sửa/xóa được khi kỳ chưa khóa; khóa rồi muốn đổi phải mở khóa (có nhật ký). Nhân viên xem phiếu lương của mình thấy đủ từng khoản và lý do.

## 7. Cách làm (đề xuất chia lát)

| Lát | Nội dung | Ghi chú |
|---|---|---|
| V1 | 3 vai trò, bảng quyền tối thiểu, mẫu quyền; chuyển đổi dữ liệu cũ; sửa giao diện ẩn/hiện; cập nhật quản trị "Tên vai trò" | Có migration + test quyền (đổi `role_default_perm`, `perm_level`, test `perms`) |
| V2 | Hồ sơ nhân sự theo người (4 thẻ); bỏ Đơn giá công ở Khai báo | Chủ yếu giao diện |
| V3 | Trả công theo người (theo giờ, sản lượng, lương tháng), bỏ giá tổ/cơ sở; thưởng/phạt/tạm ứng; phiếu lương | Migration + test tính lương |
| V4 | Cập nhật Hướng dẫn sử dụng, ROLES.md, HUONG_DAN_THU.md | Chữ |

Hiện dữ liệu trong hệ thống chỉ là dữ liệu thử nên việc chuyển đổi vai trò cũ sang mới không rủi ro; vẫn viết migration chuyển đổi đúng để sau này không phải lo.

## 8. Cần bạn quyết định

1. Bảng quyền tối thiểu mục 2 đã đúng ý chưa (nhất là: nhân viên có xem nhật ký của người khác không; quản lý có xem Kho, Khai báo ở mức xem không)?
2. Quản lý **không** thấy Chi phí/Doanh thu/Tổng kết/Báo cáo tuần mặc định: đồng ý không? (Báo cáo tuần sẽ chỉ hiện phần quản lý được xem.)
3. Có thêm cách trả **lương cố định theo tháng** không?
4. Đồng ý "Mẫu quyền" làm trước, "Phạm vi theo trang trại/tổ" để sau?
