# Kế hoạch Giai đoạn 2 — phía APP (tổng hợp ngày 23/10/2026)

Nguồn: mục 7 của `AgriConnect_Giai_doan_1_va_Ke_hoach_Giai_doan_2.docx` (lộ trình G2-1…G2-8, đã chốt ở D58), `STATUS_APP.md`, các việc phát sinh khi làm giao diện v2 và tối ưu hiệu năng. Phần website xem `PLAN_WEBSITE.md`.
Nguyên tắc sắp xếp: **việc nền và rủi ro trước, việc phụ thuộc sau; mỗi lát dùng được độc lập; tính năng mới cần mạng (D24), bản nháp giữ trên máy.**

## 1. Đã xong, KHÔNG làm lại

| Mục trong kế hoạch cũ | Thực tế |
|---|---|
| Vai trò gốc sửa được | Xong (D49) |
| Liên hệ/báo giá, lịch mùa vụ, huy hiệu tin cậy, SSR/SEO, đơn đặt hàng, đánh giá | Xong phía website (D60–D73); phía app mới có thẻ "Việc chờ từ website" (D69) |
| Báo cáo theo nhu cầu, xuất CSV | Xong (D48); còn thiếu biểu đồ và báo cáo định kỳ |
| Giao diện v2, hiệu năng bản đầu | Xong (D74, tối ưu 23/10) |

## 2. Lát 0 — Chốt nền (làm ngay, không viết tính năng mới)

Đây là điều kiện để mọi lát sau chạy được trên dữ liệu thật. Phần lớn là việc của chủ sản phẩm.

| # | Việc | Ai làm | Ghi chú |
|---|---|---|---|
| 0.1 | `db push` các migration chưa đẩy (0016 → 0053, theo đúng thứ tự) và deploy lại Edge Function `staff-accounts`, `web-accounts` | Chủ sản phẩm | `STATUS_*` đang ghi nhiều mục "chưa db push"; nên đẩy từng nhóm rồi thử, không đẩy một lần |
| 0.2 | Thử tay trên điện thoại thật theo `HUONG_DAN_THU.md` + giao diện v2 (menu ☰, Vào/Ra ca, Ghi việc, offline) | Chủ sản phẩm | Ghi lỗi gửi lại để sửa |
| 0.3 | Sửa lỗi phát hiện ở 0.2 | Claude | Gộp theo đợt |
| 0.4 | ~~Tên miền thật~~ **Hoãn tới sau khi xong Giai đoạn 2** (quyết định 23/10/2026): mua một tên miền dùng chung cho website và app (xem mục 7); trong lúc làm vẫn dùng tên miền tạm. Sao lưu Supabase vẫn nên có khi bắt đầu dùng dữ liệu thật | Chủ sản phẩm | `login_email_domain` đổi cùng lúc |
| 0.5 | Cập nhật `STATUS_APP.md` cho đúng thực tế sau 0.1 | Claude | Chỉ khi xong mốc |

## 3. Lát 1 — Hoàn thiện lõi đang dùng hằng ngày (nhỏ, rủi ro thấp, giá trị cao)

| # | Việc | Cỡ | Phụ thuộc / ghi chú |
|---|---|---|---|
| 1.1 | **Giao việc**: giao đầu việc cho người/tổ, hiện ở khối "Tôi cần làm" trên Trang chủ và ở Tài khoản (D40) | M | Migration mới `..._app_*`, quyền theo mục; nền cho thông báo đẩy ở lát 6 |
| 1.2 | **Hiệu năng giai đoạn 2**: lọc truy vấn theo cơ sở/kỳ ngay lúc đọc; tải gia tăng thay vì tải lại toàn bộ danh mục (cột `updated_at`); số liệu Trang chủ tính ở máy chủ theo kỳ đầy đủ (D41) | M | Cần migration; làm khi dữ liệu thật lớn lên, hoặc cùng đợt 1.1 |
| 1.3 | **Làm mới thủ công** (kéo xuống để tải lại) thay cho dòng "Tải lại" đã bỏ khỏi Trang chủ | S | Chỉ giao diện |
| 1.4 | ~~Ra ca ép ở CSDL~~ | — | **Chưa cần** (quyết định 23/10/2026); hiện chỉ kiểm ở giao diện |
| 1.5 | **Hàng rào vị trí chấm công**: ngưỡng độ chính xác GPS, thử trong nhà màng/vườn (A36, E3-S19) | S–M | Cần thử thực địa trước |
| 1.6 | ~~Bộ mẫu quy trình dưa lưới~~ | — | **Bỏ khỏi lộ trình**: quy trình mẫu đã làm động cho mọi loại hình (D31, D34) |
| 1.7 | ~~Thẻ thời tiết~~ | — | **Chưa cần** (quyết định 23/10/2026) |

## 4. Các lát chính (theo thứ tự đã chốt ở D58, có bổ sung phụ thuộc)

