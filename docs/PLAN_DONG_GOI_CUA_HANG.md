# Kế hoạch đưa app Acovin lên Google Play và App Store (từng bước)

Ngày soạn: 25/11/2026. Mảng APP. **Mới là kế hoạch, chưa làm bước đóng gói nào.** Nối tiếp đợt D của `PLAN_GOI_MIEN_PHI.md`; phần hồ sơ khai báo chi tiết ở `HUONG_DAN_NOP_CUA_HANG.md`.

Ký hiệu: **[Bạn]** việc bạn tự làm (tài khoản, tiền, giấy tờ) · **[Claude]** việc làm trong mã, tài liệu. Thời gian là ước lượng, chưa đo.

## 0. Hiện trạng

| Đã có | Chưa có |
|---|---|
| App PWA cài được, chạy khi mất sóng | Gói Android (AAB) và iOS |
| Trang `/chinh-sach`, hướng dẫn xóa tài khoản `/chinh-sach#xoa-tai-khoan` | `/.well-known/assetlinks.json` |
| Xóa tài khoản ngay trong app | Ẩn giá và nút mua gói trong bản cửa hàng |
| Biểu tượng 192, 512, maskable | Ảnh chụp màn hình, ảnh bìa cửa hàng, mô tả |
| Đăng nhập bằng email/điện thoại (không dùng Google, Facebook) | Thông báo đẩy kiểu gốc cho iOS |

**Thứ tự:** chốt nền tảng chung (bước 1) → **Google Play trước** (ít việc, rẻ) → App Store sau.

## 1. Quyết định phải chốt TRƯỚC khi đóng gói

| # | Quyết định | Đề xuất | Vì sao quan trọng |
|---|---|---|---|
| 1 | Tên miền của app | **Mua `acovin.com` trước**, chạy `scripts/brand/switch_domain.py`, đưa app về `app.acovin.com` | Bản Android gắn chặt với tên miền. Đổi miền sau phải phát hành bản mới, và người dùng phải đăng nhập lại, bản ghi chưa gửi nằm ở miền cũ |
| 2 | Mã gói (package / bundle ID) | `com.acovin.app` | **Không đổi được sau khi phát hành** |
| 3 | Tài khoản nhà phát triển: cá nhân hay tổ chức | **Tổ chức** (nếu có đăng ký kinh doanh) | Hiện tên công ty; Google Play tài khoản cá nhân mới bắt buộc thử kín 12 người trong 14 ngày liên tục trước khi được phát hành |
| 4 | Bán gói trong app | Bản cửa hàng **không hiện giá, không nút mua, không liên kết thanh toán** | Xem mục 5 (rủi ro) |
| 5 | iPad | Chưa hỗ trợ riêng ở bản đầu (chỉ iPhone) | Bớt việc làm ảnh và duyệt; chốt lại khi dựng bản iOS |
| 6 | Máy Mac cho iOS | Thuê dịch vụ dựng trên mây (Codemagic, GitHub Actions macOS) hoặc mượn Mac | Không dựng và ký bản iOS được trên Windows |

## 2. Giai đoạn A: chuẩn bị chung (khoảng 1–3 tuần, chủ yếu chờ giấy tờ)

1. **[Bạn]** Mua tên miền, gắn Cloudflare, cập nhật Supabase (Site URL, Redirect URLs), `RESEND_FROM` (xem `DEPLOY_CLOUDFLARE.md` mục cuối).
2. **[Bạn]** `npx supabase db push`, triển khai hàm máy chủ, deploy app và website bản mới nhất.
3. **[Bạn]** Nếu chọn tổ chức: xin mã **D-U-N-S** (miễn phí, có thể mất đến khoảng 30 ngày). Làm ngay vì đây là việc chờ lâu nhất.
4. **[Bạn]** Mở tài khoản **Google Play Console** (phí một lần 25 USD) và **Apple Developer Program** (99 USD mỗi năm).
5. **[Bạn]** Quản trị → Cấu hình → Thông tin liên hệ: điền công ty, địa chỉ, điện thoại, **email hỗ trợ** thật.
6. **[Bạn]** Nhờ luật sư rà trang chính sách, gồm dữ liệu khuôn mặt chấm công và quy định bảo vệ dữ liệu cá nhân của Việt Nam.
7. **[Bạn + Claude]** Tạo **tài khoản thử cho người duyệt**: cơ sở "Trại Demo" có dữ liệu mẫu, gói đủ chức năng, hạn xa.
8. **[Claude]** Ẩn giá và đặt mua ở bản cửa hàng: nhận biết đang chạy trong gói Android/iOS, ẩn "Các gói đăng ký của Acovin", nút "Gửi yêu cầu mua" và mọi câu mời mua; chỉ còn "Liên hệ hỗ trợ". Bản web giữ nguyên. Rà cả menu "Mở website" (website không được dẫn thẳng đến trang giá trong bản cửa hàng).

