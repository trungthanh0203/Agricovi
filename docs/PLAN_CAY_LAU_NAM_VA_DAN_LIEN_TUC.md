# Phương án: cây lâu năm (na, nho…) và đàn nuôi liên tục (dê, bò…)

Trạng thái: **C1–C3 ĐÃ LÀM** (12/11/2026, chưa `db push` migration 0182 và 0183). Chưa làm: C4 (theo dõi từng con: số tai, phối giống–đẻ–cai sữa) và báo cáo hồ sơ thuế dùng khấu hao.

Đã làm (cách A, như đề xuất): kiểu vụ `batch | perennial | herd`; bảng `cycle_periods` + `production_stages.period_id`; mở/đóng kỳ (`open_cycle_period`, `close_cycle_period`); vườn cây: ngày trồng bắt buộc, tuổi cây và giai đoạn kiến thiết/kinh doanh, chi phí đầu tư (`expense_records.is_capital`) khấu hao tự động theo năm khấu hao (mặc định kiến thiết 3 năm, khấu hao 15 năm, sửa được), `set_orchard_params`; đàn: số đầu tồn theo nhóm khi tạo, sự kiện số lượng thêm `born`, `move`, `open` và nhóm, `get_herd_balance`; tổng kết theo kỳ `get_cycle_period_summary`, `get_cycle_periods_report`; tạo vụ (hàng "Cách trồng / Cách nuôi" ở Bước 1, ngày trồng / bảng nhóm / kỳ đầu ở Bước 2, gợi ý kiểu theo tên sản phẩm); Chi tiết vụ có khối kỳ, tuổi cây, tổng kết theo kỳ, biến động đàn; 4 mẫu quy trình nháp (nho, na, dê, bò) ở migration 0183 cần cán bộ khuyến nông / thú y thẩm định.
Quyết định đã áp dụng theo đề xuất: chọn cách A; làm vườn cây và đàn cùng đợt; khấu hao tính trong app; ghi từng con là tùy chọn ở C4; tên "Vườn cây" và "Đàn". Liên quan: `PLAN_TAO_VU_DON_GIAN.md` (mục 2, 6), `PLAN_NHIEU_VU_TRONG_MOT_O.md`.

## 1. Vì sao "vụ" hiện nay chưa vừa

Mô hình hiện có: một **vụ** có ngày bắt đầu và ngày dự kiến kết thúc; quy trình mẫu sao ra một danh sách việc chạy từ đầu đến cuối; tổng kết (`get_cycle_summary`) tính cho **cả đời vụ**; số lượng ban đầu là một con số cố định, biến động qua sự kiện nhập/chết/loại/xuất.

| | Cây lâu năm (na, nho, sầu riêng…) | Đàn liên tục (dê, bò, gà đẻ…) |
|---|---|---|
| Vòng đời | Nhiều năm; chu kỳ **mỗi năm hoặc mỗi mùa** lặp lại | Không có ngày xuất đồng loạt; con vào, con ra liên tục |
| Doanh thu | Thu hoạch hằng năm sau 1–3 năm chưa có trái | Bán con giống, thịt, sữa, trứng rải quanh năm |
| Chi phí | **Chi phí kiến thiết** những năm chưa thu, rồi chi phí chăm sóc hằng năm | Thức ăn, thú y, chuồng trại hằng ngày |
| Số lượng | Số cây gần như cố định (trồng dặm, cây chết) | Số đầu thay đổi liên tục, **chia nhóm** (đực giống, cái sinh sản, hậu bị, con non, vỗ béo) |
| Báo cáo cần | Lãi lỗ **theo năm/mùa**, năng suất theo tuổi cây | Lãi lỗ **theo tháng/quý**, **biến động đàn** (đầu kỳ, nhập, sinh, chết, bán, cuối kỳ) |
| Nếu cứ tạo "một vụ dài" | Tổng kết lẫn nhiều năm, không so sánh được năm này với năm trước | Không biết đàn đang có bao nhiêu con mỗi nhóm; không có lịch phối/đẻ/tiêm theo con |

