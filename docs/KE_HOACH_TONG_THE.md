# Kế hoạch triển khai tổng thể (trồng trọt + chăn nuôi)

*Soạn 25/10/2026. Gộp `PLAN_DOT1_TRONG_TROT.md` (T0–T7), `PLAN_DOT1B_SO_NHAT_KY.md` (L1–L7) và `PLAN_DOT2_CHAN_NUOI_HEO.md` (A–H) thành MỘT lộ trình. Từ nay làm theo file này; ba file kia giữ để tra cứu lý do.*

## 1. Trả lời nhanh: app có dùng được cho gà, chim, dúi… không?
**Có, với điều kiện thêm 3 khái niệm chung (không phải làm app riêng cho từng con vật) và có "chế độ đơn giản".**

| Mô hình | Cách quản lý | Đầu ra chính | Cần khái niệm |
|---|---|---|---|
| Dưa lưới, cây trồng khác | Lô theo vụ, đếm cây | Quả (kg) | Có sẵn |
| Heo thịt | Lô theo đợt nuôi, đếm con | Heo xuất chuồng (con, kg) | Số lượng (P2) |
| Gà thịt, vịt, cút thịt | Lô theo đợt nuôi, đếm con, đợt ngắn (30–90 ngày) | Con xuất chuồng (con, kg) | Số lượng (P2) |
| Gà đẻ, cút đẻ, vịt đẻ | **Đàn nuôi liên tục**, đếm con | **Trứng thu hằng ngày** (quả), gà loại thải | Số lượng + **Sản phẩm thu hằng ngày** (P7) |
| Chim bồ câu, chim yến | Đàn/cặp, đếm con hoặc cặp | Trứng, chim non, chim thịt | Sản phẩm thu hằng ngày + **Cá thể / cặp** (P8) |
| Dúi, nái heo, heo đực giống | **Từng cá thể hoặc cặp**, chu kỳ dài | Con giống, con thịt | **Cá thể / cặp sinh sản** (P8) |
| Thủy sản (cá, tôm) – về sau | Lô theo ao, đếm con, kg | Cá/tôm thu | Số lượng + đo môi trường nước (phiếu đo) |

**Ba khái niệm chung cần thêm**
1. **Đơn vị đếm của sản phẩm** (cây, con, quả, trứng, cặp): đặt ở danh mục sản phẩm, để mọi màn hình biết đang đếm gì.
2. **Sản phẩm thu hằng ngày** (trứng, sữa, mật): ghi nhanh mỗi ngày không gắn việc thu hoạch cuối vụ; đàn liên tục không "kết thúc vụ" như cây trồng.
3. **Cá thể / cặp sinh sản**: mã thẻ, ngày sinh, bố mẹ, phối – đẻ – cai sữa; tách riêng khỏi hồ sơ lô. Chỉ bật cho mô hình cần.

**Chế độ đơn giản** (cho mô hình nhỏ): gói loại hình quyết định mục nào hiện ra. Hộ nuôi gà 200 con chỉ thấy: Ghi việc, Cho ăn, Thu trứng/xuất bán, Chết/loại, Chi phí; không thấy bảng kiểm VietGAP hay quy trình dài. Muốn thêm thì chủ bật. Cùng một app, màn hình gọn theo nhu cầu.

**Dùng được ngay hôm nay (chưa cần làm gì thêm):** tạo sản phẩm là vật nuôi, tạo chuồng, tạo đàn như một vụ, ghi nhật ký với loại việc tự tạo, quản lý thức ăn/thuốc trong kho, ghi xuất bán và chi phí, ghi sự cố. **Chưa có:** đếm số con và tỉ lệ hao, thu trứng hằng ngày, cân và chỉ số tăng trọng, lịch tiêm theo ngày tuổi, sổ in. Chính các lát bên dưới lấp những chỗ này.

**Giới hạn thành thật:** với dúi, chim và các loài đặc thù, bộ khung dùng được nhưng **quy trình kỹ thuật và bảng kiểm riêng cần tài liệu của bạn** (như đã làm với dưa và heo). Không có tài liệu thì app chỉ cho gói "Đàn nhỏ" chung (mục 4).

