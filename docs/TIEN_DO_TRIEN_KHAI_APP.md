# Tiến độ triển khai APP lên app.agricovi.com

*Lập 26/10/2026. Đây là bảng theo dõi MỘT chỗ cho mảng APP; tick `[x]` khi xong. Chi tiết kỹ thuật: `DEPLOY_CLOUDFLARE.md`, bài thử: `HUONG_DAN_THU.md`, lộ trình tính năng: `KE_HOACH_TONG_THE.md` mục 8.*

**Nguyên tắc sắp xếp:** (1) việc chặn mọi việc khác làm trước; (2) kiểm tra nhanh bằng bài thử ngắn trước khi giao người khác dùng; (3) sửa lỗi đi trước làm tính năng mới; (4) tính năng mới chỉ làm khi phản hồi thật đòi hỏi (đúng D100). Mỗi giai đoạn có tiêu chí "Xong khi" để biết dừng.

Người làm: **[B]** bạn, **[C]** Claude.

---

## Giai đoạn 0 — Chuẩn bị trước khi đẩy lên (≈ 1 giờ)
- [ ] [B] Xác nhận **CI trên GitHub xanh** cho các migration 0080–0090 (chạy bộ test đầy đủ ở CI, không chạy trên máy). Nếu đỏ: gửi log cho Claude sửa trước khi `db push`.
- [ ] [B] Xác nhận **Supabase đang trỏ là dự án THẬT hay dự án thử**, và có dữ liệu cần giữ không. Nếu có dữ liệu thật: sao lưu (Supabase → Database → Backups) trước khi đẩy migration. *Không bao giờ `db reset`.*
- [ ] [B] Xác nhận app chạy ở **Pages hay Worker** (`DEPLOY_CLOUDFLARE.md` ghi cả hai: mục Pages và "Worker `agricovi`"). Chỉ cần biết đúng nơi gắn domain ở giai đoạn 1.
- [ ] [B] Chốt `login_email_domain` = `agricovi.com` (tên miền bạn sở hữu, không có hộp thư). **Đổi sau này sẽ làm lệch email đăng nhập của tài khoản đã tạo**, nên chốt ngay bây giờ.

**Xong khi:** CI xanh, biết rõ dự án Supabase và nơi chạy app.

## Giai đoạn 1 — Đưa lên domain (≈ 1–2 giờ, theo đúng thứ tự)
1. - [ ] [B] `npx supabase db push` — đẩy 0016 → 0090 (0090 là của WEB nhưng chung CSDL, vẫn phải đẩy theo thứ tự).
2. - [ ] [B] `npx supabase functions deploy staff-accounts` (D45; không có thì không tạo/đặt lại mật khẩu nhân viên được).
3. - [ ] [B] SQL một lần: `update platform_settings set value = '"agricovi.com"' where key = 'login_email_domain';` (nếu chưa đặt).
4. - [ ] [B] Cloudflare: gắn **custom domain `app.agricovi.com`**; kiểm tra biến **build** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_SITE_URL` (Production), `NODE_VERSION=22`; bấm build lại.
5. - [ ] [B] Supabase → Authentication → URL Configuration: **Site URL** = `https://app.agricovi.com`; **Redirect URLs** thêm địa chỉ đó (giữ địa chỉ `workers.dev`/`pages.dev` cũ tạm thời).
6. - [ ] [B] `git push` (Claude chỉ commit cục bộ).

**Xong khi:** mở `https://app.agricovi.com` thấy màn đăng nhập (không báo "chưa cấu hình Supabase").

## Giai đoạn 2 — Kiểm tra nhanh sau triển khai ("smoke test", ≈ 30 phút, làm trước khi mời ai)
- [ ] Đăng nhập chủ cơ sở trên `app.agricovi.com`; mở `/quan-tri/` đăng nhập quản trị nền tảng.
- [ ] Dòng "Phiên bản app" ở *Cơ sở của tôi* hiện bản mới (có thể phải mở lại app 1–2 lần).
- [ ] Cài PWA lên điện thoại, mở từ biểu tượng; logo/tên Agricovi đúng.
- [ ] Tạo tài khoản nhân viên, đăng nhập bằng tài khoản đó; đặt lại mật khẩu (kiểm tra Edge Function).
- [ ] Tắt mạng → ghi một nhật ký → bật mạng → thấy đồng bộ (offline D24).
- [ ] Mở mã QR/nút "Xem" của một vụ: link trỏ đúng website công khai.
- [ ] Gỡ `workers.dev`/`pages.dev` khỏi Redirect URLs **chỉ sau khi** mọi người đã chuyển sang domain mới.

**Xong khi:** 7 mục trên đạt. Lỗi nào ghi vào bảng ở giai đoạn 4.

