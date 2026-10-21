# Hướng dẫn dùng thử AgriConnect (bản thử cho người dùng thật)

Tài liệu này dành cho **chủ cơ sở, quản lý, người phụ trách kho & chi phí và nhân viên** dùng thử app. Bạn không cần biết về công nghệ. Nếu gặp chỗ khó hiểu, đó là lỗi của app, không phải lỗi của bạn: hãy ghi lại và báo cho chúng tôi (xem cuối trang).

## Bố cục 6 tab

**Trang chủ** (việc hôm nay) · **Sản xuất** (Mùa vụ, Thu hoạch, Kho) · **Khai báo** (Khu trồng, Cây trồng, Danh mục việc, Quy trình mẫu, Vật tư và kho) · **Tổ chức** (cơ sở và gói, nhân sự, tổ lao động, hộ thành viên/HTX) · **Báo cáo** (Chi phí, Doanh thu, Tổng kết vụ) · **Hồ sơ** (tài khoản, lời mời, quyền của tôi). Khai báo, Tổ chức, Báo cáo chỉ hiện với người có quyền. Một số mục ghi "Sắp có" sẽ làm ở các bản sau (tạo vụ theo mẫu, chức vụ, báo cáo theo nhu cầu).

## Trước khi thử (dành cho người cài đặt)

Người phụ trách kỹ thuật làm một lần trước khi mời người dùng thử:

1. Đẩy cơ sở dữ liệu lên (cần cả bảy bản cập nhật mới): `npx supabase db push` (có các bản `0016` đến `0022`).
2. Mở app, tạo cơ sở, mời hoặc tạo tài khoản cho từng người theo vai trò bên dưới.
3. Cài app ra màn hình chính điện thoại (Chrome: menu → "Thêm vào màn hình chính"; iPhone: Safari → Chia sẻ → "Thêm vào MH chính").

## Ai làm được gì

Bảng dưới là **mặc định theo vai trò**. Chủ cơ sở có thể **cấp riêng từng mục cho từng người** (bài thử 7): ai được cấp thì mới thấy và nhập liệu được mục đó.

| Vai trò | Việc làm được |
|---|---|
| **Chủ cơ sở** | Mọi việc |
| **Quản lý** | Ghi việc, ghi thu hoạch, xem tồn kho, chi phí, doanh thu và tổng kết; không ghi tiền |
| **Kho & chi phí** | Thêm vật tư, nhập kho, ghi chi phí và doanh thu, xem tổng kết |
| **Nhân viên** | Ghi việc kèm vật tư đã dùng, ghi thu hoạch; không xem tiền |

## Bài thử 1: Chuẩn bị kho (người Kho & chi phí hoặc chủ, cần có mạng)

1. Vào tab **Khai báo → Vật tư và kho** (danh mục). Khu trồng cũng khai báo ở **Khai báo → Khu trồng**.
2. Thêm một **kho** (ví dụ "Kho chính").
3. Thêm vài **vật tư** (ví dụ "Phân NPK" tính bằng kg). Có thể đặt mức "sắp hết".
4. Vào **Sản xuất → Kho → Nhập kho**: chọn vật tư, nhập số lượng và **giá nhập**.
   - Nếu chưa biết giá, để trống. App sẽ ghi rõ là "chưa ghi giá" chứ không tự đoán.
5. Kiểm tra: tồn kho hiện đúng số bạn vừa nhập.

**Quy tắc offline của bản thử:** chỉ việc **ghi mới hằng ngày của nhân viên** (ghi việc kèm vật tư đã dùng, ghi thu hoạch) dùng được khi mất mạng. Mọi việc khác (khu trồng, vụ, kho, chi phí, bán hàng, sửa, hủy, tổng kết) **cần có mạng** và báo kết quả ngay.

## Bài thử 2: Ghi việc kèm vật tư (nhân viên)

