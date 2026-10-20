# Nhật ký quyết định của chủ sản phẩm

Ghi lại các quyết định đã chốt trong quá trình xây dựng, để truy vết và bổ sung vào đặc tả khi phát hành bản kế tiếp.
Mục **[GIẢ ĐỊNH]** là cách tôi (đội phát triển) hiểu khi triển khai, cần chủ sản phẩm xác nhận.

## Đã chốt

| # | Quyết định | Ngày | Nguồn | Tác động |
|---|---|---|---|---|
| D1 | App là PWA; hạ tầng GitHub + Supabase + Cloudflare; mua domain trước khi pilot | 18/10/2026 | Chủ sản phẩm | v1.2 mục 2 |
| D2 | Chấm công/lương là module trong app sản xuất; tính theo **giờ** cộng dồn theo tháng và theo **sản lượng**; bỏ quy đổi giờ-ngày công | 18/10/2026 | Chủ sản phẩm | v1.2 mục 7 |
| D3 | Cây đầu tiên: dưa lưới | 18/10/2026 | Chủ sản phẩm | v1.2 mục 8 |
| D4 | Gói theo **số vụ đang chạy cùng lúc**; Hộ 2 vụ 300k/quý, 5 vụ 500k/quý; HTX 5 vụ 1.500k/quý, 10 vụ 3.000k/quý; dùng thử 1 tháng; mọi giá trị cấu hình trong CSDL | 18/10/2026 | Chủ sản phẩm | v1.2 mục 3 |
| D5 | Vụ *Tạm dừng* tính vào hạn mức; dùng thử giới hạn như gói cơ bản | 18/10/2026 | Chủ sản phẩm | v1.2 mục 3.1 |
| D6 | HTX khai báo số hộ tùy ý, hạn mức chỉ theo tổng vụ; mỗi hộ tối đa 1 HTX; hộ có thể dùng cả gói HTX lẫn gói riêng | 18/10/2026 | Chủ sản phẩm | v1.2 mục 4 |
| D7 | Vị trí top website: cách (a) — mọi cơ sở đã duyệt đều hiện, gói trả phí chỉ ưu tiên thứ tự | 18/10/2026 | Chủ sản phẩm | v1.2 mục 5 |
| D8 | **Hộ chỉ có 1 cơ sở**; **HTX thêm được nhiều cơ sở** (hộ thành viên) | Sau pilot thử bước 6 | Chủ sản phẩm | Migration 0010 |
| D9 | Đưa app cho người dùng thật thử **sau khi xong bước C** (kho, chi phí, thu hoạch, tổng kết vụ) | Sau pilot thử bước 6 | Chủ sản phẩm | Lộ trình |
| D10 | Chấm công: **chủ cơ sở tạo tài khoản người lao động và chọn "kiểu phân hệ"** cho từng người (mỗi người có thể một kiểu khác nhau) | Sau pilot thử bước 6 | Chủ sản phẩm | Bước E |
| D11 | Nhân viên đăng nhập bằng **số điện thoại**; chủ cơ sở tạo tài khoản; mật khẩu tạm do **hệ thống sinh ngẫu nhiên**, hiện một lần; nhân viên **bắt buộc đổi** ở lần đầu | Sau bước A | Chủ sản phẩm | Migration 0011, Edge Function `staff-accounts` |
| D12 | Chủ Hộ/HTX tự đăng ký bằng **email** (chưa dùng số điện thoại/OTP) | Sau bước A | Chủ sản phẩm | — |
| D13 | Tên miền ghép email ẩn là **cấu hình trong CSDL** (`platform_settings.login_email_domain`), tạm `agricovi.com`; đổi sau khi có tên miền thật | Sau bước A | Chủ sản phẩm | Tài khoản cũ giữ email đã lưu |
| D14 | Lao động không có smartphone chỉ là **hồ sơ do tổ trưởng chấm hộ** (không có tài khoản) | Sau bước A | Chủ sản phẩm | Bước E |
| D15 | **Bước B:** sửa/hủy nhật ký, phát hiện xung đột khi đồng bộ (không ghi đè âm thầm); bản ghi đã hủy không khôi phục | Sau bước A | Kế hoạch đã thống nhất | Migration 0013 |
| D16 | **Nhiều vai trò/người**: nhân viên kiêm Kho & chi phí, tổ trưởng kiêm Quản lý HTX, chủ kiêm Quản lý (chủ bao gồm mọi vai trò) | Sau bước B | Chủ sản phẩm | Migration 0014 |
| D17 | **Tổ trưởng là chỉ định theo tổ**; tổ trưởng cần có tài khoản; người không có tài khoản bắt buộc thuộc tổ có tổ trưởng; công của tổ trưởng do quản lý/chủ xác nhận | Sau bước B | Chủ sản phẩm (đồng ý đề xuất 1–9) | Migration 0015, màn Tổ lao động |
| D18 | Ma trận quyền Quản lý/Tổ trưởng/Kho & chi phí/Chủ (xem `docs/ROLES.md`): chỉ chủ duyệt-khóa lương và đặt đơn giá; quản lý chỉ xem chi phí | Sau bước B | Chủ sản phẩm | Migration 0015 |
| D19 | **Giá vốn vật tư xuất dùng = bình quân gia quyền** các lần nhập có giá (tính đến ngày xuất); lần nhập không giá thì không tính và báo thiếu, không bịa số | Bước C | Chủ sản phẩm (đồng ý đề xuất Q1) | Migration 0016, `docs/PLAN_BUOC_C.md` |
| D20 | **Thu hoạch**: mọi người ghi được nhật ký đều ghi được; sửa/hủy: chủ, quản lý mọi bản ghi, người ghi chỉ bản của mình trong 24 giờ (như A10) | Bước C | Chủ sản phẩm (Q2) | Migration 0016 |
| D21 | Đơn vị thu hoạch và bán hàng **khóa là kg** ở giai đoạn thử | Bước C | Chủ sản phẩm (Q3) | Migration 0016 |
| D22 | Tạo **danh mục** vật tư/kho cần có mạng; ~~ghi nhập/xuất/chi phí/thu hoạch/bán vẫn dùng offline~~ (phần này **đã được D24 thay thế**: chỉ ghi mới việc hằng ngày của nhân viên dùng offline) | Bước C | Chủ sản phẩm (Q4) | Màn hình C1 |
| D23 | Hủy nhật ký đã có xuất kho thì **tự đảo kho** bằng giao dịch điều chỉnh (lý do "Hủy nhật ký"); giao dịch gốc giữ nguyên | Bước C | Chủ sản phẩm (Q5) | Migration 0016 |
| D24 | **Phạm vi offline**: chỉ **ghi mới việc hằng ngày của nhân viên** (nhật ký kèm vật tư đã dùng, thu hoạch; sau này chấm công) dùng hàng đợi offline. **Mọi thứ khác cần mạng và ghi thẳng lên máy chủ**, báo kết quả ngay: khu trồng, vụ, đổi trạng thái vụ, danh mục, nhập kho, điều chỉnh, chi phí, doanh thu, tổng kết, **và cả sửa/hủy**. Bỏ khung "Xung đột": máy chủ vẫn kiểm phiên bản, người dùng thấy "Người khác vừa thay đổi… đã tải lại" rồi sửa lại. Xem được dữ liệu đã tải khi mất mạng | Sau bước C | Chủ sản phẩm | `serverWrite.ts`, `outbox.ts` chỉ thêm mới |
| D25 | **Ghi việc chỉ cho vụ "Đang sản xuất"**: vụ Chuẩn bị và Tạm dừng chưa ghi việc được (muốn ghi thì bấm "Bắt đầu sản xuất" / "Tiếp tục"). Là quy tắc ở giao diện (Ghi việc, Trang chủ, Sản xuất), **chưa ép ở CSDL** để nhật ký tạo offline khi vụ còn đang chạy không bị từ chối nếu vụ đổi trạng thái trước lúc đồng bộ | Sau bước C | Chủ sản phẩm | `LogActivityScreen`, `HomeTab`, `ProductionTab` |
| D26 | Nhật ký và giao dịch kho hiện **"tên việc / vật tư - người làm (vai trò)"**, ví dụ "Thụ phấn - Công (Nhân viên sản xuất)". Tên và vai trò là **bản chụp tại thời điểm ghi, máy chủ tự điền** (không giả mạo, không đổi theo vai trò sau này) | Sau bước C | Chủ sản phẩm | Migration 0018, `authorLabel()` |
| D27 | **Chủ cơ sở cấp quyền theo MỤC cho từng người** ở tab "Vật tư & chi phí": Kho (tồn kho, nhập kho, danh mục), Thu hoạch, Chi phí, Doanh thu, Tổng kết vụ. Mỗi mục có 3 mức: Không thấy / Chỉ xem / Xem và nhập liệu (Tổng kết chỉ Không thấy / Chỉ xem). **Người nào được cấp mới thấy mục đó và nhập liệu được**; chưa cấp riêng thì theo vai trò như ma trận cũ (`docs/ROLES.md`); chủ luôn đủ quyền. Ép ở CSDL (RLS). Tab ẩn hoàn toàn nếu không được cấp mục nào | Sau bước C | Chủ sản phẩm | Migration 0019, `permissions.ts`, màn Thành viên |
| D28 | **Bố cục 6 tab**: Trang chủ · Sản xuất · Khai báo · Tổ chức · **Báo cáo** · Hồ sơ (thay quy định "tối đa bốn mục" ở v1.1 mục 3.2). Chủ cơ sở **tự xây quy trình mùa vụ mẫu** cho từng cây (các giai đoạn, thời gian, việc trong giai đoạn lấy từ danh mục việc, tự định nghĩa thêm nếu thiếu); vụ được **tạo theo mẫu**; người dùng chỉ chọn được chức năng/giai đoạn mình được phân quyền; **chức vụ do chủ định nghĩa**; Hồ sơ nêu chức năng được phân công. Kế hoạch từng giai đoạn P0–P5: `docs/PLAN_BO_CUC_MOI.md` | 20/10/2026 | Chủ sản phẩm | Kế hoạch, chưa làm code |
| D29 | **Xóa hết dữ liệu thử trước khi làm bố cục mới** bằng script có khóa xác nhận `supabase/maintenance/wipe_all_data.sql` (người dùng tự chạy một lần trong SQL Editor): xóa tài khoản, cơ sở, mọi dữ liệu; giữ cây dưa lưới, loại việc, đơn vị dùng chung, bảng gói, cấu hình nền tảng. Từ đó mọi vụ sinh từ quy trình mẫu, không cần chuyển đổi dữ liệu cũ | 20/10/2026 | Chủ sản phẩm | `wipe.test.mjs` |
| D30 | Tab **Báo cáo** (đứng trước Hồ sơ): phần **Tài chính** (Chi phí, Doanh thu, Tổng kết vụ) và **Báo cáo theo nhu cầu** (chọn loại, bộ lọc, lưu, chia sẻ, xuất CSV); tính trên máy chủ, kiểm quyền theo mục | 20/10/2026 | Chủ sản phẩm | Kế hoạch P6 |

