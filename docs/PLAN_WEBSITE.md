# Kế hoạch triển khai website bản 2 (W0–W8)

Nguồn: `docs/AgriConnect_Thiet_ke_website_ban_2_1.docx` (thiết kế đầy đủ, mã chức năng WEB-A1…I6) và quyết định D58–D61 trong `docs/DECISIONS.md`. Tài liệu này chỉ trả lời: **làm phần nào, theo thứ tự nào, xong thế nào**. Làm theo thứ tự; mỗi lát xong là phát hành được độc lập.

Cập nhật 22/10/2026: header có **Tin nông nghiệp | Tin xuất khẩu | Tin hội chợ | Giao thương** (Giá thị trường chuyển vào menu Tin nông nghiệp, không còn là mục riêng).

> **Cập nhật 22/10/2026 (D63):** quản trị website là ứng dụng riêng `apps/webadmin`, phục vụ ở `/admin/` của chính Worker website (D64); mọi "màn Admin" ghi trong các lát W1–W8 bên dưới nằm ở đó. Quản trị nền tảng (`apps/admin`) chỉ giữ cơ sở, gói, thanh toán, cấu hình, nhật ký kiểm toán. W1–W4 đã xong về code (W3: xem D65; còn thiếu ẩn liên hệ nhà cung cấp tới khi đăng nhập); bước "quản trị thống nhất" (D63) làm trước W3.

## 1. Nguyên tắc triển khai

- **Mỗi lát = một bản dùng được**: migration (nếu có) + test CSDL gọn + giao diện web/admin + mục hướng dẫn thử trong `docs/HUONG_DAN_THU.md`. Commit sau mỗi lát; người dùng tự `db push`, tự deploy.
- Theo quy tắc tiết kiệm: test CSDL **chỉ khi đổi SQL** (một file test cho logic mới), typecheck một lần cuối đợt, không chạy lại test cũ, không build, docs gộp cuối.
- Quyền, hạn mức, "chỉ chủ/người mua đăng nhập", "chi tiết giao thương cần đăng nhập" đều **ép ở CSDL** (RLS, hàm), không chỉ ở giao diện.
- Website **chỉ đọc** view/bản chụp công khai (`public_*`, `public_site_*`) và hàm RPC của chính người dùng. Không đọc bảng vận hành.
- Mọi thứ mới ghi thẳng bằng mạng (không thêm đường offline).

## 2. Việc phải xong TRƯỚC khi viết code website (chặn tiến độ)

| # | Việc | Ai | Vì sao chặn |
|---|---|---|---|
| P1 | `db push` các migration 0016–0041 lên Supabase thật | Chủ sản phẩm | Website dựa trên `public_*` (0005, 0039, 0040) và hồ sơ website (0040). Chưa push thì không có dữ liệu thật để thử. |
| P2 | **Hạ tầng ảnh: Supabase Storage** (lát G2-1 của app): bucket công khai cho ảnh sản phẩm/banner/bài viết, nén ở trình duyệt, lưu đường dẫn thay vì chuỗi base64 | Claude (code) + chủ push | Hiện ảnh nằm nén trong cột văn bản (A33, A44). Một trang danh mục 40 sản phẩm sẽ kéo hàng MB và chậm. **Phải xong trước W2.** |
| P3 | Tên miền + tên thương hiệu hiển thị | Chủ sản phẩm | Cần cho email xác minh, SEO, chân trang, mã QR trỏ về website. W1 vẫn làm được với tên miền tạm của Cloudflare. |
| P4 | Dịch vụ gửi email (SMTP) cho Supabase Auth | Chủ sản phẩm | Xác minh email người mua (W3), thông báo (W4–W5). |
| P5 | Khóa Turnstile của Cloudflare | Chủ sản phẩm | Chống tài khoản và tin rác (W3 trở đi). |
| P6 | Nhân sự biên tập (ít nhất 1 người) | Chủ sản phẩm | Tin xuất khẩu, tin hội chợ, vật tư, giá cần người nhập; chưa có người thì ẩn mục đó. |
| P7 | Tư vấn pháp lý: thông báo/đăng ký website thương mại điện tử, quy chế hoạt động, bảo vệ dữ liệu cá nhân, hàng hạn chế | Chủ sản phẩm | Cần trước khi mở **đặt hàng và giao thương** cho người dùng thật (W4–W5). Không chặn W1–W3. |