0. **Chỉ vụ "Đang sản xuất" mới ghi việc được.** Vụ đang chuẩn bị hoặc tạm dừng thì nút Ghi việc bị tắt; hãy bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở màn Sản xuất trước.
1. Ở **Trang chủ**, bấm **Ghi việc vừa làm** → chọn việc (ví dụ "Bón phân").
2. Bấm **+ Thêm vật tư đã dùng**, chọn vật tư và nhập số lượng. Bấm **Lưu**.
3. **Thử khi mất mạng:** tắt Wi-Fi và dữ liệu di động, rồi ghi thêm một việc kèm vật tư.
   - App phải báo "Đã lưu trên thiết bị — chưa đồng bộ" và không mất dữ liệu.
4. Bật mạng lại. Sau ít phút, nhãn phải đổi thành "Đã đồng bộ".
5. Người có quyền Kho mở **Sản xuất → Kho**: số tồn phải giảm đúng bằng số đã dùng.
6. Mở **Sản xuất → Mùa vụ → Lịch sử nhật ký** và **Sản xuất → Kho → Giao dịch gần đây**: mỗi dòng phải hiện **người làm và vai trò**, ví dụ "Bón phân - Công (Nhân viên sản xuất)" và "Phân NPK 4 kg - Công (Nhân viên sản xuất)". Việc bạn vừa ghi khi mất mạng hiện "Bạn" cho tới khi gửi xong.

## Bài thử 3: Ghi thu hoạch (mọi người)

1. Vào **Sản xuất → Thu hoạch → Ghi thu hoạch**.
2. Nhập số kg thu, phân loại (không bắt buộc) và hao hụt (nếu có). Hao hụt nằm trong số kg đã thu.
3. Thử **khi mất mạng** như bài 2: ghi mới phải lưu được trên điện thoại và tự gửi khi có mạng.
4. Có mạng và phiếu đã gửi xong: thử **Sửa** và **Hủy phiếu** (hủy cần ghi lý do; phiếu đã hủy không khôi phục được). Khi mất mạng, hai nút này ẩn đi vì sửa và hủy cần có mạng.

## Bài thử 4: Chi phí và bán hàng (chủ hoặc Kho & chi phí)

1. Vào tab **Báo cáo → Chi phí → Ghi chi phí**: chọn nhóm (vật tư, nhân công, điện nước…), loại và số tiền.
   - "Tiền thực chi" là tiền đã bỏ ra thật.
   - "Ước tính" hoặc "phân bổ" **bắt buộc ghi cách tính** vào ô ghi chú.
   - Đừng ghi "Vật tư đã dùng (ghi tay)" cho vật tư xuất từ kho, vì kho đã tự tính.
2. **Báo cáo → Doanh thu → Ghi bán hàng**: nhập số kg bán và số tiền thu được.
3. Với tài khoản **quản lý**: các mục này chỉ xem, không có nút ghi hay sửa.

## Bài thử 5: Xem tổng kết vụ (chủ, quản lý, Kho & chi phí)

1. Vào **Báo cáo → Tổng kết vụ**, chọn vụ.
2. Đọc các dòng cảnh báo màu vàng. Ví dụ "Chưa ghi thu hoạch", "Có lần dùng vật tư chưa biết giá vốn". Đó là app đang nói **số liệu chưa đủ**.
3. **Giá thành mỗi kg** chỉ hiện khi có thu hoạch và đủ giá vốn. Nếu chưa đủ, app ghi "Chưa tính được".
4. Dòng **Doanh thu trừ chi phí đã ghi** chỉ hiện khi đủ dữ liệu và không phải lợi nhuận chính thức.
5. Bấm **Xuất CSV** để lưu file mở bằng Excel.
6. Thử hủy một nhật ký đã kèm vật tư rồi bấm **Tính lại**: chi phí vật tư phải giảm theo.

## Bài thử 6: Hai người sửa cùng một thứ

1. Hai người (đều có mạng) cùng mở **Sửa** một phiếu thu hoạch (hoặc một khoản chi). Người A sửa và lưu trước.
2. Người B sửa trên bản cũ rồi bấm Lưu. App phải báo **"Người khác vừa thay đổi bản ghi này…"** và tải lại bản mới nhất. Số của người A **không bị ghi đè**.
3. Người B xem lại số mới rồi sửa lại nếu còn cần.

