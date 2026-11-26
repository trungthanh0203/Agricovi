# Phương án làm app Acovin song ngữ Việt – Anh

> Ngày lập: 26/11/2026. Đã duyệt **bước 0** và làm xong trên nhánh `feat/app-i18n`. Khảo sát và so sánh phương án: `PLAN_DA_NGON_NGU_APP.md`.

## 0. Kết quả bước 0 và cách thử

- Lingui 5.9.5, 255 câu có đủ bản Anh: Đăng nhập (kèm đăng ký, cài app, liên hệ), khung Trang chủ (chào, sơ đồ luồng, ghi chú, việc hôm nay), Ghi việc, thanh dưới và menu.
- Thử: `npm run dev:app`, mở app, chọn English. Bản đã phát hành: thêm `?lang=en` vào địa chỉ thì nút đổi ngôn ngữ mới hiện (`PUBLIC_SWITCH` trong `lib/i18n.ts`).
- Thêm hoặc sửa câu: `npm run i18n:extract -w @agriconnect/app`, điền `en.po`, rồi `npm run i18n:check -w @agriconnect/app` (thêm `-- --pairs` để in cặp câu cho người soát).
- **Còn tiếng Việt ở bản Anh:** thông báo lỗi (`friendlyError`, kiểm tra ô nhập), các khối số liệu và nhắc việc ở Trang chủ, tên dữ liệu (loại việc, vụ, vai trò), mọi màn khác.
- **Bước 1 phải làm:** các chỗ tự đọc số bằng `replace(',', '.')` hoặc tự viết số bằng `replace('.', ',')` ngoài màn Ghi việc chưa theo ngôn ngữ (dùng `normalizeDecimal`, `numberToInput` ở `lib/format.ts`). Tệp `lib/*` được test Node nạp thì không dùng macro Lingui trực tiếp (cần cách nạp riêng cho test, quyết trước khi dịch lỗi).
- **Chưa thử:** Trang chủ và Ghi việc ở tiếng Anh sau đăng nhập, chạy offline trên bản build, dung lượng tăng thêm.

## 0b. Kết quả bước 1, đợt 1a (thu hoạch, nhật ký, chấm công)

- Tổng 663 câu có bản Anh. Đã dịch: Thu hoạch, Nhật ký và sửa nhật ký, Chấm công (nhập công, danh sách, ảnh, nghỉ phép), khối nhắc ở Trang chủ (việc hôm nay, lô sắp hết hạn, hao hụt, tài sản, hợp đồng, website), thông báo lỗi chung.
- Đọc và điền số theo ngôn ngữ ở toàn app.
- Cách bọc: hàm thuần và thành phần mới dùng thẳng `t` từ `@lingui/core/macro` (đổi ngôn ngữ là tải lại app nên an toàn); nhãn khai ngoài hàm viết bằng getter `get x() { return t`…`; }`. **Không** đọc các nhãn đó lúc nạp mô-đun.
- Chữ bị tách quanh ô nhập hoặc số được dịch theo từng đoạn: cần người soát câu tiếng Anh trên màn thật.
- Giữ tiếng Việt có chủ ý: tệp CSV bảng lương, gợi ý phân loại thu hoạch (được lưu vào dữ liệu).
- **Đợt 1b còn lại:** Kho (`StockPanel` và các biểu mẫu kho), Bảng công giấy và quét giấy, số liệu Trang chủ (`HomeStats`, `HomeWeekly`, `HomePay`, `CycleProgressList`, `MilestonePanels`), khách hàng / nhà cung cấp mở từ Thu hoạch, và các tệp `lib/*` mà test Node nạp (cần bộ nạp macro cho test trước).

## 1. Công nghệ chốt

| Phần | Chọn | Lý do |
|---|---|---|
| Thư viện | **Lingui** (dạng macro) | Câu tiếng Việt viết ngay trong mã, không đặt khóa |
| Tệp dịch | `.po` trong git: `apps/app/src/locales/vi.po`, `en.po` | Xem được thay đổi, người dịch mở bằng công cụ phổ biến |
| Nạp ngôn ngữ | Nạp đúng một gói trước khi vẽ app; đổi ngôn ngữ thì **tải lại app** | Đơn giản, không sót chữ cũ; service worker lưu sẵn nên chạy offline |
| Số, ngày, tiền | Một tệp `lib/format.ts` dùng `Intl` có sẵn | Không thêm thư viện |
| Người dịch | Claude dịch theo bảng thuật ngữ, bạn hoặc người rành tiếng Anh nông nghiệp soát phần quan trọng | Không phát sinh phí công cụ |

Chưa xác nhận: phiên bản Lingui hợp với Vite 5 hiện tại. Đây là việc đầu tiên của bước 0.

Mở rộng ngôn ngữ thứ ba sau này: thêm một tệp `.po` và một dòng cấu hình.

## 2. Cách viết trong mã

```tsx
// Chữ trong giao diện
<Trans>Ghi việc</Trans>
<input placeholder={t`Nhập số lượng`} />

// Câu có số (tiếng Anh có số ít, số nhiều)
<Plural value={n} one="# phiếu" other="# phiếu" />

// Danh sách khai báo ngoài hàm: đánh dấu trước, dịch lúc hiển thị
const TABS = [{ id: 'home', label: msg`Trang chủ` }];
```