## 2. Nguyên tắc kiến trúc (đã chốt)
1. Bốn lớp dữ liệu cấu hình, không viết mã riêng cho từng loại hình: **danh mục** (sản phẩm, loại việc + trường, vật tư) · **bản ghi** (nhật ký, thu hoạch/xuất, sự cố, phiếu đo, số lượng) · **quy trình mẫu** (giai đoạn, mốc, ngưỡng) · **sổ mẫu** (in, Excel, bảng kiểm).
2. **Gói loại hình** = trọn bộ cấu hình cho một mô hình, áp dụng một lần rồi tự sửa. Loại hình mới = thêm gói, không sửa lõi.
3. VietGAP là phần *ghi chép tuân thủ*; C.P. và các chỉ số năng suất là phần *tính từ cùng dữ liệu*. Không nhập hai lần.
4. Máy chủ ép quy tắc quan trọng (cách ly/ngưng thuốc, quyền, giới hạn); biểu mẫu chỉ quyết định hỏi gì. Cảnh báo kèm lý do, không chặn cứng.
5. Số liệu pháp lý và kỹ thuật (ngày cách ly, lịch vaccine, mật độ, số chỉ tiêu bảng kiểm) **do trại nhập hoặc xác nhận**; gói chỉ gợi ý có ghi "cần đối chiếu".
6. Ghi việc hằng ngày của nhân viên dùng được offline; thiết lập, sửa, báo cáo cần mạng (D24).

## 3. Lộ trình duy nhất (làm lần lượt P1 → P9)
Mỗi giai đoạn: một hoặc vài migration `..._app_*.sql`, test CSDL gọn cho logic mới, typecheck một lần, commit từng mốc, cập nhật DECISIONS/STATUS. "Cỡ": nhỏ ≈ một phiên, vừa ≈ 2–3 phiên, lớn ≈ nhiều phiên.

### P1. Nền dữ liệu chung + bộ trường dưa (cỡ vừa) — gộp L1, L2, A
- **Vật tư**: hoạt chất/thành phần, số đăng ký, nhóm, nhà sản xuất; **số lô và hạn sử dụng**, nhắc sắp hết hạn, gợi ý xuất trước (FIFO).
- **Vụ**: cán bộ kỹ thuật phụ trách; mã trang trại/lô/chuồng; **đơn vị đếm** ở danh mục sản phẩm (cây, con, quả, trứng, cặp).
- **Sự cố**: thêm *nguyên nhân*; loại mới *thiết bị/nhà màng*, *kim tiêm gãy*, *chết/loại thải*.
- **Thu hoạch/xuất**: mã lô tự sinh, ghi cả *số đơn vị* (quả/con) lẫn kg.
- **Bộ trường dưa theo sổ VietGAP** (ươm, ngâm ủ, ra vườn, bón phân kèm EC/pH, phun thuốc kèm dụng cụ, lý do, hiệu quả).
- *Xong khi*: nhập vật tư có hoạt chất, lô, hạn; ghi thu hoạch có mã lô và số quả; ghi một lần phun theo đúng cột sổ VietGAP.

### P2. Biến động số lượng + mật độ + tỉ lệ hao (cỡ vừa) — B
- Sự kiện: nhập/trồng, dặm, chết, loại, chuyển ô, xuất. Cho ra số còn lại, tỉ lệ hao, **mật độ (số lượng ÷ diện tích)**; cảnh báo vượt mật độ khi trại đặt giới hạn.
- Dùng cho số cây dưa, số heo, số gà. Chết/loại ghi nhanh một chạm, offline được.
- *Xong khi*: đàn 500 con, ghi 3 con chết, thấy còn 497, hao 0,6 %, mật độ m²/con.

### P3. Phiếu đo tổng quát + chỉ số tính (cỡ vừa–lớn) — C, L4
- **Phiếu đo** theo vụ hoặc khu chuồng (nhập một ngày, sao chép hôm qua): dưa (nhiệt độ ngày/đêm, độ ẩm, pH/EC vào–ra, số lần tưới), heo/gà (cân mẫu, nhiệt độ, độ ẩm chuồng).
- **Ngưỡng theo giai đoạn**, biểu đồ, cảnh báo nhẹ khi ngoài ngưỡng, nhắc chưa đo hôm nay.
- **Chỉ số tính**: tăng trọng ngày (ADG), **FCR** (thức ăn đã xuất cho vụ ÷ tăng trọng), ngày nuôi, giá thành mỗi kg, tỉ lệ đẻ (gà đẻ, ở P7).
- *Xong khi*: nhập cân mẫu hai lần và cám đã xuất, app hiện ADG và FCR; nhập EC ngoài khoảng, app nhắc.

