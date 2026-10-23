# Kế hoạch G2-5 — Khách tiềm năng, đơn đặt hàng từ website và ghi doanh thu (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: D58-6 (yêu cầu từ website tự vào "Khách tiềm năng"), D66–D70 (website đã có Giao thương, đơn đặt hàng, báo giá, đánh giá, lịch mùa vụ, huy hiệu), D76–D77 (nhà cung ứng, khách hàng, công nợ), `PLAN_GIAI_DOAN_2_APP.md`.
Trạng thái: **đã duyệt 23/10/2026** (7 điểm đồng ý; tên mục đổi thành **"Đơn khách từ website"**). **R1–R5 đã làm xong về code** (migration 0058–0060). Còn thử tay trên máy thật.

## 1. Hiện trạng đã kiểm tra trong mã

- Website **đã làm xong** luồng bán: khách gửi yêu cầu báo giá; người mua đặt đơn (`placed`), nhà cung cấp báo giá (`quoted`), người mua chốt (`accepted`), chuẩn bị, giao, hoàn tất; ghi nhận thanh toán ngoài hệ thống. Mọi thao tác đều là **hàm ở CSDL** kiểm quyền theo người đăng nhập.
- Phía bán dùng quyền **chủ, quản lý hoặc biên tập hồ sơ** của cơ sở (`can_edit_profile`). Tài khoản nhân viên bị chặn.
- Hiện app chỉ có thẻ "Việc chờ từ website" **đếm** rồi mở website. Người bán phải rời app để xử lý.
- Sản phẩm niêm yết trên website có thể **gắn với một vụ** (để truy xuất nguồn gốc). Dòng hàng của đơn trỏ về sản phẩm niêm yết, nên từ đơn suy ra được vụ nào đã sản xuất hàng đó.

**Phát hiện quan trọng:** app và website dùng **chung một tài khoản và cùng CSDL**, nên app gọi thẳng được các hàm có sẵn của website (`my_quote_requests`, `set_my_quote`, `list_orders`, `get_order`, `quote_order`, `order_action`, `set_order_payment`). **Không phải sửa hàm hay bảng của website**, đúng ranh giới giữa hai chat. Phần mới chỉ là giao diện trong app và vài bảng/hàm riêng phía app.

## 2. Mục tiêu

Người bán xử lý yêu cầu và đơn từ website **ngay trong app**, biến người hỏi mua thành khách hàng, và khi giao hàng xong thì **ghi doanh thu cho đúng vụ** kèm công nợ phải thu (G2-4), không phải gõ lại.

## 3. Màn hình

Một mục mới **Báo cáo → "Đơn khách từ website"** (đặt trước "Hồ sơ website" luôn ở cuối), có hai tab:

1. **Khách tiềm năng** (yêu cầu báo giá từ website):
   - Danh sách (mới nhất trước): tên, điện thoại/email, sản phẩm quan tâm, số lượng ghi chú, nội dung, thời gian, trạng thái mới/đã xử lý.
   - Nút gọi (`tel:`), nút **Đã xử lý** (kèm ghi chú), nút **Thêm vào khách hàng**: tạo khách (chưa phân loại) từ tên và điện thoại, email lưu vào ghi chú; nếu số điện thoại trùng khách đã có thì **nối vào khách đó**, không tạo trùng. App nhớ yêu cầu nào đã thành khách nào.
2. **Đơn hàng** (đặt từ website):
   - Danh sách theo trạng thái (cần báo giá, đã chốt, đang chuẩn bị, đang giao, đã giao, hoàn tất, đã hủy).
   - Chi tiết: người nhận, địa chỉ, ngày muốn nhận, các dòng hàng, giá niêm yết, lịch sử đơn.
   - Thao tác theo đúng trạng thái (do máy chủ quy định, app chỉ hiện các nút được phép): **Báo giá** (nhập đơn giá từng dòng, số lượng chốt không vượt số đặt, phí giao, ngày giao, ghi chú), từ chối kèm lý do, chuẩn bị, giao đi, đã giao, hủy kèm lý do, **ghi nhận thanh toán** (chưa trả / một phần / đã trả).
   - Ghi chú không được chứa số điện thoại hay đường dẫn (quy định sẵn của website, app hiện đúng thông báo lỗi).
3. **Ghi doanh thu từ đơn** (nút trên đơn đã giao hoặc hoàn tất, chỉ người có quyền **sửa Doanh thu** thấy):
   - Điền sẵn: **vụ** (lấy từ sản phẩm niêm yết; nếu không suy ra được hoặc có nhiều vụ thì người dùng chọn), **số lượng kg** (nếu dòng hàng không tính theo kg thì người dùng nhập), **số tiền** (đơn giá × số lượng chốt; phí giao hàng mặc định **không** cộng vào doanh thu), **khách hàng** (từ người nhận, nối khách cũ nếu trùng điện thoại), số phiếu = mã đơn, **đã thu** theo trạng thái thanh toán của đơn, **hạn thu tiền do người dùng nhập**.
   - Bấm Lưu: tạo lần bán + công nợ theo G2-4 và đánh dấu đơn "đã ghi doanh thu". Cảnh báo nếu đơn đã được ghi trước đó, để không ghi hai lần.
