# Việc còn lại của APP — để chủ sản phẩm chọn làm tiếp (26/10/2026)

*Cỡ: S ≈ một phiên, M ≈ 2–3 phiên, L ≈ nhiều phiên. Tick `[x]` khi xong; ghi lựa chọn vào cột "Quyết".*

## A. Việc của chủ sản phẩm (không phải viết code)
| # | Việc | Ghi chú |
|---|---|---|
| A1 | `npx supabase db push` các migration **0016 → 0103** rồi `git push` | Nhiều tính năng mới chưa lưu được khi chưa đẩy (xem `TIEN_DO_TRIEN_KHAI_APP.md`) |
| A2 | Deploy lại Edge Function `staff-accounts` | D45 |
| A3 | Xem CI trên GitHub xanh (bộ test đầy đủ) | Tôi chỉ chạy test từng file |
| A4 | Dùng thử thật theo `HUONG_DAN_THU.md`, gửi phản hồi theo mức P0–P3 | Nhiều thay đổi gần đây chưa ai mở xem trên màn hình |
| A5 | Cung cấp dữ liệu: ~~bảng kiểm dưa lưới (18/25 tiêu chí)~~ (đủ 25, 31/10/2026, D129), đối chiếu bảng kiểm heo, lịch vaccine heo | Cần cho bảng kiểm, mốc nhắc |

## B. Dở dang của các đợt vừa làm
| # | Việc | Cỡ | Quyết |
|---|---|---|---|
| ~~B1~~ ✔ | **Mô hình E**: "Việc cần làm tiếp" của vụ theo mô hình; nhắc cách ly cho mô hình 1–2 (dựa mốc ngưng thuốc của quy trình) | M | |
| ~~B2~~ ✔ (bỏ: dùng nhóm Nhân công) | **Mô hình G**: lối tắt "Ghi tiền công" ở Chi phí cho mô hình 1 (nhóm Nhân công, chọn người nhà) | S | |
| ~~B3~~ ✔ | Mục "tùy chọn" của mô hình hiện chỉ là hiện/ẩn; cho chủ **bật/tắt riêng** từng mục tùy chọn theo vụ | S–M | |
| ~~B4~~ ✔ | Cập nhật **Hướng dẫn trong app** và `HUONG_DAN_THU.md` cho cấu trúc mới (Khai báo gộp nhân sự, Cấu hình, Phân khu, mô hình theo vụ, Kho mới) | M | |
| B5 | Siết chính sách "xuất dùng" của nhân viên: chỉ ghi kèm nhật ký (cần sửa vài test cũ) | S | |
| B6 | Thông báo lỗi từ máy chủ còn chữ "trang trại"; website (mảng WEB) còn dùng "trang trại" | S | |
| B7 | Rà lại chế độ đơn giản cũ (đang khóa): xóa hẳn mã cũ hay giữ | S | |

*(B1–B4 đã xong về code 27/10/2026: việc cần làm tiếp + nhắc cách ly, Ghi tiền công, mục tùy chọn theo vụ (migration 0104), hướng dẫn và bài thử mới.)*

## C. Trong kế hoạch từ trước, chưa làm
| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| C1 | **Giao việc** (giao người/tổ, hạn, "Làm việc này" tự đánh dấu xong) — G2-7 T1–T2 | L | Hợp mô hình 3–4 |
| C2 | **Thông báo đẩy** (công chờ duyệt, nhắc việc theo ngày, công nợ đến hạn, báo cáo tuần) — G2-7 N1–N4 | L | iPhone hạn chế hơn Android |
| C3 | **Phiếu đo môi trường** (nhiệt độ, độ ẩm, EC/pH, số lần tưới, cân mẫu) + ngưỡng — P3 đầy đủ | M–L | Điền các cột còn trống ở sổ nhật ký |
| C4 | **Chụp hóa đơn** đọc bằng AI — G2-3 | L–XL | Hoãn; cần thử độ chính xác trước |
| C5 | **Giọng nói** tầng 2–3 (tách trường từ câu nói) — G2-6 | M–L | Chờ số đo thực địa |
| C6 | **Hộ rời HTX / chuyển quyền chủ hộ**, thanh toán trực tuyến, tách người duyệt — G2-8 | L | Cần quyết định pháp lý |
| C7 | **Lịch kiểm tra định kỳ** (mẫu nước, hố sát trùng, tự đánh giá hằng năm, lưu 2 năm) — P5 phần bỏ | M | |

