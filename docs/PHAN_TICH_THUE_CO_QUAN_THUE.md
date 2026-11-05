# Phân tích: yêu cầu của cơ quan thuế đối với cơ sở nuôi trồng và hướng phát triển trong app

Trạng thái: **PHÂN TÍCH + ĐỀ XUẤT, chờ chủ sản phẩm duyệt** (4/11/2026). Chưa viết code.

> **Cảnh báo độ tin cậy.** Nội dung pháp lý bên dưới tổng hợp từ các bài tư vấn (MISA, Thư Viện Pháp Luật, LuatVietnam, EY…), **chưa đối chiếu văn bản gốc**; nhiều nguồn mâu thuẫn nhau về ngưỡng doanh thu (500 triệu hay 1 tỷ đồng). Trước khi đưa vào app phải để **kế toán/luật sư thuế xác nhận từng mốc** (mục 8). App chỉ **hỗ trợ lập sổ và hồ sơ**, không thay người dùng kê khai, không nộp thuế, không phải phần mềm kế toán được cơ quan thuế công nhận.

## 1. Ai là người dùng và thuộc diện nào

| Nhóm người dùng của app | Tình trạng thuế (tóm tắt) |
|---|---|
| **Hộ nông dân trực tiếp trồng trọt, chăn nuôi** (phần lớn hộ dùng app) | Bán nông sản **tự sản xuất, chưa chế biến**: không chịu thuế GTGT (Luật GTGT 149/2025/QH15 từ 1/1/2026). Đất nông nghiệp: tiếp tục **miễn thuế sử dụng đất nông nghiệp đến hết 2030** (Nghị quyết 216/2025/QH15, Nghị định 292/2025/NĐ-CP). Nếu coi là hộ kinh doanh thì tùy doanh thu |
| **Hộ kinh doanh** (có đăng ký, hoặc thu mua rồi bán lại) | Từ 1/1/2026 **bỏ thuế khoán**, chuyển sang **tự kê khai** theo doanh thu thực tế (Nghị định 68/2026/NĐ-CP, hiệu lực 5/3/2026), **bắt buộc có sổ kế toán** (Thông tư 152/2025/TT-BTC). Doanh thu dưới ngưỡng: chỉ thông báo doanh thu |
| **Hợp tác xã nông nghiệp** | **Miễn thuế TNDN** với thu nhập từ trồng trọt, chăn nuôi, nuôi trồng, chế biến nông thủy sản (Luật TNDN 2025, Nghị định 320/2025/NĐ-CP); vẫn phải kê khai, lập hóa đơn, bảng kê thu mua từ xã viên, thuế TNCN cho lao động |
| **Doanh nghiệp nuôi trồng** (ít hơn) | Chế độ kế toán doanh nghiệp, hóa đơn điện tử, thuế TNDN 20%; app không thay phần mềm kế toán doanh nghiệp |

## 2. Hồ sơ, báo cáo, kiểm tra mà cơ quan thuế yêu cầu (theo nguồn đã tìm)

