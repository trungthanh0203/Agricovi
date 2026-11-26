# Đa ngôn ngữ cho app Acovin: khảo sát, phương án, đề xuất

> Ngày lập: 26/11/2026. Trạng thái: **chờ chủ sản phẩm quyết định**, chưa sửa mã, chưa ghi vào DECISIONS.
> Phạm vi: `apps/app` (3–5 ngôn ngữ). Website đã có Việt–Anh (D71), không đụng.

## 1. Hiện trạng (đếm tự động, số gần đúng)

| Nơi | Tệp có chữ Việt | Câu khác nhau | Âm tiết |
|---|---|---|---|
| `apps/app` | 297 / 323 | khoảng 5.200 | khoảng 100.000 |
| `packages/shared` (phần lớn là từ điển của website) | 8 | khoảng 1.200 | khoảng 10.000 |
| `supabase/migrations` (lỗi, dữ liệu mẫu; có trùng do định nghĩa lại hàm) | 209 | khoảng 2.300 | khoảng 70.000 |
| Edge Function | 9 | khoảng 70 | khoảng 1.200 |
| `apps/admin` | 6 | khoảng 260 | khoảng 6.400 |

- App **chưa có** lớp dịch nào: chữ viết thẳng trong mã.
- Khoảng 1.800 lệnh `raise exception` có chữ Việt trong lịch sử migration.
- Khoảng 300 chỗ định dạng số, ngày (nhiều chỗ ghi cứng `vi-VN`), khoảng 90 chỗ sắp xếp `localeCompare`.
- Có logic **so sánh theo chữ hiển thị** (`payView.ts`, `payBookLogic.ts`, `DonutChart.tsx`, `OrgStatsSection.tsx`, `logbook/pig.ts`). Phải đổi sang mã trước khi dịch, nếu không sẽ sai ngầm.
- Bài hướng dẫn, trợ giúp dài: `guideContent*.ts`, `helpContent.ts` (khoảng 150 KB).

Việc khó không phải chọn thư viện, mà là **bọc vài nghìn câu mà không làm hỏng gì**.

## 2. Các phương án

| Phương án | Công sức | Chi phí tiền | Rủi ro | Đánh giá |
|---|---|---|---|---|
| A. Trình duyệt tự dịch (Google Dịch) | Không | 0 | Cao: sai thuật ngữ, liều lượng; có thể làm lỗi màn React; offline không chắc chạy | Loại |
| B. Dùng lại cách của website (thay chữ trên HTML + luật mẫu) | Trung bình | 0 | Cao: dễ dịch nhầm dữ liệu người dùng, đụng React, luật mẫu phình theo số ngôn ngữ | Loại cho app |
| C. Tự viết `t('câu Việt')` + tệp JSON | Trung bình | 0 | Trung bình: tự lo trích câu, số nhiều, phát hiện thiếu bản dịch | Được, nhưng tự nuôi công cụ |
| **D. Lingui** (câu Việt là gốc, biên dịch khi build) | Trung bình | 0 (mã nguồn mở) | Thấp: có công cụ trích câu, báo thiếu, số nhiều chuẩn ICU | **Đề xuất** |
| E. react-i18next / Paraglide (đặt khóa `home.save`) | Lớn: đặt tên khoảng 5.000 khóa | 0 | Trung bình: mã khó đọc hơn, dễ gắn nhầm khóa | Hợp dự án mới hơn |

**Vì sao chọn D:** mã vẫn đọc được tiếng Việt; thiếu bản dịch thì hiện tiếng Việt; mỗi ngôn ngữ là một gói tải riêng nên người dùng Việt gần như không nặng thêm; gói dịch được service worker lưu sẵn nên chạy offline. Cần thử ở bước thí điểm: bản Lingui tương thích Vite 5, và cách xử lý câu nằm trong hàm thuần `lib/*` (phải dịch lúc gọi, không dịch lúc nạp tệp).

Không cần nền tảng quản lý bản dịch (Crowdin, Tolgee, Weblate) lúc đầu: tệp trong git là đủ. Chỉ cân nhắc khi có từ 2 người dịch ngoài thường xuyên.

## 3. Bốn loại chữ, xử lý khác nhau

