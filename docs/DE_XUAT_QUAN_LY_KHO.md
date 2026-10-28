# Rà soát Quản lý kho và đề xuất bổ sung (28/10/2026, chờ chủ sản phẩm quyết)

## Hiện trạng đã kiểm tra trong mã
- **Nhập kho**: số lượng, đơn giá, lô và hạn dùng; **điều chỉnh** tăng/giảm có lý do (kiểm kê, hỏng).
- **Xuất kho gắn vụ** chỉ có **một đường**: tick "Vật tư đã dùng" khi **Ghi việc**. Giao dịch mang mã nhật ký và mã vụ, giá vốn bình quân do máy chủ tính, trừ kho theo lô (hạn gần nhất trước). Giá vốn này vào **Tổng kết vụ** (giá vốn vật tư đã dùng) và là nguồn **cám cho Tăng trọng/FCR** của vụ nuôi.
- **Xuất kho tay** (Quản lý kho → Xuất kho): chỉ 4 lý do **Hao hụt/hỏng, Xuất bán, Dùng chung, Khác**, bắt buộc ghi lý do; **không gắn vụ nào** (ràng buộc CSDL: xuất tay không có nhật ký). Màn còn ghi "xuất để dùng cho việc đồng áng thì ghi ở Ghi việc".
- **Chuyển kho** giữa hai kho (tổng tồn không đổi, theo lô); **tồn âm** chỉ cảnh báo; **báo sắp hết** theo ngưỡng của vật tư; **hủy** giao dịch bằng bút toán ngược; sổ kho chỉ thêm, không sửa/xóa.

## Điều bạn nhận thấy là đúng: có lỗ hổng
Muốn tính vật tư vào một vụ thì **bắt buộc đi qua Ghi việc**. Thực tế còn các tình huống không có nhật ký đi kèm:
1. Thủ kho **phát vật tư ra chuồng/nhà màng** theo ngày hoặc theo tuần (ví dụ cám cho một chuồng heo, phân cho nhà màng), người làm không ghi từng việc.
2. Chủ nhập lại số liệu **sau** (đến cuối tuần mới xuất cho cả vụ).
3. **Dùng chung cho nhiều vụ** (thuốc sát trùng chuồng, vôi ao): "Dùng chung" hiện không tính vào vụ nào, nên giá thành mỗi vụ **thiếu** khoản này.
4. Vật tư **dùng không hết**, trả lại kho: chưa có cách ghi nhận trả về.
Hệ quả: giá thành vụ và **FCR** (chỉ đọc cám xuất cho vụ) có thể thiếu hoặc lệch; kho và nhật ký không khớp nhau.

## Đề xuất bổ sung (xếp theo giá trị)
| # | Đề xuất | Nội dung | Cỡ | Cần migration |
|---|---|---|---|---|
| K1 | **Xuất cho vụ** | Thêm lý do **"Dùng cho vụ"**: chọn vụ đang chạy (và công đoạn/việc nếu muốn), không bắt buộc nhật ký. Giao dịch mang mã vụ nên vào giá vốn Tổng kết vụ và FCR. Quyền như xuất tay (người sửa Kho) | M | Có (nới ràng buộc: xuất tay có thể gắn vụ) |
| K2 | **Dùng chung chia cho các vụ** | Xuất "Dùng chung" chọn nhiều vụ hoặc cả phân khu và **chia theo tỉ lệ** (đều, theo diện tích hoặc số con) thành các dòng chi phí cho từng vụ | M–L | Có |
| K3 | **Trả vật tư về kho** | Nhập lại từ vụ (hoàn trả), trừ khỏi giá vốn của vụ đó | S–M | Có (loại giao dịch trả, gắn vụ) |
| K4 | **Phiếu xuất/nhập nhiều dòng** | Một phiếu có người nhận, ngày, nhiều vật tư; in/xuất PDF; số phiếu | M | Có |
| K5 | **Kiểm kê định kỳ** | Phiên kiểm kê: liệt kê tồn sổ, nhập số đếm thực tế, tạo điều chỉnh hàng loạt, lưu người kiểm | M | Có |
| K6 | **Cảnh báo hạn dùng** | Khối "Sắp hết hạn" (30/7 ngày) theo lô ở Quản lý kho và Trang chủ; chặn hoặc cảnh báo khi xuất lô hết hạn (đã có ô lý do) | S–M | Không |
| K7 | **Báo cáo kho** | Nhập–xuất–tồn theo kỳ, giá trị tồn, vật tư dùng theo vụ/phân khu, hao hụt theo lý do | M | Có (hàm báo cáo) |
| K8 | **Liên kết nhập kho với hóa đơn mua** | Nhập kho chọn hóa đơn của nhà cung ứng để công nợ và tồn khớp nhau (cần kiểm tra mức liên kết hiện có) | M | Có |
| K9 | **Cho mượn / trả** | Xuất "cho mượn" có người mượn, hạn trả, nhắc đòi | S–M | Có |

