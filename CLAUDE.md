# AgriConnect — hướng dẫn cho phiên làm việc mới

Nền tảng quản lý nuôi trồng (app PWA) + website xúc tiến thương mại. Người dùng cuối nói **tiếng Việt**: mọi chữ trên giao diện, thông báo lỗi, tài liệu và commit đều viết **tiếng Việt**, dễ hiểu cho người ít quen công nghệ. Trả lời ngắn gọn; hướng dẫn thử dài đưa vào `docs/`, không dán cả vào chat.


## Chọn mảng việc TRƯỚC khi đọc gì khác

Dự án có hai mảng dùng chung một CSDL. **Mỗi chat chỉ làm một mảng**; mở đầu chat nói rõ "APP" hoặc "WEB". Chỉ đọc tài liệu của mảng đó (đừng đọc cả hai).

| | **APP** (quản lý cơ sở + quản trị nền tảng) | **WEB** (website xúc tiến thương mại + quản trị website) |
|---|---|---|
| Thư mục | `apps/app`, `apps/admin` | `apps/web`, `apps/webadmin` |
| Hướng dẫn riêng (tự nạp khi vào thư mục) | `apps/app/CLAUDE.md` | `apps/web/CLAUDE.md` |
| Quyết định | `docs/DECISIONS_APP.md` | `docs/DECISIONS_WEB.md` |
| Trạng thái | `docs/STATUS_APP.md` | `docs/STATUS_WEB.md` |
| Kế hoạch | `docs/PLAN_BO_CUC_MOI.md`, `PLAN_BUOC_C.md`, `DESIGN_DASHBOARD.md`, `ROLES.md`, `HUONG_DAN_THU.md` | `docs/PLAN_WEBSITE.md`, `NGUON_SAN_PHAM_WEBSITE.md`, `HUONG_DAN_QUAN_TRI_WEBSITE.md`, `RA_SOAT_HIEU_NANG_AN_TOAN.md` |
| Test CSDL | các file còn lại trong `supabase/tests` | `site_*`, `web_*`, `trade*`, `shops`, `i18n`, `perf_images`, `anon_surface`, `w6_trust_insight`, `commerce_profile` |

**Dùng chung (mảng nào cũng đụng):** `docs/DECISIONS_CHUNG.md` (D1–D13: gói, tài khoản, hạ tầng), `docs/ERD.md`, `docs/SETUP_SUPABASE.md`, `docs/DEPLOY_CLOUDFLARE.md`, đặc tả `AgriConnect_*_v1.*.md`, `supabase/migrations`, `packages/*`. `docs/DECISIONS.md` chỉ là mục lục. **Không tự đổi quyết định đã chốt.**

### Quy ước phần dùng chung (để hai chat không dẫm nhau)

- **Migration** vẫn đánh số liên tiếp một dãy. **Migration mới đặt tên có tiền tố mảng**: `2026101800NNNN_app_*.sql`, `..._web_*.sql` hoặc `..._shared_*.sql` (các file cũ giữ nguyên tên, không đổi vì có thể đã được đẩy). Số tiếp theo: xem file cuối trong `supabase/migrations`; **chat nào thêm migration thì commit ngay** để chat kia thấy.
- Chat WEB **không sửa** bảng/hàm của app (khu trồng, vụ, kho, chấm công…) và chat APP **không sửa** bảng/hàm `site_*`, `public_*` cho website; website chỉ đọc `public_*`. Cần đổi phía bên kia: ghi một dòng "Cần bên APP/WEB" vào `docs/STATUS_*.md` của bên đó rồi báo người dùng.
- `packages/shared` và `packages/admin-kit`: thêm được, đổi chữ ký hàm thì báo người dùng.
- Hai chat chạy **cùng lúc** thì mỗi chat một nhánh git hoặc worktree (`feat/app-*`, `feat/web-*`); chạy lần lượt thì cứ commit riêng từng mảng, không gộp commit hai mảng.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/app` | App PWA (Vite + React + TS, Dexie/IndexedDB, hàng đợi offline `src/lib/outbox.ts` chỉ cho ghi mới của nhân viên; còn lại ghi thẳng bằng `src/lib/serverWrite.ts`) |
| `apps/admin` | Quản trị NỀN TẢNG (cơ sở, gói, thanh toán, cấu hình, nhật ký kiểm toán); phục vụ ở `/quan-tri/` của app |
| `apps/webadmin` | Quản trị WEBSITE (nội dung, sản phẩm/vật tư, kiểm duyệt, người biên tập); đặt vào Worker của website ở `/admin/` (D63–D64) |
| `packages/admin-kit` | Phần dùng chung của hai trang quản trị (kết nối Supabase, `useLoad`, kiểu dáng) |
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
npm run dev:webadmin                      # http://localhost:5182 (quản trị website; khi build nằm ở /admin/ của website)
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

## Trạng thái

Không ghi ở đây (tốn token mỗi phiên). Xem `docs/STATUS_APP.md` hoặc `docs/STATUS_WEB.md`; cập nhật file của mảng mình khi xong mốc.
Hạ tầng: GitHub + Supabase + Cloudflare; domain chưa mua (`login_email_domain` tạm `agricovi.com`, xem `DECISIONS_CHUNG.md`).

## Cách làm việc hiệu quả

- **Không `git push`/`db push` thay người dùng**: chỉ commit cục bộ rồi nhắc họ tự push. **Tiết kiệm (quy tắc 21/10/2026)**: test CSDL chỉ khi đổi migration SQL (một file test gọn cho logic mới, không chạy lại file cũ); giao diện thuần không chạy test; typecheck MỘT lần ở cuối đợt sửa code, không chạy khi chỉ sửa docs/SQL; không build; docs (DECISIONS/HUONG_DAN_THU/CLAUDE.md) chỉ cập nhật khi thay đổi lớn, gộp một lần cuối. Bộ đầy đủ để CI chạy (đo: 1 file ≈ 20 giây, `tsc` ≈ 25–70 giây).
- PWA: tự cập nhật âm thầm (`registerType: 'autoUpdate'`), **không** có thông báo cập nhật (người dùng không muốn). Bản mới có hiệu lực sau 1–2 lần mở lại app. Dòng "Phiên bản app" ở Cơ sở của tôi cho biết bản đang chạy (xem `docs/DEPLOY_CLOUDFLARE.md` mục 5b).
- Giao diện: **mỗi màn hình ngắn gọn** — khối dài dùng `components/Collapsible` (thu gọn mặc định, có dòng tóm tắt; biểu mẫu thêm mới dùng `inline`), thanh chuyển mục một hàng vuốt ngang, một nút chính mỗi màn. Đừng xếp nhiều thẻ dài liền nhau.
- Sửa nhỏ bằng Edit, không viết lại cả file. Chạy typecheck + `npm run test:db:changed` (chỉ test liên quan); test đầy đủ để CI chạy.
- Khi cần chủ sản phẩm quyết định: nêu **đề xuất + lý do** và hỏi tối đa vài câu; ghi quyết định vào `docs/DECISIONS.md`.
- Mỗi tính năng mới đi kèm test CSDL cho quyền và ràng buộc; logic đồng bộ có test đầu-cuối ở `supabase/tests/sync.e2e.test.mjs`.
