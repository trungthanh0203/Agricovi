# Hướng dẫn: đợt thử đọc ảnh hóa đơn (làm trên máy tính, chưa đụng app)

Mục đích: cho vài mô hình AI **miễn phí** đọc cùng một bộ ảnh hóa đơn thật của bạn, rồi bạn chấm xem mô hình nào đọc đủ tốt. Kết quả quyết định có làm tính năng "Chụp phiếu" trong app hay không, và dùng mô hình nào. Không ảnh hưởng hệ thống đang chạy. Tổng thời gian khoảng 1–2 giờ.

Các mô hình thử: Cloudflare (Gemma 3 12B, Llama 3.2 11B Vision, Mistral Small 3.1 24B) và Groq (Llama 4 Scout). Chưa thử Claude Haiku.

> **Lưu ý riêng tư:** ảnh sẽ được gửi tới Cloudflare và Groq để đọc. Đừng đưa vào bộ thử ảnh có giấy tờ cá nhân (CCCD, tài khoản ngân hàng...). Khóa API (mật khẩu của dịch vụ) **chỉ để trong file `.env` trên máy bạn, không dán vào chat, không đưa lên git**.

## Bước 1. Gom 20–30 ảnh hóa đơn thật

Càng đa dạng càng tốt, đúng thứ người dùng sẽ chụp:
- Hóa đơn in (điện tử đã in, hóa đơn GTGT), phiếu bán hàng giấy nhiệt, phiếu giao hàng.
- Viết tay hoặc nửa in nửa viết tay (đại lý nhỏ hay dùng).
- Ảnh chụp nghiêng, hơi mờ, thiếu sáng, có bóng tay.
- Ảnh chụp màn hình hóa đơn từ Zalo hoặc email.
- Hóa đơn nhiều dòng hàng (trên 8 dòng) và vài hóa đơn 1–2 dòng.
- Nhiều nhà cung cấp khác nhau: đại lý phân bón, thuốc BVTV, giống, thức ăn chăn nuôi, thú y.

Cách làm: chép ảnh vào thư mục **`scripts/invoice-bench/anh`** (định dạng .jpg, .png hoặc .webp; ảnh iPhone dạng HEIC thì chụp lại hoặc xuất sang JPG trước). Tên file đặt tùy ý, ví dụ `phan-npk-1.jpg`. Nếu có hóa đơn nhiều trang, mỗi trang là một ảnh riêng ở lần thử này.

## Bước 2. Lấy khóa Cloudflare (2 thứ: Account ID và API Token)

1. Đăng nhập https://dash.cloudflare.com (tài khoản đang đặt website).
2. **Account ID:** vào **Workers & Pages** (menu trái), nhìn cột bên phải trang tổng quan, có dòng **Account ID**, bấm sao chép. Ghi lại.
3. **API Token:** bấm biểu tượng người dùng (góc phải trên) → **My Profile** → **API Tokens** → **Create Token** → dòng mẫu **Workers AI** → **Use template** → **Continue to summary** → **Create Token**. Sao chép chuỗi token hiện ra (**chỉ hiện một lần**).
4. Hạn mức miễn phí của Cloudflare: 10.000 "neuron" mỗi ngày, dùng chung mọi mô hình, đặt lại lúc 0 giờ UTC (7 giờ sáng Việt Nam). Mỗi ảnh tốn khoảng vài chục neuron, nên 30 ảnh × 3 mô hình thường đủ trong một ngày. Nếu báo hết hạn mức giữa chừng, đợi sang ngày hôm sau chạy lại: công cụ tự bỏ qua ảnh đã đọc xong.

## Bước 3. Lấy khóa Groq

1. Vào https://console.groq.com, đăng ký (bằng Google hoặc email, không cần thẻ).
2. Menu **API Keys** → **Create API Key** → đặt tên bất kỳ → sao chép khóa (bắt đầu bằng `gsk_`, chỉ hiện một lần).

## Bước 4. Điền khóa vào file `.env`

1. Trong thư mục `scripts/invoice-bench`, sao chép file `.env.example` thành file mới tên **`.env`**.
2. Mở `.env` bằng Notepad, dán 3 giá trị sau dấu `=` (không có dấu cách, không có ngoặc):
   ```
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   GROQ_API_KEY=...
   ```
3. Lưu lại. Không có khóa nào thì công cụ chỉ bỏ qua mô hình đó; có Cloudflare mà chưa có Groq vẫn chạy được.

## Bước 5. Chạy thử 3 ảnh trước

