# AgriConnect — hướng dẫn cho phiên làm việc mới

Nền tảng quản lý nuôi trồng (app PWA) + website xúc tiến thương mại. Người dùng cuối nói **tiếng Việt**: mọi chữ trên giao diện, thông báo lỗi, tài liệu và commit đều viết **tiếng Việt**, dễ hiểu cho người ít quen công nghệ. Trả lời ngắn gọn; hướng dẫn thử dài đưa vào `docs/`, không dán cả vào chat.

## Đọc trước khi làm (theo thứ tự)

1. `docs/DECISIONS.md` — mọi quyết định đã chốt (D1…D18) và các **[GIẢ ĐỊNH]** còn chờ xác nhận. **Không tự đổi quyết định đã chốt.**
2. `docs/ROLES.md` — ma trận vai trò/quyền (nguồn sự thật là CSDL).
3. `AgriConnect_Dac_ta_thiet_ke_nghiep_vu_v1.1.md` + `AgriConnect_Dac_ta_bo_sung_v1.2.md` + `AgriConnect_Backlog_v1.2.md` — đặc tả và backlog (mã FR-…).
4. `docs/ERD.md`, `docs/SETUP_SUPABASE.md`.
5a. `docs/PLAN_BO_CUC_MOI.md` — **bố cục 6 tab mới (D28–D30)** và kế hoạch P0–P6 (khung tab, quy trình mẫu bắt buộc theo từng cơ sở, tạo vụ theo mẫu, chức vụ, hồ sơ, trang chủ thống kê, báo cáo). Làm theo thứ tự trong tài liệu.
5. `docs/DESIGN_DASHBOARD.md` — **nguyên tắc trình bày số liệu/dashboard** (thẻ số lớn, màu theo nghĩa, vòng cơ cấu, tiến độ, cảnh báo; kèm kế hoạch nâng cấp từng màn). Đọc trước khi làm hoặc nâng cấp màn có số liệu.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/app` | App PWA (Vite + React + TS, Dexie/IndexedDB, hàng đợi offline `src/lib/outbox.ts` chỉ cho ghi mới của nhân viên; còn lại ghi thẳng bằng `src/lib/serverWrite.ts`) |
| `apps/admin` | Trang quản trị nền tảng (mới là khung) |
| `apps/web` | Website công khai (Astro; chỉ đọc `public_*`) — mới là khung |
| `packages/shared` | Kiểu dùng chung |
| `supabase/migrations` | **Nguồn sự thật của CSDL** (schema, ràng buộc, RLS, hàm). Đánh số `2026101800NNNN_*.sql` |
| `supabase/functions/staff-accounts` | Edge Function tạo/đặt lại mật khẩu tài khoản nhân viên (dùng khóa quản trị, chỉ chạy ở máy chủ) |
| `supabase/tests` | Test CSDL + đồng bộ đầu-cuối trên PGlite |

## Lệnh hay dùng

```bash
npm run typecheck                         # vài giây; chạy sau mỗi thay đổi
npm run build                             # ~30 giây
npm run test:db:changed                   # tự chọn test theo phần vừa sửa (ưu tiên; thêm -- --list để chỉ xem, -- --since main để so với nhánh khác)
npm run test:db:file -- supabase/tests/roles.test.mjs   # một file test cụ thể
npm run test:db                           # toàn bộ test CSDL (chậm hơn; CI cũng chạy)
npm run dev:app                           # http://localhost:5180
npx supabase db push                      # đẩy migration (người dùng tự chạy)
npx supabase functions deploy staff-accounts
```

## Quy tắc bất biến (đã trả giá bằng lỗi thật)

- **Phân quyền và hạn mức được ép trong CSDL** (RLS, hàm, trigger), không chỉ ở giao diện. Khóa `service_role` không bao giờ vào frontend.
- **Mọi thay đổi schema = migration mới** (không sửa migration đã đẩy; chỉ sửa file chưa từng được áp dụng). Không dán SQL tay vào Supabase; không bao giờ `supabase db reset` trên dự án thật. (Muốn xóa sạch dữ liệu thử: người dùng tự chạy `supabase/maintenance/wipe_all_data.sql` có khóa xác nhận; Claude không chạy.)
- **Offline chỉ cho GHI MỚI việc hằng ngày của nhân viên** (nhật ký + vật tư đã dùng, thu hoạch; sau này chấm công) — quyết định D24. Bản ghi đó có **UUID tạo ở thiết bị**, gửi bằng `ON CONFLICT DO NOTHING` qua `outbox.ts`. **Mọi thứ khác cần mạng, ghi thẳng** bằng `serverWrite.ts` (có `busy`/mã nhập tạo sẵn để bấm lặp không nhân đôi); **không** thêm đường offline cho chức năng quản lý. Sửa/hủy luôn qua hàm có **phiên bản + op_id** (`update_*`); không ghi đè âm thầm: gặp CONFLICT thì tải lại bản mới và báo người dùng.
- Dữ liệu vận hành mặc định riêng tư; website chỉ đọc `public_*` (bản chụp bất biến đã duyệt).
- Giao dịch kho và nhật ký **chỉ thêm**; sửa = sự kiện điều chỉnh + audit; hủy = đánh dấu, không xóa.
- Quyền các mục Kho/Thu hoạch/Chi phí/Doanh thu/Tổng kết **không** kiểm bằng vai trò mà bằng `has_perm(org,'<mục>','view|edit')` ở CSDL và `canPerm(active.perms, ...)` ở giao diện (mặc định theo vai trò, chủ cấp riêng đè lên). Thêm mục mới thì thêm vào `role_default_perm` (SQL) **và** `permissions.ts`, test đối chiếu `perms.test.mjs` sẽ báo lệch.
- Một người có **nhiều vai trò** (`organization_memberships.roles`); **chủ bao gồm mọi vai trò**. Tổ trưởng là chỉ định theo tổ, không phải vai trò. Dùng `hasRole()` (`apps/app/src/lib/roles.ts`) phía giao diện và `has_org_role()` phía CSDL.

## Bẫy đã gặp (đừng lặp lại)

1. **Chính sách SELECT phải dựa vào CỘT của chính hàng** (hoặc hàng đã tồn tại từ trước). Tra cứu lại hàng vừa thêm theo `id` làm `INSERT … RETURNING` (supabase-js dùng) thất bại với lỗi RLS. Test: `supabase/tests/returning.test.mjs`.
2. Hàm SQL có tham số trùng tên cột (ví dụ `roles`) → chọn nhầm cột; dùng `$2` hoặc đặt tên khác. `RETURNS TABLE (cột…)` cũng gây "ambiguous" nếu trùng tên cột đang truy vấn.
3. Quyền `EXECUTE` mặc định cấp cho `PUBLIC`; phải `revoke … from public, anon`. Trong **view**, quyền EXECUTE của hàm được kiểm theo người gọi (anon), không theo chủ view.
4. Thứ tự giá trị enum quyết định `ORDER BY` và `array(select distinct …)` (không phải thứ tự chữ cái).
5. Truy vấn danh sách "cơ sở của tôi" phải **lọc `user_id = chính mình`**, nếu không sẽ lấy nhầm vai trò của người khác.
6. PowerShell nuốt dấu backtick/`$` trong chuỗi mẫu: **sửa file bằng công cụ Edit/Write**, không dùng `Replace` trong PowerShell cho mã có template string.
7. `node --test` với PGlite nhân bản cần `--test-force-exit` (đã có trong script) để tiến trình tự thoát.
8a. **`String.replace(chuỗi, chuỗi)` trong script sửa file**: mẫu thay thế có `$$` (dấu nháy SQL) bị đổi thành `$` làm hỏng migration. Dùng `split(a).join(b)` hoặc hàm thay thế.
8. **`INSERT … ON CONFLICT DO NOTHING` (hàng đợi offline) cũng đòi chính sách SELECT cho hàng vừa thêm.** Vai trò chỉ được ghi mà không được đọc (ví dụ nhân viên ghi xuất kho) sẽ bị lỗi RLS; cần chính sách SELECT dựa vào cột của hàng (xem 0017). Test: `inventory.test.mjs`.
9. Phiên làm việc có thể bị ngắt và mất file chưa lưu: **commit sau mỗi mốc**.

## Trạng thái (cập nhật khi xong mốc)

- Xong: nền tảng, tài khoản/cơ sở/HTX-hộ, gói và hạn mức, khu trồng, vụ, nhật ký offline-first, lịch sử/sửa/hủy/xung đột, tài khoản nhân viên bằng số điện thoại, nhiều vai trò, tổ lao động, ma trận quyền.
- **Việc kế tiếp (bước C):** vật tư, kho, chi phí, thu hoạch, tổng kết vụ. Kế hoạch: `docs/PLAN_BUOC_C.md` (D19–D23). **C0 xong** (migration 0016: phiên bản/guard cho thu hoạch-chi phí-doanh thu, đảo kho khi hủy nhật ký, giá vốn bình quân, `get_cycle_summary`; test `inventory.test.mjs`) — chưa `db push`. **C1 xong** (tab Vật tư & chi phí: danh mục, nhập kho, điều chỉnh, tồn + cảnh báo, lịch sử; Dexie v3; chưa thử tay trên máy thật). **C2 xong** (Ghi việc: "Vật tư đã dùng" → nhật ký + giao dịch xuất cùng lúc, offline; migration 0017). **C4 xong** (Thu hoạch: ghi/sửa/hủy, xung đột, offline; Dexie v4; cần 0016 đã `db push` mới sửa/hủy được). **C3 xong** (Chi phí 6 nhóm × 4 loại, Doanh thu bán; offline; Dexie v5; chỉ chủ/Kho & chi phí ghi-sửa-hủy). **C5 xong** (mục Tổng kết: `get_cycle_summary`, cảnh báo thiếu dữ liệu, giá thành/kg chỉ khi đủ, xuất CSV, xem bản đã tải khi offline; Dexie v6; logic ở `summaryReport.ts` + `summary_report.test.mjs`). **C6 xong** (test tổng hợp nhiều máy → tổng kết, ROLES.md, `docs/HUONG_DAN_THU.md`). **Bước C hoàn tất về code.** **P1 xong** (migration 0020–0022, D31–D32: mục có sẵn sửa/dừng được theo cơ sở bằng `org_catalog_overrides`, đọc qua `useCatalog()`/`lib/catalog.ts` — **không** đọc `db.cropTypes/workTypes` trực tiếp để lấy tên;  giai đoạn chọn từ danh mục việc, danh sách kéo thả; migration 0020: cây trồng riêng, loại việc riêng, quy trình mẫu `cycle_templates`/`template_stages`/`template_tasks`, hàm `move_template_stage`, `duplicate_cycle_template`; màn Khai báo: Cây trồng, Danh mục việc, Quy trình mẫu; test `templates.test.mjs`; **chưa `db push` 0020–0037**). **P2 xong** (migration 0023 mô tả + 0024 tạo vụ theo mẫu, D33–D34: `create_cycle_from_template`, `advance_stage`, `production_stages` có trạng thái/ngày thực tế, `activity_logs.stage_id`, trigger `TEMPLATE_REQUIRED`; app: Tạo vụ chọn quy trình, `CycleDetailScreen` + `CycleCalendar`, Dexie v8 `stages`; test `cycles_from_template.test.mjs`; test cũ chạy được nhờ cờ `agri.legacy_cycle_insert` trong `harness.mjs`; **chưa `db push` 0023, 0024**). **D35 xong** (migration 0025: sửa/xóa vụ `delete_cycle`, sửa giai đoạn của vụ `update_cycle_stage`/`add_cycle_stage`/`delete_cycle_stage`, ghi chú theo ngày `cycle_notes` + nhắc việc ở Trang chủ; Dexie v9 `notes`; test `cycle_manage.test.mjs`; **chưa `db push` 0025**). **D36 xong** (migration 0026: vật tư mặc định tạo sẵn qua trigger `organizations_seed_materials`, thông tin mở rộng của vật tư, `add_default_materials`; test `default_materials.test.mjs`; **chưa `db push` 0026**). **D37 xong** (migration 0027: Trang trại/Sản phẩm/hình ảnh, kho có ngày nhập cuối + điều chỉnh gần nhất, chặn nhập kho ngày tương lai; app: `ImagePicker`, `lib/image.ts`; test `farms_stock_info.test.mjs`; **chưa `db push` 0027**; giao diện gọi "Khu trồng"→"Trang trại", "Cây trồng"→"Sản phẩm" nhưng mã/CSDL vẫn là area/crop_type). **D49 xong** (migration 0037: `org_positions` thêm `base_role`, `is_builtin`, vai trò có sẵn tạo cho từng cơ sở, `perm_level`/`work_type_allowed`/`can_manage_stages` đọc theo danh mục, `add_builtin_roles`; client `RolePicker` lấy từ danh mục; test `roles_catalog.test.mjs`; **chưa `db push` 0037**). **D48 (P6) xong** (migration 0036 `run_report`, `saved_reports`; `ReportBuilder`, `lib/reports.ts`; test `reports.test.mjs`; **chưa `db push` 0036**). **D46–D47 xong** (migration 0034–0035 tạm dừng thành viên `set_member_suspended`, enum `member_status` thêm `suspended`; cặp nút Lưu/Hủy `.btnrow`; Chức vụ liệt kê vai trò có sẵn; Đầu việc; tổng quan chấm công + CSV tiền công; **chưa `db push` 0034–0035**). Bước E coi như hoàn tất. **D45 xong** (migration 0033 `staff_update_profile` + Edge Function `staff-accounts` action `update`; **chưa `db push` 0033 và chưa deploy lại hàm**). **D44 (P3) xong** (migration 0032: `org_positions`, `organization_memberships.position_ids`, quyền mục `declare`, `work_type_allowed`, `can_manage_stages`, `ensure_my_worker`; client `permissions.ts` có tham số chức vụ, `PositionsSection`; test `positions.test.mjs`; **chưa `db push` 0032**). **D43 xong** (bước E lát 2: migration 0031 vị trí, ca offline qua outbox, yêu cầu sửa công, nhân công trong `get_cycle_summary`; Dexie v10 `localShifts`; test `attendance_labor.test.mjs`; **chưa `db push` 0031**). **D42 xong** (bước E lát 1: migration 0030 hàm chấm công/sản lượng/tính lương/khóa kỳ; `AttendanceSection`, `RatesSection`, `PayrollSection`, `lib/work.ts`; test `attendance_payroll.test.mjs`; **chưa `db push` 0030**). **D38–D41 xong** (migration 0028 chọn tổ chưa có tổ trưởng; 0029 tên hiển thị; Khai báo có mục Vật tư và Kho-đơn vị riêng; Hồ sơ đầy đủ; Trang chủ thống kê `HomeStats`; **chưa `db push` 0028, 0029**). Tiếp theo: trang quản trị nền tảng, website, thông báo đẩy. **P0 xong** (khung 6 tab theo D28/D30: `lib/tabs.ts`, `SubTabs`, màn Sản xuất/Khai báo/Tổ chức/Báo cáo/Hồ sơ; tự bỏ bản lưu offline khi đổi tài khoản; đã xóa dữ liệu thử bằng `wipe_all_data.sql`); tiếp theo **P1** (cây trồng riêng, danh mục công việc, quy trình mẫu; migration 0020). Trước đó đã áp **D27** (quyền theo mục do chủ cấp cho từng người, migration 0019: `has_perm()` trong RLS + `permissions.ts` phía app; **chưa `db push` 0019**), **D25** (Ghi việc chỉ vụ Đang sản xuất, ở giao diện), **D26** (migration 0018: bản chụp tên + vai trò người làm trong nhật ký/giao dịch kho; **chưa `db push` 0018**) và **D24** (offline chỉ cho ghi mới của nhân viên; còn lại ghi thẳng, bỏ khung xung đột; Dexie v7). Việc kế tiếp: người dùng tự `db push` 0016–0017, thử tay C1–C5 trên điện thoại thật theo `docs/HUONG_DAN_THU.md`, sửa lỗi thử nghiệm, rồi mới đưa người dùng thật thử (D9). Sau đó: bước E (chấm công + tiền công). **Chưa `db push` 0016, 0017.** Sau bước C đưa app cho người dùng thật thử (D9).
- Sau đó: chấm công + tiền công (bước E; schema 0004, quyền 0015), trang admin (gói/thanh toán/xếp hạng), website, pilot.
- Chưa làm: bộ mẫu dưa lưới (cần số liệu khảo sát), màn xem/sửa khu trồng, giao diện chấm công.
- Hạ tầng: GitHub + Supabase + Cloudflare Pages; domain chưa mua (`login_email_domain` đang là `agricovi.com` tạm — phải là tên miền của chủ sản phẩm, xem cảnh báo trong `docs/DECISIONS.md`).

## Cách làm việc hiệu quả

- **Không `git push`/`db push` thay người dùng**: chỉ commit cục bộ rồi nhắc họ tự push. **Tiết kiệm (quy tắc 21/10/2026)**: test CSDL chỉ khi đổi migration SQL (một file test gọn cho logic mới, không chạy lại file cũ); giao diện thuần không chạy test; typecheck MỘT lần ở cuối đợt sửa code, không chạy khi chỉ sửa docs/SQL; không build; docs (DECISIONS/HUONG_DAN_THU/CLAUDE.md) chỉ cập nhật khi thay đổi lớn, gộp một lần cuối. Bộ đầy đủ để CI chạy (đo: 1 file ≈ 20 giây, `tsc` ≈ 25–70 giây).
- PWA: tự cập nhật âm thầm (`registerType: 'autoUpdate'`), **không** có thông báo cập nhật (người dùng không muốn). Bản mới có hiệu lực sau 1–2 lần mở lại app. Dòng "Phiên bản app" ở Cơ sở của tôi cho biết bản đang chạy (xem `docs/DEPLOY_CLOUDFLARE.md` mục 5b).
- Giao diện: **mỗi màn hình ngắn gọn** — khối dài dùng `components/Collapsible` (thu gọn mặc định, có dòng tóm tắt; biểu mẫu thêm mới dùng `inline`), thanh chuyển mục một hàng vuốt ngang, một nút chính mỗi màn. Đừng xếp nhiều thẻ dài liền nhau.
- Sửa nhỏ bằng Edit, không viết lại cả file. Chạy typecheck + `npm run test:db:changed` (chỉ test liên quan); test đầy đủ để CI chạy.
- Khi cần chủ sản phẩm quyết định: nêu **đề xuất + lý do** và hỏi tối đa vài câu; ghi quyết định vào `docs/DECISIONS.md`.
- Mỗi tính năng mới đi kèm test CSDL cho quyền và ràng buộc; logic đồng bộ có test đầu-cuối ở `supabase/tests/sync.e2e.test.mjs`.
