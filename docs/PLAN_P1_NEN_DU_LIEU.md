# Kế hoạch chi tiết P1: nền dữ liệu chung + bộ trường dưa và heo thịt

*Soạn 25/10/2026, **chờ chủ sản phẩm duyệt trước khi làm**. Thuộc `KE_HOACH_TONG_THE.md` (D97). Bối cảnh mới: hộ nuôi heo **nuôi thịt, không gia công C.P., chuồng nửa kín nửa hở (sau này kín hết)**; có thêm file `Bangkiem_SoNhatky_nuoiheo_VietGAP.xlsx`.*

## 1. File bảng kiểm và sổ heo cho biết gì
File gồm **bảng kiểm VietGAP 45 tiêu chí** (đã kiểm: đúng **31 loại A bắt buộc 100 % và 14 loại B yêu cầu ≥ 50 %**; kèm phương pháp đánh giá và cột bằng chứng) và **4 sổ** đánh số theo biểu mẫu chính thức:

| Sổ | Biểu mẫu | Cột chính |
|---|---|---|
| Quản lý đàn và giống | 2.1–2.11 | ngày, mã chuồng/ô, thẻ tai/mã lô, loại lợn, số con, khối lượng TB, hoạt động (nhập cách ly, chuyển chuồng, cân, xuất bán, phối, đẻ), sức khỏe, người làm |
| Thức ăn và nước | 2.12–2.14 | loại hoạt động (nhập kho cám, xuất cám, kiểm tra nước, tự phối trộn), tên thức ăn, **mã lô/hạn dùng**, nhà cung cấp, kg, chuồng/lứa dùng, cảm quan, chứng nhận |
| Thú y và vaccine | 3.22–3.26 | mã lợn/ô, vaccine/thuốc, **nhà sản xuất/số lô**, liều và cách dùng, mục đích/triệu chứng, **thời gian ngừng thuốc**, **sự cố kim gãy**, kết quả |
| Vệ sinh và môi trường | 3.16–3.21 | **khu vực/dãy chuồng** (cổng, khuôn viên, biogas, dãy chuồng), hạng mục, hóa chất, nồng độ, số lượng chất thải, kết quả, **người thực hiện và người kiểm tra** |

**Đối chiếu với kế hoạch tổng thể:** phần lớn khớp P1–P5 như đã dự kiến. Có 4 điều mới cần đưa vào thiết kế:
1. Sổ vệ sinh ghi theo **khu vực** (cổng, hố sát trùng, biogas, khuôn viên), không theo vụ. Khu vực này không phải nơi nuôi, nên cần phân biệt *khu nuôi* và *cơ sở vật chất*.
2. Sổ nào cũng cần **mã chuồng/ô**; hiện app chỉ có tên trang trại.
3. Cám và thuốc cần **số lô và hạn dùng**, gắn vào từng lần xuất cho lứa nuôi (truy xuất "cám lô nào cho lứa nào ăn").
4. Có cột **người kiểm tra** (người thứ hai xác nhận) bên cạnh người thực hiện.

**Chỗ trong file cần hiểu đúng** (không phải lỗi, nhưng đừng cài cứng): mọi dòng ví dụ đều "Đạt" và bằng chứng mô tả trại kín cooling pad, **không đúng với chuồng nửa kín nửa hở** của hộ bạn; thời gian cách ly nhập giống ghi 14–21 ngày (bảng kiểm), 21 ngày (sổ), trong khi tài liệu VietGAP ghi 14–30 và C.P. ghi 30–45 cho nái hậu bị; thời gian ngừng thuốc 14, 21, 28 ngày theo từng thuốc (đúng nguyên tắc: **lấy từ nhãn thuốc**); sổ đàn lẫn việc của nái (phối, đẻ) với heo thịt, hộ thịt chỉ dùng phần liên quan. Hộ nên **xác nhận số loại A/B với bản bảng kiểm chính thức** của đơn vị chứng nhận.

## 2. Phạm vi P1 (đã chỉnh theo file mới)
Gồm 7 hạng mục, chia 3 mốc commit. Không gồm: số lượng và hao hụt (P2), cân và FCR (P3), quy trình và nhắc (P4), sổ in (P5).