| # | Nghĩa vụ | Áp dụng cho | Căn cứ (cần xác minh) | App liên quan |
|---|---|---|---|---|
| 1 | **Sổ kế toán** theo nhóm: S1a-HKD (không chịu GTGT/TNCN), S2a-HKD (tính % trên doanh thu), S2b doanh thu, S2c chi tiết doanh thu-chi phí, S2d vật liệu/hàng hóa nhập-xuất-tồn, S2e tiền mặt-tiền gửi; S3a nghĩa vụ thuế khác | Hộ kinh doanh | Thông tư 152/2025/TT-BTC (từ 1/1/2026) | **Rất sát**: app đã ghi doanh thu, chi phí, kho, thu chi |
| 2 | **Thông báo/kê khai doanh thu** theo năm (hạn 31/1 năm sau với hộ dưới ngưỡng); kê khai theo quý/năm khi vượt ngưỡng | Hộ kinh doanh | Nghị định 68/2026/NĐ-CP | Báo cáo doanh thu theo kỳ |
| 3 | **Bảng kê hàng tồn kho và tài sản cố định** tại thời điểm chuyển đổi (31/12/2025, hạn 20/4/2026) | Hộ chuyển từ khoán | Nghị định 68/2026/NĐ-CP | Kho (tồn), khấu hao đã có |
| 4 | **Hóa đơn điện tử** khi doanh thu năm trên 1 tỷ đồng (nguồn khác nói từ 1 tỷ trở lên); hóa đơn từ máy tính tiền khi bán trực tiếp cho người tiêu dùng; được miễn nếu lập bảng kê thu mua | Hộ kinh doanh, HTX | Nghị định 254/2026/NĐ-CP (từ 1/7/2026, thay NĐ 123/2020) | App **chưa phát hành** hóa đơn; chỉ ghi số hóa đơn |
| 5 | **Bảng kê thu mua nông sản trực tiếp từ người sản xuất** (mẫu 02/TNDN ban hành kèm Thông tư 20/2026/TT-BTC, thay mẫu 01/TNDN; cần họ tên, CCCD, địa chỉ, điện thoại người bán, số lượng, giá; thanh toán trên 5 triệu phải không dùng tiền mặt) | HTX, hộ thu mua nông sản | NĐ 320/2025/NĐ-CP, TT 20/2026/TT-BTC | **Rất sát**: app đã có phiếu thu mua từ hộ thành viên (`procurement_receipts`) và thanh toán |
| 6 | **Thuế TNCN của người làm công**: hợp đồng lao động, khấu trừ (hợp đồng từ 3 tháng theo biểu lũy tiến; khoản trả từ 2 triệu không hợp đồng khấu trừ 10%), kê khai **theo quý** từ 4/2026, quyết toán năm, bảng lương, đóng BHXH | Hộ kinh doanh, HTX có thuê lao động | NĐ 68/2026, TT 89/2026/TT-BTC (cần xác minh) | **Sát**: app có chấm công, bảng lương, tiền công |
| 7 | **Tờ khai quyết toán thuế TNDN** (03/TNDN, hạn 31/3) và báo cáo tài chính | HTX/doanh nghiệp | Luật Quản lý thuế | Chỉ hỗ trợ số liệu đầu vào |
| 8 | **Chứng từ chi phí hợp lệ** (hóa đơn đầu vào, ảnh chụp, chứng từ thanh toán không dùng tiền mặt trên 5 triệu) | Mọi đối tượng có chi phí được trừ | NĐ 320/2025/NĐ-CP | App có chụp hóa đơn (G2-3), công nợ, hóa đơn mua |
| 9 | **Kiểm tra, thanh tra thuế**: yêu cầu xuất trình sổ sách, hóa đơn, bảng lương, hợp đồng, đối chiếu dữ liệu hóa đơn điện tử và tài khoản ngân hàng (kết quả tìm kiếm **chưa xác nhận** việc đối chiếu sao kê ngân hàng nói chung) | Mọi đối tượng | Luật Quản lý thuế | **Hồ sơ sẵn sàng kiểm tra** (hướng C) |

## 3. App hiện có gì và thiếu gì (so với các yêu cầu trên)

Có sẵn: doanh thu (`sales_records`, lần thu, công nợ phải thu), chi phí (`expense_records` theo nhóm), hóa đơn mua và thanh toán (`purchase_bills`, `bill_payments`), kho nhập-xuất-tồn kèm giá trị, khấu hao, chấm công và bảng lương, phiếu thu mua và thanh toán cho HTX, danh bạ nhà cung ứng/khách (có mã số thuế), xuất Excel/CSV, nhật ký kiểm toán bất biến (không sửa/xóa, chỉ điều chỉnh), phân quyền theo mục.

Thiếu (phải bổ sung):
- **Ngày thực thu/thực chi** thống nhất để dựng sổ tiền S2e (hiện có rải rác ở lần thu, thanh toán hóa đơn, chi phí).
- **Phân loại hộ theo nhóm thuế** và theo dõi **doanh thu lũy kế năm so với ngưỡng** để cảnh báo.
- **Hồ sơ cá nhân người bán** cho bảng kê thu mua (CCCD, địa chỉ): chưa có; là dữ liệu cá nhân nhạy cảm (Luật Bảo vệ dữ liệu cá nhân), cần đồng ý và mã hóa/giới hạn xem.
- **Hợp đồng lao động, hình thức trả lương, mã số thuế/CCCD, số BHXH của nhân sự**, khấu trừ TNCN: bảng lương hiện chưa tính thuế.
- **Phát hành hóa đơn điện tử**: không có.
- **Đóng gói hồ sơ** (sổ + chứng từ + bảng lương) theo kỳ.

## 4. Các phương hướng triển khai (từ nhẹ đến nặng)

