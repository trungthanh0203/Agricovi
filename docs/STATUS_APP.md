# Trạng thái APP (cập nhật khi xong mốc; giữ file này NGẮN)

Website: `STATUS_WEB.md`. Quyết định: `DECISIONS_APP.md`. Lịch sử chi tiết từng mốc cũ (bước C, Giai đoạn 2, lương, Đợt 1…): `STATUS_APP_LICHSU.md` (chỉ tra cứu khi cần, không đọc hết).

## Đang làm
- Lộ trình: `KE_HOACH_TONG_THE.md` (P1–P9). **P1** theo `PLAN_P1_NEN_DU_LIEU.md` (D98), 3 mốc:
  - **M1 xong về code (25/10/2026)**: migration 0080 (mã/loại khu/kiểu chuồng; mã vụ, đơn vị đếm, cán bộ phụ trách; ghi việc cho khu không gắn vụ); test `areas_fields`.
  - **M2 xong về code (25/10/2026)**: migration 0081 (nhóm/hoạt chất/số đăng ký/nhà sản xuất của vật tư; số lô + hạn dùng khi nhập kho; tự gắn lô FIFO khi xuất, bỏ qua lô hết hạn; chỉ định lô hết hạn phải có lý do; đảo kho mang đúng lô; `get_lot_status`); test `material_lots`; app: sửa vật tư, Nhập kho có lô/hạn, lịch sử hiện lô, thẻ "Lô sắp hết hạn" ở Trang chủ và Kho. Chưa làm: chọn lô tay khi Ghi việc; nhập lô trong "Mua có hóa đơn" (nhập kho từ hóa đơn chưa có ô lô).
  - **M3 xong về code (25/10/2026)**: migration 0082 (mã lô thu hoạch tự sinh, số quả/con, dữ liệu form động `extra`; sự cố có nguyên nhân + loại thiết bị/chuồng + kim gãy; kim gãy chưa xử lý ⇒ thu/bán phải ghi lý do, cùng ô lý do với cách ly); test `harvest_fields`; gói trường tách file `lib/packs/melon.ts`, `lib/packs/pig.ts` (thêm loại hình = thêm file). **P1 xong về code.**
- **P1B xong về code (25/10/2026)**: migration 0084 (bảng kiểm nội bộ: bộ dùng chung 45 tiêu chí nạp từ file của chủ sản phẩm; bản sao riêng từng cơ sở với mức A/B, nội dung, ngưỡng sửa được; đánh giá theo năm, chụp nội dung lúc bắt đầu, chốt bất biến, hủy kèm lý do); test `checklists`; app: Báo cáo → Bảng kiểm. Bộ nạp sẵn đang ghi "chưa đối chiếu với bản chính thức" cho tới khi chủ cơ sở bấm "Đã đối chiếu".
- **Kế tiếp: P2** (biến động số lượng, mật độ, hao hụt). Bạn cần đối chiếu mức A/B của bảng kiểm với bản chính thức rồi sửa trong app nếu lệch.
- Việc nhỏ của P1 đã xong (migration 0083: số lô trong Mua có hóa đơn; chọn lô tay khi Ghi việc; Hướng dẫn trong app; D99).

## Việc người dùng cần làm
- **Chưa `npx supabase db push` các migration 0016–0084** (app vẫn tải được dữ liệu cũ khi chưa push, nhưng chưa lưu được trường mới; xem `HUONG_DAN_THU.md` để thử tay).
- Chưa deploy lại Edge Function `staff-accounts` (D45).

## Cần bên WEB
(trống)

## Ghi chú
- Chủ sản phẩm đã quyết: bỏ mẫu dưa lưới cũ, hoãn pilot/tên miền/thời tiết. G2-3 (chụp hóa đơn) chưa làm.
- Hạ tầng: GitHub + Supabase + Cloudflare Pages; domain chưa mua (`login_email_domain` tạm `agricovi.com`, xem `DECISIONS_CHUNG.md`).
