# Hướng dẫn đo hiệu năng (Đợt 0)

Mục đích: có số "trước" (thời gian, dung lượng tải, độ chậm từng màn) với một cơ sở lớn, để chọn đúng việc tối ưu ở các đợt sau (`docs/PLAN_HIEU_NANG.md`). Làm trên **dự án Supabase dùng thử**, không làm trên dự án có người dùng thật.

## 1. Nạp dữ liệu giả (5–15 phút)
Dữ liệu giả nặng khoảng **80–120 MB** (ước tính, gồm chỉ mục). Gói Supabase miễn phí giới hạn 500 MB nên còn chỗ; đo xong nhớ dọn (mục 4). Nhỏ hơn thì đổi `v_scale` thành 0.3.
1. Đã có tài khoản chủ cơ sở đăng ký bằng email trên app (dự án thử).
2. Supabase → SQL Editor → mở nội dung file `supabase/maintenance/seed_load_test.sql`.
3. Sửa 3 dòng ở khối "BẮT ĐẦU CẤU HÌNH": `v_confirm` thành `'TAO-DU-LIEU-THU'`, `v_owner_email` thành email của bạn, `v_part` giữ `0` (chạy tất cả).
4. Bấm Run. Nếu trình soạn thảo báo quá thời gian: chạy **lần lượt** `v_part` = 1, 2, 3, 4, 5, 6 (mỗi lần một số; phần nào đã có dữ liệu sẽ tự bỏ qua, chạy lại không nhân đôi).
5. Xong, đăng nhập app bằng tài khoản đó, mở menu ☰ chọn cơ sở **ZZ_THU_TAI**.

Có: 300 người làm, 10 phân khu, 30 vụ, 1.200 giai đoạn, 20.000 nhật ký, 3.000 thu hoạch, 2.000 lần bán, 6.000 chi phí, 60 vật tư, ~10.000 giao dịch kho, ~85.000 lượt chấm công.

## 2. Đo trên điện thoại thật (tốt nhất điện thoại tầm trung đang dùng thật)
**A. Mở app lần đầu (chưa có dữ liệu trên máy):** gỡ app cài hoặc xóa dữ liệu trang; mở app, đăng nhập, chọn cơ sở ZZ_THU_TAI. Chờ đến khi Trang chủ hiện đủ dữ liệu.
**B. Mở lại app:** tắt hẳn app rồi mở lại; ghi thời gian từ lúc bấm mở đến lúc dùng được (đếm bằng đồng hồ).
**C. Các màn:** với mỗi màn dưới, ghi số giây từ lúc bấm đến lúc hiện đủ nội dung (dưới 1 giây thì ghi "nhanh"):

| Màn | Giây |
|---|---|
| Sản xuất → Chấm công → Hôm nay |  |
| Chấm công → Công |  |
| Sản xuất → Nhật ký việc |  |
| Sản xuất → Quản lý kho (Tồn kho, rồi Báo cáo) |  |
| Sản xuất → Vụ nuôi trồng (mở một vụ) |  |
| Khai báo → Nhân sự |  |
| Báo cáo → Báo cáo tuần |  |
| Báo cáo → Tổng kết vụ |  |

**D. Số đo trong app:** Menu ☰ → **Hỗ trợ & Chia sẻ** → mục **Đo hiệu năng**: bấm **Đồng bộ lại và đo**, chờ xong, rồi bấm **Chép kết quả**.

## 3. Gửi kết quả
Dán nội dung đã chép (mục D), bảng giây ở mục C, và ghi tên điện thoại, mạng đang dùng (Wi-Fi hay 4G) cho tôi. Tôi dùng chúng để xếp thứ tự các đợt tối ưu.

## 4. Dọn dữ liệu thử
Chạy lại script với `v_part` = `99` (vẫn cần `v_confirm` = `'TAO-DU-LIEU-THU'`): xóa toàn bộ cơ sở ZZ_THU_TAI và dữ liệu của nó. Trên điện thoại đã đo: xóa dữ liệu trang để bỏ bản lưu cũ.

## 5. Đo các báo cáo ở máy chủ (Đợt 4)
Chỉ đọc, không ghi/xóa gì. Làm sau khi đã nạp dữ liệu thử (mục 1):
1. Supabase (dự án THỬ) → SQL Editor → dán toàn bộ `supabase/maintenance/measure_reports.sql`.
2. Sửa email ở dòng `v_owner_email` thành email tài khoản chủ cơ sở ZZ_THU_TAI, bấm Run.
3. Chụp/chép bảng kết quả (đã xếp từ chậm đến nhanh; mỗi báo cáo đo 2 lần) gửi lại. Tôi chỉ tối ưu những báo cáo trên 2 giây.