### Hướng A (nên làm trước, giá trị cao, rủi ro pháp lý thấp): "Sổ sách và báo cáo cho kê khai"
Xuất sổ đúng mẫu Thông tư 152/2025 từ dữ liệu đã có, dạng Excel/PDF để in:
1. Tự gợi ý **nhóm hộ** (S1a, S2a, S2b–S2e) theo doanh thu năm do người dùng chọn kỳ; **ngưỡng cấu hình được** trong Quản trị nền tảng (`platform_settings`) để đổi khi luật đổi, không phải sửa code.
2. **S1a/S2a/S2b doanh thu**, **S2c doanh thu-chi phí**, **S2d nhập-xuất-tồn** (từ kho), **S2e sổ tiền** (từ lần thu, thanh toán, chi), **S3a** (nghĩa vụ thuế khác, người dùng nhập).
3. **Báo cáo doanh thu theo kỳ** (tháng/quý/năm) để người dùng tự kê khai hoặc đưa kế toán; **cảnh báo lũy kế sát ngưỡng**.
4. **Bảng kê hàng tồn kho và tài sản cố định** tại một ngày chọn.
Mỗi bản xuất ghi rõ "Do app tổng hợp từ dữ liệu người dùng nhập, chưa thay thế kê khai chính thức".

### Hướng B: "Hồ sơ thuế cho HTX và hộ thu mua"
1. **Bảng kê thu mua nông sản 02/TNDN** tự lập từ phiếu thu mua (một dòng mỗi phiếu), cần thêm CCCD/địa chỉ người bán (chủ động nhập, có đồng ý) và kiểm tra **thanh toán không dùng tiền mặt trên 5 triệu**.
2. **Bảng lương, khấu trừ TNCN, tờ khai quý** dạng bảng số liệu (không nộp thay): thêm loại hợp đồng, MST/CCCD, người phụ thuộc, tỷ lệ khấu trừ 10%, tổng hợp theo quý và quyết toán năm.
3. **Hồ sơ miễn/ưu đãi HTX**: danh mục thu nhập thuộc diện miễn (trồng trọt, chăn nuôi…) để HTX tách doanh thu miễn thuế và chịu thuế.

### Hướng C: "Hộp hồ sơ sẵn sàng kiểm tra"
Một màn **Hồ sơ thuế** gom theo năm: sổ sách, bảng kê, bảng lương, hóa đơn/ảnh chứng từ, hợp đồng; **danh sách việc còn thiếu** (hóa đơn chưa có ảnh, thanh toán tiền mặt trên 5 triệu, nhân sự chưa có hợp đồng/CCCD, doanh thu sát ngưỡng) giống "Còn thiếu gì trước khi nộp" của Sổ nhật ký; cho phép **cấp quyền xem có thời hạn cho kế toán** (chỉ đọc) và **đóng gói tải một lần** khi bị kiểm tra. Rất hợp với đặc tính dữ liệu bất biến của app.

### Hướng D (dài hạn, cần đối tác và pháp lý): kết nối trực tiếp
- **Phát hành hóa đơn điện tử** qua tích hợp nhà cung cấp hóa đơn được cơ quan thuế chấp nhận (không tự làm).
- **Đồng bộ doanh thu với máy tính tiền/ hóa đơn** và **kê khai thuế điện tử qua đối tác** (T-VAN). App chỉ đóng vai nguồn dữ liệu, mỗi bước phải có xác nhận của người dùng.
- Xem xét đăng ký là **phần mềm kế toán đủ điều kiện** nếu muốn bán như sản phẩm kế toán (Thông tư 152 có yêu cầu với phần mềm; chưa xác minh).

## 5. Gợi ý gói/giá trị thương mại
Sổ thuế (A) và Hộp hồ sơ (C) là điểm bán mạnh cho gói trả phí cao; đặc biệt HTX (B). Có thể làm "gói Thuế" cộng thêm vào gói hiện có (D1–D13 trong `DECISIONS_CHUNG.md`).

## 6. Rủi ro và cách giảm
- **Luật đổi nhanh** (nhiều văn bản mới 2026, nguồn mâu thuẫn): ngưỡng, mẫu sổ, mã biểu mẫu để trong **cấu hình**, có ngày hiệu lực; ghi nhật ký phiên bản mẫu.
- **Trách nhiệm pháp lý**: nội dung "gợi ý, hỗ trợ lập", không "đảm bảo đúng luật"; điều khoản sử dụng và dòng chú thích trên mọi bản xuất.
- **Dữ liệu cá nhân** (CCCD, MST, lương): chỉ thu khi cần, quyền xem riêng (chủ/kế toán), mã hóa, theo Luật Bảo vệ dữ liệu cá nhân; có chức năng ẩn danh khi xóa (đã có cho đối tác).
- **Dữ liệu không đủ**: nhiều hộ ghi không đủ chi phí/doanh thu; app nhắc việc còn thiếu thay vì tự suy diễn.
- **Offline**: nhập liệu thuế là chức năng quản lý, cần mạng (đúng D24); không thêm đường offline.