## 3. Chọn phạm vi: làm, hoãn, để sau

Ký hiệu: **ĐẦU** = trong 5 lát đầu (W1–W5), **SAU** = W6–W8, **HOÃN** = chưa xếp lịch.

| Nhóm | ĐẦU (bắt buộc) | SAU (nên làm) | HOÃN (chưa) |
|---|---|---|---|
| A Danh mục, tìm kiếm | A1 trang chủ, A2 mega menu, A3 trang danh mục, A4 trang sản phẩm, A5 tìm kiếm (không dấu), A6 lọc khu vực, A7 danh bạ, A8 hồ sơ nhà cung cấp | bản đồ cơ sở | tìm kiếm đã lưu (C3) |
| B Tài khoản | B1 đăng ký (email hoặc điện thoại), B2 đăng nhập + chặn nhân viên, B3 chủ đăng nhập bằng tài khoản app, B4 hồ sơ + địa chỉ | B5 chuyển Đang mua/Đang bán, B6 đóng tài khoản | OTP số điện thoại |
| C Mua hàng | C1 theo dõi nhà cung cấp, C2 yêu thích, C4 giỏ hàng, C5 đặt hàng, C6 theo dõi đơn, C7 báo giá | mua lại nhanh | thanh toán trực tuyến |
| D Giao thương | D1 danh sách, D2 chi tiết sau đăng nhập, D3 đăng tin, D4 tin của tôi, D5 quan tâm/báo giá, D7 báo cáo vi phạm | D6 gợi ý khớp | trả phí tin nổi bật |
| E Gian hàng | E1 bảng điều khiển, E2 sửa nhanh, E3 thêm sản phẩm nông sản, E4 xử lý đơn, E5 trả lời | E7 thống kê | đăng bán **vật tư** (để sau W8) |
| F Hộp thư, thông báo | F1 hộp thư, F2 chuông + email | F3 thông báo đẩy | chat thời gian thực |
| G Nội dung | G1 tin tức/kiến thức/**tin hội chợ**/tin xuất khẩu, G3 trang tĩnh, G4 liên hệ | giá nông sản, lịch thời vụ | tiếng Anh |
| H Tin cậy | H4 báo cáo vi phạm | H1 truy xuất dòng thời gian, H2 huy hiệu, H3 đánh giá | — |
| I Quản trị | I1 banner, I2 danh mục, I3 bài viết/trang, I4 duyệt, **vật tư do admin nhập**, I5 người dùng | I6 cấu hình nâng cao | — |

Đề xuất **ba mốc phát hành** (có thể dừng ở bất kỳ mốc nào):

| Mốc | Lát | Người dùng có gì |
|---|---|---|
| **M1 — Website sàn xem được** | W1 + W2 | Giao diện mới, danh mục, sản phẩm, vật tư (admin nhập), tin tức, hội chợ, danh bạ; chưa có tài khoản. |
| **M2 — Có tài khoản và giao thương** | W3 + W4 | Đăng ký/đăng nhập, theo dõi nhà cung cấp, đăng tin cần mua/bán, hộp thư. |
| **M3 — Đặt hàng** | W5 | Giỏ hàng, đơn, xử lý đơn. |

W6–W8 hoàn thiện sau khi chạy thử với người dùng thật.

## 4. Chi tiết từng lát

Số migration bắt đầu từ **0042** (0041 là cuối cùng hiện có). Cỡ: S/M/L/XL tương đối.

### W0 — Chuẩn bị kỹ thuật (nửa lát)
- Thêm bộ điều hợp dựng phía máy chủ cho Astro trên Cloudflare Workers (website hiện là `output: 'static'`, Astro 4.15); chọn đúng phiên bản bộ điều hợp tương thích khi làm. Cập nhật `wrangler.jsonc`.
- Thêm Astro React (island) cho các phần tương tác (giỏ hàng, biểu mẫu, hộp thư).
- Tách bộ thành phần giao diện dùng chung: thẻ sản phẩm, thẻ nhà cung cấp, thẻ tin, hàng trượt, tiêu đề khối, nhãn trạng thái; bảng màu giống app.
- **Xong khi:** trang chủ cũ chạy được bằng SSR, header trả đúng meta, deploy thử trên dự án Cloudflare.

