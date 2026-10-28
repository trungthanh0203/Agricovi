# Kế hoạch đợt 3: quy trình mẫu hệ thống cho Heo thịt và Thủy sản (đề xuất 28/10/2026, chờ duyệt)

## Ý kiến chung
Hai bộ khác nhau nhiều (xem bảng), nên **làm lần lượt, không song song**: xong và cho hộ thí điểm dùng thử **Heo thịt** rồi mới sang **Thủy sản**. Lý do: Heo đã có tài liệu và bảng kiểm làm nền; Thủy sản chưa có tài liệu, phụ thuộc loài nuôi và cần thêm phần đo môi trường nước. Làm hai bộ cùng lúc dễ cho ra hai bộ dở dang, không bộ nào dùng được thật.

Phần khung kỹ thuật **đã sẵn**: mẫu hệ thống, áp dụng cho cơ sở, công đoạn → việc, việc chạy song song/lặp lại, hướng dẫn, vật tư dự kiến, Việc đến hạn hôm nay, biểu mẫu chuẩn của việc vật nuôi và thủy sản. Phần còn lại chủ yếu là **nội dung** (cần người có chuyên môn duyệt) và vài bổ sung nhỏ.

## Khác biệt chính
| | Heo thịt | Thủy sản |
|---|---|---|
| Chu kỳ | Một lứa nuôi nhập chuồng 20 kg đến xuất chuồng ~105 kg: khoảng 90–120 ngày; chia 2 giai đoạn theo cân nặng | Tùy loài: tôm thẻ khoảng 90–120 ngày, cá tra khoảng 6–8 tháng, cá rô phi 4–6 tháng; thu tỉa nhiều đợt |
| Nơi nuôi | Chuồng (kín/hở), trống chuồng 7 ngày giữa các lứa | Ao/bể: cải tạo đáy, bón vôi, lấy nước, gây màu nước trước khi thả |
| Việc lặp | Cho ăn hằng ngày, sát trùng định kỳ, vệ sinh chuồng | Đo môi trường nước hằng ngày (pH, oxy, độ mặn, nhiệt độ), thay nước, xử lý nước, cho ăn nhiều cữ, kiểm tra sức khỏe |
| Việc theo mốc tuổi | Vaccine, tẩy giun theo ngày tuổi/lịch thú y của trại | Xử lý bệnh theo dấu hiệu, cân mẫu 7–15 ngày |
| Kết thúc | Xuất chuồng một lần (đếm con và kg, kiểm dịch) | Thu tỉa, thu toàn bộ; bán theo cỡ |
| Rủi ro nội dung | Lịch vaccine do thú y chốt, không đặt cứng | Quy trình rất khác nhau theo loài, vùng, mùa; dễ sai nếu soạn khi chưa có số liệu thật |

## Hướng A — Heo thịt (làm trước)
**Đầu vào cần bạn cung cấp** (đã nêu ở `PLAN_DOT2_CHAN_NUOI_HEO.md` mục 6): bảng kiểm VietGAP chăn nuôi heo chính thức, mẫu sổ nhật ký thực tế của hộ nuôi heo, hộ nuôi heo thịt hay nái, chuồng kín hay hở, có gia công cho C.P. không.

| Bước | Nội dung | Cỡ |
|---|---|---|
| A1 | Soạn bản nháp **Heo thịt VietGAP**: công đoạn (Chuẩn bị chuồng, Nhập heo và cách ly, Giai đoạn 1 20–60 kg, Giai đoạn 2 61–105 kg, Xuất chuồng); việc: đệm lót/vệ sinh/sát trùng, cho ăn (lặp hằng ngày), cân mẫu (lặp 15 ngày), tiêm vaccine và tẩy giun (theo lịch thú y, không cài cứng), kiểm tra sức khỏe, xử lý chất thải, diệt chuột/côn trùng, xuất chuồng; hướng dẫn và vật tư dự kiến theo tên chung | M |
| A2 | Mốc nhắc theo ngày tuổi và lùi từ ngày xuất: gợi ý mốc ngưng thuốc thú y trước xuất; không cài lịch vaccine cứng | S |
| A3 | Bộ mẫu vào CSDL (migration seed, phiên bản 1, nhãn "bản tham khảo") + test áp dụng và tạo vụ | S |
| A4 | Hộ thí điểm áp dụng, tạo một lứa thử, góp ý; chỉnh số ngày và việc (sửa dữ liệu mẫu, không đổi mã) | M (cần hộ thí điểm) |
| A5 | Bổ sung nếu thiếu: cảnh báo trống chuồng tối thiểu 7 ngày giữa hai lứa, đếm con khi xuất chuồng (đã có ô số con), bảng kiểm heo gắn với mẫu | S–M |

**Kết quả đợt A:** cơ sở nuôi heo thịt bấm Áp dụng là có quy trình, việc đến hạn hằng ngày, nhật ký đúng biểu mẫu chuẩn, sổ nhật ký heo.

