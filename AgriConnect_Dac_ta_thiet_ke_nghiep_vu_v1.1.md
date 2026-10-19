# AGRICONNECT --- BỘ ĐẶC TẢ THIẾT KẾ VÀ NGHIỆP VỤ NỀN TẢNG NÔNG NGHIỆP

**Phiên bản:** 1.0 --- Bản nền để thiết kế, ước lượng và triển khai\
**Ngày:** 18/10/2026\
**Trạng thái:** Bản yêu cầu nền tảng; cần xác nhận trong khảo sát và
prototype trước khi phát triển chính thức\
**Tên dự án:** AgriConnect (tên làm việc, chưa phải thương hiệu cuối
cùng)

------------------------------------------------------------------------

## 0. Hướng dẫn sử dụng tài liệu

Tài liệu này là nguồn tham chiếu chung cho chủ sản phẩm, nhà thiết kế
UX/UI, AI tạo code, lập trình viên, kiểm thử và đơn vị triển khai. Mọi
quyết định kỹ thuật hoặc giao diện phải phù hợp với mục tiêu nghiệp vụ
và các yêu cầu bắt buộc trong tài liệu.

### Quy ước mức độ ưu tiên

-   **MUST / Bắt buộc:** Không được bỏ qua nếu chưa có quyết định thay
    đổi được chủ sản phẩm phê duyệt.
-   **SHOULD / Nên có:** Nên triển khai trong MVP; nếu bỏ phải ghi rõ lý
    do và tác động.
-   **LATER / Giai đoạn sau:** Chưa thuộc phạm vi MVP; chỉ thiết kế để
    có thể mở rộng khi hợp lý.

### Nguyên tắc thay đổi

Khi sửa yêu cầu, cần cập nhật đồng bộ: 1. PRD và quy tắc nghiệp vụ. 2.
UX flow và danh sách màn hình. 3. Mô hình dữ liệu/API. 4. Tiêu chí
nghiệm thu và kiểm thử. 5. Danh sách việc đã làm/chưa làm.

Không tự ý đổi các luồng UX đã được duyệt, xóa chức năng đã thống nhất,
hoặc bổ sung tính năng lớn chỉ vì AI/đội phát triển thấy thuận tiện. Nếu
có đề xuất thay đổi, phải nêu lý do, ảnh hưởng, phương án thay thế và
chờ phê duyệt.

------------------------------------------------------------------------

# 1. Tầm nhìn và mục tiêu sản phẩm

## 1.1 Tầm nhìn

Xây dựng nền tảng giúp cơ sở sản xuất nông nghiệp tại Việt Nam quản lý
hoạt động sản xuất một cách trực quan, dễ hiểu, ít thao tác và có thể
tiếp cận thị trường tốt hơn thông qua hồ sơ cơ sở/sản phẩm trên website
xúc tiến thương mại.

Nền tảng gồm: 1. **App quản lý sản xuất:** hỗ trợ nông dân, trang trại
và HTX theo dõi vụ trồng, công việc, nhật ký, vật tư, chi phí, thu hoạch
và kết quả. 2. **Giao diện quản lý cơ sở/HTX:** giúp người quản lý theo
dõi nhiều khu trồng, thành viên, tiến độ và báo cáo. 3. **Website xúc
tiến thương mại:** giới thiệu cơ sở và sản phẩm; cho phép người mua tìm
kiếm và liên hệ trực tiếp. Không phải sàn giao dịch đầy đủ trong MVP.

Các giao diện sử dụng cùng một nền tảng dữ liệu và quyền truy cập, nhưng
có mục đích, trải nghiệm và dữ liệu hiển thị khác nhau.

## 1.2 Vấn đề cần giải quyết

-   Các ứng dụng hiện có mà người dùng đã trải nghiệm bị đánh giá là khó
    dùng, thiếu trực quan, kể cả với người có nền tảng IT.
-   Ghi chép sản xuất và tổng hợp chi phí thường phân tán giữa sổ tay,
    bảng tính, tin nhắn và trí nhớ.
-   Người quản lý khó theo dõi đồng thời nhiều khu trồng, nhiều vụ hoặc
    nhiều hộ.
-   Cơ sở sản xuất có thể có sản phẩm tốt nhưng thiếu hồ sơ trực tuyến
    rõ ràng để khách hàng tìm thấy, hiểu năng lực cung ứng và liên hệ.
-   Việc nhập lại cùng thông tin ở app và website gây lãng phí và dễ sai
    lệch.

## 1.3 Giá trị cốt lõi

-   **Dễ dùng trước, nhiều tính năng sau.**
-   Ghi nhận một lần, tái sử dụng dữ liệu hợp lệ cho nhật ký, kho, chi
    phí và báo cáo.
-   Hiển thị tiến độ và bước tiếp theo rõ ràng.
-   Hỗ trợ nhiều loại cây bằng lõi nghiệp vụ dùng chung và bộ cấu hình.
-   Dữ liệu vận hành mặc định riêng tư; công khai thương mại có sự đồng
    ý rõ ràng.
-   Hỗ trợ làm việc khi kết nối Internet không ổn định.
-   Website giúp giới thiệu và tạo cơ hội kết nối, nhưng không hứa hẹn
    đảm bảo có đơn hàng.

## 1.4 Mục tiêu MVP

1.  Người mới có thể thực hiện các thao tác sản xuất phổ biến mà không
    cần hướng dẫn trực tiếp liên tục.
2.  Cơ sở có thể ghi nhật ký, quản lý vật tư/chi phí và tổng hợp thu
    hoạch trên cùng hệ thống.
3.  HTX có thể quản lý nhiều thành viên/khu trồng theo quyền được cấp.
4.  Cơ sở có thể tạo, xem trước, xác nhận và công khai hồ sơ giới
    thiệu/sản phẩm.
5.  Người mua có thể tìm sản phẩm/cơ sở và liên hệ trực tiếp.
6.  App hỗ trợ offline có kiểm soát và đồng bộ dữ liệu khi có mạng.

## 1.5 Ngoài mục tiêu MVP

-   Không xây sàn giao dịch có giỏ hàng/thanh toán/vận chuyển.
-   Không thay thế phần mềm kế toán hoặc ERP đầy đủ.
-   Không cung cấp chẩn đoán sâu bệnh hoặc khuyến cáo nông học tự động
    bằng AI.
-   Không kết nối điều khiển IoT ở MVP.
-   Không khẳng định chứng nhận/chất lượng nếu chưa có căn cứ.
-   Không cam kết tăng doanh thu hoặc đảm bảo có người mua.

------------------------------------------------------------------------

# 2. Đối tượng sử dụng và vai trò

## 2.1 Nhóm người dùng

1.  **Chủ cơ sở:** tạo và quản lý hồ sơ cơ sở, người dùng, khu trồng, vụ
    trồng, dữ liệu vận hành và thông tin công khai.
2.  **Quản lý sản xuất:** lập/điều phối công việc, theo dõi vụ, xem nhật
    ký và báo cáo theo quyền.
3.  **Nhân viên sản xuất:** xem việc được giao, ghi công việc, nhật ký,
    vật tư sử dụng và thu hoạch theo quyền.
4.  **Người quản lý kho/tài chính:** quản lý giao dịch kho, khoản chi và
    báo cáo liên quan.
5.  **Quản lý HTX:** quản lý thành viên/hộ, vùng trồng, tiến độ ghi chép
    và tổng hợp theo phạm vi được ủy quyền.
6.  **Người quản lý hồ sơ thương mại:** nhập/chỉnh sửa hồ sơ cơ sở/sản
    phẩm và yêu cầu công khai.
7.  **Nhân viên hỗ trợ hồ sơ:** hỗ trợ nhập nội dung theo yêu cầu/ủy
    quyền; không tự ý công khai.
8.  **Kiểm duyệt viên nền tảng:** kiểm tra nội dung công khai theo chính
    sách; không mặc định xác nhận chất lượng nông sản.
9.  **Khách truy cập website/người mua:** xem thông tin đã công khai và
    liên hệ trực tiếp.
10. **Quản trị nền tảng:** quản lý vận hành, tài khoản, nội dung, cấu
    hình và xử lý sự cố; quyền truy cập dữ liệu riêng tư phải giới hạn,
    có mục đích và được ghi nhận.

## 2.2 Nguyên tắc phân quyền

-   Một tài khoản người dùng có thể thuộc nhiều tổ chức/cơ sở.
-   Một tổ chức có thể có nhiều người với các vai trò khác nhau.
-   Quyền được kiểm tra ở phía máy chủ cho mọi API/dữ liệu riêng tư;
    không chỉ ẩn nút trên giao diện.
-   Thành viên chỉ truy cập dữ liệu trong phạm vi tổ chức, khu trồng
    hoặc nhiệm vụ được cấp quyền.
-   Quản trị nền tảng không được mặc định có quyền sử dụng dữ liệu vận
    hành cho mục đích thương mại.
-   Nhân viên hỗ trợ chỉ được thao tác trong phạm vi được cơ sở ủy quyền
    và phải lưu lịch sử thay đổi.

## 2.3 Vai trò MVP tối thiểu

-   Owner/Chủ cơ sở
-   Manager/Quản lý
-   Worker/Nhân viên sản xuất
-   InventoryFinance/Kho và chi phí
-   CooperativeManager/Quản lý HTX
-   ProfileEditor/Người biên tập hồ sơ
-   PlatformReviewer/Kiểm duyệt nội dung
-   PlatformAdmin/Quản trị nền tảng
-   PublicVisitor/Khách truy cập

Có thể gộp một số vai trò ở giao diện MVP, nhưng không được làm mất khả
năng giới hạn quyền theo tổ chức và loại dữ liệu.

------------------------------------------------------------------------

# 3. Nguyên tắc UX/UI bắt buộc

## 3.1 Nguyên tắc thiết kế

1.  **Tổ chức theo công việc của người dùng, không theo thuật ngữ phần
    mềm.**
2.  Một màn hình có một mục tiêu chính và một hành động chính nổi bật.
3.  Ưu tiên lựa chọn nhanh, dữ liệu điền sẵn và ghi nhớ lựa chọn gần
    nhất; giảm nhập văn bản tự do.
4.  Luôn hiển thị ngữ cảnh: cơ sở, khu trồng, cây/vụ đang được thao tác.
5.  Dùng từ ngữ phổ thông; thuật ngữ khó phải có giải thích ngắn.
6.  Biểu tượng luôn đi cùng nhãn chữ, không dùng icon đơn độc cho thao
    tác quan trọng.
