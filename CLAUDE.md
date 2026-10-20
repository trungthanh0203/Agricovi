# AgriConnect — hướng dẫn cho phiên làm việc mới

Nền tảng quản lý nuôi trồng (app PWA) + website xúc tiến thương mại. Người dùng cuối nói **tiếng Việt**: mọi chữ trên giao diện, thông báo lỗi, tài liệu và commit đều viết **tiếng Việt**, dễ hiểu cho người ít quen công nghệ. Trả lời ngắn gọn; hướng dẫn thử dài đưa vào `docs/`, không dán cả vào chat.

## Đọc trước khi làm (theo thứ tự)

1. `docs/DECISIONS.md` — mọi quyết định đã chốt (D1…D18) và các **[GIẢ ĐỊNH]** còn chờ xác nhận. **Không tự đổi quyết định đã chốt.**
2. `docs/ROLES.md` — ma trận vai trò/quyền (nguồn sự thật là CSDL).
3. `AgriConnect_Dac_ta_thiet_ke_nghiep_vu_v1.1.md` + `AgriConnect_Dac_ta_bo_sung_v1.2.md` + `AgriConnect_Backlog_v1.2.md` — đặc tả và backlog (mã FR-…).
4. `docs/ERD.md`, `docs/SETUP_SUPABASE.md`.
5a. `docs/PLAN_BO_CUC_MOI.md` — **bố cục 5 tab mới (D28)** và kế hoạch P0–P5 (khung tab, quy trình mẫu, tạo vụ theo mẫu, chức vụ, hồ sơ, trang chủ thống kê). Làm theo thứ tự trong tài liệu.
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
- **Mọi thay đổi schema = migration mới** (không sửa migration đã đẩy; chỉ sửa file chưa từng được áp dụng). Không dán SQL tay vào Supabase; không bao giờ `supabase db reset` trên dự án thật.
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
8. **`INSERT … ON CONFLICT DO NOTHING` (hàng đợi offline) cũng đòi chính sách SELECT cho hàng vừa thêm.** Vai trò chỉ được ghi mà không được đọc (ví dụ nhân viên ghi xuất kho) sẽ bị lỗi RLS; cần chính sách SELECT dựa vào cột của hàng (xem 0017). Test: `inventory.test.mjs`.
9. Phiên làm việc có thể bị ngắt và mất file chưa lưu: **commit sau mỗi mốc**.

## Trạng thái (cập nhật khi xong mốc)

- Xong: nền tảng, tài khoản/cơ sở/HTX-hộ, gói và hạn mức, khu trồng, vụ, nhật ký offline-first, lịch sử/sửa/hủy/xung đột, tài khoản nhân viên bằng số điện thoại, nhiều vai trò, tổ lao động, ma trận quyền.
- **Việc kế tiếp (bước C):** vật tư, kho, chi phí, thu hoạch, tổng kết vụ. Kế hoạch: `docs/PLAN_BUOC_C.md` (D19–D23). **C0 xong** (migration 0016: phiên bản/guard cho thu hoạch-chi phí-doanh thu, đảo kho khi hủy nhật ký, giá vốn bình quân, `get_cycle_summary`; test `inventory.test.mjs`) — chưa `db push`. **C1 xong** (tab Vật tư & chi phí: danh mục, nhập kho, điều chỉnh, tồn + cảnh báo, lịch sử; Dexie v3; chưa thử tay trên máy thật). **C2 xong** (Ghi việc: "Vật tư đã dùng" → nhật ký + giao dịch xuất cùng lúc, offline; migration 0017). **C4 xong** (Thu hoạch: ghi/sửa/hủy, xung đột, offline; Dexie v4; cần 0016 đã `db push` mới sửa/hủy được). **C3 xong** (Chi phí 6 nhóm × 4 loại, Doanh thu bán; offline; Dexie v5; chỉ chủ/Kho & chi phí ghi-sửa-hủy). **C5 xong** (mục Tổng kết: `get_cycle_summary`, cảnh báo thiếu dữ liệu, giá thành/kg chỉ khi đủ, xuất CSV, xem bản đã tải khi offline; Dexie v6; logic ở `summaryReport.ts` + `summary_report.test.mjs`). **C6 xong** (test tổng hợp nhiều máy → tổng kết, ROLES.md, `docs/HUONG_DAN_THU.md`). **Bước C hoàn tất về code.** Sau đó áp **D27** (quyền theo mục do chủ cấp cho từng người, migration 0019: `has_perm()` trong RLS + `permissions.ts` phía app; **chưa `db push` 0019**), **D25** (Ghi việc chỉ vụ Đang sản xuất, ở giao diện), **D26** (migration 0018: bản chụp tên + vai trò người làm trong nhật ký/giao dịch kho; **chưa `db push` 0018**) và **D24** (offline chỉ cho ghi mới của nhân viên; còn lại ghi thẳng, bỏ khung xung đột; Dexie v7). Việc kế tiếp: người dùng tự `db push` 0016–0017, thử tay C1–C5 trên điện thoại thật theo `docs/HUONG_DAN_THU.md`, sửa lỗi thử nghiệm, rồi mới đưa người dùng thật thử (D9). Sau đó: bước E (chấm công + tiền công). **Chưa `db push` 0016, 0017.** Sau bước C đưa app cho người dùng thật thử (D9).
- Sau đó: chấm công + tiền công (bước E; schema 0004, quyền 0015), trang admin (gói/thanh toán/xếp hạng), website, pilot.
- Chưa làm: bộ mẫu dưa lưới (cần số liệu khảo sát), màn xem/sửa khu trồng, giao diện chấm công.
- Hạ tầng: GitHub + Supabase + Cloudflare Pages; domain chưa mua (`login_email_domain` đang là `agricovi.com` tạm — phải là tên miền của chủ sản phẩm, xem cảnh báo trong `docs/DECISIONS.md`).

## Cách làm việc hiệu quả

- **Không `git push`/`db push` thay người dùng**: chỉ commit cục bộ rồi nhắc họ tự push. **Test nhẹ máy**: chỉ file test mới/đổi (`npm run test:db:changed`), giao diện thuần chỉ typecheck; bộ đầy đủ để CI chạy (đo: 1 file ≈ 20 giây, `tsc` ≈ 25–70 giây).
- PWA: tự cập nhật âm thầm (`registerType: 'autoUpdate'`), **không** có thông báo cập nhật (người dùng không muốn). Bản mới có hiệu lực sau 1–2 lần mở lại app. Dòng "Phiên bản app" ở Cơ sở của tôi cho biết bản đang chạy (xem `docs/DEPLOY_CLOUDFLARE.md` mục 5b).
- Giao diện: **mỗi màn hình ngắn gọn** — khối dài dùng `components/Collapsible` (thu gọn mặc định, có dòng tóm tắt; biểu mẫu thêm mới dùng `inline`), thanh chuyển mục một hàng vuốt ngang, một nút chính mỗi màn. Đừng xếp nhiều thẻ dài liền nhau.
- Sửa nhỏ bằng Edit, không viết lại cả file. Chạy typecheck + `npm run test:db:changed` (chỉ test liên quan); test đầy đủ để CI chạy.
- Khi cần chủ sản phẩm quyết định: nêu **đề xuất + lý do** và hỏi tối đa vài câu; ghi quyết định vào `docs/DECISIONS.md`.
- Mỗi tính năng mới đi kèm test CSDL cho quyền và ràng buộc; logic đồng bộ có test đầu-cuối ở `supabase/tests/sync.e2e.test.mjs`.
