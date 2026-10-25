# Trạng thái APP (cập nhật khi xong mốc; giữ file này NGẮN)

Website: `STATUS_WEB.md`. Quyết định: `DECISIONS_APP.md`. Lịch sử chi tiết từng mốc cũ (bước C, Giai đoạn 2, lương, Đợt 1…): `STATUS_APP_LICHSU.md` (chỉ tra cứu khi cần, không đọc hết).

## Đang làm
- Lộ trình: `KE_HOACH_TONG_THE.md` (P1–P9). **P1** theo `PLAN_P1_NEN_DU_LIEU.md` (D98), 3 mốc:
  - **M1 xong về code (25/10/2026)**: migration 0080 (mã/loại khu/kiểu chuồng; mã vụ, đơn vị đếm, cán bộ phụ trách; ghi việc cho khu không gắn vụ); test `areas_fields`.
  - **M2 xong về code (25/10/2026)**: migration 0081 (nhóm/hoạt chất/số đăng ký/nhà sản xuất của vật tư; số lô + hạn dùng khi nhập kho; tự gắn lô FIFO khi xuất, bỏ qua lô hết hạn; chỉ định lô hết hạn phải có lý do; đảo kho mang đúng lô; `get_lot_status`); test `material_lots`; app: sửa vật tư, Nhập kho có lô/hạn, lịch sử hiện lô, thẻ "Lô sắp hết hạn" ở Trang chủ và Kho. Chưa làm: chọn lô tay khi Ghi việc; nhập lô trong "Mua có hóa đơn" (nhập kho từ hóa đơn chưa có ô lô).
  - **M3 xong về code (25/10/2026)**: migration 0082 (mã lô thu hoạch tự sinh, số quả/con, dữ liệu form động `extra`; sự cố có nguyên nhân + loại thiết bị/chuồng + kim gãy; kim gãy chưa xử lý ⇒ thu/bán phải ghi lý do, cùng ô lý do với cách ly); test `harvest_fields`; gói trường tách file `lib/packs/melon.ts`, `lib/packs/pig.ts` (thêm loại hình = thêm file). **P1 xong về code.**
- **P1B xong về code (25/10/2026)**: migration 0084 (bảng kiểm nội bộ: bộ dùng chung 45 tiêu chí nạp từ file của chủ sản phẩm; bản sao riêng từng cơ sở với mức A/B, nội dung, ngưỡng sửa được; đánh giá theo năm, chụp nội dung lúc bắt đầu, chốt bất biến, hủy kèm lý do); test `checklists`; app: Báo cáo → Bảng kiểm. Bộ nạp sẵn đang ghi "chưa đối chiếu với bản chính thức" cho tới khi chủ cơ sở bấm "Đã đối chiếu".
- **P2 gọn xong về code (25/10/2026, D100)**: migration 0085 (`cycle_count_events`: nhập/dặm, chết, loại, xuất; ghi offline qua hàng đợi; hủy có lý do), test `count_events`; app: mục "Số cây/con và hao hụt" trong chi tiết vụ (còn lại, tỉ lệ hao, m²/con; vật nuôi tự trừ số con ở phiếu thu hoạch); Dexie v14.
- **P4 gọn xong về code (25/10/2026, D100)**: migration 0086 (`template_milestones`, `cycle_milestones`: mốc nhắc "N ngày trước ngày thu dự kiến" hoặc "N ngày sau ngày bắt đầu", tự dời theo ngày của vụ; sao từ mẫu khi tạo vụ; quản lý thêm/xóa riêng từng vụ; đánh dấu đã làm); test `milestones`; app: thẻ "Việc cần nhớ" ở Trang chủ, mục "Mốc nhắc việc" trong chi tiết vụ và trong quy trình mẫu (gợi ý ngưng phân 7 / ngưng tưới 5 ngày cho dưa), cảnh báo trống chuồng dưới 7 ngày khi tạo vụ; Dexie v15. **Chưa nạp lịch vaccine heo**: lịch do thú y của trại chốt, chủ tự thêm mốc theo lịch đó.
- **P5 gọn xong về code (25/10/2026, D100)**: migration 0087 (thêm bộ bảng kiểm dùng chung **dưa lưới nhà màng, 18 tiêu chí: 11 A / 7 B**, từ file của chủ sản phẩm; file ghi "25 tiêu chí" ở mục lục nhưng bảng chỉ có 18, chưa đối chiếu); app: Báo cáo → **Sổ nhật ký** (dựng bộ sổ dưa 6 sổ hoặc heo 5 sổ từ dữ liệu đã ghi; xem, **in A4 ngang**, **tải file Excel (CSV)**; mục "Còn thiếu gì trước khi nộp"), Bảng kiểm hỗ trợ nhiều bộ; test `logbook` (thuần, không cần CSDL), `checklists`. Cột file mẫu mà app chưa ghi (tỉ lệ nảy mầm, nhiệt độ/độ ẩm nhà màng, số lần tưới/ngày) để trống; làm khi có phiếu đo (P3).
- **P3 gọn xong về code (25/10/2026, D100)**: migration 0088 (`get_cycle_growth`: các lần "Cân heo" và cám nhóm Thức ăn đã xuất cho vụ, quy ra kg; không ghi gì); `lib/growthLogic.ts` tính ADG, FCR, cám/kg xuất bán; mục "Tăng trọng và FCR" trong chi tiết vụ vật nuôi; test `cycle_growth`. Là số ước tính từ cân mẫu. Cần vật tư cám có nhóm "Thức ăn" và đơn vị kg.
- **Kế tiếp: chế độ đơn giản** (ẩn mục theo loại hình cho hộ nhỏ), rồi dừng để dùng thử thật theo D100. Lộ trình rút gọn P2–P5 đã xong về code.
- Việc nhỏ của P1 đã xong (migration 0083: số lô trong Mua có hóa đơn; chọn lô tay khi Ghi việc; Hướng dẫn trong app; D99).

## Việc người dùng cần làm
- **Chưa `npx supabase db push` các migration 0016–0088** (app vẫn tải được dữ liệu cũ khi chưa push, nhưng chưa lưu được trường mới; xem `HUONG_DAN_THU.md` để thử tay).
- Chưa deploy lại Edge Function `staff-accounts` (D45).

## Cần bên WEB
(trống)

## Ghi chú
- Chủ sản phẩm đã quyết: bỏ mẫu dưa lưới cũ, hoãn pilot/tên miền/thời tiết. G2-3 (chụp hóa đơn) chưa làm.
- Hạ tầng: GitHub + Supabase + Cloudflare Pages; domain chưa mua (`login_email_domain` tạm `agricovi.com`, xem `DECISIONS_CHUNG.md`).
