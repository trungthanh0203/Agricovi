# Phương án bố cục mới: 5 tab, quy trình mùa vụ mẫu, chức vụ do chủ định nghĩa

Trạng thái: **phương án, chưa làm code** (20/10/2026). Quyết định bố cục là của chủ sản phẩm (D28). Các điểm tôi tự chọn để làm tiếp được ghi ở mục 9 và `docs/DECISIONS.md` (A19–A24), sửa được.
Đọc cùng: `docs/DESIGN_DASHBOARD.md` (cách trình bày số liệu), `docs/ROLES.md` (quyền hiện tại), `docs/DECISIONS.md` (D24: offline chỉ cho ghi mới của nhân viên).

## 1. Bố cục mới và chuyện gì xảy ra với phần đã có

Thanh điều hướng có **5 tab** (thay cho 4): **Trang chủ · Sản xuất · Khai báo · Tổ chức · Hồ sơ**.
(Quy định cũ "tối đa bốn mục" ở v1.1 mục 3.2 được thay bằng D28, vì chủ sản phẩm là người quyết.)

| Tab | Dành cho ai | Nội dung | Phần đã có chuyển về đâu |
|---|---|---|---|
| **Trang chủ** | Mọi người | Thống kê của **bản thân** và của **hộ/HTX**, nhắc việc, ghi chú | Trang chủ hiện tại (việc hôm nay) |
| **Sản xuất** | Mọi người (nút theo quyền) | Bảng trạng thái các vụ theo **giai đoạn**; **tạo vụ theo quy trình mẫu**; ghi việc; sub-tab Thu hoạch, Kho, Chi phí, Doanh thu | Màn Sản xuất cũ, **toàn bộ tab "Vật tư & chi phí"** (trừ danh mục) |
| **Khai báo** | Chủ và người được cấp quyền "Khai báo" | Sub-tab: Khu trồng · Cây trồng và giống · Quy trình mẫu · Danh mục công việc · Vật tư và kho | Khu trồng (từ Sản xuất), Danh mục vật tư/kho/đơn vị (từ Vật tư & chi phí) |
| **Tổ chức** | Chủ và người được cấp quyền "Tổ chức" | Sub-tab: Cơ sở và gói · **Chức vụ** · Nhân sự · Tổ lao động · Hộ thành viên (HTX) · Lời mời | Toàn bộ "Cơ sở của tôi" cũ trừ phần tài khoản cá nhân |
| **Hồ sơ** | Mọi người | Thông tin tài khoản, đổi mật khẩu, **chức năng được phân công**, việc được giao, đăng xuất, phiên bản app | Thẻ "Tài khoản/Đăng xuất" của Cơ sở của tôi |

Tab "Vật tư & chi phí" không còn là tab riêng (bạn chưa nêu nó trong bố cục mới), nên tôi chia theo bản chất: **danh mục = khai báo** (sang Khai báo), **ghi số liệu hằng ngày = sản xuất** (sang Sản xuất, thành các sub-tab). Quyền theo mục D27 giữ nguyên: sub-tab nào không được cấp thì không hiện. Nếu bạn muốn giữ tab riêng cho tài chính, chỉ cần đưa các sub-tab đó ra thành tab thứ 6 (rẻ, không đổi dữ liệu).

Hiển thị tab theo quyền: Khai báo và Tổ chức chỉ hiện với người có quyền; thanh điều hướng tự co lại 3 đến 5 cột.

## 2. Hình dung từng màn (điện thoại, một cột)

**Trang chủ**
```
Xin chào, Công (Nhân viên sản xuất)            [Tải lại]
┌ Hôm nay của bạn ──────────────────────────┐
│ 3 việc đã ghi · 2 việc cần làm · 0 chờ gửi│
└───────────────────────────────────────────┘
┌ Nhắc việc ─────────────────────────────────┐
│ ● Quá hạn: Tưới nước · Nhà màng 1 (hôm qua)│
│ ● Hôm nay: Thụ phấn · Nhà màng 1  [Ghi ngay]│
└───────────────────────────────────────────┘
┌ Cơ sở: Hộ A (thẻ số) ──────────────────────┐
│ 2 vụ đang SX │ Giai đoạn: Ra hoa │ Tồn thấp 1│
│ [thanh tiến độ vụ]  Thu hoạch tháng: 1,2 tấn│
└───────────────────────────────────────────┘
Ghi chú ghim ▸ (thêm ghi chú, hẹn nhắc ngày…)
HTX: mỗi hộ một thẻ (số vụ, giai đoạn, ngày ghi gần nhất)
```
Số về tiền (chi phí, doanh thu) chỉ hiện nếu có quyền mục đó. Trình bày theo `docs/DESIGN_DASHBOARD.md`.

