import type { TabId } from './tabs';

/**
 * Nội dung Hướng dẫn sử dụng. Mỗi hướng dẫn là danh sách BƯỚC đánh số (xem nhanh theo thứ tự việc phải làm);
 * bấm vào một bước thì mở phần chi tiết bên dưới, kèm nút nhảy tới đúng màn trong app.
 * Chỉ là chữ trong app (không đụng CSDL), xem được cả khi mất mạng. Sửa chữ ở đây.
 */
export interface GuideStep {
  title: string;
  /** Các ý chi tiết, mỗi ý một dòng (viết ngắn, dễ hiểu) */
  details: string[];
  /** Mẹo hoặc lưu ý (không bắt buộc) */
  tip?: string;
  /** Nút "Mở màn này" */
  go?: { tab: TabId; section?: string; label: string };
}

/** Sơ đồ: các chặng xếp từ trên xuống, trong chặng là các ô nối nhau bằng mũi tên; bấm ô để mở bước tương ứng */
export interface FlowNode { icon: string; label: string; step: number }
export interface FlowPhase { title: string; tone: 'info' | 'ok' | 'warn' | 'neutral'; nodes: FlowNode[] }

export interface Guide {
  id: GuideId;
  flow: FlowPhase[];
  label: string;
  icon: string;
  intro: string;
  steps: GuideStep[];
}

export type GuideId = 'intro' | 'household' | 'coop' | 'company';

