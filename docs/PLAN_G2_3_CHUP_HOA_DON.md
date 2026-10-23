# Kế hoạch G2-3 — Chụp hóa đơn, tự điền hóa đơn nháp (bản đề xuất, chờ chủ sản phẩm duyệt)

Căn cứ: `PLAN_GIAI_DOAN_2_APP.md` mục G2-3 và D58-2 (đọc ảnh hóa đơn có hạn mức số lần theo gói), kết quả của G2-1 (kho ảnh `org-media`, D75) và G2-2 (nhà cung ứng, hóa đơn mua, công nợ, D76).
Trạng thái: **chưa làm code**. Điều kiện bắt đầu: G2-1 và G2-2 đã `db push` và thử ổn trên máy thật.

## 1. Mục tiêu

Người dùng chụp hóa đơn mua phân bón, thuốc, giống → app đọc ra nhà cung ứng, số hóa đơn, ngày, các dòng hàng (tên, số lượng, đơn vị, đơn giá, thành tiền) và tổng tiền → **điền sẵn vào màn "Mua theo hóa đơn"** → người dùng kiểm tra, sửa → bấm Lưu. Ảnh gốc được giữ làm chứng từ đính kèm hóa đơn.

Nguyên tắc (đã chốt ở kế hoạch Giai đoạn 2):
- **Kết quả đọc luôn là bản nháp, không bao giờ tự lưu.** Số tiền, số lượng bắt buộc người dùng nhìn lại.
- Chỗ nào không chắc thì **để trống hoặc tô vàng**, không đoán bừa.
- Cách nhập tay hiện tại giữ nguyên; chụp ảnh chỉ là đường tắt.
- Khóa dịch vụ đọc ảnh **chỉ nằm ở máy chủ**, không bao giờ vào app.

## 2. Luồng người dùng

1. Sản xuất → Kho → **📷 Chụp hóa đơn** (cạnh "Mua theo hóa đơn"; chỉ người có quyền sửa Chi phí và Kho thấy). Chụp mới hoặc chọn ảnh có sẵn; tối đa **3 ảnh** cho hóa đơn dài nhiều trang.
2. App thu nhỏ ảnh vừa đủ rõ chữ, đưa lên kho ảnh, rồi gọi máy chủ đọc (khoảng 5–20 giây, có thanh chờ). Hiện số lần còn lại trong tháng.
3. Mở màn **"Mua theo hóa đơn" đã điền sẵn**, kèm **ảnh gốc xem được ngay trên màn** (bấm để phóng to). Ô nào độ tin cậy thấp tô vàng, kèm lý do ("không đọc rõ số lượng").
4. Đối chiếu tự động:
   - **Nhà cung ứng**: khớp tên với danh bạ (bỏ dấu, gần đúng); chưa có thì gợi ý "Thêm nhà cung ứng mới" với tên và điện thoại đã đọc.
   - **Vật tư**: khớp từng dòng với danh mục vật tư của cơ sở; dòng nào chưa khớp để người dùng chọn vật tư, hoặc "Thêm vật tư mới".
   - **Đơn vị**: nếu đơn vị trên hóa đơn khác đơn vị cơ sở của vật tư (ví dụ hóa đơn ghi "bao 25 kg", vật tư tính theo kg) thì quy đổi nếu đã khai báo quy đổi, không thì báo để người dùng nhập.
5. Cảnh báo: **hóa đơn trùng** (cùng nhà cung ứng và số hóa đơn, đã được máy chủ chặn; thêm cảnh báo mềm khi trùng cả ngày và tổng tiền dù khác số), **tổng các dòng lệch tổng tiền** (có thuế, phí vận chuyển, chiết khấu).
6. Người dùng sửa rồi **Lưu** như thường lệ (đúng hàm `record_purchase` của G2-2). Ảnh được gắn vào hóa đơn; trong Công nợ có nút **Xem ảnh hóa đơn**.

## 3. Cách đọc ảnh (kỹ thuật)