7.  Trạng thái phải thể hiện bằng chữ và màu; không phụ thuộc riêng màu
    sắc.
8.  Mẫu biểu thay đổi theo loại công việc; không ép mọi loại công việc
    vào một biểu mẫu dài.
9.  Có xác nhận rõ khi lưu, khi đang offline, khi chờ đồng bộ hoặc khi
    xảy ra lỗi.
10. Không để người dùng mất dữ liệu đã nhập do điều hướng hoặc mất mạng.
11. Thiết kế mobile-first, nút đủ lớn, chữ dễ đọc, thao tác thuận tiện
    bằng một tay khi có thể.
12. Không tự ý thay đổi bố cục/luồng đã được chủ sản phẩm duyệt. Đề xuất
    thay đổi phải trình bày trước.

## 3.2 Điều hướng app đề xuất

Thanh điều hướng chính tối đa bốn mục: 1. **Trang chủ:** việc hôm nay,
tiến độ, cảnh báo, thao tác nhanh. 2. **Sản xuất:** khu trồng, cây, vụ,
giai đoạn, lịch và nhật ký. 3. **Vật tư & chi phí:** tồn kho, giao dịch,
khoản chi, thu hoạch và tổng kết. 4. **Cơ sở của tôi:** thông tin cơ sở,
thành viên, sản phẩm, hồ sơ thương mại và cài đặt.

Các chức năng nâng cao ít dùng đặt trong trang quản lý/cài đặt, không
làm trang chủ thành danh sách hàng chục module.

## 3.3 Màn hình Trang chủ

Cần có: - Tên cơ sở đang hoạt động và bộ chọn đổi cơ sở nếu người dùng
thuộc nhiều cơ sở. - Vụ/khu trồng gần đây hoặc đang theo dõi. - Danh
sách công việc hôm nay và trạng thái. - Nút "Ghi việc vừa làm". - Tóm
tắt cảnh báo hữu ích (ví dụ việc trễ, vật tư dưới ngưỡng nếu đã cấu
hình). - Lối tắt xem chi phí/tiến độ vụ. - Trạng thái kết nối/sync dễ
hiểu khi offline.

Không đưa các biểu đồ phức tạp lên màn hình đầu tiên nếu không giúp
quyết định hành động tiếp theo.

## 3.4 Luồng ghi công việc

Luồng chuẩn: 1. Người dùng bấm "Ghi việc vừa làm". 2. Chọn loại công
việc hoặc mẫu thường dùng. 3. Xác nhận cơ sở/khu trồng/vụ đã điền sẵn.
4. Nhập các trường bắt buộc tối thiểu phù hợp với loại công việc. 5. Có
thể thêm ảnh/ghi chú nếu cần. 6. Lưu và hiển thị xác nhận. 7. Nếu liên
quan vật tư, ghi giao dịch kho và chi phí liên quan theo quy tắc nhất
quán. 8. Cho phép xem/sửa bản ghi theo quyền; mọi sửa đổi quan trọng
được lưu lịch sử.

Mục tiêu thử nghiệm: nhật ký thông thường có thể ghi trong khoảng 10--20
giây sau khi dữ liệu nền đã được thiết lập. Đây là mục tiêu cần đo bằng
kiểm thử, không phải cam kết đã đạt.

## 3.5 Luồng tạo vụ trồng

1.  Chọn khu trồng.
2.  Chọn loại cây và giống (giống có thể chưa biết nếu phù hợp).
3.  Nhập ngày bắt đầu, diện tích/phạm vi áp dụng và thông tin bắt buộc.
4.  Chọn bộ cấu hình cây trồng/lịch mẫu nếu có.
5.  Xem lại và tạo vụ.
6.  App tạo trang tổng quan vụ, giai đoạn tham khảo và các thao tác gợi
    ý.
7.  Cho phép chỉnh sửa dữ liệu vụ theo quyền; giữ lịch sử thay đổi cần
    thiết.

Không được bắt buộc người dùng khai báo tất cả trường nâng cao mới có
thể tạo vụ. Các trường tùy chọn có thể bổ sung sau.

## 3.6 Luồng công khai hồ sơ thương mại

1.  Chủ cơ sở chọn "Tạo hồ sơ thương mại".
2.  Chọn tự nhập hoặc yêu cầu hỗ trợ.
3.  Nhập/kiểm tra thông tin cơ sở và sản phẩm.
4.  Xem trước trang công khai.
5.  Chọn chính xác các nhóm thông tin/ảnh/tài liệu muốn công khai và xác
    nhận.
6.  Gửi duyệt hoặc xuất bản theo chính sách đã cấu hình.
7.  Theo dõi trạng thái: Bản nháp → Thiếu thông tin/Chờ xác nhận → Chờ
    duyệt → Đã xuất bản; có thể Bị yêu cầu chỉnh sửa/Tạm ẩn/Ngừng công
    khai.
8.  Cơ sở có thể yêu cầu sửa, ẩn hoặc rút thông tin theo chính sách nền
    tảng.
9.  Mọi thay đổi về đồng ý công khai và trạng thái xuất bản phải có dấu
    thời gian, người thực hiện và nội dung liên quan.

Nhân viên hỗ trợ không được xác nhận thay cho cơ sở nếu chưa có ủy quyền
phù hợp. "Đã xuất bản" không đồng nghĩa "đã xác minh chất lượng".

------------------------------------------------------------------------

# 4. Quy trình nghiệp vụ chính

## 4.1 Quản lý cơ sở

-   Người dùng đăng ký tài khoản.
-   Tạo cơ sở hoặc chấp nhận lời mời vào cơ sở có sẵn.
-   Chủ cơ sở nhập thông tin cơ bản và thiết lập người dùng.
-   Mỗi dữ liệu nghiệp vụ được gắn với tổ chức sở hữu.
-   Khi một thành viên bị thu hồi quyền, quyền truy cập mới bị chặn;
    lịch sử thao tác đã thực hiện vẫn được giữ theo chính sách lưu trữ.

## 4.2 Quản lý cây trồng và vụ

-   Chủ/quản lý tạo khu trồng.
-   Chọn loại cây từ danh mục chung hoặc yêu cầu bổ sung loại cây mới.
-   Tạo vụ trồng tại một khu trồng.
-   Gắn bộ cấu hình cây trồng, nếu có.
-   Theo dõi giai đoạn, lịch công việc, nhật ký và thu hoạch.
-   Kết thúc vụ bằng thao tác xác nhận; báo cáo tổng kết sử dụng dữ liệu
    đã ghi và chỉ rõ dữ liệu còn thiếu.

Một khu trồng có thể có nhiều vụ theo thời gian. Hệ thống cần quy tắc
cảnh báo nếu có hai vụ trùng phạm vi/thời gian, nhưng không nên cấm
tuyệt đối trong trường hợp canh tác xen canh hoặc nhiều khu con.

## 4.3 Nhật ký sản xuất

-   Nhật ký phải gắn với tổ chức, khu trồng và vụ khi phù hợp.
-   Loại công việc quyết định trường dữ liệu cần ghi.
-   Lưu người tạo, thời gian thực hiện, thời gian ghi nhận và nguồn tạo
    (online/offline/import nếu có).
-   Sửa bản ghi phải ghi người sửa, thời điểm, giá trị trước/sau đối với
    dữ liệu quan trọng.
-   Bản ghi chưa đồng bộ phải có trạng thái riêng.
-   Không tự động xóa nhật ký chỉ vì người dùng kết thúc vụ.

## 4.4 Quản lý vật tư và kho

-   Mỗi vật tư có tên, nhóm, đơn vị cơ sở và các quy đổi được xác nhận.
-   Giao dịch gồm nhập, xuất dùng, điều chỉnh và các loại cần thiết
    khác.
-   Giao dịch có số lượng, ngày, kho, vật tư, nguồn phát sinh và người
    ghi.
-   Xuất dùng gắn với nhật ký/vụ khi có liên quan.
-   Nếu chưa biết giá vốn, không được tự tạo chi phí chính xác; hiển thị
    thiếu dữ liệu hoặc dùng mức giá tham khảo được gắn nhãn rõ.
-   Không sửa số dư kho trực tiếp mà bỏ qua giao dịch; mọi điều chỉnh
    phải có bản ghi và lý do.
-   Nếu phát hiện tồn âm, hiển thị cảnh báo và yêu cầu xử lý theo chính
    sách; không âm thầm sửa số liệu.

## 4.5 Chi phí và báo cáo

Các nhóm chi phí ban đầu: - Vật tư sử dụng. - Nhân công. - Điện/nước. -
Thuê đất/nhà màng nếu áp dụng. - Khấu hao hoặc chi phí phân bổ nếu người
dùng cấu hình. - Chi phí khác.

Báo cáo cần phân biệt: - Tiền thực chi. - Chi phí vật tư sử dụng trong
vụ. - Chi phí phân bổ/ước tính. - Doanh thu thực tế đã ghi nhận. - Sản
lượng thu hoạch và sản lượng bán được.

Chỉ tính giá thành/kg khi có đủ dữ liệu cần thiết. Báo cáo phải thể hiện
ngày cập nhật và thông báo dữ liệu thiếu. Không gọi số liệu là "lợi
nhuận chính xác" nếu chi phí hoặc doanh thu chưa đầy đủ.

## 4.6 Quản lý HTX

-   HTX tạo/quản lý thành viên hoặc gửi lời mời tham gia.
-   Thành viên chỉ chia sẻ dữ liệu trong phạm vi được quy định.
-   HTX xem danh sách hộ, khu trồng, vụ và tiến độ nhật ký theo quyền.
-   HTX có thể xem báo cáo tổng hợp; việc xem dữ liệu chi tiết từng hộ
    phải tuân theo quyền và thỏa thuận.
-   HTX có thể yêu cầu bổ sung/chỉnh sửa hồ sơ hoặc nhật ký.
-   Mọi hành động duyệt/đề nghị sửa phải có người thực hiện và trạng
    thái rõ ràng.

## 4.7 Website xúc tiến thương mại

-   Trang chủ giới thiệu nền tảng và điều hướng đến cơ sở/sản phẩm.
-   Danh bạ cơ sở có tìm kiếm/lọc cơ bản.
-   Trang hồ sơ cơ sở hiển thị nội dung đã được phép công khai.
-   Trang sản phẩm hiển thị ảnh, mô tả, quy cách, khu vực, trạng thái
    cung ứng và thông tin liên hệ.
