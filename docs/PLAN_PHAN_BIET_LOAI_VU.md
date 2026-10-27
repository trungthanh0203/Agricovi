# Kế hoạch: phân biệt vụ trồng trọt / vật nuôi / thủy sản (điểm 2, 4, 5 của mục F)

*Soạn 27/10/2026, chờ chủ sản phẩm duyệt. Điểm 1 và 3 đã làm (Tạo vụ đổi thứ tự, bộ sổ chung cho thủy sản).*

## Điểm 4. Vật nuôi ở mô hình 1–2 không tính được Tăng trọng/FCR (cỡ S, không migration)
**Đã kiểm tra trong mã:** Tăng trọng và FCR đọc hai nguồn của vụ: (a) việc **"Cân heo"** (số con cân, cân nặng TB) ở Ghi việc; (b) cám đã dùng từ **Kho** (vật tư nhóm Thức ăn, đơn vị kg) **hoặc** ô "kg cám" của việc "Cho ăn" ở Ghi việc. Nên vụ vật nuôi cần **Ghi việc** (hoặc Kho). Mô hình 1 ẩn cả hai, mô hình 2 ẩn Kho, nên khối Tăng trọng/FCR trống mà không nói lý do.

**Cách làm (không thêm cách nhập mới, tránh nhập hai nơi):**
1. Chi tiết vụ vật nuôi, mô hình chưa bật Ghi việc: khối "Tăng trọng và FCR" hiện lời giải thích "cần bật Ghi việc để ghi Cân heo và Cho ăn" kèm nút **Bật Ghi việc cho vụ này** (dùng mục tùy chọn đã có).
2. Màn Chọn cách quản lý, khi sản phẩm của vụ là vật nuôi: tự **tích sẵn Ghi việc** ở mục tùy chọn và ghi chú lý do.
3. "Việc cần làm tiếp": thêm dòng "Ghi lần cân đầu tiên" khi đã có số con nhập mà chưa có lần cân nào (vật nuôi, Ghi việc đang bật).
4. Thủy sản: nút và lời giải thích chỉ hiện khi đã có phiếu cân chung (để sau); trước mắt giữ ẩn.

**Kiểm thử:** test thuần cho nextSteps; không cần test CSDL.

## Điểm 5. Tổng kết vụ theo loại (cỡ M, không migration)
**Hiện trạng:** Tổng kết vụ tính theo kg và m² (năng suất kg/1.000 m², chi phí/doanh thu/lãi trên diện tích, giá thành/kg). Vật nuôi cần theo con.

**Cách làm (tính ở máy từ dữ liệu đã có: số lượng, phiếu thu hoạch, chi phí, doanh thu):**
- Vụ **vật nuôi/thủy sản** thay khối "trên 1.000 m²" bằng khối **"Theo con"**: số con nhập, chết + loại, xuất, **tỉ lệ hao %**, kg xuất bán, **kg trung bình mỗi con xuất**, **chi phí mỗi con xuất**, **doanh thu mỗi con**, **lãi/lỗ mỗi con**, giá thành mỗi kg (đã có); Tăng trọng và FCR lấy từ khối cân (nếu có).
- Vụ **trồng trọt** giữ nguyên.
- Số liệu thiếu (chưa nhập số con, chưa có thu hoạch kèm số con) thì ghi rõ "chưa có" và nhắc nhập, không tự đoán.
- Phần tính đặt ở một hàm thuần (`summaryByKind`) để test được.

**Kiểm thử:** test thuần với vài bộ số mẫu (heo: nhập 100, chết 3, xuất 95; cá: chỉ kg).

## Điểm 2. Tách đầu việc và gói trường theo loại (cỡ L, có migration)
**Vấn đề đã xác nhận:** đầu việc và biểu mẫu riêng (field_schema) gắn theo **cơ sở**, bản chỉnh nằm ở `org_catalog_overrides` khóa (cơ sở, mục). Áp "gói heo" ghi đè form Thu hoạch của dưa; Ghi việc hiện mọi đầu việc.

