# AGRICONNECT — BACKLOG THEO MÃ YÊU CẦU (dựa trên v1.1 + v1.2)

**Ngày:** 18/10/2026
**Cách đọc:** mỗi dòng là một hạng mục có mã yêu cầu truy vết về đặc tả. Ước lượng là **cỡ tương đối** (S ≈ 1–3 ngày, M ≈ 1 tuần, L ≈ 2 tuần, XL > 2 tuần, một dev) để lập kế hoạch, cần điều chỉnh sau prototype.
**Ưu tiên:** MUST / SHOULD / LATER theo đặc tả. **Phụ thuộc** ghi bằng mã epic.
**Nguồn:** FR/NFR trong v1.1; `FR-PLAN`, `FR-COOP-006…012`, `FR-WEB-014…018`, `FR-ADM`, `FR-CROP-008`, `NFR-PLAN`, `NFR-PUB`, `NFR-SEC-009`, `NFR-OPS` trong v1.2.

Đặt tên: `E` = epic, `S` = story. Giai đoạn theo lộ trình đề xuất (G0–G6).

---

## G0 — Khảo sát và prototype (4–5 tuần)

| Mã | Hạng mục | Truy vết | Cỡ | Nghiệm thu |
|---|---|---|---|---|
| E0-S1 | Khảo sát 2–3 nhà màng dưa lưới: quy trình, vật tư, thu hoạch, thuật ngữ | v1.1 §12 G0, FR-CROP-008 | L | Bản ghi quan sát, danh mục thuật ngữ, danh sách giai đoạn/việc/vật tư thực tế |
| E0-S2 | Khảo sát chấm công thực tế: ai có smartphone, tổ đội, cách tính công hiện nay | v1.1 §16 | M | Sơ đồ quy trình; trả lời câu hỏi mở §12 v1.2 |
| E0-S3 | Prototype 3 luồng: ghi việc vừa làm, xem hiệu quả vụ, tạo hồ sơ thương mại | v1.1 §3.4–3.6 | L | Prototype Figma click được |
| E0-S4 | Prototype chấm công (tự chấm, tổ trưởng chấm hộ) và hạn mức/nâng gói | v1.1 §16.8, v1.2 §3 | M | Prototype click được |
| E0-S5 | Kiểm thử prototype với người dùng thật (nông dân, tổ trưởng, quản lý) | NFR-UX-003 | M | Báo cáo quan sát: nơi dừng, nhầm, cần trợ giúp |
| E0-S6 | Chốt các câu hỏi mở (A1, A2, kỳ trả công, pháp lý dữ liệu) | v1.2 §12 | M | Cổng quyết định G0 được duyệt |

**Cổng G0:** người dùng mục tiêu hoàn thành luồng cơ bản; quyết định A1, A2, kỳ trả công đã chốt.

---

## G1 — Nền tảng (4–5 tuần)

| Mã | Hạng mục | Truy vết | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| E1-S1 | Repo GitHub, monorepo (app, web, admin, supabase), CI/CD, môi trường dev/staging/prod | NFR-MAINT-001/003, NFR-OPS-001 | M | — |
| E1-S2 | Dự án Supabase, migration có phiên bản, seed | NFR-MAINT-002 | M | E1-S1 |
| E1-S3 | Đăng ký, đăng nhập, khôi phục tài khoản | FR-ORG-001 | M | E1-S2 |
| E1-S4 | Organization (hộ/HTX), membership, vai trò, mời/thu hồi | FR-ORG-002/003/004 | L | E1-S3 |
| E1-S5 | RLS theo `organization_id` và phạm vi; test phân quyền chéo tổ chức | FR-ORG-005, NFR-SEC-001/002/009 | L | E1-S4 |
| E1-S6 | Audit event dùng chung (trigger/hàm) | NFR-SEC-005, FR-LOG-005 | M | E1-S2 |
| E1-S7 | Khung PWA: shell, manifest, service worker, IndexedDB (Dexie) | NFR-UX-001, FR-SYNC-001 | L | E1-S1 |
| E1-S8 | Khung đồng bộ: UUID thiết bị, outbox, idempotency key, 4 trạng thái, retry | FR-SYNC-001…006, §8 | XL | E1-S7, E1-S2 |
| E1-S9 | Giao diện chuyển cơ sở, chỉ báo trạng thái kết nối/đồng bộ | FR-ORG-006, §3.3 | M | E1-S4, E1-S8 |
| E1-S10 | Thiết kế hệ thống giao diện (nút lớn, nhãn chữ+icon, trạng thái không chỉ bằng màu) | NFR-UX-002/005/006 | M | E0-S3 |
| E1-S11 | Logging/monitoring cơ bản (lỗi đồng bộ, quyền, xuất bản) | NFR-MAINT-005 | M | E1-S1 |
| E1-S12 | Sao lưu và kiểm thử phục hồi quy trình | NFR-SEC-004 | M | E1-S2 |