-   Trạng thái cung ứng tối thiểu: Đang sản xuất, Dự kiến có hàng, Đang
    có hàng, Tạm hết hàng/Tạm ngừng. Trạng thái phải có ngày cập nhật;
    không mặc định "đang có hàng" từ dữ liệu dự kiến.
-   Người mua có thể liên hệ trực tiếp bằng thông tin cơ sở được công
    khai hoặc biểu mẫu liên hệ tùy chọn.
-   Không cần tài khoản người mua trong MVP nếu chỉ duyệt và liên hệ.
-   Nếu dùng biểu mẫu liên hệ, phải có biện pháp chống spam, thông báo
    quyền riêng tư và cách xử lý yêu cầu.
-   Website không hiển thị nhật ký, chi phí, tồn kho nội bộ, giá vốn,
    thông tin cá nhân riêng tư hoặc tài liệu chưa được công khai.

## 4.8 Dịch vụ hỗ trợ hồ sơ

-   Cơ sở gửi yêu cầu hỗ trợ.
-   Nền tảng ghi nhận trạng thái, phạm vi công việc và người phụ trách.
-   Nhân viên chỉ biên tập thông tin theo ủy quyền.
-   Cơ sở xem trước và xác nhận trước khi công khai.
-   Lưu lịch sử ai sửa gì, ai xác nhận và ai duyệt.
-   Có thể tính phí dịch vụ trong tương lai, nhưng giá và phạm vi phải
    minh bạch.

------------------------------------------------------------------------

# 5. Mô hình dữ liệu khái niệm

Đây là danh sách thực thể cốt lõi để định hướng database. Tên có thể
điều chỉnh theo chuẩn code, nhưng ý nghĩa và quan hệ nghiệp vụ phải được
giữ.

## 5.1 Tổ chức và người dùng

-   `User`: tài khoản người dùng.
-   `Organization`: cơ sở sản xuất, trang trại, HTX hoặc doanh nghiệp.
-   `OrganizationMembership`: liên kết User--Organization, vai trò,
    trạng thái và phạm vi quyền.
-   `Role` / `Permission`: vai trò và quyền.
-   `AuditEvent`: lịch sử hành động quan trọng.

## 5.2 Sản xuất

-   `CropType`: loại cây trồng.
-   `CropProfile`: cấu hình nghiệp vụ cho loại cây.
-   `CropVariety`: giống cây.
-   `ProductionArea`: khu trồng/lô/nhà màng.
-   `ProductionCycle`: vụ trồng.
-   `ProductionStage`: giai đoạn vụ.
-   `TaskTemplate`: mẫu công việc.
-   `ProductionTask`: công việc/lịch việc thực tế.
-   `ActivityLog`: nhật ký đã thực hiện.
-   `HarvestRecord`: bản ghi thu hoạch/phân loại/hao hụt.

## 5.3 Vật tư và chi phí

-   `Material`: vật tư.
-   `UnitOfMeasure`: đơn vị tính.
-   `UnitConversion`: quy đổi đơn vị đã được xác nhận.
-   `InventoryLocation`: kho.
-   `InventoryTransaction`: giao dịch kho.
-   `ExpenseRecord`: khoản chi.
-   `LaborRecord`: nhân công/công lao động.
-   `SalesRecord`: doanh thu/bán hàng ở mức ghi nhận cơ bản.

## 5.4 Thương mại

-   `BusinessProfile`: hồ sơ công khai của cơ sở.
-   `ProductListing`: nội dung giới thiệu sản phẩm.
-   `ProductImage`: ảnh sản phẩm/cơ sở.
-   `SupplyOffer`: tình trạng và năng lực cung ứng.
-   `CertificationRecord`: tài liệu/chứng nhận và trạng thái kiểm tra.
-   `PublicationConsent`: sự đồng ý công khai.
-   `PublicationReview`: quy trình duyệt nội dung.
-   `ProfileServiceRequest`: yêu cầu hỗ trợ hoàn thiện hồ sơ.
-   `ContactInquiry`: yêu cầu liên hệ từ người mua.

## 5.5 Quan hệ nghiệp vụ cốt lõi

-   User có thể thuộc nhiều Organization thông qua
    OrganizationMembership.
-   Organization sở hữu ProductionArea, InventoryLocation, Material và
    dữ liệu vận hành liên quan.
-   ProductionArea có nhiều ProductionCycle theo thời gian.
-   ProductionCycle liên kết CropType/CropVariety và có ActivityLog,
    ProductionTask, HarvestRecord, ExpenseRecord.
-   ActivityLog có thể phát sinh InventoryTransaction.
-   Organization có một BusinessProfile công khai nếu cơ sở chọn sử dụng
    tính năng.
-   BusinessProfile có nhiều ProductListing.
-   ProductListing có nhiều ProductImage và có thể có nhiều SupplyOffer
    theo thời điểm.
-   Việc công khai phải có PublicationConsent và trạng thái
    PublicationReview phù hợp.

## 5.6 Quy tắc database

-   Các bảng nghiệp vụ phải có ID ổn định, `created_at`, `updated_at` và
    trường người tạo/người sửa khi phù hợp.
-   Dữ liệu thuộc tổ chức phải có `organization_id` hoặc đường liên kết
    kiểm soát được đến tổ chức.
-   Lưu thời điểm theo quy tắc timezone nhất quán; giao diện hiển thị
    giờ địa phương phù hợp.
-   Dùng trạng thái thay vì xóa cứng dữ liệu quan trọng khi cần giữ lịch
    sử.
-   Ảnh/tệp lưu ở object storage hoặc dịch vụ tương đương; database lưu
    metadata và quyền truy cập.
-   Dữ liệu public chỉ được lấy qua API/view dành cho public, không trả
    trực tiếp bản ghi nội bộ rồi ẩn ở frontend.
-   Phải có migration database, kiểm tra ràng buộc và cơ chế sao
    lưu/phục hồi.

------------------------------------------------------------------------

# 6. Yêu cầu chức năng (Functional Requirements)

Mã yêu cầu dùng để truy vết giữa đặc tả, code và test.

## 6.1 Tài khoản và cơ sở

-   `FR-ORG-001` MUST: Người dùng đăng ký/đăng nhập và khôi phục tài
    khoản.
-   `FR-ORG-002` MUST: Người dùng tạo cơ sở hoặc tham gia cơ sở theo lời
    mời/quy trình được phép.
-   `FR-ORG-003` MUST: Một User có thể thuộc nhiều Organization.
-   `FR-ORG-004` MUST: Chủ cơ sở có thể mời, thu hồi hoặc thay đổi vai
    trò thành viên.
-   `FR-ORG-005` MUST: API kiểm tra quyền theo tổ chức và phạm vi dữ
    liệu.
-   `FR-ORG-006` SHOULD: Người dùng chuyển cơ sở đang làm việc từ giao
    diện rõ ràng.

## 6.2 Cây trồng và vụ

-   `FR-CROP-001` MUST: Có danh mục cây trồng có thể mở rộng.
-   `FR-CROP-002` MUST: Có bộ cấu hình CropProfile cho trường/giai
    đoạn/công việc.
-   `FR-CROP-003` MUST: Người dùng tạo khu trồng.
-   `FR-CROP-004` MUST: Người dùng tạo vụ trồng gắn khu trồng và loại
    cây.
-   `FR-CROP-005` MUST: Có trạng thái vụ: Chuẩn bị, Đang sản xuất, Tạm
    dừng (nếu cần), Đã kết thúc, Đã hủy.
-   `FR-CROP-006` SHOULD: Có mẫu giai đoạn/lịch chăm sóc tham khảo có
    thể sửa.
-   `FR-CROP-007` MUST: Sửa CropProfile không làm thay đổi dữ liệu lịch
    sử ngoài ý muốn.

## 6.3 Nhật ký và công việc

-   `FR-LOG-001` MUST: Người dùng ghi nhật ký theo loại công việc.
-   `FR-LOG-002` MUST: Trường biểu mẫu thay đổi theo loại công việc.
-   `FR-LOG-003` MUST: Nhật ký lưu người tạo, thời điểm thực hiện, thời
    điểm ghi và liên kết nghiệp vụ.
-   `FR-LOG-004` MUST: Có xem lịch sử và lọc theo khu trồng/vụ/ngày/loại
    công việc.
-   `FR-LOG-005` MUST: Sửa bản ghi theo quyền và lưu audit trail cho
    thay đổi quan trọng.
-   `FR-LOG-006` SHOULD: Có mẫu công việc thường dùng và lựa chọn gần
    nhất.
-   `FR-LOG-007` LATER: Nhập nhật ký bằng giọng nói/AI, chỉ sau khi kiểm
    chứng nhu cầu và độ chính xác.

## 6.4 Kho và chi phí

-   `FR-INV-001` MUST: Quản lý danh mục vật tư và đơn vị.
-   `FR-INV-002` MUST: Ghi nhận nhập/xuất/điều chỉnh kho bằng giao dịch.
-   `FR-INV-003` MUST: Có thể liên kết vật tư sử dụng với nhật ký và vụ.
-   `FR-INV-004` MUST: Không thay đổi tồn kho bằng cách ghi đè số dư mà
    không có giao dịch.
-   `FR-INV-005` MUST: Ghi chi phí cơ bản theo ngày, nhóm, số tiền và vụ
    nếu phù hợp.
-   `FR-INV-006` MUST: Báo cáo thể hiện khi thiếu dữ liệu giá vốn/chi
    phí.
-   `FR-INV-007` MUST: Hỗ trợ tổng hợp sản lượng và phân loại thu hoạch.
-   `FR-INV-008` SHOULD: Có xuất báo cáo CSV/XLSX/PDF tùy năng lực kỹ
    thuật được thống nhất.

## 6.5 HTX và báo cáo

-   `FR-COOP-001` MUST: Quản lý danh sách thành viên trong phạm vi được
    phép.
-   `FR-COOP-002` MUST: Tổng hợp tiến độ nhật ký và vụ trồng theo quyền.
-   `FR-COOP-003` MUST: Báo cáo tổng hợp chi phí/sản lượng theo các
    chiều được hỗ trợ.
-   `FR-COOP-004` MUST: Không mặc định cho HTX xem mọi dữ liệu cá nhân
    của thành viên nếu chưa được cấp quyền.
-   `FR-COOP-005` SHOULD: Xuất báo cáo phục vụ quản lý.

## 6.6 Website và hồ sơ thương mại

-   `FR-WEB-001` MUST: Có trang chủ, danh bạ cơ sở, danh mục sản phẩm và
    trang chi tiết.
-   `FR-WEB-002` MUST: Tìm kiếm/lọc cơ bản theo loại sản phẩm và khu
    vực.
