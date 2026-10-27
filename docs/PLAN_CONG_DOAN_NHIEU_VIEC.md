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
