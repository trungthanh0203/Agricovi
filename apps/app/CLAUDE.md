# Mảng APP (apps/app + apps/admin)

Chat này chỉ làm **APP**: app PWA quản lý cơ sở và trang quản trị nền tảng (`/quan-tri/`). Quy tắc chung ở `CLAUDE.md` gốc.

## Đọc khi cần (đừng đọc hết)
- Quyết định: `docs/DECISIONS_APP.md` (D10, D14–D56); chung: `docs/DECISIONS_CHUNG.md`.
- Trạng thái và việc kế tiếp: `docs/STATUS_APP.md` (ngắn; lịch sử ở `STATUS_APP_LICHSU.md`, không đọc hết). Lộ trình Giai đoạn 2: `docs/PLAN_GIAI_DOAN_2_APP.md` (làm theo thứ tự trong đó).
- Quyền/vai trò: `docs/ROLES.md`. Bố cục tab: `docs/PLAN_BO_CUC_MOI.md`. Số liệu/dashboard: `docs/DESIGN_DASHBOARD.md`. Thử tay: `docs/HUONG_DAN_THU.md`.

## Ranh giới
- Sửa trong `apps/app`, `apps/admin`, `supabase/migrations` (phần app), test app trong `supabase/tests`.
- **Không đụng** `apps/web`, `apps/webadmin`, bảng/hàm `site_*`, `web_*`, `trade*`, `shops`, `public_*` (của website). Hồ sơ thương mại/`public_cycles` do app *ghi* nhưng cấu trúc đã chốt (D53, D55): đổi thì báo người dùng.
- Migration mới đặt tên `..._app_*.sql`.
- Mọi chữ trên giao diện tiếng Việt, dễ hiểu; mỗi màn ngắn gọn (`Collapsible`, nút Lưu/Hủy cặp đôi).

## Thêm một trường mới đi qua đâu (đỡ phải dò)
1. Migration `..._app_*.sql`: cột + ràng buộc; ghi qua hàm `set_*` (có kiểm quyền) hoặc cập nhật trực tiếp nếu bảng cho phép. Test gọn trong `supabase/tests`.
2. `apps/app/src/lib/db.ts`: thêm vào `AreaRow`/`CycleRow`… (Dexie không cần đổi schema nếu cột không được lập chỉ mục).
3. `apps/app/src/lib/production.ts`: danh sách cột tải (`AREA_COLUMNS`, `CYCLE_COLUMNS` có bậc dự phòng khi CSDL chưa `db push`), hàm ghi (`createArea`/`updateArea`, `setCycleInfo`…).
4. Form: `components/AreasSection.tsx` (trang trại), `components/CycleInfoFields.tsx` + `screens/CreateCycleScreen.tsx`/`screens/ProductionTab.tsx` (vụ), `screens/LogActivityScreen.tsx` (ghi việc). Hiển thị: `CycleStatsStrip`, `SummarySection`, `LogsScreen`.
5. Lỗi thân thiện: `lib/errors.ts`. Tìm đúng dòng bằng Grep rồi đọc một khoảng; đừng đọc cả file lớn.
6. Tài liệu: `STATUS_APP.md` ngắn; lịch sử ở `STATUS_APP_LICHSU.md`; `DECISIONS_APP.md` có mục lục đầu file.
- Form nhập liệu mới luôn dùng khung `.inline-form` (có thẻ `.card` bao ngoài khi sửa): app tự **cuộn tới form** khi người dùng bấm Sửa/Thêm mới (`lib/autoScrollToForm.ts`, gắn một lần ở `App.tsx`); ô lọc dùng `.filters` (cùng kiểu chữ với form). Form thêm và form sửa đặt cùng chỗ, cùng trường.