**Thiết kế:**
1. **Đầu việc có "áp dụng cho loại"**: cột `work_types.applies_to text[]` (rỗng = mọi loại). Các việc do gói tạo ra được gắn sẵn loại (gói heo → vật nuôi; việc dưa → trồng trọt). Việc dùng chung như Thu hoạch áp dụng mọi loại.
2. **Biểu mẫu theo loại**: thêm cột `kind` (rỗng = mọi loại) vào khóa của `org_catalog_overrides`. Một việc (ví dụ Thu hoạch) có thể có form riêng cho trồng trọt và cho vật nuôi. Thứ tự chọn form cho một vụ: bản chỉnh đúng loại → bản chỉnh "mọi loại" → bản gốc. Bản chỉnh hiện có tự thành "mọi loại", nên **cơ sở đang dùng không thấy thay đổi**.
3. **Gói trường áp theo loại**: gói dưa ghi bản chỉnh loại trồng trọt, gói heo ghi loại vật nuôi; hai gói không còn ghi đè nhau.
4. **Ghi việc và Thu hoạch** chỉ hiện đầu việc đúng loại của vụ (việc ghi cho phân khu không gắn vụ thì theo loại của phân khu); form Thu hoạch lấy theo loại của vụ.
5. **Màn Đầu việc**: mỗi việc có ô "Áp dụng cho" (Tất cả / Cây trồng / Vật nuôi / Thủy sản) và khi sửa biểu mẫu thì chọn loại đang sửa.

**Các bước (mỗi bước dùng được và thử được riêng):**
| Bước | Nội dung | Ghi chú |
|---|---|---|
| 2a | Migration + cách chọn form theo loại trong `useCatalog` (chưa đổi giao diện) | Không đổi hành vi hiện tại; test CSDL và test thuần |
| 2b | Ghi việc và Thu hoạch lọc đầu việc và chọn form theo loại của vụ | Bước người dùng thấy rõ nhất |
| 2c | Màn Đầu việc: "Áp dụng cho" và sửa form theo loại; gói trường áp theo loại | Cần chạy lại gói cho cơ sở đang dùng cả hai loại |
| 2d | Gắn loại cho đầu việc dùng chung và việc đã tạo từ gói heo; rà đồng bộ offline (Dexie) | Dữ liệu cũ không đổi nghĩa |

**Rủi ro:** (a) nhật ký cũ ghi theo form cũ vẫn phải hiển thị (đã lưu theo khóa ổn định, không ảnh hưởng); (b) đồng bộ offline: bản lưu trên máy đổi cấu trúc nên cần nâng phiên bản Dexie; (c) sổ nhật ký tìm việc theo tên/mã nên giữ nguyên cách tìm.

## Thứ tự đề xuất
**Điểm 4 → điểm 5 → điểm 2** (nhỏ và không đụng CSDL trước, phần lớn sau). Nếu muốn theo thứ tự cũ (2 trước) thì vẫn làm được vì ba điểm độc lập.

## Cần chủ sản phẩm quyết
1. Đồng ý cách điểm 4: bật Ghi việc thay vì thêm ô nhập cám/cân riêng?
2. Điểm 5: danh sách chỉ số "Theo con" ở trên đã đủ chưa, cần thêm/bớt gì?
3. Điểm 2: cơ sở đang có đầu việc/biểu mẫu đã chỉnh thì cho thành "mọi loại" (không đổi gì), và chỉ khi chạy lại gói mới tách theo loại; đồng ý?
4. Thứ tự: 4 → 5 → 2 hay theo thứ tự cũ?

## Quyết định của chủ sản phẩm (27/10/2026) và tiến độ
1. **Ghi việc luôn hiện ở mọi mô hình** (không ẩn). Việc nào bắt buộc phải có ghi việc thì app nhắc nhập (đã làm: khung "Nhắc an toàn thực phẩm" ở Thu hoạch khi vụ chưa ghi việc nào).
2. **Đầu việc cơ bản định nghĩa sẵn theo chuẩn từng loại** (trồng trọt, vật nuôi, thủy sản) để dùng ngay, người dùng tự thêm việc khác nếu cần → thuộc điểm 2 (làm sau cùng).
3. Điểm 4: **bật Ghi việc, vẫn thêm ô nhập cân và cám riêng** → ĐÃ XONG (migration 0105: ô "Ghi lần cân", "Ghi cám đã dùng"; bật Tăng trọng/FCR cho thủy sản).
4. Điểm 5: danh sách chỉ số "Theo con" đủ → ĐÃ XONG (khối "Theo con" ở Tổng kết vụ cho vật nuôi và thủy sản).
5. Điểm 2: cơ sở đã chỉnh sẵn giữ thành "mọi loại", chỉ tách khi chạy lại gói; thứ tự 4 → 5 → 2 → còn lại điểm 2.