## 2. Ba cách làm đã cân nhắc

| Cách | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **A (đề xuất)**: mở rộng "vụ" thêm **kiểu** và **kỳ** | Vụ có kiểu `batch` (như nay), `perennial`, `herd`; vụ dài hạn chia thành các **kỳ** (mùa/năm/quý) | Giữ nguyên Ghi việc, thu hoạch, chi phí, doanh thu, kho, nhật ký, QR, quyền; số liệu liền mạch; làm theo từng bước | Phải làm thêm tổng kết theo kỳ |
| B: mỗi năm một vụ liên kết ("Na lô A – 2027") | Dùng "Làm lại như vụ trước" + nối tiếp | Rất nhanh | Mất liền mạch: tuổi cây, chi phí kiến thiết, số đầu chuyển năm; đàn không có "kỳ" tự nhiên |
| C: thực thể mới "Vườn cây", "Đàn" | Bảng riêng | Sạch về khái niệm | Phải làm lại phần lớn ghi việc/thu hoạch/chi phí vì đều gắn `cycle_id`; chi phí lớn |

**Chọn A.** Mọi bản ghi vẫn gắn vào một vụ (nay gọi chung là "vụ" nhưng hiển thị là **Vườn cây** hoặc **Đàn**); thời gian được cắt thành **kỳ** để xem và báo cáo.

## 3. Thiết kế nền chung (dùng cho cả hai kiểu)

### 3.1 Kiểu vụ
- `production_cycles.cycle_mode`: `batch` (mặc định, như nay) | `perennial` | `herd`.
- Ở Bước 1 của Tạo vụ, sau khi chọn sản phẩm hỏi **một câu bằng lời thường**, mặc định theo sản phẩm:
  - Cây ăn trái, cây công nghiệp (na, nho, sầu riêng, cà phê, tiêu…): *"Vườn cây lâu năm (thu hoạch hằng năm)"* hoặc *"Cây ngắn ngày (theo vụ)"*.
  - Gia súc, gia cầm (dê, bò, gà, cừu…): *"Nuôi theo lứa (nhập rồi xuất cả lứa)"* hoặc *"Đàn nuôi liên tục (có đàn mẹ, con sinh ra, bán dần)"*.
  - Thủy sản và còn lại: theo vụ.
- Thêm thuộc tính mặc định kiểu cho sản phẩm trong danh mục (người dùng đổi được).

### 3.2 Kỳ (chu kỳ báo cáo và chăm sóc)
- Bảng mới `cycle_periods`: `id, cycle_id, label` ("Mùa 2027", "Quý 1/2027"), `start_date, end_date, status (open|closed), template_id`.
- `production_stages.period_id` (có thể trống; vụ `batch` giữ nguyên, không có kỳ).
- **Mở kỳ mới** = sao quy trình mẫu của kiểu đó (quy trình *mùa*, *năm* hoặc *quý*) thành các việc của kỳ, đúng cơ chế sao việc hiện có. **Đóng kỳ** = chốt số liệu kỳ, việc kỳ cũ thu gọn lưu lịch sử. Mỗi lúc chỉ một kỳ đang mở (nho có thể 2–3 mùa/năm: mỗi mùa một kỳ).
- Ghi việc, thu hoạch, chi phí, doanh thu vẫn gắn vụ; **kỳ chỉ là khung thời gian** (theo ngày) nên ghi bù ngày cũ tự rơi đúng kỳ, không cần thêm khóa ngoại cho từng bản ghi.
- Tổng kết theo kỳ: `get_cycle_summary` bổ sung phiên bản có khoảng ngày (cùng cách tính hiện có, thêm `from/to`), màn Tổng kết có bộ chọn **Kỳ** và **Cả vườn/Cả đàn**.

