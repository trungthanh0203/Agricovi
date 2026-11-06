# Đề xuất: nhiều vụ song song trong cùng một ô sản xuất (theo diện tích) và các trường bắt buộc khi tạo vụ

Trạng thái: **ĐỀ XUẤT, chờ chủ sản phẩm duyệt** (7/11/2026). Chưa viết code.

## 1. Tình huống và vì sao quan trọng

Trong thực tế một ô sản xuất (nhà màng, vườn, chuồng, ao) thường chạy **2–3 vụ cùng lúc**, mỗi vụ chỉ chiếm **một phần diện tích** (ví dụ nhà màng 1.000 m²: dưa lưới 400 m² + dưa leo 300 m² + ớt 300 m²; hoặc hai lứa heo ở hai ngăn chuồng). Hiện app coi một ô gần như có **một vụ tại một thời điểm**:
- Không có ràng buộc ở CSDL chặn tạo nhiều vụ trong một ô, **nhưng** màn Tạo vụ luôn nhắc "ô đang có vụ chạy", gợi ý "trống chuồng 7 ngày", và chỉ có cách xử lý riêng cho **chuẩn bị 1 phần ô** (`prep_mode = part`) và **nối tiếp** (`follows_cycle_id`).
- Diện tích của vụ (`planted_area_m2`) đang **không bắt buộc** và **không được so với diện tích ô**, nên không biết ô còn trống bao nhiêu, và các chỉ số theo diện tích (năng suất, chi phí, lãi theo 1.000 m²) hay thiếu.

## 2. Các tình huống đã có và nhận định: gộp được về một mô hình

| Tình huống | Hiện nay | Có gộp được không |
|---|---|---|
| Nhiều vụ song song trong một ô (mới) | Chưa hỗ trợ rõ | **Là trường hợp gốc của mô hình mới** |
| Chuẩn bị trong 1 phần ô (`prep_mode = part`) | Lựa chọn riêng, vụ Chuẩn bị nhưng ghi việc được | **Gộp**: vụ mới chiếm phần diện tích trống nên chuẩn bị song song là chuyện bình thường; không cần lựa chọn "1 phần" riêng |
| Nhà chuẩn bị riêng (`prep_mode = separate`) | Chuẩn bị ở ô khác | Giữ (khác ô, khác vị trí) |
| Nối tiếp sau vụ (`follows_cycle_id`) | Chờ vụ trước kết thúc | Giữ, dùng khi ô **hết chỗ** |
| Trống chuồng tối thiểu 7 ngày | Cảnh báo mỗi khi ô có vụ chạy | **Thu hẹp**: chỉ cảnh báo khi vụ mới dùng **cả ô** (nhập-xuất đồng loạt), không cảnh báo khi vụ chỉ dùng một phần |
| Hạn mức gói theo số vụ | Mỗi vụ đang chạy/tạm dừng tính một vụ | Giữ nguyên: vụ song song **mỗi vụ tính một** |
| Bắt đầu vụ giữa chừng (GĐ1 vừa làm) | Độc lập | Hoạt động cùng mô hình mới |
| Trồng xen (hai cây trên cùng diện tích) | Chưa có | Hỗ trợ bằng ô tích "trồng xen" (bỏ qua kiểm tra chỗ trống) |

**Mô hình thống nhất đề xuất:** *"Mỗi vụ chiếm một phần của ô, tính theo diện tích (và số lượng) trong một khoảng thời gian"*. Ô có sức chứa (diện tích ô). Tổng diện tích các vụ đang chạy cùng lúc trong ô không vượt sức chứa (trừ trồng xen). Mọi trường hợp trên chỉ là biến thể của quy tắc này, nên bỏ bớt lựa chọn phức tạp ở màn Tạo vụ.

## 3. Giải pháp

### 3.1 Trường bắt buộc khi tạo vụ (theo yêu cầu)
- **Tên vụ: bắt buộc** (bỏ chữ "không bắt buộc"). App **gợi ý sẵn** theo mẫu "<Sản phẩm> · <Ô> · đợt N" (người dùng sửa được) để không phải gõ lại.
- **Giống, diện tích, số lượng: bắt buộc** (bỏ chữ "không bắt buộc" và không còn thu gọn). Giống có thể ghi "Chưa rõ giống" nếu thật sự không biết. Với vật nuôi: giống/loại, diện tích chuồng/ao, số con.
- **Ngày gieo, ngày trồng: giữ tùy chọn**, nằm trong mục thu gọn nhỏ.
- **Ép ở CSDL** (đúng nguyên tắc dự án): các hàm tạo vụ (`create_cycle_from_template`, `create_cycle_midstart`) nhận thêm tên, giống, diện tích, số lượng và **từ chối nếu thiếu** (tên ≥ 2 ký tự, giống không rỗng, diện tích > 0, số lượng > 0). Vụ cũ đã có không bị đụng; vụ cũ thiếu thông tin sẽ có nhắc bổ sung ở Chi tiết vụ khi sửa.

### 3.2 Chỗ trống của ô
Hàm mới `area_free_m2(p_area, p_from, p_to, p_exclude_cycle)` trả về: diện tích ô, danh sách vụ đang chiếm chỗ trong khoảng thời gian (tên, diện tích, ngày dự kiến xong), và **diện tích trống nhỏ nhất trong khoảng đó** (tính theo ngày bắt đầu đến ngày dự kiến kết thúc của vụ mới, vụ đã kết thúc/hủy không tính, vụ chưa khai diện tích tính 0 và có nhãn "chưa khai").

