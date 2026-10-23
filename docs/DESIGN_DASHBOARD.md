# Nguyên tắc trình bày dashboard và báo cáo

Rút ra từ 5 ảnh tham khảo của chủ sản phẩm (19/10/2026): bộ mẫu Excel quản lý sản xuất, "Quản lý tiến độ đa dự án", "Tổng quan dòng tiền, chi phí", "Báo cáo nhập/xuất vật tư", "Báo cáo thu/chi, công nợ".
Mọi màn hình số liệu mới và mọi lần nâng cấp màn cũ **phải theo tài liệu này**. Nếu cần khác đi, ghi lý do vào `docs/DECISIONS.md`.

## 1. Điều học được từ các ảnh

| # | Điều học được | Ví dụ trong ảnh |
|---|---|---|
| 1 | **Ba tầng thông tin**: (a) hàng thẻ số lớn ở trên cùng, (b) biểu đồ xu hướng và cơ cấu ở giữa, (c) bảng chi tiết có lọc ở dưới | Cả 4 ảnh báo cáo |
| 2 | **Thẻ số (KPI)**: nhãn nhỏ phía trên, **số rất lớn** ở dưới, đơn vị rút gọn (triệu, tỷ); nền đậm cho nhóm quan trọng nhất | Khối xanh navy "Giá trị hợp đồng / Doanh thu / Chi phí" |
| 3 | **Màu có nghĩa cố định**: xanh lá = thu, tốt, hoàn thành; đỏ = chi, rủi ro, quá hạn; cam/vàng = cảnh báo, chậm; xanh dương = kế hoạch, tổng | Thẻ "Rủi ro" đỏ, "Chậm tiến độ" cam, "Tổng số dự án" xanh |
| 4 | **Thẻ trạng thái**: nền nhạt + biểu tượng + một con số + nhãn ngắn | Ba thẻ "Tình trạng thi công" |
| 5 | **Thanh tiến độ hai tầng** (kế hoạch và thực tế) và **vòng tròn có số ở giữa** | Thẻ dự án: "Tiến độ kế hoạch / Tiến độ thực tế" |
| 6 | **Thẻ danh sách nhiều đối tượng**: tên, mã, chấm trạng thái, các ô ngày màu nhạt, vòng tiến độ, hàng cuối "Ngân sách / Thu / Chi" | "Quản lý tiến độ đa dự án" |
| 7 | **Ghi thời điểm tổng hợp** ngay trên thẻ ("Tổng hợp lúc 12:00 ngày …") và nút **Tải lại** | Đầu và cuối thẻ dự án |
| 8 | **Cơ cấu**: biểu đồ tròn/vòng có **nhãn trực tiếp kèm giá trị**, không chỉ chú giải; **Top N thanh ngang** có số ở cuối | "Chi phí thực tế", "Top 10 vật tư" |
| 9 | **Xu hướng 12 tháng gần nhất**: cột (thu, chi) kèm đường lũy kế; **chạm/rê** để xem số chính xác | "Doanh thu – Chi phí", "Dòng tiền" |
| 10 | **Cho thấy công thức** của số dẫn xuất ("5 = 3 + 4", "6 = 1 + 2 − 5") nên người đọc tự kiểm được | "Cơ cấu dòng thu" |
| 11 | **Khối cảnh báo riêng** ở cuối, mỗi loại một màu nền: tồn thấp, chậm tiến độ, thiết bị hỏng | Dashboard tổng hợp (ảnh 1) |
| 12 | **Bảng có bộ lọc và nút mở rộng**, tên là liên kết bấm xuống chi tiết | "Bảng số liệu", "Nhu cầu mua – cấp vật tư" |

## 2. Điều KHÔNG sao chép (vì khác bối cảnh của AgriConnect)

- Ảnh là **màn hình máy tính**, dày đặc. App của ta là **điện thoại, người dùng ít quen công nghệ**: một cột, mỗi màn tối đa 3 thẻ số + 1–2 biểu đồ, phần còn lại thu gọn bằng `Collapsible`.
- Ảnh có "Lợi nhuận" như một con số chắc chắn. Ta **không gọi là lợi nhuận chính xác** khi chi phí hoặc doanh thu chưa đủ (v1.1 mục 4.5). Số dẫn xuất chỉ hiện khi đủ dữ liệu, nếu không ghi "Chưa đủ dữ liệu" kèm lý do (đã làm ở mục Tổng kết).
- Không dùng biểu đồ khó đọc (Sankey, nhiều đường lũy kế chồng nhau) ở bản đầu. Chỉ dùng: **thẻ số, thanh tiến độ, cột, đường đơn, vòng/tròn (tối đa 6 phần), Top N thanh ngang, bảng**.
- Không chỉ dựa vào màu: mỗi trạng thái luôn có **chữ hoặc biểu tượng** (NFR-UX-005).

## 3. Quy tắc áp dụng

