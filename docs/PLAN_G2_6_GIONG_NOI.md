# Kế hoạch G2-6 — Nhập liệu bằng giọng nói (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: D58-1 (bắt đầu bằng nhận dạng có sẵn của thiết bị, đo thực địa rồi mới xét dịch vụ trả phí), D24 (offline chỉ cho ghi mới việc hằng ngày), `PLAN_GIAI_DOAN_2_APP.md` mục G2-6.
Trạng thái: **chưa làm code**.

## 1. Mục tiêu và nguyên tắc

Người làm ngoài đồng, tay bẩn, ít quen gõ: nói "hôm nay bón 20 ký NPK cho vụ dưa lưới" → app điền sẵn biểu mẫu → người dùng xem, sửa → bấm Lưu.

- **Luôn là bản nháp, không bao giờ tự lưu.** Ô nào không chắc để trống hoặc tô vàng, không đoán bừa.
- Cách nhập tay hiện tại giữ nguyên, giọng nói chỉ là đường tắt.
- Không lưu âm thanh, không lưu câu nói trên máy chủ.
- Việc LƯU vẫn đi đúng đường cũ (Ghi việc và Thu hoạch vẫn dùng được offline theo D24); giọng nói chỉ tạo nháp trên máy.

## 2. Ba tầng, làm từ rẻ đến đắt

| Tầng | Là gì | Chi phí | Làm khi nào |
|---|---|---|---|
| **1. Micro cho ô văn bản** | Nút 🎤 ở các ô ghi chú/mô tả: nói → thành chữ | Miễn phí | Làm trước |
| **2. "Nói để điền" ngay trên máy** | Câu nói thành chữ (tầng 1) → bộ phân tích tiếng Việt chạy **trên điện thoại** (quy tắc + so khớp với danh mục của cơ sở) → điền nháp | Miễn phí, tức thì | Làm tiếp |
| **3. Hiểu ý bằng AI ở máy chủ** | Edge Function đưa câu nói + danh mục cho mô hình ngôn ngữ, trả về các trường | Tính tiền theo lần, có hạn mức theo gói | **Chỉ làm nếu số đo thực địa cho thấy tầng 2 chưa đủ** (D58-1) |

Lý do không đi thẳng tầng 3: phần lớn câu ngoài đồng có dạng ngắn, lặp lại (loại việc + số lượng + vật tư). Quy tắc kết hợp so khớp danh mục đã giải được phần lớn, chạy offline và không tốn tiền. Nên đo rồi mới trả tiền.

## 3. Phần "nghe" và giới hạn kỹ thuật phải biết

- Dùng nhận dạng giọng nói có sẵn của trình duyệt (Web Speech API, tiếng Việt `vi-VN`).
- **Android + Chrome:** dùng tốt, nhưng thường cần mạng (âm thanh được gửi cho nhà cung cấp trình duyệt xử lý).
- **iPhone:** trong app đã cài ra màn hình chính, nhận dạng này hay không chạy hoặc hạn chế. Cách dự phòng không cần code: bấm biểu tượng micro trên **bàn phím điện thoại**, nói vào ô nhập. App sẽ tự phát hiện máy không hỗ trợ và hiện hướng dẫn này.
- **Mất mạng:** nhận dạng của Chrome không chạy; chỉ còn micro bàn phím nếu máy có đọc offline.
- **Ồn ngoài đồng, giọng vùng miền:** vì vậy luôn hiện câu nghe được để **sửa chữ trước khi phân tích**, và cho sửa từng ô bằng chạm.
- **Quyền riêng tư:** hộp đồng ý lần đầu nói rõ âm thanh do trình duyệt/hệ điều hành xử lý, app không lưu.

## 4. Trải nghiệm trên màn hình

1. Đầu màn Ghi việc có nút tròn **🎤 Nói để điền**.
2. Bấm → hiện "Đang nghe…" kèm đồng hồ, bấm lần nữa để dừng.
3. Hiện ô **"Tôi nghe được: …"** (sửa được) + nút **Phân tích**.
4. Các ô được điền tô nền xanh nhạt kèm nhãn nhỏ "từ giọng nói"; ô không chắc hoặc không khớp danh mục để trống và có dòng gợi ý ("Không thấy vật tư tên 'phân gà', hãy chọn tay").
5. Người dùng sửa và bấm **Lưu** như thường lệ.

## 5. Bộ phân tích tiếng Việt (tầng 2) làm những gì

Chạy hoàn toàn trên máy, viết thành thư viện thuần, dễ kiểm thử:

