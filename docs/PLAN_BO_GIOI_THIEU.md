# Kế hoạch: bộ ảnh giới thiệu hệ thống để đăng nhóm Facebook (chờ duyệt)

Ngày soạn: 21/11/2026. Chưa làm ảnh nào. Số "phiên" là ước lượng thô của tôi (1 phiên = một buổi làm gọn), chưa đo.

## 1. Học gì từ bộ mẫu "Quản trị tử tế" (9 ảnh)

Mẫu hay vì **nhịp kể chuyện** chứ không phải vì đẹp: mỗi ảnh một ý, đọc lướt trong 3 giây vẫn hiểu.
1. **Ảnh bìa** nói ngay lợi ích lớn nhất (MIỄN PHÍ), tên sản phẩm bằng chữ to, 3 nhãn ngắn, hình điện thoại + máy tính.
2. **Ảnh "bản đồ tính năng"**: lưới 16 ô biểu tượng, một dòng tóm tắt dưới cùng → người xem thấy "nó có hết".
3. **Các ảnh chi tiết**: tiêu đề nhỏ (loại), tiêu đề lớn (câu có điểm nhấn màu cam), 3 gạch đầu dòng có dấu ✓, hình thật bên dưới (cả màn hình quản trị và màn điện thoại).
4. **Ảnh cuối**: so sánh 2 phiên bản + một đường dẫn kêu gọi hành động.
5. Mỗi ảnh có số trang `01 / 9`, thương hiệu ở góc, địa chỉ web ở chân → ảnh bị chia sẻ lẻ vẫn mang thương hiệu.

Tôi **không sao chép** thiết kế: giữ cấu trúc kể chuyện và nhịp trình bày, làm bằng nhận diện của chúng ta (xanh lá `#168043`, nền kem sáng, nhấn cam, logo Agricovi có sẵn).

## 2. Dàn ý: từ tổng quan đến chi tiết (2 tầng)

Facebook an toàn nhất là **mỗi bài ≤ 10 ảnh** (mẫu của bạn 9 ảnh). Hệ thống của chúng ta rộng hơn nên chia **2 tầng**: một bộ tổng quan để thu hút, rồi loạt bài chuyên sâu để người quan tâm đọc tiếp.

### Tầng A. Bộ "Giới thiệu chung" (10 ảnh): bài đầu tiên, đăng nhiều nhóm

| # | Ảnh | Ý chính | Hình minh họa |
|---|---|---|---|
| 01 | **Bìa** | MIỄN PHÍ 12 tháng · Phần mềm quản lý nuôi trồng + website xúc tiến thương mại · nhãn: Dùng trên điện thoại · Dùng trên máy tính · Có website kết nối mua bán | Điện thoại + máy tính cạnh nhau |
| 02 | **Toàn cảnh** | Ghi một lần, dùng nhiều nơi: **App** (điện thoại/máy tính) → **Website** (khách tìm thấy bạn) → **Quản trị** (an toàn, phân quyền) | Sơ đồ 3 khối có mũi tên |
| 03 | **Ai dùng, thấy gì** | Hộ · HTX · nhân viên · người mua: mỗi người một cách nhìn | 4 thẻ vai trò |
| 04 | **Bản đồ tính năng** | Lưới 16 ô (nhật ký, kho, chi phí, thu hoạch, doanh thu, nhân công, HTX, báo cáo, QR truy xuất, website, giao thương…) | Lưới biểu tượng |
| 05 | **Ghi việc mỗi ngày** | Chạm vài lần là xong · **dùng được khi mất sóng** · quy trình mẫu nhắc việc | Màn Ghi việc + lịch |
| 06 | **Từ ghi chép đến lãi lỗ** | Chi phí → kho → thu hoạch → doanh thu → **lãi/lỗ từng vụ** (luồng giống ảnh 3 của mẫu) | Màn tổng kết vụ |
| 07 | **Nhân công** | Chấm công, khoán công, bảng lương rõ ràng | Màn Chấm công + Bảng lương |
| 08 | **HTX và hộ thành viên** | HTX quản lý nhiều hộ, thu mua, hợp đồng bao tiêu, truy xuất nguồn gốc | Màn HTX |
| 09 | **Website kết nối** | Hồ sơ cơ sở, gian hàng, giao thương, báo giá, tin nông nghiệp, giá nông sản · **dữ liệu riêng tư, chỉ công khai thứ bạn duyệt** | Trang web trên máy tính + điện thoại |
| 10 | **Bắt đầu miễn phí** | Gói Khởi đầu 12 tháng (nói rõ giới hạn) · cần nhiều hơn thì liên hệ nâng cấp · **2 cách cài: điện thoại / máy tính** · mã QR + Zalo | QR, 2 thẻ cài đặt |