## Hướng B — Thủy sản (làm sau, chia theo loài)
**Quyết định cần có trước khi bắt đầu:** chọn **một loài đầu tiên** theo hộ thí điểm của bạn (đề xuất: tôm thẻ chân trắng hoặc cá tra, tùy hộ nào có số liệu thật). Mỗi loài là một mẫu hệ thống riêng; không làm một mẫu "thủy sản chung".

**Đầu vào cần bạn cung cấp:** loài, nuôi ao đất hay bể/lồng, quy trình thực tế của hộ (các giai đoạn, số ngày, việc, thuốc/chế phẩm thường dùng, ngưỡng pH/oxy/độ mặn), mẫu sổ nhật ký ao nếu có.

| Bước | Nội dung | Cỡ |
|---|---|---|
| B1 | Rà việc thủy sản hiện có (cho ăn, đo môi trường nước, thay nước, xử lý nước, cải tạo ao, điều trị, sát trùng, thu hoạch) và bổ sung việc còn thiếu theo loài (thả giống, kiểm tra sàng ăn, thu tỉa…) kèm biểu mẫu chuẩn | S–M |
| B2 | **Phiếu đo môi trường nước** (pH, oxy, độ mặn, nhiệt độ, độ trong) nhập nhanh hằng ngày + ngưỡng cảnh báo: việc lặp hằng ngày của thủy sản cần dạng nhập một chạm, không phải form dài (liên quan C3 của `KE_HOACH_HOAN_THIEN_APP.md`) | M–L |
| B3 | Soạn bản nháp mẫu theo loài đã chọn: Cải tạo ao, Thả giống, Giai đoạn nuôi (nhiều đợt cân mẫu, thay nước, xử lý nước), Thu tỉa, Thu hoạch; việc lặp và song song | M |
| B4 | Seed + test; hộ thí điểm dùng thử một vụ; chỉnh | M (cần hộ thí điểm) |
| B5 | Thêm loài thứ hai (khi có số liệu) | M mỗi loài |

## Thứ tự và mốc
1. **Bạn gửi đầu vào Heo** (hoặc cho tôi soạn nháp từ tài liệu hiện có, bạn/thú y duyệt) → A1–A3.
2. Hộ thí điểm dùng thử Heo (A4) trong lúc tôi làm B1–B2 (phần kỹ thuật không phụ thuộc số liệu loài).
3. Khi có số liệu loài thủy sản đầu tiên → B3–B4.
Hai hướng chỉ chạy gối đầu ở phần kỹ thuật (B2), không soạn nội dung chuyên môn cùng lúc.

## Cần chủ sản phẩm quyết
1. Đồng ý làm **Heo thịt trước, Thủy sản sau**, mỗi loài thủy sản một mẫu riêng?
2. Heo: cho tôi soạn nháp từ tài liệu có sẵn rồi bạn/thú y duyệt, hay chờ bạn gửi bảng kiểm và mẫu sổ chính thức trước?
3. Thủy sản: loài đầu tiên là gì, và có hộ thí điểm cung cấp quy trình thực tế không?
4. Ai duyệt chuyên môn từng bộ (thú y cho heo, kỹ sư thủy sản cho cá/tôm)?

## Tiến độ (28/10/2026)
- **Quyết định**: Heo trước, Thủy sản sau (loài đầu tiên: **tôm**); heo do tôi soạn nháp từ tài liệu có sẵn; chuyên môn tạm tham khảo thông tin trên mạng làm chuẩn cơ bản (bạn sẽ đối chiếu).
- **A1–A3 xong về code**: migration 0119, mẫu `pig_fattening_vietgap` (5 công đoạn, 25 việc, 129 ngày; cho ăn mỗi ngày, cân mẫu mỗi 15 ngày, sát trùng mỗi 7 ngày; vaccine và tẩy giun chỉ là việc có hướng dẫn, không cài lịch cứng); test `system_template_pig`.
- Còn lại: A4 (hộ thí điểm dùng thử một lứa), A5 (cảnh báo trống chuồng 7 ngày, bảng kiểm gắn mẫu); Hướng B (tôm): B1 rà việc thủy sản, B2 phiếu đo môi trường nước.
- **B1 + B2 xong về code (28/10/2026, migration 0120)**: thêm việc có sẵn **Thả giống**, **Kiểm tra sàng ăn**, **Kiểm tra sức khỏe thủy sản** (biểu mẫu chuẩn ở `standardFields.ts`); thu hoạch thủy sản có ô **Thu tỉa / Thu toàn bộ**. **Phiếu đo môi trường nước**: ô số có **ngưỡng cảnh báo mềm** (`alert_low`, `alert_high`, chỉnh ở Khai báo → Việc) và **điền sẵn giá trị lần đo trước** (`prefill`); cảnh báo hiện ngay khi gõ và trong Nhật ký việc. Ngưỡng mặc định là mức tham khảo cho tôm thẻ (pH 7,5–8,5; nhiệt độ 26–32 °C; oxy hòa tan ≥ 4 mg/l; độ trong 25–50 cm; độ mặn không đặt ngưỡng), cần đối chiếu theo trại. Còn lại: B3 soạn mẫu tôm khi có số liệu thật, B4 thí điểm.
