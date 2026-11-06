# Phương án chốt: Tạo vụ 2 bước nhập + 1 bước xem lại, chuẩn bị chỗ cho cây lâu năm và đàn liên tục

Trạng thái: **ĐÃ LÀM** (12/11/2026, chủ sản phẩm duyệt; chưa `db push` migration 0181 cho phần đổi quy trình): màn Tạo vụ 3 bước, trạng thái do ngày quyết định, nâng cao thu gọn, báo thiếu ô/quy trình kèm nút đi tới và lưu nháp 1 giờ, bỏ "Nhận về từ nơi khác", "Đổi quy trình" ở Chi tiết vụ. Hàng "Kiểu" và các ô vườn cây / đàn sẽ bật khi làm kế hoạch cây lâu năm / đàn liên tục. Thay thế mục 4–7 của `PLAN_TAO_VU_DON_GIAN.md` theo các điều chỉnh của chủ sản phẩm.

## 1. Điều chỉnh đã nhận
- Tạo vụ chỉ **2 bước nhập** (mọi thông tin nằm trong 2 bước này) + **Bước 3: Xem lại và tạo vụ**.
- **Không** làm nhập nhanh tại chỗ (không thêm ô, không tạo quy trình ngay trong màn Tạo vụ).
- Giai đoạn này **không** có "Nhận giống từ nơi khác" và **không** có "Làm lại như vụ trước".
- **Có** cho **đổi quy trình** khi vụ chưa bắt đầu.
- Cây lâu năm và đàn liên tục (`PLAN_CAY_LAU_NAM_VA_DAN_LIEN_TUC.md`) phải **nằm vừa trong cùng 2 bước**, không thêm màn.

## 2. Tổng kết cách sắp xếp

Nguyên tắc: **Bước 1 trả lời "Trồng/nuôi cái gì, ở đâu?"**, **Bước 2 trả lời "Bao nhiêu, từ khi nào?"**, Bước 3 chỉ xem lại. Mỗi bước có nhóm **bắt buộc** hiện sẵn và nhóm **nâng cao** thu gọn, đặt ở cuối bước.

### Bước 1 — Trồng/nuôi gì, ở đâu?
| # | Ô nhập | Ghi chú |
|---|---|---|
| 1 | **Ghi theo** hộ riêng / HTX | Chỉ hiện khi thật sự có hai lựa chọn |
| 2 | **Sản phẩm** | Tự chọn nếu chỉ có một; nhớ lần trước |
| 3 | **Kiểu** | Chỉ hiện khi sản phẩm có hơn một kiểu: *Theo vụ / Vườn cây lâu năm* hoặc *Nuôi theo lứa / Đàn nuôi liên tục* (mặc định theo sản phẩm). Giai đoạn này chỉ "theo vụ / theo lứa" chạy, hai kiểu mới sẽ bật khi làm xong phần nền |
| 4 | **Quy trình** | Chỉ liệt kê quy trình của sản phẩm; tự chọn nếu chỉ có một. Tên gọi theo kiểu (quy trình mùa vụ / quy trình chăm sóc vườn / lịch chăm sóc đàn) |
| 5 | **Ô sản xuất** | Ngay dưới hiện khung "còn trống … m²" và các vụ đang dùng ô |
| 6 | **Diện tích của vụ** | Nút **Cả ô** / **Phần trống**; đơn vị diện tích nhớ lần trước |
| 7 | Ô tích **Dùng chung diện tích với vụ khác trong ô** | Chỉ hiện khi ô đã có vụ |
| ⋯ | *Nâng cao (thu gọn)*: **Chuẩn bị ở khu riêng** (chọn khu), **Chờ vụ khác kết thúc mới bắt đầu** (chọn vụ) | Hai khái niệm khó, nói bằng lời thường, mặc định không dùng |

Chưa có ô hoặc chưa có quy trình: **không làm nhập nhanh**; màn báo rõ thiếu gì, có **nút đi tới** Khai báo → Phân khu / Quy trình mẫu. **Tự lưu nháp** các lựa chọn đã chọn trên máy để quay lại là tiếp tục đúng bước.

### Bước 2 — Bao nhiêu, từ khi nào?
| # | Ô nhập | Ghi chú |
|---|---|---|
| 1 | **Tên vụ** (hoặc tên vườn / tên đàn) | Tự gợi ý, bắt buộc, sửa được |
| 2 | **Giống** | Bắt buộc ("Chưa rõ giống" nếu không biết) |
| 3 | **Số lượng** (cây / con) | Bắt buộc; mật độ tự tính. *Đàn:* bảng **tồn đầu theo nhóm** (đực giống, cái sinh sản, hậu bị, con non, vỗ béo), tổng là số lượng |
| 4 | **Ngày trồng** | Chỉ *vườn cây*, bắt buộc (nhập ngày hoặc năm trồng nếu vườn có sẵn) |
| 5 | **Bắt đầu thế nào?** hai lựa chọn: **Từ đầu** (mặc định) / **Đang làm dở** | Đang làm dở: bảng việc (chọn cột *Đang làm*), *Ngày vụ bắt đầu thật*, *Việc đang làm bắt đầu ngày*, chi phí ước tính. *Vườn cây / đàn:* thay bằng *Ngày bắt đầu theo dõi* và *Kỳ đầu tiên* (tên kỳ, từ ngày) |
| 6 | **Ngày bắt đầu vụ** | Nằm đúng chỗ trên. **Trạng thái do ngày quyết định, không còn câu hỏi riêng**: ngày hôm nay hoặc đã qua thì vụ *Đang sản xuất*; ngày sau hôm nay thì vụ *Chuẩn bị* (tự chuyển nhãn, có một dòng giải thích). Bỏ hộp chọn "Bắt đầu ngay / Chưa bắt đầu" |
| ⋯ | *Thông tin thêm (thu gọn)*: nguồn giống, lô nhập, ngày gieo, kế hoạch sản lượng, ngân sách, mã vụ, đơn vị đếm, người phụ trách và số điện thoại | Không bắt buộc, làm sau cũng được |

