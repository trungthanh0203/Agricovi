# Đề xuất: nhập công từ bảng chấm công giấy (chờ duyệt, chưa làm)

Bối cảnh: nhiều cơ sở chấm công trên **bảng giấy** (tổ trưởng hoặc người làm tự đánh dấu hằng ngày), cuối tuần chủ/quản lý mới nhập vào hệ thống. Cần giảm công nhập tay mà không làm sai tiền công.

## 1. Những gì hệ thống đã có để dùng lại

| Có sẵn | Dùng cho việc này |
|---|---|
| `record_shift` (chủ/quản lý/tổ trưởng ghi một ca đã làm; UUID tạo ở thiết bị; chủ ghi thì xác nhận luôn) | Nền để ghi công; chỉ thiếu bản ghi **hàng loạt** |
| Edge Function `scan-invoice` (đọc ảnh bằng Cloudflare Workers AI, trả **bản nháp**, không lưu ảnh, có hạn mức tháng theo gói, giới hạn tốc độ) | Thêm loại đọc mới `timesheet`, dùng chung hạn mức và hạ tầng |
| `worker_absences` (ghi nghỉ: phép, ốm…) | Ô "P/Ô" trên bảng giấy thành ghi nghỉ |
| Danh sách người làm, tổ, quyền theo tổ trưởng | Hàng của bảng; tổ trưởng chỉ thấy người trong tổ |
| `ImagePicker`/`prepareImage` (thu nhỏ ảnh trên máy) | Chụp/chọn ảnh bảng |

## 2. Nói thẳng về độ chính xác

Đọc **chữ viết tay trên lưới nhiều cột** bằng AI là việc khó: bảng tháng 31 cột, chữ viết khác nhau, ảnh nghiêng/thiếu sáng dễ đọc sai ô. Công là **tiền lương**, nên:
- Kết quả AI luôn là **bản nháp**, chủ **phải xem và bấm xác nhận** từng bảng; ô nghi ngờ được tô màu.
- Không có AI thì cách nhập vẫn phải nhanh. Vì vậy làm **nhập theo bảng** trước, AI chỉ là lớp điền sẵn.
- Bảng giấy theo **mẫu do app in ra** (có sẵn tên người, ô to, có mã QR kỳ bảng) đọc chính xác hơn hẳn bảng tự kẻ, vì mô hình biết trước hàng, cột và tên.

## 3. Phương án đề xuất (3 lớp, làm lần lượt)

### Lớp A: Nhập công theo bảng (không cần AI), làm trước
Trong Chấm công → nút **＋ Ghi công** có hai kiểu: *Một ca* (như hiện nay) và **Theo bảng**:
- Chọn **tuần** (hoặc nửa tháng) và **tổ** (hoặc tất cả).
- Phía trên đặt **ca mặc định** của cơ sở: giờ vào, giờ ra, nghỉ giữa ca (ví dụ 07:30–17:00, nghỉ 60 phút), nhớ lại lần sau.
- Lưới: hàng = người, cột = ngày. Mỗi ô một chạm: **✓ đủ ca** · **½ nửa ca** · **số giờ** (gõ 6.5) · **P nghỉ phép** · **Ô nghỉ ốm** · trống = không ghi. Ô đã có công (kể cả từ máy chấm công) hiện khóa "đã có", không ghi đè.
- Bấm **Lưu** một lần: tạo các ca cho những ô đã đánh dấu. Ca ✓ dùng ca mặc định; ca theo số giờ lấy giờ vào mặc định + số giờ; ô P/Ô tạo **ghi nghỉ** (có hưởng lương theo loại).
- Hàm máy chủ mới `record_shifts_bulk` (một lệnh, nhiều ca): idempotent theo mã tạo ở thiết bị, kiểm trùng giờ, kỳ lương khóa thì bỏ ô đó và báo; quyền như `record_shift` (chủ xác nhận luôn, quản lý/tổ trưởng chờ xác nhận); ghi chú ca "Nhập từ bảng giấy"; nhật ký kiểm toán một dòng cho cả lô.
- Cần mạng.

### Lớp B: Đọc ảnh bảng giấy điền sẵn lưới (AI)
- Trong màn Theo bảng: nút **📷 Đọc từ ảnh bảng giấy** (1–3 ảnh). App thu nhỏ ảnh rồi gửi `scan-invoice` với loại `timesheet`, **kèm danh sách người trong lưới và tuần đã chọn** để mô hình ghép đúng hàng.
- Kết quả **điền vào lưới lớp A**; ô AI không chắc tô vàng; tên không ghép được liệt kê "chưa khớp, chọn người". Chủ sửa rồi bấm Lưu như lớp A. **Ảnh không được lưu** (giống đọc hóa đơn, D158).
- Dùng **chung hạn mức đọc ảnh theo gói** (mỗi ảnh một lượt); gói dùng thử vẫn khóa (nhóm Chấm công).

### Lớp C: In mẫu bảng chấm công của cơ sở
- Nút **🖨 In bảng chấm công tuần/tháng**: trang in sẵn tên người (theo tổ), cột ngày, ô to, chú thích ký hiệu (✓ ½ P Ô), tiêu đề cơ sở và kỳ.
- Cơ sở dùng mẫu này thì lớp B đọc chính xác hơn và lớp A nhanh hơn. Không cần máy chủ.

## 4. Quy tắc chung
- Mọi thứ AI đọc ra chỉ là bản nháp; **không tự lưu**.
- Bảng giấy không có giờ vào/ra cụ thể nên công tạo ra theo **ca mặc định hoặc số giờ**; chủ chịu trách nhiệm khớp thực tế (ghi chú ca nói rõ nguồn).
- Không nối vào phiếu lương mới: công vẫn đi qua xác nhận như hiện nay.
- Ảnh bảng giấy có thể chứa họ tên người làm: không lưu ảnh trên máy chủ (theo đúng cách đọc hóa đơn hiện nay).

## 5. Công sức và thứ tự
1. **Lớp A**: khoảng 1 tuần (hàm hàng loạt + test, lưới nhập, ca mặc định).
2. **Lớp C**: nửa ngày đến 1 ngày (trang in).
3. **Lớp B**: khoảng 1 tuần (loại đọc `timesheet`, ghép tên, tô ô nghi ngờ, thử trên vài bảng thật để chỉnh lời nhắc). Cần **vài ảnh bảng chấm công thật** của khách để thử, nếu không độ chính xác chỉ là ước đoán.

## 6. Cần bạn quyết
1. Đồng ý làm theo thứ tự **A → C → B** không?
2. **Ca mặc định**: một ca cho cả cơ sở (đề xuất) hay mỗi tổ một ca riêng?
3. Bộ ký hiệu ô: ✓ ½ số giờ P Ô (đề xuất): thêm/bớt ký hiệu nào cho khớp bảng giấy các cơ sở của bạn?
4. Công tạo từ bảng: chủ nhập thì **xác nhận luôn** (như Ghi công hiện nay) hay luôn chờ xác nhận?
5. Bạn có sẵn vài ảnh bảng chấm công giấy thật để thử lớp B không?
