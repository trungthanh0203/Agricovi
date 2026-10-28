# Kế hoạch: nút ⋮ "Tuỳ chọn" cho các dòng có nhiều nút chức năng (28/10/2026)

## Mẫu đã làm
Component `components/RowMenu.tsx`: nút ⋮ cuối dòng, bấm mở bảng **Tuỳ chọn** trượt từ dưới lên (thanh xanh có ✕, danh sách chức năng, nút Đóng). Mỗi chức năng có biểu tượng, nhãn, tùy chọn `danger` (Xóa) và `disabled` + ghi chú lý do. Đã áp dụng cho **danh sách việc của vụ** (Chi tiết vụ) và **tiêu đề công đoạn** của vụ. Nhờ đó dòng chỉ còn nút chính ("Ghi việc", "Xong/Bắt đầu") và ⋮, nhường chỗ cho nội dung trên điện thoại.

## Quy tắc chung
1. Dòng có từ **2 nút phụ trở lên** (✎, ⏸, ↑, ↓, 🗑, ↺…) thì gom vào ⋮. Chỉ giữ ngoài dòng **một nút chính** nếu người dùng bấm nhiều lần mỗi ngày.
2. Thứ tự trong bảng: chức năng thường dùng trước (Chỉnh sửa), rồi Dừng/Mở lại, rồi **Xóa** (đỏ, luôn có hộp xác nhận).
3. Chức năng không dùng được thì **vẫn hiện nhưng mờ**, kèm lý do ngắn (ví dụ "chỉ khi chưa làm") thay vì biến mất.
4. Sắp xếp ↑ ↓ trong lưới giữ dạng kéo thả hoặc nút riêng (không nhét vào ⋮) vì bấm liên tục.
5. Vùng bấm tối thiểu 52 px; nhãn tiếng Việt dễ hiểu; hỗ trợ phím Esc và đọc màn hình (`aria-label` có tên dòng).

## Các màn cần chuyển (số nút `icon` hiện có trên mỗi dòng)
| Đợt | Màn | Nút hiện có | Chức năng đưa vào ⋮ |
|---|---|---|---|
| 1 | **Tạo quy trình** (`TemplateEditor`): thẻ việc và tiêu đề công đoạn | 5 | Sửa, Lên, Xuống, Xóa (công đoạn: Sửa, Xóa, đổi chỗ) |
| 1 | **Việc** (`WorkTypesSection`) | 4 | Chỉnh sửa, Dừng/Dùng lại |
| 1 | **Vật tư** (`CatalogSection`) | 4 | Chỉnh sửa, Dừng/Dùng lại, Xóa/Lô, Nhập kho |
| 2 | Phân khu, Sản phẩm (`AreasSection`, `CropsSection`) | 2 | Chỉnh sửa, Dừng/Dùng lại |
| 2 | Nhân sự, Phòng/Tổ, Chức vụ, Giấy phép (`MembersSection`, `TeamsSection`, `PositionsSection`, `LicensesSection`) | 2–3 | Chỉnh sửa, Đặt lại mật khẩu, Dừng, Xóa |
| 2 | Nhà cung ứng, Khách hàng, Hộ thành viên (`PartnersSection`, `CustomersSection`, `CooperativeSection`) | 2–3 | Chỉnh sửa, Ghi công nợ, Dừng |
| 3 | Chấm công, Hồ sơ web, Sự cố, Ghi chú lịch (`AttendanceSection`, `CommerceProfile`, `IncidentsSection`, `CycleCalendar`) | 1–3 | Duyệt/Từ chối, Sửa, Xóa |
| 3 | Trang quản trị nền tảng (`apps/admin`) và quản trị website (`apps/webadmin`) | — | Rà theo cùng quy tắc; dùng chung qua `packages/admin-kit` nếu giữ nguyên chữ ký |

## Cách làm mỗi đợt
Đợt nhỏ (3–4 màn), mỗi màn: thay cụm nút bằng `<RowMenu label={tên dòng} items={[…]} />`, giữ nguyên hàm xử lý, kiểm bằng typecheck và xem trên điện thoại. Không đổi SQL nên không cần test CSDL. Sau đợt 3 ghi quy tắc vào `apps/app/CLAUDE.md`.