### P4. Quy trình mẫu có mốc hai chiều + nhắc việc (cỡ vừa) — D, L3, T6
- Quy trình = giai đoạn + việc + mục tiêu/ngưỡng + **mốc**: *lùi từ ngày thu/xuất* (ngưng phân 7 ngày, ngưng tưới 5 ngày, ngưng thuốc) và *tiến theo ngày tuổi/ngày bắt đầu* (vaccine, tẩy giun).
- Tự sinh nhắc việc ở Trang chủ; đổi ngày thu dự kiến thì mốc tự dời.
- Nhập quy trình: **dưa lưới 5 giai đoạn và 13 mốc** (đã có tài liệu), **heo thịt 2 giai đoạn** + lịch vaccine (thú y của trại chốt). Cảnh báo **trống chuồng ít hơn 7 ngày** trước khi nhập lứa mới.
- *Xong khi*: tạo vụ dưa từ mẫu, thấy nhắc "ngưng bón phân" đúng ngày; tạo lứa heo, thấy nhắc tiêm theo ngày tuổi.

### P5. Sổ mẫu in/Excel + bảng kiểm + lịch kiểm tra định kỳ (cỡ vừa–lớn) — E, L5, T5
- **Sổ mẫu**: định nghĩa sổ gồm nhiều trang, cột lấy từ trường bản ghi hoặc giá trị tính (ngày hết cách ly, tổng phân, số lần phun…). Xem trên màn hình, **in A4 ngang**, **xuất Excel**. Đầu sổ có thông tin cơ sở, giấy VietGAP, chữ ký.
- Sổ đầu tiên: **VietGAP dưa lưới 7 trang** (theo mẫu bạn gửi); kế đến **VietGAP heo**.
- **Bảng kiểm nội bộ VietGAP** (mỗi chỉ tiêu Đạt / Không đạt / Không áp dụng + bằng chứng), theo năm; cần bảng chính thức của bạn.
- **Kiểm tra đầy đủ hồ sơ**: liệt kê thiếu sót (thiếu người làm, phun trong cách ly, vật tư thiếu hoạt chất/cách ly, chưa đo, thu chưa Brix…).
- **Lịch kiểm tra định kỳ**: mẫu nước uống, nước thải, hố sát trùng, tự đánh giá hằng năm; có kết quả và tệp đính kèm; lưu tối thiểu 2 năm.
- *Xong khi*: bấm "In sổ" ra bản giống mẫu Excel của bạn; có danh sách "cần bổ sung" trước khi nộp.

### P6. Gói loại hình trọn bộ cho dưa và heo thịt (cỡ vừa) — F, L6
- Gói = trường + việc + quy trình + ngưỡng + sổ + vật tư gợi ý + màn hình hiện ra. Áp dụng một lần (thay cho "Bộ mẫu" chỉ có trường hiện nay).
- **Dưa lưới VietGAP**, **Heo thịt VietGAP**, và **lớp phủ C.P.**: danh mục cám C.P., FCR/ADG nổi bật, báo cáo sản lượng cho công ty, (nếu gia công) tiền công theo kg tăng trọng.
- *Xong khi*: tạo cơ sở mới, chọn "Heo thịt VietGAP", có ngay đủ việc, quy trình, sổ và nhắc.

### P7. Đàn nhỏ + sản phẩm thu hằng ngày (cỡ vừa) — mới
- **Thu hằng ngày** (trứng, sau này sữa, mật): ghi nhanh số quả/ngày, số vỡ/loại, bán; tỉ lệ đẻ = trứng ÷ số mái.
- **Chế độ đơn giản** theo gói; **gói "Đàn nhỏ" chung** (gà thịt, gà đẻ, cút, vịt, chim): vài việc cơ bản, cho ăn, thuốc/vaccine, chết–loại, thu trứng/xuất, chi phí.
- Gói riêng cho từng loài (gà thịt, gà đẻ, cút, bồ câu…) thêm dần khi có tài liệu kỹ thuật.
- *Xong khi*: hộ nuôi 300 gà đẻ ghi trứng mỗi ngày trong 30 giây và thấy tỉ lệ đẻ, hao hụt, chi phí cám trên 1.000 quả.