### W1 — Nền, giao diện mới, CMS khung (L)
- **Web:** `Base` mới theo thiết kế: thanh xanh (logo, Tìm hiểu về ▾, Dành cho người bán/mua, Đăng nhập | Đăng ký), hàng dưới (Danh mục, tìm kiếm, bốn mục chữ có menu thả, Giỏ hàng), chân trang 5 cột; khung trang chủ theo thứ tự D61: Hero → **Giao thương** → Khám phá nhà cung cấp → Trái cây → Rau củ quả → Vật nuôi → Vật tư → Sự kiện/tin. Trang tĩnh: Giới thiệu, Dành cho người bán, Dành cho người mua, Trợ giúp, Điều khoản, Riêng tư, Quy chế hoạt động, Giải quyết tranh chấp. Meta, Open Graph, sitemap, bộ nhớ đệm (`s-maxage`).
- **CSDL (0042):** `platform_roles` (quản trị viên, tổng biên tập, biên tập viên, kiểm duyệt viên), `site_banners`, `site_pages` + phiên bản, `site_menus`, `site_settings`; view `public_site_*` chỉ nội dung đã đăng; hàm kiểm quyền biên tập; audit.
- **Admin:** nhóm menu "Website": Banner, Trang tĩnh, Menu và chân trang, Cài đặt chung.
- **Test:** `site_cms.test.mjs` (ai sửa được, chỉ nội dung đã đăng ra anon, phiên bản, audit).
- **Xong khi:** biên tập viên đổi banner và nội dung trang tĩnh, website hiện ngay không deploy lại.

### W2 — Danh mục, sản phẩm, vật tư, tin (L–XL)
- **CSDL (0043–0044):** `product_categories` (cây, biểu tượng, cờ hàng hạn chế); mở rộng `product_listings`/`public_products` (danh mục, giá "từ", đơn vị, đặt tối thiểu, loại nông sản/vật tư); `site_materials` (vật tư do admin nhập: thương hiệu, thành phần, hướng dẫn, giá tham khảo, ảnh, nhà phân phối); `site_articles` + chuyên mục (Tin nông nghiệp, Tin xuất khẩu, **Tin hội chợ**) + `site_events` (ngày, địa điểm, đơn vị tổ chức); `quote_requests` (yêu cầu báo giá không cần tài khoản, có Turnstile); tìm kiếm toàn văn không dấu (extension `unaccent`); các view công khai tương ứng.
- **Web:** mega menu, trang danh mục (lọc, sắp xếp, phân trang), trang sản phẩm, trang vật tư (nút "Yêu cầu báo giá"), tìm kiếm toàn site, danh bạ nâng cao, hồ sơ nhà cung cấp mở rộng, trang tin/bài viết, trang tin hội chợ, giá nông sản/lịch thời vụ (dạng bài hoặc bảng đơn giản).
- **Admin:** Danh mục, **Vật tư** (nhập tay và CSV), Bài viết/Tin, **Hội chợ**, hàng đợi Yêu cầu báo giá.
- **Test:** `catalog_site.test.mjs`, `quote_requests.test.mjs`.
- **Xong khi (M1):** người lạ vào web xem hết danh mục, vật tư, tin, hội chợ; gửi được yêu cầu báo giá.