-   `FR-WEB-003` MUST: Cơ sở có thể tự tạo/chỉnh sửa bản nháp hồ sơ.
-   `FR-WEB-004` MUST: Cơ sở có thể yêu cầu dịch vụ hỗ trợ hồ sơ.
-   `FR-WEB-005` MUST: Có xem trước và xác nhận trước khi công khai.
-   `FR-WEB-006` MUST: Có trạng thái duyệt/xuất bản/tạm ẩn.
-   `FR-WEB-007` MUST: Chỉ dữ liệu được phép công khai mới được trả ra
    website.
-   `FR-WEB-008` MUST: Người mua có thể liên hệ trực tiếp với cơ sở bằng
    thông tin đã được công khai.
-   `FR-WEB-009` SHOULD: Có biểu mẫu ContactInquiry với chống spam và
    thông báo quyền riêng tư.
-   `FR-WEB-010` MUST: Trạng thái cung ứng có ngày cập nhật và không tự
    suy ra hàng có sẵn từ dự báo.
-   `FR-WEB-011` MUST: Chứng nhận phải phân biệt tự khai báo, tài liệu
    đã kiểm tra và xác minh thực tế.
-   `FR-WEB-012` MUST: Cơ sở có thể yêu cầu sửa, tạm ẩn hoặc ngừng công
    khai theo chính sách.
-   `FR-WEB-013` MUST: Không hiển thị dữ liệu nhật ký, chi phí, giá vốn,
    tồn kho nội bộ trên trang public.

## 6.7 Offline và đồng bộ

-   `FR-SYNC-001` MUST: App cho phép tạo/lưu các bản ghi đã được xác
    định hỗ trợ offline.
-   `FR-SYNC-002` MUST: Bản ghi offline có ID ổn định và trạng thái đồng
    bộ.
-   `FR-SYNC-003` MUST: Có hàng đợi đồng bộ và thử lại khi kết nối trở
    lại.
-   `FR-SYNC-004` MUST: Có quy tắc xử lý xung đột, không âm thầm ghi đè
    dữ liệu quan trọng.
-   `FR-SYNC-005` MUST: Người dùng nhìn thấy bản ghi nào đang chờ đồng
    bộ hoặc bị lỗi.
-   `FR-SYNC-006` MUST: Không báo "đã đồng bộ" khi máy chủ chưa xác
    nhận.
-   `FR-SYNC-007` SHOULD: Có thao tác thử đồng bộ lại và hướng dẫn xử lý
    lỗi đơn giản.

------------------------------------------------------------------------

# 7. Yêu cầu phi chức năng (Non-Functional Requirements)

## 7.1 Hiệu năng

-   `NFR-PERF-001` SHOULD: Các màn hình chính tải nhanh trên thiết bị
    phổ thông và mạng di động không ổn định.
-   `NFR-PERF-002` SHOULD: Các thao tác lưu có phản hồi rõ ràng ngay;
    khi lưu offline phải thể hiện đúng trạng thái.
-   `NFR-PERF-003` SHOULD: Danh sách lớn dùng phân trang/tải theo nhu
    cầu.
-   Chỉ chốt con số hiệu năng sau khi thống nhất hạ tầng, thiết bị mục
    tiêu và kịch bản tải.

## 7.2 Bảo mật và riêng tư

-   `NFR-SEC-001` MUST: Xác thực và kiểm tra quyền ở backend.
-   `NFR-SEC-002` MUST: Phân tách dữ liệu theo Organization.
-   `NFR-SEC-003` MUST: Không đưa khóa bí mật/API key vào mã frontend.
-   `NFR-SEC-004` MUST: Có sao lưu, kế hoạch phục hồi và kiểm thử phục
    hồi.
-   `NFR-SEC-005` MUST: Ghi audit trail cho các thay đổi quan trọng và
    công khai nội dung.
-   `NFR-SEC-006` MUST: Có quy trình rút lại/điều chỉnh quyền công khai.
-   `NFR-SEC-007` MUST: Giới hạn truy cập của nhân viên hỗ trợ và quản
    trị theo nhu cầu công việc.
-   `NFR-SEC-008` MUST: Có thông báo quyền riêng tư, điều khoản sử dụng
    và chính sách lưu trữ/xóa dữ liệu phù hợp trước khi vận hành công
    khai.

## 7.3 Khả năng sử dụng

-   `NFR-UX-001` MUST: Thiết kế mobile-first.
-   `NFR-UX-002` MUST: Chữ, trạng thái, thông báo và thao tác quan trọng
    dễ đọc, dễ hiểu.
-   `NFR-UX-003` MUST: Thực hiện usability testing với người dùng thật
    trước khi phát hành MVP.
-   `NFR-UX-004` SHOULD: Mục tiêu ghi nhật ký thông thường 10--20 giây
    sau khi thiết lập dữ liệu nền.
-   `NFR-UX-005` MUST: Không dùng màu sắc đơn lẻ để biểu thị trạng thái;
    cần nhãn chữ/biểu tượng.
-   `NFR-UX-006` MUST: Lỗi phải giải thích người dùng có thể làm gì tiếp
    theo.

## 7.4 Khả năng bảo trì và mở rộng

-   `NFR-MAINT-001` MUST: Có tài liệu cấu trúc code, môi trường và cách
    triển khai.
-   `NFR-MAINT-002` MUST: Database schema được quản lý bằng migration.
-   `NFR-MAINT-003` MUST: Có môi trường development/staging/production
    tách biệt phù hợp.
-   `NFR-MAINT-004` SHOULD: Có kiểm thử tự động cho nghiệp vụ quan
    trọng.
-   `NFR-MAINT-005` MUST: Có logging/monitoring đủ để phát hiện lỗi đồng
    bộ, quyền truy cập và xuất bản.

------------------------------------------------------------------------

# 8. Quy tắc offline và đồng bộ --- yêu cầu kiến trúc

Offline là yêu cầu MVP, vì vậy không thể để đến cuối mới thêm.

## 8.1 Dữ liệu được phép tạo offline

Tối thiểu cần xác định hỗ trợ offline cho: - Xem danh sách khu trồng/vụ
đã tải xuống gần đây. - Tạo nhật ký công việc đã hỗ trợ offline. - Ghi
thông tin công việc và vật tư sử dụng theo danh mục đã lưu trên thiết
bị. - Xem các bản ghi đã được tải về trước đó. - Lưu bản nháp hồ sơ hoặc
sản phẩm nếu được thiết kế hỗ trợ.

Không hứa hẹn mọi chức năng đều hoạt động offline. Các thao tác cần dữ
liệu thời gian thực hoặc kiểm duyệt máy chủ phải báo rõ khi cần kết nối.

## 8.2 Trạng thái đồng bộ

-   **Chỉ lưu trên thiết bị:** dữ liệu chưa được gửi lên máy chủ.
-   **Đang đồng bộ:** đang gửi hoặc xử lý.
-   **Đã đồng bộ:** máy chủ xác nhận thành công.
-   **Cần xử lý:** có lỗi hoặc xung đột cần người dùng/quản lý giải
    quyết.

## 8.3 Quy tắc xung đột

-   Mỗi bản ghi có ID ổn định, phiên bản hoặc thời điểm cập nhật và
    thông tin người sửa.
-   Không dùng quy tắc "bản ghi đến sau luôn thắng" cho mọi loại dữ
    liệu.
-   Nếu hai người sửa cùng một bản ghi quan trọng, phát hiện xung đột và
    đưa ra cách giải quyết.
-   Các giao dịch kho phải tránh tạo trùng khi đồng bộ lại; cần
    idempotency key hoặc cơ chế tương đương.
-   Người dùng phải biết bản ghi đã được đồng bộ hay chưa.

------------------------------------------------------------------------

# 9. Website: nội dung công khai và xác minh

## 9.1 Trường thông tin có thể công khai

-   Tên và mô tả cơ sở.
-   Khu vực/địa chỉ theo mức công khai do cơ sở chọn.
-   Ảnh cơ sở/sản phẩm đã được cho phép.
-   Loại cây, nhóm sản phẩm, quy cách và mô tả.
-   Mùa vụ/thời gian dự kiến có hàng.
-   Năng lực cung ứng do cơ sở khai báo, kèm ngày cập nhật.
-   Thông tin liên hệ đã được cơ sở xác nhận.
-   Chứng nhận/tài liệu với trạng thái kiểm tra rõ ràng.

## 9.2 Dữ liệu không tự động công khai

-   Nhật ký sản xuất chi tiết.
-   Chi phí, giá vốn, lợi nhuận và doanh thu nội bộ.
-   Tồn kho vật tư, nhà cung cấp và dữ liệu mua hàng.
-   Thông tin cá nhân của nhân viên.
-   Tọa độ chính xác/vị trí nhạy cảm nếu cơ sở không muốn công khai.
-   Ảnh/tài liệu chưa được cơ sở cho phép.
-   Dữ liệu của thành viên HTX chưa có quyền chia sẻ phù hợp.

## 9.3 Trạng thái chứng nhận

Mỗi chứng nhận/tài liệu phải thể hiện đúng một trong các trạng thái, ví
dụ: - Cơ sở tự khai báo. - Đã nhận tài liệu. - Đã kiểm tra tài liệu. -
Đã xác minh theo quy trình cụ thể. - Hết hiệu lực/chờ cập nhật/không xác
minh được.

Không dùng nhãn "được chứng nhận", "đã xác minh" hoặc tương tự nếu chưa
có bằng chứng và quy trình phù hợp.

## 9.4 Trạng thái sản phẩm/cung ứng

-   Đang sản xuất.
-   Dự kiến có hàng.
-   Đang có hàng (cơ sở xác nhận).
-   Tạm hết hàng.
-   Tạm ngừng cung ứng.

Mỗi trạng thái cần ngày cập nhật. Trong MVP, cập nhật có thể thủ công.
Tích hợp với dữ liệu thu hoạch ở giai đoạn sau và vẫn cần xác nhận trước
khi công khai lượng hàng có sẵn.

------------------------------------------------------------------------

# 10. Báo cáo và chỉ số thành công

## 10.1 Báo cáo vận hành MVP

-   Nhật ký theo ngày/khu trồng/vụ/loại công việc.
-   Vật tư nhập, xuất, tồn và điều chỉnh.
-   Chi phí theo nhóm và vụ.
-   Sản lượng thu hoạch/phân loại/hao hụt.
-   Tổng hợp vụ: chi phí đã ghi, sản lượng, doanh thu nếu có và các
    trường dữ liệu còn thiếu.
