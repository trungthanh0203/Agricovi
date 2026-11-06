# Rà soát tạo vụ / quản lý vụ và đề xuất làm gọn cho người nông dân

Trạng thái: **ĐỀ XUẤT, chờ chủ sản phẩm duyệt** (9/11/2026). Chưa viết code.

## 1. Cách rà soát
Đọc lại màn Tạo vụ (`CreateCycleScreen`), Chi tiết vụ (`CycleDetailScreen`), Sửa vụ, các hàm tạo vụ ở CSDL (0024, 0102–0104, 0135–0137, 0178–0180) và các kế hoạch loại sản phẩm (trồng trọt, heo, thủy sản). Đối chiếu với các tình huống thực tế của hộ trồng trọt, chăn nuôi, thủy sản và HTX.

## 2. Các tình huống: hệ thống đã đáp ứng chưa?

### 2.1 Trồng trọt
| Tình huống | Hiện trạng | Đánh giá |
|---|---|---|
| Cây ngắn ngày, một lần thu (rau, lúa) | Quy trình mẫu + thu hoạch | Đáp ứng |
| Cây thu nhiều đợt (dưa, ớt, cà chua) | Nhiều phiếu thu hoạch/vụ | Đáp ứng |
| Gieo ươm rồi đưa ra ô trồng | Công đoạn chuẩn bị riêng + nối tiếp (D124–D126) | Đáp ứng nhưng **khó hiểu** |
| Trồng dặm, thay cây, cây chết | Sự kiện số lượng (nhập, chết, loại, xuất) | Đáp ứng |
| Nhiều vụ cùng lúc trong một ô, trồng xen | Chỗ trống theo diện tích, dùng chung diện tích (0179) | Đáp ứng |
| Ghi việc / chi phí chung cho nhiều vụ cùng ô | Ghi việc chung, chia chi phí (0180) | Đáp ứng |
| Vụ đang chạy dở khi vào app | Bắt đầu từ giữa chừng (0178) | Đáp ứng |
| Nhận cây con từ nơi khác (đã qua 1–2 công đoạn) | Bắt đầu giữa chừng + ghi chú nguồn | **Một phần**: chưa nối nhà cung ứng, lô giống, chi phí mua |
| **Cây lâu năm** (sầu riêng, cà phê, tiêu, cây ăn trái) | Vẫn là "vụ" có ngày bắt đầu và kết thúc | **Thiếu**: chưa có "tuổi cây / năm trồng", chu kỳ chăm sóc theo năm, vụ không kết thúc cố định |

### 2.2 Chăn nuôi, thủy sản
| Tình huống | Hiện trạng | Đánh giá |
|---|---|---|
| Nuôi theo lứa, nhập và xuất đồng loạt (heo thịt, gà thịt, tôm) | Vụ = lứa, số con, hao hụt, FCR, cân mẫu | Đáp ứng |
| Nhập thêm đợt, ghép đàn | Sự kiện "nhập thêm" | Đáp ứng |
| Xuất bán từng phần | Phiếu xuất + sự kiện xuất | Đáp ứng |
| Nhiều ao, nhiều ngăn chuồng | Mỗi ô một ao/ngăn; nhiều vụ trong ô theo diện tích | Đáp ứng |
| **Nuôi liên tục** (bò sữa, gà đẻ, heo nái, ong): không xuất đồng loạt, thu hằng ngày | Phải tạo một "vụ" rất dài | **Thiếu**: chưa có kiểu "đàn nuôi liên tục", đàn mẹ → con |
| Mật độ nuôi, cảnh báo quá tải | Tính mật độ, chưa so tiêu chuẩn | Một phần |

### 2.3 Điểm khởi đầu, quyền, cơ sở
| Tình huống | Hiện trạng | Đánh giá |
|---|---|---|
| **Cơ sở chưa có ô** | Màn Tạo vụ chỉ báo "hãy thêm phân khu ở Khai báo" | **Ngõ cụt**: người dùng phải thoát ra, đi qua Khai báo, quay lại |
| **Chưa có quy trình mẫu / sản phẩm chưa có quy trình** | Báo "hãy vào Khai báo → Quy trình mẫu", sản phẩm không hiện | **Ngõ cụt** (đặc biệt với hộ mới) |
| Hộ thuộc HTX (ghi theo HTX hay hộ riêng) | Lựa chọn "Vụ này ghi theo" | Đáp ứng, câu chữ dài |
| Hết hạn mức gói | Báo rõ, gợi ý "Chưa bắt đầu" | Đáp ứng |
| Mất mạng khi tạo vụ | Cần mạng (đúng D24) | Đáp ứng theo thiết kế |
| Tạo lại vụ giống vụ trước (vụ sau cùng ô, cùng giống) | Phải nhập lại từ đầu | **Thiếu** "làm lại như vụ trước" |
| Nhập sai quy trình sau khi tạo | Không đổi quy trình được | **Thiếu** (cho vụ chưa bắt đầu việc nào) |