### W3 — Tài khoản và gian hàng (L)
- **CSDL (0045):** `buyer_profiles`, `buyer_addresses`, `favorite_suppliers`, `favorite_products`; hàm `get_my_web_account()` trả loại tài khoản (chủ/người mua/nhân viên); **mọi hàm website từ chối tài khoản có trong `staff_accounts`**; đăng ký/đăng nhập bằng **email hoặc số điện thoại** (Edge Function đăng ký bằng số điện thoại, ghép email ẩn như nhân viên, Turnstile, giới hạn tần suất; đăng nhập qua hàm tra số → email, tương tự hàm có sẵn của nhân viên); hàm gian hàng: `my_shop_*` (đọc, sửa nhanh tình trạng cung ứng/giá/ảnh, thêm sản phẩm nông sản) dùng lại hàm kiểm quyền và kiểm phiên bản của hồ sơ website (0040).
- **Web:** đăng ký, đăng nhập, quên mật khẩu (email), menu tài khoản (Đơn hàng, Yêu thích, Tin của tôi, Thông báo), hồ sơ, địa chỉ, nút theo dõi nhà cung cấp, nút yêu thích, trang "Gian hàng của tôi" (sửa nhanh, nút mở sang app).
- **Quyết định tạm:** số điện thoại không OTP; quên mật khẩu tài khoản số điện thoại do quản trị hỗ trợ (D61).
- **Test:** `web_accounts.test.mjs` (nhân viên bị chặn ở mọi hàm, người mua chỉ đọc dữ liệu của mình, gian hàng đúng quyền và phiên bản).
- **Xong khi:** người mua tự đăng ký và lưu nhà cung cấp; chủ cơ sở đăng nhập web bằng tài khoản app sửa được tình trạng hàng; nhân viên đăng nhập web bị từ chối.

### W4 — Giao thương, hộp thư, thông báo (XL)
- **Điều kiện:** P4 (email), P5 (Turnstile), P7 (tư vấn pháp lý) nên có trước khi mở thật.
- **CSDL (0046–0047):** `trade_posts` (+ảnh, trạng thái chờ duyệt/hiển thị/hết hạn/đóng), `trade_responses` (quan tâm/báo giá), `conversations`, `messages`, `notifications`, `abuse_reports`; view `public_trade_posts` chỉ **trường tóm tắt**; hàm `get_trade_post()` chi tiết **cần đăng nhập** và không lộ người đăng; lọc số điện thoại/liên kết/từ khóa cấm; giới hạn số tin và tần suất; tự hết hạn; kiểm duyệt trước khi hiện (tài khoản tin cậy tự duyệt, cấu hình).
- **Web:** trang Giao thương (danh sách tóm tắt, khóa "Đăng nhập để xem chi tiết"), chi tiết, biểu mẫu đăng tin (chủ yếu là chọn), "Tin của tôi", Quan tâm/Báo giá, hộp thư theo cuộc trao đổi (tải định kỳ, chưa thời gian thực), chuông thông báo, email thông báo.
- **Admin:** Duyệt giao thương, Báo cáo vi phạm, Người dùng website (khóa/mở), Cấu hình giao thương.
- **Test:** `trade.test.mjs` (khách không đọc được chi tiết, dữ liệu chi tiết không nằm trong view công khai, chỉ người đăng thấy người quan tâm, giới hạn tin, lọc liên hệ).
- **Xong khi (M2):** thử với 3–5 nhà cung cấp và vài người mua thật; đăng tin → duyệt → quan tâm → trao đổi chạy trọn.

### W5 — Giỏ hàng và đơn đặt hàng nông sản (XL)
- **Điều kiện:** nên hoàn tất tư vấn pháp lý (P7) và thử xong W4.
- **CSDL (0048–0049):** `carts`/`cart_items`, `web_orders`/`web_order_items` (bản chụp giá)/`web_order_events` (chỉ thêm), trạng thái Mới đặt → Đã báo giá/xác nhận → Đồng ý → Chuẩn bị → Đã giao → Hoàn tất/Hủy; cột thanh toán do người bán cập nhật; hàm tách giỏ theo nhà cung cấp; tự hoàn tất sau 7 ngày; thông báo đơn.
- **Web:** giỏ hàng, đặt hàng (địa chỉ, ngày giao, ghi chú), "Đơn hàng của tôi", hộp xử lý đơn trong Gian hàng, mua lại.
- **Nối app (chỉ phía bán):** đơn hoàn tất tạo bản nháp doanh thu trong app **chờ danh bạ Đối tác (lát G2-4 của app)**; nếu G2-4 chưa xong thì bỏ nối, chỉ làm ở website. Nhập kho vật tư **để sau** (D61).
- **Test:** `web_orders.test.mjs` (chuyển trạng thái đúng người, giá bản chụp bất biến, người ngoài không đọc đơn, lịch sử chỉ thêm).
- **Xong khi (M3):** một đơn đi trọn từ giỏ đến hoàn tất giữa hai tài khoản thật.