### P8. Cá thể và cặp sinh sản (cỡ lớn) — G
- Hồ sơ cá thể/cặp: mã thẻ tai/QR, ngày sinh, bố mẹ, trạng thái; **phối → ngày dự kiến đẻ** (heo +114 ngày; số ngày theo loài) → đẻ (số sống, chết, dị tật) → cai sữa; tuổi phối lần đầu, thay đàn.
- Dùng cho nái, đực giống, dúi giống, bồ câu cặp, đàn giống gà. Nhắc phối, đẻ, cai sữa.
- *Xong khi*: nhập một nái, phối, thấy ngày dự kiến đẻ và nhắc, ghi đẻ ra đàn con gắn mẹ.

### P9. Tùy chọn theo nhu cầu thực tế
Gia công C.P. (hợp đồng, nhận giống–cám, tiền công/thưởng FCR) · hồ sơ nhân công (tập huấn, khám sức khỏe) · truy xuất công khai theo lô · nhập số liệu cảm biến/thời tiết · thủy sản. Chọn theo phản hồi của hộ dùng thử.

## 4. Gói loại hình theo thứ tự ưu tiên
1. **Dưa lưới nhà màng VietGAP** (P1 → P6).
2. **Heo thịt VietGAP** (P4 → P6), rồi lớp phủ **C.P.**
3. **Đàn nhỏ chung** + **gà thịt** + **gà đẻ** (P7); **cút, bồ câu** khi có tài liệu.
4. **Nái / dúi / đực giống** (P8).
5. Thủy sản và các loài khác (P9) theo yêu cầu.

## 5. Bạn cần làm gì để việc trôi chảy
| Khi | Bạn cung cấp / làm |
|---|---|
| Trước P1 | Duyệt kế hoạch này; cho biết **hộ nuôi heo nuôi thịt hay nái, chuồng kín hay hở, có gia công C.P. không** |
| Trước P4 | Chốt lịch vaccine heo với **thú y của trại** (app không tự quyết); quy trình dưa lưới đã có |
| Trước P5 | **Bảng kiểm VietGAP chăn nuôi chính thức** (số chỉ tiêu, nội dung), mẫu sổ thực tế của hộ nuôi heo |
| Trước P7 | Mô tả ngắn mô hình gà/chim/dúi của bạn: quy mô, ghi gì mỗi ngày, bán gì; tài liệu kỹ thuật nếu có |
| Sau mỗi giai đoạn | `npx supabase db push`, `git push`, thử trên điện thoại theo mục "Xong khi" |

## 6. Rủi ro và cách giảm
- **Phình to khó dùng**: mỗi gói có chế độ đơn giản; mỗi màn ngắn gọn; thêm bằng cách bật mục, không nhồi vào mọi màn.
- **Số liệu kỹ thuật sai gây hại** (ngày cách ly, vaccine): không cài cứng, ghi "cần đối chiếu", trại xác nhận; cảnh báo chứ không tự quyết.
- **Tài liệu thiếu cho loài đặc thù**: cung cấp bộ khung và gói "Đàn nhỏ"; gói riêng chỉ làm khi có tài liệu.
- **Đổi cấu hình làm lệch nhật ký cũ**: trường lưu theo khóa ổn định, bản ghi cũ giữ nguyên.
- **Chậm do làm quá rộng**: làm theo thứ tự P1 → P9, mỗi giai đoạn dùng được độc lập; dừng sau bất kỳ giai đoạn nào vẫn có sản phẩm hoàn chỉnh.

## 7. Tình trạng hiện tại so với lộ trình
Đã xong: T1 (diện tích, năng suất), T3 (sự cố và việc khắc phục), form động, thời gian cách ly kèm lý do, bộ mẫu trường (dưa, heo sơ bộ), dữ liệu mẫu. **Chưa `db push` 0063–0079.** Việc kế tiếp: P1.