## Bài thử 7: Chủ cấp quyền theo mục (chỉ chủ cơ sở)

1. Vào tab **Tổ chức → Nhân sự**, mở một nhân viên → **Quyền vật tư, chi phí, thu hoạch**.
2. Với mỗi mục (Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết) chọn: **Theo vai trò**, **Không thấy**, **Chỉ xem** hoặc **Xem và nhập liệu**. Bấm **Lưu quyền**.
3. Trên máy của nhân viên đó, đóng rồi mở lại app: các mục Thu hoạch, Kho (trong Sản xuất) và Chi phí, Doanh thu, Tổng kết vụ (trong tab Báo cáo) chỉ còn đúng những mục được cấp. Mục "Chỉ xem" thì không có nút ghi. Không được cấp mục nào của tab Báo cáo thì cả tab **biến mất**. Tab **Hồ sơ** liệt kê "Tôi được làm gì" để họ tự xem.
4. Thử cấp "Chi phí: Xem và nhập liệu" cho một nhân viên: họ ghi được chi phí. Rút lại bằng "Không thấy": họ không còn thấy.
5. Lưu ý: nhân viên vẫn **ghi việc kèm vật tư đã dùng** bình thường, không phụ thuộc quyền Kho.

## Bài thử 8: Dựng quy trình mùa vụ mẫu (chủ hoặc quản lý, cần có mạng)

0. Mọi danh sách trong tab Khai báo (Khu trồng, Cây trồng, Danh mục việc, Quy trình mẫu, Vật tư, Kho) là **bảng gọn**: gõ tên vào ô trên cùng rồi **Thêm**; mỗi dòng có **⏸ dừng / ▶ dùng lại** và **✎ sửa**. Mục đã dùng thì không xóa, chỉ dừng (lịch sử vẫn giữ).
1. Vào **Khai báo → Cây trồng**: có sẵn "Dưa lưới". **Cây có sẵn cũng sửa/dừng được** cho riêng cơ sở bạn (đổi tên, dừng; ↺ khôi phục mặc định). Muốn thêm cây của riêng bạn, gõ tên vào ô trên cùng rồi bấm **Thêm**; cây mới vào bảng ngay (đánh dấu "Riêng").
2. Vào **Khai báo → Danh mục việc**: một bảng gồm các việc có sẵn (Tưới nước, Bón phân, Thụ phấn…) và việc của cơ sở. Thiếu việc nào thì gõ tên vào ô trên cùng rồi **Thêm**; việc mới vào bảng ngay. Bấm ✎ ở **bất kỳ việc nào** (kể cả việc có sẵn) để đổi tên hoặc thêm trường cần ghi (ví dụ "Độ Brix" kiểu Số); bấm ⏸ để dừng việc đó cho cơ sở bạn. Việc có sẵn đã chỉnh hiện nhãn "Đã chỉnh", có nút "Khôi phục mặc định".
3. Vào **Khai báo → Quy trình mẫu**: chọn cây, gõ tên quy trình (ví dụ "Dưa lưới mùa khô"), bấm **Tạo**. Quy trình mở ra ngay.
4. Thêm **giai đoạn**: ở dòng dưới bảng, chọn **việc từ danh mục** (tên giai đoạn chính là tên việc) và gõ **số ngày**, bấm **Thêm**. Làm lần lượt cho các giai đoạn (ví dụ Làm đất 7 ngày, Gieo hạt 10 ngày, Thụ phấn 14 ngày, Thu hoạch 20 ngày). Thiếu việc thì bấm **Định nghĩa việc mới** ngay tại đó.
5. Quy trình hiện thành **danh sách**: số thứ tự, việc, số ngày (sửa trực tiếp ô số ngày), khoảng ngày "từ–đến". Thanh màu phía trên cho thấy tỉ lệ các giai đoạn và tổng số ngày.
6. **Đổi thứ tự**: cầm ký hiệu ⠿ ở đầu dòng rồi kéo lên/xuống, hoặc bấm nút ↑ ↓. Đổi việc của một giai đoạn bằng ô chọn ngay trên dòng; ✕ để xóa giai đoạn.
7. Thử **Nhân bản** một quy trình rồi sửa bản sao, **Đổi tên**, **Ngừng dùng**.
8. Kiểm tra: mỗi hộ/HTX chỉ thấy mẫu của mình. Nhân viên không thấy tab Khai báo.
9. Lưu ý: sửa mẫu **không đổi** các vụ đã tạo trước đó.
10. Danh sách quy trình có nút 🗑 để **xóa** (hỏi lại trước khi xóa). Quy trình đã có vụ dùng thì không xóa được: bấm "Ngừng dùng".
11. Mọi bảng ở Khai báo (khu trồng, cây, việc, quy trình, vật tư, kho) có ô **Mô tả**: nhập ở dòng thêm nhanh hoặc bấm ✎; mô tả hiện thành dòng chữ nhỏ dưới tên.