## 3. Vấn đề lớn nhất: màn Tạo vụ quá dài và nhiều khái niệm
Một trang hiện có **20+ ô và lựa chọn** cùng lúc: ghi theo ai, sản phẩm, quy trình, ô, khung chỗ trống, tên vụ, giống, diện tích, số lượng, dùng chung diện tích, nguồn giống/lô, chuẩn bị (3 lựa chọn), trạng thái (2), vụ đang ở đâu (2 + bảng việc), nối tiếp vụ, kế hoạch sản lượng/ngân sách, mã vụ, đơn vị đếm, cán bộ phụ trách, ngày, danh sách việc. Hệ quả cho người ít quen công nghệ:
- Không biết **phải điền gì trước, gì có thể bỏ qua** (nhiều ô nâng cao nằm lẫn với ô bắt buộc).
- Khái niệm khó: *chuẩn bị trong toàn diện tích / khu riêng / nối tiếp / dùng chung diện tích / trạng thái Chuẩn bị khác Đang sản xuất / bắt đầu từ giữa chừng*.
- Cùng một thông tin (diện tích, giống) nằm ở nhiều chỗ khác nhau giữa Tạo vụ, Sửa vụ, Chi tiết vụ.
- Gặp ngõ cụt (chưa có ô, chưa có quy trình) thì bỏ cuộc.

## 4. Đề xuất: tạo vụ theo từng bước hỏi (mỗi bước 1–3 câu)

Nguyên tắc: **hỏi theo thứ tự người nông dân nghĩ**, mỗi lần một ý, có nút Tiếp/Quay lại và thanh "Bước 2/4", mặc định thông minh để phần lớn chỉ cần chạm Tiếp. Bắt buộc rõ ràng, nâng cao gom lại.

**Bước 1 — Làm gì, ở đâu?**
- *Sản phẩm* (tự chọn nếu cơ sở chỉ có một; nhớ lần trước), *Ô sản xuất* (hiện ngay "còn trống … m²").
- **Hết ngõ cụt**: chưa có ô → ô nhập nhanh "Tên ô + diện tích" ngay tại chỗ; chưa có quy trình → nút lớn **"Dùng quy trình mẫu của hệ thống"** (một chạm, rồi sửa sau); sản phẩm lạ → thêm nhanh.
- Hộ thuộc HTX: câu hỏi "Ghi theo HTX hay hộ riêng?" chỉ hiện khi thật sự có hai lựa chọn.

**Bước 2 — Bao nhiêu? (đều bắt buộc)**
- *Giống*, *Diện tích* (nút **Cả ô** / **Phần trống**, đơn vị nhớ lần trước), *Số lượng* (tên đơn vị theo loại: cây, con).
- Mật độ tự tính. Vượt chỗ trống thì cảnh báo ngay tại đây.
- *Tên vụ* hiển thị dạng một dòng tự sinh, bấm ✎ để sửa (vẫn bắt buộc có tên).

**Bước 3 — Bắt đầu thế nào?** (ba thẻ lớn thay cho nhiều ô nhỏ)
1. **Bắt đầu mới ngay hôm nay** (mặc định).
2. **Bắt đầu mới vào ngày khác** (chọn ngày; ngày tương lai thì lưu ở trạng thái Chuẩn bị, ngày quá khứ thì hỏi thêm).
3. **Đang làm dở / nhận từ nơi khác** → bảng việc (chọn cột *Đang làm*), hai ngày, chi phí ước tính.
- Hai khái niệm khó **chuyển vào "Tùy chọn nâng cao" thu gọn, nói bằng lời thường**: "Vụ này chờ vụ khác kết thúc mới bắt đầu" (nối tiếp) và "Ươm / chuẩn bị ở khu khác" (khu riêng). Bỏ chữ "Chuẩn bị trong toàn diện tích".

**Bước 4 — Xem lại và tạo**
- Một thẻ tóm tắt (sản phẩm, ô, giống, diện tích, số lượng, ngày bắt đầu, ngày dự kiến thu, số việc) và danh sách việc.
- Mục thu gọn **"Thông tin thêm (làm sau cũng được)"**: nguồn giống, lô nhập, ngày gieo/trồng, kế hoạch sản lượng/ngân sách, mã vụ, người phụ trách, đơn vị đếm.
- Một nút **Tạo vụ**.

**Đường tắt cho người đã quen:** nút **"Làm lại như vụ trước"** ở danh sách vụ và Chi tiết vụ đã kết thúc: sao sản phẩm, quy trình, ô, giống, diện tích, số lượng; chỉ hỏi ngày bắt đầu và xác nhận.