---

## G2 — Lõi sản xuất, dưa lưới (6–8 tuần)

| Mã | Hạng mục | Truy vết | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| E2-S1 | Danh mục CropType, CropProfile, CropVariety | FR-CROP-001/002 | M | E1 |
| E2-S2 | Bộ cấu hình dưa lưới từ khảo sát (giai đoạn, mẫu việc, vật tư, thu hoạch) | FR-CROP-006/008 | L | E0-S1, E2-S1 |
| E2-S3 | Khu trồng (tạo/sửa) | FR-CROP-003 | S | E1 |
| E2-S4 | Tạo vụ (luồng 3.5), trạng thái vụ, cảnh báo vụ trùng không chặn tuyệt đối | FR-CROP-004/005, §4.2 | L | E2-S3, E2-S1 |
| E2-S5 | Sửa CropProfile không đổi dữ liệu lịch sử | FR-CROP-007 | M | E2-S1 |
| E2-S6 | Trang tổng quan vụ, giai đoạn, lịch việc | §3.5, FR-CROP-006 | M | E2-S4 |
| E2-S7 | Ghi nhật ký theo loại việc, biểu mẫu động, mẫu thường dùng | FR-LOG-001/002/006, §3.4 | XL | E2-S4, E1-S8 |
| E2-S8 | Lịch sử nhật ký, lọc, sửa bằng sự kiện điều chỉnh + audit | FR-LOG-003/004/005 | L | E2-S7, E1-S6 |
| E2-S9 | Trang chủ: việc hôm nay, thao tác nhanh "Ghi việc vừa làm" | §3.3 | M | E2-S7 |
| E2-S10 | Vật tư, đơn vị, quy đổi đơn vị đã xác nhận | FR-INV-001 | M | E1 |
| E2-S11 | Kho: giao dịch nhập/xuất/điều chỉnh, tồn âm cảnh báo, không ghi đè số dư | FR-INV-002/004, §4.4 | L | E2-S10 |
| E2-S12 | Liên kết vật tư dùng với nhật ký và vụ; idempotency khi đồng bộ | FR-INV-003, §8.3 | L | E2-S7, E2-S11 |
| E2-S13 | Chi phí cơ bản; báo thiếu dữ liệu giá vốn | FR-INV-005/006, §4.5 | L | E2-S11 |
| E2-S14 | Thu hoạch, phân loại, hao hụt, tổng hợp sản lượng | FR-INV-007 | L | E2-S4 |
| E2-S15 | Tổng kết vụ (chi phí đã ghi, sản lượng, doanh thu nếu có, dữ liệu thiếu) | §4.5, §10.1 | L | E2-S13, E2-S14 |
| E2-S16 | Doanh thu/bán hàng mức cơ bản (SalesRecord) | §5.3, §4.5 | M | E2-S14 |
| E2-S17 | Báo cáo vận hành cơ bản + xuất CSV/XLSX | FR-INV-008, §10.1 | L | E2-S15 |

---

## G3 — Chấm công và tiền công (6–8 tuần)