## Đề xuất của tôi
1. **Làm K1 trước** (giải quyết đúng điều bạn thấy, cỡ vừa) kèm **K6** (nhỏ, không đụng CSDL).
2. Sau đó **K3** (hoàn trả) và **K2** (chia dùng chung) để giá thành vụ đầy đủ.
3. **K5, K7** khi kho đã nhập đều; **K4, K8, K9** theo nhu cầu thực tế của hộ thử.

## Cần chủ sản phẩm quyết
1. Đồng ý làm **K1 + K6** trước?
2. "Xuất cho vụ" có **bắt buộc chọn công đoạn/việc** không, hay chỉ chọn vụ (đề xuất: chỉ chọn vụ, việc không bắt buộc)?
3. Ai được xuất cho vụ: chỉ người có quyền sửa Kho (đề xuất), hay cả tổ trưởng/nhân viên khi xuất cho vụ của mình?
4. Vật tư dùng chung (K2): chia theo cách nào mặc định (đều, theo diện tích)?

## Quyết định và tiến độ (28/10/2026)
- Chủ sản phẩm duyệt: làm **K1** trước; **chỉ cần chọn vụ** (công đoạn/việc không bắt buộc); **người có quyền sửa Kho** được xuất cho vụ; vật tư dùng chung chia cho các vụ **theo diện tích** (K2, làm sau).
- **K1 xong về code (migration 0122)**: Quản lý kho → Xuất kho có lý do **Dùng cho vụ** (mặc định), chọn vụ chưa kết thúc, ghi chú không bắt buộc (tự ghi "Xuất cho vụ …"). Giao dịch mang mã vụ nên vào giá vốn vật tư của Tổng kết vụ và cám vào Tăng trọng/FCR; chặn vụ đã kết thúc hoặc hủy, vụ cơ sở khác, người không có quyền sửa Kho. Test `stock_issue_cycle`.
- **K6 đã có từ trước**: khối "Lô vật tư sắp hết hạn" (hết hạn và sắp hết hạn trong 30 ngày) ở Trang chủ và Quản lý kho (`ExpiringLots`); đề xuất K6 ban đầu của tôi bỏ sót điều này. Nếu muốn mốc 7 ngày hoặc cảnh báo khi xuất lô sắp hết hạn thì làm thêm nhỏ.
- Còn lại: K3 (trả về kho), K2 (chia dùng chung theo diện tích), K5, K7, K4, K8, K9.
- **K3 và K2 xong về code (migration 0123)**: Quản lý kho có nút **Trả về kho** (chọn vụ, vật tư đã xuất cho vụ, số lượng tối đa = đã xuất trừ đã trả; máy chủ tự tính đơn giá bình quân đã xuất cho vụ, trừ giá vốn vật tư của vụ; cám trả về trừ khỏi cám của FCR; chỉ vụ chưa kết thúc) và xuất **Dùng chung chia cho các vụ** (chọn vụ; chia theo diện tích m², vụ không có diện tích thì lấy diện tích phân khu, thiếu diện tích ở bất kỳ vụ nào thì chia đều, phần dư vào vụ cuối; có xem trước cách chia). Test `stock_issue_cycle`.
- **K8 đã có từ trước**: nút "Mua theo hóa đơn" (nhập kho theo hóa đơn nhà cung ứng); mục K8 trong đề xuất ban đầu cần đối chiếu lại, chưa phải thiếu hoàn toàn.
- **K4 thu hẹp (28/10/2026)**: "Mua theo hóa đơn" đã là phiếu **nhập nhiều dòng** (nhà cung ứng, số hóa đơn, nhiều vật tư, lô và hạn dùng, số tiền đã trả, hạn thanh toán), nên **không làm thêm phiếu nhập riêng**. Phần còn thiếu chỉ là: (a) **xuất nhiều dòng một lần** (phát phân, thuốc cho một vụ trong một phiếu) và (b) nhập kho **không hóa đơn nhiều dòng** (tự sản xuất, được tặng). Đề xuất: chỉ làm (a), gộp vào màn Xuất kho bằng nút "+ Thêm vật tư"; (b) dùng "Nhập kho" từng dòng như hiện nay, làm sau nếu hộ thấy bất tiện. In/xuất PDF phiếu để sau.
- **Gộp nhập kho (28/10/2026, theo đề xuất của chủ sản phẩm)**: chỉ còn **một** nút **Nhập kho** (bỏ nút "Mua theo hóa đơn" riêng). Màn Nhập kho có nhiều dòng vật tư (số lượng, đơn giá không bắt buộc, số lô, hạn dùng), ngày nhập và kho. Tích **"Mua có hóa đơn"** thì hiện thêm nhà cung ứng, số hóa đơn, tổng tiền, đã trả, hình thức trả và hạn thanh toán (tạo hóa đơn, nhập kho, ghi lần trả cùng lúc; cần mạng và quyền sửa Chi phí); không tích thì chỉ nhập kho, dùng được cả khi offline. Việc "xuất nhiều dòng một lần" (K4a) vẫn chưa làm.