## Cách tôi triển khai D15 (đã làm, migration 0013)

- Mỗi lần sửa gửi kèm **phiên bản đã thấy**; máy chủ chỉ áp dụng khi khớp, nếu không báo `CONFLICT`. Người dùng thấy hai cột "Trên máy chủ hiện có" và "Bạn muốn đổi thành" rồi chọn **Giữ thay đổi của tôi** hoặc **Dùng bản trên máy chủ**.
- Mỗi lần sửa có mã riêng (`op_id`): mạng đứt sau khi máy chủ đã áp dụng thì gửi lại **không** bị coi là xung đột.
- Hủy cần lý do, không xóa, không khôi phục; bản ghi đã hủy không sửa nội dung. Vụ, người ghi, nguồn của nhật ký không đổi được.
- Áp dụng cho nhật ký và cho đổi trạng thái vụ (hạn mức vụ vẫn được ép khi sửa).

> **Cập nhật theo D24:** phần "xung đột khi đồng bộ" ở trên nay chỉ còn là kiểm tra phiên bản ở máy chủ (hàm `update_*` giữ nguyên, có test). App không còn đưa thay đổi vào hàng đợi nên **không còn khung chọn "Giữ bản của tôi / Dùng bản máy chủ"**; gặp xung đột app tải lại bản mới và báo người dùng sửa lại.