| Mã | Hạng mục | Truy vết | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| E3-S1 | Hồ sơ lao động (có/không tài khoản), tổ, thành viên theo hiệu lực | FR-ATT-01 | L | E1-S4 |
| E3-S2 | Địa điểm làm việc (tọa độ, bán kính cấu hình) | §16.4.1 | M | E3-S1 |
| E3-S3 | Tự chấm "Bắt đầu/Kết thúc làm", GPS tại thời điểm, không theo dõi nền, chống ca mở trùng | FR-ATT-02/03, §16.4 | L | E3-S2, E1-S8 |
| E3-S4 | Ngoại lệ GPS/thiếu lượt: trạng thái "Cần xác nhận", xác nhận có lý do + audit | FR-ATT-09, §16.4.4 | L | E3-S3 |
| E3-S5 | Tổ trưởng chấm hộ, chấm theo nhóm, mỗi người một bản ghi, nhập muộn | FR-ATT-04, §16.5 | L | E3-S1, E1-S8 |
| E3-S6 | Offline cho chấm công: UUID, giờ thiết bị/giờ nhận, trạng thái "chưa đồng bộ", xung đột | FR-ATT-05, §16.9 | XL | E3-S3, E3-S5 |
| E3-S7 | Yêu cầu sửa công (người lao động gửi, quản lý duyệt) | FR-ATT-09, §16.8 | M | E3-S4 |
| E3-S8 | Đơn giá theo giờ và theo sản lượng/công việc, ngày hiệu lực (không có đơn giá ngày) | FR-ATT-07 (v1.2) | M | E3-S1 |
| E3-S9 | Ghi nhận và duyệt sản lượng theo người/nhóm/đơn vị; không trả trùng | FR-ATT-08, §16.6.3 | L | E3-S8 |
| E3-S10 | Khoản cộng/trừ, tạm ứng có lý do, duyệt, audit | FR-ATT-11, §16.6.4 | M | E3-S8 |
| E3-S11 | Rà soát cuối kỳ: thiếu lượt, trùng, bất thường, chờ đồng bộ | §16.7 | M | E3-S6 |
| E3-S12 | Bảng công tháng, tổng giờ đã duyệt theo người | FR-ATT-10 (v1.2) | L | E3-S11 |
| E3-S13 | Bảng tiền công: xem trước từng dòng, truy ngược nguồn, duyệt | FR-ATT-10, §16.14 | L | E3-S12, E3-S9, E3-S10 |
| E3-S14 | Khóa kỳ, mở khóa có quyền + lý do + audit | FR-ATT-12 | M | E3-S13 |
| E3-S15 | Màn hình người lao động: công của tôi, tiền công của tôi | FR-ATT-13 | M | E3-S13 |
| E3-S16 | Xuất bảng công, sản lượng, tiền công đã duyệt (CSV/XLSX) | FR-ATT-14 | M | E3-S14 |
| E3-S17 | Liên kết chi phí nhân công với khu/vụ khi có quy tắc; không tự phân bổ nếu thiếu | FR-ATT-15 | M | E3-S13, E2-S13 |
| E3-S18 | Bộ test: quên kết thúc, hai lượt bắt đầu, qua nửa đêm, offline nhiều ngày, đồng bộ lặp, đổi đơn giá giữa kỳ, sửa sau khóa | §16.14 | L | E3-S6…14 |
| E3-S19 | Thử thực địa GPS trong nhà màng/vườn để chốt ngưỡng mặc định | §16.4.4, §16.14 | M | E3-S3 |

---

## G4 — HTX và Gói dịch vụ (4–5 tuần)