**Sản xuất**
```
[Mùa vụ] [Thu hoạch] [Kho] [Chi phí] [Doanh thu]      (theo quyền)
Dưa lưới · Nhà màng 1 · Đang sản xuất · ngày 34/75
  ✓ Gieo ─ ✓ Ươm ─ ● Ra hoa (ngày 6/14) ─ ○ Đậu quả ─ ○ Thu hoạch
  [kế hoạch ▓▓▓▓░░] [thực tế ▓▓▓▓▓░]   Chậm 1 ngày
  Việc của giai đoạn này:  Thụ phấn [Ghi việc]  Tưới nước [Ghi việc]  Phun thuốc (khóa: không có quyền)
  [Hoàn thành giai đoạn]  (chỉ người có quyền quản lý giai đoạn)
[+ Tạo vụ theo quy trình mẫu]
```
Tạo vụ: chọn cây → chọn **quy trình mẫu** → chọn khu trồng và ngày bắt đầu → **xem trước lịch** các giai đoạn/việc → Tạo. Vẫn cho "vụ tự do" không dùng mẫu (vụ cũ chạy bình thường).

**Khai báo → Quy trình mẫu** (chủ tự xây dựng cho từng cây)
```
Quy trình: Dưa lưới mùa khô (v2)            Tổng 75 ngày
 1. Chuẩn bị đất      7 ngày    [↑][↓][Sửa]
 2. Gieo ươm          10 ngày
 3. Ra hoa            14 ngày   Việc: Thụ phấn (ngày 2, lặp 1 ngày) · Tưới nước (mỗi 2 ngày)
 ...
[+ Thêm giai đoạn]   Việc lấy từ Danh mục công việc; thiếu thì [+ Định nghĩa việc mới]
```

**Tổ chức → Chức vụ**: tên chức vụ, gói quyền từng mục (Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tổ chức), **được làm những việc nào** (danh sách việc, hoặc "tất cả"), có được **bắt đầu/hoàn thành giai đoạn** hay không. Gán chức vụ cho người ở Nhân sự. Các vai trò cố định hiện có (Chủ, Quản lý, Nhân viên, Kho & chi phí…) hiện như **chức vụ có sẵn** để dùng ngay hoặc nhân bản sửa lại.

**Hồ sơ**: tên hiển thị (sửa được), email/số điện thoại, đổi mật khẩu, cơ sở đang làm và chức vụ, **"Tôi được làm gì"** (danh sách quyền bằng chữ dễ hiểu), việc được giao, tổ đang phụ trách, phiên bản app, đăng xuất.

## 3. Mô hình dữ liệu cần thêm

Đã có sẵn nền: `crop_types` (chỉ dùng chung), `production_areas`, `production_cycles`, `production_stages` (có `seq`, ngày kế hoạch/thực tế), `production_tasks` (có hạn, trạng thái, người được giao), `work_types` (có thể riêng từng cơ sở, có `field_schema`), `activity_logs.task_id`. Hai bảng `crop_profiles`/`task_templates` chưa dùng, **không dựa vào** (sẽ xóa ở đợt dọn sau pilot).

