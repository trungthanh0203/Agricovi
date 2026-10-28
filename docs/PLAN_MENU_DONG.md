# Nguyên tắc xếp nút chức năng trên một dòng của lưới/danh sách (chốt 28/10/2026)

Hầu hết lưới dùng **nút biểu tượng** (✎ ✕ 🗑 ↑ ↓ ⏸ ▶ ↺) nên không tốn chỗ. Không gom tất cả vào ⋮.

1. **Nút biểu tượng**: xếp các nút **liên quan nhau** chung một hàng, nhóm khác xuống hàng dưới.
   - Thẻ việc của quy trình: hàng trên **↑ ↓** (thứ tự), hàng dưới **✎ ✕** (sửa, xóa).
   - Dòng có 3 nút tạm dừng, sửa, xóa: hàng trên **⏸/▶** (tạm dừng), hàng dưới **✎ 🗑** (sửa, xóa).
   - Dòng chỉ có 2 nút thì để chung một hàng.
   - Lớp CSS dùng chung: `.iconrows` (các hàng xếp dọc, căn phải) và `.iconline` (một hàng).
2. **Nút phải dùng chữ** (nhãn dài làm tốn diện tích): chuyển vào nút **⋮** bằng component `components/RowMenu.tsx` (bảng "Tuỳ chọn" trượt từ dưới lên: ✕ ở thanh xanh, các chức năng có biểu tượng, Xóa màu đỏ, mục không dùng được thì mờ kèm lý do, nút Đóng). Hiện dùng ở **tiêu đề công đoạn của vụ** (Sửa công đoạn, Xóa công đoạn giữ việc, Xóa công đoạn và các việc).
3. Xóa luôn có hộp xác nhận; nút không dùng được vẫn hiện (mờ, có `title` giải thích).
4. Nút chính dùng nhiều lần mỗi ngày (Ghi việc, Xong/Bắt đầu) để dạng chữ, xếp dọc trong cột hẹp.

## Đã áp dụng
- Danh sách việc của vụ (Chi tiết vụ): cột nút gồm Ghi việc, Xong/Bắt đầu (chữ, xếp dọc) và một hàng biểu tượng ↺ ✎ 🗑; tiêu đề công đoạn dùng ⋮.
- Thẻ việc trong Tạo quy trình: hai hàng ↑ ↓ và ✎ ✕.
- Đã **bỏ** thử nghiệm ⋮ cho Việc, Vật tư/Kho (đợt 1 cũ): giữ nút biểu tượng như trước.

## Đã rà các lưới (28/10/2026)
- **Chức vụ**: hàng trên ⏸/▶, hàng dưới ✎ 🗑.
- **Khách hàng**: hàng trên ⏸/▶, hàng dưới ✎ 🕶 (ẩn danh).
- **Hộ thành viên (HTX)**: hàng trên ➜ (làm việc ở hộ), hàng dưới ✎ 🗑 (gỡ khỏi HTX).
- **Chấm công**: dùng ⋮ với chữ rõ nghĩa (Đề nghị sửa giờ, Xác nhận công, Từ chối công) vì biểu tượng khó hiểu.
- **Công đoạn trong Tạo quy trình**: nút chữ kèm biểu tượng ✎ Sửa, ↑ Lên, ↓ Xuống, 🗑 Xóa.
- Các lưới chỉ có 1–2 nút (Phân khu, Sản phẩm, Việc, Vật tư, Kho, Nhà cung ứng, Giấy phép, Phòng/Tổ, Nhân sự, Hồ sơ web, Sự cố) giữ **một hàng**.

## Quy ước cho lưới mới
Dòng có từ 3 nút biểu tượng thì dùng `.iconrows` (mỗi `<span>` là một hàng: nút trạng thái hoặc điều hướng ở hàng trên, sửa/xóa ở hàng dưới); từ 2 nút trở xuống để chung một hàng.
