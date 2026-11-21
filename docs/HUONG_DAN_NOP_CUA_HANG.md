# Hướng dẫn chuẩn bị hồ sơ nộp Google Play và App Store (đợt C, D220)

Phần mã đã có: trang công khai **/chinh-sach** (chính sách bảo mật + điều khoản), **xóa tài khoản trong app** (tab Tài khoản → Xóa tài khoản), trang quản trị **Yêu cầu xóa tài khoản**. Tài liệu này là phần bạn làm tay trước khi nộp. Quy định của Apple/Google đổi theo thời điểm: đối chiếu lại trang chính thức lúc nộp.

## 1. Việc làm trước khi nộp (cần `db push` 0232–0234 và deploy app)
1. Vào Quản trị → Cấu hình → **Thông tin liên hệ**: điền công ty, địa chỉ, điện thoại, Zalo, **email hỗ trợ** (cửa hàng bắt buộc có email liên hệ). Thông tin này hiện cuối trang chính sách.
2. Mở `https://<tên-miền-app>/chinh-sach` kiểm tra hiển thị đúng, đọc lại nội dung (nên nhờ luật sư rà soát) và ghi **đúng đơn vị vận hành**.
3. Thử xóa tài khoản bằng một tài khoản thử: tab Tài khoản → Xóa tài khoản → thấy "đã yêu cầu" → hủy được. Quản trị → Yêu cầu xóa tài khoản → thấy dòng yêu cầu.

## 2. Địa chỉ cần điền khi nộp
- Chính sách bảo mật: `https://<tên-miền-app>/chinh-sach`
- Hướng dẫn xóa tài khoản (Google yêu cầu một địa chỉ web): `https://<tên-miền-app>/chinh-sach#xoa-tai-khoan`

## 3. Tài khoản thử cho người duyệt của cửa hàng
Người duyệt cần vào được app với dữ liệu có sẵn, không bị chặn:
1. Đăng ký một tài khoản bình thường (đăng ký tự duyệt) ví dụ tên cơ sở "Trại Demo", mật khẩu mạnh.
2. Nạp dữ liệu mẫu: `supabase/maintenance/seed_sample_*.sql` (xem hướng dẫn đầu mỗi file) cho cơ sở đó.
3. Quản trị → Cơ sở → **Đổi gói** cho "Trại Demo" sang gói trả phí đủ tính năng với hạn xa (tránh bị khóa chấm công/xuất tệp và không hết hạn trong lúc duyệt).
4. Ghi số điện thoại + mật khẩu vào ô "ghi chú cho người duyệt" của Google Play Console và App Store Connect. **Không** đưa vào tài liệu công khai.

## 4. Khai báo dữ liệu (Data safety của Google, Privacy nutrition label của Apple)
Khớp với trang chính sách: tên, số điện thoại/email, thông tin tài chính do người dùng tự nhập (chi phí, doanh thu: là dữ liệu nghiệp vụ, không phải thẻ/ngân hàng), ảnh, (tùy chọn) dữ liệu khuôn mặt cho chấm công, vị trí khi dùng chức năng bản đồ/chấm công, nhật ký sử dụng. Mục đích: vận hành ứng dụng. **Không bán, không dùng cho quảng cáo, không theo dõi chéo ứng dụng.** Dữ liệu mã hóa khi truyền; người dùng yêu cầu xóa được.

## 5. Thanh toán trong bản trên cửa hàng
Gói trả phí hiện bán bên ngoài app (liên hệ, chuyển khoản). Cửa hàng có quy định riêng về bán nội dung số trong app: để an toàn, bản đưa lên cửa hàng **không nên hiện giá và nút đặt mua gói**, chỉ có thông tin liên hệ. Đây là việc **chưa làm trong mã** (đợt D, khi đóng gói bản cửa hàng sẽ ẩn mục "Các gói đăng ký của Acovin" ở bản cửa hàng); cần đối chiếu quy định lúc nộp.

## 6. Đóng gói (đợt D)
- **Google Play (làm trước):** gói PWA thành ứng dụng Android (Trusted Web Activity / Bubblewrap). Cần tài khoản nhà phát triển (phí một lần ~25 USD), khóa ký, tệp `assetlinks.json` đặt ở tên miền của app. Cần ảnh chụp màn hình, biểu tượng, mô tả tiếng Việt.
- **App Store:** bọc bằng Capacitor; Apple từ chối ứng dụng chỉ là website bọc lại, nên cần dùng tính năng của máy (thông báo đẩy, camera chụp hóa đơn/chấm công). Tài khoản nhà phát triển 99 USD/năm; tài khoản **tổ chức** cần mã D-U-N-S (vài tuần). Cần máy Mac để dựng và nộp bản.
- Trong lúc chờ duyệt, người dùng iPhone vẫn dùng bản web (Thêm vào MH chính).