### P1.1 Khu vực và chuồng
- `production_areas` thêm: **mã** (ví dụ `C-THIT-02`, duy nhất trong cơ sở, không bắt buộc), **loại khu** (*khu nuôi* | *cơ sở vật chất*: cổng, kho, biogas, khu cách ly, hố sát trùng), **kiểu chuồng** (*kín | nửa kín | hở*, chỉ lưu và hiển thị; sau này quyết định chỉ tiêu nào áp dụng, ví dụ nhiệt độ ghi tay hằng ngày với chuồng hở).
- Khu *cơ sở vật chất* không tạo được vụ, chỉ ghi việc.
- **Ghi việc cho khu vực không gắn vụ** (màn Ghi việc): chọn "Khu vực" thay vì "Vụ". CSDL đã cho phép, giao diện chưa có. Dùng cho sổ vệ sinh, sát trùng cổng, biogas, bẫy chuột, kiểm tra nước.
- *Xong khi*: tạo "Cổng chính" (cơ sở vật chất), ghi "Thay thuốc hố sát trùng" cho khu đó không cần vụ; tạo "Dãy chuồng thịt C-THIT-02" kiểu nửa kín.

### P1.2 Vật tư: thuộc tính, lô và hạn dùng
- Vật tư thêm: **nhóm** (thức ăn, thuốc thú y, vaccine, thuốc BVTV, phân bón, thuốc sát trùng, giống, khác; quyết định hành vi: cách ly chỉ hiện cho thuốc/vaccine/BVTV; FCR sau này lấy nhóm *thức ăn*), **hoạt chất/thành phần**, **số đăng ký/lưu hành**, **nhà sản xuất**.
- **Lô**: bảng `material_lots` (số lô, hạn dùng, ngày nhập). Phiếu nhập kho có thêm *Số lô* và *Hạn dùng* (không bắt buộc).
- **Tự gắn lô khi xuất** theo nguyên tắc **hạn gần nhất xuất trước (FIFO)**: nhân viên không phải chọn lô; sổ có cột "Mã lô" nhờ đó. Nếu không lô nào đủ số lượng thì để trống và nhắc ở bước kiểm tra đầy đủ (P5).
- **Cảnh báo hạn**: lô sắp hết hạn (30 ngày) hiện ở Báo cáo tuần và Trang chủ; **xuất lô đã hết hạn phải ghi lý do** (cùng cách với cách ly).
- *Xong khi*: nhập 100 kg cám lô A (hạn 90 ngày) và 100 kg lô B; ghi xuất cho lứa heo, thấy lô A được gắn; lô hết hạn bị đòi lý do.

### P1.3 Vụ / lứa nuôi
- Thêm: **cán bộ kỹ thuật/thú y phụ trách** (tên, điện thoại; có thể là người ngoài cơ sở), **mã lô/đàn** (ví dụ `LO-THIT-10`, mã tự đặt, duy nhất trong cơ sở), **đơn vị đếm** (cây, con, quả… mặc định theo sản phẩm: cây trồng "cây", vật nuôi "con"), để nhãn "Số cây/Số con" đúng.
- *Xong khi*: lứa heo hiện "Số con", mã lô, thú y phụ trách; dưa hiện "Số cây".

### P1.4 Thu hoạch / xuất bán
- Thêm: **mã lô thu hoạch/xuất tự sinh** (mã vụ + số thứ tự, ví dụ `LO-THIT-10/L01`), **số quả/số con** (ngoài kg; cho ra khối lượng TB mỗi quả/con), và **dữ liệu theo form động** của việc "Thu hoạch" (độ Brix, phân loại, nơi nhận… với dưa; thẻ tai, giấy kiểm dịch… với heo).
- Lưu trong cột dữ liệu mới của phiếu thu hoạch; form lấy trường từ danh mục việc "Thu hoạch" nên sửa được như các việc khác.
- *Xong khi*: ghi xuất 50 con, 5.125 kg: phiếu có mã lô, hiện 102,5 kg/con; dưa ghi thêm Brix 13,8.

### P1.5 Sự cố (bổ sung T3)
- Thêm **nguyên nhân** và loại **thiết bị/nhà màng/chuồng**, **kim tiêm gãy**. Nhãn "Sâu bệnh" đổi thành "Sâu bệnh / dịch bệnh" theo sản phẩm.
- **Quy tắc kim gãy**: còn sự cố kim gãy *chưa xử lý* thì xuất/bán vụ đó phải ghi lý do (cảnh báo kèm lý do, cùng cơ chế cách ly). Đóng sự cố sau khi đã đánh dấu và xử lý cá thể.
- *Xong khi*: báo kim gãy ở lứa heo, thử xuất bán thấy cảnh báo đòi lý do; đóng sự cố thì hết cảnh báo.

