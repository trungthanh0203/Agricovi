# Kế hoạch Đợt 1B: bộ quy trình dưa lưới, sổ nhật ký và thiết kế chung cho trồng trọt + chăn nuôi

*Soạn 25/10/2026, từ 3 tài liệu của chủ sản phẩm: `Quytrinhtrongdualuoi.md`, `Nhat_Ky_San_Xuat_Dua_Luoi_Mau.xlsx`, `NhatKyVietGAP_DuaLuoi.xlsx`. Chờ duyệt. Bộ tài liệu nuôi heo (CP, VietGAP) sẽ được phân tích sau để chốt thiết kế chung (mục 6).*

## 1. Ba tài liệu cho biết gì

**Quy trình trồng dưa lưới nhà màng (5 giai đoạn, vụ 65–75 ngày)**: chuẩn bị nhà màng và giá thể (-10 → -1) · ngâm ủ, ươm (1–10) · trồng ra vườn, treo dây (10–20) · chăm sóc, tỉa, thụ phấn, dinh dưỡng (20–60) · thu hoạch và vệ sinh (65–75). Kèm: bảng lịch 13 mốc; ngưỡng môi trường (18–28 °C, ẩm 45–55 %); dinh dưỡng 3 giai đoạn (EC 1,2–1,5 → 1,6–1,8 → 2,0–2,5; pH 6,0–6,8); **ngưng phân 7 ngày, ngưng tưới 5 ngày trước thu**; Brix ≥ 12–14; mật độ 2.380–2.780 cây/1.000 m²; năng suất 2,2–2,8 tấn/1.000 m²; danh sách thuốc theo hoạt chất.

**Sổ mẫu 1 (`Nhat_Ky_San_Xuat_Dua_Luoi_Mau`)** – 2 trang: *theo dõi hằng ngày* (nhiệt độ ngày/đêm, độ ẩm, pH và EC đầu vào/đầu ra, số lần tưới, người làm) và *chăm sóc – sâu bệnh* (việc, vật tư, liều, ngày cách ly, ghi chú).

**Sổ mẫu 2 (`NhatKyVietGAP_DuaLuoi`)** – 7 trang theo VietGAP: thông tin cơ sở và vụ (mã VietGAP, nơi cấp, ngày cấp/hết hạn, mã lô nhà màng, cán bộ kỹ thuật) kèm **bảng tổng hợp tự tính** · gieo trồng · bón phân · phun thuốc (hoạt chất, ngày hết cách ly, **trạng thái PHI**) · tưới nước và vi khí hậu · thu hoạch (mã lô, loại, số quả, Brix, khách, mã QR) · sự cố và khắc phục (nguyên nhân, biện pháp, trạng thái, bài học).

## 2. Đối chiếu với hệ thống hiện có

| Nội dung sổ | Đã có | Còn thiếu |
|---|---|---|
| Cơ sở, giấy VietGAP (số, nơi cấp, ngày cấp/hết hạn) | Giấy phép của cơ sở (`org_licenses`) | Gắn giấy vào sổ in |
| Vụ: giống, lô hạt, nguồn giống, diện tích, số cây, ngày gieo/trồng | Có (D94) | **Cán bộ kỹ thuật phụ trách**; **mã lô/nhà màng** (trang trại mới có tên) |
| Ngâm ủ, gieo khay, ra vườn, dặm, treo dây | Form động nhập được | Bộ việc ươm; tỉ lệ nảy mầm, loại khay |
| Bón phân + EC, pH, giai đoạn dinh dưỡng | Form động + vật tư (D96) | Bộ trường theo sổ; tổng lượng phân đã dùng |
| Phun thuốc: đối tượng, tên thuốc, **hoạt chất**, liều, cách ly, ngày hết cách ly | Cách ly + cảnh báo (D96) | **Hoạt chất, số đăng ký, nhóm, nhà sản xuất trên vật tư**; dụng cụ phun; lý do và đánh giá hiệu quả |
| Tưới và vi khí hậu hằng ngày | Ghi theo từng lần việc | **Phiếu đo hằng ngày**, ngưỡng theo giai đoạn, biểu đồ, cảnh báo (T4) |
| Thu hoạch: mã lô, loại, số quả, Brix, khách | kg, loại, hao hụt, ghi chú; bán có khách | **Mã lô tự sinh, số quả, Brix** |
| Sự cố và khắc phục | T3 đã có (loại, mô tả, việc khắc phục, kết quả) | **Nguyên nhân**; loại "thiết bị/nhà màng" |
| Bảng tổng hợp đầu sổ, kiểm tra phun trong cách ly | Số liệu rải rác | **Sổ in/Excel và kiểm tra đầy đủ** (T5) |
| Quy trình 5 giai đoạn + mốc lùi từ ngày thu | Quy trình mẫu theo ngày kể từ ngày bắt đầu | **Mốc lùi từ ngày thu** (ngưng phân -7, ngưng tưới -5); **mục tiêu/ngưỡng theo giai đoạn** |