- **Edge Function `scan-invoice`** (chạy ở Supabase, bằng khóa quản trị): kiểm tra người gọi và quyền → kiểm tra và trừ hạn mức → tải ảnh từ kho ảnh → gọi Claude đọc ảnh, ép trả về **JSON đúng khuôn** (structured outputs) → kiểm tra lại các giá trị (số không âm, độ dài chữ) → lưu kết quả vào bản ghi lần đọc → trả về app.
- Gợi ý cho mô hình kèm **danh sách vật tư và nhà cung ứng của cơ sở** (tên, đơn vị) để nó chọn đúng cách gọi; vẫn cho phép trả "không khớp".
- Mỗi trường có **mức tin cậy** (cao/vừa/thấp) và ghi chú nếu bị che, mờ, viết tay.
- **Mô hình mặc định: Claude Haiku 5.5** (rẻ, đủ cho đa số hóa đơn in); lưu ở cấu hình CSDL để đổi được. Nút **"Đọc lại kỹ hơn"** dùng mô hình mạnh hơn (Claude Sonnet 5.5) khi bản đầu sai nhiều; đếm thêm một lượt vào hạn mức.
- Ảnh trong hóa đơn là **dữ liệu, không phải lệnh**: chữ trên ảnh không thể ra lệnh cho hệ thống (không có công cụ nào để gọi, đầu ra bị khóa theo khuôn JSON, và không bao giờ tự lưu).
- Nếu mô hình từ chối (`refusal`) hoặc trả sai khuôn: báo "Không đọc được ảnh này, hãy chụp lại rõ hơn hoặc nhập tay", **không tính hạn mức**.

## 4. Chi phí và hạn mức (ước tính, sẽ đo lại bằng hóa đơn thật)

Giá theo bảng giá hiện hành của Anthropic (23/10/2026), mỗi 1 triệu chữ-đơn-vị (token): Haiku 5.5 vào 0,10 USD / ra 0,50 USD; Sonnet 5.5 vào 2 USD / ra 10 USD; Opus 5.5 vào 4 USD / ra 20 USD.
Một hóa đơn thường tốn khoảng **4.000 token vào** (ảnh khoảng 1.500, chỉ dẫn và danh mục khoảng 2.500) và **600–1.500 token ra** (kể cả phần suy nghĩ):

| Mô hình | Chi phí mỗi lần đọc (ước tính) | Quy đổi (khoảng 25.000 đ/USD) |
|---|---|---|
| Haiku 5.5 (mặc định) | khoảng 0,001 USD | **vài chục đồng** |
| Sonnet 5.5 (đọc lại kỹ) | khoảng 0,015–0,025 USD | **400–600 đồng** |

Kết luận: chi phí rất nhỏ so với giá gói (300.000–3.000.000 đ/quý). **Hạn mức theo gói chủ yếu để chống lạm dụng và đứt chi phí bất ngờ**, không phải vì đắt. Đề xuất hạn mức mỗi tháng (đặt trong CSDL, chỉnh được ở trang quản trị): dùng thử 10, gói Hộ 30–60, gói HTX 150–300. Đo thực tế với 20–30 hóa đơn mẫu trước khi chốt.
Cần bạn đặt **mức chi tối đa hằng tháng** trong tài khoản Anthropic để không bao giờ vượt ngân sách.

## 5. Quyền riêng tư và an toàn

