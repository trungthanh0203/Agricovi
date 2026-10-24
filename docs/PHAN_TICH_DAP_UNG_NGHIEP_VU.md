# Phân tích mức đáp ứng nghiệp vụ trồng trọt và chăn nuôi (25/10/2026)

Mục đích: đánh giá hệ thống hiện tại đã đủ linh hoạt cho trang trại trồng trọt và chăn nuôi chưa, so với các phần mềm tương tự, và đề xuất việc làm tiếp để chủ sản phẩm duyệt. Chưa có mục nào trong đây được làm.

## 1. Kết luận ngắn

- **Trồng trọt: đáp ứng tốt phần lõi** (quy trình động, lịch giai đoạn, nhật ký việc kèm vật tư, kho, chi phí, nhân công, thu hoạch, doanh thu, giá thành, truy xuất, offline). Còn thiếu vài phần quan trọng về tuân thủ (thuốc BVTV và thời gian cách ly, báo cáo dịch bệnh), về năng suất theo diện tích, và về lô sản phẩm.
- **Chăn nuôi, thủy sản: khung dùng được, nhưng mới ở mức ghi chép.** "Vụ = một lứa/một ao" khớp với quy trình động, nhật ký, thức ăn/thuốc là vật tư, chi phí, công, bán. Nhưng chưa có các **con số đặc thù** mà người nuôi quản trị hằng ngày: số lượng con còn sống, chết và loại, cân mẫu tăng trọng, hệ số chuyển hóa thức ăn (FCR), chỉ số môi trường (nước, nhiệt độ), lịch tiêm phòng theo ngày tuổi, thời gian ngừng thuốc.
- **Quy trình động trả lời được "làm việc gì, khi nào", chưa trả lời được "đo được gì, tính ra gì".** Đây là điểm cần nói rõ: mọi quy trình đều lập được, nhưng các chỉ số riêng của từng ngành chỉ có khi hệ thống biết đến chúng.

## 2. Bảng đối chiếu

| Nhu cầu | Hiện có | Mức |
|---|---|---|
| Quy trình, lịch giai đoạn, tự dời theo thực tế | Quy trình mẫu động, lịch tự dời (D91) | Đủ |
| Nhật ký việc, vật tư đã dùng, ảnh, giọng nói, offline | Có | Đủ |
| Trường riêng cho từng loại việc (ví dụ độ Brix) | `field_schema` của loại việc, ghi được số | Một phần (ghi được, chưa tổng hợp, biểu đồ, ngưỡng) |
| Kho vật tư, giá vốn bình quân, cảnh báo hết | Có | Đủ |
| Chi phí, công nợ, nhân công, lương, giá thành, lãi lỗ | Có (D86–D93) | Đủ |
| Kế hoạch ngân sách, sản lượng dự kiến | Có (D93) | Đủ (chưa có dự trù vật tư) |
| Thu hoạch, hao hụt sau thu hoạch, bán, thu tiền | Có | Đủ (chưa có phân loại chất lượng, lô) |
| Truy xuất nguồn gốc theo vụ, QR | Có | Một phần (chưa theo lô thu hoạch) |
| Phân quyền, nhiều người, nhiều trang trại | Có (D83–D84) | Đủ |
| Thuốc BVTV/thuốc thú y, thời gian cách ly hoặc ngừng thuốc | Chưa | **Thiếu** |
| Báo cáo dịch bệnh, hao hụt phát sinh, hành động khắc phục | Chỉ ghi chú | **Thiếu** |
| Diện tích canh tác của vụ, năng suất và chi phí theo ha hoặc m² | Chỉ diện tích trang trại | **Thiếu** |
| Số lượng con, chết, loại, xuất, tỷ lệ sống | Chưa | **Thiếu (chăn nuôi)** |
| Cân mẫu, tăng trọng, FCR, sinh khối | Chưa | **Thiếu (chăn nuôi)** |
| Môi trường (nước ao: pH, oxy, độ mặn; nhiệt độ chuồng) và ngưỡng cảnh báo | Chưa | **Thiếu (thủy sản, chăn nuôi)** |
| Lịch tiêm phòng, điều trị theo ngày tuổi | Quy trình mẫu theo ngày, chưa theo "ngày tuổi" | Một phần |
| Giao việc, nhắc việc hằng ngày cho từng người | Chưa (đã hoãn: giao việc, thông báo đẩy) | Thiếu |
| Lô sản phẩm: thu hoạch → tồn thành phẩm → bán | Chưa | Thiếu |
| Dự trù vật tư theo vụ so với tồn kho, nhắc mua | Chưa | Thiếu |
| Tài sản, máy móc, khấu hao, bảo dưỡng | Chưa (có chi phí "khấu hao" nhập tay) | Thiếu |
| Quản lý từng cá thể (bò, heo nái) | Chưa | Để sau |
| Thời tiết, cảm biến | Hoãn theo quyết định | Để sau |

## 3. So sánh tham khảo

