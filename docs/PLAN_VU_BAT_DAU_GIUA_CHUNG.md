# Đề xuất: bắt đầu vụ từ giữa chừng (từ một công đoạn / một việc bất kỳ)

Trạng thái: **ĐỀ XUẤT, chờ chủ sản phẩm duyệt** (6/11/2026). Chưa viết code.

## 1. Vấn đề

Nhiều cơ sở bắt đầu dùng app khi vụ đã chạy được một đoạn, hoặc nhận giống/con giống/cây đã qua 1–2 công đoạn đầu ở nơi khác (ươm, úm, nuôi thúc…) rồi mang về làm tiếp.

Hiện trạng đã kiểm tra:
- `create_cycle_from_template` luôn sao **toàn bộ** việc của quy trình, ngày kế hoạch tính từ ngày bắt đầu, mọi việc ở trạng thái "chưa bắt đầu".
- `advance_stage` chỉ cho Bắt đầu / Xong khi vụ **Đang sản xuất**, phải đi **tuần tự từng việc**, và bấm Xong phải **Ghi việc đủ số lần** (chỉ chủ được miễn kèm lý do).
- Muốn "nhảy" tới việc thứ 6, người dùng phải bấm Bắt đầu rồi Xong 5 việc đầu, mỗi việc bị đòi nhật ký: **sai thực tế, tốn công, và tạo dữ liệu giả** (ngày làm, nhật ký, chuyên cần).
- Ngày bắt đầu vụ đang vừa là ngày kế hoạch vừa là mốc tính tuổi vật nuôi/ngày trồng, nên nhập ngày hôm nay sẽ làm sai các chỉ số.

Mục tiêu: cho **chọn điểm bắt đầu bất kỳ** (một công đoạn hoặc một việc), các việc trước đó được ghi nhận trung thực là **"đã làm trước khi dùng app / trước khi nhận về"**, không bịa nhật ký, và số liệu sau đó vẫn đúng.

## 2. Giải pháp đề xuất

### 2.1 Điểm bắt đầu khi tạo vụ (màn Tạo vụ mới)
Thêm bước **"Vụ đang ở đâu trong quy trình?"** (mặc định "Từ đầu", không đổi cách làm hiện nay):
1. Hiện danh sách công đoạn và việc của quy trình mẫu đã chọn (đã có bản xem trước).
2. Người dùng **chạm vào việc đang làm**; app tự **tích "đã làm trước đó" cho mọi việc đứng trước** (người dùng bỏ tích từng việc nếu có việc thực tế chưa làm, vì có việc làm song song hoặc bỏ qua). Chạm vào tiêu đề công đoạn thì chọn việc đầu của công đoạn đó.
3. Hỏi 2 ngày: **Ngày vụ bắt đầu thật** (có thể trong quá khứ, dùng để tính tuổi, ngày thu hoạch dự kiến) và **Việc hiện tại bắt đầu ngày** (mặc định hôm nay). Các việc phía sau tính lịch từ ngày này bằng chính cơ chế dời lịch hiện có.
4. Vụ tạo ra ở trạng thái **Đang sản xuất**, việc được chọn **Đang làm**, các việc trước là **Đã xong (trước khi dùng app)**, các việc sau **Chưa bắt đầu**.

### 2.2 Cách ghi nhận trung thực
- Việc "đã làm trước đó": trạng thái xong nhưng mang **nhãn nguồn `pre_app`**, **không đòi nhật ký**, **không có ngày thực tế** (hiện "ước tính", ngày kế hoạch suy ngược từ việc hiện tại để dòng thời gian liền mạch). Không giả mạo là người dùng đã làm, không tính vào chỉ số chuyên cần.
- Vụ có thêm: `tracked_from` (ngày bắt đầu theo dõi trong app), `origin` (`own` | `resume` | `transfer`), `origin_note` (ví dụ "Nhận cây con 25 ngày tuổi từ vườn ươm ông Ba").
- Mọi nơi hiển thị dùng cùng nhãn: Chi tiết vụ, Sổ nhật ký, Tổng kết vụ, báo cáo hiệu quả: **"Theo dõi từ <ngày>; công đoạn trước đó làm trước khi dùng app"**. Sổ nhật ký VietGAP: mục "việc đã làm trước khi dùng app" chỉ ở mức nhắc, không báo thiếu.
- Chỉ **chủ hoặc quản lý** (quyền quản lý giai đoạn) được tạo vụ kiểu này; ghi nhật ký kiểm toán (ai, lúc nào, điểm bắt đầu).

