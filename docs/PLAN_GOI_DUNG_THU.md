# Kế hoạch: gói dùng thử có phạm vi (chờ duyệt, chưa làm)

Mục tiêu: người dùng thử chỉ trải nghiệm phần cơ bản nhỏ nhất, đủ thấy giá trị nhưng không học hết quy trình hệ thống trong 30 ngày. Nguyên tắc: **ép ở CSDL**, giao diện chỉ phản ánh.

## Đã chốt (17/11/2026)
1. Dùng thử **30 ngày**.
2. **Hộ**: chỉ tạo 1 vụ. **HTX**: chỉ thêm 1 hộ và 1 vụ.
3. Tài khoản dùng thử **không được công khai lên website** (hồ sơ thương mại, vụ công khai, gian hàng).
4. Mỗi tài khoản dùng thử có sẵn **1 vụ mẫu chỉ xem, tự hết hạn sau 24 giờ**.

## Đề xuất cho các điểm chưa chốt (tự chọn mặc định, bạn sửa nếu không đồng ý)
- **Tính năng khóa khi dùng thử** (hiện dòng "Có ở gói trả phí", không ẩn hẳn): chấm công và khuôn mặt, Khoán công, Tài sản, kiểm kho, đọc hóa đơn bằng AI (giữ hạn mức nhỏ hiện có), hồ sơ xuất khẩu, bản đồ thửa, hợp đồng, bảng kê thu mua, báo cáo theo nhu cầu, thông báo đẩy và bản tin sáng, so sánh vụ.
- **Mở**: ghi việc, vật tư và kho cơ bản, chi phí, thu hoạch, bán hàng, tổng kết lãi/lỗ của vụ.
- **Đăng ký**: giữ mở như hiện nay ở bước 1; mã mời/duyệt tay xét sau khi đo.
- **Điều khoản**: nhờ luật sư soạn sau, không chặn việc làm.

## Cách làm theo bước
### Bước 1: giới hạn số lượng + chặn công khai + vụ mẫu (làm trước)
- Migration `app_trial_scope`: thêm gói dùng thử riêng (`plan_tiers`), cột `max_households` (hộ: 1 vụ; HTX: 1 hộ, 1 vụ). Hàm tạo vụ/tạo hộ kiểm hạn mức trong CSDL; lỗi tiếng Việt thân thiện (`errors.ts`).
- Chặn công khai: hàm/trigger ghi hồ sơ thương mại, `public_cycles` từ chối khi gói đang là dùng thử.
- Vụ mẫu: tạo khi cấp gói dùng thử, cờ `is_demo` + `demo_expires_at` (24 giờ); không tính vào hạn mức vụ; hết hạn thì ẩn/xóa bằng tác vụ định kỳ.
- Test CSDL gọn cho hạn mức, chặn công khai, vụ mẫu hết hạn.

### Bước 2: khóa theo tính năng
- Bảng tính năng theo gói + hàm kiểm ở CSDL (cùng cơ chế `org_features`), `permissions.ts` phản ánh; giao diện hiện khung khóa "Có ở gói trả phí".

### Bước 3: phát hiện bất thường + điều khoản
- Gắn cờ tài khoản dùng thử có kiểu dùng bất thường (dựa theo dõi hoạt động D160); điều khoản dùng thử.

## Lưu ý
- Mã giao diện là công khai, che nút chỉ che trải nghiệm; bảo vệ thật là ở CSDL.
- Đo tỷ lệ chuyển sang trả phí sau bước 1 trước khi khóa sâu hơn.
- Cơ sở thí điểm hiện tại cần gói "Thí điểm" đủ tính năng để không bị khóa nhầm (quản trị gán tay).