## Giai đoạn 3 — Dùng thử có hướng dẫn (1–2 tuần), chia 3 lớp theo rủi ro
Làm theo thứ tự; lớp trước ổn mới sang lớp sau. Ghi kết quả "Đạt / Lỗi / Khó dùng" vào bảng giai đoạn 4.

| Lớp | Nội dung | Bài thử (`HUONG_DAN_THU.md`) | Ai |
|---|---|---|---|
| **A. Cốt lõi hằng ngày** (rủi ro cao nhất) | Kho, ghi việc kèm vật tư, thu hoạch, chi phí/bán hàng, tổng kết vụ, 2 người sửa cùng lúc, phân quyền theo mục | Bài 1–7 | Chủ + 1 nhân viên thật |
| **B. Mới làm gần đây** (chưa ai dùng) | P1 (mã khu/vụ, lô + hạn vật tư, mã lô thu hoạch, kim gãy), P2 hao hụt, P4 mốc nhắc, P3 tăng trọng/FCR, P5 sổ in/Excel, bảng kiểm, chế độ đơn giản | Mục "Thử P1…Thử chế độ đơn giản" | Chủ |
| **C. Mở rộng** | Chấm công/lương, hồ sơ website, công khai vụ | Bài 14–22 | Khi cần |

**Dữ liệu thử nên dùng thật** (1 vụ dưa hoặc 1 lứa heo của bạn) thay vì dữ liệu mẫu, vì D100 yêu cầu có người dùng thật trước khi làm tiếp tính năng lớn. Trước đó chủ sản phẩm đã hoãn pilot hộ ngoài; **đề xuất tối thiểu: chính bạn dùng thật 1 vụ + 1 nhân viên ghi nhật ký**, chưa cần hộ ngoài.

**Việc bạn làm trong lúc thử (cung cấp dữ liệu, Claude không tự đoán):**
- [ ] Bảng kiểm VietGAP heo: đối chiếu với bản chính thức rồi bấm "Đã đối chiếu".
- [ ] Bảng kiểm dưa lưới nhà màng: file ghi 25 tiêu chí nhưng nạp được 18 — cho biết 7 tiêu chí còn thiếu hoặc xác nhận 18 là đủ.
- [ ] Lịch vaccine heo: thú y của trại chốt, bạn thêm mốc nhắc theo lịch đó.
- [ ] Vật tư cám: đặt nhóm "Thức ăn", đơn vị kg (để tính FCR).

**Xong khi:** lớp A đạt hết và lớp B không còn lỗi chặn (P0/P1 ở bảng dưới).

## Giai đoạn 4 — Thu phản hồi và sửa lỗi (liên tục)
Mỗi phản hồi ghi một dòng, phân loại để biết làm gì trước:

| Mức | Ý nghĩa | Hành động |
|---|---|---|
| **P0** | Mất/sai dữ liệu, không đăng nhập được, sai phân quyền | Sửa ngay, có test CSDL |
| **P1** | Một tính năng chính không dùng được | Sửa trong tuần |
| **P2** | Khó hiểu, rối, chữ chưa dễ | Gộp sửa theo đợt |
| **P3** | Mong muốn thêm | Đưa vào giai đoạn 5, chưa làm |

| # | Ngày | Màn hình | Mô tả | Mức | Trạng thái |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |

## Giai đoạn 5 — Hoãn có chủ đích (chỉ mở khi phản hồi thật đòi hỏi)
Xếp theo giá trị/giảm rủi ro; **không làm trước khi qua giai đoạn 3**:
1. **Việc nhỏ đã biết còn thiếu:** phiếu đo môi trường (P3 đầy đủ: nhiệt độ/độ ẩm nhà màng, số lần tưới, tỉ lệ nảy mầm để điền các cột sổ đang trống); chụp hóa đơn (G2-3).
2. **P7** thu trứng hằng ngày + gói "Đàn nhỏ" (khi có hộ nuôi gà/chim cần).
3. **P6** gói loại hình trọn bộ, lớp phủ C.P.
4. **P8** cá thể/cặp sinh sản; **P9** gia công C.P., truy xuất theo lô, cảm biến, thủy sản.
5. Thời tiết, pilot hộ ngoài, báo cáo nâng cao — theo quyết định chủ sản phẩm.

## Cách theo dõi
- Cuối mỗi buổi: tick mục đã xong ở file này; Claude cập nhật `STATUS_APP.md` (ngắn) khi xong mốc lớn.
- Mỗi chat mới chỉ cần nói "APP, tiếp giai đoạn N" — đọc file này là đủ ngữ cảnh.
- Lỗi mới → thêm dòng vào bảng giai đoạn 4, gửi Claude kèm ảnh chụp màn hình.