- Ảnh hóa đơn (có tên, địa chỉ, số điện thoại nhà cung ứng, giá) được gửi tới **Anthropic** để đọc. Phải **nói rõ và xin đồng ý ở lần đầu** dùng chức năng; ảnh chỉ gửi khi người dùng bấm đọc. Bạn nên xác nhận điều khoản xử lý dữ liệu của gói API đang dùng cho phù hợp quy định bảo vệ dữ liệu.
- Quyền dùng: phải có quyền **sửa Chi phí** và **sửa Kho** (như "Mua theo hóa đơn"); kiểm ở máy chủ.
- Ảnh nằm trong kho riêng tư `org-media` (thêm loại `invoices`), chỉ người trong cơ sở có quyền Chi phí xem được. Đường dẫn bắt buộc đúng cơ sở; máy chủ không đọc ảnh của cơ sở khác.
- Mỗi người bị giới hạn tốc độ (không quá vài lần mỗi phút) và dung lượng ảnh; không tính lượt khi lỗi hệ thống.
- Kết quả đọc lưu 90 ngày để đối chiếu và đo độ chính xác, rồi xóa (ảnh đính kèm hóa đơn đã lưu thì giữ cùng hóa đơn).
- Ảnh đã tải lên nhưng không dẫn tới hóa đơn nào bị dọn sau 7 ngày (cần hàm dọn ảnh mồ côi đã ghi ở `HUONG_DAN_G2_1_ANH.md` mục 8, làm cùng lát này).

## 6. Dữ liệu cần thêm (migration `..._app_*`)

- Bảng **`invoice_scans`**: cơ sở, người đọc, đường dẫn ảnh (tối đa 3), trạng thái (đang đọc / xong / lỗi), mô hình dùng, số token vào/ra, kết quả JSON, thời điểm, liên kết hóa đơn đã tạo (nếu có).
- Cột hạn mức trong gói (`plan_tiers`): số lần đọc mỗi tháng; cấu hình mô hình mặc định trong `platform_settings`.
- Cột đính kèm trên `purchase_bills`: ảnh chứng từ (đường dẫn) và mã lần đọc.
- Kho ảnh: thêm loại thư mục `invoices` vào hàm kiểm đường dẫn và chính sách.
- Hàm máy chủ `begin_invoice_scan` (kiểm quyền, hạn mức, tốc độ; tạo bản ghi), `finish_invoice_scan` (lưu kết quả), `get_invoice_scan_usage` (số lần đã dùng/còn lại).

## 7. Các lát nhỏ, thứ tự làm

| Lát | Nội dung | Cỡ | Ai |
|---|---|---|---|
| S0 | Chuẩn bị: tạo khóa API Anthropic, đặt mức chi tối đa, đặt khóa vào bí mật của Supabase, chốt hạn mức và đoạn đồng ý | nhỏ | Chủ sản phẩm |
| S1 | Migration + hàm + test (hạn mức, quyền, cô lập cơ sở, ảnh đúng đường dẫn) | M | Claude |
| S2 | Edge Function `scan-invoice` + khuôn JSON + kiểm tra đầu ra + test với bản giả lập (không gọi dịch vụ thật trong test) | M | Claude |
| S3 | App: chụp/chọn tối đa 3 ảnh, tải lên, gọi đọc, điền sẵn "Mua theo hóa đơn", xem ảnh cạnh biểu mẫu, đối chiếu nhà cung ứng/vật tư/đơn vị, tô vàng ô kém tin cậy, cảnh báo trùng và lệch tổng, hộp đồng ý, nút Đọc lại kỹ hơn | L | Claude |
| S4 | Xem ảnh hóa đơn ở Công nợ; trang quản trị: cấu hình hạn mức, mô hình, thống kê số lần và chi phí theo cơ sở | M | Claude |
| S5 | Chụp lúc mất mạng: giữ ảnh trên máy, đọc khi có mạng | S–M | Claude (tùy chọn) |
| S6 | **Thử thực địa với 20–30 hóa đơn thật** (in, viết tay, mờ, nhiều trang); đo tỷ lệ ô đúng không cần sửa; chốt mô hình và hạn mức | — | Chủ sản phẩm |

Phụ thuộc: S1 cần `db push`; S2 cần S0 xong và phải deploy hàm (bạn tự chạy). Không bắt đầu khi G2-1, G2-2 chưa thử ổn.