Mở terminal ở thư mục gốc dự án (`D:\AgriCo`) và chạy:

```bash
node scripts/invoice-bench/run.mjs --limit 3
```

Phải thấy các dòng kiểu `[1/3] phan-npk-1.jpg · cf-gemma3: đọc được 4 dòng (6.2s)`. Nếu thấy lỗi, xem mục "Gặp lỗi" ở cuối.

## Bước 6. Chạy cả bộ ảnh

```bash
node scripts/invoice-bench/run.mjs
```

Mất khoảng 10–20 phút cho 30 ảnh. Dừng giữa chừng rồi chạy lại vẫn tiếp tục từ chỗ dở. Muốn đọc lại từ đầu thêm `--force`. Muốn chạy riêng một mô hình: `--engines cf-gemma3` (các tên: `cf-gemma3`, `cf-llama32`, `cf-mistral31`, `groq-scout`).

## Bước 7. Mở trang so sánh và chấm

```bash
node scripts/invoice-bench/report.mjs
```

Mở file **`scripts/invoice-bench/ket-qua/so-sanh.html`** bằng trình duyệt. Mỗi ảnh hiện bên trái, kết quả của từng mô hình bên phải. Việc của bạn: so với ảnh, **tích vào ô "Sai?" ở trường hoặc dòng hàng đọc sai hoặc thiếu**.
- Đầu phiếu gồm 5 trường: nhà cung cấp (bên bán), mã số thuế, mã đơn / số hóa đơn, ngày, tổng tiền. Trường trống mà trên ảnh có thì cũng tích sai.
- Mỗi dòng hàng tích sai nếu sai tên, số lượng, đơn vị, đơn giá hoặc thành tiền.
- Ô "Số dòng hàng bị bỏ sót": gõ số dòng có trên ảnh mà mô hình không đọc ra.
- Bảng tổng hợp ở đầu trang tự tính tỉ lệ đúng và báo **ĐẠT / chưa đạt** theo ngưỡng đã chốt: đầu phiếu đúng ≥ 90% và dòng hàng đúng ≥ 80%. Dấu tích tự lưu trong trình duyệt (cùng máy), nút "Lưu kết quả đã tích" tải ra file nếu muốn giữ.
- Mẹo: chấm đủ 30 ảnh cho một mô hình trước cũng được, nhưng chấm cả bốn mô hình trên từng ảnh nhanh hơn vì đang nhìn ảnh đó.

## Bước 8. Gửi kết quả cho tôi

Chụp màn hình **bảng tổng hợp ở đầu trang** và viết thêm vài dòng: loại hóa đơn nào mô hình hay sai nhất (viết tay? giấy nhiệt? số tiền?), mô hình nào bạn thấy ổn. Có thể gửi thêm file `dau-tich-doc-hoa-don.json` (nút "Lưu kết quả đã tích"). **Không gửi khóa API.**

Rồi tôi sẽ đề xuất: chọn mô hình thắng và làm tiếp tính năng, hoặc nếu chưa mô hình nào đạt thì chỉnh cách hỏi và thử lại, hoặc dừng và chuyển sang các cách làm nhập tay nhanh hơn (mục 12 của kế hoạch).

## Gặp lỗi

| Thông báo | Cách xử lý |
|---|---|
| `Chưa có mô hình nào dùng được` | Chưa có file `.env` hoặc chưa điền khóa; làm lại bước 4 |
| `HTTP 401` hoặc `HTTP 403` ở Cloudflare | Token sai hoặc thiếu quyền Workers AI; tạo lại token bằng mẫu "Workers AI" |
| `HTTP 401` ở Groq | Khóa sai; tạo khóa mới |
| `HTTP 429` | Chạm giới hạn theo phút, công cụ tự đợi và thử lại; nếu báo hết hạn mức ngày thì chạy lại sau 7 giờ sáng hôm sau |
| Llama 3.2 báo cần đồng ý giấy phép | Công cụ tự gửi lệnh đồng ý (giấy phép của Meta) ở lần chạy đầu; nếu vẫn lỗi thì chạy lại một lần nữa |
| `model not found` / lỗi không có mô hình | Cloudflare hoặc Groq đã đổi tên mô hình; báo tôi tên lỗi để cập nhật, các mô hình khác vẫn chạy |
| `KHÔNG ra JSON` | Mô hình trả lời không đúng khuôn; trang so sánh tính là không đọc được cho ảnh đó. Không phải lỗi của bạn |
| Ảnh iPhone dạng HEIC không đọc được | Xuất sang JPG trước |
