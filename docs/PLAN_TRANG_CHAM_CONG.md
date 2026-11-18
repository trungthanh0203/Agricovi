# Đề xuất: sắp xếp lại trang Chấm công (chờ duyệt, chưa làm)

Chỉ đổi cách trình bày và đường đi; không đổi dữ liệu, quyền hay quy tắc. Không cần migration.

## 1. Hiện trạng: những gì đang có và vì sao rối

| Mục | Đang có | Vấn đề |
|---|---|---|
| **Hôm nay** | 6 ô số (đang trong ca, đã ra ca, công chờ xác nhận, quên ra ca, ảnh cờ đỏ, giờ công tháng); khung "Cần xử lý" (quên ra ca, người chưa có tổ trưởng); khung "Hôm nay nghỉ"; khung thu gọn "＋ Chấm công cho người làm"; biểu đồ giờ công theo người (đã bỏ) | Việc cần xử lý nằm ở **ba chỗ** (ô số, khung Cần xử lý, tab khác); hai nút làm việc chính (chấm công hộ, ghi nghỉ) bị giấu trong khung thu gọn hoặc ở tab khác; ô "giờ công tháng" không phải của hôm nay |
| **Công** | 3 nút khoảng ngày, ô lọc trạng thái, ô tìm tên, nút xác nhận hàng loạt, bảng công, menu từng dòng, danh sách đề nghị sửa công | Tên tab "Công" khó hiểu; bốn bộ lọc và nút xếp chồng trước khi thấy dữ liệu; đề nghị sửa công nằm lẫn dưới bảng |
| **Nghỉ** | dòng giải thích, nút Ghi nghỉ, khung "Tổng hợp nghỉ năm", bộ lọc tháng/người, bảng | Tổng hợp năm nằm **trên** danh sách tháng, trong khi việc thường làm là ghi nghỉ và xem nghỉ gần đây |
| **Ảnh cần xem** (chủ/quản lý) | ảnh cờ đỏ từ máy chấm công | ổn, chỉ đổi tên cho rõ |

## 2. Đề xuất bố cục mới

Giữ bốn tab nhưng **đổi tên theo việc người dùng làm**, và đưa việc chính lên đầu:

**Tab 1 "Hôm nay"** (một cột, ba khối từ trên xuống)
1. **Hai nút lớn:** `＋ Chấm công hộ` và `＋ Ghi nghỉ` (bấm mở biểu mẫu ngay tại chỗ, không phải tìm trong khung thu gọn).
2. **Cần xử lý** (gộp mọi việc tồn đọng vào MỘT danh sách, mỗi dòng có số lượng và nút "Xem"): công chờ xác nhận · quên ra ca · ảnh cờ đỏ · người chưa có tổ trưởng. Không có việc nào thì hiện dòng xanh "Không có việc cần xử lý".
3. **Tình hình hôm nay:** ba ô số: *Đang trong ca* (x/y người có mặt), *Đã ra ca*, *Nghỉ hôm nay* (bấm mở danh sách tên và lý do). Bỏ ô "Giờ công tháng này" khỏi tab này.

**Tab 2 "Bảng công"** (đổi từ "Công")
- Dòng tóm tắt đầu trang: "Tháng này: N giờ đã xác nhận · M công chờ xác nhận" (nhận ô giờ công tháng từ tab Hôm nay).
- Một hàng lọc gọn: nút khoảng ngày (Hôm nay · 7 ngày · 30 ngày); các bộ lọc còn lại (trạng thái, tìm tên) **gấp vào "Bộ lọc nâng cao"**, tự mở khi mở tab từ một việc cần xử lý.
- Nút "Xác nhận các công hợp lệ" đặt cạnh tóm tắt, chỉ hiện khi có công chờ.
- Bảng giữ nguyên; **"Đề nghị sửa công"** tách thành khung thu gọn có số đếm phía trên bảng.

**Tab 3 "Nghỉ phép"** (đổi từ "Nghỉ")
- Nút `＋ Ghi nghỉ` ở đầu; bộ lọc tháng/người một hàng; bảng nghỉ gần đây.
- **Tổng hợp nghỉ năm** chuyển xuống dưới, vẫn thu gọn.

**Tab 4 "Ảnh cờ đỏ"** (đổi từ "Ảnh cần xem"): giữ nguyên nội dung.

Chung: mỗi tab đúng một nút chính; chữ ngắn, nhất quán ("Chấm công hộ", "Ghi nghỉ", "Xác nhận"); dùng lại `Collapsible` và ô số hiện có nên không thêm kiểu giao diện mới.

## 3. Việc đã làm sẵn
- Bỏ biểu đồ "Giờ công tháng này theo người" khỏi tab Hôm nay (xem theo người ở Báo cáo → Theo nhu cầu → Giờ công và tiền công).

## 4. Cần bạn duyệt
1. Đổi tên tab: Hôm nay · Bảng công · Nghỉ phép · Ảnh cờ đỏ: đồng ý không?
2. Ô "Giờ công tháng này": chuyển thành dòng tóm tắt ở tab Bảng công (đề xuất) hay bỏ hẳn?
3. Hai nút lớn "Chấm công hộ" và "Ghi nghỉ" ở đầu tab Hôm nay: đồng ý không?
