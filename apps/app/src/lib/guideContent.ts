import type { TabId } from './tabs';

/**
 * Nội dung Hướng dẫn sử dụng. Mỗi hướng dẫn là danh sách BƯỚC đánh số (xem nhanh theo thứ tự việc phải làm);
 * bấm vào một bước thì mở phần chi tiết bên dưới, kèm nút nhảy tới đúng màn trong app.
 * Mỗi bước nói rõ LÀM GÌ và VÌ SAO (logic bên trong) để người dùng hiểu chứ không chỉ bấm theo.
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

/** Sơ đồ: các chặng xếp từ trên xuống, trong chặng là các ô nối nhau bằng mũi tên; bấm ô để mở bước tương ứng (số thứ tự tính từ 0) */
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

export type GuideId = 'intro' | 'household' | 'process' | 'stock' | 'staff' | 'coop' | 'company';

export const GUIDES: Guide[] = [
  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'intro',
    label: 'Giới thiệu hệ thống',
    icon: '📖',
    flow: [
      { title: 'Hiểu hệ thống', tone: 'info', nodes: [{ icon: '🌾', label: 'Dùng để làm gì', step: 0 }, { icon: '🧩', label: 'Các khái niệm', step: 1 }, { icon: '🔄', label: 'Một vòng mùa vụ', step: 2 }] },
      { title: 'Dùng hằng ngày', tone: 'ok', nodes: [{ icon: '🧭', label: 'Menu và các màn', step: 3 }, { icon: '💰', label: 'Tiền được tính thế nào', step: 4 }, { icon: '📶', label: 'Mất mạng thì sao', step: 5 }] },
      { title: 'Yên tâm', tone: 'neutral', nodes: [{ icon: '🛡️', label: 'Ai làm được gì', step: 6 }, { icon: '🔒', label: 'Dữ liệu riêng tư', step: 7 }, { icon: '📲', label: 'Cài lên điện thoại', step: 8 }] },
    ],
    intro: 'Agricovi là app giúp bạn ghi chép và quản lý nuôi trồng ngay trên điện thoại, thay cho sổ tay. Đọc lần lượt 9 ý dưới đây một lần để hiểu cách hệ thống nghĩ; sau đó mở các hướng dẫn còn lại khi cần làm việc cụ thể.',
    steps: [
      {
        title: 'Agricovi dùng để làm gì',
        details: [
          'Ghi nhật ký việc hằng ngày: bón phân, tưới, phun thuốc, chăm sóc… làm việc gì, lúc nào, dùng vật tư gì.',
          'Theo dõi kho vật tư, chi phí, doanh thu, thu hoạch và công nợ.',
          'Chấm công, tính và chốt lương cho người làm; mỗi người tự xem bảng lương của mình.',
          'Biết mỗi vụ lời hay lỗ (Tổng kết vụ) và giá thành mỗi ký.',
          'Tạo mã QR truy xuất nguồn gốc và đưa sản phẩm lên website để khách tìm đến.',
        ],
        tip: 'Mọi con số trong báo cáo đều đi ra từ những gì bạn ghi hằng ngày. Ghi đủ và đúng thì báo cáo đúng; không có phép màu nào khác.',
      },
      {
        title: 'Các khái niệm cần nhớ (đọc một lần)',
        details: [
          'Cơ sở: nơi của bạn (Hộ, Hợp tác xã hoặc Công ty). Mỗi cơ sở có dữ liệu riêng, không lẫn với cơ sở khác.',
          'Phân khu: chỗ nuôi trồng cụ thể như vườn, ao, chuồng, nhà màng. Có thêm loại "Cơ sở vật chất" (cổng, kho, biogas…) để ghi những việc không thuộc vụ nào.',
          'Sản phẩm: loại cây trồng hoặc vật nuôi (dưa lưới, heo thịt, tôm…).',
          'Quy trình → Công đoạn → Việc: quy trình là "công thức" làm một loại sản phẩm; chia thành các công đoạn (ví dụ Chuẩn bị đất, Chăm sóc, Thu hoạch); mỗi công đoạn gồm các việc (làm đất, bón lót, tưới, phun thuốc…). Làm một lần, dùng cho nhiều vụ.',
          'Vụ: một lần nuôi trồng thật, gồm sản phẩm + phân khu + ngày bắt đầu. Khi tạo vụ, app sao quy trình thành lịch riêng của vụ đó; sửa lịch của vụ không làm đổi quy trình gốc.',
          'Ghi việc: bản ghi "tôi đã làm việc này, hôm nay, cho vụ này, dùng vật tư này". Đây là nhật ký của vụ và là nguồn tính chi phí vật tư.',
          'Chấm công khác Ghi việc: Chấm công cho biết AI có mặt từ mấy giờ đến mấy giờ (để tính tiền công). Ghi việc cho biết VIỆC GÌ đã làm cho vụ nào (để có nhật ký, vật tư, truy xuất). Hai thứ độc lập, không bắt buộc cái này mới có cái kia.',
        ],
      },
      {
        title: 'Một vòng đời mùa vụ',
        details: [
          '1) Khai báo (làm một lần): phân khu, sản phẩm, kho và vật tư, quy trình. Nhờ đó các bước sau chỉ việc chọn, không phải gõ lại.',
          '2) Tạo vụ: chọn sản phẩm, quy trình, phân khu và ngày bắt đầu; app tự lập lịch các công đoạn. Bắt đầu muộn hay làm lệch kế hoạch thì lịch tự dời theo thực tế.',
          '3) Làm và ghi hằng ngày: bấm ＋ Ghi việc sau mỗi việc; chấm công cho người làm. Người quản lý bấm Bắt đầu / Xong từng việc ở Quản lý vụ.',
          '4) Thu hoạch và bán: ghi sản lượng, hao hụt, lần bán, khách còn nợ.',
          '5) Tổng kết: chi phí, doanh thu, lãi lỗ, giá thành mỗi ký của cả vụ. Số liệu này chính xác tới mức nào là do 3 bước trên được ghi đủ tới mức đó.',
        ],
      },
      {
        title: 'Menu và các màn trong app',
        details: [
          'Thanh dưới cùng: Trang chủ · Khai báo · nút ＋ Ghi việc (giữa) · Sản xuất · Báo cáo.',
          'Trang chủ: sơ đồ luồng việc, nhắc việc hôm nay, số liệu tháng, cảnh báo (kho sắp hết, lô sắp hết hạn, hóa đơn sắp đến hạn, công chờ xác nhận…).',
          'Khai báo = những thứ làm một lần rồi ít đổi: Phân khu, Sản phẩm, Kho, Vật tư, Nhà cung ứng, Máy chấm công, Tạo quy trình, Việc, Nhân sự, Chức vụ, Tổ chức, Khách hàng, Giấy phép. Menu chia thành các khung cho dễ tìm.',
          'Sản xuất = việc làm hằng ngày: Vụ nuôi trồng (Quản lý vụ), Thu hoạch, Quản lý kho, Chi phí, Chấm công, Nhật ký việc.',
          'Báo cáo = xem kết quả: Báo cáo tuần, Công nợ, Doanh thu, Bảng lương, Tổng kết vụ, Sổ nhật ký, Bảng kiểm, Hồ sơ web…',
          'Menu ☰ góc trên bên trái: đổi cơ sở, Cấu hình (chọn loại sản phẩm bạn thật sự làm, nhóm vật tư, nhóm chi phí, kiểu nhà/chuồng, có dùng công đoạn hay không…), Hướng dẫn sử dụng, Tài khoản, Chia sẻ hệ thống.',
          'Mục nào bạn không có quyền hoặc cơ sở không dùng thì tự ẩn để màn hình ngắn gọn. Bấm "‹ Menu" để quay lại.',
        ],
      },
      {
        title: 'Tiền được tính thế nào (logic chi phí và lãi lỗ)',
        details: [
          'Vật tư: bạn nhập kho khi MUA (chưa tính vào chi phí vụ). Tiền vật tư chỉ vào chi phí của vụ lúc bạn DÙNG nó (ghi việc có vật tư, hoặc xuất kho cho vụ). Giá lấy theo giá vốn bình quân trong kho. Vì vậy đừng ghi thêm tiền mua vật tư ở mục Chi phí, sẽ bị tính hai lần.',
          'Tiền công: chỉ công đã được chủ hoặc quản lý XÁC NHẬN mới được tính; số giờ nhân với đơn giá của từng người, rồi chốt theo tháng ở Bảng lương. Công gắn với một vụ (nếu bạn chọn vụ khi chấm công) thì vào chi phí của vụ đó; công không gắn vụ là chi phí chung của cơ sở.',
          'Chi phí khác (điện nước, thuê, khấu hao…): ghi ở Sản xuất → Chi phí, gắn vụ nếu của riêng một vụ.',
          'Doanh thu: ghi mỗi lần bán ở Báo cáo → Doanh thu (khách, số lượng, tiền, còn nợ bao nhiêu).',
          'Lãi/Lỗ của vụ = Doanh thu − Chi phí. Giá thành mỗi kg = Chi phí ÷ Sản lượng thật đã trừ hao hụt. App chỉ tính giá thành khi đủ số liệu; thiếu giá vật tư hay chưa có thu hoạch thì hiện "chưa đủ số liệu" thay vì đưa con số sai.',
          'Ngày nào đã ghi thì không xóa: sửa là tạo điều chỉnh có lý do, hủy là đánh dấu hủy. Nhờ đó số liệu luôn truy ngược được.',
        ],
      },
      {
        title: 'Khi mất mạng thì sao',
        details: [
          'Việc hằng ngày của người làm ở ngoài đồng vẫn ghi được khi mất mạng: Ghi việc (nhật ký và vật tư đã dùng) và phiếu thu hoạch. App giữ trên máy rồi tự gửi lên khi có mạng.',
          'Mọi việc còn lại cần có mạng: khai báo, nhập/xuất kho, chấm công, xác nhận công, tạo vụ, sửa/hủy… Lý do: những việc này cần máy chủ kiểm tra quyền, tồn kho, trùng lặp ngay lúc bấm, nếu làm tạm trên máy sẽ dễ lệch số.',
          'Chấm xanh/đỏ ở góc trên cho biết đang có mạng hay không; dòng cam "chờ gửi" cho biết còn bao nhiêu bản ghi chưa lên máy chủ.',
          'Báo cáo đã xem trước đó vẫn đọc lại được khi mất mạng.',
        ],
        tip: 'Đừng đăng xuất khi còn bản ghi "chờ gửi": chúng có thể bị mất.',
      },
      {
        title: 'Ai làm được gì (vai trò và quyền)',
        details: [
          'Có 3 vai trò: Chủ cơ sở, Quản lý, Nhân viên.',
          'Chủ cơ sở: làm được mọi việc, cấp quyền, đặt cách trả công, chốt lương, liên kết máy chấm công.',
          'Quản lý: điều hành sản xuất hằng ngày (tạo vụ, sửa nhật ký, xác nhận chấm công, chấm công cho người làm), xem Kho và danh sách nhân sự; phần tiền chỉ hiện khi được cấp quyền.',
          'Nhân viên: ghi việc, thu hoạch và xem Bảng lương của chính mình. Nhân viên chấm công ở máy chấm công bằng số điện thoại + PIN, không bấm trong tài khoản.',
          'Chức vụ: chủ tạo chức vụ (ví dụ Thủ kho và kế toán, Tổ trưởng vườn). Mỗi chức vụ có MỘT vai trò và danh sách quyền theo mục (Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tiền công, Hồ sơ website). Mỗi người giữ một chức vụ. Cần ngoại lệ cho riêng một người thì chủ cấp thêm hoặc bớt.',
          'Phân khu làm việc: chủ giao mỗi người một hay nhiều phân khu; người đó chỉ thấy và ghi việc ở phân khu được giao.',
          'Quyền được kiểm ở MÁY CHỦ chứ không chỉ ẩn nút trên màn hình, nên không thể lách bằng cách mở app theo cách khác.',
        ],
        go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Dữ liệu của bạn có riêng tư không',
        details: [
          'Có. Dữ liệu vận hành (chi phí, doanh thu, nhật ký, lương…) chỉ người trong cơ sở có quyền mới xem được.',
          'Website chỉ hiện phần bạn chủ động công khai và đã được duyệt (hồ sơ, sản phẩm, truy xuất).',
          'Mật khẩu và PIN không ai đọc lại được (kể cả chủ); quên thì cấp lại. PIN do chính người làm tự đặt.',
          'Ảnh và khuôn mặt ở máy chấm công: chỉ lưu khi máy nghi ngờ, chỉ chủ và quản lý xem, giữ 60 ngày; chủ xóa được dữ liệu khuôn mặt của từng người.',
        ],
      },
      {
        title: 'Cài app lên điện thoại và cập nhật',
        details: [
          'Ở trang đăng nhập có hướng dẫn cài theo từng thiết bị (máy tính, Android, iPhone). Trên Chrome/Edge có thêm nút "Cài app ngay".',
          'Android (Chrome): bấm "Thêm vào Màn hình chính" hoặc menu 3 chấm → "Cài đặt ứng dụng". iPhone (Safari): nút Chia sẻ → "Thêm vào MH chính".',
          'App tự cập nhật âm thầm: bản mới có hiệu lực sau 1–2 lần mở lại. Phiên bản đang chạy ghi ở cuối menu ☰.',
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'household',
    label: 'Hướng dẫn Hộ nuôi trồng',
    icon: '🌾',
    flow: [
      { title: 'Làm một lần đầu', tone: 'info', nodes: [{ icon: '📝', label: 'Đăng ký', step: 0 }, { icon: '⚙️', label: 'Cấu hình', step: 1 }, { icon: '🏡', label: 'Phân khu', step: 2 }, { icon: '🌾', label: 'Sản phẩm', step: 3 }, { icon: '📦', label: 'Kho và vật tư', step: 4 }, { icon: '📋', label: 'Quy trình', step: 5 }] },
      { title: 'Mỗi vụ', tone: 'ok', nodes: [{ icon: '📥', label: 'Nhập kho', step: 6 }, { icon: '🌱', label: 'Tạo vụ', step: 7 }, { icon: '📈', label: 'Quản lý vụ', step: 8 }] },
      { title: 'Mỗi ngày', tone: 'ok', nodes: [{ icon: '⏱', label: 'Chấm công, Ghi việc', step: 9 }] },
      { title: 'Khi có thu và chi', tone: 'warn', nodes: [{ icon: '🧺', label: 'Thu hoạch và bán', step: 10 }, { icon: '💳', label: 'Chi phí và công nợ', step: 11 }] },
      { title: 'Người làm và kết quả', tone: 'info', nodes: [{ icon: '👥', label: 'Nhân sự và lương', step: 12 }, { icon: '📊', label: 'Báo cáo và website', step: 13 }] },
    ],
    intro: 'Làm lần lượt từ bước 1 đến bước 14. Bước 1–6 chỉ làm một lần đầu; từ bước 7 là việc lặp lại mỗi vụ, mỗi ngày. Mỗi bước có chỗ giải thích "vì sao" và nút mở thẳng màn cần làm. Muốn hiểu sâu từng phần, xem thêm: Quy trình, vụ và Ghi việc · Kho, vật tư và chi phí · Nhân sự, chấm công và lương.',
    steps: [
      {
        title: 'Đăng ký tài khoản và tạo cơ sở',
        details: [
          'Chủ Hộ đăng ký bằng email. Không có email thì chọn tab "Không có email": nhập họ tên, tên cơ sở, số điện thoại có Zalo và mật khẩu rồi gửi; Agricovi liên hệ qua Zalo xác nhận (miễn phí) và duyệt thì cơ sở được mở, màn hình tự chuyển vào app. Nhân viên không tự đăng ký: chủ cơ sở tạo tài khoản và đưa số điện thoại + mật khẩu tạm (đăng nhập lần đầu phải đổi).',
          'Chọn loại cơ sở "Hộ" và đặt tên, ví dụ "Vườn nhà màng Thành Công".',
          'Một người có thể có nhiều cơ sở; đổi cơ sở ở đầu menu ☰. Mỗi cơ sở dữ liệu riêng.',
        ],
      },
      {
        title: 'Cấu hình: chọn loại bạn thật sự làm',
        details: [
          'Menu ☰ → Cấu hình. Ở "Nhóm loại sản phẩm", tích cột "Sử dụng" cho loại bạn làm (ví dụ chỉ Cây trồng). Những việc, mẫu, vật tư dành riêng cho loại khác sẽ tự ẩn, màn hình gọn hơn.',
          '"Tạo quy trình": chọn dùng công đoạn (quy trình chia thành các công đoạn) hay chỉ một danh sách việc (đơn giản hơn cho hộ nhỏ).',
          'Các danh sách khác (nhóm vật tư, nhóm chi phí, loại khách hàng, kiểu nhà/chuồng) đã có sẵn; chỉ sửa khi bạn muốn gọi tên khác.',
        ],
        tip: 'Chưa chắc thì cứ để mặc định, đổi lúc nào cũng được; dữ liệu đã ghi không mất.',
        go: { tab: 'config', label: 'Mở Cấu hình' },
      },
      {
        title: 'Khai báo phân khu',
        details: [
          'Phân khu là nơi bạn nuôi trồng: vườn, ao, chuồng, nhà màng… Mỗi vụ chạy trong MỘT phân khu.',
          'Nhập tên, diện tích, vị trí, ảnh (nếu có). Diện tích dùng để tính năng suất trên diện tích và để chia vật tư dùng chung cho các vụ.',
          'Có nhiều vườn/ao thì thêm từng cái. Chỗ không nuôi trồng (cổng, kho, biogas) chọn loại "Cơ sở vật chất".',
        ],
        go: { tab: 'declare', section: 'areas', label: 'Mở Phân khu' },
      },
      {
        title: 'Khai báo sản phẩm',
        details: [
          'Chọn cây trồng/vật nuôi có sẵn hoặc thêm loại riêng của bạn.',
          'Mục có sẵn không đúng ý thì sửa hoặc dừng dùng riêng cho cơ sở của bạn.',
          'Sản phẩm quyết định các ô nhập riêng khi ghi việc và thu hoạch (cây khác vật nuôi nên ô nhập khác nhau).',
        ],
        go: { tab: 'declare', section: 'crops', label: 'Mở Sản phẩm' },
      },
      {
        title: 'Khai báo kho, vật tư và nhà cung ứng',
        details: [
          'Kho: nơi cất giữ (kho phân, kho thuốc, kho thức ăn…). Có thể có nhiều kho.',
          'Vật tư: app đã tạo sẵn danh sách vật tư thường dùng; bạn sửa, thêm vật tư của mình, đặt mức tồn tối thiểu để được cảnh báo sắp hết.',
          'Nhà cung ứng: nơi bạn mua; dùng khi nhập kho có hóa đơn để theo dõi công nợ.',
        ],
        go: { tab: 'declare', section: 'places', label: 'Mở Kho' },
      },
      {
        title: 'Lập quy trình',
        details: [
          'Khai báo → Tạo quy trình. Có hai tab: "Của cơ sở" (quy trình của bạn) và "Mẫu hệ thống" (mẫu soạn sẵn: dưa lưới nhà màng, heo thịt, tôm ao lót bạt). Xem trước mẫu rồi bấm "Áp dụng cho cơ sở của tôi" là có quy trình riêng để sửa.',
          'Mẫu hệ thống chỉ là bản tham khảo: hãy sửa số ngày, vật tư, hướng dẫn cho đúng cách làm của bạn.',
          'Chưa có mẫu cho sản phẩm của bạn thì tự tạo: thêm công đoạn, rồi thêm các việc vào công đoạn.',
          'Chi tiết cách đặt ngày, việc chạy song song và việc lặp lại: xem hướng dẫn "Quy trình, vụ và Ghi việc".',
        ],
        go: { tab: 'declare', section: 'templates', label: 'Mở Tạo quy trình' },
      },
      {
        title: 'Nhập kho vật tư ban đầu',
        details: [
          'Vào Sản xuất → Quản lý kho → Nhập kho: chọn kho, vật tư, số lượng, giá, ngày. Có thể nhập nhiều dòng một lần.',
          'Có hóa đơn thì tích "Có hóa đơn" để ghi số hóa đơn, nhà cung ứng và hạn trả (app nhắc khi sắp đến hạn).',
          'Kho tính giá vốn bình quân, tự trừ khi bạn ghi vật tư đã dùng. Tiền mua chưa tính vào chi phí vụ; chỉ tính khi dùng.',
          'Vật tư có hạn dùng thì ghi số lô và hạn; khi xuất, app tự lấy lô hạn gần nhất trước.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Tạo vụ theo quy trình',
        details: [
          'Sản xuất → Vụ nuôi trồng → + Tạo vụ mới: chọn Sản phẩm, quy trình, Phân khu (app ưu tiên phân khu đúng loại và cảnh báo nếu khác loại), rồi ngày bắt đầu.',
          'App sao quy trình thành lịch của riêng vụ (từng công đoạn, từng việc có ngày). Sửa lịch của vụ sau này không làm đổi quy trình gốc.',
          'Chọn "Chưa bắt đầu (Chuẩn bị)" nếu muốn lập lịch trước, bắt đầu chạy sau. Chỉ vụ đang sản xuất mới ghi việc được.',
          'Tạo xong, app hỏi bạn muốn quản lý vụ thế nào (5 cách: Tự làm trong gia đình · Chủ và người làm công tháng · Có người quản lý điều hành · Có nhiều nhân viên · Chuẩn VietGAP). Chọn cách đơn giản thì app chỉ hiện các mục cần dùng; đổi lúc nào cũng được ở Chi tiết vụ, không mất dữ liệu.',
          'Nên nhập thêm (không bắt buộc): giống, diện tích trồng, số cây, ngày gieo/trồng, sản lượng dự kiến, ngân sách dự kiến. Có chúng app mới tính được mật độ, năng suất và so kế hoạch với thực tế. Vụ vật nuôi/thủy sản nên nhập số con nhập chuồng/thả để tính hao hụt, mật độ, FCR.',
          'Mỗi vụ có một mã (dùng cho mã QR truy xuất). Quota số vụ đang chạy tùy gói dịch vụ của tài khoản.',
        ],
        tip: 'Hộ nhỏ thấy app còn nhiều mục? Chọn cách quản lý "Tự làm trong gia đình": app ẩn kho, nhân sự, chấm công, bảng lương; Ghi việc vẫn dùng bình thường.',
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Quản lý vụ: lịch, việc hôm nay và số liệu',
        details: [
          'Bấm vào một vụ để mở màn Quản lý vụ: các công đoạn và việc của vụ, ngày kế hoạch và ngày thực tế, trạng thái từng việc.',
          '"Việc đến hạn hôm nay" nhắc những việc hôm nay phải làm mà chưa ghi.',
          'Người quản lý bấm Bắt đầu khi việc thật sự bắt đầu và Xong khi hoàn thành. Làm sớm hay trễ so với kế hoạch thì các việc phía sau tự dời theo số ngày lệch (việc đang chạy hoặc đã xong không bị đổi).',
          'Sửa, xóa, thêm việc hay công đoạn của vụ này bằng các nút nhỏ ✎ 🗑; mở lại việc đã xong bằng ↺. Chỉ xóa được việc chưa làm.',
          'Mỗi thẻ vụ có dòng số liệu: Chi phí · Thu hoạch · Doanh thu · Lãi/Lỗ tạm tính, thanh so với ngân sách và sản lượng dự kiến. Bấm "Xem thêm số liệu" để xem chi phí chia theo vật tư/tiền công/khác, hao hụt, còn tồn, giá thành mỗi kg.',
          'Chỉ hiện số bạn có quyền xem (tiền cần quyền Tổng kết vụ).',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Hằng ngày: chấm công và ghi việc',
        details: [
          'Hai việc riêng biệt. Chấm công: người làm có mặt mấy giờ (để tính tiền công). Ghi việc: đã làm việc gì cho vụ nào (để có nhật ký, trừ vật tư, truy xuất).',
          'Chấm công: người làm bấm VÀO CA / RA CA ở máy chấm công của cơ sở (số điện thoại + PIN). Hộ nhỏ không dùng máy thì chủ hoặc quản lý nhập ở Sản xuất → Chấm công → Hôm nay → "＋ Chấm công cho người làm" (kể cả công của chính mình).',
          'Ghi việc: bấm nút ＋ ở giữa thanh dưới, chọn vụ, việc, nhập nội dung (có thể nói vào micro), vật tư đã dùng và ảnh. Mất mạng vẫn ghi được.',
          'Ghi theo VIỆC, không ghi theo từng công nhân: một việc làm xong chỉ cần một bản ghi do người quản lý ghi. Ai làm thì đã có chấm công.',
          'Ghi sai thì vào Nhật ký việc để sửa hoặc hủy (có lịch sử, bản hủy vẫn còn dấu vết). Quên ghi hôm qua thì ghi bù: chọn "Hôm qua" hoặc "Hôm kia" (không ghi được thời điểm ở tương lai).',
          'Việc giống hệt hôm trước? Ở Nhật ký việc bấm "Nhân bản" để mở Ghi việc điền sẵn mọi thứ, chỉ cần chọn lại ngày.',
        ],
        tip: 'Ghi ngay sau khi làm xong, số liệu chi phí và giá thành sẽ đúng hơn. Chi tiết quy định ghi việc: xem hướng dẫn "Quy trình, vụ và Ghi việc".',
        go: { tab: 'production', section: 'logs', label: 'Mở Nhật ký việc' },
      },
      {
        title: 'Thu hoạch và bán hàng',
        details: [
          'Sản xuất → Thu hoạch: ghi ngày, sản lượng và hao hụt. Số thu hoạch tính là sau hao hụt; đây là mẫu số để tính giá thành mỗi kg.',
          'Báo cáo → Doanh thu: ghi lần bán (khách, số lượng, tiền). Khách chưa trả hết thì ghi hạn thu tiền, app nhắc khi quá hạn.',
          'Khách hàng khai báo ở Khai báo → Khách hàng.',
          'Vụ vật nuôi: số con còn lại tự trừ theo phiếu thu hoạch (xuất chuồng) để tính hao hụt đúng.',
        ],
        go: { tab: 'production', section: 'harvest', label: 'Mở Thu hoạch' },
      },
      {
        title: 'Chi phí và công nợ',
        details: [
          'Sản xuất → Chi phí: ghi các khoản chi theo nhóm (nhân công, điện nước, thuê, khấu hao, khác…). KHÔNG ghi tiền mua vật tư ở đây (đã tính khi dùng, ghi lại sẽ bị trùng).',
          'Chi của riêng một vụ thì gắn vụ; chi chung cho cả cơ sở thì để trống vụ.',
          'Mua vật tư chưa trả hết tiền: ghi ở Nhập kho có hóa đơn kèm hạn trả; app nhắc khi sắp hoặc đã quá hạn.',
          'Báo cáo → Công nợ: xem tổng nợ phải trả và phải thu, tuổi nợ, ghi lần trả/thu tiếp theo.',
        ],
        go: { tab: 'production', section: 'expense', label: 'Mở Chi phí' },
      },
      {
        title: 'Nhân sự, chấm công và lương',
        details: [
          'Hộ có người làm thường xuyên thì tạo nhân sự (Khai báo → Nhân sự), đặt PIN và khuôn mặt để chấm công ở máy chấm công, đặt cách trả công, rồi chốt lương hằng tháng.',
          'Hộ nhỏ chỉ có người nhà hoặc vài người làm công: chọn cách quản lý "Tự làm trong gia đình", ghi tiền công ở Chi phí (nhóm Nhân công), không cần tạo nhân sự.',
          'Toàn bộ cách làm: xem hướng dẫn "Nhân sự, chấm công và lương".',
        ],
        go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Xem kết quả và đưa sản phẩm lên website',
        details: [
          'Trang chủ: số liệu tháng, xu hướng 6 tháng, cảnh báo, việc cần xử lý.',
          'Báo cáo → Báo cáo tuần: tóm tắt tuần, so với tuần trước, điểm cần chú ý, nút chia sẻ.',
          'Báo cáo → Theo nhu cầu: tự chọn loại báo cáo, bộ lọc, xem dạng biểu đồ hoặc bảng và lưu lại.',
          'Báo cáo → Tổng kết vụ: chi phí, doanh thu, lãi lỗ, giá thành mỗi ký (chỉ tính khi đủ số liệu); xuất bảng CSV.',
          'Báo cáo → Hồ sơ web: soạn hồ sơ, gửi duyệt để hiện trên website. Mỗi vụ có mã QR truy xuất để in dán lên sản phẩm; khách quét sẽ xem được quá trình nuôi trồng.',
          'Báo cáo → Đơn khách từ website: xử lý đơn và báo giá.',
        ],
        go: { tab: 'reports', section: 'summary', label: 'Mở Tổng kết vụ' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'process',
    label: 'Quy trình, vụ và Ghi việc',
    icon: '📋',
    flow: [
      { title: 'Chuẩn bị', tone: 'info', nodes: [{ icon: '🧩', label: 'Quy trình – Công đoạn – Việc', step: 0 }, { icon: '🧰', label: 'Danh mục Việc', step: 1 }, { icon: '📋', label: 'Tạo quy trình', step: 2 }] },
      { title: 'Chạy vụ', tone: 'ok', nodes: [{ icon: '🌱', label: 'Vụ lấy lịch từ quy trình', step: 3 }, { icon: '📈', label: 'Quản lý vụ', step: 4 }] },
      { title: 'Ghi và đóng việc', tone: 'warn', nodes: [{ icon: '📒', label: 'Ghi việc', step: 5 }, { icon: '✅', label: 'Bấm Xong', step: 6 }, { icon: '✏️', label: 'Sửa, hủy, nhân bản', step: 7 }] },
    ],
    intro: 'Phần này giải thích "xương sống" của app: quy trình tạo ra lịch của vụ, người làm ghi việc theo lịch, và việc chỉ được đóng khi đã ghi đủ. Hiểu được vòng này là dùng được toàn bộ app.',
    steps: [
      {
        title: 'Quy trình – Công đoạn – Việc là gì',
        details: [
          'Ví dụ dưa lưới: Quy trình "Dưa lưới nhà màng" gồm các công đoạn Chuẩn bị giá thể → Gieo và ươm → Chăm sóc → Thu hoạch. Công đoạn Chăm sóc gồm các việc: tưới, bón phân, phun thuốc, tỉa nhánh…',
          'Việc là đơn vị nhỏ nhất. Mỗi việc thuộc một "loại việc" (Khai báo → Việc) nên khi ghi việc, app biết cần hỏi ô nhập nào và gợi ý vật tư gì.',
          'Làm quy trình một lần, mọi vụ sau dùng lại. Sau khi tạo vụ, lịch của vụ là bản sao riêng: sửa lịch vụ này không đổi quy trình, và sửa quy trình không đổi các vụ đã tạo.',
          'Cấu hình có thể tắt "công đoạn" để chỉ còn danh sách việc (đơn giản hơn cho hộ nhỏ).',
        ],
      },
      {
        title: 'Danh mục Việc (Khai báo → Việc)',
        details: [
          'Đây là danh sách các loại việc để chọn khi lập quy trình và khi ghi việc: làm đất, gieo, tưới, bón phân, phun thuốc, cho ăn, thu hoạch…',
          'Mỗi loại việc áp dụng cho MỘT đối tượng (cây trồng, vật nuôi hoặc thủy sản). Việc giống nhau nhưng ở đối tượng khác thì tách thành hai mục riêng, vì ô cần nhập và vật tư khác nhau (ví dụ "Cho ăn" của heo khác "Cho ăn" của tôm). Bộ lọc "Xem theo" giúp tìm nhanh.',
          'Mỗi việc có thể cấu hình: các ô thông tin cần nhập khi ghi (ví dụ liều lượng, nhiệt độ), giá trị điền sẵn, ngưỡng cảnh báo thấp/cao (nhập ngoài ngưỡng thì bản ghi hiện cảnh báo), và vật tư thường dùng để gợi ý.',
          'Muốn thêm việc riêng: bấm "Thêm việc", chọn đối tượng, đặt tên. Việc chưa chọn đối tượng sẽ có cảnh báo để bạn bổ sung.',
        ],
        go: { tab: 'declare', section: 'worktypes', label: 'Mở Việc' },
      },
      {
        title: 'Tạo quy trình: đặt ngày, việc song song, việc lặp lại',
        details: [
          'Khai báo → Tạo quy trình. Tab "Mẫu hệ thống" có mẫu soạn sẵn (dưa lưới nhà màng, heo thịt, tôm ao lót bạt): xem trước rồi "Áp dụng cho cơ sở của tôi". Tab "Của cơ sở" là các quy trình của bạn để sửa, nhân bản.',
          'Mỗi việc trong công đoạn có: loại việc · số ngày thực hiện · "Bắt đầu ngày thứ" · "Lặp lại mỗi … ngày" · mức quan trọng · ghi chú · hướng dẫn · vật tư dự kiến.',
          'Để trống "Bắt đầu ngày thứ" = việc này NỐI TIẾP sau việc trước (làm xong việc trước mới tới). Nhập một số = việc bắt đầu đúng ngày đó của vụ và CHẠY SONG SONG với việc khác (ví dụ tưới chạy suốt trong khi bón phân vào ngày 15).',
          'Việc lặp lại (tưới mỗi 1 ngày, bón mỗi 7 ngày…): nhập "Lặp lại mỗi N ngày". App tính số lần phải làm trong khoảng thời gian của việc; số lần này dùng khi bấm Xong (xem bước 6).',
          'Tổng số ngày của vụ = ngày kết thúc muộn nhất trong tất cả các việc, nên việc chạy song song không làm vụ dài thêm.',
          'Mẫu hệ thống là bản tham khảo; hãy hỏi người có kinh nghiệm và chỉnh số ngày, vật tư, hướng dẫn cho đúng thực tế của bạn.',
        ],
        tip: 'Chưa rõ thời gian thì nhập số ngày ước lượng; khi làm thật, lịch của vụ tự dời theo thực tế nên không cần đúng ngay.',
        go: { tab: 'declare', section: 'templates', label: 'Mở Tạo quy trình' },
      },
      {
        title: 'Tạo vụ: lịch lấy từ quy trình',
        details: [
          'Sản xuất → Vụ nuôi trồng → + Tạo vụ mới: chọn sản phẩm, quy trình, phân khu và ngày bắt đầu. App tính ngày bắt đầu/kết thúc của từng việc theo quy tắc nối tiếp/song song ở trên.',
          'Công đoạn, việc, hướng dẫn, vật tư dự kiến đều được sao sang vụ. Từ đây vụ có lịch riêng và dời lịch độc lập với quy trình gốc.',
          'Vụ ở trạng thái "Chuẩn bị" thì chưa ghi việc được; bấm "Bắt đầu sản xuất" khi vụ chạy thật: ngày bắt đầu thành ngày thực tế và cả lịch dời theo.',
          'Quy trình có thể kèm các "mốc an toàn" cho ngày bắt đầu/thu hoạch (ví dụ thời gian cách ly thuốc); vụ tạo từ quy trình mang theo các mốc này.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Quản lý vụ hằng ngày',
        details: [
          'Màn Quản lý vụ liệt kê công đoạn và việc kèm trạng thái: chưa bắt đầu, đang làm, xong; ngày kế hoạch và ngày thật; "Đã ghi x/y lần" cho việc có yêu cầu ghi.',
          '"Việc đến hạn hôm nay" cho biết việc nào hôm nay phải làm mà chưa ghi; bấm "Ghi việc" ngay trên dòng đó (app điền sẵn vụ, việc, công đoạn).',
          'Lịch: các việc chạy song song hiện dạng dải màu; bấm một ngày để xem các việc của ngày đó, từng việc một thẻ.',
          'Bắt đầu / Xong: người quản lý bấm. Bắt đầu hoặc hoàn thành sớm/trễ thì các việc phía sau tự dời theo số ngày lệch.',
          'Cần đổi gì cho riêng vụ này (thêm việc, xóa việc chưa làm, sửa ngày, đổi hướng dẫn) thì dùng nút sửa ở từng việc hoặc từng công đoạn; không ảnh hưởng quy trình gốc.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Ghi việc: ghi gì, ghi thế nào',
        details: [
          'Bấm nút ＋ Ghi việc (giữa thanh dưới) hoặc bấm "Ghi việc" ở một việc trong Quản lý vụ. Màn có tiêu đề "Ghi việc: <tên việc>" và nút "Đổi việc" nếu chọn nhầm.',
          'Chọn vụ (hoặc khu vực nếu việc không thuộc vụ), công đoạn (app tự gợi ý theo ngày), nhập các ô riêng của việc, nội dung, ảnh.',
          'Thời gian: nút Hôm nay / Hôm qua / Hôm kia và ô giờ bắt đầu, giờ kết thúc. Ghi bù ngày trước được; thời điểm ở tương lai thì không.',
          'Vật tư đã dùng: app gợi ý theo loại việc; chọn vật tư và số lượng thì kho tự trừ và tiền vật tư vào chi phí vụ (giá vốn bình quân). Lô hạn dùng gần nhất được lấy trước.',
          'Ô nhập lấy sẵn giá trị lần ghi trước của việc này để bạn đỡ gõ lại; nhập ngoài ngưỡng cảnh báo thì bản ghi hiện chữ cảnh báo.',
          'Ghi việc giống hệt một bản đã ghi: app cảnh báo ghi trùng để tránh nhập hai lần nhầm.',
          'Quy định: GHI THEO VIỆC, một việc một bản ghi do người quản lý ghi; không ghi riêng cho từng công nhân (ai làm thì có chấm công). Mất mạng vẫn ghi được, app tự gửi lên khi có mạng.',
        ],
        tip: 'Dùng nút micro để nói nội dung việc, đỡ gõ phím khi tay đang bẩn.',
        go: { tab: 'production', section: 'logs', label: 'Mở Nhật ký việc' },
      },
      {
        title: 'Bấm Xong: vì sao phải ghi đủ',
        details: [
          'Một việc chỉ bấm Xong được khi đã Ghi việc đủ. Mục đích: nhật ký đầy đủ để truy xuất nguồn gốc và tính chi phí đúng, không để việc "xong" mà chẳng có dấu vết.',
          'Việc không lặp: cần ít nhất 1 bản ghi. Việc lặp mỗi N ngày: cần đủ số lần đến hạn tính từ ngày bắt đầu tới ngày hoàn thành (tối đa tới ngày kết thúc kế hoạch). Mỗi ngày chỉ tính một lần dù ghi nhiều bản. Việc Thu hoạch tính cả phiếu thu hoạch.',
          'Màn Quản lý vụ hiện "Đã ghi x/y lần". Chưa đủ mà bấm Xong, app báo cần ghi thêm bao nhiêu lần.',
          'Lối thoát: chỉ CHỦ cơ sở được bấm Xong khi chưa ghi đủ, bằng cách nhập lý do (ít nhất 3 ký tự). App lưu lý do, người bấm và thời điểm, hiện ở Quản lý vụ để còn đối chiếu. Mở lại việc thì dấu này được xóa. Quản lý và tổ trưởng vẫn phải ghi đủ.',
        ],
      },
      {
        title: 'Sửa, hủy, nhân bản và xem lại nhật ký',
        details: [
          'Nhật ký việc (Sản xuất → Nhật ký việc): lọc theo vụ, việc, ngày; bấm vào bản ghi để sửa hoặc hủy.',
          'Sửa luôn có lịch sử (ai sửa, sửa gì). Nếu người khác vừa sửa trước bạn, app báo và tải lại bản mới để bạn xem rồi sửa lại, không ghi đè âm thầm.',
          'Hủy chỉ đánh dấu hủy, bản ghi vẫn nằm trong lịch sử (không xóa mất dấu vết). Bản đã hủy không được tính vào số liệu.',
          'Nhân bản: ở dòng bản ghi bấm "Nhân bản" để mở Ghi việc điền sẵn việc, vụ, các ô thông tin, ghi chú và vật tư; chỉ cần chọn lại ngày.',
          'Sổ nhật ký (Báo cáo) in hoặc xuất Excel toàn bộ nhật ký để nộp khi được kiểm tra.',
        ],
        go: { tab: 'production', section: 'logs', label: 'Mở Nhật ký việc' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'stock',
    label: 'Kho, vật tư và chi phí',
    icon: '📦',
    flow: [
      { title: 'Hiểu kho', tone: 'info', nodes: [{ icon: '🧮', label: 'Kho tính thế nào', step: 0 }, { icon: '🧪', label: 'Kho và vật tư', step: 1 }] },
      { title: 'Vào kho', tone: 'ok', nodes: [{ icon: '📥', label: 'Nhập kho', step: 2 }] },
      { title: 'Ra khỏi kho', tone: 'warn', nodes: [{ icon: '📤', label: 'Xuất kho', step: 3 }, { icon: '↩️', label: 'Chuyển, trả về', step: 4 }, { icon: '⚖️', label: 'Điều chỉnh', step: 5 }] },
      { title: 'Xem và chi phí', tone: 'neutral', nodes: [{ icon: '📊', label: 'Tồn, giao dịch, báo cáo', step: 6 }, { icon: '💸', label: 'Chi phí và công nợ', step: 7 }] },
    ],
    intro: 'Kho cho biết còn bao nhiêu vật tư và vật tư đã dùng đắt bao nhiêu cho từng vụ. Nắm 3 quy tắc: giao dịch kho chỉ thêm (không xóa), giá tính bình quân, tiền vật tư vào chi phí lúc DÙNG chứ không phải lúc mua.',
    steps: [
      {
        title: 'Kho tính thế nào (3 quy tắc)',
        details: [
          'Giao dịch kho chỉ THÊM: mỗi lần nhập, xuất, chuyển, điều chỉnh là một dòng mới. Không có chuyện sửa đè hay xóa số cũ; sai thì thêm dòng Điều chỉnh có lý do. Nhờ vậy số tồn luôn truy ngược được.',
          'Giá vốn bình quân: mỗi lần nhập giá khác nhau, app tính giá bình quân để quy ra tiền khi xuất dùng.',
          'Tiền vật tư vào chi phí vụ lúc DÙNG (ghi việc có vật tư, hoặc xuất kho cho vụ), không phải lúc mua. Vì thế mua vật tư thì ghi ở kho, không ghi lại ở mục Chi phí.',
          'Vật tư có số lô và hạn dùng: khi xuất app tự lấy lô hạn gần nhất trước, bỏ qua lô đã hết hạn.',
        ],
      },
      {
        title: 'Khai báo kho và vật tư',
        details: [
          'Khai báo → Kho: tạo các kho (kho phân, kho thuốc…).',
          'Khai báo → Vật tư: danh sách vật tư (có sẵn nhiều loại thường dùng, bạn sửa/thêm). Chọn nhóm vật tư, đơn vị tính, mức tồn tối thiểu để được cảnh báo khi sắp hết.',
          'Khai báo → Nhà cung ứng: nơi bạn mua, dùng khi nhập kho có hóa đơn.',
        ],
        go: { tab: 'declare', section: 'materials', label: 'Mở Vật tư' },
      },
      {
        title: 'Nhập kho (một màn cho cả mua lẻ và mua có hóa đơn)',
        details: [
          'Sản xuất → Quản lý kho → Nhập kho. Chọn kho, thêm các dòng vật tư (số lượng, đơn giá), ngày nhập. Nhập nhiều dòng một lần được.',
          'Có hóa đơn: tích "Có hóa đơn" để ghi số hóa đơn, nhà cung ứng, số tiền đã trả và hạn trả. Số còn nợ vào Công nợ và app nhắc khi sắp/đã quá hạn.',
          'Vật tư có hạn dùng: ghi số lô và hạn dùng. Lô sắp hết hạn hiện ở Trang chủ và trong Kho.',
          'Ngày nhập không được ở tương lai.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Xuất kho: dùng cho vụ, dùng chung, hao hụt, bán',
        details: [
          'Vật tư đã dùng khi Ghi việc tự trừ kho, bạn không phải xuất tay. "Xuất kho" tay dành cho trường hợp còn lại; bắt buộc ghi lý do.',
          'Dùng cho vụ: chọn một vụ, tiền vật tư vào chi phí vụ đó.',
          'Dùng chung: vật tư dùng cho nhiều vụ cùng lúc (ví dụ điện, thuốc phun cả khu). Chọn các vụ được chia; app chia theo DIỆN TÍCH của từng vụ và cho xem trước phần của mỗi vụ.',
          'Hao hụt / hỏng: vật tư mất đi, không thuộc vụ nào. Xuất bán: bán vật tư ra ngoài. Khác: các lý do còn lại.',
          'Xuất kho cần có mạng và quyền sửa Kho; người không có quyền thì không thấy nút.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Chuyển kho và trả về kho',
        details: [
          'Chuyển kho: đưa vật tư từ kho này sang kho khác. Số tổng không đổi, mỗi kho hiện đúng số của mình; lô và hạn dùng đi theo.',
          'Trả về kho: vật tư đã xuất cho vụ nhưng dùng không hết thì trả lại. Chi phí vụ tự giảm tương ứng. Phần xuất "Dùng chung" đã chia cho các vụ cũng trả lại được theo cùng tỉ lệ.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Điều chỉnh tồn khi kiểm kho lệch',
        details: [
          'Đếm thực tế khác số trên app thì bấm "Điều chỉnh tồn": nhập số lượng thật và lý do (bắt buộc).',
          'App tạo một giao dịch điều chỉnh tăng hoặc giảm, giữ nguyên lịch sử cũ; không sửa đè số cũ.',
          'Nên kiểm kho định kỳ (ví dụ cuối tháng) để số liệu chi phí không bị lệch dần.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Xem tồn kho, giao dịch và báo cáo kho',
        details: [
          'Tab "Tồn kho": mỗi vật tư một dòng, bấm tên vật tư để xem chi tiết; có cảnh báo khi dưới mức tối thiểu hoặc lô sắp hết hạn.',
          'Tab "Giao dịch": mọi lần nhập, xuất, chuyển, điều chỉnh; lọc theo loại, kho, vật tư, khoảng ngày.',
          'Tab "Báo cáo": nhập – xuất – tồn theo kỳ (đầu kỳ, nhập, xuất, cuối kỳ) và vật tư dùng theo từng vụ, để biết vụ nào tốn vật tư nào.',
        ],
        go: { tab: 'production', section: 'stock', label: 'Mở Quản lý kho' },
      },
      {
        title: 'Chi phí khác và công nợ',
        details: [
          'Sản xuất → Chi phí: ghi các khoản chi không phải vật tư kho (nhân công thuê ngoài, điện nước, thuê đất, khấu hao, khác). Chọn vụ nếu khoản chi của riêng vụ đó.',
          'Khoản chi chung cho cả cơ sở (không riêng vụ nào) thì để trống vụ. Vật tư dùng chung cho nhiều vụ thì dùng Xuất kho "Dùng chung" để app chia theo diện tích.',
          'Công nợ phải trả: từ nhập kho có hóa đơn còn nợ; công nợ phải thu: từ lần bán khách chưa trả hết. Báo cáo → Công nợ cho thấy tổng nợ, tuổi nợ và nhắc khi sắp hoặc quá hạn.',
        ],
        go: { tab: 'production', section: 'expense', label: 'Mở Chi phí' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'staff',
    label: 'Nhân sự, chấm công và lương',
    icon: '👥',
    flow: [
      { title: 'Tạo người', tone: 'info', nodes: [{ icon: '🧩', label: 'Logic tổng', step: 0 }, { icon: '👤', label: 'Tạo nhân sự', step: 1 }, { icon: '🛡️', label: 'Chức vụ, quyền', step: 2 }] },
      { title: 'Chấm công', tone: 'ok', nodes: [{ icon: '📲', label: 'Máy chấm công', step: 3 }, { icon: '⏱', label: 'Người làm chấm công', step: 4 }, { icon: '📷', label: 'Ảnh và cờ đỏ', step: 5 }, { icon: '✍️', label: 'Chấm công cho người làm', step: 6 }] },
      { title: 'Xác nhận và lương', tone: 'warn', nodes: [{ icon: '✔', label: 'Xác nhận công', step: 7 }, { icon: '💼', label: 'Trả công, chốt lương', step: 8 }] },
    ],
    intro: 'Phần này giải thích đường đi của tiền công: tạo người → chấm công → xác nhận công → tính lương → khóa kỳ. Chỉ công đã được xác nhận mới được tính tiền, và máy chấm công có các lớp bảo vệ để không ai chấm công hộ được.',
    steps: [
      {
        title: 'Logic tổng: từ chấm công đến tiền lương',
        details: [
          'Nhân sự = một người của cơ sở (có tài khoản đăng nhập bằng số điện thoại). Hồ sơ lao động là phần ghi giờ làm và trả công của người đó.',
          'Đường đi: Chấm công (giờ vào, giờ ra) → công chờ XÁC NHẬN → Bảng lương (giờ × đơn giá, thưởng, phạt, tạm ứng) → chủ KHÓA kỳ lương.',
          'Vì sao phải xác nhận: người chấm không phải người trả tiền. Chủ hoặc quản lý kiểm lại rồi mới cho tính lương, nên có ai chấm sai cũng bị chặn trước khi thành tiền.',
          'Chấm công khác Ghi việc: chấm công cho biết ai có mặt mấy giờ; Ghi việc cho biết việc gì đã làm cho vụ nào. Hai việc độc lập nhau.',
          'Người làm thường chấm công ở MÁY CHẤM CÔNG của cơ sở (không bấm Vào/Ra ca trong tài khoản của mình, để không ai đưa mật khẩu cho bạn chấm hộ).',
        ],
      },
      {
        title: 'Tạo nhân sự và quản lý tài khoản',
        details: [
          'Khai báo → Nhân sự → "+ Thêm nhân sự" → tài khoản nhân viên: nhập họ tên, số điện thoại, chức vụ, phân khu, kiểu trả công. Có thể thêm người làm không tài khoản (lương tháng) hoặc mời người đã có email.',
          'Tạo xong, thẻ "Đã tạo tài khoản" hiện MẬT KHẨU TẠM và MÃ ĐẶT PIN 6 số. Cả hai chỉ hiện một lần: chép hoặc đưa cho người đó ngay. Hệ thống không lưu để xem lại (để không ai biết mật khẩu hay PIN của người khác). Quên thì bấm Đổi mật khẩu hoặc Cấp mã PIN mới.',
          'Người làm đăng nhập lần đầu phải đổi mật khẩu tạm. PIN do chính họ tự đặt ở máy chấm công bằng mã 6 số.',
          'Danh sách nhân sự có hai cột: Nhân sự (tên, số điện thoại, chức vụ) và Trạng thái với ba dòng 🔑 mật khẩu · 🔢 PIN · 🙂 khuôn mặt. "Đã đặt" là xong; "Chờ đặt lại" là mật khẩu tạm chưa đổi hoặc mã PIN đã cấp mà người đó chưa đặt; "Bị khóa" là đang bị khóa; "Chưa có/Chưa đăng ký" là chưa làm.',
          'Bấm ✎ ở một người để mở hồ sơ, có 4 nút ở trên cùng: Đổi mật khẩu (cấp mật khẩu tạm mới) · Khóa đăng nhập (tạm dừng, không mất dữ liệu; bấm lại để mở khóa) · Gỡ khỏi cơ sở (lịch sử vẫn giữ) · Xóa khuôn mặt (người đó đăng ký lại sau). Mục "Mã PIN và khuôn mặt" có nút Cấp mã PIN mới.',
        ],
        go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Chức vụ, quyền và phân khu',
        details: [
          'Khai báo → Chức vụ: tạo chức vụ (mặc định vai trò Nhân viên; chọn Quản lý thì chọn thêm quyền). Cơ sở mới có sẵn vài chức vụ.',
          'Quyền theo mục: Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tiền công, Hồ sơ website (xem hoặc sửa). Người không có quyền thì mục biến mất và máy chủ cũng chặn.',
          'Phân khu làm việc: giao mỗi người một hay nhiều phân khu; họ chỉ thấy và ghi việc ở đó.',
          'Khai báo → Tổ chức: lập phòng/tổ, chọn tổ trưởng. Tổ trưởng chấm công và xác nhận công cho người trong tổ (không cho chính mình).',
        ],
        go: { tab: 'declare', section: 'positions', label: 'Mở Chức vụ' },
      },
      {
        title: 'Thiết lập máy chấm công',
        details: [
          'Máy chấm công là một điện thoại (hoặc máy tính bảng) đặt cố định ở phân khu hay cổng vào. Khai báo → Máy chấm công → "＋ Liên kết điện thoại này làm máy chấm công": đặt tên máy, chọn phân khu, tích xác nhận đã báo và được người làm đồng ý chụp ảnh khi chấm công.',
          'Sau khi liên kết, điện thoại tự đăng xuất chủ và chỉ còn màn Chấm công. Máy dùng một tài khoản thiết bị riêng, không xem được dữ liệu quản lý, nên ai cầm máy cũng không vào được màn quản lý.',
          'Chủ cần vào app quản lý trên máy này: nhập số điện thoại + PIN của chủ → máy hỏi "Chấm công" hay "Vào app quản lý"; chọn vào app thì đăng nhập email/số điện thoại và mật khẩu của chủ. Dùng xong: Khai báo → Máy chấm công → "Liên kết lại máy này" (máy cũ được chọn sẵn, chỉ một lần bấm) để trả máy về chấm công.',
          'Điện thoại khác thì chọn "Máy mới" và nhập thông tin. Mỗi cơ sở có tối đa 20 máy. "Ngừng dùng" để khóa hẳn một máy.',
          'Có thể bật cho từng máy "Hỏi làm cho vụ nào khi Vào ca" để gắn công vào vụ (tính nhân công theo vụ). Mặc định tắt vì nhiều người làm không theo một vụ; khi đó công tính là chi phí chung của cơ sở.',
          'Cần có mạng. Máy giữ màn hình sáng; mở lần đầu tải thêm khoảng 8 MB để nhận diện khuôn mặt, nên làm khi có Wi-Fi.',
        ],
        tip: 'Cơ sở đông người (hàng trăm) nên đặt vài máy ở các cổng để không phải xếp hàng lâu; mỗi người mất chừng 10 giây.',
        go: { tab: 'declare', section: 'kiosks', label: 'Mở Máy chấm công' },
      },
      {
        title: 'Người làm chấm công ở máy',
        details: [
          'Lần đầu: bấm "Đặt PIN lần đầu / quên PIN", nhập số điện thoại, mã 6 số do chủ cấp, PIN mới (4–6 số, không dùng dãy dễ đoán như 1234, 1111 hay trùng đuôi số điện thoại), tích đồng ý lưu khuôn mặt rồi chụp 3 ảnh (nhìn thẳng, hơi nghiêng trái, hơi nghiêng phải) làm mẫu.',
          'Hằng ngày: nhập số điện thoại + PIN → máy chỉ hiện MỘT nút đúng trạng thái: chưa vào ca thì VÀO CA, đang trong ca thì RA CA. Máy chủ cũng chặn vào hai lần hay ra khi chưa vào.',
          'Nhìn thẳng vào camera, giữ yên khoảng 1 giây, máy tự chụp và ghi. Nếu chưa nhận ra bạn, máy cho chụp lại (tối đa 3 lần); lần cuối vẫn ghi công nhưng gắn cờ cho chủ xem.',
          'Xong máy hiện to "ĐÃ VÀO CA" hoặc "ĐÃ RA CA" kèm tên và giờ. Không thấy màn này tức là chưa ghi, hãy thử lại.',
          'Sai PIN 5 lần thì số đó bị khóa 15 phút (hoặc nhờ chủ cấp mã mới). Quên Ra ca hôm trước: hôm sau nhập PIN sẽ thấy cảnh báo và bấm Ra ca; chủ sẽ xem lại giờ.',
        ],
      },
      {
        title: 'Ảnh, khuôn mặt và cờ đỏ: vì sao có và hoạt động ra sao',
        details: [
          'Mục đích: chặn chấm công hộ. PIN chỉ mình người đó biết; khuôn mặt vừa chụp được so với 3 ảnh mẫu lúc đăng ký. Việc so sánh do máy chủ quyết định nên sửa app trên điện thoại cũng không đổi được kết quả.',
          'Chỉ gắn cờ, không chặn: ánh nắng, nón, khẩu trang có thể làm sai, nên máy luôn ghi công rồi mới đánh dấu để chủ xem.',
          'Máy CHỈ LƯU ẢNH khi có cờ đỏ: không thấy mặt, khuôn mặt không khớp, phải chụp lại từ 3 lần, quên Ra ca hôm trước, hoặc hai người khác nhau bấm cùng máy trong vòng 6 giây. Đúng người thì không giữ ảnh. Nhờ vậy nhẹ dữ liệu và ít xâm phạm hơn.',
          'Chủ và quản lý xem ở Sản xuất → Chấm công → "Ảnh cần xem": ảnh vừa chụp, ảnh mẫu nhỏ ở góc, mức "cách mẫu" (dưới 0,50 là khớp, từ 0,60 có thể là người khác). Thấy ảnh không đúng người thì vào mục Công, tìm công đó và từ chối kèm lý do.',
          'Ảnh giữ 60 ngày. Chủ xóa được dữ liệu khuôn mặt từng người (hồ sơ nhân sự → Xóa khuôn mặt); người nghỉ việc thì dữ liệu tự xóa. Nên cho người làm xem và ký mẫu đồng ý (docs/MAU_DONG_Y_KHUON_MAT.md).',
          'Máy không chạy được nhận diện khuôn mặt thì vẫn chấm công bình thường bằng PIN; chủ cần chú ý hơn khi xem công.',
        ],
        tip: 'Chưa chống được người cầm ảnh in hoặc ảnh trên màn hình. Vì vậy hãy xem mục Ảnh cần xem thường xuyên và nói rõ với người làm là có kiểm tra.',
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Chấm công cho người làm (dành cho hộ nhỏ không dùng máy)',
        details: [
          'Sản xuất → Chấm công → Hôm nay → "＋ Chấm công cho người làm": chọn người, ngày, giờ từ – đến, nghỉ giữa ca (và vụ nếu muốn), rồi Lưu. Công ở trạng thái "Chờ xác nhận".',
          'Chủ và quản lý chấm công cho mọi người làm, KỂ CẢ công của chính mình (và tự xác nhận được). Tổ trưởng chấm cho người trong tổ, không cho mình.',
          'Không còn nút Vào ca / Ra ca bằng tài khoản đăng nhập: bấm trong tài khoản không có ảnh hay đối chiếu nên dễ nhờ người khác bấm hộ. Đã chặn cả ở máy chủ.',
          'Người làm thường không có chỗ chấm công trong tài khoản; họ chấm ở máy chấm công và xem công của mình ở mục Công.',
        ],
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Xác nhận công và xử lý ngoại lệ',
        details: [
          'Trang Chấm công có 3 mục: Hôm nay (số liệu trong ngày, việc cần xử lý) · Công (danh sách) · Ảnh cần xem. Số liệu do máy chủ tính nên dùng tốt cả khi cơ sở có hàng trăm người.',
          'Mục Công: lọc theo Hôm nay / 7 ngày / 30 ngày, trạng thái, tên; mỗi trang 50 dòng. Bấm ⋮ ở một công để Xác nhận, Từ chối (cần lý do) hoặc Đề nghị sửa giờ (chủ/quản lý duyệt, có lịch sử trước–sau).',
          '"✔ Xác nhận các công hợp lệ": xác nhận một lượt. Công hợp lệ = đã Ra ca, không có ngoại lệ, không có ảnh cờ đỏ, giờ làm hợp lý (1 phút đến 16 giờ). Công có dấu hiệu bất thường được giữ lại để bạn xem từng cái.',
          'Quên Ra ca: ca mở từ hôm trước hiện ở ô "Quên Ra ca". Xử lý bằng "Đề nghị sửa giờ" hoặc nhờ người đó bấm Ra ca ở máy.',
          'Công đã xác nhận không sửa lặng lẽ: mọi sửa đổi sau đó đều qua đề nghị sửa có lý do. Kỳ lương đã khóa thì không sửa được.',
        ],
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Trả công, Bảng lương và chốt lương',
        details: [
          'Trả công đặt riêng cho từng người ở hồ sơ nhân sự: theo giờ (đồng/giờ) hoặc lương cố định theo tháng; có ngày hiệu lực và hết hiệu lực. Thêm dòng mới thì dòng cũ cùng loại tự kết thúc hôm trước, nên lịch sử đơn giá không bị đổi.',
          'Báo cáo → Bảng lương: mỗi người xem lương và công của MÌNH theo tháng/quý/năm (thực nhận, giờ công, từng ngày, lương cố định, thưởng, phạt, tạm ứng). Số "Ước tính" hiện cả khi chủ chưa chốt.',
          'Chủ (và người được cấp quyền Tiền công) xem Tất cả, theo Phòng/Tổ hoặc từng người; lọc "Cần xử lý"; xuất CSV; chia sẻ phiếu lương một người qua Zalo.',
          'Chốt lương theo THÁNG: bấm Tính lương → nhập thưởng/phạt/tạm ứng ở chi tiết từng người (có lý do) → xử lý hết việc dang dở (công chờ xác nhận, ca chưa Ra ca, yêu cầu sửa công, người chưa có cách trả công) → chủ bấm Khóa kỳ. Còn việc dang dở thì chưa khóa được: đó là cách app bảo đảm không bỏ sót công.',
          'Khóa nhầm: chủ Mở khóa kỳ (ghi lý do), sửa xong Tính lại rồi Khóa lại. Kỳ đã khóa là số chính thức, tiền công vào tổng kết vụ và báo cáo.',
        ],
        go: { tab: 'reports', section: 'paybook', label: 'Mở Bảng lương' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'coop',
    label: 'Hướng dẫn Hợp tác xã',
    icon: '🤝',
    flow: [
      { title: 'Thiết lập', tone: 'info', nodes: [{ icon: '🏛️', label: 'Tạo cơ sở HTX', step: 0 }, { icon: '🤝', label: 'Mời hộ thành viên', step: 1 }, { icon: '📋', label: 'Khai báo chung', step: 2 }] },
      { title: 'Vận hành', tone: 'ok', nodes: [{ icon: '🌱', label: 'Theo dõi vụ và sản lượng', step: 3 }, { icon: '👥', label: 'Nhân sự, chấm công', step: 4 }] },
      { title: 'Công khai', tone: 'neutral', nodes: [{ icon: '🌐', label: 'Giấy phép, QR, website', step: 5 }] },
    ],
    intro: 'Hợp tác xã dùng các bước như hộ (xem Hướng dẫn Hộ nuôi trồng và các hướng dẫn chuyên đề) và thêm phần quản lý hộ thành viên dưới đây.',
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
          'Khai báo → Hộ thành viên: mời hộ bằng lời mời; hộ chấp nhận thì thành thành viên.',
          'Mỗi hộ vẫn có cơ sở riêng và tự quản dữ liệu của mình; hợp tác xã chỉ thấy phần hộ đồng ý chia sẻ.',
          'Hộ rời đi thì dữ liệu của hộ vẫn thuộc về hộ.',
        ],
        go: { tab: 'declare', section: 'coop', label: 'Mở Hộ thành viên' },
      },
      {
        title: 'Khai báo chung: sản phẩm, vật tư, quy trình',
        details: [
          'Hợp tác xã khai báo danh mục sản phẩm, vật tư và quy trình chuẩn để các hộ làm theo một cách (có thể bắt đầu từ Mẫu hệ thống).',
          'Mỗi hộ có thể điều chỉnh riêng cho phù hợp với vườn của mình; sửa của hộ không ảnh hưởng hộ khác.',
        ],
        go: { tab: 'declare', section: 'templates', label: 'Mở Tạo quy trình' },
      },
      {
        title: 'Theo dõi mùa vụ và sản lượng',
        details: [
          'Xem tiến độ các vụ đang chạy, vụ trễ tiến độ ở Trang chủ và Sản xuất → Vụ nuôi trồng; lịch công đoạn tự dời theo thực tế.',
          'Mỗi thẻ vụ có dòng số liệu (chi phí, thu hoạch, doanh thu, lãi lỗ) và so với ngân sách, sản lượng dự kiến. Tổng hợp theo vụ ở Tổng kết vụ và Báo cáo theo nhu cầu.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Nhân sự, chấm công và tiền công của hợp tác xã',
        details: [
          'Chia phòng/tổ, đặt chức vụ và quyền theo mục cho từng người (Khai báo → Chức vụ, Tổ chức).',
          'Chấm công bằng máy chấm công đặt ở từng khu; Bảng lương và chốt lương giống như hộ. Xem hướng dẫn "Nhân sự, chấm công và lương".',
        ],
        go: { tab: 'declare', section: 'positions', label: 'Mở Chức vụ' },
      },
      {
        title: 'Giấy phép, truy xuất và hồ sơ trên website',
        details: [
          'Khai báo → Giấy phép: lưu giấy chứng nhận, ngày hết hạn; app nhắc khi sắp hết hạn.',
          'Mỗi vụ có mã QR truy xuất; Báo cáo → Hồ sơ web để giới thiệu hợp tác xã và sản phẩm với khách.',
        ],
        go: { tab: 'reports', section: 'commerce', label: 'Mở Hồ sơ web' },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'company',
    label: 'Hướng dẫn Công ty',
    icon: '🏢',
    flow: [
      { title: 'Thiết lập tổ chức', tone: 'info', nodes: [{ icon: '🏢', label: 'Tạo cơ sở', step: 0 }, { icon: '🧑‍🤝‍🧑', label: 'Phòng / Tổ', step: 1 }, { icon: '🛡️', label: 'Phân quyền', step: 2 }] },
      { title: 'Sản xuất và tiền', tone: 'ok', nodes: [{ icon: '🏡', label: 'Nhiều phân khu, nhiều vụ', step: 3 }, { icon: '💳', label: 'Nhà cung ứng, khách, nợ', step: 4 }, { icon: '⏱', label: 'Chấm công, tiền công', step: 5 }] },
      { title: 'Công khai và bán', tone: 'neutral', nodes: [{ icon: '🌐', label: 'Giấy phép, QR, đơn website', step: 6 }] },
    ],
    intro: 'Công ty có nhiều người và nhiều bộ phận nên cần chia quyền cẩn thận. Các thao tác khác giống Hướng dẫn Hộ nuôi trồng và các hướng dẫn chuyên đề.',
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
          'Khai báo → Tổ chức: lập phòng ban, tổ sản xuất, chọn tổ trưởng.',
          'Khai báo → Chức vụ: đặt tên chức vụ riêng của công ty (ví dụ Thủ kho, Kế toán), chọn vai trò (Nhân viên hoặc Quản lý) và quyền thêm cho chức vụ đó.',
        ],
        go: { tab: 'declare', section: 'teams', label: 'Mở Tổ chức' },
      },
      {
        title: 'Phân quyền theo từng mục',
        details: [
          'Quyền theo từng chức vụ: xem hoặc sửa các mục Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tiền công, Hồ sơ website. Cần ngoại lệ cho một người thì chủ cấp riêng thêm hoặc bớt.',
          'Giao phân khu cho từng người (một người làm được nhiều phân khu): họ chỉ thấy và ghi việc ở phân khu được giao.',
          'Người nào không có quyền mục nào thì mục đó biến mất trên màn hình của họ, và máy chủ cũng chặn.',
          'Khóa đăng nhập một thành viên khi họ nghỉ làm mà không mất dữ liệu cũ; Gỡ khỏi cơ sở khi họ rời hẳn.',
        ],
        tip: 'Chỉ cấp quyền xem tiền (Chi phí, Doanh thu) cho người thật sự cần.',
        go: { tab: 'declare', section: 'members', label: 'Mở Nhân sự' },
      },
      {
        title: 'Nhiều phân khu, nhiều vụ chạy song song',
        details: [
          'Khai báo từng phân khu, tạo nhiều vụ cho từng sản phẩm; đặt sản lượng và ngân sách dự kiến cho từng vụ.',
          'Vật tư dùng chung cho nhiều vụ: xuất kho "Dùng chung" để app chia theo diện tích.',
          'Thẻ mỗi vụ có dòng số liệu và thanh so với kế hoạch; theo dõi vụ trễ tiến độ và vật tư sắp hết ở Trang chủ.',
        ],
        go: { tab: 'production', section: 'cycles', label: 'Mở Vụ nuôi trồng' },
      },
      {
        title: 'Nhà cung ứng, khách hàng và công nợ',
        details: [
          'Khai báo nhà cung ứng và khách hàng; ghi mua hàng (nhập kho có hóa đơn), bán hàng kèm hạn trả/thu.',
          'Báo cáo → Công nợ: xem nợ phải trả, phải thu và tuổi nợ; Báo cáo theo nhu cầu cho báo cáo mua hàng và theo khách.',
        ],
        go: { tab: 'reports', section: 'payables', label: 'Mở Công nợ' },
      },
      {
        title: 'Chấm công và tiền công cho nhiều người',
        details: [
          'Đặt vài máy chấm công ở các cổng/khu (tối đa 20 máy mỗi cơ sở); mỗi người chấm bằng số điện thoại + PIN, máy chỉ lưu ảnh khi có cờ đỏ.',
          'Trang Chấm công: Hôm nay (số liệu), Công (lọc, phân trang, xác nhận hàng loạt các công hợp lệ), Ảnh cần xem.',
          'Đặt cách trả công cho từng người (theo giờ hoặc lương cố định theo tháng); Báo cáo → Bảng lương xem Tất cả hoặc Phòng/Tổ, lọc "Cần xử lý", xuất CSV, chốt lương theo tháng.',
          'Báo cáo theo nhu cầu: giờ công theo người và theo phòng/tổ.',
        ],
        go: { tab: 'production', section: 'attendance', label: 'Mở Chấm công' },
      },
      {
        title: 'Giấy phép, truy xuất, hồ sơ website và đơn khách',
        details: [
          'Khai báo → Giấy phép: lưu chứng nhận, theo dõi ngày hết hạn.',
          'In mã QR truy xuất cho từng vụ; soạn hồ sơ công ty (Báo cáo → Hồ sơ web) để hiện trên website.',
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
    '• Chấm công bằng máy chấm công, tính tiền công cho người làm',
    '• Biết mỗi vụ lời hay lỗ, giá thành mỗi ký',
    '• Mã QR truy xuất nguồn gốc, đưa sản phẩm lên website',
    '',
    `Mở và dùng thử tại: ${url}`,
  ].join('\n');
}