| Loại | Cách làm |
|---|---|
| Giao diện (nút, nhãn, cảnh báo) | Lingui |
| Lỗi từ máy chủ | **Không sửa SQL cũ.** App dịch tại `friendlyError`: script rút mẫu câu từ migration, khớp cả câu có tham số, thiếu thì hiện tiếng Việt. Hàm mới trả mã lỗi kèm tham số |
| Dữ liệu hệ thống (loại việc, đơn vị, cây/con, quy trình mẫu, checklist) | Migration thêm bản dịch theo ngôn ngữ, thiếu thì hiện tiếng Việt. Giá trị lưu trong CSDL **giữ nguyên**, chỉ dịch lúc hiển thị |
| Dữ liệu người dùng nhập | Không dịch |

**Giữ tiếng Việt (đề xuất):** sổ nhật ký, hợp đồng, bảng kê thu mua, bảng lương, tài liệu in nộp cơ quan. Hồ sơ xuất khẩu song ngữ để đợt riêng. `apps/admin` không dịch.

**Làm sau cùng:** giọng nói (bộ hiểu câu hiện viết cho tiếng Việt), đọc hóa đơn và bảng chấm công bằng AI, thông báo đẩy (cần lưu ngôn ngữ người dùng ở máy chủ), thư của Supabase. Ở ngôn ngữ khác, tạm ẩn nút giọng nói.

## 4. Chọn ngôn ngữ

| Đợt | Ngôn ngữ | Ghi chú |
|---|---|---|
| 1 | Việt (gốc) + **Anh** | Dễ kiểm tra; làm bản trung gian cho các tiếng khác |
| 2 | Chọn theo khách thật: **Khmer**, **Trung (giản thể)** | Khmer: lao động Khmer, thị trường Campuchia. Trung: đối tác thu mua, chủ đầu tư |
| 3 | Thái, Lào | Chỉ khi có khách |

- Thái, Lào, Khmer: dấu cao thấp và ngắt dòng khác, phải thử trên điện thoại thật; nút và thẻ không được cố định chiều cao. Dùng phông của máy trước.
- Tránh tiếng viết phải-sang-trái (Ả Rập) vì phải làm lại bố cục.
- Mỗi ngôn ngữ thêm vào là **chi phí duy trì mãi**: mỗi tính năng mới phải dịch thêm. Chỉ mở khi có người dùng và có người soát.

## 5. Chi phí (ước tính, không phải báo giá)

Giả định: khoảng 0,5–0,8 triệu ký tự cần dịch cho mỗi ngôn ngữ.

| Cách dịch | Tiền cho 4 ngôn ngữ (2–3,2 triệu ký tự) | Chất lượng |
|---|---|---|
| Claude dịch trong phiên làm việc, kèm bảng thuật ngữ | Không phát sinh ngoài gói đang dùng | Khá; hiểu ngữ cảnh mã. Khmer, Lào kém chắc hơn Anh, Trung |
| Google Cloud Translation | Khoảng 40–60 USD (khoảng 20 USD/triệu ký tự; nguồn ghi miễn phí 500.000 ký tự/tháng) | Dịch máy, yếu với nhãn ngắn |
| DeepL API | Gói miễn phí đang đổi, các nguồn mâu thuẫn | Chưa xác nhận có Khmer, Lào |
| Người bản ngữ soát **phần cốt lõi** (khoảng 15.000 từ) | Khoảng 500–1.000 USD mỗi ngôn ngữ | Đáng tin |
| Người soát toàn bộ | Có thể gấp 3–5 lần | Chưa cần lúc đầu |

Giá người soát là giả định của tôi, cần hỏi báo giá. **Đề xuất:** máy (Claude) dịch toàn bộ, người dùng bản ngữ soát phần cốt lõi; có thể nhờ khách thí điểm soát đổi lấy ưu đãi gói.

## 6. An toàn