| Bảng/cột mới | Mục đích |
|---|---|
| `crop_types.organization_id` (null = dùng chung) | Chủ tự thêm cây trồng của mình |
| `cycle_templates` (cơ sở, cây, tên, phiên bản, đang dùng) | Quy trình mẫu |
| `template_stages` (mẫu, `seq`, tên, `duration_days`, ghi chú) | Các giai đoạn của mẫu |
| `template_tasks` (giai đoạn, loại việc, tên, ngày bắt đầu trong giai đoạn, lặp mỗi N ngày, bắt buộc) | Việc cần làm trong từng giai đoạn |
| `production_cycles.template_id`, `production_tasks.stage_id`, `production_stages.template_stage_id` | Vụ **sao chép** mẫu lúc tạo: sửa mẫu về sau **không đổi** vụ đang chạy (FR-CROP-007) |
| `org_positions` (cơ sở, tên, `perms` mục, `work_type_ids` hoặc null = tất cả, `can_manage_stages`, có sẵn/tự tạo) | Chức vụ do chủ định nghĩa |
| `organization_memberships.position_ids uuid[]` | Người giữ những chức vụ nào |
| `profiles` (user, `display_name`) | Tên hiển thị; `author_display_name` dùng tên này trước (A16) |
| `org_notes` (cơ sở, vụ, tác giả, nội dung, `remind_on`, người nhận, hoàn thành) | Ghi chú và nhắc việc tự đặt |
| Hàm `create_cycle_from_template(...)` | Một lần tạo: vụ + giai đoạn có ngày kế hoạch + các việc theo lịch; hạn mức vụ vẫn ép như cũ |
| Hàm `home_stats(org)`, `coop_overview(coop)`, `my_assignments(org)` | Gom số liệu trên máy chủ (theo quyền), điện thoại chỉ vẽ |

Quyền "mục" (D27) mở rộng thêm hai mục: **Khai báo** và **Tổ chức**. Quyền hiệu lực của một người = **hợp** của: vai trò có sẵn, các chức vụ được gán, phần chủ cấp riêng (đè lên). Chủ luôn đủ quyền.

**Quyền theo giai đoạn**: không tạo bảng quyền riêng cho từng giai đoạn. Một giai đoạn gồm các việc; mỗi việc thuộc một **loại việc**; chức vụ nói được làm loại việc nào. Người dùng thấy nút "Ghi việc" của loại việc mình được làm, loại khác hiện khóa. Thêm quyền **quản lý giai đoạn** (bắt đầu, hoàn thành, thêm việc phát sinh). Ép ở CSDL: chính sách ghi nhật ký kiểm "loại việc này người đó được làm". Mặc định (chưa gán chức vụ có giới hạn) là được làm mọi loại việc, nên cơ sở cũ không đổi hành vi.

## 4. Offline (đúng D24)

- **Cần mạng**: khai báo, tạo vụ, quy trình mẫu, chức vụ, nhân sự, ghi chú mới, bắt đầu/hoàn thành giai đoạn.
- **Vẫn offline**: nhân viên ghi việc (kể cả gắn với việc của giai đoạn), vật tư đã dùng, thu hoạch. Muốn vậy thiết bị phải **tải sẵn** vụ, giai đoạn, việc và loại việc được phép (bảng cục bộ mới, dữ liệu nhỏ), xem được khi mất mạng.
- Ghi việc gắn `task_id` thì máy chủ tự đánh dấu việc đã làm (trigger), người ghi offline không cần gọi thêm.

## 5. Các giai đoạn triển khai (mỗi giai đoạn dùng được ngay, có test, có hướng dẫn)

| GĐ | Nội dung | Migration | Cỡ | Ghi chú |
|---|---|---|---|---|
| **P0** | Khung 5 tab; chuyển màn đã có về chỗ mới (Sản xuất có sub-tab Thu hoạch/Kho/Chi phí/Doanh thu; Khai báo có Khu trồng + Vật tư và kho; Tổ chức; Hồ sơ cơ bản). Chưa có dữ liệu mới | không | M | Rủi ro thấp, thấy kết quả ngay; làm đầu tiên |
| **P1** | Cây trồng riêng, Danh mục công việc (tự định nghĩa), **Quy trình mẫu** (soạn, nhân bản, phiên bản) | 0020 | L | Khai báo hoàn chỉnh |
| **P2** | **Tạo vụ theo mẫu**, bảng giai đoạn ở Sản xuất, bắt đầu/hoàn thành giai đoạn, ghi việc gắn việc của giai đoạn, tải sẵn để offline | 0021 | L | Giá trị lớn nhất; nên làm ngay sau P1 |
| **P3** | **Chức vụ** tự định nghĩa, quyền Khai báo/Tổ chức, hạn chế loại việc, màn Chức vụ và gán chức vụ | 0022 | L | Phần khó nhất về quyền, có test đối chiếu như `perms.test.mjs` |
| **P4** | Hồ sơ đầy đủ: tên hiển thị, đổi mật khẩu, "Tôi được làm gì", việc được giao | 0023 | S–M | |
| **P5** | Ghi chú và nhắc việc; **Trang chủ thống kê** (bản thân, hộ, HTX) theo `DESIGN_DASHBOARD.md` | 0024 | L | Cần dữ liệu P2 để số liệu có ý nghĩa |