- **Loại việc:** so khớp tên đầu việc của cơ sở (bỏ dấu, không phân biệt hoa thường) + danh sách từ đồng nghĩa ("phun" = "phun thuốc", "bón" = "bón phân"…).
- **Vụ:** theo tên vụ hoặc sản phẩm ("vụ dưa lưới", "vụ số 3"); không nói thì dùng vụ đang chọn.
- **Số lượng + đơn vị:** hiểu cả số viết bằng chữ ("hai mươi ký", "một rưỡi"), "ký/kg/lít/gói/bao"; ghép với vật tư khớp tên và đơn vị của vật tư đó.
- **Các trường riêng của từng loại việc** (`field_schema`): số khớp theo nhãn hoặc đơn vị của trường.
- **Thời gian:** "hôm qua", "sáng nay", "lúc 7 giờ"; mặc định bây giờ.
- **Ghi chú:** phần còn lại của câu.
- **Thu hoạch:** "thu 120 ký loại một, hao 3 ký" → số lượng, hạng, hao hụt.

## 6. Đo thực địa (để quyết định có cần tầng 3 hay không)

Bảng mới `voice_attempts`, **không chứa âm thanh và không chứa câu nói**: màn dùng, loại máy/trình duyệt, máy có hỗ trợ không, thời lượng, số ô tự điền, số ô người dùng phải sửa, kết quả (đã lưu / bỏ). Chỉ ghi khi người dùng đã đồng ý. Trang quản trị xem tổng hợp: tỷ lệ dùng được trên từng loại máy, tỷ lệ ô đúng không cần sửa.

**Ngưỡng đề xuất để quyết định:** từ 80% ô tự điền không phải sửa thì dừng ở tầng 2; thấp hơn thì làm tầng 3. Con số này bạn chỉnh được.

## 7. Các lát nhỏ, thứ tự làm

| Lát | Nội dung | Cỡ | CSDL |
|---|---|---|---|
| V1 | Nền micro: phát hiện máy hỗ trợ, hộp đồng ý, hướng dẫn micro bàn phím; nút 🎤 ở ô ghi chú của Ghi việc, Ghi chú vụ, Thu hoạch, mô tả | S | Không |
| V2 | Bộ phân tích tiếng Việt + kiểm thử bằng bộ câu mẫu (chạy bằng `node --test`, không thêm thư viện) | M | Không |
| V3 | "Nói để điền" ở Ghi việc, gồm Vật tư đã dùng | M | Không |
| V4 | "Nói để điền" ở Thu hoạch | S | Không |
| V5 | Đo thực địa: bảng `voice_attempts`, test, tổng hợp ở trang quản trị | S–M | Có (migration `..._app_*`) |
| V6 | **Thử thực địa** 3–5 người, thu số đo | (việc của bạn) | — |
| V7 | *Có điều kiện*: tầng 3 bằng Edge Function, hạn mức theo gói | M–L | Có |

Chi phí, quyền, phụ thuộc: V1–V4 không đụng CSDL nên không cần chờ `db push`. Chỉ V5 cần migration. Không phụ thuộc G2-1 hay G2-2.

## 8. Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Nghe sai số lượng, số tiền | Luôn là nháp; hiện câu nghe được để sửa; số lượng tô nổi để nhìn lại |
| iPhone không nghe được | Phát hiện và chỉ dẫn micro bàn phím; không ép dùng |
| Giọng vùng miền, tên vật tư địa phương | Từ đồng nghĩa bổ sung được; dựa vào câu thật bạn cung cấp |
| Phân tích nhầm vụ hoặc loại việc | Ô nào nhiều khả năng khớp hơn một mục thì để trống và hỏi lại, không đoán |
| Người dùng tưởng đã lưu | Chỉ có nút Lưu mới ghi; nháp có nhãn rõ |

## 9. Cần bạn cung cấp hoặc xác nhận

1. Đồng ý ba tầng và **hoãn tầng 3 (AI trả phí) tới khi có số đo**?
2. Phạm vi lần đầu là **Ghi việc và Thu hoạch** (Chi phí, Doanh thu để lần sau)?
3. Đồng ý ghi số đo `voice_attempts` (không âm thanh, không câu nói) khi người dùng cho phép?
4. **Câu nói thật:** nhờ bạn gửi khoảng 20–30 câu mà người trong cơ sở thật sự hay nói khi báo việc (ví dụ cách gọi tên việc, tên vật tư, đơn vị địa phương). Đây là dữ liệu quan trọng nhất cho V2.
5. Ngưỡng 80% để quyết định tầng 3 có hợp lý không?