## 8. Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Đọc sai số tiền, số lượng | Luôn là nháp; ảnh gốc hiện cạnh biểu mẫu; tô vàng ô kém tin cậy; cảnh báo lệch tổng; số liệu bắt buộc nhìn lại |
| Chữ viết tay, ảnh mờ, hóa đơn nhiều trang | Cho chụp lại, tối đa 3 ảnh; "Đọc lại kỹ hơn"; luôn nhập tay được |
| Nhập trùng một hóa đơn | Máy chủ đã chặn trùng số hóa đơn; thêm cảnh báo khi trùng ngày và tổng |
| Chi phí tăng bất ngờ | Hạn mức theo gói, tốc độ theo người, mức chi tối đa ở Anthropic, thống kê chi phí ở trang quản trị |
| Lộ dữ liệu nhà cung ứng | Đồng ý rõ ràng; kho riêng tư; quyền theo mục ép ở CSDL; khóa chỉ ở máy chủ |
| Chữ trên ảnh cố ra lệnh | Đầu ra bị khóa theo khuôn JSON, không có công cụ, không tự lưu |
| Dịch vụ đọc ảnh lỗi hoặc chậm | Báo rõ, không trừ lượt, luôn có đường nhập tay |

## 9. Cần bạn quyết

1. **Mô hình mặc định Haiku 5.5**, có nút "Đọc lại kỹ hơn" bằng Sonnet 5.5 (tốn thêm một lượt): đồng ý?
2. **Hạn mức mỗi tháng** theo gói: dùng thử 10, Hộ 30–60, HTX 150–300: đồng ý hay muốn con số khác?
3. **Phạm vi đầu**: chỉ hóa đơn mua vật tư/giống/thuốc cho "Mua theo hóa đơn". Việc đọc giấy phép, nhãn bao bì, tờ ghi chép tay để lần sau: đồng ý?
4. **Thuế và phí**: tổng tiền lấy theo số in trên hóa đơn (đã gồm thuế), các dòng hàng lấy như in; chênh lệch được cảnh báo chứ không tự sửa: đồng ý?
5. **Tối đa 3 ảnh** cho một hóa đơn: đồng ý?
6. **Đồng ý gửi ảnh cho Anthropic**: bạn có chấp nhận về mặt chính sách không, và muốn dòng thông báo/đồng ý trong app viết thế nào?
7. Khi nào bạn tạo được khóa API Anthropic và đặt mức chi tối đa (lát S0)?

## 10. Phụ lục: các phương án đọc ảnh KHÔNG mất phí (tra cứu 23/10/2026)

Chủ sản phẩm muốn tìm phương án miễn phí thay cho Claude. Lưu ý chung: các công cụ OCR thuần chỉ trả về **chữ thô**; việc tách thành nhà cung ứng, dòng hàng, số lượng, đơn giá phải do **bộ phân tích tự viết** (quy tắc, dễ sai với bố cục hóa đơn khác nhau). Mô hình hiểu hình ảnh (AI) trả thẳng dữ liệu có cấu trúc nên ít công viết hơn. "Miễn phí" vì vậy đổi chi phí tiền thành chi phí công sức và độ chính xác.

