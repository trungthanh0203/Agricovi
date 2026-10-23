# Kế hoạch G2-4 — Khách hàng và công nợ phải thu (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: D58-3 (một bảng Đối tác có cờ, hai màn riêng), D58-4 (công nợ đơn giản), D76 (G2-2 đã làm nhà cung ứng và công nợ phải trả), `PLAN_GIAI_DOAN_2_APP.md`. G2-3 (chụp hóa đơn) tạm hoãn theo quyết định 23/10/2026.
Trạng thái: **đã duyệt 23/10/2026** (6 điểm đồng ý; hạn thu tiền do người dùng nhập). Đang làm Q1, Q2. Cách làm **đối xứng với G2-2** để dùng lại tối đa phần đã chạy ổn; các quyết định tương tự G2-2 được lấy làm mặc định, chủ sản phẩm chỉ cần sửa chỗ nào không hợp.

## 1. Mô hình dữ liệu (đề xuất)

- **Khách hàng dùng chung bảng `partners`** với nhà cung ứng (đã có cờ `is_customer`). Một đơn vị vừa mua vừa bán chỉ là một dòng có cả hai cờ. Cần thêm: loại khách (bán lẻ, thương lái, siêu thị/bếp ăn, doanh nghiệp, HTX khác), "nhu cầu thường mua", nhãn phân loại. Hàm `update_partner` mở rộng để bật/tắt cờ.
- **`sales_records` (doanh thu bán) thêm cột**: khách hàng (không bắt buộc), số phiếu bán, hạn thu tiền. Bản ghi bán cũ không có khách = **bán thu tiền ngay, không tính công nợ** (không đổi gì dữ liệu cũ, không đổi tổng kết vụ).
- **Bảng mới `sale_receipts`** (lần thu tiền của một lần bán): ngày thu, số tiền, hình thức (tiền mặt/chuyển khoản), ghi chú; hủy = đánh dấu kèm lý do. Giống `bill_payments`.
- **Còn phải thu của một lần bán** = số tiền bán − các lần thu chưa hủy; **của một khách** = cộng các lần bán chưa hủy của khách đó. Chỉ lần bán **có chọn khách** mới thành công nợ.
- Tiền thu nợ **không phải doanh thu mới** (doanh thu đã ghi lúc bán), nên **tổng kết vụ và báo cáo doanh thu không đổi**.

## 2. Quyền: gộp với mục Doanh thu

- Xem danh bạ khách, công nợ phải thu, báo cáo: quyền **xem Doanh thu**. Thêm/sửa/thu tiền/hủy: quyền **sửa Doanh thu**.
- Không thêm mục quyền mới, không phải sửa `role_default_perm` và `permissions.ts`.
- Dữ liệu khách hàng là **dữ liệu cá nhân**: mặc định riêng tư, **không lên website**, quản trị nền tảng không đọc được. Số điện thoại khách chỉ hiện với người có quyền xem Doanh thu (đã đủ bằng quyền gộp).

## 3. Màn hình

1. **Khai báo → Khách hàng**: danh bạ (thêm/sửa/dừng), xem lịch sử mua và còn nợ của từng khách. Nếu tên trùng nhà cung ứng đã có thì gợi ý "Đánh dấu thêm là khách hàng" thay vì tạo trùng.
2. **Báo cáo → Doanh thu → ghi lần bán**: thêm ô **Khách hàng** (chọn/thêm nhanh), **Đã thu** (bằng tổng = thu đủ ngay, 0 = chưa thu, ở giữa = thu một phần), **Hạn thu tiền** (**do người dùng tự nhập**, không có mặc định, như hạn trả nợ ở G2-2; để trống được thì không nhắc quá hạn), số phiếu bán. Một lần Lưu tạo lần bán + lần thu đầu cùng lúc hoặc không gì cả.
3. **Báo cáo → Công nợ**: gộp thành **hai tab "Phải trả" và "Phải thu"** trong cùng một màn. Tab phải thu giống tab phải trả: tổng còn phải thu, quá hạn, sắp đến hạn; theo từng khách, từng lần bán (số phiếu, ngày bán, hạn, đã thu, còn thu); nút **Thu tiền**, **Thu của khách** (tự trừ vào lần bán cũ nhất trước), xem/hủy lần thu, sửa số phiếu và hạn, hủy lần bán còn nợ.
4. **Trang chủ → Tôi cần làm**: thẻ "Khoản phải thu quá hạn / sắp đến hạn (N, tổng X đồng)" cho người có quyền xem Doanh thu.
5. **Báo cáo theo nhu cầu**: loại mới **"Doanh thu theo khách hàng"** (nhóm theo khách/tháng/vụ: số lần bán, số lượng, doanh thu, đã thu, còn thu; có xuất CSV).

## 4. Quy tắc an toàn (giống G2-2)

- Ghi bằng hàm ở máy chủ: `record_sale` (lần bán + lần thu đầu, một giao dịch), `collect_sale`, `collect_partner` (thu của khách, trừ lần bán cũ nhất trước), `void_sale_receipt`, `get_receivables`; mã tạo sẵn ở app nên bấm lặp không ghi hai lần; sửa/hủy có phiên bản.
- Không thu quá số còn nợ. Số tiền bán **không giảm xuống thấp hơn tiền đã thu**. Không hủy lần bán còn lần thu chưa hủy (hủy các lần thu trước).
- Đơn vị bán vẫn khóa kg (D21).
- Cần mạng cho toàn bộ chức năng (theo D24).
- Mọi thay đổi ghi audit.

## 5. Các lát nhỏ

| Lát | Nội dung | Cỡ | CSDL |
|---|---|---|---|
| Q1 | Migration + hàm + test: mở rộng đối tác, cột và bảng thu tiền, hàm bán/thu/hủy, công nợ phải thu, báo cáo, quyền, cô lập cơ sở, dữ liệu bán cũ không đổi | L | Có |
| Q2 | Khai báo → Khách hàng; ghi lần bán có khách, đã thu, hạn (trong Doanh thu) | L | Không |
| Q3 | Công nợ hai tab, thu tiền, thẻ ở Trang chủ | M | Không |
| Q4 | Báo cáo "Doanh thu theo khách hàng" | S–M | Có |

Phụ thuộc: cần `db push` migration của lát này; dựa trên G2-2 (đã `db push` 0055–0056 và thử ổn). **Không** gồm đơn đặt hàng/báo giá/khách tiềm năng từ website (thuộc G2-5).

## 6. Cần bạn xác nhận

1. Dùng chung bảng Đối tác, một đơn vị vừa mua vừa bán chỉ một dòng hai cờ: đồng ý?
2. Chỉ lần bán **có chọn khách** mới thành công nợ; bán không chọn khách coi như thu tiền ngay: đồng ý?
3. Quyền gộp với **Doanh thu** (như G2-2 gộp với Chi phí): đồng ý?
4. ~~Hạn thu tiền mặc định 1 tháng~~ → **đã quyết 23/10/2026: người dùng tự nhập hạn thu tiền** (cả hạn trả nợ ở G2-2 cũng đã đổi thành tự nhập).
5. **Công nợ hai tab Phải trả / Phải thu** trong cùng một màn Công nợ: đồng ý?
6. Số điện thoại khách có cần **ẩn với người chỉ có quyền xem** (không có quyền sửa)? (Đề xuất: chưa, vì quyền xem Doanh thu vốn đã hạn chế.)