### 3.3 Không có ngày kết thúc cố định
- Vụ dài hạn không bị nhắc "trễ tiến độ vụ" theo ngày dự kiến kết thúc; thay bằng nhắc theo **kỳ**. Hạn mức gói vẫn tính **một vụ** cho mỗi vườn/đàn.
- Chỉ kết thúc khi người dùng bấm **Kết thúc vườn / Kết thúc đàn** (phá bỏ, bán hết).

## 4. Cây lâu năm (na, nho…)

**Tạo vườn cây (rút gọn Tạo vụ):** sản phẩm, ô và diện tích, giống/gốc ghép, **số cây**, **ngày trồng** (bắt buộc, để tính tuổi), số cây đã trồng dặm, tuổi cây tại ngày vào app (cho vườn đã có sẵn: nhập năm trồng thay vì ngày).
**Hiển thị:** "Tuổi cây: 3 năm 2 tháng · giai đoạn **Kiến thiết cơ bản** / **Kinh doanh**" (ngưỡng năm bắt đầu kinh doanh theo sản phẩm, sửa được).

**Quy trình theo kỳ:** mẫu hệ thống soạn thảo (bản nháp, cần thẩm định cùng cán bộ khuyến nông địa phương):
- **Nho:** kỳ = một vụ trong năm; công đoạn cắt tỉa, chăm cành, xử lý ra hoa, tỉa chùm, bao trái, thu hoạch, cải tạo sau thu.
- **Na:** kỳ = năm; tỉa cành, bón phân theo đợt, thụ phấn bổ sung, tỉa quả, bao trái, thu hoạch rải.
- Việc lặp (bón, phun phòng) dùng `repeat_every_days` đã có.

**Tài chính đặc thù (quan trọng, nên làm đúng):**
- **Chi phí kiến thiết cơ bản**: chi phí các năm chưa thu hoạch được **gom riêng** (nhóm chi phí "Đầu tư vườn cây").
- **Khấu hao vườn cây**: phân bổ chi phí kiến thiết trong N năm (mặc định theo sản phẩm, sửa được) thành khoản **khấu hao hằng năm** vào kỳ kinh doanh (dùng loại chi phí "khấu hao" và kiểu "phân bổ" đã có, kèm ghi chú cách tính). Nhờ đó lãi lỗ từng năm phản ánh đúng.
- Báo cáo: **năng suất trên cây và trên 1.000 m² theo tuổi cây**, so các năm; **lãi lỗ theo năm**; **lũy kế đã thu hồi vốn chưa** (tổng thu trừ tổng đầu tư).

## 5. Đàn nuôi liên tục (dê, bò…)

**Tạo đàn:** sản phẩm, chuồng (ô) và diện tích, ngày bắt đầu theo dõi, **số đầu tồn ban đầu theo nhóm** (đực giống, cái sinh sản, hậu bị, con non, vỗ béo; tên nhóm cấu hình được trong Cấu hình cơ sở).

**Số đầu theo nhóm (thay cho một con số cố định):**
- Mở rộng sự kiện số lượng: thêm loại **sinh** (con mới sinh) và **chuyển nhóm** (hậu bị → sinh sản, con non → vỗ béo), mỗi sự kiện có **nhóm** (và nhóm đích khi chuyển). Số đầu hiện tại mỗi nhóm = tồn đầu + nhập + sinh + chuyển vào − chết − loại − xuất − chuyển ra.
- Vẫn ghi được khi mất mạng (D24); mỗi sự kiện có mã tạo ở thiết bị.

**Kỳ cho đàn:** mặc định **quý** (hoặc tháng), mở/đóng tự gợi ý. Quy trình theo kỳ là **lịch chăm sóc đàn**: tiêm phòng định kỳ, tẩy giun, cân định kỳ, vệ sinh chuồng, kiểm tra sinh sản (dùng `repeat_every_days`). Lịch tiêm cụ thể do cán bộ thú y địa phương xác nhận, mẫu hệ thống chỉ là nháp.