4. **Trang chủ → Việc chờ từ website**: bấm thẻ mở thẳng các màn trên trong app thay vì mở website.

## 4. Dữ liệu cần thêm (migration `..._app_*`, chỉ phía app)

- `web_lead_links`: yêu cầu báo giá nào đã thành khách hàng nào (cơ sở, mã yêu cầu, mã đối tác, người tạo, thời điểm); quyền theo Doanh thu.
- `web_order_sales`: đơn nào đã ghi doanh thu cho lần bán nào (một đơn có thể nhiều lần bán nếu nhiều vụ); quyền theo Doanh thu.
- Hàm `record_order_sale(...)`: kiểm đơn thuộc cơ sở và đã giao/hoàn tất (chỉ **đọc** bảng đơn của website), rồi tạo lần bán + lần thu đầu + liên kết đơn **trong một giao dịch**.
- Hàm `anonymize_partner(...)`: ẩn danh khách theo yêu cầu xóa dữ liệu (mục 6).
- **Không sửa** bảng hay hàm của website.

## 5. Hợp đồng với phần website (để hai chat không dẫm nhau)

- App phụ thuộc chữ ký của 7 hàm website kể trên. Tôi sẽ thêm **một bài kiểm thử "hợp đồng"** kiểm các hàm đó còn tồn tại đúng tham số; chat Website đổi chữ ký thì kiểm thử này báo lỗi ngay.
- Chat Website chỉ cần báo khi muốn đổi chữ ký hoặc thêm trạng thái đơn; app sẽ chỉnh theo.
- Quyền bán hàng trên website vẫn do website quy định (chủ, quản lý, biên tập hồ sơ); app không nới thêm.

## 6. Quyền riêng tư

- Thông tin người hỏi mua là dữ liệu cá nhân: chỉ người có quyền xử lý website của cơ sở xem; khi thành khách hàng thì theo quy tắc của khách (riêng tư, quản trị nền tảng không đọc, không lên website).
- **Yêu cầu xóa dữ liệu** (D58-6): nút "Ẩn danh khách này" ở Khai báo → Khách hàng thay tên, điện thoại, địa chỉ, ghi chú bằng "Khách đã ẩn danh", giữ nguyên số tiền và lịch sử để sổ sách không lệch; ghi nhật ký kiểm toán.

## 7. Các lát nhỏ, thứ tự làm

| Lát | Nội dung | Cỡ | CSDL |
|---|---|---|---|
| R1 | Lớp gọi hàm website + kiểm thử hợp đồng chữ ký hàm | S | Không (chỉ test) |
| R2 | Tab Khách tiềm năng (xem, đã xử lý, thêm vào khách, nối khách trùng) + bảng `web_lead_links` | M | Có |
| R3 | Tab Đơn hàng: danh sách, chi tiết, báo giá, các thao tác theo trạng thái, ghi nhận thanh toán | L | Không |
| R4 | Ghi doanh thu từ đơn: `web_order_sales`, `record_order_sale`, giao diện điền sẵn, chống ghi trùng | M | Có |
| R5 | Thẻ Trang chủ mở thẳng trong app; ẩn danh khách | S–M | Có (nhỏ) |

Phụ thuộc: G2-4 đã xong (khách hàng, công nợ); các hàm website đã `db push`. **Không** cần G2-1, G2-3. Thông báo đẩy khi có đơn mới để G2-7.

## 8. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Website đổi hàm làm app hỏng | Kiểm thử hợp đồng; hai chat báo nhau khi đổi chữ ký |
| Hai nơi (app và website) cùng xử lý một đơn | Trạng thái do máy chủ quyết định, mỗi thao tác kiểm lại; app tải lại khi báo "đơn vừa đổi" |
| Ghi doanh thu sai vụ hoặc sai số lượng | Điền sẵn nhưng luôn cho sửa; cảnh báo khi vụ không suy ra được; đơn vị khác kg bắt nhập kg |
| Ghi doanh thu hai lần cho một đơn | Liên kết đơn–lần bán và cảnh báo rõ |
| Lộ thông tin người mua | Hàm kiểm quyền ở máy chủ; không đưa lên website; ẩn danh khi có yêu cầu xóa |

## 9. Cần bạn xác nhận

1. **Xử lý đơn và báo giá ngay trong app** (không phải mở website)?
2. Mục mới nằm ở **Báo cáo → "Đơn khách từ website"**, đặt trước "Hồ sơ website" (luôn cuối)?
3. **Phí giao hàng không cộng vào doanh thu** theo mặc định (người dùng tích nếu muốn cộng)?
4. **Thêm vào khách hàng** chỉ khi người bán bấm nút (không tự tạo hàng loạt); email lưu trong ghi chú vì bảng khách chưa có cột email?
5. Ai được **ghi doanh thu từ đơn**: người có quyền sửa Doanh thu (chủ, Kho & chi phí); quản lý chỉ xử lý đơn nhưng không ghi doanh thu, trừ khi chủ cấp quyền?
6. Có làm **ẩn danh khách theo yêu cầu xóa** ở lát R5 không?
7. Đồng ý cách phối hợp với chat Website qua **kiểm thử hợp đồng** ở mục 5?