| Mã | Hạng mục | Truy vết | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| E4-S1 | Mời/chấp nhận hộ vào HTX; ràng buộc 1 hộ ≤ 1 HTX; lịch sử vào/rời | FR-COOP-006/007 | L | E1-S4 |
| E4-S2 | Hai ngữ cảnh dữ liệu: vụ HTX và vụ riêng; câu hỏi chọn khi tạo vụ | FR-COOP-008/010 | L | E4-S1, E2-S4 |
| E4-S3 | Khai báo số hộ của HTX (hiển thị) | FR-COOP-009 | S | E4-S1 |
| E4-S4 | Danh sách thành viên/khu/vụ, tiến độ ghi nhật ký theo quyền | FR-COOP-001/002 | L | E4-S2 |
| E4-S5 | Báo cáo tổng hợp HTX (chi phí/sản lượng); không xem dữ liệu chi tiết nếu chưa cấp quyền | FR-COOP-003/004/005 | L | E4-S4 |
| E4-S6 | Quy trình hộ rời HTX: xuất dữ liệu, xử lý vụ đang chạy | FR-COOP-011 (A2) | L | E4-S2 |
| E4-S7 | Hạn mức con theo hộ trong HTX (tùy chọn) | FR-COOP-012 (A1) | M | E4-S2 |
| E4-S8 | Danh mục gói `PlanTier`, `Subscription`, snapshot điều khoản, `PaymentRecord` | FR-PLAN-001/002/006/007 | L | E1-S2 |
| E4-S9 | Hàm CSDL kiểm tra hạn mức vụ; thông báo dễ hiểu; test không lách được | FR-PLAN-003, NFR-PLAN-001 | L | E4-S8, E2-S4 |
| E4-S10 | Vụ offline vượt hạn mức → "Cần xử lý" không mất dữ liệu | FR-PLAN-003, §3.4 | M | E4-S9, E1-S8 |
| E4-S11 | Tự cấp gói dùng thử theo cấu hình khi tạo tổ chức | FR-PLAN-004 | S | E4-S8 |
| E4-S12 | Hết hạn: chặn tạo vụ mới, không khóa dữ liệu | FR-PLAN-008 | M | E4-S9 |
| E4-S13 | Màn hình "Gói của tôi": gói, hạn mức đã dùng, hạn, liên hệ nâng gói | FR-PLAN-009 | M | E4-S8 |
| E4-S14 | Nhắc sắp hết hạn trong app | FR-PLAN-010 | S | E4-S8 |

---

## G5 — Website, hồ sơ thương mại, quản trị (5–6 tuần; có thể song song G3–G4)

| Mã | Hạng mục | Truy vết | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| E5-S1 | Mô hình hồ sơ: BusinessProfile, ProductListing, ProductImage, SupplyOffer, CertificationRecord | §5.4 | L | E1 |
| E5-S2 | Soạn hồ sơ (bản nháp, offline tùy chọn), ảnh, trạng thái cung ứng có ngày | FR-WEB-003/010, §9.4 | L | E5-S1 |
| E5-S3 | Yêu cầu hỗ trợ hồ sơ; ủy quyền; lịch sử ai sửa gì | FR-WEB-004, §4.8 | L | E5-S2 |
| E5-S4 | Xem trước, chọn nhóm thông tin công khai, xác nhận (PublicationConsent) | FR-WEB-005, §3.6 | L | E5-S2 |
| E5-S5 | Quy trình duyệt, xuất bản, tạm ẩn, rút | FR-WEB-006/012 | L | E5-S4 |
| E5-S6 | Bản chụp xuất bản bất biến → bảng `public_*`; RLS cho khóa công khai | FR-WEB-007/013/017, NFR-PUB-001 | XL | E5-S5 |
| E5-S7 | Trạng thái chứng nhận 5 mức, không dùng nhãn "đã xác minh" khi chưa đủ | FR-WEB-011, §9.3 | M | E5-S1 |
| E5-S8 | Website: trang chủ, danh bạ, danh mục sản phẩm, trang chi tiết (SEO) | FR-WEB-001 | L | E5-S6 |
| E5-S9 | Tìm kiếm/lọc theo loại sản phẩm, khu vực (Postgres FTS) | FR-WEB-002 | M | E5-S8 |
| E5-S10 | Liên hệ trực tiếp + biểu mẫu `ContactInquiry`, Turnstile, thông báo quyền riêng tư | FR-WEB-008/009 | L | E5-S8 |
| E5-S11 | Xếp hạng theo gói (cách a), cấu hình ở DB, giải thích điểm | FR-WEB-014/016/018 | L | E4-S8, E5-S6 |
| E5-S12 | Nhãn "Ưu tiên hiển thị" | FR-WEB-015 | S | E5-S11 |
| E5-S13 | HTX hiển thị hộ thành viên chỉ khi hộ đồng ý | §9.2, v1.2 §5.6 | M | E4-S1, E5-S4 |
| E5-S14 | Admin: quản lý gói/giá, tổ chức, kích hoạt/gia hạn/đổi gói, ghi thanh toán | FR-ADM-001, FR-PLAN-005 | XL | E4-S8 |
| E5-S15 | Admin: cấu hình xếp hạng, dùng thử, ngày nhắc; duyệt/tạm ẩn hồ sơ; audit log | FR-ADM-001/002 | L | E5-S14 |
| E5-S16 | Kiểm thử riêng tư: website không lộ dữ liệu nội bộ, vụ riêng, nhân công | NFR-PUB-001, v1.1 §11.2 | L | E5-S6 |
| E5-S17 | Điều khoản, chính sách quyền riêng tư, chính sách lưu trữ/xóa | NFR-SEC-008 | M | Pháp lý |

