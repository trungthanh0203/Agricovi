# Phương án bước C: vật tư, kho, chi phí, thu hoạch, tổng kết vụ

Trạng thái: **đã làm xong C0–C6 (code, test, tài liệu); chưa `db push` 0016–0017 và chưa thử tay trên máy thật.** Q1–Q5 đã chốt thành D19–D23. Phát sinh khi làm: migration 0017 (ON CONFLICT cần SELECT, xem CLAUDE.md bẫy 8), hàng đợi gửi theo thời điểm tạo tăng chặt, lệnh `npm run test:db:changed`. Truy vết: FR-INV-001…008, backlog E2-S10…S17, v1.1 mục 4.4–4.5, quyết định D9 (xong bước C thì đưa người dùng thật thử).

## 1. Hiện trạng (đã đọc migration 0003, 0006, 0013, 0015 và app)

Đã có sẵn trong CSDL: `materials`, `inventory_locations`, `inventory_transactions` (chỉ thêm, trigger chặn sửa/xóa), `inventory_balances`, `expense_records`, `sales_records`, `harvest_records`, view `cycle_summary`, RLS theo ma trận D18, audit trigger. App chưa có màn nào (tab "Vật tư & chi phí" đang là chỗ trống).

### Lỗ hổng phải vá trước khi làm màn hình (đây là lý do cần migration 0016)

| # | Vấn đề | Hậu quả nếu bỏ qua | Cách vá |
|---|---|---|---|
| 1 | `expense_records`, `sales_records`, `harvest_records` cho UPDATE tự do (không phiên bản, không guard) | Người có quyền sửa **âm thầm** số tiền/số lượng; vi phạm D15/A11 | Thêm `version`, `last_op_id`, trigger guard (cột bất biến, bản đã hủy không sửa), hàm `update_expense/update_sale/update_harvest` theo mẫu `update_activity_log` |
| 2 | Hủy nhật ký đã kèm xuất kho thì **kho vẫn bị trừ** | Tồn kho sai, giá thành vụ sai | Trigger khi `activity_logs.voided_at` được đặt: sinh giao dịch `adjustment` đảo dấu, lý do "Hủy nhật ký" (giao dịch gốc vẫn giữ nguyên) |
| 3 | `cycle_summary` là view `security_invoker`: người **không** được đọc chi phí (nhân viên, tổ trưởng) sẽ thấy `cash_paid = 0` | Số 0 giả, dễ hiểu nhầm "vụ không tốn chi phí" | Thay bằng hàm `get_cycle_summary(cycle)`: kiểm quyền, trả lỗi/NULL cho người không đủ quyền; thêm trường cảnh báo thiếu dữ liệu |
| 4 | Chưa có cách tính **giá vốn** vật tư xuất dùng | Không có "chi phí vật tư dùng trong vụ" | View `inventory_issue_costs`: giá vốn = bình quân gia quyền của các lần nhập **có giá** tới ngày xuất; lần xuất không tính được giá → đếm vào `issues_missing_cost`, **không bịa số** (v1.1 mục 4.4). Không ghi đôi vào `expense_records` |
| 5 | Đơn vị thu hoạch/bán là `text` tự do | `cycle_summary` cộng lẫn kg với thùng | Bước đầu **khóa đơn vị = kg** cho thu hoạch và bán (cột giữ nguyên để mở rộng sau) |
| 6 | Đồng bộ: giao dịch kho có `activity_log_id` nhưng outbox chỉ biết phụ thuộc `cycle_id/area_id` | Giao dịch có thể gửi trước nhật ký → lỗi khóa ngoại | Outbox thêm `activity_log_id` vào danh sách "cha"; Dexie nâng lên v3 (bảng `materials`, `locations`, `harvests`, `expenses`, `sales`) |
| 7 | Nhân viên chỉ ghi được xuất dùng, **không đọc** `inventory_txn` → app không biết tồn | Không hiện được "tồn còn X" cho nhân viên | Chấp nhận: tồn chỉ hiện cho chủ/Kho & chi phí/Quản lý; nhân viên chọn vật tư từ danh mục (đọc được) và ghi số lượng; máy chủ cảnh báo tồn âm cho người có quyền |

## 2. Lát cắt triển khai (mỗi lát: migration/hàm + test CSDL + màn hình + typecheck + commit)

