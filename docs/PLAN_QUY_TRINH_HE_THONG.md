# Kế hoạch: "Tạo quy trình" có 2 phần — Của cơ sở và Mẫu hệ thống (đề xuất 28/10/2026, chờ duyệt)

## Hiện trạng đã kiểm tra
- Mục **Quy trình mẫu** đã đổi tên thành **Tạo quy trình** (28/10/2026).
- **Chưa có quy trình hệ thống nào trong CSDL.** Mọi quy trình hiện là của từng cơ sở (A23). Bộ quy trình dưa lưới (T6 trong `PLAN_DOT1_TRONG_TROT.md`) từng bị hoãn vì thiếu số liệu thật của 2 hộ. Những thứ đã làm trước đây chỉ là: bộ trường ghi (nay là biểu mẫu chuẩn của từng việc), sổ nhật ký/checklist VietGAP dưa lưới, và bảng cũ `task_templates` không còn dùng.
- Vì vậy phần **nội dung** (công đoạn, việc, số ngày của từng loại: dưa lưới, heo thịt, cá, tôm…) là phần phải soạn mới, quan trọng hơn phần giao diện.

## Ý kiến
Hướng của bạn đúng và nên làm: cơ sở mới không phải tự dựng quy trình từ trắng, chỉ cần chọn mẫu đúng đối tượng rồi sửa. Ba nguyên tắc để không rối:
1. **Áp dụng = sao chép** thành quy trình riêng của cơ sở (như "nhân bản"). Sửa sau đó không ảnh hưởng mẫu hệ thống, và mẫu hệ thống đổi cũng không tự đổi quy trình của cơ sở (vụ đang chạy vốn đã là bản sao, D34).
2. **Mẫu hệ thống chỉ gồm công đoạn, việc (từ danh mục việc có sẵn), số ngày, mức độ quan trọng, ghi chú.** Không kèm vật tư cụ thể vì vật tư là danh mục riêng của mỗi cơ sở; gợi ý vật tư để sau.
3. **Gắn nhãn "Bản tham khảo, hãy đối chiếu với kỹ thuật của cơ sở"** và ghi nguồn (ví dụ "Theo sổ VietGAP dưa lưới") để không bị hiểu là chuẩn bắt buộc.

## Cách làm
**CSDL (migration mới, tên `..._app_system_templates.sql`)**
- Bảng `system_templates` (mã, tên, loại sản phẩm gốc `kind`, mô tả, nguồn, phiên bản, đang dùng), `system_template_phases`, `system_template_stages` (việc dùng chung theo `work_type_id`, số ngày, mức độ, ghi chú, công đoạn). Mọi người đăng nhập đọc được; chỉ quản trị nền tảng ghi (đi qua quyền quản trị đã có).
- Hàm `apply_system_template(p_org, p_system, p_crop_type, p_name)`: chủ/quản lý có quyền Khai báo; kiểm tra sản phẩm thuộc cơ sở (hoặc dùng chung) và **cùng loại** với mẫu; tạo `cycle_templates` + công đoạn + việc cho cơ sở; ghi `source_system_template` và phiên bản vào quy trình mới (để sau này báo "có bản mới", không tự ghi đè). Gọi lặp cùng mã thì không nhân đôi.
- Test CSDL: quyền, đúng loại, sao chép đủ, sửa bản của cơ sở không đổi mẫu hệ thống, cơ sở khác không đọc/ghi được quy trình của nhau.

**Soạn nội dung mẫu (migration seed riêng, có thể làm dần từng bộ)**
- Bắt đầu 3 bộ có sẵn tài liệu: **Dưa lưới nhà màng** (từ `Bang_kiem_25_VietGAP_Dua_luoi.xlsx`, sổ nhật ký dưa lưới), **Heo thịt** (từ `Bangkiem_SoNhatky_nuoiheo_VietGAP.xlsx`, `PLAN_DOT2_CHAN_NUOI_HEO.md`), và một bộ **thủy sản** nếu bạn có quy trình thực tế (cá tra/tôm).
- Tôi soạn bản nháp từ tài liệu; **bạn hoặc chuyên gia/hộ thí điểm duyệt số ngày và việc** trước khi cho cơ sở dùng (việc này tôi không tự quyết được).

**Giao diện: Tạo quy trình (2 tab)**
- **Của cơ sở** (như hiện nay).
- **Mẫu hệ thống**: danh sách chỉ gồm mẫu thuộc **loại đối tượng cơ sở đang sử dụng** (Cấu hình → Nhóm loại sản phẩm), mỗi mẫu có tên, nguồn, số công đoạn/việc/ngày; bấm vào để xem trước dạng cây công đoạn → việc; nút **Áp dụng cho cơ sở của tôi** → chọn sản phẩm (nếu có nhiều) và tên → tạo và mở thẳng trình soạn để sửa tùy ý.
- Cơ sở chưa có quy trình nào thì ở màn Tạo vụ có gợi ý "Chưa có quy trình? Xem mẫu hệ thống".

**Quản trị (apps/admin)**: màn soạn mẫu hệ thống cho quản trị nền tảng (giai đoạn sau; ban đầu nạp bằng migration).

## Các bước
| Bước | Nội dung | Cỡ |
|---|---|---|
| 1 | Migration + hàm áp dụng + test | M |
| 2 | Giao diện 2 tab, xem trước, nút Áp dụng | M |
| 3 | Soạn 1 bộ đầu tiên (dưa lưới) để chạy thử với hộ thí điểm | M (cần bạn duyệt nội dung) |
| 4 | Thêm bộ heo thịt, thủy sản | M mỗi bộ |
| 5 | Màn soạn mẫu cho quản trị nền tảng; báo "có bản mới" cho quy trình đã áp dụng | L, làm sau |

## Cần chủ sản phẩm quyết
1. Đồng ý áp dụng = sao chép và không tự cập nhật theo mẫu mới?
2. Bộ nào làm trước? Đề xuất dưa lưới (đã có sổ VietGAP, hộ thí điểm).
3. Ai duyệt nội dung chuyên môn của từng bộ?