---

## G6 — Pilot (6–8 tuần)

| Mã | Hạng mục | Truy vết | Cỡ |
|---|---|---|---|
| E6-S1 | Domain, Supabase gói có backup, môi trường prod, kiểm thử phục hồi | NFR-SEC-004, NFR-OPS-001 | M |
| E6-S2 | Hồ sơ pháp lý dữ liệu cá nhân (GPS, tiền công), đồng ý người dùng | v1.1 §16.11, v1.2 §2.1 | M |
| E6-S3 | Usability test đủ nhóm người dùng, đủ tác vụ §11.1 | NFR-UX-003 | L |
| E6-S4 | Triển khai 3–5 cơ sở/1–2 HTX thử nghiệm, hỗ trợ tại chỗ | §12 G4 | XL |
| E6-S5 | Đo chỉ số UX, vận hành, website (§10) | §10 | M |
| E6-S6 | Sửa lỗi gây khó; ghi lỗi đã biết và giới hạn offline | §11.2 | L |
| E6-S7 | Nghiệm thu release MVP theo §11.2 và §11 v1.2 | §11 | M |

---

## Rủi ro và phụ thuộc quan trọng

| Rủi ro | Giảm thiểu |
|---|---|
| Đồng bộ offline (E1-S8, E3-S6) là hạng mục khó nhất | Làm khung từ G1, mô hình bản ghi chỉ thêm, test lặp đồng bộ từ sớm |
| GPS kém trong nhà màng | E3-S19 thử thực địa; ngoại lệ không loại công |
| Phạm vi quá rộng so với "MVP" | Phát hành theo lát: G2 → G3 → G5; có thể cắt E4-S7, E3-S17 nếu thiếu nguồn lực |
| Pháp lý dữ liệu (GPS, tiền công, hộ rời HTX) | E6-S2, E5-S17 bắt đầu sớm song song |
| Hạn mức bị lách bằng offline/API | E4-S9/S10 có test riêng, NFR-PLAN-001 |
| Quy tắc tính công chưa chốt | Cấu hình, không hard-code; E0-S6 chốt |

## Tóm tắt khối lượng (cỡ tương đối)

| Giai đoạn | Số hạng mục | Tuần dự kiến (đội 4–5 người) |
|---|---|---|
| G0 | 6 | 4–5 |
| G1 | 12 | 4–5 |
| G2 | 17 | 6–8 |
| G3 | 19 | 6–8 |
| G4 | 14 | 4–5 |
| G5 | 17 | 5–6 (song song được) |
| G6 | 7 | 6–8 |

Tổng khoảng 8–10 tháng nếu G5 chạy song song với G3–G4. Ước lượng này cần hiệu chỉnh sau G0.