### [GIẢ ĐỊNH] mới cần xác nhận

| # | Giả định | Cách đổi |
|---|---|---|
| A10 | Chủ và quản lý sửa/hủy **mọi** nhật ký; người ghi (nhân viên) chỉ sửa/hủy bản ghi **của mình trong 24 giờ** kể từ khi máy chủ nhận | Đổi chính sách `logs_update_own` và hằng `OWN_EDIT_WINDOW_MS` trong `LogsScreen.tsx` |
| A11 | Xung đột chỉ xử lý cho **nhật ký và vụ**; khu trồng, thu hoạch, kho, chi phí sẽ có cơ chế tương tự khi làm bước C | Thêm hàm `update_*` tương ứng và đăng ký trong `UPDATE_RPC` |
| A12 | Danh sách nhật ký trên máy chỉ giữ 200 bản ghi gần nhất; cũ hơn thì bấm "Tải nhật ký cũ hơn" (cần mạng) | Tăng giới hạn trong `syncDown` |

## Cách tôi triển khai D19–D23 (migration 0016) và [GIẢ ĐỊNH] mới

- Thu hoạch, chi phí, doanh thu: có `version` + `op_id`, hàm `update_harvest/update_expense/update_sale`, guard bất biến (vụ, người ghi, nguồn không đổi; đã hủy không khôi phục/sửa). Mở rộng A11 sang các bảng này.
- Giá vốn: view `inventory_issue_costs`; giao dịch xuất đã bị đảo (do hủy nhật ký) không tính chi phí.
- Tổng kết vụ: hàm `get_cycle_summary(cycle)` (thay view `cycle_summary`): chỉ vai trò được xem chi phí của chủ vụ mới gọi được, người khác nhận lỗi chứ không thấy số 0 giả.