## 3. Giai đoạn B: Google Play (Android)

Cách làm: **Trusted Web Activity** bằng Bubblewrap. App Android mở đúng bản web đang chạy, toàn màn hình; sửa web là người dùng có bản mới, không phải nộp lại.

| Bước | Ai | Việc |
|---|---|---|
| B1 | Claude | Rà `manifest` (tên, màu, `id`, `screenshots`, lối tắt "Ghi việc"); kiểm bằng Lighthouse |
| B2 | Claude + Bạn | Cài JDK, Android SDK (Bubblewrap tự hướng dẫn); `bubblewrap init --manifest https://app.<miền>/manifest.webmanifest`; mã gói `com.acovin.app`; bật thông báo, quyền vị trí |
| B3 | Bạn | Tạo **khóa ký** (keystore). **Sao lưu 2 nơi, không đưa vào git.** Bật Play App Signing |
| B4 | Claude | Mục tiêu **Android 16 (API 36)** trở lên (bắt buộc cho app mới và bản cập nhật từ 31/08/2026) |
| B5 | Claude | Đặt `apps/app/public/.well-known/assetlinks.json` với dấu vân tay SHA-256 của **cả** khóa tải lên và khóa Google ký (lấy ở Play Console). Sai bước này app hiện thanh địa chỉ trình duyệt |
| B6 | Bạn + Claude | `bubblewrap build` ra tệp `.aab`; cài thử bản `.apk` trên máy thật |
| B7 | Claude + Bạn | Kiểm trên máy thật: đăng nhập, ghi việc khi tắt mạng rồi bật lại, camera (hóa đơn, chấm công khuôn mặt), vị trí, thông báo đẩy, QR, tải tệp CSV, in, nút Quay lại của Android, thư đặt lại mật khẩu |
| B8 | Claude soạn, Bạn dán | Hồ sơ cửa hàng: tên (≤ 30 ký tự), mô tả ngắn (≤ 80), mô tả dài, biểu tượng 512, ảnh bìa 1024×500, 4–8 ảnh màn hình điện thoại |
| B9 | Bạn | Khai báo: An toàn dữ liệu, xếp hạng nội dung, đối tượng người dùng, quyền truy cập (tài khoản thử), địa chỉ chính sách và địa chỉ xóa tài khoản |
| B10 | Bạn | Thử **nội bộ** (vài người) → thử **kín** (tài khoản cá nhân: ít nhất 12 người, giữ liên tục 14 ngày; nên mời 15–20 người dùng thật để dư) |
| B11 | Bạn | Xin quyền phát hành chính thức → phát hành dần (ví dụ 20% rồi 100%), theo dõi lỗi |

Công sức: [Claude] khoảng 2–4 phiên; tổng thời gian khoảng 1–2 tuần nếu tài khoản tổ chức, **thêm ít nhất 2–3 tuần** nếu tài khoản cá nhân.

## 4. Giai đoạn C: App Store (iPhone)

Cách làm: **Capacitor**, **đóng tệp app vào trong gói** (không chỉ mở địa chỉ web). Apple từ chối app chỉ là website bọc lại (quy tắc 4.2), nên phải có giá trị dùng tính năng của máy.