| Lát | Nội dung | Ai dùng | Offline |
|---|---|---|---|
| **C0** | Migration `0016`: vá #1–#5 ở trên + test (`inventory.test.mjs` mới, mở rộng `versioning.test.mjs`) | — | — |
| **C1** | Danh mục vật tư, kho, đơn vị; **nhập kho**, điều chỉnh có lý do; xem tồn, cảnh báo tồn âm / dưới ngưỡng | Chủ, Kho & chi phí (Quản lý xem) | Giao dịch có; tạo danh mục cần mạng |
| **C2** | **Xuất dùng gắn nhật ký**: trong "Ghi việc vừa làm" thêm bước "Vật tư đã dùng" (chọn vật tư, số lượng) → tạo nhật ký + giao dịch xuất cùng lúc, cùng `cycle_id` | Mọi người ghi nhật ký | Có, đầy đủ (UUID thiết bị, `ON CONFLICT DO NOTHING`) |
| **C3** | **Chi phí** (6 nhóm, 4 loại; ước tính/phân bổ bắt buộc ghi giả định) và **doanh thu bán** | Chủ, Kho & chi phí (Quản lý xem) | Có |
| **C4** | **Thu hoạch**: ngày, phân loại, số lượng, hao hụt; sửa/hủy có xung đột | Người ghi nhật ký | Có |
| **C5** | **Tổng kết vụ**: chi phí thực chi / vật tư dùng / phân bổ-ước tính, sản lượng thu, đã bán, doanh thu; **banner thiếu dữ liệu** (thiếu giá vốn, chưa có thu hoạch, chưa có doanh thu); giá thành/kg **chỉ hiện khi đủ dữ liệu**; ghi "cập nhật lúc …"; xuất CSV | Chủ, Quản lý, Kho & chi phí | Xem được bản đã tải |
| **C6** | Test đầu-cuối đồng bộ cho giao dịch kho/chi phí/thu hoạch (`sync.e2e.test.mjs`), cập nhật `ROLES.md`, `CLAUDE.md`, viết `docs/HUONG_DAN_THU.md` cho người dùng thật | — | — |

Thứ tự C0 → C1 → C2 → C4 → C3 → C5 → C6 (thu hoạch trước chi phí vì nhân viên dùng sớm nhất và đơn giản nhất; tổng kết cần đủ các phần).

## 3. Cần chủ sản phẩm xác nhận (mỗi mục có đề xuất, mặc định theo đề xuất nếu không phản hồi)

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| Q1 | Giá vốn vật tư xuất dùng tính thế nào? | **Bình quân gia quyền** theo các lần nhập có giá; lần nhập không giá thì không tính và báo thiếu | Đơn giản, dễ giải thích với nông dân; không cần chọn lô |
| Q2 | Ai được ghi **thu hoạch**? (ma trận D18 chưa nêu) | Mọi người ghi được nhật ký (như hiện tại); sửa/hủy: chủ, quản lý mọi bản ghi, người ghi sửa bản của mình trong 24 giờ (giống A10) | Thu hoạch thường do người làm tại vườn ghi; dữ liệu tiền vẫn chỉ chủ/Kho & chi phí |
| Q3 | Đơn vị thu hoạch/bán | Khóa **kg** ở giai đoạn thử | Tránh cộng lẫn đơn vị; mở rộng sau |
| Q4 | Tạo danh mục vật tư/kho khi **offline** | Cần mạng (chỉ danh mục); ghi nhập/xuất/chi phí/thu hoạch vẫn offline | Tránh phụ thuộc chéo phức tạp; người quản kho thường ở nơi có mạng |
| Q5 | Hủy một nhật ký đã có xuất kho | **Tự đảo** kho bằng giao dịch điều chỉnh (lý do "Hủy nhật ký"), giao dịch gốc giữ nguyên | Đúng nguyên tắc chỉ thêm, kho không sai lệch |

Nếu chốt Q1–Q5, tôi ghi thành D19–D23 trong `docs/DECISIONS.md` và cập nhật A11 (xung đột mở rộng sang thu hoạch, kho, chi phí).

## 4. Tiêu chí hoàn thành bước C (cổng trước khi đưa người dùng thật thử, D9)

- `npm run typecheck`, `npm run build` sạch; `npm run test:db` xanh (CI).
- Mỗi hàng ma trận quyền liên quan kho/chi phí/thu hoạch có test (quản lý ghi chi phí bị từ chối; nhân viên xuất dùng được nhưng không đọc giá; nhân viên không thấy tổng kết chi phí).
- Test: gửi lặp không nhân đôi; hủy nhật ký đảo kho đúng một lần; sửa đồng thời báo `CONFLICT`; tồn âm được báo chứ không bị chặn; tổng kết hiện đúng cảnh báo thiếu dữ liệu.
- Chạy thử bằng điện thoại thật: ghi việc + xuất dùng offline, bật mạng lại, đồng bộ đúng.
- Có `docs/HUONG_DAN_THU.md` bằng tiếng Việt đơn giản cho người dùng thử.

## 5. Rủi ro và việc để ngoài bước C

- Quy đổi đơn vị (`unit_conversions`) chỉ làm khi có nhu cầu thật từ khảo sát; bước C dùng đơn vị cơ sở.
- Chi phí nhân công liên kết vụ (E3-S17) làm ở bước E.
- Bộ mẫu dưa lưới (loại việc, vật tư gợi ý) vẫn chờ số liệu khảo sát; C2 dùng danh mục do chủ tự nhập.
- Xuất báo cáo XLSX/PDF (FR-INV-008 là SHOULD): làm CSV trước.
