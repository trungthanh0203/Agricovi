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