| Bước | Ai | Việc |
|---|---|---|
| C1 | Claude | Thêm Capacitor vào `apps/app`; chế độ dựng riêng cho gói gốc (bỏ service worker, bỏ `/quan-tri/`, đóng sẵn mô hình khuôn mặt) |
| C2 | Claude | Thay phần chỉ chạy trên web: cài đặt PWA (ẩn hướng dẫn cài), mở liên kết ngoài, tải/chia sẻ tệp CSV, in/PDF, quét QR |
| C3 | Claude | Tính năng máy: **thông báo đẩy APNs** (sửa `send-push`, thêm bảng lưu mã thiết bị bằng migration mới), camera, vị trí, chia sẻ; xin quyền bằng câu tiếng Việt nói rõ lý do |
| C4 | Claude | Liên kết mở app (Universal Links) cho thư xác nhận, đặt lại mật khẩu |
| C5 | Bạn | Tạo App ID, chứng chỉ, hồ sơ ký, khóa APNs; tạo app trong App Store Connect |
| C6 | Claude + Bạn | Dựng bằng **Xcode 26 / iOS 26 SDK trở lên** (bắt buộc từ 28/04/2026; kiểm lại yêu cầu mới nhất lúc dựng) trên Mac hoặc dịch vụ mây |
| C7 | Bạn + Claude | Thử qua **TestFlight** trên iPhone thật: như B7, đặc biệt dùng khi mất mạng và dữ liệu còn sau khi cập nhật bản mới |
| C8 | Claude soạn, Bạn dán | Tên, phụ đề, từ khóa, mô tả, ảnh màn hình đúng cỡ App Store Connect yêu cầu, nhãn quyền riêng tư |
| C9 | Bạn | Ghi chú cho người duyệt (tiếng Anh): tài khoản thử, cách thử camera và ghi việc offline, giải thích đối tượng là hộ và HTX |
| C10 | Bạn + Claude | Nộp duyệt; nếu bị từ chối, sửa theo đúng điều được nêu rồi nộp lại |

Công sức: [Claude] khoảng 6–10 phiên; thời gian khoảng 3–6 tuần, tính cả một hai lần bị từ chối.

**Lưu ý:** bản iOS đóng gói **không tự cập nhật** như web; sửa giao diện phải dựng và nộp lại. Máy chủ phải tương thích ngược với bản app cũ (thêm cột, hàm thì không phá bản cũ).

## 5. Rủi ro chính và cách chặn

| Rủi ro | Cách xử lý |
|---|---|
| **Cửa hàng cho rằng bán gói ngoài app là lách thanh toán** (cao nhất ở Apple, vì Hộ là khách cá nhân) | Bản cửa hàng không hiện giá, không nút mua, không liên kết. **Việc này giảm rủi ro nhưng không bảo đảm được duyệt.** Ngoại lệ "app đi kèm công cụ web trả phí" (3.1.3(f)) của Apple chỉ nêu vài loại dịch vụ, không gồm loại của ta. Nếu bị từ chối: (a) trình bày là dịch vụ bán cho tổ chức, HTX; hoặc (b) làm mua gói trong app (Apple/Google thu phí) |
| Apple coi là website bọc lại | Đóng tệp trong gói, có đẩy thông báo, camera, offline; nêu rõ trong ghi chú duyệt |
| Dữ liệu khuôn mặt bị hỏi kỹ | Giải thích xử lý trên máy/máy chủ thế nào, thời hạn giữ 60 ngày, xin đồng ý; khai đúng trong nhãn quyền riêng tư (rà lại mã trước khi khai) |
| Mất khóa ký Android | Play App Signing + sao lưu khóa tải lên 2 nơi |
| Đổi tên miền sau phát hành | Chốt tên miền ở mục 1 trước |
| Người đã cài bản PWA cài thêm bản cửa hàng | Android dùng chung dữ liệu trình duyệt; iOS là kho riêng: nhắc gửi hết bản ghi "chờ gửi" ở bản web trước khi chuyển |
| Quy định cửa hàng thay đổi | Đối chiếu trang chính thức ngay trước mỗi lần nộp |

## 6. Chi phí (chưa gồm công làm)

| Khoản | Mức |
|---|---|
| Google Play | 25 USD một lần |
| Apple Developer | 99 USD mỗi năm |
| D-U-N-S | Miễn phí |
| Dựng iOS trên mây | Có hạn mức miễn phí ở một số dịch vụ; vượt thì trả phí (kiểm giá lúc chọn) |
| Tên miền | Theo nhà bán |

## 7. Nguồn quy định (xem lại lúc nộp)

- Google Play, thử kín cho tài khoản cá nhân: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play, mức API mục tiêu: https://developer.android.com/google/play/requirements/target-sdk
- Apple, yêu cầu sắp áp dụng (SDK): https://developer.apple.com/news/upcoming-requirements/
- Apple, quy tắc duyệt (4.2, 3.1, 5.1.1): https://developer.apple.com/app-store/review/guidelines/
