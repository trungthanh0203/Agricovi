import type { GuideId } from './guideContent';
import type { DeclareSection, ProductionSection, ReportSection } from './tabs';

/**
 * Nội dung nút ⓘ ở mỗi chức năng (D123): giới thiệu ngắn, cách dùng nhanh, lưu ý, và nút "Xem hướng dẫn đầy đủ" nhảy tới đúng bước trong Hướng dẫn sử dụng.
 * Chỉ là chữ trong app, nằm trong gói tải lười (components/HelpSheet.tsx): không đụng CSDL, không gọi mạng, xem được khi mất mạng.
 * Khai báo bằng Record theo tên mục menu: thêm mục menu mới mà quên viết trợ giúp thì typecheck báo lỗi.
 * `guide.step` là số thứ tự bước (từ 0) trong hướng dẫn tương ứng ở guideContent*.ts.
 */
export interface HelpEntry {
  title: string;
  /** Dùng để làm gì */
  what: string;
  /** Cách dùng nhanh */
  how: string[];
  note?: string;
  guide?: { id: GuideId; step: number };
}

/** Giới thiệu chung của một tab hoặc màn lẻ không có thanh menu: trang menu Sản xuất, Khai báo, Báo cáo, và Cấu hình, Tài khoản, Tạo vụ */
export type TabHelpKey = 'tab-production' | 'tab-declare' | 'tab-reports' | 'tab-config' | 'tab-profile' | 'create-cycle';
export type HelpKey = ProductionSection | DeclareSection | ReportSection | TabHelpKey;