## 7. Lộ trình đề xuất
1. **Giai đoạn T0** (không code): kế toán/luật sư thuế xác nhận mục 8; chốt nhóm người dùng ưu tiên.
2. **T1 (2–3 tuần)**: cấu hình ngưỡng + báo cáo doanh thu kỳ + **S1a/S2a/S2b/S2c/S2d/S2e** + cảnh báo ngưỡng (Hướng A).
3. **T2**: Bảng kê thu mua 02/TNDN và bảng lương/khấu trừ TNCN theo quý cho HTX (Hướng B).
4. **T3**: Hộp hồ sơ thuế + danh sách việc còn thiếu + quyền xem cho kế toán (Hướng C).
5. **T4+**: tích hợp hóa đơn điện tử, kê khai điện tử (Hướng D), tùy đối tác.

## 8. Cần xác minh với chuyên gia thuế trước khi làm
1. Ngưỡng doanh thu không phải nộp GTGT/TNCN và ngưỡng phải kê khai: **500 triệu hay 1 tỷ đồng** (nguồn mâu thuẫn; có nhắc Nghị định 141/2026/NĐ-CP).
2. Hộ nông dân trực tiếp sản xuất bán nông sản **có thuộc "hộ kinh doanh" phải lập sổ** không, hay chỉ khi có đăng ký/ vượt ngưỡng.
3. Mốc bắt buộc **hóa đơn điện tử** (trên hay từ 1 tỷ) và loại hóa đơn.
4. Mẫu bảng kê thu mua **02/TNDN** (TT 20/2026) đã hiệu lực chưa, và điều kiện lập.
5. Thông tư 89/2026/TT-BTC, 18/2026/TT-BTC, 50/2026/TT-BTC: nội dung và hiệu lực chính xác.
6. Điều kiện để một app được xem là **phần mềm kế toán** hợp lệ cho hộ kinh doanh.

## 9. Nguồn đã tham khảo (thứ cấp)
- Nghị định 68/2026/NĐ-CP: https://www.meinvoice.vn/tin-tuc/44997/nghi-dinh-68-2026-nd-cp-ve-thue-ho-kinh-doanh/ ; https://luatvietnam.vn/thue-phi-le-phi/6-noi-dung-dang-chu-y-cua-nghi-dinh-68-2026-nd-cp-ve-thue-ho-kinh-doanh-565-107530-article.html
- Thuế GTGT nông sản 2026: https://thuvienphapluat.vn/phap-luat-doanh-nghiep/bai-viet/thue-suat-hang-nong-san-chua-qua-che-bien-tu-1-1-2026-theo-luat-so-149-2025-qh15-17647.html
- Thông tư 152/2025/TT-BTC (sổ kế toán hộ kinh doanh): https://www.sapo.vn/blog/thong-tu-152-2025-tt-btc ; https://thuvienphapluat.vn/hoi-dap-phap-luat/7-mau-so-sach-ke-toan-ho-kinh-doanh-excel-s1a-hkd-s2a-hkd-s2b-hkd-s2c-hkd-s2d-hkd-s2e-hkd-s3a-hkd-n-138083849.html
- Nghị định 254/2026/NĐ-CP (hóa đơn điện tử): https://thuvienphapluat.vn/van-ban/Thue-Phi-Le-Phi/Nghi-dinh-254-2026-ND-CP-huong-dan-Luat-Quan-ly-thue-hoa-don-dien-tu-chung-tu-dien-tu-713085.aspx ; https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-254-2026-nd-cp-ve-hoa-don-dien-tu-va-chung-tu-dien-tu
- Thuế TNDN của HTX, bảng kê thu mua: https://thoibaotaichinhvietnam.vn/chinh-sach-uu-dai-thue-ho-tro-toi-da-hoat-dong-cua-hop-tac-xa-149253.html ; https://vneconomy.vn/cuc-thue-neu-dieu-kien-duoc-tinh-chi-phi-duoc-tru-khi-mua-nong-san-khong-hoa-don.htm ; https://xcyber.vn/?p=11952
- Miễn thuế sử dụng đất nông nghiệp đến 2030: https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/chinh-thuc-keo-dai-thoi-han-mien-thue-su-dung-dat-nong-nghiep-den-het-nam-2030-460612-214505.html
- Thuế TNCN lao động ở hộ kinh doanh: https://thuvienphapluat.vn/hoi-dap-phap-luat/chinh-sach-thue-tncn-doi-voi-nguoi-lao-dong-lam-viec-tai-ho-kinh-doanh-moi-nhat-2026-nhu-the-nao-138087063.html ; https://luatvietnam.vn/thue-phi-le-phi/diem-moi-thong-tu-89-2026-tt-btc-ve-quan-ly-thue-565-110655-article.html