## 3. Điểm cần lưu ý trong tài liệu (xử lý khi đưa vào app)
1. Quy trình còn dấu trích dẫn `[33]`, `[20, 57]`: **xóa** khi đưa vào app.
2. Số ngày cách ly trong sổ mẫu (MAP Green 3, Radiant 7, Score 7, Dithane 14, Anvil 7) chỉ là minh họa: app lấy số ngày từ **nhãn thuốc do hộ nhập**, không cài sẵn thành sự thật. Bộ mẫu chỉ gợi ý tên thuốc/hoạt chất.
3. Sổ mẫu 2 ghi độ ẩm lúc `0.55` (tỉ lệ), lúc `75` (%): app dùng một đơn vị (%) và kiểm giá trị nhập.
4. Sổ mẫu 1 ghi nhiệt độ ngày 31–34 °C, vượt ngưỡng 18–28 °C của quy trình: đây là ca thử tốt cho cảnh báo ngưỡng (cảnh báo nhẹ, không chặn).
5. Quy trình dùng ngày kể từ lúc gieo (SND 1–75), còn app đếm từ ngày bắt đầu vụ: chốt "ngày 1 = ngày ngâm ủ/gieo hạt", giai đoạn chuẩn bị là ngày âm.

## 4. Thiết kế chung (dùng cho dưa, các cây khác và chăn nuôi)
Bốn lớp, mỗi lớp là **dữ liệu cấu hình**, không phải mã riêng cho từng loại hình:
1. **Danh mục**: sản phẩm (cây/vật nuôi), loại việc + trường của việc (form động, có rồi), vật tư với thuộc tính (cách ly, thêm hoạt chất, số đăng ký, nhóm).
2. **Bản ghi**: nhật ký việc (có), thu hoạch/xuất bán (có), sự cố (có), **phiếu đo chỉ số** (mới, lưu trong nhật ký với loại việc "Đo chỉ số" để dùng chung offline và form động).
3. **Quy trình mẫu**: giai đoạn + việc + **mục tiêu/ngưỡng** theo giai đoạn + **mốc lùi từ ngày thu/xuất**.
4. **Sổ mẫu**: định nghĩa một cuốn sổ gồm các trang; mỗi trang là danh sách cột lấy từ trường của bản ghi hoặc giá trị tính (ngày hết cách ly, tổng phân, số lần phun…). Một định nghĩa dùng cho xem trên màn hình, in A4 ngang, xuất Excel và kiểm tra đầy đủ.

**Gói loại hình** = trọn bộ của 4 lớp cho một loại hình (dưa lưới VietGAP, sau này heo CP, heo VietGAP). Áp dụng một lần, tự sửa tiếp. Hiện gói chỉ mới có phần trường; sẽ mở rộng dần (lát L6).

## 5. Các lát triển khai (đề xuất thứ tự)