## D. Mở rộng loại hình (hoãn theo D100)
| # | Việc | Cỡ |
|---|---|---|
| D1 | P7: thu trứng hằng ngày, gói "Đàn nhỏ" (gà, chim, cút) | M |
| D2 | P6: gói loại hình trọn bộ (tạo cơ sở là có sẵn việc, quy trình, sổ), lớp phủ C.P. | M |
| D3 | P8: cá thể / cặp sinh sản (nái, dúi, bồ câu) | L |
| D4 | P9: gia công C.P., truy xuất công khai theo lô, cảm biến/thời tiết, thủy sản, hồ sơ nhân công | L |
| D5 | Hộ thành viên HTX: thêm tập hợp báo cáo cho HTX (sản lượng theo hộ, chứng nhận sắp hết hạn) | M |

## E. Chất lượng và kỹ thuật
| # | Việc | Cỡ |
|---|---|---|
| E1 | Kiểm bằng trình duyệt từng màn đã sửa gần đây (Cấu hình, Kho, Nhân sự, Hộ thành viên, Tạo vụ, chọn mô hình), chụp màn hình báo lỗi bố cục | M |
| E2 | Rà hiệu năng và dung lượng gói sau nhiều thay đổi (đo lại build) | S |
| E3 | Test đầu-cuối đồng bộ cho các luồng mới (xuất kho tay, chuyển kho, mô hình vụ) | S–M |

## Đề xuất thứ tự
1. **A1–A4** (đưa lên chạy thật và dùng thử) song song **E1** (tôi kiểm giao diện).
2. **B1, B2, B4** để hoàn chỉnh mô hình quản lý.
3. **C1 Giao việc**, rồi **C2 Thông báo đẩy** (giá trị lớn cho mô hình 3–5).
4. **C3 Phiếu đo** khi đi theo VietGAP; phần còn lại theo phản hồi dùng thử.

## F. Rà soát phân biệt trồng trọt / vật nuôi / thủy sản (27/10/2026) — chờ chủ sản phẩm chọn
| # | Vấn đề đã xác nhận trong mã | Hướng xử lý đề xuất | Cỡ |
|---|---|---|---|
| F1 | **Đầu việc và gói trường theo CƠ SỞ, không theo loại**: "Áp dụng gói heo" ghi đè form Thu hoạch của dưa (và ngược lại); Ghi việc hiện mọi đầu việc (Thụ phấn cho vụ heo, Tiêm vaccine cho vụ dưa) | Đầu việc có "áp dụng cho loại" và form riêng theo loại; Ghi việc/Thu hoạch lọc theo loại của vụ | L |
| F2 | **Thủy sản gần như chưa có**: sổ nhật ký dùng bộ dưa lưới, mốc gợi ý "ngưng bón phân" của trồng trọt hiện cho thủy sản, Tăng trọng/FCR chỉ bật cho vật nuôi, chưa có gói trường/bảng kiểm | Sửa các chỗ sai ngay; làm gói thủy sản khi có tài liệu | S + M |
| F3 | **Phân khu và sản phẩm không kiểm khớp**: phân khu "Chăn nuôi" vẫn tạo được vụ trồng; chọn phân khu trước nên chưa biết loại | Đổi thứ tự Tạo vụ: Sản phẩm → Quy trình → Phân khu (lọc theo loại, cảnh báo khác loại) | S–M |
| F4 | **Số con ban đầu** nằm trong khung thu gọn không bắt buộc, trong khi là gốc của hao hụt, mật độ, FCR | Vật nuôi/thủy sản: hiện nổi bật "Số con nhập", nhắc/bắt buộc | S |
| F5 | **Mô hình 1–2 làm vật nuôi mất FCR** (FCR cần Kho và cám xuất cho vụ) mà không báo | Nhắc rõ, hoặc ô "cám đã dùng (kg)" nhập tay thay thế | S–M |
| F6 | **Tổng kết vụ chỉ tính theo kg và m²**; vật nuôi cần theo con: hao %, kg/con, giá thành/kg thịt hơi, lãi/con | Tổng kết theo loại | M |
| F7 | Thiếu dữ liệu mẫu và thử nghiệm cho vật nuôi, thủy sản | Dữ liệu mẫu heo, cá; bài thử riêng | S |