export const HELP: Record<HelpKey, HelpEntry> = {
  // ---- Giới thiệu chung của từng tab ----
  'tab-production': {
    title: 'Sản xuất',
    what: 'Nơi làm việc hằng ngày: tạo vụ, ghi việc, thu hoạch, kho, chi phí và chấm công.',
    how: [
      'Vụ nuôi trồng: tạo vụ mới và theo dõi lịch, "Việc đến hạn hôm nay".',
      'Ghi việc và Nhật ký việc: ghi những gì vừa làm và xem lại (nút ＋ ở giữa thanh dưới cũng mở Ghi việc).',
      'Thu hoạch, Quản lý kho, Chi phí, Chấm công: ghi và theo dõi số liệu hằng ngày.',
      'Bấm vào từng ô để vào chức năng; mỗi chức năng có nút ⓘ riêng.',
    ],
    note: 'Mục nào bạn chưa có quyền hoặc cơ sở không dùng thì tự ẩn cho màn hình gọn.',
    guide: { id: 'intro', step: 6 },
  },
  'tab-declare': {
    title: 'Khai báo',
    what: 'Những thứ làm một lần rồi ít đổi. Khai báo xong, mọi bước sau (tạo vụ, ghi việc, nhập kho, bán hàng) chỉ việc chọn trong danh sách, không phải gõ lại.',
    how: [
      'Cơ sở và vật tư: Phân khu, Sản phẩm, Kho, Vật tư, Nhà cung ứng, Máy chấm công.',
      'Nhân sự: Nhân sự, Chức vụ và quyền, Tổ chức.',
      'Quy trình: Việc (loại việc) và Tạo quy trình.',
      'Giấy phép và đối tác: Giấy phép, Khách hàng, Hợp tác xã hoặc Hộ thành viên.',
    ],
    note: 'Nên khai báo theo thứ tự trên cùng: Phân khu, Sản phẩm, Kho, Vật tư rồi mới tới Quy trình.',
    guide: { id: 'declare', step: 0 },
  },
  'tab-reports': {
    title: 'Báo cáo',
    what: 'Xem kết quả đi ra từ những gì bạn đã ghi hằng ngày: lãi lỗ, giá thành, công nợ, lương và hồ sơ.',
    how: [
      'Báo cáo tuần, Tổng kết vụ, Doanh thu, Công nợ, Bảng lương: xem tiền và kết quả.',
      'Sổ nhật ký và Bảng kiểm: in hoặc xuất khi cần nộp để kiểm tra.',
      'Hồ sơ web và Đơn khách từ website: làm việc với website thương mại.',
    ],
    note: 'Báo cáo đúng đến đâu là do bạn ghi việc, vật tư, thu hoạch đủ đến đó.',
    guide: { id: 'crop', step: 13 },
  },

  'tab-config': {
    title: 'Cấu hình',
    what: 'Các danh sách mặc định của cơ sở. Đây là nơi chọn loại sản phẩm bạn thật sự làm; những chỗ cần chọn trong app sẽ lấy danh sách từ đây.',
    how: [
      'Nhóm loại sản phẩm: tích cột "Sử dụng" cho loại bạn làm (Cây trồng, Vật nuôi, Thủy sản). Việc, mẫu, vật tư của loại khác sẽ tự ẩn.',
      'Tạo quy trình: chọn dùng công đoạn hay chỉ một danh sách việc.',
      'Nhóm vật tư, nhóm chi phí, loại khách hàng, kiểu nhà/chuồng: đã có sẵn, chỉ sửa khi muốn gọi tên khác.',
    ],
    note: 'Chưa chắc thì để mặc định. Đổi lúc nào cũng được, dữ liệu đã ghi không mất.',
    guide: { id: 'declare', step: 1 },
  },
  'tab-profile': {
    title: 'Tài khoản',
    what: 'Thông tin của bạn và của cơ sở đang chọn: tên, mật khẩu, quyền của bạn và gói dịch vụ.',
    how: [
      'Đổi tên hiển thị và đổi mật khẩu.',
      '"Tôi được làm gì": xem vai trò và quyền của bạn ở cơ sở này.',
      '"Công việc của tôi": tổ và phân khu bạn được giao.',
      '"Gói dịch vụ": gói đang dùng và số vụ tối đa chạy cùng lúc.',
      '"Mã QR tài khoản": thông tin tài khoản và cơ sở để chia sẻ.',
    ],
    note: 'Lời mời vào cơ sở khác (nếu có) hiện ở đầu trang này.',
    guide: { id: 'intro', step: 13 },
  },
  'create-cycle': {
    title: 'Tạo vụ mới',
    what: 'Mở một vụ nuôi trồng mới: chọn sản phẩm, quy trình, phân khu và ngày bắt đầu. App tự lập lịch các công đoạn cho vụ.',
    how: [
      'Chọn Sản phẩm, quy trình và Phân khu / nhà màng (danh sách gom nhà màng theo phân khu; app cảnh báo nếu khác loại).',
      'Chọn ngày bắt đầu, hoặc "Chưa bắt đầu (Chuẩn bị)" nếu muốn lập lịch trước.',
      'Nên nhập thêm giống, diện tích, số cây hoặc số con, sản lượng và ngân sách dự kiến để app so kế hoạch với thực tế.',
      'Tạo xong, chọn cách quản lý vụ (5 kiểu); đổi lại được sau.',
      'Công đoạn chuẩn bị: chọn chuẩn bị trong toàn bộ nhà màng, trong 1 phần nhà màng, hoặc ở nhà chuẩn bị riêng. Hai cách sau lưu vụ ở trạng thái Chuẩn bị nhưng vẫn ghi việc chuẩn bị được (tối đa 45 ngày).',
      'Nhà màng đang có vụ khác: chọn "Nối tiếp sau vụ…"; khi vụ đó kết thúc, app nhắc bạn bấm "Bắt đầu sản xuất".',
    ],
    note: 'Số vụ chạy cùng lúc bị giới hạn theo gói dịch vụ. Vụ Chuẩn bị không tính; khi vụ trước kết thúc, app nhắc bạn bấm "Bắt đầu sản xuất".',
    guide: { id: 'crop', step: 7 },
  },

  // ---- Sản xuất ----
  cycles: {
    title: 'Vụ nuôi trồng',
    what: 'Nơi tạo và theo dõi các vụ. Mỗi vụ là một lần nuôi trồng thật: sản phẩm + phân khu + ngày bắt đầu.',
    how: [
      'Bấm "+ Tạo vụ mới", chọn sản phẩm, quy trình, phân khu và ngày bắt đầu.',
      'Bấm vào một vụ để xem lịch công đoạn, "Việc đến hạn hôm nay", và bấm Bắt đầu / Xong từng việc.',
      'Mỗi thẻ vụ có dòng chi phí, thu hoạch, doanh thu và lãi lỗ tạm tính.',
    ],
    note: 'Chỉ vụ "Đang sản xuất" mới ghi việc được. Vụ đang Chuẩn bị hoặc Tạm dừng thì bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" trước.',
    guide: { id: 'process', step: 3 },
  },
  log: {
    title: 'Ghi việc',
    what: 'Ghi lại việc vừa làm cho một vụ: làm gì, hôm nào, dùng vật tư gì. Đây là nhật ký của vụ và là nguồn tính chi phí vật tư.',
    how: ['Chọn vụ và việc, nhập nội dung, ảnh, vật tư đã dùng.', 'Quên ghi thì chọn Hôm qua hoặc Hôm kia.', 'Mất mạng vẫn ghi được, app tự gửi lên khi có mạng.'],
    guide: { id: 'process', step: 5 },
  },
  logs: {
    title: 'Nhật ký việc',
    what: 'Danh sách mọi việc đã ghi. Dùng để xem lại, sửa, hủy hoặc ghi lại việc giống hệt.',
    how: [
      'Lọc theo vụ, việc, ngày; bấm vào bản ghi để sửa hoặc hủy.',
      'Bấm "Nhân bản" để mở Ghi việc điền sẵn mọi thứ, chỉ cần chọn lại ngày.',
    ],
    note: 'Sửa luôn có lịch sử. Hủy chỉ đánh dấu hủy, bản ghi vẫn nằm trong lịch sử và không tính vào số liệu.',
    guide: { id: 'process', step: 7 },
  },
  stock: {
    title: 'Quản lý kho',
    what: 'Xem tồn kho vật tư và mọi lần nhập, xuất, chuyển, điều chỉnh.',
    how: [
      'Nhập kho khi mua (có thể kèm hóa đơn và hạn trả).',
      'Vật tư ghi trong Ghi việc tự trừ kho; "Xuất kho" tay chỉ cho trường hợp còn lại và cần ghi lý do.',
      'Đếm thực tế lệch thì bấm "Điều chỉnh tồn" kèm lý do.',
      'Ba tab: Tồn kho, Giao dịch, Báo cáo.',
    ],
    note: 'Giao dịch kho chỉ thêm, không xóa. Tiền vật tư vào chi phí lúc DÙNG, không phải lúc mua.',
    guide: { id: 'stock', step: 0 },
  },
  expense: {
    title: 'Chi phí',
    what: 'Ghi các khoản chi không phải vật tư kho: nhân công thuê ngoài, điện nước, thuê, khấu hao…',
    how: ['Chọn nhóm chi phí và nhập số tiền.', 'Chi của riêng một vụ thì gắn vụ; chi chung cả cơ sở thì để trống vụ.'],
    note: 'Đừng ghi tiền mua vật tư ở đây: vật tư đã được tính khi dùng, ghi lại sẽ bị tính hai lần.',
    guide: { id: 'stock', step: 7 },
  },
  harvest: {
    title: 'Thu hoạch',
    what: 'Ghi sản lượng thu được. Với vật nuôi là số con và số kg xuất chuồng.',
    how: [
      'Ghi ngày, sản lượng và hao hụt. Sản lượng tính sau hao hụt.',
      'Mất mạng vẫn ghi mới được. Sửa hoặc hủy phiếu cần có mạng; hủy phải ghi lý do.',
    ],
    note: 'Sản lượng thật là mẫu số để tính giá thành mỗi kg.',
    guide: { id: 'crop', step: 11 },
  },
  attendance: {
    title: 'Chấm công',
    what: 'Xem và xác nhận giờ làm của người làm. Chỉ công đã xác nhận mới tính tiền.',
    how: [
      'Hôm nay: số liệu trong ngày và việc cần xử lý.',
      'Công: lọc, xác nhận, từ chối hoặc đề nghị sửa giờ; có nút xác nhận một lượt các công hợp lệ.',
      'Ảnh cần xem: ảnh bị gắn cờ đỏ từ máy chấm công.',
      'Hộ không dùng máy: bấm "＋ Chấm công cho người làm".',
    ],
    guide: { id: 'staff', step: 7 },
  },

  // ---- Khai báo ----
  areas: {
    title: 'Phân khu',
    what: 'Nơi nuôi trồng của cơ sở, chia 2 cấp: phân khu (cụm, ví dụ "Vườn Đông") và bên trong là nhà màng, chuồng hoặc ao nơi chạy vụ.',
    how: [
      'Bấm "+ Thêm phân khu": tên, diện tích, vị trí, ảnh.',
      'Phân khu lớn có nhiều nhà màng: bấm "+ Nhà màng" hoặc "+ Nhiều nhà màng cùng lúc" (nhập số lượng, app tự đánh số).',
      'Phân khu đang có vụ mà muốn chia nhỏ: bấm "Chia thành nhà màng", app chuyển các vụ hiện có sang nhà màng đầu tiên.',
      'Chỗ không nuôi trồng (cổng, kho, biogas) chọn loại "Cơ sở vật chất".',
    ],
    note: 'Vụ gắn vào nhà màng; phân khu chưa chia nhỏ thì vụ gắn thẳng phân khu. Diện tích phân khu tự cộng từ các nhà màng. Giao quyền cho người làm theo phân khu thì họ thấy mọi nhà màng bên trong.',
    guide: { id: 'declare', step: 2 },
  },
  crops: {
    title: 'Sản phẩm',
    what: 'Loại cây trồng hoặc vật nuôi mà cơ sở làm.',
    how: ['Chọn loại có sẵn hoặc thêm loại riêng.', 'Mục có sẵn không đúng ý thì sửa hoặc dừng dùng riêng cho cơ sở.'],
    note: 'Sản phẩm quyết định các ô nhập riêng khi ghi việc và thu hoạch.',
    guide: { id: 'declare', step: 3 },
  },
  worktypes: {
    title: 'Việc (loại việc)',
    what: 'Danh sách các loại việc để chọn khi lập quy trình và khi ghi việc: làm đất, tưới, bón phân, cho ăn…',
    how: [
      'Mỗi loại việc áp dụng cho một đối tượng (cây trồng, vật nuôi, thủy sản).',
      'Có thể đặt ô thông tin cần nhập, giá trị điền sẵn, ngưỡng cảnh báo và vật tư thường dùng.',
      'Bấm "Thêm việc" để tạo loại việc riêng.',
    ],
    guide: { id: 'process', step: 1 },
  },
  templates: {
    title: 'Tạo quy trình',
    what: 'Soạn "công thức" làm một loại sản phẩm: các công đoạn và việc trong từng công đoạn. Làm một lần, dùng cho nhiều vụ.',
    how: [
      'Tab "Mẫu hệ thống": xem trước rồi bấm "Áp dụng cho cơ sở của tôi".',
      'Tab "Của cơ sở": sửa hoặc nhân bản quy trình của bạn.',
      'Đặt số ngày, "Bắt đầu ngày thứ" (để trống là nối tiếp, nhập số là chạy song song), "Lặp lại mỗi … ngày".',
    ],
    note: 'Mẫu hệ thống chỉ để tham khảo. Hãy chỉnh số ngày, vật tư, hướng dẫn cho đúng cách làm của bạn.',
    guide: { id: 'process', step: 2 },
  },
  materials: {
    title: 'Vật tư',
    what: 'Danh sách vật tư dùng trong cơ sở: phân, thuốc, giống, thức ăn…',
    how: ['Sửa hoặc thêm vật tư của bạn (app đã có sẵn danh sách thường dùng).', 'Chọn nhóm, đơn vị tính; đặt mức tồn tối thiểu để được cảnh báo khi sắp hết.'],
    note: 'Vật tư có hạn dùng thì ghi số lô và hạn lúc nhập kho.',
    guide: { id: 'declare', step: 5 },
  },
  places: {
    title: 'Kho',
    what: 'Nơi cất giữ vật tư: kho phân, kho thuốc, kho thức ăn…',
    how: ['Tạo các kho; có thể có nhiều kho.', 'Nhập, chuyển, điều chỉnh tồn làm ở Sản xuất → Quản lý kho.'],
    guide: { id: 'declare', step: 4 },
  },
  partners: {
    title: 'Nhà cung ứng',
    what: 'Nơi bạn mua vật tư. Dùng khi nhập kho có hóa đơn để theo dõi công nợ phải trả.',
    how: ['Thêm tên, liên hệ của nhà cung ứng.', 'Khi nhập kho có hóa đơn, chọn nhà cung ứng và ghi hạn trả.'],
    guide: { id: 'declare', step: 6 },
  },
  kiosks: {
    title: 'Máy chấm công',
    what: 'Biến một điện thoại đặt cố định thành máy chấm công cho người làm.',
    how: [
      'Bấm "Liên kết điện thoại này làm máy chấm công": đặt tên máy, chọn phân khu (cấp 1, nơi đặt máy), tích xác nhận đã báo người làm.',
      'Sau đó máy chỉ còn màn Chấm công. Chủ vào lại app bằng số điện thoại + PIN.',
      'Mỗi cơ sở có tối đa 20 máy.',
    ],
    note: 'Cần có mạng. Lần đầu tải thêm khoảng 8 MB để nhận diện khuôn mặt, nên làm khi có Wi-Fi.',
    guide: { id: 'staff', step: 3 },
  },
  customers: {
    title: 'Khách hàng',
    what: 'Người mua sản phẩm của bạn. Dùng khi ghi bán hàng để theo dõi công nợ phải thu.',
    how: ['Thêm khách mới hoặc sửa thông tin.', 'Khách hỏi mua từ website có thể thêm thẳng vào đây ở Báo cáo → Đơn khách từ website.'],
    guide: { id: 'declare', step: 6 },
  },
  positions: {
    title: 'Chức vụ',
    what: 'Đặt chức vụ cho người trong cơ sở và quyền của từng chức vụ.',
    how: [
      'Mỗi chức vụ có một vai trò (Nhân viên hoặc Quản lý) và quyền theo mục: Kho, Thu hoạch, Chi phí, Doanh thu, Tổng kết, Khai báo, Tiền công, Hồ sơ website.',
      'Mỗi người giữ một chức vụ; cần ngoại lệ thì chủ cấp riêng.',
    ],
    note: 'Quyền được kiểm ở máy chủ, không chỉ ẩn nút trên màn hình.',
    guide: { id: 'staff', step: 2 },
  },
  teams: {
    title: 'Tổ chức',
    what: 'Lập phòng ban hoặc tổ sản xuất và chọn tổ trưởng.',
    how: ['Tạo phòng/tổ, chọn tổ trưởng.', 'Tổ trưởng chấm công và xác nhận công cho người trong tổ (không cho chính mình).'],
    guide: { id: 'staff', step: 2 },
  },
  members: {
    title: 'Nhân sự',
    what: 'Danh sách người làm trong cơ sở: tạo tài khoản, đặt chức vụ, phân khu, cách trả công.',
    how: [
      'Bấm "+ Thêm nhân sự": họ tên, số điện thoại, chức vụ, phân khu, kiểu trả công.',
      'Mật khẩu tạm và mã đặt PIN chỉ hiện một lần: chép hoặc đưa cho người đó ngay.',
      'Bấm ✎ để đổi mật khẩu, khóa đăng nhập, gỡ khỏi cơ sở hoặc xóa khuôn mặt.',
    ],
    guide: { id: 'staff', step: 1 },
  },
  coop: {
    title: 'Hợp tác xã / Hộ thành viên',
    what: 'Hợp tác xã mời và theo dõi hộ thành viên; hộ thấy lời mời và chấp nhận.',
    how: ['Hợp tác xã: mời hộ bằng lời mời hoặc tạo hộ thành viên cho người chưa có tài khoản.', 'Mỗi hộ vẫn có cơ sở riêng; hợp tác xã chỉ thấy phần hộ đồng ý chia sẻ.'],
    guide: { id: 'coop', step: 1 },
  },
  licenses: {
    title: 'Giấy phép',
    what: 'Lưu giấy phép, chứng nhận của cơ sở (ví dụ VietGAP) và ngày hết hạn.',
    how: ['Thêm giấy phép, ngày cấp, ngày hết hạn.', 'App nhắc khi giấy sắp hết hạn để bạn gia hạn kịp.'],
    guide: { id: 'declare', step: 7 },
  },

  // ---- Báo cáo ----
  payables: {
    title: 'Công nợ',
    what: 'Xem tiền nợ phải trả (mua vật tư chịu) và phải thu (khách chưa trả hết).',
    how: ['Xem tổng nợ, tuổi nợ và nhắc khi sắp hoặc đã quá hạn.', 'Ghi lần trả hoặc thu tiếp theo ngay tại đây.'],
    guide: { id: 'stock', step: 7 },
  },
  sales: {
    title: 'Doanh thu',
    what: 'Ghi mỗi lần bán hàng: khách, số lượng, số tiền, còn nợ bao nhiêu.',
    how: ['Bấm "Ghi bán hàng", chọn khách, nhập số lượng và số tiền.', 'Khách chưa trả hết thì ghi hạn thu tiền; app nhắc khi quá hạn.'],
    note: 'Doanh thu đi thẳng vào Tổng kết vụ để tính lãi lỗ.',
    guide: { id: 'crop', step: 11 },
  },
  summary: {
    title: 'Tổng kết vụ',
    what: 'Chi phí, doanh thu, lãi lỗ và giá thành mỗi kg của từng vụ.',
    how: [
      'Cơ sở có chia nhà màng: khối "Tổng hợp theo phân khu" ở đầu trang cộng chi phí, thu hoạch, doanh thu, lãi lỗ của các vụ trong từng phân khu và nhà màng.',
      'Chọn vụ để xem số liệu chi tiết; xuất bảng CSV được.',
      'Thiếu số liệu thì app hiện "chưa đủ số liệu" thay vì đưa con số sai.',
    ],
    note: 'Số liệu đúng đến đâu là do bạn ghi việc, vật tư, thu hoạch đủ đến đó.',
    guide: { id: 'crop', step: 13 },
  },
  weekly: {
    title: 'Báo cáo tuần',
    what: 'Tóm tắt tuần vừa qua, so với tuần trước và những điểm cần chú ý.',
    how: ['Xem số liệu chính của tuần.', 'Bấm chia sẻ để gửi báo cáo cho người khác.'],
    guide: { id: 'crop', step: 13 },
  },
  paybook: {
    title: 'Bảng lương',
    what: 'Mỗi người xem lương và công của mình. Chủ xem cả cơ sở và chốt lương theo tháng.',
    how: [
      'Chọn tháng, quý hoặc năm để xem thực nhận, giờ công, thưởng, phạt, tạm ứng.',
      'Chủ: bấm Tính lương, xử lý hết việc dang dở rồi Khóa kỳ.',
    ],
    note: 'Số "Ước tính" hiện cả khi chủ chưa chốt. Kỳ đã khóa là số chính thức.',
    guide: { id: 'staff', step: 8 },
  },
  custom: {
    title: 'Báo cáo theo nhu cầu',
    what: 'Tự chọn loại báo cáo, bộ lọc, xem dạng biểu đồ hoặc bảng và lưu lại.',
    how: ['Chọn loại báo cáo và khoảng thời gian.', 'Đổi giữa biểu đồ và bảng; lưu lại để mở nhanh lần sau.'],
    guide: { id: 'crop', step: 13 },
  },
  website: {
    title: 'Đơn khách từ website',
    what: 'Xử lý khách hỏi mua và đơn đặt hàng đến từ website ngay trong app.',
    how: [
      'Tab "Khách tiềm năng": gọi khách, bấm "Đã xử lý" hoặc "Thêm vào khách hàng".',
      'Tab "Đơn hàng": báo giá, chuẩn bị, giao, ghi nhận thanh toán.',
      'Đơn đã giao: bấm "Ghi doanh thu" để vào Tổng kết vụ.',
    ],
    note: 'Cần quyền "Hồ sơ website".',
    guide: { id: 'webtalk', step: 5 },
  },
  commerce: {
    title: 'Hồ sơ web',
    what: 'Soạn hồ sơ giới thiệu cơ sở và sản phẩm để hiện trên website cho người mua tìm thấy.',
    how: [
      'Điền tên hiển thị, giới thiệu, mô tả, địa chỉ công khai và thông tin liên hệ.',
      'Gửi duyệt. Quản trị website duyệt xong, hồ sơ mới hiện trên website.',
    ],
    note: 'Chi phí, lương và nhật ký chi tiết không bao giờ lên website.',
    guide: { id: 'webtalk', step: 1 },
  },
  checklist: {
    title: 'Bảng kiểm',
    what: 'Bảng kiểm dùng khi cần đối chiếu quy trình của cơ sở với tiêu chuẩn (ví dụ VietGAP).',
    how: ['Mở bảng kiểm tương ứng và đối chiếu với nhật ký đã ghi.', 'In hoặc xuất ra khi cần nộp.'],
    guide: { id: 'crop', step: 13 },
  },
  logbook: {
    title: 'Sổ nhật ký',
    what: 'Sổ nhật ký in hoặc xuất Excel từ các việc đã ghi, để nộp khi được kiểm tra.',
    how: ['Chọn vụ và khoảng thời gian.', 'In hoặc xuất Excel.'],
    note: 'Ghi việc đầy đủ và đúng ngày thì sổ mới đáng tin.',
    guide: { id: 'process', step: 7 },
  },
};