-   Dashboard HTX: số hộ/vụ, tình trạng ghi nhật ký và báo cáo tổng hợp
    theo quyền.

## 10.2 Chỉ số UX

-   Tỷ lệ người mới hoàn thành các tác vụ chính không cần trợ giúp.
-   Thời gian trung vị ghi nhật ký.
-   Số lỗi/nhầm lẫn trong các tác vụ kiểm thử.
-   Số lần cần người hỗ trợ để hoàn thành quy trình.
-   Tỷ lệ người dùng quay lại sử dụng hàng tuần.

## 10.3 Chỉ số vận hành

-   Tỷ lệ nhật ký được ghi đều trong vụ.
-   Tỷ lệ bản ghi đồng bộ thành công.
-   Tỷ lệ dữ liệu phải nhập lại/sửa do lỗi.
-   Thời gian tổng hợp báo cáo so với quy trình cũ.
-   Số vụ có dữ liệu đủ để tổng kết.

## 10.4 Chỉ số website

-   Số hồ sơ cơ sở hoàn chỉnh và đã xuất bản.
-   Số sản phẩm có thông tin, ảnh và trạng thái cung ứng được cập nhật.
-   Lượt xem trang cơ sở/sản phẩm.
-   Số liên hệ/yêu cầu mua hàng thực.
-   Tỷ lệ cơ sở phản hồi liên hệ nếu có cơ chế đo phù hợp.
-   Tỷ lệ hồ sơ được cập nhật theo chu kỳ.

Không sử dụng số lượt xem đơn thuần để khẳng định hiệu quả thương mại.
Phải theo dõi các hành động có ý nghĩa như liên hệ thực tế và phản hồi
của cơ sở.

------------------------------------------------------------------------

# 11. Kế hoạch kiểm thử và tiêu chí nghiệm thu

## 11.1 Kiểm thử UX thực địa

Tối thiểu thử với: - Người trực tiếp trồng trọt có mức độ quen công nghệ
khác nhau. - Chủ trang trại/quản lý. - Người phụ trách kho/chi phí. -
Quản lý HTX. - Người tạo hồ sơ thương mại.

Nhiệm vụ thử: 1. Tạo khu trồng và vụ mới. 2. Ghi một lần tưới hoặc bón
phân. 3. Ghi vật tư sử dụng và kiểm tra tồn kho. 4. Tìm nhật ký đã ghi.
5. Xem tổng chi phí và sản lượng của vụ. 6. Tạo hồ sơ sản phẩm, xem
trước và xác nhận công khai. 7. Mô phỏng mất mạng, ghi nhật ký, kết nối
lại và kiểm tra đồng bộ. 8. Đăng nhập bằng tài khoản khác để kiểm tra
quyền dữ liệu.

Người kiểm thử quan sát nhiệm vụ, không chỉ hỏi người dùng "có dễ dùng
không". Ghi lại nơi họ dừng, nhầm, bấm sai hoặc cần trợ giúp.

## 11.2 Tiêu chí phát hành MVP

-   Các luồng nghiệp vụ quan trọng chạy được từ đầu đến cuối.
-   Không có lỗi phân quyền nghiêm trọng.
-   Không công khai dữ liệu riêng tư ngoài ý muốn.
-   Đồng bộ offline không tạo bản ghi/giao dịch trùng trong các kịch bản
    kiểm thử đã xác định.
-   Có thể khôi phục dữ liệu từ bản sao lưu theo quy trình kiểm thử.
-   Người dùng thử nghiệm hoàn thành các tác vụ chính theo ngưỡng thống
    nhất sau khi có kết quả baseline.
-   Các lỗi đã biết, giới hạn offline và điều kiện sử dụng được ghi rõ.

------------------------------------------------------------------------

# 12. Lộ trình triển khai đề xuất

Thời gian dưới đây chỉ là ước lượng để lập kế hoạch; cần điều chỉnh theo
đội ngũ và kết quả prototype.

## Giai đoạn 0 --- Khảo sát và prototype

-   Quan sát quy trình thực tế tại các cơ sở.
-   Chọn các loại cây đại diện cho những mô hình sản xuất khác nhau.
-   Chuẩn hóa thuật ngữ và danh mục.
-   Vẽ sơ đồ quy trình.
-   Dựng prototype cho ba luồng ưu tiên: ghi nhật ký, xem hiệu quả vụ,
    tạo hồ sơ thương mại.
-   Kiểm thử prototype trước khi phát triển.

**Cổng quyết định:** người dùng mục tiêu hiểu và hoàn thành được các
luồng cơ bản trong prototype; các vấn đề lớn về nghiệp vụ được giải
quyết.

## Giai đoạn 1 --- Lõi sản xuất

-   Tài khoản, cơ sở, thành viên.
-   Khu trồng, cây trồng, vụ trồng và nhật ký.
-   Vật tư, kho, chi phí và thu hoạch.
-   Trang chủ, lịch và báo cáo cơ bản.

## Giai đoạn 2 --- Offline và HTX

-   Lưu cục bộ, hàng đợi đồng bộ, xử lý xung đột.
-   Phân quyền theo thành viên.
-   Dashboard và báo cáo HTX.
-   Kiểm thử mất mạng, khôi phục và đồng bộ.

## Giai đoạn 3 --- Website thương mại

-   Danh bạ, hồ sơ cơ sở, sản phẩm và tìm kiếm.
-   Tự đăng và yêu cầu hỗ trợ.
-   Quy trình xác nhận/duyệt/xuất bản.
-   Liên hệ trực tiếp.
-   Kiểm thử riêng tư và chống spam.

## Giai đoạn 4 --- Pilot

-   Triển khai tại các cơ sở đồng ý thử nghiệm.
-   Đo UX, mức độ sử dụng, chất lượng dữ liệu và hiệu quả báo cáo.
-   Đo số hồ sơ và liên hệ thương mại.
-   Sửa các vấn đề gây khó trước khi mở rộng.

------------------------------------------------------------------------

# 13. Những việc chưa được tự quyết khi AI/đội phát triển triển khai

Nếu chưa có quyết định của chủ sản phẩm, không tự ý: - Đổi bốn mục điều
hướng chính hoặc biến trang chủ thành dashboard phức tạp. - Bỏ hỗ trợ
offline khỏi MVP. - Gộp dữ liệu công khai và dữ liệu vận hành thành một
phạm vi truy cập. - Tự công khai hồ sơ khi chưa có sự xác nhận cần
thiết. - Xây thanh toán/giỏ hàng/sàn giao dịch trong MVP. - Xây AI chẩn
đoán bệnh hoặc đưa ra liều lượng kỹ thuật như thể đã được kiểm chứng. -
Khẳng định mọi loại cây đều có quy trình kỹ thuật hoàn chỉnh. - Dùng số
liệu mẫu trong demo như dữ liệu thực. - Tự thay đổi công thức tính chi
phí/lợi nhuận mà không ghi rõ giả định. - Bỏ lịch sử chỉnh sửa giao dịch
kho và nhật ký quan trọng. - Đổi công nghệ, backend hoặc kiến trúc theo
cách ảnh hưởng lớn đến chi phí/vận hành mà không trình bày lý do và
phương án.

AI/đội phát triển có thể đề xuất cải tiến. Mỗi đề xuất phải gồm: vấn đề,
lý do, phương án, ảnh hưởng đến chi phí/thời gian/dữ liệu/UX và quyết
định cần chủ sản phẩm đưa ra.

------------------------------------------------------------------------

# 14. Các câu hỏi cần xác nhận trước khi chốt SRS kỹ thuật

Tài liệu đã đủ làm chuẩn định hướng nghiệp vụ và thiết kế ban đầu, nhưng
các nội dung sau cần xác nhận trước khi chốt công nghệ và ước lượng
triển khai: 1. App là PWA/web app, ứng dụng di động đa nền tảng hay kết
hợp? Cần xác định sau khi đánh giá mức độ offline, camera, thông báo và
thiết bị mục tiêu. 2. Nhóm thiết bị Android/iOS, phiên bản tối thiểu và
trình duyệt hỗ trợ. 3. Backend, cơ sở dữ liệu, lưu trữ ảnh, đăng nhập và
hạ tầng triển khai. 4. Phạm vi offline cụ thể cho từng màn hình và cách
xử lý xung đột. 5. Danh sách cây trồng đại diện, trường dữ liệu và bộ
mẫu ban đầu. 6. Quy tắc giá vốn vật tư, đơn vị quy đổi, chi phí phân bổ
và báo cáo tài chính vụ. 7. Cách HTX được phép xem dữ liệu của hộ thành
viên. 8. Chính sách xác minh cơ sở/chứng nhận và quy trình kiểm duyệt
nội dung. 9. Chính sách quyền riêng tư, lưu trữ, xuất dữ liệu và xóa tài
khoản. 10. Mô hình thu phí, giới hạn gói miễn phí và chi phí dịch vụ hỗ
trợ hồ sơ.

Không nên tự suy đoán các quyết định này trong code. Có thể dùng giả
định có nhãn rõ để tạo prototype, nhưng phải ghi nhận trước khi phát
hành.

------------------------------------------------------------------------

# 15. Tóm tắt quyết định sản phẩm

-   **Phạm vi cây trồng:** hỗ trợ nhiều loại cây ngay từ MVP bằng lõi
    chung và cấu hình; chỉ xây sâu bộ mẫu cho các loại đã khảo sát.
-   **Trải nghiệm:** trực quan, theo công việc và chu trình, ít nhập
    liệu, mobile-first.
-   **Khách hàng vận hành:** nông hộ, trang trại, HTX.
-   **Website:** giới thiệu cơ sở và sản phẩm, tìm kiếm và liên hệ trực
    tiếp.
-   **Hồ sơ:** hỗ trợ cả tự đăng và dịch vụ hỗ trợ hoàn thiện; cơ sở có
    quyền xác nhận công khai.
-   **Dữ liệu:** dùng chung nền tảng nhưng tách rõ dữ liệu nội bộ và dữ
    liệu công khai.
-   **Offline:** là yêu cầu MVP, có trạng thái đồng bộ và xử lý xung
    đột.
-   **MVP:** tài khoản/cơ sở, cây/vụ, nhật ký, kho/chi phí/thu hoạch,
    báo cáo HTX, hồ sơ thương mại và website.
-   **Chưa làm:** sàn giao dịch hoàn chỉnh, thanh toán, IoT, AI kỹ thuật
    và ERP đầy đủ.
