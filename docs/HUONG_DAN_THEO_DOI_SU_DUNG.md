# Hướng dẫn: Theo dõi hoạt động người dùng (D160)

Trang quản trị nền tảng → **Hoạt động người dùng** cho biết mỗi ngày tài khoản nào đã dùng hệ thống, từ lúc nào đến lúc nào, trên thiết bị nào, ở đâu (IP, vùng) và vào chức năng nào.

## Bật tính năng (một lần)
```bash
npx supabase db push
```
(migration `0190`), rồi triển khai lại **app** và **trang quản trị**. Người dùng mở lại app 1–2 lần để nhận bản mới; số liệu chỉ có **từ lúc bật**, không có lịch sử trước đó.

## Cách ghi nhận
- App gửi ngầm một tín hiệu mỗi ~60 giây khi đang mở và nhìn thấy màn hình (không làm chậm; lỗi hoặc mất mạng thì bỏ qua). Thời gian ở từng màn hình cộng dồn rồi gửi kèm, không ghi từng lần chuyển màn.
- **Phiên** bắt đầu khi mở app (hoặc quay lại sau hơn 30 phút); giờ kết thúc là lần cuối app còn báo, sai số tối đa khoảng 1 phút.
- **Nhiều máy / một tài khoản:** mỗi trình duyệt hoặc app cài có một mã thiết bị riêng, kèm nhãn như "Chrome · Android · SM-A546E · #7F3K" (mã ngắn cuối để phân biệt hai máy giống nhau). Trang hiện từng thiết bị riêng và báo khi tài khoản **dùng cùng lúc nhiều máy**.
- **IP** lấy từ kết nối (do Cloudflare/Supabase gắn vào yêu cầu), **vị trí** là thành phố/quốc gia nếu có, cộng quốc gia và trạm Cloudflare gần nhất do app báo (chỉ mang tính tham khảo; trình duyệt không cho biết tên máy do người dùng đặt).
- Dữ liệu từng phiên giữ **10 ngày**, tổng hợp theo ngày giữ **1 năm**; tự dọn dần.

## Dùng trang
- **Theo tài khoản:** chọn ngày (mặc định hôm nay, tự làm mới mỗi phút). Ô đầu trang: số tài khoản, đang dùng ngay, số phiên, tổng thời gian, lượt đăng nhập, số thiết bị. Bảng sắp xếp theo cột, phân trang 30 dòng, tìm theo tên/email/cơ sở. **Bấm một dòng** để xem các thiết bị, từng phiên (bắt đầu → kết thúc, IP, vùng, phiên bản) và thời gian ở từng chức năng. Có tải CSV.
- **Chức năng được dùng:** chức năng nào được dùng nhiều trong hôm nay / 7 / 30 ngày / 1 năm, bao nhiêu tài khoản.

Chỉ quản trị nền tảng xem được. Không ghi nội dung dữ liệu, số tiền hay vị trí chính xác.
