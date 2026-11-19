# Phương án: Bảng chấm công giấy: in mẫu (lớp C) rồi nhập theo mẫu (lớp A) (chờ duyệt, chưa làm)

Thay thế thứ tự trong `PLAN_NHAP_CONG_TU_ANH.md` (A → C → B) bằng **C → A → B**, theo yêu cầu: có bảng giấy chuẩn từ đầu, kỳ bảng **từ ngày đến ngày**, kèm ghi chú cách ghi; sau đó nhập số liệu **dựa trên chính bảng đã in**. Lớp B (đọc ảnh bằng AI) để sau và sẽ chính xác hơn nhờ bảng đã biết trước người, ngày, ký hiệu.

## 1. Ý tưởng cốt lõi: "bảng đã phát hành" được lưu lại

In bảng không chỉ là in ra giấy: lúc bấm In, hệ thống **lưu một bản chụp của bảng** (mã bảng, kỳ từ-đến, danh sách người theo thứ tự đã in, ca mặc định, kiểu ghi). Nhờ đó:
- Khi nhập (lớp A), chọn đúng bảng thì lưới dựng sẵn **đúng người, đúng ngày, đúng ký hiệu, đúng ca**, không phải chọn lại.
- Bảng in ra và bảng trên màn hình luôn khớp từng hàng, kể cả khi sau đó có người nghỉ việc hoặc đổi tên.
- Theo dõi được bảng nào đã in mà **chưa nhập**; sau này lớp B có mã bảng (QR) để ghép ảnh chụp với đúng bảng.

## 2. Lớp C: In bảng chấm công

### 2.1 Chỗ đặt trong app
Thêm tab **"Bảng giấy"** ở Chấm công (Bảng công · **Bảng giấy** · Nghỉ phép · Ảnh cờ đỏ), gom cả quy trình giấy vào một nơi, không làm hàng nút của Bảng công đông thêm:
- Nút **＋ Tạo bảng mới**.
- Danh sách bảng đã in (mới nhất trước): mã, kỳ, số người, trạng thái **Chưa nhập / Đã nhập**; mỗi dòng có **In lại**, **Nhập số liệu** (lớp A), **Đánh dấu đã nhập xong**.

### 2.2 Màn tạo bảng
| Ô | Nội dung |
|---|---|
| **Từ ngày – Đến ngày** | chọn ngày bất kỳ (không theo tuần); tối đa **31 ngày** một bảng; có nút nhanh: "7 ngày gần nhất", "Tuần này", "Nửa tháng", "Cả tháng" chỉ để điền sẵn hai ô ngày |
| **Người** | chọn theo **tổ** (tích nhiều tổ) hoặc "Tất cả người đang làm"; tích bỏ từng người; gồm cả người không có tài khoản; thứ tự theo tổ rồi theo tên |
| **Kiểu ghi** | *Đánh dấu ca* (ghi ✓ ½ P Ô V K: hợp nơi làm ca cố định) hoặc *Ghi số giờ* (ghi số giờ làm mỗi ngày: hợp nơi giờ làm thay đổi) |
| **Ca mặc định** | giờ vào, giờ ra, nghỉ giữa ca (ví dụ 07:30 – 17:00, nghỉ 60 phút); nhớ lại lần sau; in lên đầu bảng |
| **Tùy chọn in** | mỗi tổ một trang · tô nền chủ nhật · thêm cột Ghi chú |
| **Xem trước** | bấm để xem đúng trang sẽ in |

Tổ trưởng chỉ tạo được bảng cho **người trong tổ mình**; chủ và quản lý cho mọi người.

### 2.3 Trang in (A4 ngang)
- **Đầu bảng:** tên cơ sở · "BẢNG CHẤM CÔNG" · Từ dd/mm/yyyy đến dd/mm/yyyy · Tổ · **mã bảng** (ví dụ `BC-2611-0007`) và mã QR chứa mã bảng.
- **Thân bảng:** STT · Họ tên · **một cột mỗi ngày** (số ngày + thứ T2…CN, chủ nhật tô nền) · Tổng (ngày công hoặc giờ) · Ghi chú. Ô cao đủ để viết tay; tiêu đề lặp lại khi bảng sang trang mới.
- **Chân bảng:** chỗ ký *Người lập* và *Chủ/Quản lý duyệt*, ngày nhập vào hệ thống.
- **Khung "Cách ghi" (in ngay trên bảng)**, ví dụ:
  - Ca làm: 07:30 – 17:00, nghỉ giữa ca 60 phút.
  - **✓** đi làm đủ ca · **½** làm nửa ca · **P** nghỉ phép năm · **Ô** nghỉ ốm · **V** nghỉ việc gia đình · **K** nghỉ không lương / không báo trước · **–** không làm việc ngày đó (nghỉ tuần, không có việc).
  - Kiểu *Ghi số giờ*: ghi tổng số giờ làm cả ngày, ví dụ `8` hoặc `6,5` (kể cả giờ làm thêm); nghỉ thì ghi P, Ô, V, K như trên.
  - Ghi bút mực, chữ số rõ ràng, mỗi ô một ký hiệu; ghi sai thì gạch một đường rồi viết lại bên cạnh, không viết đè.
  - Ô trống nghĩa là **chưa ghi**, khác với "–".
  - Đủ ngày thì cộng cột Tổng; nộp bảng cho chủ/quản lý khi hết kỳ.
- Dùng chức năng in của trình duyệt (cũng lưu được PDF); không cần máy chủ để dựng trang in.

