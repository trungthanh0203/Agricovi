# AGRICONNECT — ĐẶC TẢ BỔ SUNG v1.2

**Phiên bản:** 1.2 (bổ sung cho v1.1, không thay thế)
**Ngày:** 18/10/2026
**Trạng thái:** Đã có quyết định của chủ sản phẩm; các mục đánh dấu **[GIẢ ĐỊNH]** cần xác nhận trước khi phát hành.

> Tài liệu này **giữ nguyên toàn bộ v1.1**. Chỉ các điểm được nêu rõ ở mục 1 là thay đổi so với v1.1. Khi có khác biệt giữa hai tài liệu, v1.2 được ưu tiên cho đúng các điểm đó.

---

## 1. Danh mục thay đổi so với v1.1

| # | Nội dung | Tác động lên v1.1 |
|---|---|---|
| C1 | Chốt PWA cho app (mục 14.1 của v1.1) | Đóng câu hỏi 14.1 |
| C2 | Chốt công nghệ: GitHub, Supabase, Cloudflare (mục 14.3) | Đóng câu hỏi 14.3 một phần |
| C3 | Chấm công/lương là module trong app sản xuất, không phải app riêng | Làm rõ mục 16 |
| C4 | **Bỏ quy đổi giờ sang ngày công**; tính theo tổng giờ công của tháng | Sửa 16.6.1, 16.15 (câu 3), FR-ATT-06, FR-ATT-07 |
| C5 | Cây trồng đại diện đầu tiên: dưa lưới | Đóng câu hỏi 14.5 một phần |
| C6 | Thêm phân hệ Gói dịch vụ và hạn mức vụ | Mới (mục 3) |
| C7 | Thêm mô hình Hộ — HTX (1 hộ thuộc tối đa 1 HTX, hai ngữ cảnh dữ liệu) | Làm rõ 4.6, 2.2 (mục 4) |
| C8 | Thứ tự hiển thị website theo gói (kiểu "a": mọi cơ sở đã duyệt đều hiện, gói trả phí chỉ ưu tiên) | Bổ sung 4.7, 9 (mục 5) |
| C9 | Thêm trang quản trị nền tảng cho gói/cấu hình hiển thị | Mới (mục 6) |

---

## 2. Quyết định kỹ thuật đã chốt

### 2.1 Nền tảng
- **App:** PWA, mobile-first, offline-first (IndexedDB + hàng đợi gửi).
- **Website công khai:** triển khai tách khỏi app, đọc **chỉ** các bảng/view `public_*`.
- **Hạ tầng giai đoạn đầu:** GitHub (mã nguồn, CI/CD), Supabase (Postgres, Auth, Storage, Edge Functions, RLS), Cloudflare Pages (hosting), Cloudflare Turnstile (chống spam).
- **Domain:** mua ngay trước khi pilot; không dùng địa chỉ `*.pages.dev` cho người dùng thật.
- **Supabase:** gói miễn phí chỉ cho phát triển; nâng lên gói trả phí có backup trước khi có người dùng thật (NFR-SEC-004).
- **Vị trí dữ liệu:** [GIẢ ĐỊNH] đặt ở khu vực châu Á gần nhất. Cần rà soát pháp lý về dữ liệu cá nhân (GPS, tiền công) trước khi mở rộng. Dùng Postgres chuẩn để có thể chuyển hạ tầng sau này.

### 2.2 Nguyên tắc triển khai bắt buộc
- Phân quyền và hạn mức được ép **trong CSDL** (RLS, hàm Postgres), không chỉ ở giao diện.
- Dữ liệu phát sinh (nhật ký, giao dịch kho, lượt chấm công, sản lượng) là **bản ghi chỉ thêm**; sửa là sự kiện điều chỉnh có audit.
- Mọi bản ghi tạo offline có UUID tạo ở thiết bị và khóa idempotency.
- Khóa bí mật không nằm trong frontend; khóa `service_role` chỉ dùng trong Edge Functions.

---

## 3. Phân hệ Gói dịch vụ và hạn mức vụ

