# Kế hoạch G2-2 — Nhà cung ứng và công nợ phải trả (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: D58-3 (một bảng Đối tác có cờ, hai màn riêng), D58-4 (công nợ đơn giản: ghi lần thanh toán, tính còn nợ), D58-5 (thông tin nhà cung ứng mặc định không công khai), `PLAN_GIAI_DOAN_2_APP.md`.
Trạng thái: **đã duyệt 23/10/2026** (đổi hạn mặc định thành **1 tháng sau ngày mua**, bỏ quy tắc theo ngày kết thúc vụ). **P1, P2, P3 đã làm xong về code** (P3: Báo cáo → Công nợ, trả tiền, thẻ ở Trang chủ); P4 (báo cáo "Mua theo nhà cung ứng") chưa làm.

## 1. Điều chủ sản phẩm đã trả lời (23/10/2026)

1. Lúc trả ngay, lúc mua nợ → có công nợ.
2. Một nhà cung ứng thường bán nhiều loại hàng → hóa đơn **nhiều dòng**, nhà cung ứng không gắn một loại hàng cố định.
3. Có ghi **số hóa đơn** và **hạn thanh toán**; tạm lấy hạn = **ngày kết thúc vụ**.
4. Quyền xem giá và công nợ: **gộp với mục Chi phí** (không thêm mục quyền mới).

## 2. Mô hình dữ liệu (đề xuất)

Ba bảng mới, mọi thứ thuộc về một cơ sở, mặc định riêng tư (quản trị nền tảng và website không đọc):

- **`partners`** (Đối tác): tên, điện thoại, địa chỉ, mã số thuế, tài khoản ngân hàng, ghi chú, **loại hàng thường mua** (chữ tự do, chỉ để nhớ), cờ `is_supplier` / `is_customer` (cờ khách hàng để sẵn cho G2-4), trạng thái đang dùng/dừng, phiên bản.
- **`purchase_bills`** (Hóa đơn mua): nhà cung ứng, số hóa đơn, ngày mua, **hạn thanh toán**, **tổng tiền**, vụ liên quan (không bắt buộc, dùng để lấy hạn mặc định), ghi chú; hủy = đánh dấu kèm lý do, không xóa; phiên bản.
- **`bill_payments`** (Lần thanh toán): hóa đơn, ngày trả, số tiền, hình thức (tiền mặt/chuyển khoản), ghi chú; hủy = đánh dấu kèm lý do.

Nối với phần đã có (chỉ thêm cột, không đổi dữ liệu cũ):
- `inventory_transactions.bill_id` (các dòng nhập kho thuộc hóa đơn nào). Giao dịch kho vẫn **chỉ thêm**; chỉ gắn lúc tạo.
- `expense_records.partner_id` (chi phí mua của ai, để báo cáo; **không** tạo công nợ ở lát này).

Tính toán, không lưu trùng:
- **Còn nợ của một hóa đơn** = tổng tiền − các lần trả chưa hủy.
- **Còn nợ của một nhà cung ứng** = cộng các hóa đơn chưa hủy của họ.
- **Quá hạn / sắp đến hạn** theo hạn thanh toán của từng hóa đơn còn nợ.
- Tiền trả **không phải chi phí** (tiền mua vật tư đã tính khi dùng, theo A39/D19), nên **không làm sai báo cáo chi phí và giá thành**.

## 3. Quyền (gộp với Chi phí)

- Xem danh bạ, hóa đơn, công nợ, giá: `has_perm(cơ sở, 'expenses', 'view')`.
- Thêm/sửa/trả/hủy: `has_perm(cơ sở, 'expenses', 'edit')`.
- Không thêm mục quyền mới nên **không phải sửa `role_default_perm` và `permissions.ts`**.
- Hệ quả cần biết: người chỉ có quyền Kho (nhập kho) mà không có quyền Chi phí sẽ **không chọn được nhà cung ứng** khi nhập kho. Với vai trò **Kho & chi phí** và chủ thì có cả hai, không ảnh hưởng.

## 4. Màn hình

