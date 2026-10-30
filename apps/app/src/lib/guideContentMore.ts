import type { Guide } from './guideContent';

/**
 * Các hướng dẫn thêm (D122): Vật nuôi, Khai báo cơ sở, Tương tác website. Ghép vào danh sách và sắp thứ tự ở guideContent.ts (GUIDES).
 * Chỉ là chữ trong app, không đụng CSDL. Cách viết giống guideContent.ts: mỗi bước nói LÀM GÌ và VÌ SAO.
 */
export const MORE_GUIDES: Guide[] = [
  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'livestock',
    label: 'Hướng dẫn cho vật nuôi',
    icon: '🐖',
    flow: [
      { title: 'Làm một lần đầu', tone: 'info', nodes: [{ icon: '📝', label: 'Đăng ký', step: 0 }, { icon: '⚙️', label: 'Cấu hình', step: 1 }, { icon: '🏡', label: 'Chuồng, ao', step: 2 }, { icon: '🐖', label: 'Sản phẩm', step: 3 }, { icon: '📦', label: 'Kho thức ăn, thuốc', step: 4 }, { icon: '📋', label: 'Quy trình', step: 5 }] },
      { title: 'Mỗi đợt nuôi', tone: 'ok', nodes: [{ icon: '📥', label: 'Nhập kho', step: 6 }, { icon: '🔢', label: 'Tạo đợt, nhập số con', step: 7 }, { icon: '📈', label: 'Quản lý đợt', step: 8 }] },
      { title: 'Mỗi ngày', tone: 'ok', nodes: [{ icon: '🍽️', label: 'Ghi việc: cho ăn, thuốc', step: 9 }, { icon: '⏱', label: 'Chấm công', step: 10 }, { icon: '🚚', label: 'Xuất chuồng, bán', step: 11 }] },
      { title: 'Kết quả', tone: 'warn', nodes: [{ icon: '💳', label: 'Chi phí, công nợ', step: 12 }, { icon: '📊', label: 'Hao hụt, FCR, giá thành', step: 13 }, { icon: '🌐', label: 'Website và QR', step: 14 }] },
    ],
    intro: 'Dành cho hộ nuôi heo, gia cầm, thủy sản (tôm, cá). Một chuồng hoặc một ao nuôi một đợt là một vụ. Bước 1–6 chỉ làm một lần; từ bước 7 là việc lặp lại mỗi đợt nuôi và mỗi ngày. Số con nhập chuồng là con số gốc để app tính hao hụt, mật độ, FCR và giá thành. Phần chung (kho, tiền, nhân sự) xem thêm các hướng dẫn chuyên đề.',
    steps: [
      {
        title: 'Đăng ký tài khoản và tạo cơ sở',
        details: [
          'Chủ Hộ đăng ký bằng email. Không có email thì chọn tab "Không có email": nhập họ tên, tên cơ sở, số điện thoại có Zalo và mật khẩu rồi gửi; Agricovi liên hệ qua Zalo xác nhận (miễn phí) và duyệt thì cơ sở được mở.',
          'Chọn loại cơ sở "Hộ" và đặt tên, ví dụ "Trại heo Bình An".',
          'Nhân viên không tự đăng ký: chủ cơ sở tạo tài khoản cho họ (số điện thoại + mật khẩu tạm).',
        ],
        tip: 'Cài app ra màn hình chính điện thoại để mở nhanh. Trang đăng nhập có hướng dẫn cài theo từng thiết bị.',
      },
      {
        title: 'Cấu hình: chọn Vật nuôi hoặc Thủy sản',
        details: [
          'Menu ☰ → Cấu hình. Ở "Nhóm loại sản phẩm", tích cột "Sử dụng" cho Vật nuôi và/hoặc Thủy sản. Có thể tắt Cây trồng nếu bạn không trồng.',
          '"Kiểu nhà/chuồng" đã có sẵn các kiểu; chỉ sửa khi muốn gọi tên khác.',
          '"Tạo quy trình": chọn dùng công đoạn hay chỉ một danh sách việc.',
        ],
        tip: 'Việc "Cho ăn" của heo khác "Cho ăn" của tôm (ô nhập và vật tư khác nhau) nên app tách theo đối tượng và chỉ hiện đúng loại bạn chọn. Chưa chắc thì cứ để mặc định, đổi lúc nào cũng được.',
        go: { tab: 'config', label: 'Mở Cấu hình' },
      },
      {
        title: 'Khai báo chuồng hoặc ao (phân khu)',
        details: [
          'Khai báo → Cơ sở & vật tư → Phân khu → thêm mới. Mỗi chuồng hoặc ao là một phân khu: tên (ví dụ "Chuồng 1", "Ao 2"), diện tích, vị trí, kiểu chuồng, ảnh.',
          'Chỗ không nuôi (kho thức ăn, biogas, cổng) chọn loại "Cơ sở vật chất".',
          'Mỗi đợt nuôi chạy trong MỘT phân khu. Diện tích dùng để tính mật độ nuôi (số con trên diện tích).',
        ],
        go: { tab: 'declare', section: 'areas', label: 'Mở Phân khu' },
      },
      {
        title: 'Khai báo sản phẩm (con vật nuôi)',
        details: [
          'Khai báo → Sản phẩm: chọn loại có sẵn (ví dụ heo thịt, tôm) hoặc thêm loại riêng như gà, vịt, cút.',
          'Mục có sẵn không đúng ý thì sửa hoặc dừng dùng riêng cho cơ sở của bạn.',
          'Sản phẩm vật nuôi đếm theo "con" và có ô nhập riêng, khác cây trồng.',
        ],
        tip: 'Loài đặc thù chưa có mẫu quy trình vẫn dùng được: bạn tự tạo quy trình ở bước 6.',
        go: { tab: 'declare', section: 'crops', label: 'Mở Sản phẩm' },
      },
      {
        title: 'Khai báo kho: thức ăn, thuốc, vắc xin',
        details: [
          'Kho: tạo kho thức ăn, kho thuốc và vắc xin (có thể gộp một kho).',
          'Vật tư: app có sẵn danh sách thường dùng. Thêm thức ăn, thuốc, vắc xin của bạn; đặt mức tồn tối thiểu để được cảnh báo khi sắp hết.',
          'Nhà cung ứng: nơi bạn mua, dùng khi nhập kho có hóa đơn để theo dõi công nợ.',
          'Thức ăn là khoản chi lớn nhất của đợt nuôi. Có trong kho thì mỗi lần ghi "Cho ăn", kho tự trừ và tiền vào chi phí của đợt.',
        ],
        go: { tab: 'declare', section: 'materials', label: 'Mở Vật tư' },
      },
      {
        title: 'Lập quy trình nuôi',
        details: [
          'Khai báo → Quy trình → Tạo quy trình → tab "Mẫu hệ thống". Có mẫu heo thịt và tôm ao lót bạt: xem trước rồi "Áp dụng cho cơ sở của tôi", sau đó sửa cho đúng trại của bạn.',
          'Nuôi gà, vịt, cút hoặc loài khác: tạo quy trình mới, thêm công đoạn (ví dụ Úp chuồng, Úm, Nuôi thịt, Xuất chuồng) rồi thêm các việc vào từng công đoạn.',
          'Mỗi việc có số ngày thực hiện, "Bắt đầu ngày thứ" (để trống là nối tiếp, nhập số là chạy song song), "Lặp lại mỗi … ngày" (ví dụ cho ăn mỗi 1 ngày), hướng dẫn và vật tư dự kiến.',
          'Quy trình có thể kèm "mốc an toàn" như thời gian cách ly thuốc; đợt nuôi tạo từ quy trình mang theo các mốc này.',
        ],
        tip: 'Lịch tiêm, thời gian cách ly, mật độ trong mẫu chỉ để tham khảo. Số liệu kỹ thuật do trại nhập hoặc xác nhận với thú y.',
        go: { tab: 'declare', section: 'templates', label: 'Mở Tạo quy trình' },
      },
      {
        title: 'Nhập kho thức ăn và thuốc',
        details: [
          'Sản xuất → Quản lý kho → Nhập kho: chọn kho, thêm các dòng (số lượng, giá, ngày nhập). Nhập nhiều dòng một lần được.',
          'Có hóa đơn thì tích "Có hóa đơn" để ghi số hóa đơn, nhà cung ứng, hạn trả; số còn nợ vào Công nợ.',
          'Thuốc, vắc xin có hạn dùng thì ghi số lô và hạn; khi dùng app lấy lô hạn gần nhất trước.',
          'Kho tính giá vốn bình quân. Tiền mua chưa vào chi phí vụ; chỉ tính khi bạn DÙNG.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Tạo đợt nuôi (vụ) và nhập số con',
        details: [
          'Sản xuất → Vụ nuôi trồng → + Tạo vụ mới: chọn Sản phẩm (con vật), quy trình, Phân khu (chuồng/ao) và ngày bắt đầu.',
          'Nhập số con nhập chuồng hoặc thả. Đây là con số gốc để tính hao hụt, mật độ và FCR.',
          'Nên nhập thêm giống, sản lượng dự kiến, ngân sách dự kiến để app so kế hoạch với thực tế.',
          'Tạo xong, chọn cách quản lý vụ (5 kiểu). Hộ nhỏ chọn "Tự làm trong gia đình" để app ẩn kho, nhân sự, chấm công cho gọn; Ghi việc vẫn dùng bình thường.',
        ],
        tip: 'Mỗi chuồng hoặc ao đang nuôi một đợt là một vụ, và số vụ chạy cùng lúc bị giới hạn theo gói dịch vụ. Chọn "Chưa bắt đầu (Chuẩn bị)" nếu muốn lập lịch trước.',
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Quản lý đợt nuôi: lịch, việc hôm nay, Bắt đầu và Xong',
        details: [
          'Bấm vào đợt nuôi để mở Quản lý vụ: công đoạn, việc, ngày kế hoạch và ngày thực tế.',
          '"Việc đến hạn hôm nay" nhắc việc cần làm (cho ăn, tiêm, vệ sinh chuồng…); bấm "Ghi việc" ngay trên dòng đó.',
          'Người quản lý bấm Bắt đầu và Xong từng việc; làm sớm hay trễ thì các việc sau tự dời theo.',
          'Thẻ vụ có chi phí, thu hoạch, doanh thu, lãi lỗ tạm tính; "Xem thêm số liệu" cho hao hụt, còn tồn, giá thành mỗi kg.',
          'Một việc chỉ bấm Xong khi đã Ghi việc đủ số lần (ví dụ cho ăn mỗi ngày thì phải có ghi từng ngày). Chủ cơ sở được bấm Xong khi chưa đủ, kèm lý do; app lưu lại để đối chiếu.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Ghi việc hằng ngày: cho ăn, thuốc, chăm sóc',
        details: [
          'Bấm nút ＋ ở giữa thanh dưới. Chọn đợt nuôi và việc (Cho ăn, Tiêm vắc xin, Vệ sinh chuồng…).',
          'Thêm vật tư đã dùng: chọn thức ăn hoặc thuốc và số lượng. Kho tự trừ, tiền vào chi phí của đợt.',
          'Nhập các ô riêng của việc, nội dung (có micro), ảnh. Nhập ngoài ngưỡng cảnh báo thì bản ghi hiện chữ cảnh báo.',
          'Quên ghi thì chọn Hôm qua hoặc Hôm kia. Sai thì sửa hoặc hủy ở Nhật ký việc; việc giống hôm trước thì bấm "Nhân bản".',
          'Mất mạng vẫn ghi được: app giữ trên máy rồi tự gửi lên khi có mạng.',
          'Ghi theo VIỆC, một việc một bản ghi, không ghi riêng cho từng công nhân (ai có mặt thì có chấm công).',
        ],
        tip: 'Ghi thuốc và vắc xin đúng ngày: đó là hồ sơ chứng minh thời gian cách ly khi xuất chuồng.',
        go: { tab: 'production', section: 'log', label: 'Mở Ghi việc' },
      },
      {
        title: 'Chấm công và nhân sự',
        details: [
          'Người làm chấm công ở máy chấm công của cơ sở bằng số điện thoại + PIN (Vào ca, Ra ca). Chủ tạo nhân sự ở Khai báo → Nhân sự.',
          'Hộ nhỏ không dùng máy: chủ hoặc quản lý nhập ở Sản xuất → Chấm công → Hôm nay → "＋ Chấm công cho người làm".',
          'Chủ hoặc quản lý xác nhận công, rồi chốt lương hằng tháng. Chỉ công đã xác nhận mới tính tiền.',
          'Chỉ có người nhà làm? Chọn kiểu "Tự làm trong gia đình" và ghi tiền công ở Chi phí (nhóm Nhân công).',
          'Chi tiết xem hướng dẫn "Nhân sự, chấm công và lương".',
        ],
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Xuất chuồng, thu hoạch và bán hàng',
        details: [
          'Sản xuất → Thu hoạch: ghi ngày, số con, số kg và hao hụt của lần xuất chuồng hoặc lần thu. Xuất nhiều lần thì mỗi lần một phiếu.',
          'Số con còn lại của đợt tự trừ theo phiếu xuất chuồng nên cần có số con ban đầu ở bước 8.',
          'Báo cáo → Doanh thu → Ghi bán hàng: khách, số lượng, số tiền; khách chưa trả hết thì ghi hạn thu.',
          'Sửa hoặc hủy phiếu cần có mạng; hủy phải ghi lý do và không khôi phục được.',
        ],
        tip: 'Con chết hoặc loại: ghi hao hụt trong phiếu thu hoạch/xuất chuồng. Nếu cơ sở đã khai báo loại việc phù hợp thì ghi thêm một bản ghi việc để có nhật ký.',
        go: { tab: 'production', section: 'harvest', label: 'Mở Thu hoạch' },
      },
      {
        title: 'Chi phí và công nợ',
        details: [
          'Sản xuất → Chi phí: ghi điện nước, thuê, khấu hao, nhân công thuê ngoài, chi khác. Gắn đợt nuôi nếu của riêng đợt đó.',
          'KHÔNG ghi tiền mua thức ăn, thuốc ở đây: đã tính khi dùng, ghi lại sẽ bị tính hai lần.',
          'Thức ăn dùng chung nhiều chuồng cùng lúc: Xuất kho "Dùng chung" để app chia theo diện tích.',
          'Báo cáo → Công nợ: nợ phải trả (mua thức ăn chịu) và phải thu (khách chưa trả), kèm nhắc hạn.',
        ],
        go: { tab: 'production', section: 'expense', label: 'Mở Chi phí' },
      },
      {
        title: 'Tổng kết đợt nuôi: hao hụt, FCR, giá thành',
        details: [
          'Báo cáo → Tổng kết vụ: chi phí, doanh thu, lãi lỗ, giá thành mỗi kg; xuất CSV.',
          'Mở "Xem thêm số liệu" ở thẻ vụ để xem hao hụt, mật độ, FCR.',
          'Báo cáo tuần và "Theo nhu cầu" giúp so sánh đợt này với đợt trước. Sổ nhật ký và Bảng kiểm in hoặc xuất Excel khi cần hồ sơ.',
          'Các chỉ số chỉ tính khi đủ số liệu (số con ban đầu, thức ăn đã ghi, phiếu xuất chuồng). Thiếu thì app hiện "chưa đủ số liệu" thay vì đưa con số sai.',
        ],
        tip: 'So giá thành mỗi kg giữa các đợt để biết đợt nào hiệu quả và vì sao.',
        go: { tab: 'reports', section: 'summary', label: 'Mở Tổng kết vụ' },
      },
      {
        title: 'Đưa sản phẩm lên website và mã QR truy xuất',
        details: [
          'Báo cáo → Hồ sơ web: soạn hồ sơ rồi gửi duyệt (cần quyền "Hồ sơ website"). Quản trị website duyệt xong, hồ sơ hiện trên website.',
          'Mỗi đợt nuôi có mã QR truy xuất để in dán lên bao bì hoặc chuồng; khách quét xem được quá trình nuôi.',
          'Chi phí, lương, nhật ký chi tiết không lên website. Chi tiết xem hướng dẫn "Tương tác website".',
        ],
        go: { tab: 'reports', section: 'commerce', label: 'Mở Hồ sơ web' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'declare',
    label: 'Khai báo cơ sở',
    icon: '🏡',
    flow: [
      { title: 'Nền của cơ sở', tone: 'info', nodes: [{ icon: '🧭', label: 'Khai báo là gì', step: 0 }, { icon: '⚙️', label: 'Cấu hình', step: 1 }, { icon: '🏡', label: 'Phân khu', step: 2 }, { icon: '🌾', label: 'Sản phẩm', step: 3 }] },
      { title: 'Kho và đối tác', tone: 'ok', nodes: [{ icon: '🏬', label: 'Kho', step: 4 }, { icon: '🧪', label: 'Vật tư', step: 5 }, { icon: '🚚', label: 'Nhà cung ứng, khách hàng', step: 6 }] },
      { title: 'Giấy tờ và con người', tone: 'neutral', nodes: [{ icon: '📜', label: 'Giấy phép', step: 7 }, { icon: '👥', label: 'Nhân sự, máy chấm công', step: 8 }] },
    ],
    intro: 'Khai báo là những thứ làm một lần rồi ít đổi: nơi nuôi trồng, sản phẩm, kho, vật tư, đối tác, giấy phép. Khai báo xong, mọi bước sau (tạo vụ, ghi việc, nhập kho, bán hàng) chỉ việc chọn trong danh sách, không phải gõ lại và số liệu không bị lệch tên. Quy trình có hướng dẫn riêng: "Quy trình, vụ và Ghi việc".',
    steps: [
      {
        title: 'Khai báo là gì và đi theo thứ tự nào',
        details: [
          'Tab Khai báo chia thành 4 khung: Cơ sở & vật tư (Phân khu, Sản phẩm, Kho, Vật tư, Nhà cung ứng, Máy chấm công) · Nhân sự (Chức vụ, Tổ chức, Nhân sự) · Quy trình (Việc, Tạo quy trình) · Giấy phép & đối tác (Giấy phép, Hợp tác xã hoặc Hộ thành viên, Khách hàng).',
          'Thứ tự gợi ý: Cấu hình → Phân khu → Sản phẩm → Kho → Vật tư → Nhà cung ứng → Quy trình → Nhân sự. Khách hàng và Giấy phép thêm lúc nào cũng được.',
          'Mục nào bạn không có quyền hoặc cơ sở không dùng thì tự ẩn để màn hình ngắn gọn.',
          'Khai báo là dữ liệu dùng chung nên cần có mạng khi lưu. Sai thì sửa hoặc dừng dùng; dữ liệu đã ghi trước đó không bị mất.',
        ],
        go: { tab: 'declare', label: 'Mở Khai báo' },
      },
      {
        title: 'Cấu hình: chọn loại bạn thật sự làm',
        details: [
          'Menu ☰ → Cấu hình (chủ và quản lý). Ở "Nhóm loại sản phẩm", tích cột "Sử dụng" cho loại bạn làm (Cây trồng, Vật nuôi, Thủy sản). Việc, mẫu, vật tư của loại khác sẽ tự ẩn.',
          'Cũng ở đây: nhóm vật tư, nhóm chi phí, loại khách hàng, kiểu nhà/chuồng, và có dùng công đoạn trong quy trình hay không.',
          'Các danh sách này đã có sẵn; chỉ sửa khi muốn gọi tên khác.',
        ],
        tip: 'Chưa chắc thì để mặc định. Đổi lúc nào cũng được, dữ liệu đã ghi không mất.',
        go: { tab: 'config', label: 'Mở Cấu hình' },
      },
      {
        title: 'Phân khu: nơi nuôi trồng',
        details: [
          'Khai báo → Phân khu → thêm mới: tên, diện tích, vị trí, kiểu nhà/chuồng, ảnh. Ví dụ: vườn, nhà màng, ao, chuồng.',
          'Loại "Cơ sở vật chất" dành cho chỗ không nuôi trồng (cổng, kho, biogas) để ghi những việc không thuộc vụ nào.',
          'Mỗi vụ chạy trong MỘT phân khu. Diện tích dùng để tính năng suất, mật độ và để chia vật tư dùng chung cho nhiều vụ theo diện tích.',
          'Cơ sở đông người có thể giao mỗi người một hay nhiều phân khu: họ chỉ thấy và ghi việc ở phân khu được giao (Khai báo → Nhân sự).',
        ],
        go: { tab: 'declare', section: 'areas', label: 'Mở Phân khu' },
      },
      {
        title: 'Sản phẩm: cây trồng hoặc vật nuôi',
        details: [
          'Khai báo → Sản phẩm: chọn loại có sẵn hoặc thêm loại riêng. Mục có sẵn không đúng ý thì sửa hoặc dừng dùng riêng cho cơ sở của bạn.',
          'Sản phẩm quyết định ô nhập riêng khi ghi việc và thu hoạch (cây khác vật nuôi, vật nuôi đếm theo con).',
          'Sản phẩm cũng là căn cứ để chọn quy trình mẫu khi tạo vụ.',
        ],
        go: { tab: 'declare', section: 'crops', label: 'Mở Sản phẩm' },
      },
      {
        title: 'Kho',
        details: [
          'Khai báo → Kho: tạo các kho (kho phân, kho thuốc, kho thức ăn…). Có thể có nhiều kho.',
          'Vật tư luôn nằm trong một kho khi nhập; chuyển kho hoặc điều chỉnh tồn làm ở Sản xuất → Quản lý kho.',
        ],
        go: { tab: 'declare', section: 'places', label: 'Mở Kho' },
      },
      {
        title: 'Vật tư',
        details: [
          'Khai báo → Vật tư: app đã có sẵn danh sách vật tư thường dùng. Bạn sửa, thêm vật tư của mình.',
          'Chọn nhóm vật tư và đơn vị tính (kg, lít, bao…). Đặt mức tồn tối thiểu để được cảnh báo khi sắp hết.',
          'Vật tư có hạn dùng thì ghi số lô và hạn lúc nhập kho; khi xuất app lấy lô hạn gần nhất trước.',
        ],
        tip: 'Đặt tên vật tư rõ ràng và thống nhất (ví dụ "Phân NPK 16-16-8"), để lúc ghi việc dễ chọn và báo cáo dễ đọc.',
        go: { tab: 'declare', section: 'materials', label: 'Mở Vật tư' },
      },
      {
        title: 'Nhà cung ứng và khách hàng',
        details: [
          'Khai báo → Nhà cung ứng: nơi bạn mua. Dùng khi nhập kho có hóa đơn để theo dõi công nợ phải trả.',
          'Khai báo → Khách hàng: người mua sản phẩm của bạn. Dùng khi ghi bán hàng để theo dõi công nợ phải thu.',
          'Khách hỏi mua từ website có thể thêm thẳng vào Khách hàng (xem hướng dẫn "Tương tác website").',
        ],
        go: { tab: 'declare', section: 'partners', label: 'Mở Nhà cung ứng' },
      },
      {
        title: 'Giấy phép và chứng nhận',
        details: [
          'Khai báo → Giấy phép: lưu giấy chứng nhận (ví dụ VietGAP), ngày cấp, ngày hết hạn.',
          'App nhắc khi giấy sắp hết hạn để bạn gia hạn kịp.',
        ],
        go: { tab: 'declare', section: 'licenses', label: 'Mở Giấy phép' },
      },
      {
        title: 'Nhân sự và máy chấm công',
        details: [
          'Khai báo → Nhân sự: tạo tài khoản cho người làm (số điện thoại + mật khẩu tạm), chọn chức vụ và phân khu.',
          'Khai báo → Chức vụ, Tổ chức: đặt quyền theo mục và chia phòng/tổ.',
          'Khai báo → Máy chấm công: liên kết một điện thoại cố định làm máy chấm công.',
          'Hộ nhỏ chỉ có người nhà thì có thể bỏ qua cả khung này.',
          'Chi tiết xem hướng dẫn "Nhân sự, chấm công và lương".',
        ],
        go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'webtalk',
    label: 'Tương tác website',
    icon: '🌐',
    flow: [
      { title: 'Đưa lên website', tone: 'info', nodes: [{ icon: '🧩', label: 'App và web nối nhau', step: 0 }, { icon: '📝', label: 'Soạn hồ sơ', step: 1 }, { icon: '📤', label: 'Gửi duyệt', step: 2 }, { icon: '🔳', label: 'Mã QR truy xuất', step: 3 }] },
      { title: 'Khách tìm đến', tone: 'ok', nodes: [{ icon: '📬', label: 'Việc chờ từ website', step: 4 }, { icon: '👤', label: 'Khách tiềm năng', step: 5 }, { icon: '🛒', label: 'Đơn hàng', step: 6 }] },
      { title: 'Chốt và giữ uy tín', tone: 'warn', nodes: [{ icon: '💰', label: 'Ghi doanh thu từ đơn', step: 7 }, { icon: '⭐', label: 'Đánh giá', step: 8 }] },
    ],
    intro: 'Website xúc tiến thương mại là nơi người mua tìm thấy bạn. Phần lớn việc bạn làm ngay trong app: soạn hồ sơ, nhận khách hỏi mua, xử lý đơn, ghi doanh thu. Chỉ phần bạn chủ động công khai và đã được duyệt mới lên website; dữ liệu vận hành (chi phí, lương, nhật ký chi tiết) luôn riêng tư.',
    steps: [
      {
        title: 'App và website nối với nhau thế nào',
        details: [
          'Cùng một tài khoản và một cơ sở dữ liệu: đăng nhập app là bạn đã có chỗ đứng trên website, không cần tạo tài khoản khác cho cơ sở.',
          'Hướng đi ra: bạn soạn hồ sơ trong app → gửi duyệt → quản trị website duyệt → hồ sơ hiện trên website (bản chụp đã duyệt, không đổi lặng lẽ).',
          'Hướng đi vào: người mua nhắn, xin báo giá hoặc đặt hàng trên website → hiện ở Báo cáo → Đơn khách từ website trong app → bạn xử lý ngay trong app.',
          'Mục Hồ sơ web và Đơn khách từ website cần quyền "Hồ sơ website" (chủ, quản lý hoặc người được giao biên tập hồ sơ).',
        ],
        tip: 'Muốn chỉ một người lo phần website: chủ gán chức vụ Biên tập hồ sơ cho người đó (Khai báo → Chức vụ).',
      },
      {
        title: 'Soạn hồ sơ website',
        details: [
          'Báo cáo → Hồ sơ web. Điền: tên hiển thị trên website, câu giới thiệu ngắn, mô tả (ít nhất 20 ký tự).',
          'Địa chỉ: tỉnh/thành, quận/huyện, xã/phường, và chọn hiển thị công khai đến mức nào (bạn quyết định, không buộc lộ địa chỉ nhà).',
          'Thông tin thêm giúp người mua tin hơn: năm thành lập, tổng diện tích, phương thức canh tác (nhà màng, tưới nhỏ giọt, hữu cơ…), năng lực và sản lượng.',
          'Liên hệ: điện thoại, Zalo, email, website, Facebook (điền cái nào bạn muốn công khai).',
        ],
        tip: 'Hồ sơ rõ ràng, có ảnh và có giấy chứng nhận sẽ được người mua chọn nhiều hơn.',
        go: { tab: 'reports', section: 'commerce', label: 'Mở Hồ sơ web' },
      },
      {
        title: 'Gửi duyệt và sản phẩm niêm yết',
        details: [
          'Soạn xong bấm gửi duyệt. Khi quản trị website duyệt, hồ sơ và sản phẩm niêm yết mới hiện trên website.',
          'Sản phẩm niêm yết có thể gắn với một vụ để truy xuất nguồn gốc: người mua thấy hàng này từ vụ nào, làm thế nào.',
          'Website chỉ đọc bản đã duyệt, không đọc thẳng dữ liệu vận hành của bạn.',
        ],
        go: { tab: 'reports', section: 'commerce', label: 'Mở Hồ sơ web' },
      },
      {
        title: 'Mã QR truy xuất nguồn gốc',
        details: [
          'Mỗi vụ có một mã QR. In ra dán lên bao bì, thùng hàng hoặc chuồng, ao.',
          'Khách quét sẽ mở trang truy xuất trên website, xem quá trình nuôi trồng của vụ đó.',
          'Trang truy xuất chỉ hiện thông tin công khai của vụ; chi phí và lương không hiện.',
        ],
        tip: 'Ghi việc đầy đủ và đúng ngày thì trang truy xuất mới đáng tin.',
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Việc chờ từ website (Trang chủ)',
        details: [
          'Khi có đơn cần xử lý, yêu cầu báo giá mới hoặc đánh giá chưa trả lời, Trang chủ hiện thẻ "Việc chờ từ website".',
          'Bấm vào đơn hoặc yêu cầu để mở thẳng màn xử lý trong app. Đánh giá thì mở website để trả lời.',
          'Thẻ chỉ hiện khi có mạng và khi bạn có quyền "Hồ sơ website".',
        ],
        go: { tab: 'home', label: 'Mở Trang chủ' },
      },
      {
        title: 'Khách tiềm năng (yêu cầu báo giá)',
        details: [
          'Báo cáo → Đơn khách từ website → tab "Khách tiềm năng": danh sách khách để lại tên, số điện thoại hoặc email, sản phẩm quan tâm và nội dung (mới nhất trước).',
          'Bấm gọi để liên hệ ngay. Gọi xong bấm "Đã xử lý" (có thể kèm ghi chú).',
          'Bấm "Thêm vào khách hàng" để tạo khách từ yêu cầu đó. Nếu số điện thoại trùng khách đã có thì app nối vào khách cũ, không tạo trùng.',
        ],
        tip: 'Thông tin người hỏi mua là dữ liệu cá nhân: chỉ người có quyền website của cơ sở xem được.',
        go: { tab: 'reports', section: 'website', label: 'Mở Đơn khách từ website' },
      },
      {
        title: 'Đơn hàng đặt từ website',
        details: [
          'Tab "Đơn hàng": lọc theo trạng thái (cần báo giá, đã chốt, đang chuẩn bị, đang giao, đã giao, hoàn tất, đã hủy). Bấm vào đơn để xem người nhận, địa chỉ, ngày muốn nhận và các dòng hàng.',
          'Báo giá: nhập đơn giá từng dòng, số lượng chốt (không vượt số đặt), phí giao, ngày giao, ghi chú. Hoặc từ chối kèm lý do.',
          'Sau khi người mua chốt: chuẩn bị → giao đi → đã giao. Hủy thì phải ghi lý do. Chỉ hiện các nút đúng với trạng thái hiện tại của đơn.',
          'Ghi nhận thanh toán: chưa trả, một phần hoặc đã trả (thanh toán diễn ra ngoài hệ thống).',
          'Ghi chú không được chứa số điện thoại hay đường dẫn (quy định của website để chống lừa đảo).',
        ],
        tip: 'Phần đặt hàng và hoa hồng giao thương chỉ mở cho người dùng thật sau khi hoàn tất tư vấn pháp lý. Nếu chưa thấy đơn, hãy hỏi Agricovi.',
        go: { tab: 'reports', section: 'website', label: 'Mở Đơn khách từ website' },
      },
      {
        title: 'Ghi doanh thu từ đơn đã giao',
        details: [
          'Với đơn đã giao hoặc hoàn tất, bấm "Ghi doanh thu" (cần quyền sửa Doanh thu).',
          'App điền sẵn: vụ (suy ra từ sản phẩm niêm yết; nếu nhiều vụ thì bạn chọn), số kg, số tiền (đơn giá × số lượng chốt; phí giao hàng mặc định không cộng vào doanh thu), khách hàng.',
          'Bấm Lưu: tạo lần bán và công nợ phải thu cùng lúc, đánh dấu đơn "đã ghi doanh thu". Đơn đã ghi rồi thì app cảnh báo để không ghi hai lần.',
        ],
        tip: 'Số doanh thu này đi thẳng vào Tổng kết vụ nên lãi lỗ của vụ tự cập nhật.',
        go: { tab: 'reports', section: 'sales', label: 'Mở Doanh thu' },
      },
      {
        title: 'Đánh giá và giữ uy tín',
        details: [
          'Người mua có thể đánh giá cơ sở sau giao dịch. Đánh giá chưa trả lời hiện ở thẻ "Việc chờ từ website" trên Trang chủ; bấm để mở website trả lời.',
          'Trả lời nhanh, lịch sự và đúng sự thật. Huy hiệu và đánh giá tốt giúp người mua khác tin bạn hơn.',
          'Thấy nội dung vi phạm trên website thì báo cho quản trị website xử lý.',
        ],
      },
    ],
  },
];