### 3.1 Nguyên tắc
1. Hạn mức tính theo **số vụ trồng đang chạy cùng lúc** của một tổ chức.
2. Vụ được tính vào hạn mức: *Đang sản xuất*, *Tạm dừng*. Không tính: *Chuẩn bị*, *Đã kết thúc*, *Đã hủy*.
3. Gói, giá, hạn mức, thời gian dùng thử và thứ tự hiển thị là **dữ liệu cấu hình trong CSDL**, admin chỉnh được. Không hard-code.
4. Thay đổi giá/hạn mức của một gói **chỉ áp dụng từ kỳ gia hạn sau**; gói đang chạy giữ điều khoản đã đăng ký.
5. Thanh toán giai đoạn đầu **ghi nhận thủ công** (chuyển khoản, admin xác nhận). Cổng thanh toán tự động là LATER.
6. Hết hạn hoặc vượt hạn mức **không khóa dữ liệu sản xuất**. Chỉ: (a) không tạo/kích hoạt vụ mới, (b) mất ưu tiên hiển thị trên website.

### 3.2 Giá trị khởi tạo (seed, admin sửa được)

| Loại tổ chức | Gói | Vụ đồng thời tối đa | Phí/quý (VND) |
|---|---|---|---|
| Hộ nông dân | Hộ cơ bản | 2 | 300.000 |
| Hộ nông dân | Hộ nâng cao | 5 | 500.000 |
| HTX | HTX cơ bản | 5 | 1.500.000 |
| HTX | HTX nâng cao | 10 | 3.000.000 |

- Dùng thử: **1 tháng** khi đăng ký mới (giá trị cấu hình), giới hạn theo gói cơ bản của loại tổ chức tương ứng.
- Số hộ mà HTX khai báo là thông tin hiển thị, **không** dùng để tính phí hay chặn.

### 3.3 Trạng thái gói
`Dùng thử` → `Đang hoạt động` → `Hết hạn` (có thể `Tạm khóa` do admin). Gia hạn đưa về `Đang hoạt động`. Ngày bắt đầu/hết hạn hiển thị rõ cho chủ tổ chức; có nhắc trước hạn [GIẢ ĐỊNH: số ngày nhắc là cấu hình].