-   **Cách phát triển:** prototype và kiểm thử thực địa trước, triển
    khai theo giai đoạn, nghiệm thu theo tác vụ thật.

**Chỉ dẫn cuối cho AI/đội phát triển:** Trước khi viết code, hãy chuyển
tài liệu này thành backlog có mã yêu cầu, sơ đồ màn hình, luồng người
dùng, ERD chi tiết, hợp đồng API và bộ test. Nếu có điểm chưa rõ, lập
danh sách câu hỏi/giả định để chủ sản phẩm duyệt; không tự lấp khoảng
trống bằng các quyết định ảnh hưởng lớn đến UX, quyền riêng tư, dữ liệu
hoặc phạm vi MVP.


------------------------------------------------------------------------

# 16. Phân hệ chấm công và tính tiền công/lương người lao động — BỔ SUNG v1.1

> Phần này là phần bổ sung cho v1.0 theo quyết định của chủ sản phẩm. Giữ nguyên toàn bộ nội dung đã duyệt ở các phần trước. Nếu có khác biệt, các lựa chọn được nêu rõ trong phần này là quyết định mới cho phân hệ chấm công và tính lương; không được dùng phần này để tự ý thay đổi các phân hệ khác.

## 16.1 Mục tiêu và quyết định đã chốt

Mục tiêu là giúp nông hộ, trang trại và HTX ghi nhận công lao động đơn giản, kiểm tra được và tổng hợp nhanh vào cuối kỳ trả công. Phân hệ cần phục vụ cả lao động thường xuyên lẫn lao động thời vụ, làm theo ngày, theo giờ và theo sản lượng/công việc.

Các quyết định sản phẩm đã xác nhận:

- **Cách chấm công chính:** người lao động tự chấm bằng điện thoại, lưu thời gian và kiểm tra vị trí GPS tại thời điểm chấm; tổ trưởng có thể chấm hộ/ghi nhận cho người không có smartphone hoặc khi người lao động không thể tự chấm.
- **Cách tính công:** hỗ trợ đồng thời theo ngày công, theo giờ và theo sản lượng/công việc.
- **Thiết bị:** hỗ trợ mô hình hỗn hợp, gồm người có smartphone riêng và người không có smartphone hoặc dùng thiết bị chung của tổ trưởng.
- **Offline:** phải phù hợp với nguyên tắc offline-first của AgriConnect. Khi mất Internet, lưu bản ghi chờ đồng bộ và hiển thị trạng thái rõ ràng; không tạo bản ghi trùng khi đồng bộ lại.
- **Khuôn mặt/nhận diện sinh trắc học:** không bắt buộc trong MVP và không được tự triển khai nếu chưa có quyết định riêng của chủ sản phẩm.
- **Phạm vi MVP:** ghi nhận giờ vào/ra, xác nhận công theo tổ, quản lý quy tắc tiền công, xác nhận sản lượng, tổng hợp bảng công và bảng tiền công/lương dự kiến, duyệt và khóa kỳ, xuất bảng tổng hợp.

## 16.2 Phạm vi và nguyên tắc thiết kế

1. Đây là phân hệ quản lý công và tính toán khoản phải trả theo quy tắc do cơ sở cấu hình; không mặc định thay thế phần mềm kế toán hoặc hệ thống tính lương tuân thủ mọi trường hợp pháp lý.
2. Dùng ngôn ngữ dễ hiểu: “Bắt đầu làm”, “Kết thúc làm”, “Công hôm nay”, “Chờ xác nhận”, “Bảng tiền công”. Có thể dùng thuật ngữ “bảng lương” khi cơ sở chọn mô hình lao động phù hợp.
3. Không yêu cầu người lao động nhập nhiều trường. Thao tác chính cần hướng tới: mở app → bấm bắt đầu/kết thúc → thấy kết quả và trạng thái.
4. Không theo dõi GPS liên tục. Chỉ lấy vị trí tại thời điểm chấm công, trừ khi chủ sản phẩm phê duyệt một nhu cầu khác sau này.
5. GPS là tín hiệu hỗ trợ xác minh, không phải bằng chứng tuyệt đối. Tín hiệu sai, thiếu hoặc bị từ chối quyền vị trí không được tự động kết luận người lao động gian lận.
6. Mọi bản ghi do tổ trưởng tạo thay người khác phải được đánh dấu rõ người tạo, người được chấm, thời điểm ghi, lý do nếu là ngoại lệ và trạng thái xác nhận/duyệt.
7. Không tự động trừ lương/phạt do đi muộn, thiếu giờ, sai GPS hoặc thiếu lượt chấm nếu quy tắc chưa được cơ sở thiết lập và xác nhận; các khoản điều chỉnh phải có lý do và dấu vết kiểm toán.
8. Tính tiền công dự kiến phải minh bạch, cho phép xem cách tính theo từng dòng; thay đổi đơn giá hoặc quy tắc không được âm thầm sửa lại kỳ đã khóa.

## 16.3 Vai trò và quyền hạn

- **Người lao động:** xem thông tin của bản thân; tự chấm vào/ra nếu được cấp tài khoản và thiết bị; xem lịch sử công, sản lượng được ghi nhận và bảng tiền công của mình theo quyền được cấp; gửi yêu cầu sửa công.
- **Tổ trưởng:** xem danh sách tổ/phân công được giao; ghi nhận công cho thành viên trong phạm vi được phân quyền; xác nhận giờ làm/sản lượng; giải thích ngoại lệ. Không được tự duyệt điều chỉnh tiền công của chính mình nếu cơ sở yêu cầu tách nhiệm vụ.
- **Chủ cơ sở/quản lý được ủy quyền:** cấu hình ca/khu vực/đơn giá, quản lý người lao động, duyệt ngoại lệ, xem báo cáo, lập và duyệt bảng tiền công, khóa kỳ.
- **Quản trị hệ thống:** hỗ trợ kỹ thuật theo quyền tối thiểu; không mặc nhiên có quyền xem toàn bộ dữ liệu tiền công riêng tư của mọi cơ sở.

Phân quyền phải giới hạn theo cơ sở/HTX và tổ được giao. Thành viên HTX không được xem tiền công của hộ/cơ sở khác nếu chưa được cấp quyền hợp lệ.

## 16.4 Luồng chấm công bằng GPS tự chấm

### 16.4.1 Thiết lập ban đầu

Quản lý thiết lập:

- Danh sách người lao động và trạng thái làm việc.
- Khu vực/địa điểm làm việc được phép chấm công; lưu tọa độ và bán kính chấp nhận do cơ sở cấu hình sau khi thử nghiệm thực địa.
- Ca làm hoặc khung giờ dự kiến nếu cơ sở có áp dụng. Cho phép mô hình không có ca cố định.
- Quy tắc nghỉ giữa ca, làm thêm giờ và làm qua ngày nếu có. Không áp đặt giá trị mặc định cứng cho mọi nông hộ.
- Đơn giá theo ngày, giờ, sản lượng hoặc công việc; đơn vị tính và ngày hiệu lực.

### 16.4.2 Bắt đầu làm

1. Người lao động mở màn hình “Chấm công hôm nay”.
2. App hiển thị ngày, giờ thiết bị, trạng thái mạng và nút chính “Bắt đầu làm”.
3. Khi bấm, app xin/đọc vị trí tại thời điểm đó nếu người dùng đã cấp quyền; ghi thời điểm, kết quả GPS, độ chính xác do thiết bị báo, khu vực gần nhất và trạng thái online/offline.
4. App kiểm tra bản ghi hiện có để tránh bắt đầu ca thứ hai khi ca trước chưa kết thúc. Nếu có bản ghi mở, hướng dẫn xử lý thay vì tạo thêm.
5. Hiển thị kết quả dễ hiểu: “Đã ghi nhận”, “Đang chờ đồng bộ”, hoặc “Cần tổ trưởng xác nhận”.

### 16.4.3 Kết thúc làm

1. Người lao động bấm “Kết thúc làm”.
2. App ghi thời điểm kết thúc và lấy vị trí tại thời điểm đó nếu được phép.
3. App hiển thị tổng thời gian tạm tính và yêu cầu bổ sung lý do nếu thiếu lượt vào/ra, ngoài khu vực cho phép hoặc có bất thường theo quy tắc cơ sở.
4. Thời gian nghỉ không tự suy diễn. Nếu có giờ nghỉ cố định, hệ thống áp dụng theo cấu hình đã công bố; nếu không, người dùng/tổ trưởng ghi nhận theo quy trình cơ sở.

### 16.4.4 Xác minh GPS và ngoại lệ

- Bán kính GPS, ngưỡng độ chính xác và quy tắc xử lý phải cấu hình được; cần thử nghiệm ở vườn/nhà kính/khu vực địa hình thực tế trước khi áp dụng.
- Nếu GPS không khả dụng, người dùng từ chối quyền vị trí, thiết bị báo độ chính xác thấp, hoặc làm ở khu vực ngoài vùng đã khai báo: vẫn cho phép tạo bản ghi ngoại lệ khi cần, nhưng gắn trạng thái “Cần xác nhận”; không tự động loại bỏ công.
- Tổ trưởng/quản lý xác nhận ngoại lệ với lý do. Lưu người xác nhận, thời điểm, giá trị trước/sau và ghi chú.
- Không theo dõi vị trí ngoài thời điểm chấm công và không hiển thị lịch sử di chuyển.

## 16.5 Chấm công bởi tổ trưởng và nhóm lao động không có smartphone

1. Tổ trưởng chọn “Chấm công cho tổ” và ngày làm việc.
2. Hệ thống hiển thị danh sách thành viên được phân công, trạng thái công hôm nay và thao tác nhanh để đánh dấu có mặt/vắng mặt, giờ bắt đầu/kết thúc hoặc chọn một nhóm có cùng thời gian.
3. Có thể ghi nhận công theo nhóm để giảm thao tác, nhưng từng người vẫn có bản ghi riêng để tổng hợp và kiểm tra.
4. Nếu thời gian của một người khác với nhóm, cho phép chỉnh riêng.
5. Bản ghi do tổ trưởng tạo phải ghi `recorded_by`, `worker_id`, thời điểm nhập, thời điểm làm được khai báo, nguồn ghi nhận và lý do nếu nhập muộn/sửa sau.
6. Nếu có thiết bị dùng chung, mỗi người vẫn phải được chọn/định danh rõ trong danh sách; không được coi một tài khoản dùng chung là bằng chứng xác thực danh tính cá nhân.
7. Có thể cấu hình bước người lao động xác nhận công cuối ngày/cuối kỳ nếu cơ sở muốn. Việc thiếu xác nhận không tự động xóa bản ghi; chuyển sang trạng thái cần xử lý theo quy tắc cơ sở.