| # | Phương án | Chi phí | Chạy ở đâu | Tiếng Việt / chất lượng | Công sức làm | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | **Cloudflare Workers AI** (mô hình đọc ảnh `llama-3.2-11b-vision-instruct`) | Miễn phí tới 10.000 "neuron"/ngày (khoảng 100–150 lần đọc/ngày theo ước tính của tôi), hết hạn mức thì báo lỗi, vượt thì chỉ tính tiền nếu bật gói trả phí | Máy chủ Cloudflare (cùng nơi đặt website, không cần khóa bên ngoài) | Chưa kiểm chứng với hóa đơn tiếng Việt; thường kém Claude về dấu và bảng | Vừa (hàm máy chủ + khuôn JSON, dùng lại phần điền sẵn của S3) | Giá niêm yết 0,049 USD/triệu token vào, 0,676 USD/triệu token ra; cách tính tiền cho ảnh chưa được tài liệu nói rõ; có thể phải chấp nhận giấy phép của Meta một lần |
| 2 | **Tesseract.js** (OCR chạy ngay trên điện thoại, dữ liệu tiếng Việt `vie`) | Miễn phí hẳn | Trên điện thoại, **không gửi ảnh đi đâu**, dùng được cả khi mất mạng (nếu lưu sẵn dữ liệu ngôn ngữ) | Tốt với chữ in phông thông thường; yếu với giấy nhiệt, ảnh chụp nghiêng, chữ viết tay | Lớn (cần tiền xử lý ảnh và bộ phân tích bảng tự viết) | Tải thêm vài MB lần đầu; máy yếu đọc mất vài chục giây; chữ thô, không hiểu ngữ nghĩa |
| 3 | **PaddleOCR (PP-OCRv5) chạy bằng ONNX trong trình duyệt** (PaddleOCR.js và các bản đóng gói cộng đồng) | Miễn phí hẳn | Trên điện thoại | Thường chính xác hơn Tesseract với ảnh chụp; **chưa xác nhận có mô hình tiếng Việt dùng được trong trình duyệt**, cần thử | Lớn (như phương án 2) và nặng hơn (mô hình hàng chục MB) | Cần chạy thử trên vài điện thoại thật để biết tốc độ và dung lượng |
| 4 | **Dùng nhận dạng chữ có sẵn của điện thoại** (Google Lens / "Văn bản trực tiếp" của iPhone): chụp, giữ chữ để sao chép, **dán vào ô trong app** | Miễn phí hẳn, không cần hạ tầng | Trên điện thoại, do hệ điều hành làm | Rất tốt với tiếng Việt (công nghệ của chính hãng) | Nhỏ đến vừa (chỉ cần ô dán chữ + bộ phân tích) | Người dùng thêm vài thao tác chạm; dán được cả chữ từ Zalo, email; bộ phân tích dùng lại được cho mọi phương án khác |

Đã cân nhắc nhưng **không đề xuất**:
- **Google Cloud Vision** (OCR rất tốt, có tiếng Việt): miễn phí 1.000 lần/tháng, sau đó khoảng 1,5 USD/1.000 lần (khoảng 40 đồng/lần); phải có tài khoản thanh toán có thẻ. Chỉ là OCR chữ thô. Là lựa chọn "gần như miễn phí" nếu bạn chấp nhận gắn thẻ.
- **Gemini API gói miễn phí**: miễn phí nhưng Google nêu nội dung gói miễn phí **được dùng để cải thiện sản phẩm của họ**, hạn mức thấp và hay đổi; không hợp với hóa đơn có giá nhập và thông tin nhà cung ứng.
- **OCR.space gói miễn phí**: 25.000 lần/tháng và 500 lần/ngày mỗi IP theo các nguồn, tệp tối đa 1 MB, máy chủ ở Mỹ, **chưa xác nhận hỗ trợ tiếng Việt**; chỉ trả chữ thô.

**Đề xuất (làm từng bước, đo rồi mới quyết):**
1. **Bước 1 — Phương án 4** trước vì chắc chắn chạy trên mọi điện thoại, không tốn tiền, không cần hạ tầng: màn "Mua theo hóa đơn" có nút **Dán chữ từ hóa đơn**; bộ phân tích tách nhà cung ứng, số hóa đơn, ngày, dòng hàng, tổng tiền rồi điền nháp. Bộ phân tích này là phần dùng chung cho mọi phương án sau.
2. **Bước 2 — Phương án 1** làm thử bằng 20–30 hóa đơn thật, so với Claude Haiku làm mức chuẩn (tốn vài nghìn đồng cho cả đợt thử). Nếu đạt ngưỡng chấp nhận được thì dùng Cloudflare Workers AI làm đường đọc ảnh tự động miễn phí.
3. **Bước 3 (nếu cần dùng khi mất mạng)** — thử phương án 3 hoặc 2 trên máy thật.
4. Claude Haiku 5.5 giữ làm đường dự phòng trả phí khi bạn thấy chất lượng quan trọng hơn: mỗi lần đọc chỉ khoảng vài chục đồng (xem mục 4), tức 1.000 lần đọc khoảng vài chục nghìn đồng.