### 3.4 Kiểm tra hạn mức
- Khi tạo vụ mới hoặc chuyển vụ sang *Đang sản xuất*/*Tạm dừng*, hàm CSDL đếm vụ đang tính hạn mức của tổ chức sở hữu và so với `max_cycles` của gói còn hiệu lực.
- Vượt hạn mức: từ chối, trả thông báo dễ hiểu (ví dụ "Bạn đang dùng 2/2 vụ. Kết thúc một vụ hoặc nâng gói để tạo thêm.") kèm đường dẫn liên hệ/nâng gói.
- Vụ tạo khi offline mà khi đồng bộ vượt hạn mức: **không mất dữ liệu**; bản ghi vào trạng thái *Cần xử lý* để chủ tổ chức quyết định (nâng gói hoặc kết thúc vụ khác).
- Hạ gói hoặc hết hạn khi đang có số vụ vượt hạn mức mới: các vụ đang chạy **vẫn tiếp tục**, chỉ chặn tạo thêm.

### 3.5 Yêu cầu chức năng

- `FR-PLAN-001` MUST: Quản lý danh mục gói (loại tổ chức, tên, số vụ tối đa, phí theo quý, hệ số ưu tiên hiển thị, trạng thái, hiệu lực).
- `FR-PLAN-002` MUST: Mỗi tổ chức có gói đang hiệu lực với ngày bắt đầu/hết hạn và trạng thái.
- `FR-PLAN-003` MUST: Kiểm tra hạn mức vụ ở CSDL theo mục 3.4.
- `FR-PLAN-004` MUST: Tổ chức mới tự động nhận gói dùng thử theo cấu hình.
- `FR-PLAN-005` MUST: Admin kích hoạt, gia hạn, đổi gói, tạm khóa; mỗi thao tác có audit.
- `FR-PLAN-006` MUST: Ghi nhận thanh toán thủ công (số tiền, ngày, hình thức, người ghi, ghi chú).
- `FR-PLAN-007` MUST: Thay đổi giá/hạn mức không làm đổi điều khoản của gói đang chạy.
- `FR-PLAN-008` MUST: Hết hạn không khóa dữ liệu sản xuất (mục 3.1.6).
- `FR-PLAN-009` MUST: Chủ tổ chức xem gói hiện tại, số vụ đã dùng/hạn mức, ngày hết hạn.
- `FR-PLAN-010` SHOULD: Nhắc sắp hết hạn trong app (và email nếu bật).
- `FR-PLAN-011` LATER: Cổng thanh toán, hóa đơn điện tử, mã khuyến mãi.

---

## 4. Mô hình Hộ — HTX

### 4.1 Quy tắc
1. `Organization` có loại: **Hộ/cơ sở** hoặc **HTX**.
2. Một hộ thuộc **tối đa 1 HTX** tại một thời điểm (ràng buộc trong CSDL).
3. HTX có **một quỹ vụ chung** theo gói HTX. Số hộ HTX khai báo không bị giới hạn; chỉ tổng số vụ đang chạy dưới tên HTX bị giới hạn.
4. Hộ có thể đồng thời có gói riêng. Một hộ có hai **ngữ cảnh dữ liệu**:

| Ngữ cảnh | Chủ sở hữu dữ liệu | Tính hạn mức vào | Ai xem |
|---|---|---|---|
| Vụ của HTX | HTX | Quỹ vụ HTX | Hộ tạo vụ; HTX theo quyền |
| Vụ riêng | Hộ | Gói riêng của hộ | Chỉ hộ (HTX không thấy) |

5. Khi tạo vụ, nếu hộ vừa thuộc HTX vừa có gói riêng còn hiệu lực, app hỏi một câu: "Vụ này ghi theo HTX hay theo hộ riêng?". Nếu chỉ có một lựa chọn khả dụng thì tự chọn.
6. Phù hợp FR-COOP-004: HTX không mặc định xem dữ liệu riêng của thành viên.

### 4.2 Các điểm [GIẢ ĐỊNH] cần xác nhận
- **A1 — Hạn mức con:** HTX có thể (tùy chọn) đặt số vụ tối đa cho từng hộ trong quỹ chung; để trống nếu không dùng. MVP có thể chỉ làm phân quyền "ai được tạo vụ".
- **A2 — Hộ rời HTX:** hộ được xuất toàn bộ dữ liệu vụ của mình; HTX giữ số liệu tổng hợp và lịch sử đã có trong thời gian lưu trữ theo thỏa thuận; vụ đang chạy do hộ chọn kết thúc hoặc chuyển sang gói riêng nếu còn hạn mức. Quy tắc này phải nằm trong điều khoản tham gia HTX và được rà soát pháp lý.
- **A3 — Gói theo tổ chức:** người dùng thuộc nhiều tổ chức thì gói tính riêng theo từng tổ chức.

### 4.3 Yêu cầu chức năng
- `FR-COOP-006` MUST: Hộ thuộc tối đa một HTX hoạt động; ràng buộc ở CSDL.
- `FR-COOP-007` MUST: HTX mời/chấp nhận hộ, hộ chấp nhận/từ chối; có lịch sử tham gia/rời.
- `FR-COOP-008` MUST: Vụ ghi dưới ngữ cảnh HTX tính vào quỹ vụ HTX; vụ riêng tính vào gói của hộ.
- `FR-COOP-009` MUST: HTX khai báo số hộ (hiển thị/báo cáo), không dùng để chặn hay tính phí.
- `FR-COOP-010` MUST: Dữ liệu vụ riêng của hộ không hiển thị cho HTX.
- `FR-COOP-011` MUST: Hộ rời HTX theo quy trình A2 (xuất dữ liệu, xử lý vụ đang chạy).
- `FR-COOP-012` SHOULD: Hạn mức con theo hộ (A1).

---

## 5. Website: thứ tự hiển thị theo gói (kiểu "a")

1. Mọi cơ sở có hồ sơ **đã duyệt và xuất bản** đều xuất hiện trên website. Gói chỉ ảnh hưởng **thứ tự**.
2. Công thức xếp hạng lưu trong bảng cấu hình, ví dụ: `điểm = hệ số gói + điểm hồ sơ đầy đủ + điểm độ mới của thông tin cung ứng`, chia nhóm ưu tiên. Admin chỉnh được từng hệ số và bật/tắt xáo trộn trong cùng nhóm để công bằng.
3. Điều kiện hưởng ưu tiên: gói còn hạn, hồ sơ đã xuất bản, thông tin cung ứng cập nhật trong khoảng thời gian cấu hình.
4. Thẻ cơ sở được ưu tiên phải có nhãn **"Ưu tiên hiển thị"** (không che giấu tính quảng cáo).
5. Hồ sơ HTX và hồ sơ từng hộ là **hai hồ sơ độc lập**, mỗi bên có gói và thứ tự riêng. Hộ không tự hưởng ưu tiên từ gói của HTX.
6. HTX chỉ hiển thị danh sách hộ thành viên khi hộ đó **đồng ý công khai** (khớp mục 9.2 của v1.1).
7. Thứ tự được tính ở phía máy chủ/view `public_*`, không ở frontend.

Yêu cầu:
- `FR-WEB-014` MUST: Sắp xếp danh bạ/tìm kiếm theo cấu hình xếp hạng trong CSDL.
- `FR-WEB-015` MUST: Nhãn "Ưu tiên hiển thị" cho cơ sở được ưu tiên.
- `FR-WEB-016` MUST: Cơ sở hết hạn gói vẫn hiển thị nhưng mất ưu tiên.
- `FR-WEB-017` MUST: Dữ liệu công khai sinh từ bản chụp xuất bản bất biến (`public_*`); website không đọc bảng nội bộ.
- `FR-WEB-018` SHOULD: Điểm xếp hạng giải thích được (admin xem vì sao cơ sở ở vị trí đó).

---

## 6. Trang quản trị nền tảng

Chỉ vai trò PlatformAdmin truy cập; mọi thao tác ghi audit.

- Quản lý gói và giá: thêm, sửa, ngừng bán.
- Danh sách tổ chức: gói, hạn dùng, số vụ đang dùng/hạn mức.
- Kích hoạt, gia hạn, đổi gói, tạm khóa; ghi nhận thanh toán.
- Cấu hình xếp hạng hiển thị trên website.
- Cấu hình thời gian dùng thử, ngày nhắc hết hạn.
- Duyệt/tạm ẩn hồ sơ (kết hợp vai trò PlatformReviewer).
- Xem audit log.

Yêu cầu: `FR-ADM-001` MUST (các chức năng trên); `FR-ADM-002` MUST (tách quyền Admin/Reviewer; admin không mặc định xem dữ liệu vận hành riêng tư, NFR-SEC-007).

---

## 7. Phân hệ chấm công/lương — điều chỉnh

### 7.1 Vị trí
Là **module trong app sản xuất**. Người lao động và tổ trưởng dùng chung app; màn hình khác nhau theo vai trò. Điều hướng chính vẫn bốn mục của v1.1 (mục 3.2); chấm công đặt trong "Sản xuất" (chấm công hôm nay) và "Cơ sở của tôi" (quản lý lao động, bảng tiền công). Việc đặt cụ thể được xác nhận ở prototype, không đổi bốn mục.

### 7.2 Tính tiền công
- **Bỏ quy đổi giờ sang ngày công.** Hệ thống tính **tổng giờ công đã duyệt trong tháng** nhân đơn giá giờ.
- Công thức: `Tiền công giờ = Σ giờ được duyệt trong kỳ × đơn giá giờ hiệu lực`.
- Vẫn hỗ trợ **tính theo sản lượng/công việc** (16.6.3) và khoản cộng/trừ, tạm ứng (16.6.4).
- **Tính theo ngày công (16.6.1) chuyển thành LATER**, chỉ làm khi có yêu cầu mới.
- Kỳ trả công mặc định theo tháng; kỳ khác là cấu hình [GIẢ ĐỊNH].
- Làm tròn giờ, nghỉ giữa ca, làm thêm giờ, ca qua đêm: là **cấu hình**, chưa có giá trị mặc định cứng (giữ nguyên nguyên tắc v1.1).
- Một khoảng thời gian/sản lượng không được tính trùng giữa tiền công giờ và sản lượng.

### 7.3 Yêu cầu bị ảnh hưởng
- `FR-ATT-06` (cập nhật): quản lý ca/lịch tùy chọn, thời gian nghỉ, làm tròn giờ theo cấu hình; **không** có quy đổi giờ-ngày.
- `FR-ATT-07` (cập nhật): đơn giá theo **giờ** và **sản lượng/công việc** có ngày hiệu lực; đơn giá ngày là LATER.
- `FR-ATT-10`, `FR-ATT-12`, `FR-ATT-14`: giữ nguyên.

---

## 8. Cây trồng đại diện: dưa lưới

- Đây là cây đầu tiên có bộ mẫu sâu: giai đoạn, lịch việc, vật tư thường dùng, mẫu thu hoạch/phân loại/hao hụt.
- Dựng bộ mẫu từ khảo sát thực địa 2–3 nhà màng, không dựng từ giả định. Mọi giá trị kỹ thuật trong bộ mẫu là **tham khảo, sửa được** (FR-CROP-006) và không được trình bày như khuyến cáo nông học đã kiểm chứng (mục 13 của v1.1).
- Kiến trúc `CropProfile` giữ nguyên là lõi chung; cây khác chỉ thêm cấu hình.
- Yêu cầu: `FR-CROP-008` MUST: bộ cấu hình dưa lưới (giai đoạn, mẫu việc, vật tư, mẫu thu hoạch) được nạp từ cấu hình/seed, không nằm trong code.

---

## 9. Dữ liệu bổ sung cho ERD

- `Organization` thêm: `type` (household/cooperative), `declared_member_count` (HTX).
- `CooperativeMembership`: household_org, cooperative_org, trạng thái, ngày vào/rời; **ràng buộc duy nhất** một membership hoạt động cho mỗi hộ.
- `PlanTier`: loại tổ chức, tên, `max_cycles`, `price_per_quarter`, `ranking_weight`, trạng thái, hiệu lực.
- `Subscription`: organization_id, `plan_tier_id`, **bản chụp điều khoản đã đăng ký** (giá, hạn mức), trạng thái, ngày bắt đầu/hết hạn, người kích hoạt.
- `PaymentRecord`: subscription_id, số tiền, ngày, hình thức, người ghi, ghi chú.
- `PlatformSetting`: khóa-giá trị cấu hình (thời gian dùng thử, ngày nhắc, tham số xếp hạng, xáo trộn).
- `RankingRule`: tham số công thức hiển thị (có thể gộp vào `PlatformSetting`).
- `PublicSnapshot` / các bảng `public_*`: bản chụp bất biến của hồ sơ/sản phẩm đã duyệt dùng cho website.
- `ProductionCycle`: bổ sung cờ `counts_toward_quota` (suy ra từ trạng thái) và `owner_org_id` rõ ràng.

---

## 10. Yêu cầu phi chức năng bổ sung

- `NFR-PLAN-001` MUST: không có đường vòng bỏ qua hạn mức (offline, gọi API trực tiếp); kiểm thử riêng.
- `NFR-PLAN-002` MUST: mọi thao tác tiền/gói của admin ghi audit không sửa được.
- `NFR-PUB-001` MUST: test tự động chứng minh website không truy cập được bảng nội bộ (dùng khóa công khai).
- `NFR-SEC-009` MUST: RLS bật trên mọi bảng có `organization_id`; có test phân quyền chéo tổ chức và chéo ngữ cảnh Hộ/HTX.
- `NFR-OPS-001` MUST: staging và production tách biệt; migration qua CI; kiểm thử phục hồi backup trước pilot.

---

## 11. Tiêu chí nghiệm thu bổ sung

1. Tạo vụ thứ 3 của hộ gói cơ bản bị từ chối, vụ thứ 2 thành công; kể cả khi gọi API trực tiếp.
2. Vụ tạo offline vượt hạn mức khi đồng bộ vào trạng thái *Cần xử lý*, không mất dữ liệu.
3. HTX khai báo 50 hộ vẫn chỉ bị giới hạn theo tổng vụ của gói.
4. Hộ gắn vào HTX thứ hai khi đang thuộc một HTX bị từ chối.
5. Vụ riêng của hộ không hiển thị cho HTX; vụ của HTX hiển thị theo quyền.
6. Đổi giá gói trong admin không đổi điều khoản của gói đang chạy.
7. Gói hết hạn: không tạo được vụ mới, vẫn ghi nhật ký/chấm công/xuất báo cáo, hồ sơ mất nhãn ưu tiên nhưng vẫn hiển thị.
8. Thứ tự danh bạ thay đổi khi admin đổi hệ số, không cần sửa code.
9. Bảng tiền công tháng bằng tổng giờ được duyệt × đơn giá hiệu lực; mỗi dòng truy ngược được.
10. Website không lộ nhật ký, chi phí, tồn kho, vụ riêng của hộ.

---

## 12. Câu hỏi còn mở

1. **A1:** hạn mức con theo hộ trong HTX — làm ở MVP hay sau?
2. **A2:** quy tắc dữ liệu khi hộ rời HTX — xác nhận và rà soát pháp lý.
3. Kỳ trả công có luôn theo tháng không; làm tròn giờ, làm thêm giờ, ngày nghỉ/lễ theo loại lao động nào.
4. Chính sách xác minh chứng nhận và kiểm duyệt nội dung (14.8 của v1.1).
5. Thời hạn lưu dữ liệu GPS/chấm công và xử lý yêu cầu sửa/xóa.
6. Vị trí đặt dữ liệu và hồ sơ pháp lý dữ liệu cá nhân trước khi mở rộng.
7. Số ngày nhắc hết hạn; có gửi email không.
8. Tiền công của lao động thuộc ngữ cảnh HTX hay hộ: chi phí nhân công ghi vào ngữ cảnh nào khi người lao động làm cho cả hai.