**Mặc định thông minh:** sản phẩm, ô, quy trình, đơn vị diện tích của lần trước; tên tự sinh; ngày hôm nay; đơn vị đếm theo loại.

Ghi chú kỹ thuật: bố cục mới là thay đổi **giao diện**; quy tắc ở CSDL (bắt buộc tên/giống/diện tích/số lượng, chỗ trống, kiểm hạn mức, giữa chừng) **giữ nguyên**, chỉ thêm vài hàm nhỏ (nhân bản vụ, đổi quy trình).

## 5. Quản lý vụ: gọn và cùng bố cục với tạo vụ
- Chi Tiết vụ chia **4 nhóm rõ ràng** thay vì xếp nhiều khối dài liền nhau: **Tiến độ** (việc đang làm, việc đến hạn, Ghi việc, việc cần làm tiếp) · **Số liệu** (số lượng còn lại, thu hoạch, chi phí, doanh thu, lãi) · **Thông tin vụ** (giống, diện tích, số lượng, nguồn giống, ngày, chuẩn bị, nối tiếp, mã QR, công khai website) · **Sổ sách** (sổ nhật ký, sự cố, kiểm tra).
- **Sửa vụ dùng đúng các bước và thứ tự của Tạo vụ** (đã là quy ước dự án: form sửa cùng chỗ, cùng trường với form thêm). Thông tin nâng cao nằm trong một mục thu gọn.
- Một nút chính mỗi màn (ví dụ "Ghi việc"), các thao tác ít dùng (tạm dừng, hủy, kết thúc) gom vào menu ⋯.
- **Đổi quy trình** cho vụ chưa có việc nào bắt đầu và chưa có nhật ký (hàm máy chủ nhỏ): sửa được lỗi chọn nhầm quy trình mà không phải hủy vụ.

## 6. Bổ sung tình huống còn thiếu (theo ưu tiên)
1. **Hết ngõ cụt khi chưa có ô / quy trình** (trong Bước 1). Giá trị rất cao cho hộ mới.
2. **Làm lại như vụ trước**; **đổi quy trình** khi chưa bắt đầu.
3. **Nhận từ nơi khác** hoàn chỉnh (GĐ2 của kế hoạch giữa chừng): chọn nhà cung ứng, nhập số lượng, giá mua, số lô → tạo chi phí mua giống và lô giống, truy xuất ghi nguồn giống.
4. **Cây lâu năm**: kiểu vụ "Chu kỳ chăm sóc theo năm" cho vườn cây (ngày trồng/tuổi cây, nhiều năm, vụ chia theo năm hoặc mùa thu hoạch).
5. **Đàn nuôi liên tục** (bò sữa, gà đẻ, heo nái): kiểu "đàn" không có xuất đồng loạt, theo dõi số con, sản phẩm thu hằng ngày (trứng, sữa), các đợt nhập/loại.
6. (Hướng mở) cảnh báo mật độ so với tiêu chuẩn; ngày thu hoạch dự kiến từ tuổi cây/con; gợi ý quy trình theo giống.

## 7. Giai đoạn
- **GĐ-A (làm trước, giá trị cao nhất):** Tạo vụ theo bước (mục 4) + hết ngõ cụt + mặc định thông minh + Làm lại như vụ trước + gom các khái niệm khó vào nâng cao.
- **GĐ-B:** Tổ chức lại Chi tiết vụ và Sửa vụ theo 4 nhóm, dùng chung bố cục với Tạo vụ; đổi quy trình khi chưa bắt đầu.
- **GĐ-C:** Nhận từ nơi khác hoàn chỉnh; cây lâu năm; đàn nuôi liên tục (cần chốt mô hình dữ liệu riêng, sẽ đề xuất chi tiết trước khi làm).

## 8. Cần chủ sản phẩm quyết định
1. Đồng ý **chuyển Tạo vụ sang từng bước** (4 bước) thay cho một trang dài?
2. Đồng ý **chuyển Chuẩn bị riêng và Nối tiếp vào "Tùy chọn nâng cao"** với câu chữ đời thường, và gọi tên ba thẻ ở Bước 3 như trên?
3. Đồng ý **nút "Dùng quy trình mẫu của hệ thống" và thêm ô nhanh tại chỗ** để hết ngõ cụt?
4. Làm **"Làm lại như vụ trước"** trong GĐ-A?
5. Thứ tự GĐ-A → GĐ-B → GĐ-C; cây lâu năm và đàn nuôi liên tục có ưu tiên hơn GĐ-B không (tùy nhóm khách hàng đầu tiên bạn triển khai)?