### W6 — Nội dung nâng cao và tin cậy (M–L)
Giá nông sản và lịch thời vụ tự động từ vụ công khai, trang truy xuất dạng dòng thời gian (H1), huy hiệu tin cậy nhiều mức (H2), thống kê gian hàng (E7), gợi ý khớp tin (D6), bản đồ cơ sở. Migration 0050+.

### W7 — Đánh giá và thông báo đẩy (M)
Đánh giá nhà cung cấp sau đơn hoàn tất (H3), thông báo đẩy cho nhà cung cấp (F3, chung với thông báo đẩy của app), tối ưu hiệu năng (đo trên điện thoại cấu hình thấp, mạng chậm).

### W8 — Mở rộng (M–L)
Tiếng Anh, chuyển Đang mua/Đang bán, đóng tài khoản và xuất dữ liệu, xác minh OTP số điện thoại (nếu quyết), thanh toán trực tuyến (nếu quyết).

### Để sau W8 (đã chốt D61)
Người bán vật tư tự đăng ký và đăng bán (có thể kèm gói riêng), đơn vật tư, nút "Nhập kho" nối app, nhóm hàng hạn chế (thuốc BVTV, thuốc thú y).

## 5. Thứ tự tổng với kế hoạch app (G2)

| Bước | Lát | Ghi chú |
|---|---|---|
| 1 | **G2-1 (app)**: Storage + xử lý tồn đọng vận hành (P1, P2) | Bắt buộc trước W2 |
| 2 | **W0 + W1** | Có thể làm trước G2-1 vì không cần ảnh mới |
| 3 | **W2 → M1** | Phát hành website sàn xem được |
| 4 | G2-2 nhà cung ứng (app) | Song song được với W2 |
| 5 | **W3** | Cần P3 (tên miền), P4 (email), P5 |
| 6 | G2-4 khách hàng (app) | Trước W5 |
| 7 | **W4 → M2**, thử thực địa | Cần P7 |
| 8 | **W5 → M3** | |
| 9 | G2-3 chụp hóa đơn, G2-6 giọng nói (app) | Độc lập với website |
| 10 | W6 → W8, các lát G2 còn lại | |

## 6. Rủi ro và cách giữ phạm vi

| Rủi ro | Cách giảm |
|---|---|
| Phạm vi tương đương một sàn nhỏ | Ba mốc M1–M3, dừng được; cắt trước: bản đồ, gợi ý khớp, tìm kiếm đã lưu, đánh giá |
| Ảnh làm trang chậm | Storage trước W2; ảnh tự đổi kích thước, tải lười |
| Trang rác/tin rác | Turnstile, giới hạn tần suất, duyệt trước, lọc liên hệ, báo cáo vi phạm |
| Pháp lý (sàn, dữ liệu cá nhân, hàng hạn chế) | P7 sớm; M1 không thu dữ liệu cá nhân nên phát hành được trước |
| Không có người biên tập | Ẩn mục Tin xuất khẩu/Tin hội chợ/vật tư khi trống; bắt đầu ít mục chất lượng |
| SSR + đăng nhập làm phức tạp | Trang công khai lưu đệm không chứa dữ liệu riêng; phần đăng nhập tải ở trình duyệt qua hàm RPC |
| Số điện thoại chưa OTP | Không dùng số làm bằng chứng danh tính; OTP ở W8 |

## 7. Việc cần chủ sản phẩm chốt trước khi bắt đầu W0–W1

1. Tên thương hiệu hiển thị và tên miền (hoặc dùng tên tạm).
2. Chọn mốc đầu: đề xuất **M1** (W0 → W2).
3. Ai biên tập (tin, hội chợ, vật tư) và ai duyệt hồ sơ/tin.
4. Thông tin chân trang: đơn vị vận hành, địa chỉ, hotline, email, mạng xã hội.
5. Nội dung ban đầu: logo, 3–5 banner, bài giới thiệu, danh sách danh mục (xác nhận cây danh mục mục 4.1 của thiết kế), 20–30 vật tư mẫu.

## 8. Bước kế tiếp đề xuất

Bắt đầu **W0 + W1** (không cần chờ P2–P7), song song bạn thực hiện P1 (`db push`) và lo P3–P6.
