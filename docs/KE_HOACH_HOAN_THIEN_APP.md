# Kế hoạch hoàn thiện APP (đề xuất 28/10/2026, chờ chủ sản phẩm chọn)

*Thay cho danh sách rải rác trong `VIEC_CON_LAI_APP.md` (giữ làm lịch sử). Cỡ: S ≈ một phiên, M ≈ 2–3 phiên, L ≈ nhiều phiên.*

## Đã xong gần đây (chưa đẩy lên chạy thật)
Migration **0091 → 0113** chưa `db push`. Tính năng: Kho mới, mô hình quản lý theo vụ, phân biệt trồng/nuôi/thủy sản, **Việc** (danh mục, một đối tượng, vật tư, tách theo đối tượng), **Công đoạn** (quy trình 2 cấp, tùy chọn dùng/không), **Đối tượng sử dụng** của cơ sở, **Tạo quy trình** với **Mẫu hệ thống dưa lưới**, form Ghi việc mới.

## Đợt 1 — Đưa lên chạy và kiểm (làm trước, ít code)
| # | Việc | Ai | Cỡ |
|---|---|---|---|
| 1.1 | `npx supabase db push --dry-run` rồi `db push` (0091–0113); `git push`; xem CI xanh (đã sửa Node 22 mới nhất); deploy lại `staff-accounts` | Chủ sản phẩm | S |
| 1.2 | Kiểm từng màn mới trên trình duyệt/điện thoại: Việc, Tạo quy trình (2 tab, công đoạn), Ghi việc, Cấu hình (Sử dụng, Dùng công đoạn), chi tiết vụ nhóm theo công đoạn; chụp màn hình lỗi bố cục | Tôi + chủ sản phẩm | M |
| 1.3 | Duyệt nội dung mẫu dưa lưới (số ngày, việc) với hộ thí điểm; điền phiếu khảo sát `KHAO_SAT_HO_DUA.md` | Chủ sản phẩm | S |
| 1.4 | Cập nhật tài liệu một lần: `DECISIONS_APP` (đối tượng sử dụng, công đoạn/việc, mẫu hệ thống), `HUONG_DAN_THU`, hướng dẫn trong app, `STATUS_APP` | Tôi | M |
| 1.5 | Rà các chữ còn lệch tên mới (công đoạn/việc/giai đoạn) ở báo cáo, sổ nhật ký, hướng dẫn; "trang trại" cũ trong thông báo lỗi máy chủ | Tôi | S |

## Đợt 2 — Hoàn thiện quy trình (giá trị lớn nhất, vì mẫu dưa hiện nối tiếp từng việc)
| # | Việc | Cỡ |
|---|---|---|
| 2.1 | **Việc trong quy trình có "lặp lại"**: mỗi N ngày, từ ngày A đến ngày B của công đoạn, chạy song song với việc khác (tưới, bón, phun theo chu kỳ) — bước 2 của `PLAN_CONG_DOAN_NHIEU_VIEC.md`; sửa lại mẫu dưa cho đúng thực tế | L |
| 2.2 | **Hướng dẫn và vật tư dự kiến kèm lượng** cho từng việc trong quy trình (ảnh mẫu "Thông tin công việc") | M |
| 2.3 | **Chi tiết vụ: việc đến hạn hôm nay**, bấm là mở Ghi việc với việc và công đoạn đã chọn sẵn, vật tư dự kiến nạp sẵn | M |
| 2.4 | Chức vụ giới hạn việc: màn chọn việc theo đối tượng, nhắc khi có việc mới chưa nằm trong danh sách của chức vụ | S |
| 2.5 | Việc riêng cũ còn "Chưa chọn" đối tượng: nhắc ở trang Việc cho tới khi chọn xong | S |

## Đợt 3 — Mẫu hệ thống đủ bộ
| # | Việc | Cỡ |
|---|---|---|
| 3.1 | Bộ **Heo thịt** (từ sổ VietGAP heo, `PLAN_DOT2_CHAN_NUOI_HEO.md`), cần người duyệt chuyên môn | M |
| 3.2 | Bộ **Thủy sản** (cá tra/tôm) khi có quy trình thực tế | M |
| 3.3 | **Màn soạn mẫu hệ thống** cho quản trị nền tảng (apps/admin), thay cho nạp bằng migration | L |
| 3.4 | Báo "mẫu hệ thống có bản mới" cho quy trình đã áp dụng (không tự ghi đè), gợi ý "Chưa có quy trình? Xem mẫu hệ thống" ở màn Tạo vụ | M |

## Đợt 4 — Giao việc và thông báo (mô hình có người làm thuê)
| # | Việc | Cỡ |
|---|---|---|
| 4.1 | **Giao việc** cho người/tổ, hạn, "Làm việc này" tự đánh dấu xong (G2-7 T1–T2); nối với việc đến hạn của đợt 2 | L |
| 4.2 | **Thông báo đẩy**: công chờ duyệt, nhắc việc theo ngày, công nợ đến hạn, báo cáo tuần (G2-7 N1–N4); iPhone hạn chế hơn Android | L |

## Đợt 5 — Chất lượng VietGAP và vận hành
| # | Việc | Cỡ |
|---|---|---|
| 5.1 | **Phiếu đo môi trường** (nhiệt độ, độ ẩm, EC/pH, số lần tưới, cân mẫu) + ngưỡng; điền các cột trống ở sổ nhật ký (C3) | M–L |
| 5.2 | **Lịch kiểm tra định kỳ** (mẫu nước, hố sát trùng, tự đánh giá hằng năm) (C7) | M |
| 5.3 | Siết chính sách "xuất dùng" của nhân viên (B5); xóa hoặc giữ mã chế độ đơn giản cũ (B7) | S |
| 5.4 | Test đầu-cuối đồng bộ cho các luồng mới (xuất kho tay, chuyển kho, mô hình vụ, áp dụng mẫu hệ thống); rà hiệu năng và dung lượng gói | S–M |

## Hoãn (chờ phản hồi dùng thử hoặc quyết định)
Chụp hóa đơn bằng AI (C4), giọng nói tầng 2–3 (C5), hộ rời HTX và thanh toán trực tuyến (C6), gói loại hình trọn bộ và cá thể/cặp sinh sản (D1–D5); phần website thuộc mảng WEB.

## Đề xuất thứ tự
**Đợt 1 → Đợt 2 → Đợt 3 → Đợt 4 → Đợt 5.** Đợt 1 chặn mọi thứ sau vì nhiều tính năng mới chỉ lưu được khi đã `db push`. Đợt 2 cho mẫu dưa lưới đúng thực tế (hiện các việc nối tiếp nhau chưa phản ánh tưới/bón/phun theo chu kỳ).
