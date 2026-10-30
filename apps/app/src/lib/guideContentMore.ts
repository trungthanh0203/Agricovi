import type { Guide } from './guideContent';

/**
 * Các hướng dẫn thêm (D122): Khai báo cơ sở, Tương tác website. Ghép vào danh sách và sắp thứ tự ở guideContent.ts (GUIDES).
 * Chỉ là chữ trong app, không đụng CSDL. Cách viết giống guideContent.ts: mỗi bước nói LÀM GÌ và VÌ SAO.
 */
export const MORE_GUIDES: Guide[] = [
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
          'Khai báo → Phân khu → "+ Thêm phân khu": tên, loại, mã khu, vị trí, mô tả, ảnh. Phân khu là cụm (ví dụ "Vườn Đông"), không nhập diện tích hay kiểu nhà/chuồng ở đây.',
          'Loại "Cơ sở vật chất" dành cho chỗ không nuôi trồng (cổng, kho, biogas) để ghi những việc không thuộc vụ nào.',
          'Phân khu có hai cấp: PHÂN KHU (cụm) và bên trong là Ô SẢN XUẤT (nhà màng, chuồng, ao… do bạn đặt tên). Ô sản xuất mới có đủ thông tin: mã ô, kiểu nhà/chuồng, diện tích, mô tả, ảnh.',
          'Khi thêm phân khu, app tạo sẵn các ô (mặc định 1, tối đa 50). Thêm sau: "+ Ô sản xuất" (một ô) hoặc "+ Nhiều ô cùng lúc" (nhập số lượng, app tự đánh số). Phân khu cũ đang có vụ thì bấm "Chia thành ô sản xuất": app tạo ô đầu tiên và chuyển các vụ hiện có sang đó.',
          'Mỗi vụ chạy trong MỘT ô sản xuất (hoặc một phân khu cũ chưa chia nhỏ). Diện tích dùng để tính năng suất, mật độ và chia vật tư dùng chung theo diện tích; diện tích phân khu tự cộng từ các ô.',
          'Cơ sở đông người có thể giao mỗi người một hay nhiều phân khu hoặc ô sản xuất: giao phân khu thì họ thấy mọi ô bên trong, giao riêng một ô thì chỉ thấy ô đó (Khai báo → Nhân sự).',
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
          'Khai báo → Máy chấm công: liên kết một điện thoại cố định làm máy chấm công, gắn với phân khu cấp 1 (nơi đặt máy). Tiền công không tính theo ô sản xuất; chủ nhập chi phí nhân công theo vụ ở Chi phí.',
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