## 16.6 Quản lý loại công và cách tính tiền

MVP hỗ trợ đồng thời các mô hình sau. Một người có thể dùng mô hình khác nhau theo công việc/kỳ nếu được cấu hình rõ; tránh tính trùng cùng một khoảng thời gian/sản lượng.

### 16.6.1 Theo ngày công

- Cấu hình đơn giá một ngày công và tiêu chí quy đổi ngày công (ví dụ đủ giờ, nửa ngày, hoặc mức khác do cơ sở đặt).
- Hệ thống tổng hợp ngày công từ bản ghi đã xác nhận theo quy tắc.
- Không tự mặc định một số giờ cụ thể tương đương một ngày công cho mọi cơ sở.

Công thức khái quát: `Tiền công theo ngày = Số ngày công được duyệt × Đơn giá ngày công`.

### 16.6.2 Theo giờ

- Cấu hình đơn giá giờ và quy tắc làm tròn thời lượng (nếu có), hiệu lực từ ngày cụ thể.
- Tổng giờ tính tiền dựa trên lượt vào/ra đã được xác nhận, trừ thời gian nghỉ theo cấu hình được thông báo trước.
- Ca thiếu lượt vào/ra hoặc có chồng lấn thời gian cần được xử lý trước khi duyệt.

Công thức khái quát: `Tiền công theo giờ = Số giờ được duyệt × Đơn giá giờ`.

### 16.6.3 Theo sản lượng hoặc công việc

- Quản lý khai báo loại công việc, đơn vị đo (kg, giỏ, cây, luống, diện tích hoặc đơn vị do cơ sở cấu hình), đơn giá và thời gian hiệu lực.
- Ghi nhận số lượng, ngày thực hiện, người/nhóm thực hiện, người xác nhận và ghi chú/chứng cứ nếu cơ sở yêu cầu.
- Sản lượng của nhóm có thể được phân bổ theo số lượng thực tế từng người hoặc theo quy tắc chia đã được cơ sở thiết lập. Không tự chia đều nếu chưa được chọn.
- Tránh trả trùng khi một sản lượng đã được xác nhận và ghi vào bảng tiền công.

Công thức khái quát: `Tiền công sản lượng = Sản lượng được duyệt × Đơn giá theo đơn vị`.

### 16.6.4 Khoản cộng/trừ và tạm ứng

- Hỗ trợ khoản cộng như phụ cấp hoặc thưởng, khoản khấu trừ/điều chỉnh và tạm ứng theo cấu hình, với loại khoản, số tiền, lý do, người tạo và người duyệt.
- Không tự áp dụng phạt đi muộn, phạt lỗi GPS hoặc các khoản trừ tùy ý.
- Phân biệt rõ khoản do người dùng nhập, khoản tính theo công thức và khoản được kế thừa từ quy tắc cấu hình.
- Quy tắc thuế, bảo hiểm, khấu trừ bắt buộc và nghĩa vụ lao động cụ thể cần được xác nhận theo loại quan hệ lao động và quy định hiện hành trước khi triển khai chính thức; MVP không được tuyên bố tự động đảm bảo tuân thủ mọi trường hợp.

## 16.7 Bảng công và quy trình cuối kỳ

Quy trình chuẩn:

1. **Ghi nhận hằng ngày:** người lao động tự chấm hoặc tổ trưởng ghi nhận.
2. **Rà soát:** hệ thống liệt kê bản ghi thiếu lượt, trùng, thời lượng bất thường, ngoài khu vực, chờ đồng bộ và chờ xác nhận.
3. **Xác nhận:** tổ trưởng/quản lý xử lý ngoại lệ; xác nhận sản lượng và công việc.
4. **Tổng hợp kỳ:** quản lý chọn cơ sở, nhóm/người lao động và khoảng thời gian trả công.
5. **Xem trước:** hệ thống hiển thị từng dòng công, giờ, sản lượng, đơn giá, khoản cộng/trừ và cách tính tổng.
6. **Duyệt:** người có quyền duyệt xác nhận bảng tổng hợp. Có thể yêu cầu người lao động xem/đối chiếu trước khi duyệt theo quy trình cơ sở.
7. **Khóa kỳ:** sau khi duyệt, kỳ được khóa để ngăn thay đổi âm thầm. Mọi mở khóa/sửa sau khóa phải có quyền đặc biệt, lý do và lịch sử kiểm toán.
8. **Xuất dữ liệu:** cho phép xuất CSV/XLSX hoặc định dạng báo cáo khả dụng để đối chiếu và chuyển cho quy trình kế toán/thanh toán. Việc chuyển tiền tự động không thuộc MVP.

Trạng thái đề xuất: `Nháp` → `Chờ xác nhận` → `Đã rà soát` → `Chờ duyệt` → `Đã duyệt/Đã khóa`. Trạng thái “Có ngoại lệ” và “Chờ đồng bộ” có thể tồn tại ở cấp bản ghi chấm công.

## 16.8 Màn hình và trải nghiệm người dùng bổ sung

### Màn hình người lao động

- **Chấm công hôm nay:** nút lớn “Bắt đầu làm”/“Kết thúc làm”; giờ ghi nhận; trạng thái GPS; trạng thái đồng bộ; tổng thời gian tạm tính.
- **Lịch sử công:** danh sách theo ngày với nhãn dễ hiểu: Đã xác nhận, Chờ xác nhận, Chờ đồng bộ, Cần bổ sung.
- **Công việc/sản lượng:** xem công việc được giao và sản lượng của mình nếu có.
- **Tiền công của tôi:** xem kỳ, ngày công, giờ, sản lượng, khoản cộng/trừ, tổng dự kiến và trạng thái duyệt theo quyền.
- **Báo lỗi/yêu cầu sửa:** chọn ngày, loại vấn đề, mô tả ngắn; không yêu cầu viết giải trình dài.

### Màn hình tổ trưởng

- **Chấm công cho tổ:** danh sách thành viên, đánh dấu hàng loạt, nhập giờ theo nhóm và sửa riêng từng người.
- **Xác nhận sản lượng:** chọn công việc/đơn vị, nhập số lượng và người thực hiện, xác nhận.
- **Việc cần xử lý:** bản ghi thiếu giờ, GPS không hợp lệ/không có, dữ liệu nhập muộn, chờ đồng bộ và yêu cầu sửa.

### Màn hình quản lý/chủ cơ sở

- **Tổng quan hôm nay:** số người dự kiến, đã chấm công, vắng mặt/chưa có dữ liệu, ngoại lệ cần duyệt; không coi “chưa có bản ghi” là chắc chắn vắng mặt nếu đồng bộ chưa hoàn tất.
- **Cấu hình công và đơn giá:** theo người, nhóm, loại công việc, đơn vị và khoảng hiệu lực.
- **Bảng công:** lọc theo ngày, người, nhóm, khu vực và trạng thái.
- **Bảng tiền công/lương:** xem trước chi tiết, xử lý ngoại lệ, duyệt, khóa kỳ và xuất báo cáo.

Thiết kế phải mobile-first, ít nhập chữ, có nút chữ rõ ràng, hỗ trợ người ít kỹ năng số. Không chỉ dùng màu để biểu thị trạng thái; phải có nhãn chữ/icon dễ hiểu.

## 16.9 Quy tắc offline và đồng bộ cho phân hệ này

- Bản ghi chấm công cần có ID duy nhất được tạo ở thiết bị hoặc theo cơ chế tương đương để đồng bộ lại không sinh bản ghi trùng.
- Lưu thời điểm sự kiện, thời điểm ghi nhận trên thiết bị, thời điểm nhận tại máy chủ, nguồn tạo và trạng thái đồng bộ. Nếu đồng hồ thiết bị lệch hoặc dữ liệu đến muộn, đánh dấu để rà soát thay vì tự sửa mà không lưu dấu vết.
- Khi offline, app phải thông báo rõ “Đã lưu trên thiết bị — chưa đồng bộ”; không hiển thị “đã xác nhận” nếu máy chủ/chủ cơ sở chưa xác nhận.
- Khi online trở lại, đồng bộ có thể retry an toàn; thao tác lặp lại không được nhân đôi giờ công, sản lượng hoặc tiền công.
- Nếu hai bản ghi mâu thuẫn (ví dụ hai lượt bắt đầu, thời gian chồng lấn, người lao động và tổ trưởng cùng tạo dữ liệu), không tự chọn một bản ghi để tính tiền. Đưa vào hàng đợi xử lý xung đột, giữ lịch sử nguồn dữ liệu và yêu cầu người có quyền xác nhận.
- Không cho phép sửa/xóa dấu vết lịch sử của bản ghi đã đồng bộ; điều chỉnh được lưu như sự kiện sửa đổi có người thực hiện, thời gian, lý do và giá trị trước/sau.

## 16.10 Dữ liệu nghiệp vụ bổ sung cho ERD

Các thực thể dưới đây là phần mở rộng mô hình dữ liệu khái niệm hiện có. Đội phát triển cần chuẩn hóa quan hệ và khóa trong ERD kỹ thuật; không bắt buộc tên bảng vật lý phải giống hệt tên đề xuất.

- `WorkerProfile`: hồ sơ lao động gắn với User nếu có tài khoản; có thể tồn tại cho lao động không dùng app. Thuộc Organization; trạng thái hoạt động; thông tin liên hệ tối thiểu cần thiết.
- `WorkerTeam` / `WorkerTeamMembership`: tổ lao động và thành viên theo thời gian hiệu lực.
- `WorkLocation`: địa điểm/khu vực chấm công; tọa độ, bán kính/ngưỡng GPS cấu hình, trạng thái và cơ sở sở hữu.
- `WorkSchedule` / `WorkShift`: lịch hoặc ca làm tùy chọn, khung giờ và quy tắc nghỉ.
- `AttendanceRecord`: worker, ngày làm việc, thời điểm bắt đầu/kết thúc, vị trí tại thời điểm chấm nếu có, độ chính xác GPS, WorkLocation, nguồn ghi nhận (self/team_leader/admin), thiết bị hoặc mã định danh cục bộ cần thiết, trạng thái, sync metadata và ghi chú.
- `AttendanceAdjustment`: yêu cầu sửa công hoặc sự kiện điều chỉnh; giá trị trước/sau, lý do, người tạo, người duyệt và thời điểm.
- `WorkRate`: loại trả công (day/hour/quantity/task), đơn giá, đơn vị, người/nhóm/công việc áp dụng, khoảng hiệu lực và trạng thái.
- `WorkOutputRecord`: công việc/sản lượng, đơn vị đo, số lượng, ngày, người hoặc nhóm thực hiện, nguồn ghi nhận, người xác nhận và trạng thái duyệt.
- `PayrollPeriod`: kỳ tổng hợp, cơ sở, ngày bắt đầu/kết thúc và trạng thái.
- `WorkerPayStatement`: bảng chi tiết theo người trong kỳ, các dòng công/giờ/sản lượng, khoản cộng/trừ, tạm ứng, tổng dự kiến, tổng được duyệt và trạng thái.
- `PayAdjustment`: khoản cộng/trừ hoặc tạm ứng, lý do, người tạo/duyệt, số tiền và liên kết kỳ/người lao động.
- `ApprovalEvent` / `AuditEvent`: lưu lịch sử duyệt, khóa/mở khóa, điều chỉnh và thao tác nhạy cảm.