Màn Tạo vụ, ngay sau khi chọn ô, hiện khung:
> Ô *Nhà màng 1* rộng 1.000 m². Đang có 2 vụ: Dưa lưới A 400 m² (đến 20/12), Dưa leo B 300 m². **Còn trống 300 m²**. [Dùng phần trống]

Ô diện tích vụ có nút nhanh **"Dùng phần trống"** và **"Cả ô"**. Nếu nhập vượt chỗ trống: **cảnh báo rõ** ("Vượt 80 m² so với chỗ trống. Nếu trồng xen hãy tích 'Trồng xen'") và cho **chủ cơ sở xác nhận tạo vẫn tạo**; không chặn cứng vì diện tích ô khai có thể chưa chính xác. Vụ tạo vượt được đánh dấu để nhắc xem lại.
- Ô chưa khai diện tích: khung cho **nhập diện tích ô ngay tại chỗ** (một ô nhập, lưu về Phân khu) thay vì bỏ qua kiểm tra.
- Danh sách ô trong Khai báo và Sản xuất hiện **thanh chiếm chỗ** (đang dùng X/Y m², n vụ).

### 3.3 Đơn giản hóa màn Tạo vụ
- Bỏ lựa chọn "Chuẩn bị trong 1 phần ô sản xuất"; vụ nào chiếm phần trống thì chuẩn bị song song bình thường. Giữ "Nơi chuẩn bị riêng" và "Nối tiếp sau vụ".
- Bỏ câu nhắc "ô đang có vụ chạy" chung chung; thay bằng khung chỗ trống ở 3.2. Cảnh báo "trống chuồng 7 ngày" chỉ khi vụ dùng cả ô (diện tích ≥ ~ 95% ô, hoặc người dùng chọn "Cả ô").
- Thứ tự màn: Sản phẩm → Quy trình → Ô (hiện chỗ trống) → Tên vụ → Giống / Diện tích / Số lượng → Ngày bắt đầu → (mục thu gọn: ngày gieo, ngày trồng, kế hoạch, bắt đầu giữa chừng, nối tiếp).

### 3.4 Dữ liệu và tương thích
- Không cần cột mới cho diện tích (dùng `planted_area_m2`, `plant_count`); thêm cờ `intercrop boolean` (trồng xen) và `over_capacity boolean` (tạo khi vượt chỗ trống, đã xác nhận).
- Phân khu có nhiều nhà màng con: chỗ trống tính **theo ô sản xuất** (cấp thấp nhất tạo vụ được), khớp `areaSizeM2` hiện có.
- Vụ cũ thiếu diện tích: không chặn gì, chỉ nhắc.

## 4. Hệ quả nên làm tiếp (GĐ2) vì song song nhiều vụ tạo ra việc mới
1. **Ghi việc cho nhiều vụ cùng ô**: một việc làm chung (tưới cả nhà màng, phun thuốc cả ô) thì Ghi việc cho phép **tích nhiều vụ trong cùng ô**, sinh một bản ghi cho mỗi vụ; vật tư dùng **chia theo diện tích** (sửa được). Nếu không có tính năng này người dùng phải ghi lặp 2–3 lần, rất dễ bỏ.
2. **Phân bổ chi phí chung của ô** (điện, nước, công chung) cho các vụ theo diện tích × số ngày, bằng loại chi phí "phân bổ" sẵn có (bắt buộc ghi giả định).
3. **Báo cáo theo ô**: lãi lỗ cả ô, năng suất/m² từng vụ, so sánh các vụ song song.

## 5. Các giai đoạn
- **GĐ1:** 3.1 (bắt buộc, gợi ý tên, ép ở CSDL) + 3.2 (hàm chỗ trống, khung chỗ trống, cảnh báo vượt, thanh chiếm chỗ) + 3.3 (đơn giản hóa màn Tạo vụ) + cờ trồng xen/vượt. Cần: 1 migration, sửa `CreateCycleScreen`, `CycleInfoFields`, `AreasSection` (thanh chiếm chỗ), test CSDL.
- **GĐ2:** mục 4.
- **GĐ3 (hướng mở):** lịch ô theo thời gian (các vụ trong ô nối nhau trên một dòng thời gian), gợi ý "ô nào còn trống ở ngày X", luân canh/xen canh có kế hoạch, vật nuôi theo ngăn chuồng/ao nhỏ.

## 6. Cần chủ sản phẩm chốt
1. Khi vượt chỗ trống: **cảnh báo + chủ xác nhận** (đề xuất) hay chặn cứng?
2. Cho phép **"trồng xen"** (bỏ qua kiểm tra chỗ trống) không?
3. Ép tên/giống/diện tích/số lượng **ở CSDL** cho mọi vụ tạo mới (đề xuất có; vụ cũ không đụng)?
4. Bỏ lựa chọn "Chuẩn bị trong 1 phần ô" (đề xuất bỏ vì đã gộp)?
5. Làm GĐ1 trước, GĐ2 (ghi việc nhiều vụ, phân bổ chi phí) ngay sau?