**Sinh sản (bước 2, tùy chọn):** theo dõi **từng con** bằng số tai: ngày sinh, giới tính, nhóm, mẹ; **phối giống → ngày dự kiến đẻ → cai sữa** có nhắc. Dê/bò nhỏ lẻ có thể chỉ dùng số đầu theo nhóm, không bắt buộc ghi từng con.

**Sản phẩm:** sữa, trứng ghi bằng phiếu thu hoạch hằng ngày (lít, quả); bán con giống, thịt, con loại ghi qua doanh thu như hiện nay.

**Báo cáo đặc thù:**
- **Biến động đàn** theo kỳ: đầu kỳ, nhập, sinh, chết, loại, bán, cuối kỳ, theo nhóm. Dùng được cho kiểm tra thú y.
- **Chi phí và doanh thu trên mỗi đầu**, tỷ lệ chết, tỷ lệ đẻ (khi có theo dõi sinh sản), lãi lỗ theo tháng/quý.

## 6. Ảnh hưởng đến phần đã làm
- **Tạo vụ theo bước:** Bước 1 thêm câu hỏi kiểu; các bước sau thay đổi nhẹ (vườn cây: ngày trồng; đàn: số đầu theo nhóm).
- **Chỗ trống của ô** (0179): vườn cây và đàn đều chiếm diện tích ô như vụ thường.
- **Bắt đầu giữa chừng** (0178): vườn cây/đàn đã có sẵn dùng "ngày bắt đầu theo dõi" + tuổi cây/tồn đầu thay cho chọn việc.
- **Báo cáo theo ô, thuế:** thêm khấu hao vườn cây và biến động đàn là chất liệu tốt cho hồ sơ thuế (`PHAN_TICH_THUE_CO_QUAN_THUE.md`).
- **Vụ dài cũ** đã tạo như "vụ rất dài": có công cụ **đổi thành vườn cây/đàn** mà không mất dữ liệu.

## 7. Giai đoạn
1. **C1 – Nền chung:** `cycle_mode`, `cycle_periods`, `production_stages.period_id`, câu hỏi kiểu ở Tạo vụ, mở/đóng kỳ, tổng kết theo kỳ. (Dùng chung cho cả hai kiểu, nên làm trước.)
2. **C2 – Vườn cây:** ngày trồng/tuổi cây, kiến thiết cơ bản và khấu hao, năng suất theo tuổi, mẫu nho và na (nháp), báo cáo theo năm.
3. **C3 – Đàn (mức nhóm):** nhóm đàn, sự kiện sinh/chuyển nhóm, biến động đàn, lịch chăm sóc, sữa/trứng.
4. **C4 – Đàn (từng con):** số tai, phối giống–đẻ–cai sữa, nhắc.
5. Mỗi giai đoạn có test CSDL cho quyền, ràng buộc, tính số đầu theo nhóm và tổng kết theo kỳ.

## 8. Cần chủ sản phẩm quyết định
1. Chọn **cách A** (mở rộng vụ với kiểu + kỳ) như đề xuất?
2. Làm **vườn cây trước hay đàn trước** (nhóm khách hàng đầu tiên của bạn nuôi trồng gì nhiều hơn)?
3. Có cần **khấu hao vườn cây** trong app ngay C2 hay để kế toán tính ngoài và chỉ cần nhóm chi phí "Đầu tư vườn cây"?
4. Đàn: ghi **từng con** (số tai) là bắt buộc hay tùy chọn (đề xuất tùy chọn, làm ở C4)?
5. Tên gọi trên giao diện: *Vườn cây* và *Đàn* (đề xuất), vẫn gọi chung "vụ" ở các nơi khác?
6. Mẫu quy trình nho/na/dê/bò: bạn có cán bộ khuyến nông/thú y để thẩm định nội dung không, hay tôi soạn nháp rồi bạn gửi xin ý kiến?