Thứ tự đề nghị: **P0 → P1 → P2 → P3 → P4 → P5**. Mỗi giai đoạn tôi làm trọn: migration, test chỉ cho phần mới, màn hình, cập nhật `HUONG_DAN_THU.md`, rồi bạn `git push` và `db push`.

## 6. Việc phải làm khi đụng vào phần đã có

- `InventoryTab` tách: phần chip vào Sản xuất (giữ `canPerm`), `CatalogSection` vào Khai báo.
- `OrgTab` tách: gói/thành viên/tổ/HTX sang Tổ chức, tài khoản sang Hồ sơ.
- `App.tsx`: danh sách tab theo quyền, lưu sub-tab đang chọn.
- `ProductionTab`: thay danh sách vụ bằng bảng giai đoạn; nút "Tạo khu trồng" chuyển sang Khai báo.
- Ghi việc: chọn vụ rồi chọn **việc của giai đoạn hiện tại** (vẫn cho "việc khác ngoài lịch").

## 7. Rủi ro và cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| Hệ chức vụ phức tạp, người dùng lúng túng | Chức vụ có sẵn dùng ngay; mỗi chức vụ có một dòng mô tả "người này làm được gì"; trang Hồ sơ diễn đạt quyền bằng chữ thường |
| Đổi quyền làm bản ghi offline đang chờ bị từ chối | Bản ghi vào "Cần xử lý" như hiện nay, không mất dữ liệu |
| Sửa mẫu làm lệch vụ đang chạy | Vụ sao chép mẫu lúc tạo; mẫu có phiên bản |
| Nhiều màn mới dễ rối mắt | Bám `docs/DESIGN_DASHBOARD.md`, `Collapsible`, mỗi màn tối đa vài thẻ |
| Làm một lúc quá nhiều | Chia 6 giai đoạn, mỗi giai đoạn có thể dừng lại dùng thử |

## 8. Kiểm thử và hướng dẫn thử

Mỗi giai đoạn có test CSDL cho quyền và ràng buộc phần mới (theo CLAUDE.md), chạy **chỉ file mới** (`test:db:file`). Hướng dẫn thử thêm bài tương ứng vào `docs/HUONG_DAN_THU.md` (ví dụ: dựng quy trình dưa lưới 5 giai đoạn, tạo vụ, nhân viên chỉ thấy nút việc của mình).

## 9. Điều tôi tự chọn khi lập phương án (ghi ở DECISIONS A19–A24)

1. Tab Vật tư & chi phí **giải thể** như mục 1; có thể tách lại thành tab thứ 6 nếu bạn muốn.
2. **Quyền theo giai đoạn thực hiện qua loại việc**, không có bảng quyền riêng từng giai đoạn.
3. **Chức vụ có sẵn** (từ 6 vai trò hiện tại) giữ nguyên để cơ sở cũ không đổi; chức vụ tự tạo cộng thêm. Quyền hiệu lực = hợp, chủ cấp riêng đè lên.
4. Vụ **không bắt buộc** dùng mẫu (vụ tự do vẫn tạo được).
5. Chỉ vụ **Đang sản xuất** ghi việc được (D25 giữ nguyên); việc gắn giai đoạn không đổi quy tắc này.
6. Tên hiển thị lưu ở `profiles`; chưa có ảnh đại diện.
7. Quy trình mẫu thuộc **từng cơ sở**; việc HTX chia sẻ mẫu cho hộ thành viên để sau.
