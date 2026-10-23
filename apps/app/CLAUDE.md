# Mảng APP (apps/app + apps/admin)

Chat này chỉ làm **APP**: app PWA quản lý cơ sở và trang quản trị nền tảng (`/quan-tri/`). Quy tắc chung ở `CLAUDE.md` gốc.

## Đọc khi cần (đừng đọc hết)
- Quyết định: `docs/DECISIONS_APP.md` (D10, D14–D56); chung: `docs/DECISIONS_CHUNG.md`.
- Trạng thái và việc kế tiếp: `docs/STATUS_APP.md`.
- Quyền/vai trò: `docs/ROLES.md`. Bố cục tab: `docs/PLAN_BO_CUC_MOI.md`. Số liệu/dashboard: `docs/DESIGN_DASHBOARD.md`. Thử tay: `docs/HUONG_DAN_THU.md`.

## Ranh giới
- Sửa trong `apps/app`, `apps/admin`, `supabase/migrations` (phần app), test app trong `supabase/tests`.
- **Không đụng** `apps/web`, `apps/webadmin`, bảng/hàm `site_*`, `web_*`, `trade*`, `shops`, `public_*` (của website). Hồ sơ thương mại/`public_cycles` do app *ghi* nhưng cấu trúc đã chốt (D53, D55): đổi thì báo người dùng.
- Migration mới đặt tên `..._app_*.sql`.
- Mọi chữ trên giao diện tiếng Việt, dễ hiểu; mỗi màn ngắn gọn (`Collapsible`, nút Lưu/Hủy cặp đôi).