### 2.4 Dữ liệu và quyền (migration mới `app_timesheet_sheets`)
- Bảng `timesheet_sheets`: mã bảng, cơ sở, từ ngày, đến ngày, kiểu ghi (`shift` | `hours`), ca mặc định (giờ vào, giờ ra, phút nghỉ), danh sách người đã in (mã người + tên + tổ, đúng thứ tự), trạng thái (`printed` | `entered`), người tạo, thời điểm.
- Hàm `create_timesheet_sheet(...)`: kiểm quyền (chủ/quản lý; tổ trưởng chỉ người trong tổ), kỳ ≤ 31 ngày, ≤ 200 người; tạo mã bảng tuần tự theo cơ sở và tháng; bấm lặp (mã tạo ở thiết bị) không tạo trùng. Hàm đánh dấu đã nhập. Chỉ ghi qua hàm; đọc theo quyền xem chấm công.
- Cần mạng.

## 3. Lớp A: Nhập số liệu theo bảng đã in

### 3.1 Cách dùng
Ở tab Bảng giấy bấm **Nhập số liệu** trên một bảng → màn nhập dựng sẵn từ bảng đó:
- Lưới giống hệt tờ giấy (cùng thứ tự người, cùng cột ngày), kèm khung "Cách ghi" thu gọn.
- **Mỗi ô là một ô gõ chữ**, gõ y như trên giấy: `x` hoặc `1` = ✓, `0,5` = ½, số giờ (kiểu ghi giờ), `p` `o` `v` `k` = P Ô V K, `-` = không làm; ký hiệu sai bị tô đỏ ngay. Trên điện thoại ô nhận bàn phím số/chữ cái phù hợp.
- **Điền nhanh theo hàng:** "✓ cho mọi ngày trừ chủ nhật" rồi sửa các ô khác.
- Ô đã có công (từ máy chấm công hoặc nhập trước) hiện khóa "đã có", không ghi đè; muốn sửa thì dùng bảng công.
- Có thể nhập dở rồi lưu: bấm **Lưu** nhiều lần (các ô đã ghi tự khóa); xong thì **Đánh dấu đã nhập xong**.
- Có **cột Tổng** tính ngay để đối chiếu với tổng ghi tay trên giấy.

### 3.2 Máy chủ làm gì (migration `app_timesheet_entry`)
Hàm `record_timesheet(mã bảng, các ô)`: **máy chủ tự suy ra giờ** từ cấu hình của bảng, app không gửi giờ:
- ✓ → ca mặc định (giờ vào – giờ ra, trừ nghỉ giữa ca); ½ → nửa số phút của ca; số giờ → giờ vào + số giờ (+ nghỉ giữa ca nếu qua giờ nghỉ, sẽ chốt khi làm).
- P, Ô, V, K → **ghi nghỉ** (`worker_absences`: phép năm, ốm, việc gia đình, không lương/không báo trước) cho đúng ngày.
- Mỗi ô có **mã xác định** từ (bảng, người, ngày) nên gửi lặp không nhân đôi; công trùng giờ hoặc ngày đã có ghi nghỉ thì bỏ ô đó và báo; kỳ lương khóa thì bỏ ô và báo; người không có trong bảng hoặc ngày ngoài kỳ bị từ chối.
- Quyền và trạng thái như **Ghi công** hiện nay: chủ nhập thì công **xác nhận luôn**, quản lý/tổ trưởng nhập thì chờ xác nhận; ghi chú ca "Bảng BC-xxxx"; một dòng nhật ký kiểm toán cho cả lô.
- Trả về số ô đã ghi, số ô bỏ qua kèm lý do.

## 4. Quy tắc chung
- Công từ bảng giấy dùng **ca mặc định hoặc số giờ** vì giấy không có giờ vào/ra cụ thể; ghi chú ca nói rõ nguồn.
- Không tự nối vào phiếu lương; công vẫn đi qua bước xác nhận như hiện nay.
- Gói dùng thử khóa mục này cùng nhóm Chấm công.
- Lớp B (đọc ảnh bảng bằng AI) làm sau: nhờ bảng đã phát hành, AI biết trước người, ngày, ký hiệu nên chỉ việc nhận dạng ký hiệu trong từng ô, và kết quả điền thẳng vào màn nhập của lớp A.

## 5. Công sức và thứ tự
1. **Lớp C** khoảng 1 tuần: migration + hàm tạo bảng + test; tab Bảng giấy; màn tạo bảng; trang in và xem trước.
2. **Lớp A** khoảng 1 tuần: migration + hàm nhập + test (ca, nửa ca, giờ, nghỉ, trùng, kỳ khóa, quyền, bấm lặp); màn nhập lưới.
3. Sau đó mới xét lớp B, cần vài ảnh bảng thật đã in từ lớp C để thử.

## 6. Cần bạn duyệt
1. Tab mới **"Bảng giấy"** gom cả in bảng và nhập số liệu: đồng ý không?
2. Tối đa **31 ngày** một bảng (dài hơn thì tạo nhiều bảng): đồng ý không?
3. Bộ ký hiệu **✓ ½ số giờ P Ô V K –** và hai kiểu ghi (đánh dấu ca / số giờ): có cần thêm hoặc bớt ký hiệu nào không?
4. **Tổ trưởng** được tạo bảng và nhập số liệu cho người trong tổ mình: đồng ý không?
5. Chủ nhập từ bảng thì công **xác nhận luôn** (như Ghi công hiện nay), quản lý/tổ trưởng thì chờ xác nhận: đồng ý không?