1. **Mở đầu bằng câu trả lời**: màn nào cũng có một dòng/hàng thẻ trả lời "tình hình ra sao" trước khi vào chi tiết.
2. **Số lớn, nhãn nhỏ**: số 1.6–2rem đậm; nhãn 0.85rem xám; đơn vị rút gọn (1,2 triệu; 3,4 tỷ), **chạm vào để xem đủ số đồng**.
3. **Màu theo nghĩa** (dùng biến CSS, có bản tối): `--ok` xanh lá, `--bad` đỏ, `--warn` cam, `--info` xanh dương (kế hoạch/tổng), `--neutral` xám. Tiền thu = xanh lá, chi = đỏ, cảnh báo = cam. Không dùng một màu cho hai nghĩa.
4. **Luôn ghi "Cập nhật lúc …"** và có nút **Tải lại**; offline thì nói rõ đang xem bản đã tải.
5. **Cảnh báo thiếu dữ liệu nằm ngay trên các số bị ảnh hưởng**, không để cuối trang.
6. **Công thức hiển thị**: số dẫn xuất ghi cách tính bằng một dòng nhỏ (ví dụ "Giá thành = Tổng chi phí ÷ Thu hoạch sau hao hụt").
7. **Cơ cấu** dùng vòng/thanh có **nhãn kèm giá trị và %** trực tiếp; gộp phần nhỏ thành "Khác" khi quá 6 phần.
8. **Xu hướng** theo tháng (tối đa 12) hoặc theo ngày/tuần trong một vụ; một đơn vị trục, nhãn trục rõ.
9. **Danh sách nhiều đối tượng** (vụ, hộ, kho) dùng **thẻ** có tên, chip trạng thái, thanh tiến độ, hàng số cuối thẻ; bấm vào thẻ mở chi tiết.
10. **Tính tổng trên máy chủ** (hàm RPC/view có kiểm quyền, như `get_cycle_summary`); điện thoại chỉ vẽ. Không kéo hàng nghìn dòng về để cộng ở máy.
11. **Vẽ bằng SVG nhỏ tự viết** trong `apps/app/src/components/charts/` (không thêm thư viện biểu đồ nặng; chạy được offline, theo giao diện sáng/tối). Bộ khởi đầu: `KpiTile`, `StatusChip`, `ProgressBar`, `Donut`, `Bars`, `Sparkline`, `TopList`.
12. Kiểm tra trên khung điện thoại 375px; không cuộn ngang trang (bảng rộng thì cuộn ngang bên trong bảng).

> **Đã làm (23/10/2026, D79):** bộ biểu đồ SVG ở `apps/app/src/components/charts/` (`XYChart` cột/đường, `DonutChart`, `HBarList`, `ProportionBar`, `ChartCard`) và phần tính thuần `lib/chartMath.ts`, `lib/reportChart.ts` (có kiểm thử `supabase/tests/charts_logic.test.mjs`). Đã áp dụng cho Báo cáo theo nhu cầu, Trang chủ (xu hướng 6 tháng), Tổng kết vụ, Công nợ, Chấm công. Còn lại trong bảng dưới: Sản xuất (thẻ vụ), Thu hoạch/Chi phí/Doanh thu theo màn riêng, Tồn kho, HTX, Admin.

## 4. Kế hoạch nâng cấp (làm dần, theo thứ tự đề xuất)

| Màn | Nâng cấp theo tài liệu này |
|---|---|
| **Tổng kết vụ** (đã có số liệu) | Hàng thẻ: Tổng chi phí đã ghi · Thu hoạch sau hao hụt · Doanh thu đã ghi · Giá thành/kg. Vòng cơ cấu chi phí (thực chi khác / vật tư từ kho / vật tư ghi tay / phân bổ-ước tính). Công thức một dòng dưới mỗi số dẫn xuất. Cảnh báo thiếu dữ liệu đặt ngay dưới thẻ bị ảnh hưởng |
| **Trang chủ** | Hàng thẻ hôm nay: việc đã ghi · vụ đang sản xuất · cảnh báo tồn thấp · bản ghi chờ gửi. Khối cảnh báo (tồn âm, sắp hết, bản ghi cần xử lý) |
| **Sản xuất** (danh sách vụ) | Thẻ vụ: chip trạng thái, ô ngày bắt đầu/dự kiến kết thúc, **thanh tiến độ theo ngày** (đã qua / dự kiến), số việc đã ghi 7 ngày gần nhất |
| **Thu hoạch** | Cột kg theo ngày/tuần, **tỷ lệ hao hụt** (hao hụt ÷ tổng thu) dạng thẻ và đường |
| **Chi phí** | Vòng theo nhóm (vật tư, nhân công, điện nước…), cột theo tháng, Top 5 khoản lớn |
| **Doanh thu** | Cột theo tháng, giá bán trung bình mỗi kg theo thời gian |
| **Tồn kho** | Thanh tồn so với mức "sắp hết"; Top vật tư dùng nhiều; xu hướng nhập–xuất theo tháng |
| **Chấm công, tiền công** (bước E) | Thẻ giờ công tháng, thanh tiến độ duyệt công, bảng người × ngày, cảnh báo công thiếu lượt |
| **HTX** (sau) | Kiểu "quản lý đa dự án": mỗi hộ một thẻ (số vụ đang chạy, tiến độ ghi nhật ký, chip trạng thái), tổng hợp ở trên cùng |
| **Admin** (sau) | Thẻ gói/thanh toán, cơ cấu theo gói, danh sách sắp hết hạn |

Mỗi lần nâng cấp một màn: làm các thành phần `charts/` cần thiết, vẽ trên số liệu có sẵn, kiểm trên khung 375px, cập nhật `docs/HUONG_DAN_THU.md` nếu thay đổi cách đọc số.