Quy định dữ liệu:

- Phân biệt rõ giờ/số lượng được khai báo với giờ/số lượng đã duyệt.
- Lưu đơn giá cùng phiên bản/hiệu lực được áp dụng cho kỳ để thay đổi đơn giá mới không làm thay đổi kỳ cũ.
- Không lưu ảnh khuôn mặt hoặc mẫu sinh trắc học trong MVP vì nhận diện khuôn mặt chưa được chọn.
- Chỉ thu thập tọa độ tại thời điểm chấm công; giới hạn người được xem; đặt thời hạn lưu và quy trình xóa/ẩn danh phù hợp với chính sách đã được phê duyệt.

## 16.11 Bảo mật, riêng tư và kiểm soát gian lận

- Thông báo rõ lý do lấy vị trí, thời điểm lấy và cách sử dụng trước khi người dùng bật tính năng; xin quyền vị trí theo cơ chế hệ điều hành.
- Không coi GPS là bằng chứng duy nhất để từ chối tiền công hoặc xử lý kỷ luật.
- Không thu thập vị trí nền/liên tục trong phạm vi MVP.
- Chỉ người lao động được xem dữ liệu cá nhân của mình; tổ trưởng chỉ xem người thuộc tổ được giao; quản lý xem theo phạm vi cơ sở; các thao tác điều chỉnh và duyệt phải được ghi audit log.
- Có cơ chế xử lý trường hợp người lao động không có smartphone, không cấp quyền GPS, điện thoại hết pin, vùng phủ sóng kém hoặc thiết bị bị hỏng.
- Cần rà soát nghĩa vụ pháp lý hiện hành về dữ liệu cá nhân, quan hệ lao động, lưu trữ hồ sơ và tiền lương tại Việt Nam trước khi triển khai thực tế. Không tuyên bố rằng chỉ việc bật GPS là đủ để đáp ứng mọi yêu cầu pháp luật.

## 16.12 Báo cáo bổ sung

MVP cần tối thiểu:

1. Danh sách chấm công theo ngày và theo tổ.
2. Tổng hợp ngày công/giờ làm theo người trong kỳ.
3. Tổng hợp sản lượng theo người, nhóm, công việc và đơn vị.
4. Danh sách bản ghi thiếu lượt, ngoại lệ GPS, nhập muộn, xung đột đồng bộ và yêu cầu sửa công.
5. Bảng tiền công/lương dự kiến và đã duyệt theo người/kỳ.
6. Tổng chi phí nhân công theo khu vực trồng, vụ sản xuất hoặc công việc nếu có liên kết dữ liệu phù hợp; không tự phân bổ chi phí nếu chưa có quy tắc.
7. Xuất CSV/XLSX để đối chiếu. Báo cáo cần thể hiện kỳ, thời điểm xuất và trạng thái duyệt.

## 16.13 Yêu cầu chức năng bổ sung (FR)

- **FR-ATT-01:** Quản lý hồ sơ lao động, kể cả người không có tài khoản đăng nhập.
- **FR-ATT-02:** Cho phép người lao động tự chấm bắt đầu/kết thúc làm trên smartphone.
- **FR-ATT-03:** Ghi thời gian và kết quả vị trí tại thời điểm chấm khi quyền vị trí được cấp; không theo dõi nền.
- **FR-ATT-04:** Hỗ trợ tổ trưởng ghi nhận công cho một người hoặc nhóm được phân quyền.
- **FR-ATT-05:** Hỗ trợ lưu offline, trạng thái đồng bộ, retry an toàn và xử lý xung đột không tạo bản ghi trùng.
- **FR-ATT-06:** Quản lý ca/lịch làm tùy chọn, thời gian nghỉ và quy tắc tính ngày công theo cấu hình cơ sở.
- **FR-ATT-07:** Hỗ trợ đơn giá theo ngày, giờ, sản lượng và công việc với ngày hiệu lực.
- **FR-ATT-08:** Ghi nhận và duyệt sản lượng theo người/nhóm, đơn vị và công việc.
- **FR-ATT-09:** Quản lý yêu cầu sửa công, ngoại lệ GPS, thiếu lượt vào/ra và dữ liệu nhập muộn.
- **FR-ATT-10:** Tổng hợp bảng công và bảng tiền công/lương theo kỳ; giải thích được từng dòng tính toán.
- **FR-ATT-11:** Hỗ trợ khoản cộng/trừ, tạm ứng và điều chỉnh có lý do, quyền duyệt và audit log.
- **FR-ATT-12:** Hỗ trợ quy trình rà soát, duyệt, khóa kỳ, mở khóa có quyền và ghi lịch sử.
- **FR-ATT-13:** Cho người lao động xem lịch sử công và khoản tiền công của bản thân theo quyền được cấp.
- **FR-ATT-14:** Xuất bảng công, sản lượng và bảng tiền công đã duyệt ra định dạng bảng phổ biến.
- **FR-ATT-15:** Liên kết chi phí nhân công với khu vực/vụ/công việc khi có dữ liệu và quy tắc phân bổ được xác nhận.

## 16.14 Yêu cầu phi chức năng và tiêu chí nghiệm thu

- Các thao tác tự chấm chính phải có thể hoàn thành trong vài thao tác ngắn trên điện thoại; cần kiểm thử với người lao động thực tế, bao gồm người ít quen dùng công nghệ.
- Chấm công cho một tổ phải hỗ trợ đánh dấu hàng loạt nhưng vẫn tạo dữ liệu riêng cho từng người.
- Khi mất mạng, bản ghi được lưu cục bộ và hiển thị trạng thái; sau đồng bộ không xuất hiện bản ghi/giờ công/sản lượng trùng.
- Một bản ghi có GPS không đạt ngưỡng phải đi vào luồng xác nhận theo quy tắc, không tự động bị coi là gian lận hoặc bị loại khỏi công.
- Mỗi khoản trong bảng tiền công phải truy ngược được đến bản ghi công, sản lượng, đơn giá và quy tắc tính tương ứng.
- Sửa bản ghi hoặc đơn giá sau khi kỳ đã duyệt/khóa phải yêu cầu quyền, lý do và lưu audit log; kỳ đã khóa không thay đổi âm thầm.
- Kiểm thử các trường hợp: quên bấm kết thúc; hai lượt bắt đầu; ca qua nửa đêm; GPS không có; người lao động không có smartphone; tổ trưởng nhập muộn; offline nhiều ngày; gửi đồng bộ lặp; sản lượng nhóm; thay đổi đơn giá giữa kỳ; sửa sau khóa; người dùng không đủ quyền.
- Các chỉ tiêu về độ chính xác GPS, thời gian phản hồi và khả năng chịu tải phải được xác định sau khi chọn thiết bị/nền tảng và thử nghiệm thực địa; không hard-code bán kính hoặc ngưỡng chính xác như phù hợp cho mọi vườn.

## 16.15 Các điểm cần chủ sản phẩm xác nhận trước khi chốt SRS kỹ thuật

Các mục sau chưa được quyết định trong lựa chọn hiện tại; đội phát triển phải ghi nhận là câu hỏi/giả định, không tự ý coi là yêu cầu đã duyệt:

1. Cơ sở có cần lập ca làm cố định hay chủ yếu ghi nhận thời gian linh hoạt?
2. Có cần người lao động xác nhận bảng công trước khi quản lý duyệt không?
3. Quy tắc cụ thể để quy đổi giờ thành ngày công/nửa ngày và làm tròn giờ là gì?
4. Quy tắc làm thêm giờ, nghỉ giữa ca, ngày nghỉ/ngày lễ và ca qua ngày áp dụng theo loại lao động nào?
5. Cách phân bổ sản lượng của một nhóm: nhập sản lượng từng người, chia theo tỷ lệ, chia đều hay lựa chọn theo từng công việc?
6. Có cần in bảng công hoặc phiếu tiền công cho lao động không dùng smartphone không?
7. Thời hạn lưu dữ liệu chấm công/vị trí và chính sách xử lý yêu cầu sửa dữ liệu cần được phê duyệt ra sao?
8. Phạm vi tích hợp với kế toán hoặc xuất bảng lương theo mẫu nào? Chuyển tiền tự động không nằm trong MVP trừ khi được phê duyệt riêng.
9. Những loại lao động/quan hệ hợp đồng nào sẽ dùng phân hệ này, để xác định quy tắc tiền lương và nghĩa vụ pháp lý cần áp dụng?

## 16.16 Thứ tự triển khai đề xuất

- **MVP-A:** hồ sơ lao động; GPS tự chấm vào/ra; chấm công theo tổ; lưu offline và đồng bộ; xử lý ngoại lệ; bảng công theo ngày.
- **MVP-B:** cấu hình đơn giá ngày/giờ/sản lượng; xác nhận sản lượng; tổng hợp bảng tiền công; quy trình duyệt/khóa kỳ; xuất bảng.
- **Sau MVP khi có nhu cầu:** xác nhận công qua QR, thiết bị chấm công chuyên dụng, tích hợp kế toán/chuyển khoản hoặc nhận diện khuôn mặt. Mỗi mục cần quyết định phạm vi, đánh giá quyền riêng tư và được chủ sản phẩm duyệt riêng.

**Chỉ dẫn cho AI/đội phát triển:** Bổ sung phân hệ này vào backlog, UX flow, ERD, API và test plan; không sửa nội dung các phân hệ đã duyệt. Mọi quy tắc tính công/lương chưa được chốt phải được thể hiện là cấu hình hoặc câu hỏi cần xác nhận, không được tự gán giá trị cứng.
