# Đề xuất: "Tìm nhà cung ứng" trong app (từ gian hàng và sản phẩm trên website)

Trạng thái: **ĐỀ XUẤT, chưa làm** (1/11/2026). Mảng APP đọc, mảng WEB sở hữu dữ liệu; làm theo từng giai đoạn bên dưới.

## 1. Mục tiêu

Người dùng app (hộ, HTX) mở một khu **Tìm nhà cung ứng**, lọc theo khu vực và loại hàng, xem gian hàng và vật tư đang bán trên website. Quan tâm thì bấm **Thêm vào nhà cung ứng**: hệ thống tạo sẵn một nhà cung ứng trong Khai báo với tên, tỉnh/xã, loại hàng đã điền; người dùng chỉ thêm ghi chú.

## 2. Dữ liệu có sẵn (đã kiểm tra)

| Thứ | Bảng | Có gì | Ghi chú |
|---|---|---|---|
| Gian hàng vật tư | `material_shops` (công khai qua `public_material_shops`) | tên, mô tả, **tỉnh**, huyện, đã kiểm tra giấy phép | Điện thoại và địa chỉ chi tiết **cố ý ẩn**, chỉ hiện sau đăng nhập qua `get_shop_contact` (D67) |
| Vật tư của gian hàng | `site_materials` (có `shop_id`, `status='published'`) | tên, thương hiệu, nhóm, đơn vị, giá từ | Chỉ vật tư và phụ kiện, chưa có thuốc BVTV/thú y; tối đa 10 vật tư mỗi gian hàng (D70) |
| Nhà cung cấp nông sản | `public_profiles`, `public_products` | hồ sơ hộ/HTX bán nông sản, giống, vật nuôi | Có hàm tìm `public_directory_page`, `public_products_page` (lọc tỉnh) |
| Nhà cung ứng của cơ sở trong app | `partners` (`is_supplier`) | tên, điện thoại, địa chỉ + **tỉnh, xã (migration 0176)**, loại hàng, ghi chú | Nơi nhận dữ liệu khi "Thêm vào nhà cung ứng" |

## 3. Quyết định then chốt cần chủ sản phẩm chốt: số điện thoại

Website **không công khai** điện thoại gian hàng để tránh bên mua và bên bán đi vòng, và chặn liên hệ trong nội dung. Nếu app tự chép số điện thoại vào nhà cung ứng thì phá chính sách đó. Có 3 cách:

- **A (đề xuất): chỉ chép thông tin công khai** (tên, tỉnh, loại hàng, đường dẫn trang gian hàng). Muốn gọi thì người dùng bấm "Xem liên hệ", app gọi `get_shop_contact` (đã yêu cầu đăng nhập, người dùng app đã đăng nhập) và hiện số; bấm "Lưu số vào nhà cung ứng" là **hành động chủ động**, ghi nhận lượt xem liên hệ. Giữ tinh thần D67, vẫn nhanh cho người dùng.
- B: chép luôn điện thoại khi bấm Thêm. Tiện nhất, nhưng bỏ chính sách ẩn liên hệ.
- C: không bao giờ chép điện thoại, chỉ có nút "Gửi yêu cầu báo giá" đi qua website. Chặt nhất, nhưng người dùng phải nhập số tay.

Đề xuất chọn **A**. Mọi cách đều chỉ dùng cho tài khoản đã đăng nhập.

## 4. Thiết kế đề xuất

### 4.1 Hàm đọc (do WEB cung cấp, APP chỉ gọi)

Theo ranh giới hai mảng, app **không đọc trực tiếp** `material_shops`/`site_materials`. Cần một hàm công khai mới phía WEB (ghi vào "Cần bên WEB" trong `STATUS_WEB.md`):

`app_find_suppliers(p_q text, p_province text, p_branch text, p_limit int, p_offset int) returns jsonb`

- Trả về mỗi gian hàng: `id, slug, name, description, province, license_verified`, số vật tư, **vài tên vật tư/nhóm hàng tiêu biểu**, đường dẫn trang web. Không trả điện thoại, địa chỉ.
- Lọc: tỉnh/thành phố (trùng danh sách `PROVINCES` đã chuẩn hóa), từ khóa (dùng sẵn cột `search_text` và chỉ mục trigram đã có), nhóm hàng.
- Gộp hai nguồn có cờ `source`: `shop` (gian hàng vật tư) và `farm` (hộ/HTX bán giống, vật nuôi), để mở rộng sau.
- Chỉ người dùng đã đăng nhập gọi được; có `revoke … from public, anon`.

Tỉnh của gian hàng hiện do người bán gõ tự do (`province text`). Phía WEB nên đổi form mở gian hàng sang cùng danh sách 34 tỉnh/thành phố để lọc chính xác (cần bên WEB; dữ liệu cũ vẫn lọc theo chữ gần đúng nhờ `fold_vi`).

### 4.2 Hàm ghi (APP)