## Bài thử 9 — Tạo vụ theo quy trình và theo dõi từng giai đoạn

Cần: đã có khu trồng và ít nhất một quy trình có giai đoạn (bài thử 8).

1. Tab **Sản xuất** → **+ Tạo vụ mới**. Chọn khu trồng, **chọn quy trình** (bắt buộc; chưa chọn thì nút Tạo vụ bị khóa), đặt tên vụ nếu muốn, chọn ngày bắt đầu. Bên dưới hiện **bảng các giai đoạn kèm ngày từ–đến** để bạn kiểm tra trước khi tạo.
2. Bấm **Tạo vụ**. Ở danh sách vụ, mỗi vụ có thanh tiến độ, giai đoạn hiện tại và nút **Xem quy trình & lịch**.
3. Mở vụ: bảng giai đoạn có ngày kế hoạch và thực tế. Với vụ **Đang sản xuất**, chủ/quản lý bấm **Bắt đầu** rồi **Xong** cho từng giai đoạn (nút ↺ để mở lại nếu bấm nhầm). Giai đoạn quá hạn hiện "trễ N ngày".
4. Bấm **Lịch**: mỗi ngày tô màu theo giai đoạn dự kiến, chấm tròn là hôm đó có ghi việc, viền đậm là hôm nay; bấm một ngày để xem chi tiết; ‹ › chuyển tháng.
5. Ở giai đoạn đang làm bấm **Ghi việc**: màn ghi việc mở sẵn đúng vụ, đúng loại việc và gắn giai đoạn. Sau khi ghi, mở lại vụ sẽ thấy số việc đã ghi của giai đoạn.
6. Kiểm tra quyền: nhân viên thấy giai đoạn và ghi việc được nhưng **không có nút Bắt đầu/Xong**. Vụ Chuẩn bị/Tạm dừng/Kết thúc không đổi giai đoạn được.
7. Sửa quy trình mẫu (thêm một giai đoạn) rồi mở lại vụ cũ: vụ **không đổi**.

## Bài thử 10 — Quản lý vụ, sửa giai đoạn, ghi chú nhắc việc