| Lát | Nội dung | Cỡ | Phụ thuộc |
|---|---|---|---|
| **L1 Dữ liệu nền** | Vật tư: hoạt chất, số đăng ký, nhóm, nhà sản xuất. Vụ: cán bộ kỹ thuật, mã lô/nhà màng (trang trại có mã). Thu hoạch: mã lô tự sinh, số quả, Brix. Sự cố: nguyên nhân + loại thiết bị | nhỏ–vừa | không |
| **L2 Bộ trường dưa theo sổ** | Việc ươm (ngâm ủ, gieo khay, ra vườn, dặm, treo dây); bón phân thêm giai đoạn dinh dưỡng, EC, pH; phun thuốc thêm dụng cụ, lý do, đánh giá hiệu quả | nhỏ | L1 |
| **L3 Quy trình mẫu dưa (T6)** | 5 giai đoạn + 13 mốc; mục tiêu/ngưỡng (EC, pH, nhiệt, ẩm, Brix) theo giai đoạn; **mốc lùi từ ngày thu** tự sinh nhắc ngưng phân/ngưng tưới | vừa | L2 |
| **L4 Phiếu đo hằng ngày (T4)** | Màn nhập nhanh một ngày (sao chép hôm qua), 9 chỉ số theo sổ mẫu 1, ngưỡng theo giai đoạn, biểu đồ, cảnh báo nhẹ khi ngoài ngưỡng, nhắc chưa đo hôm nay | vừa–lớn | L3 (ngưỡng) |
| **L5 Sổ in, Excel và kiểm tra đầy đủ (T5)** | Sổ VietGAP dưa lưới 7 trang theo mẫu 2 (xem, in A4 ngang, Excel), bảng tổng hợp đầu sổ, danh sách thiếu sót (thiếu người làm, phun trong cách ly, vật tư thiếu hoạt chất/cách ly, chưa đo, thu chưa Brix…) | vừa–lớn | L1–L4 |
| **L6 Gói loại hình trọn bộ** | Gói gồm trường + việc + quy trình + ngưỡng + sổ + vật tư gợi ý; áp dụng một lần; xây gói heo | vừa | L3–L5, tài liệu heo |
| **L7 (tùy chọn)** | Hồ sơ nhân công (tập huấn, khám sức khỏe) nếu mẫu sổ yêu cầu; mã QR truy xuất theo lô thu hoạch | nhỏ–vừa | L1 |

Nguyên tắc từng lát: migration riêng + test CSDL gọn cho logic mới; giao diện thuần không chạy test; typecheck một lần cuối; commit từng mốc.

## 6. Câu hỏi để thiết kế chung cho chăn nuôi (đối chiếu khi đọc tài liệu heo CP/VietGAP)
- Vật nuôi cần **sổ đàn**: nhập con giống, chết, loại, xuất. Dưa cũng có (trồng, dặm, hao hụt) nên nên là một khái niệm chung "**biến động số lượng** của vụ".
- Lịch **vaccine, tẩy giun** theo ngày tuổi: có thể dùng quy trình mẫu (giai đoạn + mốc theo ngày tuổi), cần kiểm.
- **Ngưng thuốc trước xuất chuồng** dùng cùng cơ chế cách ly (đã làm).
- **An toàn sinh học**: sát trùng, khách ra vào, xe ra vào: nhật ký theo khu (chuồng/trại) không gắn một vụ?
- **Chỉ tiêu tăng trưởng**: cân định kỳ, FCR (tiêu tốn thức ăn/kg tăng trọng), tỉ lệ hao: cần chỉ số tính từ cân + cho ăn + số lượng.
- Chuồng = trang trại, đợt nuôi (lứa) = vụ: phù hợp mô hình hiện tại?

## 7. Việc cần chủ sản phẩm quyết định (kèm đề xuất)
1. Duyệt thứ tự L1 → L2 → L3 → L4 → L5, bàn thiết kế heo sau khi đọc tài liệu (đề xuất: duyệt).
2. Phiếu đo hằng ngày lưu trong nhật ký (loại việc "Đo chỉ số"), không làm bảng riêng (đề xuất: lưu trong nhật ký, dùng được offline, ghi nhiều người).
3. Sổ in trước bằng **in/PDF từ trình duyệt và xuất Excel**; chưa làm nhập ngược từ Excel (đề xuất: đúng).
4. Cảnh báo ngoài ngưỡng chỉ nhắc, không chặn ghi (đề xuất: đúng).
5. Số ngày cách ly luôn do hộ nhập theo nhãn; bộ mẫu không cài số cứng (đề xuất: đúng).
