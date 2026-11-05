# Đề xuất: thêm KHÁCH HÀNG từ website vào app

Trạng thái: **ĐỀ XUẤT, chờ chủ sản phẩm duyệt** (1/11/2026). Liên quan: `PLAN_TIM_NHA_CUNG_UNG.md` (phía nhà cung ứng, đã làm).

## 1. Khác biệt với nhà cung ứng (vì sao không làm y hệt)

| | Nhà cung ứng | Khách hàng |
|---|---|---|
| Ai trên website | Gian hàng vật tư: **doanh nghiệp đã đăng ký, có giấy phép, được duyệt, muốn được tìm thấy** | Người mua: cá nhân, nhà hàng, thương lái, doanh nghiệp. **Không có danh bạ công khai**, họ không đồng ý để bị tra cứu |
| Cách tìm | Tìm theo khu vực, ai cũng nằm trong danh bạ | Không nên có "tìm khách theo khu vực" như tìm gian hàng, vì sẽ lộ thông tin người mua cho mọi nhà bán |
| Cơ sở đồng ý | Gian hàng đăng ký công khai | Người mua chỉ đồng ý chia sẻ cho **cơ sở mà họ chủ động liên hệ** |

Nguyên tắc đề xuất: **chỉ đưa vào app những người mua ĐÃ chủ động liên hệ cơ sở của bạn** (gửi yêu cầu báo giá, đặt hàng, báo giá giao thương được chấp nhận). Đó là sự đồng ý rõ ràng, và phù hợp D60 (liên hệ chỉ chia sẻ khi hai bên đồng ý). Không tạo danh sách khách để tra cứu theo khu vực.

## 2. Hiện trạng (đã kiểm tra)

- **Yêu cầu báo giá từ website** (`quote_requests`): app đã có "Thêm vào khách hàng" (`link_lead_to_customer`, trong **Báo cáo → Đơn khách từ website**). Nhưng hàm chỉ chép tên, điện thoại; email nằm trong ghi chú; **không có tỉnh/xã/địa chỉ** (yêu cầu báo giá không có địa chỉ nên đúng).
- **Đơn đặt hàng từ website** (`web_orders`): đơn có đủ người nhận, điện thoại, tỉnh, huyện (xã), địa chỉ, loại người mua (`buyer_profiles.buyer_kind`: cá nhân, nhà hàng, thương lái, doanh nghiệp, trang trại). Khi ghi doanh thu cho đơn (`record_order_sale`), người dùng phải **tự chọn hoặc tự tạo** khách hàng, **chưa có cách thêm tự động**.
- **Giao thương cần mua** (`trade_posts` loại `buy`): liên hệ chỉ mở khi hai bên cùng bấm "Chia sẻ liên hệ" (`get_conversation_contacts`). Chưa có đường sang app.
- Bảng `partners` đã có `province`, `ward` (migration 0176) và `web_shop_id` (0177); chưa có cột nhớ nguồn khách.

## 3. Đề xuất

### Giai đoạn 1 (nên làm trước): từ đơn hàng và yêu cầu báo giá

1. **Đơn từ website → khách hàng**
   - Trong chi tiết đơn (Báo cáo → Đơn khách từ website) thêm nút **Thêm vào khách hàng**: sao tên người nhận, điện thoại, tỉnh, xã, địa chỉ, **loại khách** theo loại người mua (cá nhân→Bán lẻ, thương lái→Thương lái, nhà hàng/doanh nghiệp→Doanh nghiệp, trang trại→Khác), ghi chú "Từ đơn #mã". Người dùng chỉ thêm ghi chú.
   - Hàm `add_customer_from_order(p_org, p_order)`; bấm lặp không nhân đôi; trùng số điện thoại với khách có sẵn thì **nối vào khách đó** (giống `link_lead_to_customer`), chỉ điền chỗ còn trống.
   - Màn **Ghi doanh thu cho đơn** tự chọn sẵn khách này (hoặc tạo ngay khi ghi), người dùng không phải nhập lại.
2. **Yêu cầu báo giá → khách hàng**: giữ nút hiện có, nâng cấp để dùng chung logic nối khách trùng với đơn hàng (một người vừa gửi báo giá vừa đặt hàng chỉ là một khách), lưu email vào ghi chú như cũ.
3. Dùng chung cột nhớ nguồn: `partners.web_buyer_id uuid` (tài khoản người mua trên website, không khóa ngoại) và `web_source text` (`order` | `quote` | `trade`), chỉ mục duy nhất `(organization_id, web_buyer_id)` khi có.
4. Hiển thị: trong danh sách Khách hàng có nhãn nhỏ "Từ website" và ngày liên hệ gần nhất; bộ lọc "Từ website".

Quyền: `has_perm(org,'sales','edit')` và `can_edit_profile(org)` như các hàm hiện có. Test CSDL: quyền, không nhân đôi, nối trùng điện thoại, không đọc được đơn của cơ sở khác, ánh xạ loại khách.

### Giai đoạn 2: giao thương cần mua

Khi tin cần mua có báo giá được chấp nhận và **cả hai bên đã bấm Chia sẻ liên hệ**, hiện nút **Thêm vào khách hàng** trong cuộc trao đổi (chép tên, điện thoại, email). Không chép khi chưa đồng ý chia sẻ. Cần phối hợp bên WEB vì hộp thư nằm ở website: đề xuất app đọc qua hàm riêng `app_trade_contacts(org)` chỉ trả những cuộc trao đổi đã chia sẻ.

### Giai đoạn 3 (hướng mở, ghi lại để làm sau)

- **Người mua đồng ý hiện trong danh bạ (opt-in):** trong tài khoản website, người mua doanh nghiệp/nhà hàng/thương lái bật "Cho nhà cung cấp tìm thấy tôi", chọn khu vực và nhóm hàng cần mua; khi đó mới có "Tìm khách hàng theo khu vực" trong app như phía nhà cung ứng. Cần web làm công tắc, kiểm duyệt và chống lạm dụng (giới hạn lượt xem, ghi nhật ký).
- **Khách quay lại:** gắn thẻ "khách thân thiết" theo số đơn, gợi ý nhắc mua lại theo mùa vụ.
- **Gửi thông báo mùa vụ cho khách đã từng mua** (chỉ khách đã đồng ý nhận), nối với lịch mùa vụ đã công khai.
- **Công nợ khách web:** đơn đã giao nhưng chưa thanh toán tự thành công nợ phải thu (`payment_status`).
- **Đánh giá khách:** khách đánh giá cơ sở sau đơn hoàn tất, cơ sở xem lịch sử mua của từng khách trong hồ sơ khách.
- **Đồng bộ ngược:** cơ sở cập nhật khách (đổi số điện thoại) thì gợi ý cập nhật đơn mới.

## 4. Câu hỏi cần chủ sản phẩm quyết

1. Đồng ý nguyên tắc "chỉ thêm khách đã chủ động liên hệ", **không** làm danh bạ tìm khách theo khu vực ở giai đoạn này?
2. Đồng ý ánh xạ loại người mua → loại khách ở mục 3.1?
3. Giai đoạn 2 (giao thương) có làm ngay sau giai đoạn 1 hay để sau?