### 2.3 Chi phí và số lượng đã phát sinh trước đó (để giá thành không bị thấp giả)
Hỏi tùy chọn ngay sau bước 2.1:
- **Số lượng đầu vào** (số cây/con/m² nhận về) nhập vào ô số lượng ban đầu của vụ.
- **Chi phí đã bỏ ra trước khi vào app**: một dòng chi phí **"Ước tính trước khi dùng app"** (loại *ước tính* sẵn có, bắt buộc ghi giả định), ngày = ngày vụ bắt đầu thật. Nhờ vậy giá thành/kg, lãi lỗ vẫn tính đủ và được đánh dấu là ước tính.
- Trường hợp **mượn/mua từ cơ sở khác**: chọn **Nhà cung ứng** (hoặc thêm nhanh), nhập số lượng, giá mua, số lô nếu có; app tạo **chi phí mua giống/con giống** và **lô giống** gắn với vụ (dùng sổ lô vật tư và truy xuất sẵn có). Hồ sơ truy xuất sẽ ghi "nguồn giống từ…".

### 2.4 Vụ đã tạo từ đầu nhưng thực tế đang ở giữa
Trong Chi tiết vụ thêm thao tác **"Vụ đang ở đâu? Chuyển tới…"**: chọn việc hiện tại, các việc trước chuyển thành "đã làm trước khi dùng app" (chỉ áp dụng cho việc **chưa có nhật ký và chưa bắt đầu**; việc đã có dữ liệu thật thì không đụng). Giúp các cơ sở đã lỡ tạo vụ theo cách cũ khỏi phải làm lại.

## 3. Thay đổi kỹ thuật (tóm tắt)
- **Migration `..._app_cycle_midstart.sql`:** thêm cột `production_stages.source` (`app` | `pre_app`), `production_cycles.tracked_from/origin/origin_note`; hàm mới `create_cycle_from_template_at(…, p_current_stage uuid, p_done_stages uuid[], p_stage_started date, p_origin, p_origin_note)` (bọc hàm hiện có, giữ nguyên quyền, hạn mức gói, idempotent theo `p_id`); hàm `jump_cycle_to_stage(p_cycle, p_stage, p_done_stages[], p_date)` cho mục 2.4. Hàm `advance_stage` không đổi (việc `pre_app` không bị hỏi nhật ký vì tạo sẵn ở trạng thái xong).
- **App:** `CreateCycleScreen` (bước chọn điểm bắt đầu, tái dùng bản xem trước công đoạn), `CycleDetailScreen` (thao tác 2.4, nhãn "trước khi dùng app"), `production.ts`, nhãn trong Sổ nhật ký/Tổng kết; dữ liệu `pre_app` lọc khỏi chỉ số chuyên cần.
- **Test CSDL:** tạo vụ từ giữa (đúng trạng thái và ngày từng việc, không đòi nhật ký việc trước), quyền, hạn mức gói, idempotent, không đổi được việc đã có dữ liệu thật ở 2.4.
- Không ảnh hưởng chức năng Ghi việc offline; tạo vụ vẫn cần mạng (D24).

## 4. Các giai đoạn
1. **GĐ1 (nên làm trước):** 2.1 + 2.2 + chi phí ước tính và số lượng đầu vào (2.3 phần đầu) + 2.4.
2. **GĐ2:** nhận từ cơ sở khác kèm nhà cung ứng, lô giống, chi phí mua, truy xuất nguồn giống (2.3 phần sau).
3. **GĐ3 (hướng mở):** **chuyển giao vụ giữa hai cơ sở cùng dùng app**: cơ sở A làm công đoạn 1–2 rồi "Giao vụ" cho B; B nhận và tạo vụ tiếp từ công đoạn 3, **kế thừa nhật ký công đoạn 1–2 ở dạng chỉ đọc** (truy xuất liền mạch từ ươm đến thu hoạch), giá chuyển giao ghi thành doanh thu của A và chi phí của B. Cần sự đồng ý hai bên và ranh giới dữ liệu rõ.

## 5. Điều cần chủ sản phẩm chốt
1. Đồng ý nhãn **"làm trước khi dùng app"** thay vì bắt nhập nhật ký bù cho việc cũ?
2. Chi phí trước đó: dùng một dòng **ước tính** (đề xuất) hay cho nhập chi tiết từng khoản?
3. Bắt đầu GĐ1 gồm cả thao tác 2.4 cho vụ đã tạo (đề xuất có)?
4. Chuyển giao vụ giữa hai cơ sở (GĐ3) có ưu tiên không, hay để sau?