1. **Câu nguy hiểm phải có người soát:** liều thuốc, thời gian cách ly, cảnh báo xóa dữ liệu, tiền lương, công nợ, quyền. Chưa soát thì hiện tiếng Việt hoặc tiếng Anh đã soát, kèm câu Việt gốc ở cảnh báo cách ly.
2. Chỉ gửi **câu cố định trong mã** cho công cụ dịch, không gửi dữ liệu khách hàng.
3. Kiểm tự động: không mất tham số `{số}`, `{tên}`; báo câu thiếu; tiếng Việt hiển thị y hệt trước khi chuyển.
4. Không đổi giá trị lưu trong CSDL, không đổi khóa kỹ thuật, không đổi hàng đợi offline.
5. Chuyển từng phần; phần chưa chuyển vẫn là tiếng Việt, app phát hành được bất cứ lúc nào.
6. Nhập số: tiếng Anh dùng dấu thập phân khác tiếng Việt (1.5 và 1,5). Phải có một hàm đọc số chung và test, tránh sai gấp nghìn lần. Tiền vẫn là VNĐ.

## 7. Lộ trình

Một "phiên" là một chat làm việc tập trung; số phiên chỉ là ước lượng, đo lại sau thí điểm.

| Bước | Việc | Phiên | Điều kiện đi tiếp |
|---|---|---|---|
| 0. Thí điểm | Cài Lingui, nút chọn ngôn ngữ, hàm định dạng chung, chuyển Đăng nhập + Trang chủ + Ghi việc sang tiếng Anh | 1–2 | Offline chạy, dung lượng ổn, tiếng Việt không đổi |
| 1. Luồng nhân viên | Thu hoạch, chấm công, kho, lỗi hay gặp, đổi so sánh theo chữ sang mã | 3–5 | Một nhân viên thử thật |
| 2. Quản lý | Phần còn lại của giao diện | 6–10 | |
| 3. Dữ liệu hệ thống, lỗi máy chủ | Migration bản dịch + test | 2–4 | |
| 4. Hướng dẫn, trợ giúp | Chỉ dịch phần chính | 1–3 | |
| 5. Mỗi ngôn ngữ thêm | Dịch, soát, thử giao diện | 1–2 + người soát | Có khách cần |

Sau bước 1 đã bán thử được cho người dùng nước ngoài ở việc hằng ngày; có thể dừng ở đó.

Nên tránh làm cùng lúc với đợt sửa giao diện lớn (bước 2 đụng gần như mọi tệp, dễ xung đột). Từ khi có bước 0, thêm quy tắc: chữ mới phải đi qua lớp dịch.

## 8. Cần bạn quyết

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Ai dùng bản tiếng nước ngoài: công nhân, chủ trại, hay đối tác xem hồ sơ? | Trả lời trước, vì quyết định ngôn ngữ và màn nào dịch trước |
| 2 | Ngôn ngữ đợt đầu | Chỉ Việt + Anh |
| 3 | Công nghệ | Lingui |
| 4 | Giấy tờ in, sổ sách | Giữ tiếng Việt |
| 5 | Soát bản dịch | Máy dịch, người soát phần cốt lõi |
| 6 | Bắt đầu từ đâu | Chỉ duyệt bước 0, xem kết quả rồi mới quyết tiếp |

## Nguồn tham khảo (tra ngày 26/11/2026; giá cần xem lại ở trang chính thức)

- Thư viện: [SimpleLocalize](https://simplelocalize.io/blog/posts/the-most-popular-react-localization-libraries/), [PkgPulse](https://www.pkgpulse.com/guides/next-intl-vs-react-i18next-vs-lingui-react-i18n-2026), [Paraglide](https://unpkg.com/@inlang/paraglide-js@2.21.0/README.md)
- Giá dịch máy: [ChatsControl](https://chatscontrol.com/blog/translation-api-free-tier-2026-deepl-google-azure), [BuildMVPFast](https://www.buildmvpfast.com/api-costs/translation), [eesel về DeepL](https://www.eesel.ai/blog/deepl-pricing)
- Ngôn ngữ Google hỗ trợ: [tài liệu Google Cloud](https://docs.cloud.google.com/translate/docs/languages)
- Công cụ quản lý bản dịch: [Tolgee](https://www.capterra.com/p/10002120/Tolgee/pricing/), [so sánh Crowdin và Tolgee](https://toolradar.com/compare/crowdin-vs-tolgee)