1. Tab **Sản xuất → Mùa vụ**: phía trên danh sách có các nhóm **Đang sản xuất / Chuẩn bị / Tạm dừng / Kết thúc** kèm số vụ; bấm từng nhóm để xem.
2. Ở thẻ vụ (chủ/quản lý): **Sửa vụ** (tên, ngày bắt đầu, ghi chú) và **Xóa vụ**. Thử xóa một vụ mới tạo chưa ghi gì: xóa được. Thử xóa vụ đã có nhật ký: app báo không xóa được, hãy Kết thúc vụ.
3. Mở vụ → **Danh sách**: bấm ✎ cạnh một giai đoạn để đổi tên, đổi việc, đổi ngày kế hoạch, ghi chú. **+ Thêm giai đoạn** thêm vào cuối. Giai đoạn chưa bắt đầu có nút **Xóa giai đoạn**. Vụ đã Kết thúc thì không sửa được. Quy trình mẫu không bị đổi.
4. Mở vụ → **Lịch**: bấm một ngày, ở dưới có mục **Ghi chú ngày…**; nhập nội dung rồi bấm **Thêm**. Ngày có ghi chú hiện góc vàng. Tích ô để đánh dấu xong, 🗑 để xóa.
5. Quay về **Trang chủ**: thẻ **Nhắc việc** hiện các ghi chú chưa xong đã quá hạn hoặc trong 3 ngày tới; tích ô để đánh dấu xong.
6. Nhân viên: thêm được ghi chú và tích/xóa ghi chú của chính mình, nhưng không thấy nút Sửa vụ, Xóa vụ, sửa giai đoạn.

## Bài thử 11 — Vật tư mẫu và sửa giai đoạn mẫu

1. Tạo một cơ sở mới (hoặc mở cơ sở cũ chưa có vật tư): **Khai báo → Vật tư** đã có sẵn 11 vật tư phân bón (NPK, hữu cơ vi sinh, urê, vôi…). Bấm ✎ để sửa; mục **Thông tin mở rộng** có hướng dẫn, cách dùng, cảnh báo an toàn, chỉ tiêu chất lượng, thời gian cách ly. ⏸ để dừng vật tư không dùng. Nút **Thêm vật tư mẫu còn thiếu** bổ sung lại mục đã xóa mà không đụng mục đã sửa.
2. **Khai báo → Quy trình mẫu → Mở**: ở mỗi giai đoạn bấm ✎, đổi việc/mô tả/số ngày rồi bấm **Lưu thay đổi**. Dòng thêm giai đoạn có ô **Mô tả** nằm giữa ô chọn việc và ô số ngày.

## Bài thử 12 — Trang trại, sản phẩm, hình ảnh, kho

1. **Khai báo → Trang trại → + Thêm trang trại**: nhập tên, vị trí, diện tích (m² hoặc ha), đặc điểm, chọn/chụp ảnh. Bảng hiện ảnh nhỏ, vị trí, diện tích. ✎ để sửa.
2. **Khai báo → Sản phẩm → + Thêm sản phẩm**: chọn loại (Cây trồng / Vật nuôi / Khác), mô tả, ảnh. Sản phẩm có sẵn sửa được tên, mô tả, ảnh cho riêng cơ sở.
3. **Khai báo → Vật tư → ✎**: có mục **Hình ảnh** ở đầu biểu mẫu sửa.
4. **Sản xuất → Kho**: mỗi vật tư có dòng **Nhập cuối: ngày…**. Sau khi **Điều chỉnh tồn**, dòng vật tư hiện luôn "Điều chỉnh gần nhất: ngày, số lượng +/-, lý do".
5. **Nhập kho**: ô ngày không chọn được sau hôm nay; nhập tay ngày tương lai thì app báo lỗi.

## Bài thử 13 — Hồ sơ và thống kê Trang chủ

1. **Hồ sơ**: bấm "Đổi tên hiển thị", nhập tên rồi Lưu; ghi một việc mới và xem tên người làm. "Đổi mật khẩu": nhập hai lần (ít nhất 8 ký tự). Thẻ "Công việc của tôi" hiện tổ đang làm hoặc phụ trách (nếu có).
2. **Khai báo**: có mục **Vật tư** và mục **Kho và đơn vị** riêng.
3. **Trang chủ**: hàng thẻ "Của tôi" và "Của cơ sở"; thẻ thu hoạch/chi phí/doanh thu chỉ hiện với người có quyền. Vụ đang chạy có thanh tiến độ; vật tư sắp hết hoặc tồn âm hiện ở khối "Cảnh báo kho". Bấm "Tải lại" để cập nhật.

## Bài thử 14 — Chấm công và tiền công