| Lát | Nội dung | Cỡ | Phụ thuộc | Điểm cần chú ý |
|---|---|---|---|---|
| **G2-1** | **Hạ tầng lưu ảnh** (Supabase Storage) thay ảnh nén trong cột; quyền xem theo mục | M | Lát 0 | Điều kiện cho chứng từ hóa đơn; đổi D62/A33/A44; cần cách chuyển ảnh cũ sang |
| **G2-2** | **Đối tác – nhà cung ứng**: một bảng Đối tác có cờ, màn Nhà cung ứng; gắn vào nhập kho/chi phí; **công nợ phải trả** (ghi nhận lần trả, tính còn nợ); báo cáo; nhắc đến hạn ở "Tôi cần làm" | L | G2-1 không bắt buộc | Thêm mục quyền `partners` vào `role_default_perm` **và** `permissions.ts` (test `perms.test.mjs` báo lệch); giá và công nợ chỉ người có quyền Chi phí; mặc định không công khai (D58-5) |
| **G2-3** | *(TẠM HOÃN 23/10/2026; xem `PLAN_G2_3_CHUP_HOA_DON.md`, cần thử nghiệm độ chính xác trước)* **Chụp hóa đơn**: Edge Function đọc ảnh (khóa chỉ ở máy chủ), màn kiểm tra ảnh cạnh trường đã đọc, tạo nhập kho/chi phí, chứng từ đính kèm, cảnh báo hóa đơn trùng | L–XL | **G2-1 và G2-2** | Hạn mức số lần theo gói (D58-2), cấu hình trong CSDL; luôn là bản nháp, người dùng xác nhận |
| **G2-4** | *(đang làm; kế hoạch `PLAN_G2_4_KHACH_HANG.md`)* **Đối tác – khách hàng**: màn Khách hàng; gắn vào doanh thu; **công nợ phải thu**; báo cáo | L | G2-2 (dùng chung bảng Đối tác) | Dữ liệu cá nhân: mặc định riêng tư, quản trị nền tảng không đọc, cho ẩn số điện thoại |
| **G2-5** | *(kế hoạch `PLAN_G2_5_DON_KHACH_WEBSITE.md`)* **Khách tiềm năng** từ website (tự vào danh sách, có thông báo quyền riêng tư) → báo giá → đơn bán | L | G2-4; phần website đã xong | Nối với đơn đặt hàng/báo giá có sẵn (D68), không làm lại luồng website |
| **G2-6** | **Giọng nói**: nhận dạng có sẵn của thiết bị cho ghi chú/mô tả; tách trường ở máy chủ cho Ghi việc và Thu hoạch | M–L | Không | **Bắt đầu đo thực địa sớm, song song** (không tốn nhiều công); chưa dùng dịch vụ trả phí khi chưa có số đo; xin đồng ý ở lần đầu |
| **G2-7** | *(kế hoạch `PLAN_G2_7_THONG_BAO_BIEU_DO_GIAO_VIEC.md`)* **Thông báo đẩy** (công chờ xác nhận, nhắc việc theo ngày, công nợ đến hạn), **biểu đồ** trong báo cáo, **báo cáo định kỳ** | L | 1.1 Giao việc; G2-2/G2-4 cho công nợ | Web Push cần PWA đã cài; iPhone hạn chế hơn Android |
| **G2-8** | **Hộ rời HTX / chuyển quyền chủ hộ** (xuất dữ liệu, xử lý vụ đang chạy, hạn mức con), **thanh toán trực tuyến**, tách người duyệt hồ sơ khỏi quản trị viên | L | Quyết định pháp lý, cổng thanh toán | A1, A2, A42 |

## 5. Chạy song song (nhóm C — chuẩn bị pilot)

Không phụ thuộc lát nào, nên bắt đầu sớm vì có độ trễ ngoài tầm Claude: hồ sơ pháp lý dữ liệu cá nhân (vị trí, tiền công, khách hàng), điều khoản và chính sách riêng tư; kiểm thử khả dụng; chọn 3–5 cơ sở và 1–2 HTX thử có hỗ trợ tại chỗ; đo chỉ số sử dụng. Thời điểm vào pilot: **chưa chốt, để sau** (23/10/2026: sau Lát 1 là chưa đủ). Tạm thời làm tiếp các lát G2 theo thứ tự.

## 6. Thứ tự đề xuất, tóm gọn

`Lát 0 (chốt nền)` → `Lát 1 (lõi hằng ngày)` → `G2-1 ảnh` → `G2-2 nhà cung ứng` → `G2-3 chụp hóa đơn` → `G2-4 khách hàng` → `G2-5 khách tiềm năng` → `G2-6 giọng nói` → `G2-7 thông báo đẩy` → `G2-8 hoàn thiện`.

Lý do: nhà cung ứng trước chụp hóa đơn vì ảnh hóa đơn cần danh bạ để đối chiếu; hạ tầng ảnh trước vì chứng từ là ảnh; Đối tác dựng một lần ở G2-2 rồi G2-4 dùng lại; thông báo đẩy sau vì cần có việc để nhắc (giao việc, công nợ).

## 7. Đã quyết (23/10/2026)

1. Pilot: để sau, chưa chốt thời điểm.
2. Ép Ra ca ở CSDL: chưa cần.
3. Thẻ thời tiết: chưa cần.
4. Mục quyền Đối tác: chưa cần quyết ngay; quyết khi bắt đầu G2-2.
5. Bộ mẫu dưa lưới: bỏ.
6. Tên miền: mua sau khi xong Giai đoạn 2; **một tên miền dùng chung cho cả website và app** (tên miền gốc cho website, tên miền phụ `app.` cho ứng dụng, `/quan-tri/` và `/admin/` giữ như hiện có). Khi đổi: cập nhật `login_email_domain`, địa chỉ cho phép đăng nhập trong Supabase Auth, `VITE_PUBLIC_SITE_URL`, gắn tên miền vào hai dự án Cloudflare.

## 8. Quy ước làm việc cho giai đoạn này

- Mỗi lát: migration `..._app_*` + test CSDL cho quyền và ràng buộc (chỉ chạy file mới); giao diện thuần thì chỉ typecheck một lần cuối.
- Không đổi quyết định đã chốt; thay đổi lớn ghi vào `DECISIONS_APP.md` (số D tiếp theo là D75 trở đi, **kiểm tra số cuối trước khi ghi** vì chat website cũng ghi D).
- Cập nhật `STATUS_APP.md` khi xong lát, không cập nhật từng bước nhỏ.