export const GUIDES: Guide[] = [
  {
    id: 'intro',
    label: 'Giới thiệu hệ thống',
    icon: '📖',
    flow: [
      { title: 'Một vòng đời mùa vụ', tone: 'ok', nodes: [{ icon: '🧰', label: 'Khai báo', step: 1 }, { icon: '🌱', label: 'Tạo vụ', step: 1 }, { icon: '📒', label: 'Ghi việc mỗi ngày', step: 1 }, { icon: '🧺', label: 'Thu hoạch và bán', step: 1 }, { icon: '📊', label: 'Tổng kết', step: 1 }] },
      { title: 'Dùng hằng ngày', tone: 'info', nodes: [{ icon: '🧭', label: 'Thanh dưới và menu ☰', step: 2 }, { icon: '📶', label: 'Mất mạng vẫn ghi', step: 3 }, { icon: '🛡️', label: 'Ai làm được gì', step: 4 }] },
      { title: 'Yên tâm và cài đặt', tone: 'neutral', nodes: [{ icon: '🔒', label: 'Dữ liệu riêng tư', step: 5 }, { icon: '📲', label: 'Cài lên điện thoại', step: 6 }] },
    ],
    intro: 'AgriConnect là app giúp bạn ghi chép và quản lý nuôi trồng ngay trên điện thoại, thay cho sổ tay. Đọc nhanh 7 ý dưới đây, bấm vào từng ý để xem thêm.',
    steps: [
      {
        title: 'AgriConnect giúp được gì cho bạn',
        details: [
          'Ghi nhật ký việc hằng ngày: bón phân, tưới, phun thuốc, chăm sóc… ai làm, làm lúc nào.',
          'Theo dõi vật tư trong kho, chi phí, doanh thu, thu hoạch và công nợ.',
          'Chấm công và tính tiền công cho người làm.',
          'Biết mỗi vụ lời hay lỗ (Tổng kết vụ) và giá thành mỗi ký.',
          'Tạo mã QR truy xuất nguồn gốc để khách quét xem được quá trình nuôi trồng.',
          'Đưa sản phẩm lên website để khách hàng tìm đến.',
        ],
      },
      {
        title: 'Một vòng đời mùa vụ gồm 5 bước',
        details: [
          '1) Khai báo: trang trại, sản phẩm, vật tư, quy trình mẫu (làm một lần, dùng nhiều vụ).',
          '2) Tạo vụ: chọn sản phẩm, trang trại và quy trình mẫu; app tự lập lịch các giai đoạn.',
          '3) Ghi việc hằng ngày: mỗi việc làm xong bấm nút ＋ Ghi việc, ghi cả vật tư đã dùng.',
          '4) Thu hoạch và bán: ghi sản lượng, hao hụt, doanh thu, khách còn nợ.',
          '5) Tổng kết: xem chi phí, doanh thu, lãi lỗ, giá thành mỗi ký của cả vụ.',
        ],
      },
      {
        title: 'Các mục trong app dùng để làm gì',
        details: [
          'Thanh dưới cùng: Trang chủ (tổng quan, nhắc việc) · Sản xuất (mùa vụ, chấm công, thu hoạch, kho, nhật ký) · Ghi việc (nút ＋ ở giữa) · Báo cáo.',
          'Menu ☰ góc trên bên trái: Tổ chức (nhân sự, vai trò, tổ lao động) · Khai báo · Hướng dẫn sử dụng · Tài khoản.',
          'Chạm vào ô chức năng để vào; bấm "‹ Menu" để quay lại.',
        ],
      },
      {
        title: 'Khi mất mạng thì sao',
        details: [
          'Các việc hằng ngày của nhân viên (ghi nhật ký, vật tư đã dùng, thu hoạch, chấm công) vẫn ghi được khi mất mạng; app giữ trên máy và tự gửi lên khi có mạng lại.',
          'Chấm xanh/đỏ ở góc trên cho biết đang có mạng hay không; dòng cam "chờ gửi" cho biết còn bao nhiêu bản ghi chưa lên máy chủ.',
          'Những việc quản lý (khai báo, mời người, xem báo cáo mới…) cần có mạng. Báo cáo đã xem trước đó vẫn đọc lại được.',
        ],
        tip: 'Đừng đăng xuất khi còn bản ghi "chờ gửi": chúng có thể bị mất.',
      },
      {
        title: 'Ai làm được gì (vai trò và quyền)',
        details: [
          'Chỉ có 3 vai trò: Chủ cơ sở, Quản lý, Nhân viên.',
          'Chủ cơ sở: làm được mọi việc, cấp quyền, đặt lương và giá công, xem gói dịch vụ và giấy phép.',
          'Quản lý: điều hành sản xuất hằng ngày (tạo vụ, sửa nhật ký, xác nhận chấm công), xem Kho và danh sách nhân sự, xem Báo cáo tuần (phần tiền chỉ hiện khi được cấp quyền).',
          'Nhân viên: ghi việc, thu hoạch, chấm công của mình và xem tiền công của mình.',
          'Chức vụ: chủ tạo chức vụ cho cơ sở (ví dụ Thủ kho và kế toán, Tổ trưởng vườn). Mỗi chức vụ có MỘT vai trò (mặc định Nhân viên; chọn Quản lý thì chọn thêm quyền). Mỗi người giữ đúng một chức vụ, chọn ở mục Nhân sự; vai trò và quyền của người theo chức vụ. Mục nào không có quyền thì không hiện.',
          'Chủ có thể giao mỗi người một hay nhiều trang trại; người đó chỉ thấy và ghi việc ở các trang trại được giao.',
        ],
        go: { tab: 'org', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Dữ liệu của bạn có riêng tư không',
        details: [
          'Có. Dữ liệu vận hành (chi phí, doanh thu, nhật ký…) chỉ người trong cơ sở có quyền mới xem được.',
          'Website chỉ hiện phần bạn chủ động công khai và đã được duyệt (hồ sơ, sản phẩm, truy xuất).',
          'Việc hủy một bản ghi chỉ đánh dấu hủy, không xóa mất dấu vết; mọi thay đổi đều có lịch sử.',
        ],
      },
      {
        title: 'Cài app lên điện thoại và cập nhật',
        details: [
          'Mở app bằng trình duyệt, chọn "Thêm vào màn hình chính" để có biểu tượng như app thường.',
          'App tự cập nhật âm thầm: bản mới có hiệu lực sau 1–2 lần mở lại. Phiên bản đang chạy ghi ở cuối menu ☰.',
        ],
      },
    ],
  },
  {
    id: 'household',
    label: 'Hướng dẫn Hộ nuôi trồng',
    icon: '🌾',
    flow: [
      { title: 'Làm một lần đầu', tone: 'info', nodes: [{ icon: '📝', label: 'Đăng ký', step: 0 }, { icon: '🏡', label: 'Trang trại', step: 1 }, { icon: '🌾', label: 'Sản phẩm', step: 2 }, { icon: '📦', label: 'Kho và vật tư', step: 3 }, { icon: '📋', label: 'Quy trình mẫu', step: 4 }] },
      { title: 'Mỗi vụ', tone: 'ok', nodes: [{ icon: '📥', label: 'Nhập kho', step: 5 }, { icon: '🌱', label: 'Tạo vụ', step: 6 }] },
      { title: 'Mỗi ngày', tone: 'ok', nodes: [{ icon: '⏱', label: 'Vào ca → Ghi việc → Ra ca', step: 7 }] },
      { title: 'Khi có thu và chi', tone: 'warn', nodes: [{ icon: '🧺', label: 'Thu hoạch và bán', step: 8 }, { icon: '💳', label: 'Chi phí và công nợ', step: 9 }] },
      { title: 'Quản lý và kết quả', tone: 'neutral', nodes: [{ icon: '👥', label: 'Người làm, chấm công', step: 10 }, { icon: '📊', label: 'Kết quả và website', step: 11 }] },
    ],
    intro: 'Làm lần lượt từ bước 1 đến bước 12. Bước 1–5 chỉ làm một lần đầu; từ bước 6 là việc lặp lại mỗi vụ, mỗi ngày.',
    steps: [
      {
        title: 'Đăng ký tài khoản và tạo cơ sở',
        details: [
          'Đăng ký bằng email (hoặc nhận tài khoản do chủ tạo nếu bạn là nhân viên, đăng nhập bằng số điện thoại).',
          'Chọn loại cơ sở "Hộ" và đặt tên, ví dụ "Vườn nhà màng Thành Công".',
          'Một người có thể có nhiều cơ sở; đổi cơ sở ở đầu menu ☰.',
        ],
      },
      {
        title: 'Khai báo trang trại',
        details: [
          'Trang trại là nơi bạn nuôi trồng: vườn, ao, chuồng, nhà màng…',
          'Nhập tên, diện tích, vị trí và ảnh (nếu có). Có nhiều vườn/ao thì thêm từng cái.',
        ],
        go: { tab: 'declare', section: 'areas', label: 'Mở Trang trại' },
      },
      {
        title: 'Khai báo sản phẩm',
        details: [
          'Chọn cây trồng/vật nuôi có sẵn hoặc thêm loại riêng của bạn.',
          'Mục có sẵn không đúng ý thì sửa hoặc dừng dùng riêng cho cơ sở của bạn.',
        ],
        go: { tab: 'declare', section: 'crops', label: 'Mở Sản phẩm' },
      },
      {
        title: 'Khai báo kho, đơn vị và vật tư',
        details: [
          'Kho và đơn vị: tạo nơi cất giữ (kho phân, kho thuốc…) và đơn vị tính (kg, lít, bao…).',
          'Vật tư: app đã tạo sẵn danh sách vật tư thường dùng; bạn sửa, thêm vật tư của mình, đặt mức tồn tối thiểu để được cảnh báo sắp hết.',
        ],
        go: { tab: 'declare', section: 'places', label: 'Mở Kho và đơn vị' },
      },
      {
        title: 'Lập quy trình mẫu',
        details: [
          'Quy trình mẫu là danh sách các giai đoạn và công việc cho một loại sản phẩm (ví dụ: làm đất → gieo → chăm sóc → thu hoạch).',
          'Làm một lần, dùng cho nhiều vụ. Có thể nhân bản một mẫu rồi sửa.',
          'Đầu việc là danh mục các loại việc để chọn khi ghi nhật ký; thêm loại việc riêng nếu cần.',
        ],
        go: { tab: 'declare', section: 'templates', label: 'Mở Quy trình mẫu' },
      },
      {
        title: 'Nhập kho vật tư ban đầu',
        details: [
          'Vào Sản xuất → Kho, chọn Nhập kho: chọn vật tư, số lượng, giá, ngày nhập.',
          'Kho tính giá vốn bình quân và tự trừ khi bạn ghi vật tư đã dùng.',
          'Kiểm kho lệch thì dùng "Điều chỉnh": app ghi lại lý do, không sửa đè.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Kho' },
      },
      {
        title: 'Tạo vụ theo quy trình mẫu',
        details: [
          'Vào Sản xuất → Mùa vụ → Tạo vụ: chọn trang trại, sản phẩm, quy trình mẫu và ngày bắt đầu.',
          'App lập lịch các giai đoạn. Xem Quy trình & Lịch của vụ để biết hôm nay cần làm gì.',
          'Cần đổi giai đoạn hoặc ngày thì sửa trong chi tiết vụ; có thể ghi chú theo ngày và được nhắc ở Trang chủ.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Mùa vụ' },
      },
      {
        title: 'Hằng ngày: vào ca, ghi việc, ra ca',
        details: [
          'Vào ca khi bắt đầu làm; app có thể nhắc giai đoạn của hôm nay.',
          'Bấm nút ＋ Ghi việc ở giữa thanh dưới: chọn vụ, loại việc, nhập "Nội dung việc" (có thể bấm micro để nói), thêm vật tư đã dùng và ảnh.',
          'Ghi sai thì vào Nhật ký việc để sửa hoặc hủy (có lịch sử). Mất mạng vẫn ghi được.',
          'Xong việc thì Ra ca.',
        ],
        tip: 'Ghi ngay sau khi làm xong, số liệu chi phí và giá thành sẽ đúng hơn.',
        go: { tab: 'production', section: 'logs', label: 'Mở Nhật ký việc' },
      },
      {
        title: 'Thu hoạch và bán hàng',
        details: [
          'Sản xuất → Thu hoạch: ghi ngày, sản lượng và hao hụt. Số thu hoạch tính là sau hao hụt.',
          'Báo cáo → Doanh thu: ghi lần bán (khách, số lượng, tiền). Khách chưa trả hết thì ghi hạn thu tiền, app nhắc khi quá hạn.',
          'Khách hàng khai báo ở Khai báo → Khách hàng.',
        ],
        go: { tab: 'production', section: 'harvest', label: 'Mở Thu hoạch' },
      },
      {
        title: 'Chi phí và công nợ',
        details: [
          'Sản xuất → Chi phí: ghi các khoản chi theo 6 nhóm (vật tư, nhân công, nhiên liệu…).',
          'Mua vật tư chưa trả hết tiền: ghi số hóa đơn và hạn trả (bạn tự nhập), app nhắc khi sắp hoặc đã quá hạn.',
          'Công nợ: xem tổng nợ phải trả và phải thu, tuổi nợ, ghi lần trả/thu tiếp theo.',
        ],
        go: { tab: 'production', section: 'expense', label: 'Mở Chi phí' },
      },
      {
        title: 'Mời người làm, chấm công, tiền công',
        details: [
          'Tổ chức → Nhân sự: tạo tài khoản cho người làm bằng số điện thoại, chọn chức vụ. Lần đầu họ phải đổi mật khẩu tạm.',
          'Tổ chức → Phòng / Tổ: chia người vào tổ, chọn tổ trưởng.',
          'Tổ chức → Nhân sự → bấm vào người → Trả công: đặt cách trả riêng cho từng người, theo giờ làm (đồng/giờ) hoặc lương cố định theo tháng.',
          'Sản xuất → Chấm công: xác nhận ca công. Báo cáo → Bảng lương (xem một tháng): bấm Tính lương, nhập thưởng/phạt/tạm ứng ở chi tiết từng người (có lý do, tự tính lại), xử lý hết việc còn dang dở rồi chủ khóa kỳ. Mỗi người xem lương và công của mình (từng ngày vào ca/ra ca, thưởng, phạt, tạm ứng, thực nhận) ở Báo cáo → Bảng lương; chủ xem được từng người, tất cả hoặc theo tổ.',
        ],
        go: { tab: 'org', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Xem kết quả và đưa sản phẩm lên website',
        details: [
          'Trang chủ: số liệu tháng, xu hướng, cảnh báo. Báo cáo → Báo cáo tuần: tóm tắt tuần (chủ, quản lý) và nút chia sẻ.',
          'Báo cáo → Tổng kết vụ: chi phí, doanh thu, lãi lỗ, giá thành mỗi ký (chỉ tính khi đủ số liệu); xuất ra bảng CSV.',
          'Báo cáo → Theo nhu cầu: tự chọn loại báo cáo, bộ lọc, xem dạng biểu đồ hoặc bảng và lưu lại.',
          'Báo cáo → Hồ sơ website: soạn hồ sơ, gửi duyệt để hiện trên website. Mỗi vụ có mã QR truy xuất để in dán lên sản phẩm.',
        ],
        go: { tab: 'reports', section: 'summary', label: 'Mở Tổng kết vụ' },
      },
    ],
  },
  {
    id: 'coop',
    label: 'Hướng dẫn Hợp tác xã',
    icon: '🤝',
    flow: [
      { title: 'Thiết lập', tone: 'info', nodes: [{ icon: '🏛️', label: 'Tạo cơ sở HTX', step: 0 }, { icon: '🤝', label: 'Mời hộ thành viên', step: 1 }, { icon: '📋', label: 'Khai báo chung', step: 2 }] },
      { title: 'Vận hành', tone: 'ok', nodes: [{ icon: '🌱', label: 'Theo dõi vụ và sản lượng', step: 3 }, { icon: '👥', label: 'Nhân sự, chấm công', step: 4 }] },
      { title: 'Công khai', tone: 'neutral', nodes: [{ icon: '🌐', label: 'Giấy phép, QR, website', step: 5 }] },
    ],
    intro: 'Hợp tác xã dùng các bước như hộ (xem Hướng dẫn Hộ nuôi trồng) và thêm phần quản lý hộ thành viên dưới đây.',
    steps: [
      {
        title: 'Tạo cơ sở loại Hợp tác xã',
        details: [
          'Khi tạo cơ sở, chọn loại "Hợp tác xã" và đặt tên.',
          'Chủ là người đại diện; có thể gán chức vụ Quản lý hợp tác xã cho một quản lý để mời và theo dõi hộ thành viên.',
        ],
      },
      {
        title: 'Mời và quản lý hộ thành viên',
        details: [
          'Tổ chức → Hộ thành viên: mời hộ bằng lời mời; hộ chấp nhận thì thành thành viên.',
          'Mỗi hộ vẫn có cơ sở riêng và tự quản dữ liệu của mình; hợp tác xã chỉ thấy phần hộ đồng ý chia sẻ.',
          'Hộ rời đi thì dữ liệu của hộ vẫn thuộc về hộ.',
        ],
        go: { tab: 'org', section: 'coop', label: 'Mở Hộ thành viên' },
      },
      {
        title: 'Khai báo chung: sản phẩm, vật tư, quy trình mẫu',
        details: [
          'Hợp tác xã khai báo danh mục sản phẩm, vật tư và quy trình mẫu chuẩn để các hộ làm theo một cách.',
          'Mỗi hộ có thể điều chỉnh riêng cho phù hợp với vườn của mình.',
        ],
        go: { tab: 'declare', section: 'templates', label: 'Mở Quy trình mẫu' },
      },
      {
        title: 'Theo dõi mùa vụ và sản lượng',
        details: [
          'Xem tiến độ các vụ đang chạy, vụ trễ tiến độ ở Trang chủ và Sản xuất → Mùa vụ.',
          'Tổng hợp thu hoạch, doanh thu, chi phí theo vụ ở Tổng kết vụ và Báo cáo theo nhu cầu.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Mùa vụ' },
      },
      {
        title: 'Nhân sự, chấm công và tiền công của hợp tác xã',
        details: [
          'Chia phòng/tổ, đặt chức vụ và quyền theo mục cho từng người (Tổ chức → Chức vụ).',
          'Chấm công, xác nhận công và tính tiền công giống như hộ.',
        ],
        go: { tab: 'org', section: 'positions', label: 'Mở Chức vụ' },
      },
      {
        title: 'Giấy phép, truy xuất và hồ sơ trên website',
        details: [
          'Tài khoản → Giấy phép: lưu giấy chứng nhận, ngày hết hạn; app nhắc khi sắp hết hạn.',
          'Mỗi vụ có mã QR truy xuất; Báo cáo → Hồ sơ website để giới thiệu hợp tác xã và sản phẩm với khách.',
        ],
        go: { tab: 'reports', section: 'commerce', label: 'Mở Hồ sơ website' },
      },
    ],
  },
  {
    id: 'company',
    label: 'Hướng dẫn Công ty',
    icon: '🏢',
    flow: [
      { title: 'Thiết lập tổ chức', tone: 'info', nodes: [{ icon: '🏢', label: 'Tạo cơ sở', step: 0 }, { icon: '🧑‍🤝‍🧑', label: 'Phòng / Tổ', step: 1 }, { icon: '🛡️', label: 'Phân quyền', step: 2 }] },
      { title: 'Sản xuất và tiền', tone: 'ok', nodes: [{ icon: '🏡', label: 'Nhiều trang trại, nhiều vụ', step: 3 }, { icon: '💳', label: 'Nhà cung ứng, khách, nợ', step: 4 }, { icon: '⏱', label: 'Chấm công, tiền công', step: 5 }] },
      { title: 'Công khai và bán', tone: 'neutral', nodes: [{ icon: '🌐', label: 'Giấy phép, QR, đơn website', step: 6 }] },
    ],
    intro: 'Công ty có nhiều người và nhiều bộ phận nên cần chia quyền cẩn thận. Các thao tác khác giống Hướng dẫn Hộ nuôi trồng.',
    steps: [
      {
        title: 'Tạo cơ sở và đặt người phụ trách',
        details: [
          'Tạo cơ sở, đặt tên công ty. Chủ cơ sở là người có toàn quyền.',
          'Thêm Quản lý để điều hành hằng ngày; nếu cần người chỉ lo hồ sơ website, gán chức vụ Biên tập hồ sơ cho một nhân viên.',
        ],
      },
      {
        title: 'Chia phòng / tổ và đặt chức vụ',
        details: [
          'Tổ chức → Phòng / Tổ: lập phòng ban, tổ sản xuất, chọn tổ trưởng.',
          'Tổ chức → Chức vụ: đặt tên chức vụ riêng của công ty (ví dụ Thủ kho, Kế toán), chọn vai trò (Nhân viên hoặc Quản lý) và quyền thêm cho chức vụ đó.',
        ],
        go: { tab: 'org', section: 'teams', label: 'Mở Phòng / Tổ' },
      },
      {
        title: 'Phân quyền theo từng mục',
        details: [
          'Quyền theo từng chức vụ: xem hoặc sửa các mục Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tiền công, Hồ sơ website. Cần ngoại lệ cho một người thì chủ cấp riêng thêm hoặc bớt.',
          'Giao trang trại cho từng người (một người làm được nhiều trang trại): họ chỉ thấy và ghi việc ở trang trại được giao.',
          'Người nào không có quyền mục nào thì mục đó biến mất trên màn hình của họ, và máy chủ cũng chặn.',
          'Có thể tạm dừng một thành viên khi họ nghỉ làm mà không mất dữ liệu cũ.',
        ],
        tip: 'Chỉ cấp quyền xem tiền (Chi phí, Doanh thu) cho người thật sự cần.',
        go: { tab: 'org', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Nhiều trang trại, nhiều vụ chạy song song',
        details: [
          'Khai báo từng trang trại, tạo nhiều vụ cho từng sản phẩm; lọc theo vụ khi ghi việc và xem báo cáo.',
          'Theo dõi vụ trễ tiến độ và vật tư sắp hết ở Trang chủ.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Mùa vụ' },
      },
      {
        title: 'Nhà cung ứng, khách hàng và công nợ',
        details: [
          'Khai báo nhà cung ứng và khách hàng; ghi mua hàng, bán hàng kèm hạn trả/thu.',
          'Báo cáo → Công nợ: xem nợ phải trả, phải thu và tuổi nợ; Báo cáo theo nhu cầu cho báo cáo mua hàng và theo khách.',
        ],
        go: { tab: 'reports', section: 'payables', label: 'Mở Công nợ' },
      },
      {
        title: 'Chấm công và tiền công cho nhiều người',
        details: [
          'Đặt đơn giá theo giờ cho từng người (hồ sơ nhân sự), xác nhận công theo tổ, tính lương theo kỳ và khóa kỳ khi đã chốt.',
          'Báo cáo giờ công theo người và theo phòng/tổ.',
        ],
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Giấy phép, truy xuất, hồ sơ website và đơn khách',
        details: [
          'Tài khoản → Giấy phép: lưu chứng nhận, theo dõi ngày hết hạn.',
          'In mã QR truy xuất cho từng vụ; soạn hồ sơ công ty để hiện trên website.',
          'Báo cáo → Đơn khách từ website: báo giá, xử lý đơn đặt hàng và ghi doanh thu từ đơn.',
        ],
        go: { tab: 'reports', section: 'website', label: 'Mở Đơn khách từ website' },
      },
    ],
  },
];

/** Lời giới thiệu gửi cho người khác (nút "Chia sẻ hệ thống") */
export function buildShareText(url: string): string {
  return [
    'AGRICONNECT — App quản lý nuôi trồng trên điện thoại',
    '',
    'Dành cho hộ nuôi trồng, hợp tác xã và công ty nông nghiệp:',
    '• Ghi nhật ký việc hằng ngày, kể cả khi mất mạng',
    '• Theo dõi kho vật tư, chi phí, doanh thu, thu hoạch, công nợ',
    '• Chấm công và tính tiền công cho người làm',
    '• Biết mỗi vụ lời hay lỗ, giá thành mỗi ký',
    '• Mã QR truy xuất nguồn gốc, đưa sản phẩm lên website',
    '',
    `Mở và dùng thử tại: ${url}`,
  ].join('\n');
}