| # | Giả định | Cách đổi |
|---|---|---|
| A16 | **Tên người làm**: nhân viên = họ tên trong hồ sơ lao động; chủ/quản lý đăng ký bằng email = phần trước dấu @ của email (ví dụ `an` từ `an@gmail.com`), vì chưa có "tên hiển thị" trong hồ sơ tài khoản. Bản ghi cũ trước 0018 được điền một lần khi chạy migration | Thêm ô "Tên hiển thị" cho chủ/quản lý rồi đổi hàm `author_display_name` |
| A19 | Tab "Vật tư & chi phí" **giải thể** theo D28: danh mục vật tư/kho sang Khai báo; Thu hoạch và Kho thành sub-tab của Sản xuất; Chi phí, Doanh thu, Tổng kết sang tab Báo cáo (phần Tài chính) | Đổi chỗ các sub-tab (chỉ giao diện) |
| A20 | **Quyền theo giai đoạn** thực hiện qua **loại việc**: chức vụ nói được làm loại việc nào; thêm quyền "quản lý giai đoạn". Không có bảng quyền riêng từng giai đoạn | Thêm bảng quyền theo giai đoạn nếu thật sự cần |
| A21 | Chức vụ có sẵn (từ 6 vai trò hiện tại) giữ nguyên; chức vụ tự tạo cộng thêm; quyền hiệu lực = hợp, phần chủ cấp riêng đè lên; chủ luôn đủ quyền | Đổi quy tắc hợp trong `has_perm` |
| A22 | Tạo vụ **bắt buộc** dùng quy trình mẫu (đã sửa theo yêu cầu 20/10/2026, bỏ "vụ tự do"); vụ **sao chép** mẫu lúc tạo nên sửa mẫu không đổi vụ đang chạy | Cho lại vụ tự do |
| A23 | **Mỗi hộ/HTX có bộ quy trình mẫu riêng** (không dùng chung). Hộ ghi vụ theo HTX chọn trong mẫu của HTX (được đọc mẫu của HTX mình tham gia). HTX áp/chia sẻ mẫu cho hộ để sau | Thêm `shared_from_org` |
| A24 | Tên hiển thị người dùng lưu ở `profiles` (chưa có ảnh đại diện); `author_display_name` dùng tên này trước, rồi hồ sơ lao động, rồi email | Thêm ảnh/số điện thoại |
| A18 | Quyền theo mục (D27): (a) **Thu hoạch cũng nằm trong** các mục cấp được; mặc định mọi vai trò ghi nhật ký đều "xem và nhập liệu" nên không đổi gì; vai trò Biên tập hồ sơ không còn thấy thu hoạch. (b) **"Xuất dùng" khi ghi việc** vẫn theo vai trò (quản lý, nhân viên), không phụ thuộc quyền Kho vì là việc hằng ngày. (c) Quyền cấp **cho từng người**, không cấp cho cả vai trò; cấp xong người đó thấy thay đổi khi mở lại app hoặc có mạng lại. (d) Người có quyền "Tổng kết" thấy tổng chi phí/doanh thu dù không có quyền xem chi tiết chi phí; chủ tự cân nhắc khi cấp | Đổi trong `role_default_perm` và `set_member_permissions` |
| A17 | Vụ **Tạm dừng** cũng chưa ghi việc được (chỉ "Đang sản xuất"). Thu hoạch, chi phí, doanh thu chưa bị giới hạn theo trạng thái vụ | Đổi điều kiện `c.status === 'active'` ở các màn tương ứng |
| A13 | **Chi phí vụ** = thực chi *không phải vật tư* + giá vốn vật tư đã dùng + chi phí vật tư ghi tay + phân bổ/ước tính. Tiền *mua* vật tư (nhóm "vật tư", loại thực chi) chỉ hiển thị riêng, không cộng, vì đã tính khi xuất dùng. **Giá thành/kg** chỉ hiện khi có thu hoạch và không còn lần xuất thiếu giá vốn | Sửa hàm `get_cycle_summary` |
| A14 | Giá vốn tính cho cả vật tư xuất từ kho của hộ cho vụ của HTX trên khu trồng của hộ (vụ HTX thấy chi phí này) | Lọc theo `organization_id` trong `get_cycle_summary` |
| A15 | Người xem tổng kết vụ chỉ là vai trò thuộc **chủ vụ** (chủ, quản lý, Kho & chi phí, Quản lý HTX); thành viên hộ không thấy tổng kết vụ HTX | Mở rộng điều kiện trong `get_cycle_summary` |

