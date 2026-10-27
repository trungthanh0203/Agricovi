# Kế hoạch: quy trình → công đoạn → nhiều việc (đề xuất 28/10/2026, chờ chủ sản phẩm duyệt)

## Khái niệm đã chốt (28/10/2026)
- **Quy trình** (mẫu) gồm nhiều **công đoạn** (ví dụ: Ươm giống, Ra hoa, Nuôi quả).
- Mỗi **công đoạn** gồm nhiều **việc** (ví dụ: Bón phân, Phun thuốc, Tưới).
- **Việc** là danh mục ở Khai báo → Việc (trước đây tạm gọi "Đầu việc"/"Giai đoạn việc"): định nghĩa các ô cần ghi và áp dụng cho cây trồng/vật nuôi/thủy sản.
- **Ghi việc** dùng định nghĩa của việc để nhập/chọn thông tin rồi ghi vào nhật ký cho báo cáo.

## Hiện trạng (khác với khái niệm trên)
Một công đoạn (`template_stages`, `cycle_stages`) hiện chỉ gắn **một** việc (`work_type_id`) cộng số ngày. Chưa có "nhiều việc trong một công đoạn".

## Đề xuất làm (theo ảnh mẫu: số ngày lặp lại, ngày bắt đầu/kết thúc lặp, hướng dẫn, vật tư dự kiến)
1. Bảng `template_stage_tasks` (công đoạn mẫu → nhiều việc): việc, lặp lại mỗi N ngày, từ ngày A đến ngày B của công đoạn, hướng dẫn, danh sách vật tư dự kiến (vật tư, lượng, ghi chú "dùng cho X m²/ha"). Chép sang vụ lúc tạo vụ (`cycle_stage_tasks`).
2. Trình soạn quy trình: mỗi công đoạn là một thẻ mở rộng, bên trong là danh sách việc (thêm/sửa cùng một form, theo [[feedback-add-edit-same-place]]).
3. Chi tiết vụ: mỗi công đoạn hiện các việc cần làm, hôm nay đến hạn việc nào; bấm một việc mở thẳng Ghi việc với việc và công đoạn đã chọn sẵn.
4. Dữ liệu cũ: mỗi công đoạn cũ tự thành công đoạn có đúng một việc (không mất gì).
Cỡ L, có migration; làm theo từng bước dùng được riêng.

## Tiến độ (28/10/2026) — thiết kế đã chốt với chủ sản phẩm
- Quy trình → **Công đoạn** (số thứ tự/mã, tên, mô tả) → **Việc** (chọn từ danh mục Việc, số ngày, mức độ quan trọng Cao/Trung bình/Thấp, ghi chú).
- Mỗi việc vẫn là một hàng `template_stages` (có thêm `phase_id`, `importance`); công đoạn là bảng `template_phases`. Tạo vụ chụp công đoạn và mức độ vào `production_stages` (migration 0109). Nhờ vậy lịch, tiến độ, Ghi việc không đổi cách chạy.
- **Việc** (Khai báo): thêm Vật tư sử dụng (gợi ý khi Ghi việc); đối tượng sản xuất chỉ chọn MỘT (việc riêng của cơ sở). Việc dùng chung có sẵn nhiều đối tượng (Cho ăn, Thu hoạch…) giữ nguyên, tách riêng để sau vì mã việc đang gắn với tính Tăng trọng/FCR và biểu mẫu chuẩn.
- Đã làm: migration 0109, trình soạn quy trình 2 cấp, form Việc (đối tượng một, vật tư), Ghi việc nạp sẵn vật tư.
- Còn lại: chi tiết vụ/lịch/tiến độ hiện việc theo nhóm công đoạn (hiện vẫn danh sách phẳng, dùng chữ "công đoạn" cho từng việc); bước 2 (lặp lại, từ ngày–đến ngày, hướng dẫn, vật tư dự kiến kèm lượng cho từng việc trong quy trình); tách việc dùng chung theo từng đối tượng.
