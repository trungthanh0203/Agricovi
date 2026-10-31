# Kế hoạch tối ưu hiệu năng (APP) — làm từng đợt

Mục tiêu: một cơ sở có hàng trăm người làm, hàng chục vụ, hàng chục nghìn bản ghi vẫn mở app nhanh, không giật, không tốn pin/dữ liệu di động; nhiều cơ sở dùng cùng lúc vẫn ổn. Nguyên tắc: **đo trước, sửa sau; mỗi đợt có số đo "trước/sau" và tiêu chí xong**. Việc nặng hoặc chậm (nạp dữ liệu giả, đo trên điện thoại thật) do chủ sản phẩm chạy tay theo lệnh trong từng đợt.

Đã làm (D134): phiên ổn định, bớt tự tải lại, bảng trên máy không báo đổi khi dữ liệu y hệt, đồng bộ không dồn dập, 4 chỉ mục CSDL. Chấm công đã phân trang và tính số liệu ở máy chủ (D115).

## Điểm nghẽn đã biết (từ đọc mã)
| # | Điểm | Vì sao nặng khi dữ liệu lớn |
|---|---|---|
| a | `syncDown` mỗi lần mở app tải lại toàn bộ vụ, giai đoạn (mọi vụ kể cả đã xong), ghi chú (1000), kho, thu hoạch, chi phí/doanh thu, sự cố, mốc, cách ly; xóa rồi ghi lại nhiều bảng | Tải nhiều MB mỗi lần mở; ghi IndexedDB nhiều; mạng yếu rất chậm |
| b | Một số danh sách tải hết: Nhân sự, Khách hàng, Nhà cung ứng, Vụ (cả vụ cũ) | Chậm và dài khi hàng trăm dòng |
| c | Báo cáo tổng hợp nhiều tháng tính theo yêu cầu | Chậm dần khi bản ghi tăng |
| d | Giao diện: danh sách dài vẽ hết, nhiều màn nặng nạp cùng lúc | Giật trên điện thoại yếu |
| e | Không có giám sát, trần dung lượng, dọn dữ liệu định kỳ | Phát hiện chậm khi đã quá muộn |

## Đợt 0 — Đo nền (làm trước, nhỏ)
- **Tôi làm:** (1) script nạp dữ liệu giả cho MỘT cơ sở lớn (300 người, 30 vụ, 20.000 nhật ký, 10.000 giao dịch kho, 10.000 chi phí/doanh thu, 100.000 lượt chấm công) vào Supabase **thử**; (2) khung đo trong app: thời gian và dung lượng của lần đồng bộ, số dòng mỗi bảng, hiện ở màn Hỗ trợ (chỉ chủ/quản trị thấy) để chụp gửi lại.
- **Bạn làm:** chạy script nạp (lệnh tôi đưa, vài phút), mở app trên điện thoại thật, ghi lại: thời gian mở app lần đầu và lần sau, thời gian mở Chấm công, Báo cáo, Nhật ký việc.
- **Xong khi:** có bảng "trước" với các số trên; xác định 3 điểm chậm nhất để ưu tiên.

## Đợt 1 — Giảm việc mỗi lần mở app (rẻ, hiệu quả nhanh)
- Giai đoạn: chỉ tải của vụ chưa kết thúc; vụ đã xong tải khi mở chi tiết.
- Ghi chú: chỉ việc chưa xong và 90 ngày gần nhất. Danh mục (sản phẩm, loại việc, vật tư): chỉ tải lại khi có thay đổi (so dấu phiên bản) hoặc mỗi ngày một lần.
- Không xóa rồi ghi lại cả bảng khi nội dung giống nhau.
- **Xong khi:** dung lượng tải lần mở sau giảm ≥ 60% so với Đợt 0; test đồng bộ đầu–cuối (`sync.e2e`) vẫn đạt.

## Đợt 2 — Phân trang và tìm kiếm ở máy chủ
- Nhân sự, Khách hàng, Nhà cung ứng, Vụ cũ, Nhật ký việc, Chi phí, Doanh thu: 50 dòng mỗi trang, ô tìm, lọc do máy chủ làm (giống mục Công ở Chấm công).
- **Xong khi:** mọi danh sách mở dưới 1 giây với 5.000 dòng; không còn danh sách tải hết.

## Đợt 3 — Đồng bộ gia tăng (nặng nhất, làm sau khi có số đo)
- Mỗi bảng có dấu thời điểm sửa; app nhớ mốc đã tải và chỉ tải phần mới sửa. Bản ghi bị xóa cứng (giai đoạn, ghi chú) dùng dấu xóa hoặc đối chiếu cả bảng mỗi ngày một lần.
- Cần migration (thêm cột/dấu xóa, chỉ mục), đổi `syncDown`, thêm test đồng bộ.
- **Xong khi:** mở app lần 2 trở đi chỉ tải vài KB khi không có thay đổi; test đồng bộ và test offline đạt.

## Đợt 4 — Báo cáo và tổng hợp ở máy chủ
- Rà các hàm báo cáo bằng `EXPLAIN` trên dữ liệu giả; thêm chỉ mục theo bằng chứng; bảng tổng hợp theo tháng/vụ cập nhật khi có ghi mới (hoặc làm mới theo lịch) cho Báo cáo tuần, Tổng kết vụ, số liệu Trang chủ.
- **Bạn làm:** chạy 1–2 truy vấn đo trên Supabase (tôi đưa sẵn) và gửi kết quả.
- **Xong khi:** mọi báo cáo dưới 2 giây với dữ liệu lớn.

## Đợt 5 — Giao diện và bộ nhớ trên điện thoại
- Danh sách dài vẽ theo cửa sổ nhìn thấy; tách mã các màn nặng (báo cáo, biểu đồ) nạp khi mở; ảnh dùng bản thu nhỏ và nạp lười; kiểm tra dung lượng bản dựng.
- **Xong khi:** điện thoại tầm trung cuộn danh sách 1.000 dòng không giật; dung lượng tải lần đầu không tăng.

## Đợt 6 — Giám sát và trần an toàn
- Dọn định kỳ (ảnh chấm công quá 60 ngày, nhật ký cũ có thể lưu kho), cảnh báo dung lượng CSDL, giới hạn tần suất gọi, hướng dẫn xem truy vấn chậm trên Supabase, kịch bản thử tải nhiều người (k6) do bạn chạy.
- **Xong khi:** có lịch dọn tự chạy và một trang kiểm tra sức khỏe hệ thống cho quản trị nền tảng.

## Thứ tự đề xuất
**0 → 1 → 2 → 4 → 3 → 5 → 6.** Lý do: Đợt 0–1 rẻ và cho hiệu quả thấy ngay; Đợt 2 xử lý cảm giác "chậm khi nhiều dòng"; Đợt 3 rủi ro cao nên làm khi đã có số đo chứng minh cần; Đợt 5–6 làm khi hệ thống đã có khách dùng thật.

## Rủi ro cần canh
- Đồng bộ gia tăng sai có thể làm máy hiển thị thiếu dữ liệu: bắt buộc có test đầu–cuối và nút "Tải lại toàn bộ" ở màn Hỗ trợ.
- Mọi migration mới đi kèm test CSDL (một file gọn); không đổi dữ liệu đã có.