Với "Đang làm dở", bỏ lựa chọn **"Nhận về từ nơi khác"** (chưa làm ở giai đoạn này), chỉ còn "Vụ đã chạy trước khi dùng app" và một ô ghi chú tự do.

### Bước 3 — Xem lại và tạo vụ
- Thẻ tóm tắt (sản phẩm, kiểu, ô, diện tích, số lượng, giống, ngày, trạng thái sẽ được tạo), mỗi nhóm có nút **Sửa** quay về đúng bước.
- Danh sách việc với ngày kế hoạch (vụ: các việc của quy trình; vườn cây: kỳ đầu tiên; đàn: kỳ đầu và tồn đầu theo nhóm).
- Các **cảnh báo** gom ở đây: vượt chỗ trống (chủ xác nhận), hết hạn mức gói (gợi ý đặt ngày tương lai để lưu ở trạng thái Chuẩn bị), diện tích ô chưa khai.
- Một nút **Tạo vụ**; sau khi tạo mở Chi tiết vụ.

## 3. Chia việc giữa Tạo vụ và Sửa vụ
Mọi trường trên đều **sửa được sau** trong Sửa vụ, **cùng bố cục hai bước**. Trường không sửa được sau khi đã có dữ liệu: ô, sản phẩm, kiểu (muốn đổi phải tạo vụ khác).

## 4. Đổi quy trình khi vụ chưa bắt đầu
- Vị trí: Chi tiết vụ → nhóm "Thông tin vụ" → **Đổi quy trình** (chỉ hiện khi đủ điều kiện).
- Điều kiện (máy chủ ép): vụ chưa kết thúc/hủy; **mọi việc còn "chưa bắt đầu"**; **chưa có nhật ký, thu hoạch** gắn việc của vụ; chưa có việc nào ghi "làm trước khi dùng app"; quy trình mới **cùng sản phẩm** và thuộc cơ sở sở hữu vụ; người có quyền quản lý giai đoạn.
- Hàm máy chủ `change_cycle_template(p_cycle, p_template)`: tạo lại các việc từ quy trình mới **theo đúng ngày bắt đầu hiện tại**, cập nhật tên/phiên bản quy trình và ngày dự kiến kết thúc, ghi nhật ký kiểm toán. Dùng lại cùng đoạn sao việc với lúc tạo vụ (tách thành hàm dùng chung nên không lệch quy tắc).
- Vụ đã bắt đầu việc hoặc đã bắt đầu giữa chừng: không đổi được (báo rõ lý do).
- Test CSDL: điều kiện, quyền, sao việc đúng ngày, sản phẩm khác bị chặn.

## 5. Kỹ thuật
- Viết lại màn Tạo vụ thành **3 màn con** dùng chung một trạng thái biểu mẫu và một kiểm tra theo bước; **bước đang đứng và bản nháp** lưu trên máy.
- **Không đổi quy tắc ở CSDL** của tạo vụ (tên/giống/diện tích/số lượng bắt buộc, chỗ trống, hạn mức, giữa chừng); chỉ thêm hàm `change_cycle_template`.
- Chỗ cho kiểu mới: hàng "Kiểu" ở Bước 1 và các ô riêng (ngày trồng, bảng nhóm đàn, kỳ đầu) ở Bước 2 đã được chừa, bật khi làm C1–C3 của kế hoạch cây lâu năm / đàn.
- Chạy typecheck một lần ở cuối; test CSDL cho đổi quy trình.

## 6. Cần chủ sản phẩm duyệt
1. Cách chia: **Bước 1 = sản phẩm, kiểu, quy trình, ô, diện tích**; **Bước 2 = tên, giống, số lượng, ngày, bắt đầu thế nào**; **Bước 3 = xem lại và tạo**?
2. **Bỏ hộp chọn trạng thái**: trạng thái do ngày bắt đầu quyết định (hôm nay/đã qua = đang sản xuất, tương lai = chuẩn bị)?
3. **Chuẩn bị ở khu riêng** và **Chờ vụ khác kết thúc** nằm trong mục *Nâng cao* ở cuối Bước 1?
4. Thiếu ô / thiếu quy trình: chỉ **báo + nút đi tới**, kèm tự lưu nháp (không nhập nhanh) như vậy được không?
5. Bỏ lựa chọn "Nhận về từ nơi khác" trong "Đang làm dở" ở giai đoạn này?
6. Đổi quy trình đặt ở Chi tiết vụ với điều kiện như mục 4?
