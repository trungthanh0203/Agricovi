# Bật thông báo đẩy (H2 lát 1, D182)

Lát 1 chỉ dựng đường ống: bật thông báo trên máy và bấm **Gửi thử**. Chưa có thông báo tự sinh (lát 2: bản tin sáng). Làm lần lượt:

## 1. Tạo khóa VAPID (một lần)
```bash
npx web-push generate-vapid-keys
```
Lệnh in ra **Public Key** và **Private Key**. Giữ Private Key bí mật (không dán vào chat, không commit).

## 2. Đặt bí mật cho máy chủ (một lần)
Thay ba giá trị bằng của bạn; `VAPID_SUBJECT` là địa chỉ liên hệ của người vận hành, dạng `mailto:email-của-bạn`.
```bash
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
```

## 3. Đẩy migration và triển khai hàm
```bash
npx supabase db push
npx supabase functions deploy send-push
```
Migration mới: 0217 (thứ tự …→ 0216 → 0217).

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

## Giới hạn
Thông báo đẩy không bảo đảm tới nơi (tiết kiệm pin, mất mạng). Nội dung không ghi số tiền hay tên khách vì hiện trên màn hình khóa.
