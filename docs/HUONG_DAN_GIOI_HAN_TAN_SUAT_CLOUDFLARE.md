# Giới hạn tần suất truy cập ở Cloudflare (chống dồn tải, robot, dò mật khẩu)

Mục đích: chặn một địa chỉ IP gửi quá nhiều yêu cầu vào các trang tốn tài nguyên (tìm kiếm, báo giá, liên hệ, đăng ký, đăng nhập, ảnh) **trước khi** yêu cầu chạm tới website và cơ sở dữ liệu. Làm trên bảng điều khiển Cloudflare, **không cần sửa mã, không cần deploy**. Làm một lần, mất khoảng 10 phút.

> Ghi chú: giao diện Cloudflare đổi tên menu khá thường xuyên; nếu không thấy đúng chữ, tìm mục có tên gần giống (Security → WAF → Rate limiting rules).

## 0. Chuẩn bị

- Tên miền `agricovi.com` phải đang **dùng DNS của Cloudflare** (như đã gắn ở `TRIEN_KHAI_TEN_MIEN.md`), và bản ghi trỏ vào website phải **bật đám mây cam (Proxied)**. Nếu đám mây xám thì Cloudflare không chặn được gì.
- Biết gói Cloudflare đang dùng (Free, Pro…). Số quy tắc được tạo phụ thuộc gói: **gói Free thường chỉ được 1 quy tắc giới hạn tần suất**, với khoảng đếm 10 giây và chặn 10 giây. Gói trả phí được nhiều quy tắc hơn và chọn được khoảng đếm dài hơn. Xem số quy tắc còn lại ngay trong trang tạo quy tắc.

## 1. Quy tắc cho các trang nhạy cảm (làm trước, gói Free cũng làm được)

1. Vào [dash.cloudflare.com](https://dash.cloudflare.com), chọn tên miền **agricovi.com**.
2. Menu trái: **Security → WAF → Rate limiting rules** (có thể hiện là **Security → Security rules**). Bấm **Create rule**.
3. **Rule name:** `Gioi han trang nhay cam`.
4. **If incoming requests match…** chọn **Edit expression** và dán (đã gồm cả bản tiếng Anh `/en/…`):

```
(http.request.uri.path contains "/tim-kiem") or (http.request.uri.path contains "/bao-gia") or (http.request.uri.path contains "/lien-he") or (http.request.uri.path contains "/dang-ky") or (http.request.uri.path contains "/dang-nhap") or (http.request.uri.path contains "/quen-mat-khau")
```

5. **With the same characteristics:** chọn **IP** (đếm theo địa chỉ IP người truy cập).
6. **When rate exceeds:**
   - Requests: **10**
   - Period: **10 seconds** (gói Free chỉ có lựa chọn này)
7. **Then take action:** **Block**; **Duration:** 10 seconds (gói Free) hoặc 1 phút/10 phút nếu gói cho phép.
8. Bấm **Deploy**.

Ý nghĩa: một IP gửi quá 10 yêu cầu vào các trang trên trong 10 giây sẽ bị chặn tạm 10 giây. Người dùng thật hiếm khi vượt ngưỡng này; robot và công cụ quét thì bị chặn liên tục.

## 2. Quy tắc riêng cho ảnh `/anh/…` (chỉ khi gói cho phép thêm quy tắc)

Một trang có thể tải nhiều ảnh cùng lúc nên ngưỡng phải cao hơn.

- **Rule name:** `Gioi han anh`
- **Expression:** `(starts_with(http.request.uri.path, "/anh/"))`
- **Characteristics:** IP; **Requests:** 100; **Period:** 10 giây (hoặc 1 phút nếu có, ví dụ 300 yêu cầu)
- **Action:** Block (hoặc **Managed Challenge** nếu gói cho phép)

Gói Free chỉ có 1 quy tắc: **đừng thêm ảnh vào quy tắc ở mục 1** (ngưỡng 10 sẽ chặn nhầm người đang xem trang có nhiều ảnh). Ảnh đã có bộ nhớ đệm ở biên nên rủi ro thấp; để dành quy tắc này khi nâng gói.

## 3. Bật thêm chống robot (miễn phí)

- **Security → Bots → Bot Fight Mode: Bật.** Chặn bớt robot đã biết, không ảnh hưởng người thật và công cụ tìm kiếm như Google.
- (Tùy chọn) **Security → Settings → Security level: Medium.**

## 4. Kiểm tra quy tắc có hoạt động không

1. Mở trang `https://agricovi.com/tim-kiem/?q=gao` rồi tải lại liên tục nhanh (giữ phím F5 khoảng 10 giây).
2. Khi vượt ngưỡng, trang hiện thông báo chặn của Cloudflare (trang trắng có chữ "blocked" hoặc "Sorry, you have been blocked"). Đợi hết thời gian chặn thì vào lại bình thường.
3. Xem lịch sử: **Security → Events**, lọc theo tên quy tắc. Nếu thấy chặn nhầm người thật thì **tăng ngưỡng** (ví dụ 20 yêu cầu/10 giây) rồi lưu lại.

## 5. Lưu ý quan trọng

- **Đăng nhập và đăng ký chạy thẳng tới Supabase**: trang `/dang-nhap`, `/dang-ky` chỉ là giao diện, còn việc kiểm tra mật khẩu do Supabase xử lý. Quy tắc ở Cloudflare chỉ chặn việc tải trang, **không** chặn được việc thử mật khẩu gọi thẳng vào Supabase. Để chặn phần đó, vào Supabase: **Authentication → Rate Limits** (hoặc **Settings → Auth**) và giữ mặc định hoặc siết chặt các giới hạn đăng nhập, đăng ký, gửi email.
- **Yêu cầu báo giá và liên hệ** (gửi bằng POST vào chính website) **được** quy tắc ở mục 1 bảo vệ.
- Nếu bạn dùng chung mạng công ty/quán (nhiều người cùng một IP), ngưỡng 10 yêu cầu/10 giây vẫn đủ rộng cho việc dùng bình thường.
- Bộ nhớ đệm 60 giây ở biên của website vẫn là lớp bảo vệ chính cho trang công khai; quy tắc ở đây chỉ bổ sung cho các trang **không** lưu đệm được (tìm kiếm với từ khóa lạ, biểu mẫu).
- Không dùng chuỗi `contains` quá chung (ví dụ chỉ `"/"`) vì sẽ chặn cả trang chủ.

## 6. Đã làm trong mã (không cần bạn làm gì)

- Trang **404** nay được lưu đệm ở biên tối đa **30 giây**, nên người quét các địa chỉ lạ liên tục không còn dồn từng lượt vào cơ sở dữ liệu. Trang 200 giữ như cũ.