## 11. Quyết định 23/10/2026: THỬ NGHIỆM TRƯỚC, rồi mới quyết có làm hay không

Chủ sản phẩm lưu ý hóa đơn có **rất nhiều loại và mẫu khác nhau**, không ổn định vài mẫu. Hệ quả cho kế hoạch:

- **Bỏ ý định viết bộ phân tích bằng quy tắc** cho phần dòng hàng (bước 1 ở mục 10 không còn là đề xuất). Quy tắc chỉ chạy tốt khi số mẫu ít; với hàng chục mẫu, mỗi mẫu mới lại sai và phải sửa thêm, không bao giờ "đủ". Chỉ phần đầu hóa đơn (số hóa đơn, ngày, tổng cộng) là có dạng khá cố định, nhưng riêng chúng không đủ giá trị.
- Cách duy nhất tổng quát hóa được qua nhiều mẫu là **mô hình AI hiểu văn bản/hình ảnh**. Có ba đường để thử, đều miễn phí hoặc gần như miễn phí:
  - **A. Claude Haiku 5.5 đọc ảnh** (mức chuẩn để so sánh, tốn vài nghìn đồng cho cả đợt thử).
  - **B. Cloudflare Workers AI đọc ảnh** (miễn phí trong hạn mức ngày).
  - **C. Google Lens/Văn bản trực tiếp của điện thoại đọc chữ, dán vào app, rồi mô hình văn bản của Cloudflare tách dòng hàng** (miễn phí; OCR của Google rất tốt với tiếng Việt, mô hình chỉ còn việc hiểu bố cục chữ).
- **Chưa viết code của app.** Làm trước một **đợt thử nghiệm ngoài app** (tập lệnh chạy trên máy tính, không đụng CSDL và không đưa ảnh vào kho ảnh): 20–30 hóa đơn thật đủ loại (hóa đơn điện tử, phiếu bán hàng giấy nhiệt, viết tay, ảnh chụp nghiêng, ảnh chụp màn hình Zalo…). Tập lệnh cho ra một **trang so sánh**: ảnh bên trái, các trường đã đọc bên phải; người thử tích ô nào đọc sai; trang tự tính tỉ lệ đúng theo từng đường A, B, C.
- **Ngưỡng quyết định (đề xuất, chỉnh được):**
  - Đường nào đạt **≥ 90%** ở các trường đầu hóa đơn (nhà cung ứng, số hóa đơn, ngày, tổng tiền) **và ≥ 80%** số dòng hàng đúng hoàn toàn không cần sửa, **và** không có lỗi số tiền/số lượng nằm "im lặng" mà trang so sánh không đánh dấu được → làm tiếp bằng đường đó (ưu tiên đường miễn phí nếu đạt).
  - Chỉ có đường Claude đạt → báo chủ sản phẩm quyết định có dùng phương án trả phí (rất rẻ) hay không.
  - Không đường nào đạt → **dừng G2-3, giữ nhập tay**, và làm các việc làm nhập tay nhanh hơn (mục 12).
- Rủi ro khi thử: chỉ mất công thu thập ảnh và tích kết quả (khoảng 1–2 giờ của chủ sản phẩm). Không ảnh hưởng hệ thống đang chạy.

## 12. Phương án dự phòng giá trị cao: làm nhập tay nhanh hơn (không cần OCR)

Làm được ngay, chắc chắn đúng, bất kể kết quả thử nghiệm:
- **Nhớ giá lần mua gần nhất** theo cặp nhà cung ứng + vật tư: chọn vật tư là điền sẵn đơn giá gần nhất (sửa được), hiện "lần trước 20.000 đ".
- **Sao chép hóa đơn lần trước** của cùng nhà cung ứng (các dòng hàng giống nhau, chỉ sửa số lượng).
- Danh sách vật tư **hay mua** của nhà cung ứng đó lên đầu khi chọn.
- Nhập nhanh số lượng/đơn giá bằng bàn phím số, tự chuyển ô; hiện cảnh báo giá bất thường so với lần trước (lệch trên 30%).