`add_supplier_from_web(p_org uuid, p_shop uuid, p_note text, p_save_contact boolean) returns uuid`

- Kiểm quyền như nhà cung ứng (`has_perm(org,'expenses','edit')`).
- Tạo `partners` (`is_supplier=true`): `name`, `province`, `ward` (nếu có), `goods` = nhóm hàng của gian hàng, `note` = ghi chú người dùng; điện thoại, địa chỉ chỉ khi `p_save_contact` (xem mục 3).
- Thêm hai cột vào `partners` để nhớ nguồn: `web_shop_id uuid` (không khóa ngoại, như `web_lead_links`) và `web_source text`. Có chỉ mục duy nhất `(organization_id, web_shop_id)`: **bấm lặp không nhân đôi**, nếu đã có thì trả về nhà cung ứng cũ và nút đổi thành "Đã có trong nhà cung ứng".
- Trùng tên với nhà cung ứng đã có (chỉ mục `partners_org_name_idx`): báo rõ và đề nghị nối vào nhà cung ứng đó thay vì tạo mới.

### 4.3 Giao diện app

- Vị trí: **Khai báo → Nhà cung ứng**, thêm nút/tab **Tìm trên website** (không thêm menu mới để menu gọn).
- Bộ lọc một hàng: Tỉnh/thành phố, ô tìm, nhóm hàng. Mặc định tỉnh của cơ sở (lấy từ hồ sơ website nếu có).
- Danh sách thẻ: tên gian hàng, dấu "Đã kiểm tra giấy phép", tỉnh, vài vật tư tiêu biểu; nút **Thêm vào nhà cung ứng**, nút **Xem trên website**.
- Bấm Thêm mở form có sẵn thông tin (dùng `AddressFields`), người dùng chỉ thêm ghi chú rồi Lưu.
- Cần mạng (không offline), đúng quy tắc D24.

### 4.4 Quản trị và an toàn

- Không để app thành kênh bỏ qua website: ghi **nhật ký lượt xem liên hệ** (ai xem gian hàng nào, khi nào) vào `audit_events` hoặc bảng nhẹ để chủ gian hàng và quản trị biết.
- Giới hạn số lượt xem liên hệ mỗi ngày cho mỗi cơ sở (đề xuất 30) để chống cào dữ liệu.
- Gian hàng bị tạm khóa hoặc ngừng thì biến khỏi kết quả; nhà cung ứng đã thêm vẫn giữ (dữ liệu của người dùng), gắn nhãn "Gian hàng đã ngừng trên website" khi mở.
- Dữ liệu trả về chỉ gồm phần đã duyệt, đúng nguyên tắc "website chỉ đọc bản đã duyệt".

## 5. Giai đoạn

1. **Giai đoạn 1 (nhỏ, nên làm trước):** tìm gian hàng vật tư theo tỉnh + từ khóa, Thêm vào nhà cung ứng theo cách A. Cần: 1 migration WEB (`app_find_suppliers`), 1 migration APP (cột nguồn + `add_supplier_from_web`), màn tìm trong Nhà cung ứng, test CSDL về quyền, trùng lặp, không lộ điện thoại.
2. **Giai đoạn 2:** thêm nguồn `farm` (hộ/HTX bán giống, vật nuôi) và nhóm lọc theo loại hàng; chuẩn hóa tỉnh phía website.
3. **Giai đoạn 3 (hướng mở):**
   - **Gợi ý theo nhu cầu:** từ vật tư sắp hết hoặc đang dùng trong vụ, gợi ý gian hàng gần nhất có bán.
   - **Báo giá nhanh:** chọn vài vật tư rồi gửi một yêu cầu báo giá tới nhiều gian hàng (dùng sẵn `quote_requests`), kết quả về lại Hóa đơn mua.
   - **Đánh giá và độ tin cậy:** hiện đánh giá, số đơn đã giao (đã có `public_reviews`, `public_supplier_ratings`).
   - **Bản đồ/khoảng cách:** khi có toạ độ hoặc xã/phường chuẩn, sắp xếp theo gần nhất.
   - **Giá tham khảo:** so sánh `price_from` giữa các gian hàng cho cùng một vật tư, đối chiếu giá nhập thực tế của cơ sở.
   - **Mở cho người bán:** gói quảng bá gian hàng (xếp trên cùng) gắn với hệ số ưu tiên `ranking_weight`, thống kê lượt xem cho chủ gian hàng.
   - **HTX:** HTX tìm và thêm nhà cung ứng dùng chung cho các hộ thành viên.

## 6. Việc cần chủ sản phẩm quyết

1. Cách xử lý điện thoại: A (đề xuất), B hoặc C (mục 3).
2. Cho phép bắt đầu ở Giai đoạn 1 chỉ với gian hàng vật tư, hay gộp luôn hộ/HTX bán nông sản.
3. Đồng ý để phía WEB đổi ô tỉnh của gian hàng sang danh sách chuẩn.