## Cách tôi triển khai D11–D14 (đã làm, migration 0011 + Edge Function)

- Số điện thoại được ghép thành email ẩn `<sdt>@sdt.<tên miền>`; người dùng chỉ thấy ô "Số điện thoại".
- Hệ thống sinh mật khẩu tạm 8 ký tự ngẫu nhiên (bỏ ký tự dễ nhầm). Hết hạn sau 7 ngày (`staff_temp_password_days`).
- **Máy chủ khóa dữ liệu** của tài khoản nhân viên cho tới khi mật khẩu được đổi thật sự (so sánh băm trong Auth), không chỉ ẩn ở giao diện. Mật khẩu tạm hết hạn thì chủ phải đặt lại.
- Tài khoản nhân viên **không tự tạo cơ sở**; mỗi số điện thoại chỉ dùng cho một tài khoản nhân viên.
- Quên mật khẩu của nhân viên: chủ cơ sở bấm "Đặt lại mật khẩu" (nhận mật khẩu tạm mới).
- Kiểu phân hệ (D10) lưu ở `worker_profiles.work_mode`.

## Cảnh báo bảo mật về tên miền email ẩn (D13)

Hệ thống Auth có thể gửi thư (đặt lại mật khẩu) tới email ẩn. Vì vậy `sdt.<tên miền>` **phải do bạn kiểm soát và không có hộp thư nhận** (không bật catch-all). Nếu tên miền thuộc người khác hoặc hết hạn rồi người lạ mua lại, họ có thể nhận thư và chiếm tài khoản nhân viên. `agricovi.com` hiện chỉ là giá trị tạm; **bạn phải sở hữu tên miền này (hoặc đổi) trước khi dùng thật.**

## Cách tôi triển khai D8 (đã làm, migration 0010)