### Tầng B. Loạt "Chuyên sâu" (mỗi bộ 6–8 ảnh; đăng cách nhau vài ngày)

| Bộ | Chủ đề | Nội dung chính |
|---|---|---|
| B1 | **Sản xuất và nhật ký** | Phân khu/ô, vụ, quy trình mẫu theo từng cây/vật nuôi, ghi việc, nhật ký, sổ theo mẫu VietGAP |
| B2 | **Kho, chi phí, lãi lỗ** | Vật tư có lô và hạn dùng, xuất kho theo vụ, chi phí chung chia cho vụ, chụp hóa đơn đọc bằng AI (2 lần/tháng ở gói miễn phí), tổng kết vụ |
| B3 | **Nhân công và chấm công** | Chấm công điện thoại/máy chấm công, nghỉ phép, khoán công, bảng chấm công giấy, bảng lương |
| B4 | **HTX và hộ thành viên** | Hộ trong HTX, thu mua từ hộ, hợp đồng bao tiêu, bảng kê thu mua, công nợ |
| B5 | **Website và truy xuất** | Hồ sơ cơ sở, gian hàng, giao thương, báo giá, mã QR truy xuất nguồn gốc, đơn khách từ website |
| B6 | **Báo cáo và hồ sơ** | Báo cáo tuần, báo cáo tổng hợp, sổ nhật ký, bảng kiểm, hồ sơ xuất khẩu, xuất Excel |
| B7 | **An toàn và phân quyền** | Dữ liệu riêng tư mặc định, chủ cấp quyền từng người, nhiều vai trò, xóa tài khoản trong app |
| B8 | **Gói, giá, cách bắt đầu, hỏi đáp** | Khởi đầu miễn phí/Hộ/HTX, nâng cấp, cài trên điện thoại/máy tính, câu hỏi thường gặp |

Mỗi bộ B dùng đúng khuôn của tầng A (tiêu đề nhỏ, tiêu đề lớn có điểm nhấn, 3 ý ✓, hình bên dưới) nên người xem quen mắt.

## 3. Cách làm ra ảnh

- **Khổ ảnh:** 1080 × 1350 (dọc 4:5, hiển thị lớn nhất trên điện thoại ở Facebook), xuất **PNG**; có thể thêm bản 1080 × 1080 nếu bạn cần.
- **Làm bằng HTML + CSS** rồi chụp ra PNG từng ảnh: sửa chữ/màu/số liệu rất nhanh, đồng nhất 100%, không phụ thuộc phần mềm thiết kế. Mã nguồn lưu trong repo để sửa sau.
- **Hình minh họa màn hình** (chọn một, mục 5):
  - **Khuyến nghị: dựng lại màn hình bằng chính kiểu dáng của app, với số liệu mẫu.** Không cần đăng nhập, không lộ dữ liệu thật, trông y như app, sửa số liệu tùy ý.
  - Hoặc dùng ảnh chụp màn hình thật (cần một cơ sở mẫu có dữ liệu; tôi không tự nhập mật khẩu đăng nhập, bạn đăng nhập sẵn trong khung trình duyệt hoặc tự chụp rồi gửi).