### P1.6 Bộ trường theo sổ thật
- **Dưa lưới**: ươm/ngâm ủ/gieo khay/ra vườn/dặm/treo dây; bón phân (giai đoạn dinh dưỡng, EC, pH, liều); phun thuốc (dụng cụ, lý do, đánh giá hiệu quả); thu hoạch (Brix, phân loại).
- **Heo thịt** (thay bộ sơ bộ hiện có), theo 3 sổ: *Cho ăn* (nhóm cám; khẩu phần), *Kiểm tra nước* (pH, E.coli, kết quả), *Tự phối trộn*; *Tiêm vaccine*, *Điều trị bệnh*, *Tẩy giun sán* (mục đích/triệu chứng, liều, cách dùng, **có gãy kim**), *Cân heo* (số con cân, KL TB; tạm thời, P3 sẽ chuyển thành phiếu đo); *Sát trùng* (khu vực, hóa chất, nồng độ, kết quả, **người kiểm tra**), *Thay thuốc hố sát trùng*, *Xử lý chất thải/Biogas* (số lượng xử lý), *Diệt côn trùng và chuột*, *Vệ sinh và để trống chuồng*.
- Thuốc, vaccine, cám, hóa chất chọn ở ô "Vật tư đã dùng" (trừ kho, tính cách ly, gắn lô) nên **không lặp trong form**.
- "Người kiểm tra" tạm là ô chữ; ký xác nhận đúng nghĩa làm ở P5.
- *Xong khi*: ghi một lần tiêm vaccine và một lần sát trùng cổng theo đúng cột sổ.

### P1.7 Tài liệu
Cập nhật Hướng dẫn trong app, `HUONG_DAN_THU.md`, DECISIONS (D98), STATUS.

## 3. Cách làm và thứ tự commit
| Mốc | Nội dung | Migration (tên) | Test mới |
|---|---|---|---|
| **M1** | P1.1 khu vực + P1.3 vụ | `..0080_app_areas_cycle_fields.sql` | `areas_fields` |
| **M2** | P1.2 vật tư, lô, hạn dùng, FIFO | `..0081_app_material_lots.sql` | `material_lots` (nhập lô, FIFO, không đủ lô, hết hạn cần lý do) |
| **M3** | P1.4 thu hoạch + P1.5 sự cố + P1.6 gói trường | `..0082_app_harvest_incident_fields.sql` | `harvest_fields`, mở rộng `field_packs` |

Mỗi mốc: giao diện đi kèm, commit riêng; chỉ chạy các file test mới (không chạy cả bộ); typecheck một lần ở cuối mốc. Không `db push`/`git push` thay bạn. Dự kiến cỡ: M1 nhỏ–vừa, M2 vừa–lớn, M3 vừa.

## 4. Điều cần bạn quyết định (kèm đề xuất)
1. **Lô khi xuất**: tự gắn theo FIFO (nhân viên không phải chọn) hay bắt chọn lô mỗi lần? *Đề xuất: tự gắn.*
2. **Xuất lô hết hạn**: bắt buộc ghi lý do (như cách ly) hay chỉ cảnh báo? *Đề xuất: bắt buộc lý do.*
3. **Khu cơ sở vật chất** (cổng, biogas, kho) là loại khu riêng, không tạo vụ. *Đề xuất: đồng ý.*
4. **Phiếu thu hoạch/xuất** dùng form động của việc "Thu hoạch" để lưu Brix, thẻ tai… *Đề xuất: đồng ý.*
5. **Kim gãy chưa xử lý ⇒ xuất bán phải ghi lý do.** *Đề xuất: đồng ý.*
6. **Đưa bảng kiểm 45 tiêu chí lên ngay sau P1** (gọi P1B): dữ liệu bạn đã có đủ, độc lập với phần còn lại, hộ nuôi heo cần để xin chứng nhận. Bảng kiểm: mỗi tiêu chí Đạt/Chưa đạt/Không áp dụng + bằng chứng, tự kết luận (A đạt 100 %, B ≥ 50 %), lưu theo năm. Sổ in/Excel vẫn ở P5. *Đề xuất: đồng ý.*
7. **Kiểu chuồng** (kín/nửa kín/hở) chỉ lưu và hiển thị ở P1; ảnh hưởng chỉ tiêu và ngưỡng làm ở P3. *Đề xuất: đồng ý.*
8. Xác nhận **31 A / 14 B** với bản bảng kiểm chính thức của đơn vị chứng nhận (file đã kiểm đếm khớp, nhưng nguồn mức A/B cần đối chiếu).

## 5. Rủi ro
- **Lô và FIFO** là phần phức tạp nhất. Giảm bằng: lô là tùy chọn (vật tư không có lô vẫn xuất như cũ), gắn lô là "nỗ lực tốt nhất", không chặn ghi việc của nhân viên.
- **Ghi việc cho khu vực** đụng quyền ghi nhật ký: kiểm kỹ quyền theo cơ sở và phạm vi trang trại (D83) bằng test.
- **Đổi nhãn theo sản phẩm** (cây/con) không đổi dữ liệu cũ.
- **Gói trường mới thay gói cũ**: nhật ký cũ giữ nguyên số liệu; nhắc rõ khi áp dụng.
