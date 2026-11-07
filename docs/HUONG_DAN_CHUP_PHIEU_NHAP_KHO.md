# Hướng dẫn: Chụp phiếu / hóa đơn để điền sẵn Nhập kho (G2-3, D158)

Người dùng chụp phiếu → app đọc → **màn kiểm tra** (nhà cung cấp, số hóa đơn, ngày, tổng tiền, từng dòng hàng) → "Điền vào phiếu nhập" → xem lại → Lưu. **Ảnh không được lưu ở đâu cả**; chỉ ghi nhật ký số lần đọc để tính hạn mức.

## Bạn cần làm để bật tính năng (một lần)

1. **Đẩy migration** (có migration 182–186 chưa đẩy):
```bash
npx supabase db push
```
2. **Đặt khóa Cloudflare làm bí mật của Supabase** (dùng khóa MỚI, không dùng khóa đã từng hiện trong ảnh chụp màn hình; Account ID không phải bí mật). Thay `...` bằng giá trị của bạn:
```bash
npx supabase secrets set CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...
```
3. **Triển khai hàm đọc ảnh:**
```bash
npx supabase functions deploy scan-invoice
```
4. **Triển khai lại app** như mọi lần (bản mới có hiệu lực sau 1–2 lần mở lại app).
5. (Tùy chọn) Trang quản trị nền tảng → **Gói và giá**: chỉnh số lần đọc phiếu mỗi tháng của từng gói, số lần của cơ sở dùng thử và tên mô hình. Mặc định: dùng thử 2; Hộ cơ bản 10, Hộ nâng cao 30; HTX cơ bản 30, HTX nâng cao 90; mô hình Mistral Small 3.1 (kết quả đợt thử đạt trên 90%).

## Cách thử trên điện thoại

1. Vào **Sản xuất → Kho → Nhập kho** (người dùng cần quyền sửa Chi phí và Kho; phải có mạng). Bấm **📷 Chụp phiếu / hóa đơn để điền sẵn**.
2. Chụp ảnh (hoặc chọn ảnh có sẵn), tối đa 3 ảnh, bấm **Đọc phiếu** (khoảng 10–30 giây). Hộp "Tôi đồng ý gửi ảnh…" mặc định đã tích.
3. **Màn kiểm tra:**
   - Nhà cung cấp đã có trong danh bạ thì tự ghép (khớp mã số thuế, số điện thoại hoặc tên). Chưa có thì bấm **+ Thêm … vào danh bạ** (điền sẵn tên, MST, điện thoại, địa chỉ đã đọc).
   - Mỗi dòng hàng: chọn vật tư trong kho (app gợi ý theo tên, hoặc tự ghép nếu lần trước đã ghép tên đó), hoặc **+ Thêm … thành vật tư mới**. Dòng không muốn nhập thì bỏ tích.
   - Đơn vị trên phiếu khác đơn vị kho (ví dụ phiếu "bao", kho tính "kg") thì nhập **1 bao = bao nhiêu kg**, app đổi số lượng và đơn giá.
   - Ô vàng / mục "Cần chú ý": thiếu số lượng, thành tiền không khớp, tổng các dòng khác tổng tiền trên phiếu.
4. Bấm **Điền vào phiếu nhập** → xem lại phiếu nhập kho (đã điền sẵn, sửa được) → **Lưu hóa đơn**. Lần sau cùng nhà cung cấp, những tên hàng bạn đã ghép sẽ **tự ghép**.

Mất mạng hoặc đã hết lượt đọc trong tháng: app báo rõ, vẫn nhập tay như cũ. Lần đọc bị lỗi hệ thống thì **không bị tính** vào hạn mức.

## Gặp lỗi

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| "Chức năng đọc phiếu chưa được cấu hình ở máy chủ" | Chưa đặt bí mật Cloudflare hoặc chưa triển khai hàm (bước 2, 3) |
| "Dịch vụ đọc ảnh đang quá tải trong hôm nay" | Hết hạn mức miễn phí ngày của Cloudflare (10.000 neuron, chung cả hệ thống); thử lại sau 7 giờ sáng hôm sau, hoặc nhập tay |
| "Không đọc được ảnh lúc này" | Cloudflare lỗi hoặc mô hình đổi tên; xem nhật ký hàm: `npx supabase functions logs scan-invoice`; kiểm tra tên mô hình ở trang quản trị |
| "Không đọc được nội dung ảnh này" | Ảnh mờ, thiếu sáng, bị cắt; chụp lại |
| "Đọc phiếu cần quyền sửa mục Chi phí và mục Kho" | Người dùng chưa được cấp quyền; chủ cơ sở cấp ở Cấu hình |
| "Tháng này cơ sở đã dùng hết N lần đọc phiếu" | Đã hết lượt theo gói; nâng gói hoặc nhập tay; quản trị chỉnh hạn mức ở Gói và giá |

---

# Chụp nhãn / tờ hướng dẫn để điền sẵn thông tin vật tư

Dùng cùng hàm `scan-invoice` (thêm loại `label`) nên **không cần cài đặt thêm** nếu đã làm các bước ở trên; chỉ cần có migration 0186 đã đẩy và hàm đã triển khai lại **sau bản cập nhật này**:
```bash
npx supabase db push
npx supabase functions deploy scan-invoice
```
Hạn mức lượt đọc ảnh **dùng chung** với chụp phiếu nhập hàng (dùng thử 2, Hộ 10–30, HTX 30–90 lần mỗi tháng). Ảnh không được lưu.

## Cách thử

1. Vào **Khai báo → Vật tư** → **+ Thêm vật tư** (hoặc Sửa một vật tư). Người dùng cần quyền sửa Kho và phải có mạng. Bấm **📷 Chụp nhãn / tờ hướng dẫn để điền sẵn**.
2. Chụp tối đa 3 ảnh (mặt trước, mặt sau, tờ hướng dẫn), tích đồng ý, bấm **Đọc nhãn** (khoảng 10–40 giây).
3. **Màn kiểm tra:** mỗi trường đọc được có ô tích "dùng". Ô còn trống được tích sẵn; ô đã có giá trị thì hiện giá trị cũ, tích mới thay. Các trường liên quan an toàn (thời gian cách ly, liều dùng, cảnh báo, số đăng ký) có dấu ⚠ nhắc đối chiếu bao bì thật. Số lô, hạn dùng in trên bao thuộc từng lần nhập kho nên không điền vào vật tư.
4. Nếu **số đăng ký trùng một vật tư đã có**, app báo và có nút mở vật tư đó để cập nhật thay vì tạo trùng.
5. Bấm **Điền vào form**, xem lại, **Thêm vật tư** / **Lưu thay đổi** như thường lệ. Nhóm vật tư và đơn vị tính được gợi ý nếu khớp với danh mục của cơ sở.

Lỗi thường gặp giống phần chụp phiếu (hết lượt, quá tải trong ngày, ảnh mờ…). Chữ nhỏ, chai cong, bóng loáng dễ đọc sai: chụp từng mặt riêng, đủ sáng.
