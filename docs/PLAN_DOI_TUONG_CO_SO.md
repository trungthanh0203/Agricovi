# Kế hoạch: chủ cơ sở chọn "Đối tượng sản xuất" của cơ sở (đề xuất 28/10/2026, chờ duyệt)

## Mục tiêu
Cơ sở A chỉ trồng cây thì mọi nơi trong app chỉ hiện phần cho cây trồng; cơ sở B trồng cây và chăn nuôi thì hiện cho cả hai. Không còn các mục, ô, nhóm vật tư… không dùng đến. Chỉ là **cách hiển thị** (như chế độ đơn giản D100): không đổi quyền, không xóa dữ liệu; dữ liệu cũ thuộc loại đã tắt vẫn xem được.

## Cách làm đề xuất (không cần migration)
- **Dùng sẵn** danh sách "Nhóm loại sản phẩm" (`product_groups`, Cấu hình): mỗi mục có cờ `active`, lưu bằng `set_org_entries`. Cơ sở chọn đối tượng = bật/tắt 3 nhóm gốc Cây trồng, Vật nuôi, Thủy sản (và Khác). Nhóm tự thêm "tính như" một nhóm gốc thì theo nhóm gốc đó.
- **Mặc định chưa chọn = hiện tất cả** (cơ sở đang dùng không đổi). Chủ cơ sở thấy thẻ nhắc ở Trang chủ "Cơ sở của bạn làm gì?" cho tới khi chọn; cơ sở tạo mới được hỏi ngay lúc tạo.
- Một hàm dùng chung `orgKinds()` (trong `lib/config.ts`) trả về các loại gốc đang bật; hook `useOrgKinds()`; `MyOrg.kinds` tính ở OrgsProvider (như `features`).
- **Không cho tắt** loại đang có sản phẩm hoặc vụ còn chạy (báo rõ lý do). Phải chọn ít nhất một.
- Ai được đổi: chủ/quản lý có quyền Cấu hình (như các danh sách khác).

## Thống kê các phần cần chỉnh
| # | Nơi | Việc cần làm | Cỡ |
|---|---|---|---|
| 1 | `lib/config.ts` | `orgKinds()`, `useOrgKinds()`; `productGroups()` chỉ trả nhóm thuộc loại đang bật (giữ mục hiện tại của bản ghi) | S |
| 2 | `lib/orgs.tsx` | `MyOrg.kinds` | S |
| 3 | Cấu hình (`ConfigTab`) | Khối đầu trang "Đối tượng sản xuất của cơ sở" (tích chọn, kiểm tra không tắt loại đang dùng) | M |
| 4 | Trang chủ + `CreateOrgScreen` | Thẻ nhắc chọn lần đầu; hỏi lúc tạo cơ sở | S |
| 5 | Sản phẩm (`CropsSection`) | Chọn loại và danh sách lọc theo loại bật; một loại thì ẩn ô chọn loại | S |
| 6 | Phân khu (`AreasSection`) | Loại khu chọn theo loại bật; ô "Kiểu nhà/chuồng" chỉ khi có vật nuôi/thủy sản | S |
| 7 | Việc (`WorkTypesSection`) | Bộ lọc và chọn đối tượng chỉ gồm loại bật; một loại thì ẩn bộ lọc, cột Đối tượng và chọn sẵn | S |
| 8 | Quy trình mẫu (`TemplatesSection`, `TemplateEditor`) | Chọn sản phẩm khi tạo quy trình và lọc danh sách theo loại bật | S |
| 9 | Tạo vụ (`CreateCycleScreen`) | Chỉ hiện sản phẩm thuộc loại bật; câu chữ theo loại | S |
| 10 | Nhóm vật tư (`MATERIAL_BUILTINS`) | Ẩn nhóm không liên quan: Thức ăn/Thuốc thú y/Vaccine chỉ khi có vật nuôi, thủy sản; Thuốc BVTV/Phân bón chỉ khi có cây trồng; Thuốc sát trùng, Giống, Khác luôn hiện | S |
| 11 | Từ ngữ (`lib/terms.ts`) | `cycleNoun`: chỉ cây trồng → "vụ trồng"; chỉ vật nuôi/thủy sản → "vụ nuôi"; cả hai → "vụ nuôi trồng" | S |
| 12 | Mô hình quản lý (`lib/models.ts`, `ModelPicker`) | "Chuẩn VietGAP" (sổ nhật ký trồng trọt) chỉ gợi ý khi có cây trồng | S |
| 13 | Sự cố (`incidentsLogic`), Tăng trọng/FCR, Tổng kết "Theo con" | Đã theo loại của từng vụ nên không đổi; chỉ kiểm tra không hiện thừa ở cơ sở chỉ trồng cây | XS |
| 14 | Hồ sơ web (`commerce`) | Chỉ kiểm tra gợi ý sản phẩm; phần website thuộc mảng WEB, nếu cần ghi "Cần bên WEB" vào STATUS_WEB | XS |
| 15 | Hướng dẫn (`guideContent`), `HUONG_DAN_THU.md`, `DECISIONS_APP.md` (D104) | Cập nhật một lần cuối | S |
| 16 | Test | Test thuần cho `orgKinds` và lọc nhóm/vật tư; không cần test CSDL vì không đổi SQL | S |

## Thứ tự làm
1 → 2 → 3 (dùng được ngay) → 4 → 5–9 (các màn khai báo) → 10–12 → 15–16.

## Rủi ro và cách tránh
- Tắt loại đang có dữ liệu → chặn và báo; dữ liệu cũ luôn hiện đúng nhãn (không phụ thuộc cờ bật).
- Nhóm tự thêm "tính như" nhóm gốc đã tắt → ẩn cùng nhóm gốc.
- Hộ thành viên của HTX: mỗi cơ sở (hộ, HTX) có lựa chọn riêng.
