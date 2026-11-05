# Triển khai app cùng hộ / HTX và chứng minh hiệu quả

Trạng thái: **ĐỀ XUẤT** (4/11/2026). Mục tiêu: mỗi cơ sở dùng app thấy rõ lợi ích, khác biệt so với cơ sở không dùng, đủ làm căn cứ thu phí cao hoặc thu theo kết quả. Liên quan: `PHAN_TICH_THUE_CO_QUAN_THUE.md`, `PLAN_TIM_NHA_CUNG_UNG.md`.

## 1. Nguyên tắc cốt lõi

1. **Giá trị phải thấy trong 14 ngày đầu**, không chờ hết một vụ. Hộ chỉ trả phí cao khi sớm thấy "à, có cái này mới biết".
2. **Đo được thì mới chứng minh được**: ghi "trước khi dùng" (đường cơ sở) rồi so với "sau khi dùng" của chính cơ sở đó, và so với nhóm tương tự chưa dùng.
3. **Bạn trực tiếp triển khai là lợi thế, không phải gánh nặng**: biến nó thành một **quy trình chuẩn lặp lại được** (cùng bước, cùng bảng kiểm, cùng báo cáo), để sau này có người khác làm thay mà vẫn ra kết quả.
4. **Tính phí gắn với giá trị đo được**, không gắn với lợi nhuận thô (xem mục 5).

## 2. Giá trị cho từng nhóm (cái họ thật sự muốn)

| Nhóm | Họ lo | App chứng minh bằng |
|---|---|---|
| Hộ nhỏ | Không biết lãi hay lỗ, quên ghi, sợ phiền | "Vụ này lãi/lỗ bao nhiêu" sau mỗi vụ; giá thành/kg; ghi việc 1 chạm |
| Hộ vừa | Hao hụt, FCR/năng suất, chi phí vật tư, thời gian cách ly | Giá thành, FCR, hao hụt, cảnh báo cách ly, so sánh giữa các vụ |
| HTX | Quản hộ thành viên, thu mua, công nợ, báo cáo cho cơ quan | Thu mua từ hộ, công nợ, báo cáo tổng hợp, hồ sơ truy xuất, **hồ sơ thuế** |
| Đều có | Bán được giá, đầu ra, vay vốn, bị kiểm tra | Hồ sơ truy xuất, sổ nhật ký chuẩn, hồ sơ trên website, hồ sơ thuế |

## 3. Quy trình triển khai chuẩn (mỗi cơ sở)

**Tuần 0 – Chuẩn đoán (1 buổi, mang đi được):** phỏng vấn theo bảng cố định + chụp "đường cơ sở": số vụ, diện tích, cách ghi chép hiện tại (sổ tay, Zalo, không ghi), 3 con số **tự khai** gần nhất (chi phí vụ trước, doanh thu vụ trước, hao hụt/năng suất vụ trước), vấn đề đau nhất. Nhập vào app (mục "Đường cơ sở" – xem 4.1) để về sau so sánh.

**Tuần 1 – Thiết lập cùng làm (không để hộ tự làm):** khai báo phân khu, sản phẩm, kho, nhà cung ứng, khách hàng, quy trình mẫu; nhập **số dư kho đầu kỳ** và vụ đang chạy. Mục tiêu: cuối buổi hộ **ghi được 1 việc + 1 chi phí + 1 lần thu hoạch bằng điện thoại**. Giao một "người ghi chính" (chủ hoặc người nhà) và 1 người dự phòng.

**Tuần 2 – Nếp ghi chép:** mỗi ngày nhắc ghi việc (nút ＋ Ghi việc), cuối tuần gọi 10 phút: ai quên ghi, vì sao. Mục tiêu **≥ 80% ngày có ghi** (chỉ số "chuyên cần" – 4.2). Cuối tuần 2 giao **báo cáo đầu tiên**: chi phí đã ghi theo nhóm, việc đã làm, thời gian cách ly sắp tới.