Quy tắc:
- Dịch **cả câu**, không ghép mảnh (`'Đã dùng ' + n + ' vụ'`).
- Không so sánh theo chữ hiển thị; so sánh theo mã.
- Không bọc dữ liệu người dùng, giá trị lưu vào CSDL, khóa kỹ thuật.
- Sửa câu tiếng Việt thì câu tiếng Anh tương ứng bị báo thiếu, phải dịch lại.

## 3. Hành vi người dùng thấy

- Mặc định **tiếng Việt**, không tự đổi theo ngôn ngữ máy (nhiều người Việt để máy tiếng Anh).
- Nút "Tiếng Việt / English" ở màn Đăng nhập và trong "Cơ sở của tôi".
- Lựa chọn lưu theo thiết bị (`agriconnect.lang`).
- Đổi ngôn ngữ khi đang nhập dở thì hỏi trước. Bản ghi chờ gửi nằm trong IndexedDB, không mất.
- Câu chưa dịch hiện tiếng Việt.

## 4. Số và ngày (làm ngay từ bước 0)

| | Tiếng Việt | Tiếng Anh |
|---|---|---|
| Số | 1.234,5 | 1,234.5 |
| Ngày | 26/11/2026 | 26 Nov 2026 |
| Tiền | 40.000 đ | 40,000 VND |

Ngày tiếng Anh viết tên tháng để không nhầm ngày với tháng.

Ô nhập số: một hàm đọc duy nhất theo ngôn ngữ đang chọn; chuỗi mơ hồ (ví dụ `1,500` khi đang ở tiếng Việt) giữ đúng cách hiểu hiện nay và hiện lại số đã hiểu cho người nhập xem. Có test riêng. Tiếng Việt không được đổi hành vi.

## 5. Chữ đến từ máy chủ (không sửa SQL cũ)

| Loại | Cách làm |
|---|---|
| Thông báo lỗi | Script rút mẫu câu từ migration, tạo bảng Anh; `friendlyError` khớp câu và điền lại tham số; không khớp thì hiện tiếng Việt |
| Tên dữ liệu hệ thống (loại việc, đơn vị, cây/con, mẫu quy trình, checklist) | Thêm bản dịch bằng migration `..._app_i18n_...sql`; chỉ dịch khi tên còn trùng bản gốc, tên cơ sở đã tự sửa thì giữ nguyên |
| Thông báo đẩy | Để sau; cần lưu ngôn ngữ người dùng ở máy chủ |

## 6. Phạm vi đợt này

**Dịch:** giao diện `apps/app`, lỗi, dữ liệu hệ thống, trợ giúp chính.
**Giữ tiếng Việt:** sổ nhật ký, hợp đồng, bảng kê, bảng lương, bản in; `apps/admin`; bài hướng dẫn dài (làm sau).
**Ẩn ở tiếng Anh:** nhập bằng giọng nói (bộ hiểu câu chỉ có tiếng Việt).

## 7. Lộ trình

| Bước | Nội dung | Phiên | Kiểm tra khi xong |
|---|---|---|---|
| 0. Nền + thí điểm | Cài Lingui, nút chọn ngôn ngữ, `format.ts`, bảng thuật ngữ, dịch Đăng nhập, Trang chủ, Ghi việc | 1–2 | Tiếng Việt y như cũ; mở offline được cả hai tiếng; đo dung lượng thêm |
| 1. Việc hằng ngày | Thu hoạch, chấm công, kho, nhật ký, lỗi hay gặp, bỏ so sánh theo chữ | 3–5 | Thử thật bằng tài khoản nhân viên |
| 2. Quản lý | Vụ, khu, chi phí, doanh thu, nhân sự, cài đặt | 6–10 | Rà từng tab |
| 3. Máy chủ | Bảng lỗi Anh, dữ liệu hệ thống, một file test | 2–4 | Bạn chạy `db push` |
| 4. Hoàn thiện | Trợ giúp, soát tiếng Anh, bố cục màn nhỏ | 1–3 | Người soát duyệt |

Tổng khoảng 13–24 phiên (ước tính, tính lại sau bước 0). Mỗi bước phát hành được; nên chỉ cho người dùng thấy nút English sau bước 1.

## 8. Kiểm soát chất lượng

- Script `i18n:check`: báo câu thiếu bản Anh, mất tham số, còn chữ Việt chưa bọc trong màn đã chuyển.
- Giai đoạn đầu chỉ cảnh báo, không chặn build. Sau bước 2 mới cho CI chặn.
- Thêm vào `apps/app/CLAUDE.md`: màn đã chuyển thì chữ mới phải qua lớp dịch, kèm bản Anh.
- Làm trên nhánh `feat/app-i18n`; tránh chạy song song với đợt sửa giao diện lớn.

## 9. Bảng thuật ngữ khởi đầu (cần bạn soát)

| Tiếng Việt | Tiếng Anh đề xuất |
|---|---|
| Cơ sở | Farm / Organization (khi gồm cả HTX) |
| Hộ thành viên | Member household |
| Hợp tác xã (HTX) | Cooperative |
| Khu trồng, chuồng, ao | Plot, pen, pond |
| Vụ, lứa | Season (cây), batch (vật nuôi, thủy sản) |
| Ghi việc | Log activity |
| Nhật ký | Logbook |
| Vật tư | Supplies |
| Thu hoạch | Harvest |
| Xuất bán | Sale |
| Thời gian cách ly | Withdrawal period (thuốc thú y), pre-harvest interval (thuốc bảo vệ thực vật) |
| Chấm công | Attendance |
| Tổ, tổ trưởng | Team, team leader |
| Công khoán | Piecework |
| Tổng kết vụ | Season summary |