- **VNPT Green** (ảnh bạn gửi): danh sách chức năng gồm kế hoạch nuôi trồng, kế hoạch vật tư và tài chính, công việc hằng ngày và phát sinh, thư viện kỹ thuật, **báo cáo bệnh dịch hại, hao hụt phát sinh, đánh giá rủi ro và hành động khắc phục**, chứng từ đầu vào, kho, truy xuất, hồ sơ vùng trồng, thu hoạch bán hàng. So với đó ta mạnh hơn ở nhân công, lương, giá thành, phân quyền, offline; ta thiếu nhóm **dịch bệnh, rủi ro, khắc phục** và **chứng từ đầu vào**.
- **Phần mềm trồng trọt quốc tế** (Agrivi, Farmbrite, Croptracker): có lập kế hoạch vụ, kho, nhân công, truy xuất; Agrivi còn có quy trình mẫu sẵn cho hơn 60 cây trồng, vật nuôi. Nguồn: [Agrivi so với Croptracker](https://www.g2.com/compare/agrivi-vs-croptracker), [Techjockey: Agrivi](https://www.techjockey.com/compare/agrivi-farm-management-software-vs-croptracker). Các trang này không nêu rõ từng tính năng như sổ phun thuốc hay thời gian cách ly nên phần đó chỉ là thông lệ ngành, cần kiểm lại khi thiết kế.
- **Phần mềm thủy sản, chăn nuôi** (mô-đun Odoo, ERPNext, app nhỏ): đều có **ghi thức ăn, tự tính FCR, cân mẫu, tăng trọng, sinh khối, ghi chết, và đo môi trường với ngưỡng cảnh báo**; ERPNext tính sinh khối = số con còn sống × cân nặng mẫu gần nhất và cảnh báo khi vượt ngưỡng chết hoặc oxy. Nguồn: [Odoo fisheries](https://apps.odoo.com/apps/modules/19.0/dev_fisheries_management), [ERPNext aquaculture](https://ecosire.com/apps/erpnext/erpnext-aquaculture-management), [Fidelaqua](https://mwm.ai/apps/fidelaqua/6792762073). Đây là nhóm chỉ số ta chưa có.

## 4. Đề xuất (xếp theo giá trị và độ vừa sức)

**Nền chung (làm trước, dùng cho cả hai ngành)**
- **C1. Chỉ số theo dõi** (đo đạc theo ngày, theo vụ): định nghĩa chỉ số (pH, oxy, nhiệt độ, độ ẩm, cân mẫu…), nhập nhanh, biểu đồ, ngưỡng cảnh báo. Nên xây trên `field_schema` hiện có (đánh dấu trường số là "chỉ số theo dõi") để người dùng không phải nhập hai nơi.
- **C2. Sự cố và xử lý**: dịch bệnh, hao hụt phát sinh, thiên tai; kèm ảnh, mức độ, giai đoạn, **hành động khắc phục** và theo dõi đóng việc. Khớp nhóm chức năng của VNPT Green và là hồ sơ cần cho VietGAP.
- **C3. Thuốc, hóa chất và thời gian cách ly/ngừng thuốc**: gắn vào vật tư; khi ghi thu hoạch hoặc xuất bán trong thời gian cách ly thì cảnh báo; in **sổ nhật ký sản xuất theo mẫu** (PDF hoặc Excel).
- **C4. Diện tích và năng suất**: diện tích canh tác của vụ, mật độ; chỉ tiêu năng suất, chi phí, lãi theo ha hoặc m² (và theo con ở chăn nuôi).

**Chăn nuôi, thủy sản**
- **L1. Quần thể**: số lượng nhập, chết, loại, xuất, chuyển; số hiện tại, tỷ lệ sống.
- **L2. Cân mẫu và tăng trọng**: sinh khối, tăng trọng ngày, dự báo ngày xuất.
- **L3. Thức ăn và FCR**: vật tư loại "thức ăn" ghi theo ngày, FCR tự tính, chi phí thức ăn trên kg tăng trọng.
- **L4. Lịch tiêm phòng, điều trị theo ngày tuổi**: quy trình mẫu tính theo ngày tuổi của đàn.
- **L5. Bộ quy trình mẫu sẵn** (gà thịt, heo thịt, cá, tôm): cần số liệu thực tế hoặc chuyên gia, nên làm sau khi có hộ thí điểm.

**Vận hành và truy xuất**
- **C5. Giao việc, nhắc việc, việc hôm nay** (đã hoãn): rất hợp với quy trình động; nên làm sau nền chung.
- **C6. Lô sản phẩm**: thu hoạch tạo lô, tồn thành phẩm, bán theo lô, truy xuất theo lô, phân loại chất lượng và giá.
- **C7. Dự trù vật tư theo vụ**: từ quy trình mẫu tính vật tư cần, so với tồn kho, nhắc mua, so kế hoạch với thực tế.
- **C8. Tài sản, máy móc, khấu hao, bảo dưỡng**, phân bổ chi phí chung.
- Để sau: quản lý từng cá thể (bò, heo nái), thời tiết và cảm biến, thu mua từ hộ thành viên của HTX, đánh giá nội bộ ICS.

## 5. Gợi ý lộ trình

1. **Đợt 1 (nền, lợi cả hai ngành):** C1, C2, C3, C4.
2. **Đợt 2 (chăn nuôi, thủy sản):** L1, L2, L3, L4.
3. **Đợt 3 (vận hành):** C5, C6, C7.
4. **Sau:** C8, L5, cá thể, cảm biến.

Mỗi đợt nên có một hộ thí điểm thật (theo quyết định D9) để chốt trường nhập và cách hiển thị trước khi làm rộng.

## 6. Việc cần chủ sản phẩm quyết định

1. Ngành ưu tiên trước: trồng trọt (nhà màng, ngoài đồng), chăn nuôi (gà, heo, bò…), hay thủy sản (cá, tôm)?
2. Mục tiêu tuân thủ gần: VietGAP, GlobalGAP, OCOP, hay chỉ cần sổ sách nội bộ?
3. Có hộ hoặc đơn vị cụ thể để thí điểm đợt 1 không?