Cần: nhân viên có tài khoản (tab Tổ chức → Nhân sự), có tổ và tổ trưởng.
1. **Nhân viên**: Sản xuất → **Chấm công** → "Vào ca"; cuối ngày nhập nghỉ giữa ca rồi "Ra ca". Công hiện "Chờ xác nhận".
2. **Tổ trưởng/quản lý**: ở cùng màn, "＋ Chấm công hộ" (chọn người, ngày, giờ) và "＋ Ghi sản lượng". Bấm ✔ để xác nhận công hoặc sản lượng, ✕ để từ chối (cần lý do). Tổ trưởng không xác nhận công của chính mình.
3. **Chủ**: Khai báo → **Đơn giá công**: thêm đơn giá theo giờ (và theo sản lượng, ví dụ kg) cho cả cơ sở, một tổ hoặc một người.
4. **Chủ/quản lý**: Báo cáo → **Tiền công** → "＋ Tạo kỳ trả công" → mở kỳ → "Tính tiền công". Mở từng người để xem cách tính từng dòng. Thiếu đơn giá thì app báo. Thêm thưởng/khấu trừ/tạm ứng rồi tính lại.
5. **Chủ** bấm "Khóa kỳ (chốt số)". Sau khóa không tính lại, không sửa công trong kỳ. "Mở khóa kỳ" cần lý do.

## Bài thử 15 — Chấm công nâng cao

1. **Vị trí**: bấm Vào ca/Ra ca, cho phép vị trí khi điện thoại hỏi; công hiện "đã ghi vị trí". Không cho phép vẫn chấm công được.
2. **Mất mạng**: tắt mạng, bấm Vào ca (ca lưu trên máy). Bật mạng lại hoặc vẫn tắt, bấm Ra ca: công được gửi khi có mạng và hiện "Chờ xác nhận". Lưu ý: ca bấm Vào ca **khi có mạng** thì Ra ca cũng cần mạng.
3. **Gắn vụ**: ở thẻ Chấm công của tôi, chấm công hộ, ghi sản lượng có ô chọn vụ (không bắt buộc). Sau khi tính tiền công, **Báo cáo → Tổng kết vụ** có dòng Nhân công (đã khóa / dự tính) và được cộng vào giá thành.
4. **Sửa công**: bấm ✎ ở dòng công, nhập giờ đúng và lý do, gửi đề nghị. Quản lý/chủ thấy mục "Yêu cầu sửa công chờ duyệt" và bấm Duyệt hoặc Từ chối. Kỳ đã khóa thì không duyệt được.
5. **Hồ sơ → Tiền công của tôi**: người lao động xem số tiền từng kỳ ("Dự tính" đến khi chủ khóa kỳ).

## Bài thử 16 — Chức vụ và chấm công cho chủ

1. **Chủ**: Sản xuất → **Chấm công**: app tự tạo hồ sơ lao động cho bạn, bấm Vào ca/Ra ca như nhân sự khác (chọn đơn giá cho chủ ở Khai báo → Đơn giá công nếu muốn tính tiền).
2. **Tổ chức → Chức vụ → + Thêm chức vụ**: ví dụ "Kỹ thuật viên": cho Khai báo "Xem và nhập liệu", bật "Được bắt đầu/hoàn thành giai đoạn". Hoặc "Phun thuốc": chọn "Chỉ những việc được chọn" rồi tích Phun thuốc.
3. Ở cùng màn, mục **Gán chức vụ cho người**: bấm tên chức vụ dưới mỗi người để gán/bỏ.
4. Đăng nhập bằng người được gán: tab **Khai báo** xuất hiện (nếu có quyền Khai báo), nút Bắt đầu/Xong ở giai đoạn dùng được. Với chức vụ giới hạn loại việc, màn **Ghi việc** chỉ còn các loại việc được phép. Hồ sơ → "Tôi được làm gì" ghi rõ chức vụ.
5. Chủ vẫn cấp riêng từng người ở Nhân sự (đè lên vai trò và chức vụ). Chức vụ ngừng/xóa thì quyền biến mất ngay khi người đó mở lại app.