**Tuần 3–4 – Khoảnh khắc "à ha":** chọn **một phát hiện cụ thể** từ chính số liệu của hộ (ví dụ chi phí thức ăn chiếm 62%, một vụ hao hụt cao hơn vụ kia, vật tư mua trùng, thuốc dùng quá thời gian cách ly) và cùng hộ xử lý. Đây là lúc họ tin app có ích.

**Tháng 2–3 – Tự vận hành:** bàn giao thói quen: hộ tự ghi, bạn xem từ xa qua chỉ số chuyên cần; họp tổng kết 30 phút cuối mỗi vụ ("Báo cáo hiệu quả" – 4.3).

**HTX (khác hộ):** triển khai **theo lớp**: (1) ban điều hành và kế toán HTX dùng trước (thu mua, công nợ, báo cáo); (2) 3–5 hộ **mẫu** trong HTX dùng ghi chép đầy đủ; (3) mở rộng dần các hộ còn lại; (4) hộ thành viên chưa dùng thì HTX ghi hộ (đã có "HTX quản lý dữ liệu hộ").

## 4. Việc nên xây trong app để đo và chứng minh (đề xuất, theo thứ tự)

### 4.1 Đường cơ sở và "Báo cáo hiệu quả" (ưu tiên 1)
- Mục **Đường cơ sở** (chỉ chủ + người triển khai): nhập các chỉ số trước khi dùng (tự khai, đánh dấu "ước tính"): chi phí/vụ, doanh thu/vụ, năng suất hoặc FCR, hao hụt, thời gian ghi chép mỗi tuần.
- **Báo cáo hiệu quả theo vụ/quý**: so vụ hiện tại với đường cơ sở và với vụ trước: giá thành/kg, lãi/lỗ, hao hụt, FCR, chi phí vật tư/kg, số lần vi phạm cách ly. Xuất một trang A4 đẹp để đưa chủ cơ sở và HTX.
- Cẩn trọng: ghi rõ số "tự khai trước khi dùng" khác số "đo bằng app", không khẳng định nhân quả quá mức.

### 4.2 Chỉ số "mức độ sử dụng" (để bạn theo dõi triển khai)
Số ngày có ghi trong 14 ngày, số việc/chi phí/thu hoạch ghi, tỷ lệ ghi trễ, số người dùng hoạt động, số vụ có đủ chi phí-thu hoạch-doanh thu. Hiện trong **Quản trị nền tảng** (mục Tổng hợp cơ sở đã làm) thành **bảng điều khiển triển khai**: cơ sở nào "xanh/vàng/đỏ" để bạn gọi chăm sóc. Đây là công cụ quan trọng nhất của người triển khai trực tiếp.

### 4.3 Hồ sơ giá trị theo thời gian
Mỗi quý tự sinh **"Bảng thành tích cơ sở"**: tiết kiệm được (chi phí/kg giảm), bán được (nhờ truy xuất/hồ sơ website), giảm rủi ro (cảnh báo cách ly đã chặn), sẵn sàng kiểm tra (hồ sơ thuế/ VietGAP đủ bao nhiêu %). Dùng để gia hạn hợp đồng và xin tăng phí.

### 4.4 Báo cáo thuế và hồ sơ kiểm tra (từ `PHAN_TICH_THUE_CO_QUAN_THUE.md`)
Là "chất kết dính": hộ khó bỏ app khi sổ sách thuế, bảng kê thu mua, bảng lương nằm đó. Làm theo Hướng A → B → C sau khi chuyên gia thuế xác nhận.

### 4.5 So sánh với nhóm đối chứng (tùy chọn, dài hạn)
Ẩn danh, gộp theo nhóm sản phẩm/khu vực: giá thành trung bình của cơ sở dùng app so với tham chiếu bên ngoài (số liệu thống kê, hoặc nhóm chưa dùng mà bạn có số tự khai). Chỉ công bố khi đủ mẫu (≥ 10 cơ sở) và có đồng ý.