- **Lời dẫn đăng kèm (caption)** cho từng bài: tiếng Việt dễ hiểu, có kêu gọi hành động, thẻ hashtag, **câu trả lời mẫu cho các bình luận hay gặp** (giá, offline, dữ liệu có an toàn không, có cho HTX không…).

## 4. Nguyên tắc nội dung (để không bị bắt lỗi)

- Chỉ nói **điều app đã làm được**. Việc chưa có (ví dụ lên Google Play/App Store) ghi "sắp có" hoặc không nhắc.
- Nói thẳng giới hạn gói miễn phí (1 vụ, 1 phân khu, 1 ô...) ngay trong ảnh cuối; người đọc thấy minh bạch sẽ tin hơn.
- Không nêu tên đối thủ, không so sánh trực diện. Không viết "đạt chuẩn VietGAP" mà viết "sổ ghi chép theo mẫu VietGAP".
- Không dùng dữ liệu cá nhân thật trong hình; tên, số điện thoại trong ảnh đều là mẫu.
- Mã QR và đường dẫn chỉ trỏ tới địa chỉ chính thức; gắn mã theo dõi nguồn (nếu bạn muốn đo bài nào hiệu quả).

## 5. Việc bạn cần chốt/cung cấp trước khi tôi bắt đầu

1. **Tên thương hiệu hiển thị:** AgriConnect hay Agricovi (hiện cả hai cùng xuất hiện trong tài liệu)? Logo dùng bản nào (đang có `logo-horizontal.webp`).
2. **Địa chỉ web và cách cài đặt** để in vào ảnh cuối (tên miền chưa mua thì dùng địa chỉ tạm hay để trống mã QR?).
3. **Thông tin liên hệ in trên ảnh:** Zalo, điện thoại, email, Facebook (có thể lấy từ cấu hình liên hệ nếu bạn đã điền).
4. **Hình minh họa:** dựng lại bằng kiểu dáng app (khuyến nghị) hay dùng ảnh chụp thật?
5. **Trọng tâm người xem:** trồng trọt (dưa lưới, cây ăn trái), chăn nuôi (heo, gà…), hay chung? Tôi đề xuất bộ A viết chung, các bộ B1–B2 có thêm phiên bản riêng cho trồng trọt và chăn nuôi nếu bạn cần.
6. **Có nêu "gói miễn phí 12 tháng" ngay trên bìa không** (đề xuất: có, vì đó là điểm hút).

## 6. Lộ trình và công sức (ước lượng)

| Bước | Việc | Ước lượng |
|---|---|---|
| 0 | Chốt 6 điểm trên + duyệt dàn ý | trao đổi ngắn |
| 1 | Khung thiết kế (màu, chữ, biểu tượng, thẻ ✓, khung điện thoại/máy tính) + ảnh bìa mẫu để bạn duyệt giao diện | 1 phiên |
| 2 | **Bộ A** hoàn chỉnh 10 ảnh + caption + câu trả lời mẫu | 2–3 phiên |
| 3 | **Bộ B1 → B8** (mỗi bộ 6–8 ảnh + caption), làm lần lượt, bạn duyệt từng bộ | 1–2 phiên mỗi bộ (khoảng 8–14 phiên cả loạt) |
| 4 | Sửa theo góp ý, bản 1080×1080 (nếu cần), danh sách lịch đăng gợi ý (nhóm nào, giờ nào, thứ tự bộ) | 1 phiên |

Khuyến nghị: **làm bước 1–2 trước (bộ A)**, đăng thử vài nhóm, xem phản hồi rồi mới làm loạt B (làm đúng chỗ người xem hay hỏi).

Việc xong thì để ở `marketing/gioi-thieu/` (PNG + mã nguồn HTML + file chữ caption), không đưa vào mã app.
