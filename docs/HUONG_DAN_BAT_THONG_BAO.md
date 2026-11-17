# Bật thông báo đẩy (H2 lát 1–2, D182–D183)

Lát 1: bật thông báo trên máy và bấm **Gửi thử**. Lát 2: **bản tin sáng** tự gửi lúc 7 giờ (mục 6). Làm lần lượt:

## 1. Tạo khóa VAPID (một lần)
```bash
npx web-push generate-vapid-keys
```
Lệnh in ra **Public Key** và **Private Key**. Giữ Private Key bí mật (không dán vào chat, không commit).

## 2. Đặt bí mật cho máy chủ (một lần)
Thay ba giá trị bằng của bạn; `VAPID_SUBJECT` là địa chỉ liên hệ của người vận hành, dạng `mailto:email-của-bạn`.
```bash
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... PUSH_CRON_SECRET=<chuỗi ngẫu nhiên dài, tự đặt>
```
`PUSH_CRON_SECRET` chỉ dùng cho bản tin sáng (lát 2); đặt luôn bây giờ cho tiện, và ghi lại để dùng ở mục 6.

## 3. Đẩy migration và triển khai hàm
```bash
npx supabase db push
npx supabase functions deploy send-push
```
Migration mới: 0217 (lát 1), 0218 (lát 2), thứ tự …→ 0216 → 0217 → 0218. Triển khai lại `send-push` sau khi có lát 2.

## 4. Thử
- **Android (Chrome):** mở app → Tài khoản → Thông báo → **Bật thông báo** → cho phép → **Gửi thử**. Thông báo "Thông báo thử: máy này đã nhận được thông báo." phải hiện.
- **iPhone (iOS 16.4 trở lên):** mở app bằng Safari → Chia sẻ → **Thêm vào MH chính** → mở app từ biểu tượng trên Màn hình chính → Tài khoản → Thông báo → Bật → Gửi thử. Mở bằng Safari thường thì app sẽ hướng dẫn thêm vào Màn hình chính.
- Bấm vào thông báo: app phải mở lại.
- Thử **Tắt thông báo**, rồi Gửi thử: không còn nhận.

## 5. Kiểm tra app vẫn chạy như cũ (vì đã đổi service worker)
- Mở app, tắt mạng, mở lại: app vẫn vào được và xem được dữ liệu đã tải.
- Mở `/quan-tri/` (nếu có quyền): vẫn vào trang quản trị bình thường.
- Máy chấm công vẫn tải được mô hình khuôn mặt lần đầu, các lần sau dùng offline.
- Sau khi triển khai bản mới, mở app 1–2 lần: bản mới tự thay (xem dòng "Phiên bản app" ở Tài khoản).

## 6. Bản tin sáng (lát 2)
1. Bật hai tiện ích **pg_cron** và **pg_net** (Supabase → Database → Extensions).
2. Mở `supabase/maintenance/schedule_morning_digest.sql`, thay `<MÃ_DỰ_ÁN>`, `<ANON_KEY>`, `<PUSH_CRON_SECRET>` rồi chạy **một lần** trong SQL Editor.
3. Lịch chạy **mỗi giờ**; mỗi người nhận **một** thông báo gộp vào giờ họ chọn (mặc định 7 giờ sáng, giờ Việt Nam), nếu đã bật thông báo và có việc cần chú ý, ví dụ "🌱 3 việc cây trồng · 💉 1 mũi tiêm · 💳 2 khoản công nợ". Không có gì thì không gửi; không ghi tiền hay tên khách.
4. Người nhận chỉ được nhắc phần mình có quyền xem ở app (nhân viên không bị nhắc công nợ, bảo dưỡng tài sản).
5. Muốn thử ngay: chạy riêng lệnh `net.http_post(...)` trong script một lần. Mỗi người chỉ nhận một bản tin mỗi ngày, nên thử xong hôm nay sẽ không gửi lại; muốn thử lại cùng ngày, xóa dòng của mình trong bảng `push_digest_log`.
6. Tắt bản tin: `select cron.unschedule('morning-digest');`.

Bản tin tính: việc theo kế hoạch hôm nay và trễ (tối đa 15 ngày), mũi tiêm và mốc an toàn đến hạn trong 3 ngày, bảo dưỡng tài sản, công nợ phải trả/phải thu đến hạn trong 3 ngày, giấy phép sắp hết hạn (còn 30, 14, 7, 3, 1, 0 ngày). Mỗi người tự bật/tắt bản tin và chọn giờ nhận (5 đến 21 giờ) ở **Tài khoản → Thông báo → Bản tin buổi sáng**. Ai đã đặt lịch từ trước (chạy 7 giờ một lần) cần **chạy lại script đặt lịch** để đổi sang chạy mỗi giờ, và chạy `db push` migration 0219.

## Giới hạn
Thông báo đẩy không bảo đảm tới nơi (tiết kiệm pin, mất mạng). Nội dung không ghi số tiền hay tên khách vì hiện trên màn hình khóa.