## 5. Mô hình thu phí

| Mô hình | Ưu | Nhược |
|---|---|---|
| **% lợi nhuận** | Gắn lợi ích hai bên | **Rất khó kiểm chứng** (chi phí tự khai, hộ có thể ghi thiếu), dễ tranh chấp, hộ ngại chia sẻ số thật → làm giảm chất lượng dữ liệu, ngược mục tiêu |
| **Phí cố định theo gói** | Ổn định, đơn giản | Khó tăng khi chưa chứng minh giá trị |
| **Hybrid (đề xuất)** | Phí nền (phần mềm + hỗ trợ) + **phí theo kết quả đo được** | Cần hợp đồng rõ và công thức rõ |

**Đề xuất hybrid, 3 tầng:**
1. **Gói nền** (hiện có theo số vụ).
2. **Gói triển khai + đồng hành** (phí cao hơn): bạn/đội ngũ trực tiếp triển khai 90 ngày, nhắc nhở, họp tổng kết, báo cáo hiệu quả, hồ sơ thuế/VietGAP.
3. **Phí theo kết quả (tùy chọn, có trần)**: tính **% trên phần cải thiện đo được so với đường cơ sở** (ví dụ giảm giá thành/kg, giảm hao hụt quy ra tiền) thay vì % lợi nhuận. Chỉ áp dụng khi dữ liệu đạt ngưỡng chất lượng (đủ ngày ghi, đủ chứng từ) – chính điều kiện này lại **ép hộ ghi đầy đủ**, có lợi cho cả hai.
Với HTX: phí theo số hộ thành viên được quản lý + phí dịch vụ báo cáo/hồ sơ thuế.

Cần: hợp đồng dịch vụ (phạm vi, thời hạn, công thức, quyền xem dữ liệu, bảo mật), điều khoản dữ liệu cá nhân.

## 6. Rủi ro và cách giảm

- **Hộ bỏ ghi sau vài tuần**: chỉ số chuyên cần + nhắc + người ghi dự phòng + nhập hộ (nhân viên/HTX).
- **Số liệu tự khai ban đầu không chính xác** → ghi nhãn "ước tính", dùng so sánh xu hướng.
- **Quá phụ thuộc bạn**: viết sổ tay triển khai, video 3–5 phút theo từng bước, đào tạo 1–2 người "đại sứ" trong HTX.
- **Pháp lý/riêng tư**: người triển khai chỉ xem dữ liệu khi được cấp quyền; ghi nhật ký truy cập.
- **Kỳ vọng thuế**: nói rõ app hỗ trợ lập sổ/hồ sơ, không thay kế toán thuế.

## 7. Lộ trình đề xuất (song song với phát triển)
1. Ngay: sổ tay triển khai 4 tuần (mục 3) + bảng phỏng vấn đường cơ sở trên giấy, thử với 3–5 cơ sở đầu.
2. Xây **4.2 bảng điều khiển triển khai** (nhanh, chủ yếu có sẵn dữ liệu) và **4.1 đường cơ sở + báo cáo hiệu quả**.
3. Làm **báo cáo thuế** Hướng A khi đã xác minh pháp lý.
4. Sau 1–2 vụ có số liệu: **4.3 bảng thành tích**, chốt công thức phí theo kết quả với vài cơ sở thí điểm.
5. Mở rộng, đào tạo đại sứ, đóng gói quy trình cho người khác triển khai.

## 8. Cần chủ sản phẩm chốt
1. Nhóm khách hàng ưu tiên triển khai đầu tiên (hộ vừa, HTX hay hộ nhỏ) và số cơ sở thí điểm.
2. Có đồng ý mô hình hybrid (mục 5) thay vì % lợi nhuận thô không.
3. Bắt đầu xây gì trước: **4.2 bảng điều khiển triển khai** hay **4.1 đường cơ sở + báo cáo hiệu quả**.