- `create_organization` chỉ cho tạo cơ sở **đầu tiên**. Tài khoản đã là chủ một cơ sở sẽ bị từ chối (`ORG_LIMIT`).
- HTX thêm cơ sở bằng **hai cách**:
  1. **Mời hộ đã có tài khoản** bằng email. Chủ hộ đăng nhập bằng đúng email đó sẽ thấy lời mời và chấp nhận. Không cần gửi thư.
  2. **Tạo hộ thành viên** cho người chưa có tài khoản/điện thoại. HTX là bên quản lý (`managed_by_org`), người tạo là chủ của hộ đó.
- Người được mời làm nhân viên/quản lý (vai trò trong một cơ sở) **không bị ép tạo cơ sở**; họ nhận lời mời ngay sau khi đăng ký.

## [GIẢ ĐỊNH] cần xác nhận

| # | Giả định | Lý do | Cách đổi nếu không đúng |
|---|---|---|---|
| A1 | Hộ do HTX tạo hộ **không gỡ/rời** được cho tới khi có chức năng chuyển quyền chủ hộ | Tránh HTX giữ dữ liệu của hộ khi hộ rời đi mà chưa có quy tắc | Làm chức năng chuyển quyền chủ hộ |
| A2 | Hộ **không rời/gỡ** được HTX khi còn vụ ghi theo HTX đang chạy trên khu trồng của hộ; phải kết thúc vụ trước | Đơn giản và không mất dữ liệu; quy tắc xuất dữ liệu khi rời HTX chưa chốt (v1.2 mục 4.2) | Thay bằng quy tắc xuất dữ liệu / chuyển vụ sang gói riêng |
| A3 | Tài khoản đã là chủ một cơ sở **không** tạo cơ sở HTX thứ hai | Khớp "Hộ chỉ 1 cơ sở"; HTX thêm cơ sở = thêm hộ thành viên | Nếu một người quản lý nhiều HTX, cần thêm cơ chế |
| A4 | Chỉ **chủ cơ sở** mời/gỡ thành viên, đổi vai trò; quản lý chỉ xem danh sách | An toàn hơn; mở rộng sau nếu cần | Đổi quyền trong `invite_member`, `set_member_role` |
| A5 | Lời mời xác nhận bằng **email đăng nhập** trùng email được mời; lời mời không có hạn | Không cần hạ tầng gửi thư ở giai đoạn đầu | Thêm hạn lời mời, gửi thư qua SMTP |
| A6 | ~~Người lao động không có email~~ → **Đã giải quyết bằng D11** (tài khoản số điện thoại do chủ tạo) | — | — |
| A7 | 4 kiểu phân hệ khởi đầu: tự chấm giờ / tổ trưởng chấm giờ / tổ trưởng ghi sản lượng / kết hợp. Danh sách có thể sai so với nhu cầu thật | D10 chưa nêu rõ các kiểu | Sửa `WORK_MODE_LABEL` và ràng buộc `worker_profiles.work_mode` |
| A8 | Số điện thoại đã có tài khoản nhân viên ở cơ sở khác thì **không tạo trùng**; chưa có luồng "nhân viên làm cho nhiều cơ sở" | Đơn giản; số điện thoại là định danh duy nhất | Thêm lời mời theo số điện thoại cho tài khoản nhân viên có sẵn |
| A9 | Nhân viên bị gỡ khỏi cơ sở vẫn còn tài khoản (không vào được dữ liệu nào, không tạo được cơ sở) | Chưa có chức năng khóa/xóa hẳn tài khoản | Thêm khóa tài khoản trong Edge Function |

## Câu hỏi mở cho bước E (chấm công)

- "Kiểu phân hệ" của người lao động gồm những kiểu nào? Đề xuất khởi đầu để bạn sửa: (1) tự chấm công bằng điện thoại, theo giờ; (2) do tổ trưởng chấm hộ, theo giờ; (3) theo sản lượng/công việc do tổ trưởng ghi; (4) kết hợp giờ và sản lượng.
- Người lao động không có email/điện thoại thông minh đăng nhập thế nào, hay chỉ tồn tại dưới dạng hồ sơ do tổ trưởng chấm hộ?