1. **Nhập kho theo hóa đơn** (Sản xuất → Kho → Nhập kho, bổ sung): khối "Mua của nhà cung ứng" không bắt buộc (không điền thì nhập kho như hiện nay). Điền thì: chọn nhà cung ứng (có nút thêm nhanh), số hóa đơn, **nhiều dòng vật tư** (vật tư, số lượng, đơn giá), tổng tiền tự cộng (sửa được kèm cảnh báo nếu lệch), **đã trả bao nhiêu** (bằng tổng = trả ngay, 0 = nợ hết, giữa hai số = trả một phần), **hạn thanh toán**. Một lần bấm Lưu tạo hóa đơn + các dòng nhập kho + lần trả đầu (nếu có) **cùng lúc, hoặc không gì cả**.
2. **Khai báo → Nhà cung ứng**: danh bạ (thêm/sửa/dừng), xem được lịch sử mua và còn nợ của từng nơi.
3. **Báo cáo → Công nợ**: danh sách nhà cung ứng và tổng còn nợ, mở ra thấy từng hóa đơn (số hóa đơn, tổng, đã trả, còn nợ, hạn, nhãn **Quá hạn / Sắp đến hạn / Còn hạn**); nút **Trả tiền** cho một hóa đơn, và **Trả cho nhà cung ứng** nhập một số tiền tự trừ vào các hóa đơn **cũ nhất trước**.
4. **Trang chủ → Tôi cần làm**: thẻ "Hóa đơn quá hạn / sắp đến hạn (N, tổng X đồng)" cho người có quyền Chi phí.
5. **Báo cáo theo nhu cầu**: thêm loại "Mua theo nhà cung ứng" (nhóm theo nhà cung ứng/tháng), xuất CSV.

**Hạn thanh toán mặc định:** nếu chọn "vụ liên quan" thì lấy ngày dự kiến kết thúc của vụ đó; không chọn thì lấy ngày kết thúc xa nhất trong các vụ đang sản xuất; không có vụ nào thì để trống bắt nhập. Luôn sửa được.

## 5. Quy tắc an toàn

- **Ghi bằng hàm ở máy chủ**, mỗi lần ghi có mã tạo sẵn ở app nên bấm lặp không nhân đôi; sửa/hủy có **phiên bản + op_id** (gặp xung đột thì tải lại và báo).
- Không trả quá số còn nợ; số tiền là số nguyên đồng ≥ 0.
- **Hủy hóa đơn không đảo kho** (kho chỉ thêm); nếu hàng thực sự không nhập thì dùng điều chỉnh tồn kho. App nói rõ điều này khi hủy.
- **Hủy lần trả** thì nợ tăng lại. Mọi thay đổi ghi audit.
- Cần mạng cho toàn bộ chức năng này (theo D24); không đưa vào hàng đợi offline.
- Dữ liệu giá và nợ chỉ người có quyền Chi phí xem; kiểm ở CSDL (RLS) chứ không chỉ ở giao diện.

## 6. Các lát nhỏ

| Lát | Nội dung | Cỡ | CSDL |
|---|---|---|---|
| P1 | Migration + hàm: `partners`, `purchase_bills`, `bill_payments`, cột nối, hàm `create_partner`, `update_partner`, `record_purchase` (hóa đơn + dòng nhập + lần trả, một giao dịch), `pay_bill`, `pay_partner` (trả theo thứ tự cũ nhất), `void_bill`, `void_payment`, `get_payables`; test về quyền, tính nợ, trả theo thứ tự, hủy, tách cơ sở, khách chưa đăng nhập | L | Có (`..._app_partners_payables.sql`) |
| P2 | Màn Nhà cung ứng + Nhập kho theo hóa đơn nhiều dòng | L | Không |
| P3 | Màn Công nợ + thẻ ở Trang chủ + trả tiền | M | Không |
| P4 | Báo cáo "Mua theo nhà cung ứng" + hiện nhà cung ứng trong lịch sử nhập kho | S–M | Có (thêm loại báo cáo) |

Phụ thuộc: cần `db push` migration của lát này; **không cần** G2-1. G2-3 (chụp hóa đơn) sau đó sẽ dùng đúng bảng hóa đơn này.

## 7. Cần bạn xác nhận

1. **Hóa đơn nhiều dòng** trong Nhập kho (một lần nhập nhiều vật tư): đồng ý? Hiện Nhập kho chỉ nhập từng vật tư một.
2. **Hạn mặc định** theo quy tắc ở mục 4: đồng ý?
3. **Trả chung cho nhà cung ứng tự trừ vào hóa đơn cũ nhất trước**: đồng ý?
4. **Chi phí khác** (thuê máy, dịch vụ…) chưa có công nợ ở lát này, chỉ gắn nhà cung ứng để báo cáo; sau này mở rộng nếu cần: đồng ý?
5. Hóa đơn đã nhập có cho **sửa số hóa đơn, hạn thanh toán, tổng tiền** sau khi lưu không? (Đề xuất: cho sửa số hóa đơn, hạn, ghi chú; **không** sửa tổng tiền và dòng hàng, muốn sửa thì hủy hóa đơn và nhập lại, để kho và nợ luôn khớp.)