## Bài thử 17 — Báo cáo theo nhu cầu

1. **Báo cáo → Theo nhu cầu**: chọn loại (chỉ hiện loại bạn có quyền), nhóm theo, bấm chọn nhanh khoảng ngày (30 ngày, tháng này, tháng trước, năm nay) hoặc tự chọn ngày, chọn vụ nếu cần, bấm **Xem báo cáo**.
2. Đối chiếu số với màn Chi phí, Doanh thu, Thu hoạch, Tổng kết vụ. Chi phí không cộng tiền mua vật tư (đã tính khi dùng).
3. **Xuất CSV** mở bằng Excel. **Lưu báo cáo này**: đặt tên, tick "Chia sẻ" nếu muốn cả cơ sở dùng. Mục "Báo cáo đã lưu" có Mở (tính số mới) và 🗑 (người tạo xóa).
4. Đăng nhập người ít quyền: chỉ thấy các loại báo cáo mình được xem; mở báo cáo chia sẻ mà không đủ quyền thì báo lỗi, không lộ số.

## Bài thử 18 — Danh mục Vai trò và Nhân sự gọn hơn

1. **Tổ chức → Vai trò**: thấy các vai trò có sẵn (có nhãn "Có sẵn") cùng vai trò riêng. ✎ sửa quyền từng mục, loại việc, quyền giai đoạn (vai trò có sẵn giữ nguyên tên); 🗑 xóa (vai trò có sẵn đang có người giữ thì báo chưa xóa được). "Thêm lại vai trò có sẵn đã xóa" khôi phục.
2. Sửa quyền "Quản lý" (ví dụ cho nhập kho), đăng nhập người quản lý: quyền đổi theo ngay khi mở lại app.
3. **Tổ chức → Nhân sự**: bên phải dòng tên có ✎ (sửa tên, SĐT), ⏸ (tạm dừng), 🗑 (gỡ). Dòng "Vai trò:" có nút **Đổi vai trò** và **Đặt lại mật khẩu** ở bên phải. Mục **Phân quyền chức năng** có nền sáng hơn.
4. Đổi vai trò / tạo nhân viên: danh sách vai trò lấy từ danh mục; chọn vai trò riêng thì tự tích thêm vai trò nền.

## Những điều cần biết

- Số tiền luôn là **đồng**, số lượng thu hoạch và bán luôn là **kg** ở bản thử này.
- Kho không bị chặn khi xuất quá số tồn: app **báo "Tồn âm"** để bạn kiểm kê, không âm thầm sửa số.
- **Chỉ ghi mới việc hằng ngày của nhân viên** (ghi việc kèm vật tư, ghi thu hoạch) dùng được khi mất mạng. Danh mục, nhập kho, điều chỉnh, chi phí, bán hàng, tạo vụ, khu trồng, sửa và hủy đều **cần có mạng**: nếu mất mạng, app báo ngay và bạn ghi lại khi có mạng.
- Bản ghi vừa tạo khi mất mạng và **chưa gửi xong** thì chưa sửa hoặc hủy được; hãy đợi nhãn chuyển sang "Đã đồng bộ".
- Không có nút xóa. Ghi sai thì **Hủy** (kèm lý do) rồi ghi lại.
- Tổng kết vụ cần mạng để tính; khi mất mạng bạn xem được bản tải lần gần nhất, có ghi giờ.

## Báo lỗi và góp ý

Khi gặp lỗi hoặc chỗ khó hiểu, hãy gửi cho chúng tôi:

1. Bạn đang ở màn hình nào và vừa bấm gì.
2. Chữ báo lỗi trên màn hình (chụp màn hình càng tốt).
3. Lúc đó có mạng hay không, và vai trò của bạn là gì.
4. Nếu app báo **"Cần xử lý"**, bấm mở "Chi tiết kỹ thuật" và gửi kèm đoạn chữ đó.

Điều chúng tôi muốn biết nhất: bạn **dừng lại ở đâu**, **nhầm ở đâu**, và **cần ai hướng dẫn** ở bước nào.
