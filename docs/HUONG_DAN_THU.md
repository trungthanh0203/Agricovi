# Hướng dẫn dùng thử AgriConnect (bản thử cho người dùng thật)

Tài liệu này dành cho **chủ cơ sở, quản lý, người phụ trách kho & chi phí và nhân viên** dùng thử app. Bạn không cần biết về công nghệ. Nếu gặp chỗ khó hiểu, đó là lỗi của app, không phải lỗi của bạn: hãy ghi lại và báo cho chúng tôi (xem cuối trang).

## Bố cục 6 tab

**Trang chủ** (việc hôm nay) · **Sản xuất** (Mùa vụ, Thu hoạch, Kho) · **Khai báo** (Khu trồng, Cây trồng, Danh mục việc, Quy trình mẫu, Vật tư và kho) · **Tổ chức** (cơ sở và gói, nhân sự, tổ lao động, hộ thành viên/HTX) · **Báo cáo** (Chi phí, Doanh thu, Tổng kết vụ) · **Hồ sơ** (tài khoản, lời mời, quyền của tôi). Khai báo, Tổ chức, Báo cáo chỉ hiện với người có quyền. Một số mục ghi "Sắp có" sẽ làm ở các bản sau (tạo vụ theo mẫu, chức vụ, báo cáo theo nhu cầu).

## Trước khi thử (dành cho người cài đặt)

Người phụ trách kỹ thuật làm một lần trước khi mời người dùng thử:

1. Đẩy cơ sở dữ liệu lên (cần cả sáu bản cập nhật mới): `npx supabase db push` (có các bản `0016` đến `0021`).
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

1. Vào **Khai báo → Cây trồng**: có sẵn "Dưa lưới". Muốn thêm cây của riêng bạn, gõ tên vào ô trên cùng rồi bấm **Thêm**; cây mới vào bảng ngay (đánh dấu "Riêng").
2. Vào **Khai báo → Danh mục việc**: một bảng gồm các việc có sẵn (Tưới nước, Bón phân, Thụ phấn…) và việc của cơ sở. Thiếu việc nào thì gõ tên vào ô trên cùng rồi **Thêm**; việc mới vào bảng ngay. Bấm ✎ ở việc "Riêng" để đổi tên hoặc thêm trường cần ghi (ví dụ "Độ Brix" kiểu Số).
3. Vào **Khai báo → Quy trình mẫu**: chọn cây, gõ tên quy trình (ví dụ "Dưa lưới mùa khô"), bấm **Tạo**. Quy trình mở ra ngay.
4. Thêm **giai đoạn**: ở dòng dưới bảng, chọn **việc từ danh mục** (tên giai đoạn chính là tên việc) và gõ **số ngày**, bấm **Thêm**. Làm lần lượt cho các giai đoạn (ví dụ Làm đất 7 ngày, Gieo hạt 10 ngày, Thụ phấn 14 ngày, Thu hoạch 20 ngày). Thiếu việc thì bấm **Định nghĩa việc mới** ngay tại đó.
5. Quy trình hiện thành **danh sách**: số thứ tự, việc, số ngày (sửa trực tiếp ô số ngày), khoảng ngày "từ–đến". Thanh màu phía trên cho thấy tỉ lệ các giai đoạn và tổng số ngày.
6. **Đổi thứ tự**: cầm ký hiệu ⠿ ở đầu dòng rồi kéo lên/xuống, hoặc bấm nút ↑ ↓. Đổi việc của một giai đoạn bằng ô chọn ngay trên dòng; ✕ để xóa giai đoạn.
7. Thử **Nhân bản** một quy trình rồi sửa bản sao, **Đổi tên**, **Ngừng dùng**.
8. Kiểm tra: mỗi hộ/HTX chỉ thấy mẫu của mình. Nhân viên không thấy tab Khai báo.
9. Lưu ý: sửa mẫu **không đổi** các vụ đã tạo trước đó. Việc **tạo vụ theo mẫu** sẽ có ở bản sau.

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
