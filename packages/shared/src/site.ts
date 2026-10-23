// Nội dung và cấu trúc mặc định của website (W1, D60–D61). Website và trang quản trị dùng chung để:
// - website luôn hiển thị được khi CSDL chưa có nội dung hoặc chưa kết nối;
// - quản trị viên có điểm xuất phát để sửa (menu, trang tĩnh).

export interface SiteLink { label: string; href: string }
export interface SiteNavItem extends SiteLink { children?: SiteLink[] }
export interface SiteFooterCol { title: string; links: SiteLink[] }
export interface SiteSettings {
  brand: { name?: string; tagline?: string; description?: string };
  contact: { hotline?: string; email?: string; address?: string; operator?: string };
  social: { facebook?: string; zalo?: string; youtube?: string; tiktok?: string };
  legal: { registration?: string; copyright?: string };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  brand: {
    name: 'AgriConnect',
    tagline: 'Kết nối nhà vườn, hợp tác xã và người mua nông sản',
    description: 'Nền tảng kết nối nhà vườn, hợp tác xã và người mua nông sản, vật tư; truy xuất nguồn gốc từ dữ liệu sản xuất thật.',
  },
  contact: {},
  social: {},
  legal: {},
};

export const DEFAULT_CATEGORIES: SiteLink[] = [
  { label: 'Rau củ quả', href: '/danh-muc/rau-cu-qua/' },
  { label: 'Trái cây', href: '/danh-muc/trai-cay/' },
  { label: 'Vật nuôi', href: '/danh-muc/vat-nuoi/' },
  { label: 'Gạo, nông sản khô', href: '/danh-muc/gao-nong-san-kho/' },
  { label: 'Giống, cây giống', href: '/danh-muc/giong/' },
  { label: 'Vật tư nông nghiệp', href: '/danh-muc/vat-tu-nong-nghiep/' },
  { label: 'Phụ kiện, thiết bị', href: '/danh-muc/phu-kien-thiet-bi/' },
];

/** Thanh dưới của header: Tin nông nghiệp | Tin xuất khẩu | Tin hội chợ | Giao thương (D61) */
export const DEFAULT_HEADER_NAV: SiteNavItem[] = [
  { label: 'Tin nông nghiệp', href: '/tin-nong-nghiep/', children: [
    { label: 'Tin trong nước', href: '/tin-nong-nghiep/trong-nuoc/' },
    { label: 'Kỹ thuật và kiến thức', href: '/tin-nong-nghiep/ky-thuat/' },
    { label: 'Chính sách', href: '/tin-nong-nghiep/chinh-sach/' },
    { label: 'Giá nông sản tham khảo', href: '/gia-nong-san/' },
    { label: 'Lịch mùa vụ', href: '/lich-mua-vu/' },
  ] },
  { label: 'Tin xuất khẩu', href: '/tin-xuat-khau/', children: [
    { label: 'Thị trường', href: '/tin-xuat-khau/thi-truong/' },
    { label: 'Quy định và tiêu chuẩn', href: '/tin-xuat-khau/quy-dinh/' },
    { label: 'Doanh nghiệp xuất khẩu', href: '/tin-xuat-khau/doanh-nghiep/' },
  ] },
  { label: 'Tin hội chợ', href: '/tin-hoi-cho/', children: [
    { label: 'Sắp diễn ra', href: '/tin-hoi-cho/sap-dien-ra/' },
    { label: 'Đã diễn ra', href: '/tin-hoi-cho/da-dien-ra/' },
    { label: 'Lịch hội chợ', href: '/tin-hoi-cho/lich/' },
  ] },
  { label: 'Giao thương', href: '/giao-thuong/', children: [
    { label: 'Tin cần mua', href: '/giao-thuong/can-mua/' },
    { label: 'Tin cần bán', href: '/giao-thuong/can-ban/' },
    { label: 'Cho người bán', href: '/danh-cho-nguoi-ban' },
    { label: 'Cho người mua', href: '/danh-cho-nguoi-mua' },
    { label: 'Kết quả giao thương', href: '/giao-thuong/ket-qua/' },
  ] },
];

/** Menu "Tìm hiểu về AgriConnect" trên thanh xanh */
export const DEFAULT_ABOUT_MENU: SiteLink[] = [
  { label: 'Về chúng tôi', href: '/gioi-thieu' },
  { label: 'Hướng dẫn sử dụng', href: '/huong-dan-mua-hang' },
  { label: 'Trung tâm trợ giúp', href: '/tro-giup' },
  { label: 'Liên hệ', href: '/lien-he' },
];

export const DEFAULT_FOOTER_COLS: SiteFooterCol[] = [
  { title: 'Về chúng tôi', links: [
    { label: 'Giới thiệu', href: '/gioi-thieu' },
    { label: 'Dành cho người bán', href: '/danh-cho-nguoi-ban' },
    { label: 'Điều khoản sử dụng', href: '/dieu-khoan-su-dung' },
    { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat' },
    { label: 'Quy chế hoạt động', href: '/quy-che-hoat-dong' },
    { label: 'Giải quyết tranh chấp', href: '/giai-quyet-tranh-chap' },
  ] },
  { title: 'Hỗ trợ', links: [
    { label: 'Trung tâm trợ giúp', href: '/tro-giup' },
    { label: 'Hướng dẫn mua hàng', href: '/huong-dan-mua-hang' },
    { label: 'Hướng dẫn bán hàng và đăng tin', href: '/huong-dan-ban-hang' },
    { label: 'Báo cáo vi phạm', href: '/lien-he' },
  ] },
];

/** Các mục website sẽ có ở những lát sau: hiện thông báo "sắp ra mắt" thay vì lỗi 404 */
export const COMING_SOON_SECTIONS: Record<string, string> = {
  'tin-nong-nghiep': 'Tin nông nghiệp',
  'tin-xuat-khau': 'Tin xuất khẩu',
  'tin-hoi-cho': 'Tin hội chợ',
  'danh-muc': 'Danh mục sản phẩm',
  'tim-kiem': 'Tìm kiếm',
  'dang-nhap': 'Đăng nhập',
  'dang-ky': 'Đăng ký',
};

export interface DefaultPage { title: string; description: string; body: string }

const SOON = 'Nội dung trang này đang được hoàn thiện và sẽ sớm được cập nhật.';

/**
 * Trang tĩnh mặc định (khi CSDL chưa có bản đã đăng cùng địa chỉ). Cú pháp thân bài xem parseBody.
 * Các trang pháp lý chỉ là khung chờ văn bản chính thức, KHÔNG tự đặt nội dung pháp lý.
 */
export const DEFAULT_PAGES: Record<string, DefaultPage> = {
  'gioi-thieu': {
    title: 'Giới thiệu',
    description: 'AgriConnect kết nối nhà vườn, hợp tác xã và người mua nông sản.',
    body: [
      'AgriConnect giúp nhà vườn, trang trại và hợp tác xã ghi chép quá trình nuôi trồng, quản lý vật tư, chấm công và chi phí; đồng thời giới thiệu sản phẩm đến người mua.',
      '## Điều làm nên khác biệt',
      '- Thông tin nguồn gốc đi thẳng từ nhật ký sản xuất thật: mùa vụ, vật tư đã dùng, thời gian cách ly.',
      '- Người trồng tự quyết định thông tin nào được công khai; mọi hồ sơ đều được kiểm duyệt trước khi hiển thị.',
      '- Dùng được trên điện thoại, ghi việc hằng ngày kể cả khi mất mạng.',
      '[[Tìm nhà cung cấp|/danh-ba/]]',
    ].join('\n\n'),
  },
  'danh-cho-nguoi-ban': {
    title: 'Dành cho người bán',
    description: 'Dành cho nhà vườn, hợp tác xã muốn quản lý sản xuất và giới thiệu sản phẩm.',
    body: [
      'Dành cho hộ nông dân, trang trại và hợp tác xã muốn quản lý sản xuất gọn gàng và đưa sản phẩm đến nhiều người mua hơn.',
      '## Bạn nhận được gì',
      '- Ứng dụng ghi nhật ký việc làm, vật tư, thu hoạch, chi phí và tổng kết từng vụ.',
      '- Chấm công, tính tiền công theo giờ hoặc theo sản lượng.',
      '- Hồ sơ giới thiệu trên website, mã QR truy xuất nguồn gốc cho từng vụ.',
      '- Dùng thử miễn phí trước khi chọn gói.',
      '## Bắt đầu',
      'Đăng ký tài khoản trên ứng dụng AgriConnect, tạo cơ sở của bạn và làm theo hướng dẫn từng bước.',
    ].join('\n\n'),
  },
  'danh-cho-nguoi-mua': {
    title: 'Dành cho người mua',
    description: 'Tìm nguồn nông sản, vật tư uy tín và xem rõ nguồn gốc.',
    body: [
      'Dành cho nhà hàng, bếp ăn, thương lái, doanh nghiệp và người tiêu dùng muốn tìm nguồn hàng rõ ràng.',
      '## Bạn có thể',
      '- Tìm nhà cung cấp theo sản phẩm, khu vực và chứng chỉ.',
      '- Quét mã QR trên bao bì để xem nguồn gốc từng mùa vụ.',
      '- Sắp tới: đăng ký tài khoản để lưu nhà cung cấp, đăng tin cần mua và đặt hàng.',
      '[[Xem danh bạ nhà cung cấp|/danh-ba/]]',
    ].join('\n\n'),
  },
  'tro-giup': {
    title: 'Trung tâm trợ giúp',
    description: 'Giải đáp thắc mắc khi dùng AgriConnect.',
    body: [
      '## Câu hỏi thường gặp',
      '- Thông tin cơ sở trên website có đáng tin không? Hồ sơ do từng cơ sở tự khai và được kiểm duyệt trước khi hiển thị. Nhãn "Tự khai báo" nghĩa là chưa được xác minh độc lập.',
      '- Làm sao xem nguồn gốc một sản phẩm? Nhập mã vụ in trên bao bì (dạng VU-XXXXXXXX) hoặc quét mã QR.',
      '- Cần hỗ trợ thêm? Vào trang Liên hệ.',
      '[[Kiểm tra nguồn gốc|/truyxuat/]]',
    ].join('\n\n'),
  },
  'huong-dan-mua-hang': {
    title: 'Hướng dẫn mua hàng',
    description: 'Cách tìm nhà cung cấp và kiểm tra nguồn gốc.',
    body: [
      '## Tìm nơi có hàng',
      '- Vào Danh bạ, tìm theo tên cơ sở hoặc sản phẩm, lọc theo tỉnh/thành và tình trạng còn hàng.',
      '- Mở hồ sơ nhà cung cấp để xem sản phẩm, chứng chỉ và các mùa vụ có truy xuất.',
      '## Kiểm tra nguồn gốc',
      'Nhập mã vụ hoặc quét mã QR để xem quá trình sản xuất và vật tư đã dùng.',
      'Chức năng đặt hàng và giao thương đang được chuẩn bị.',
    ].join('\n\n'),
  },
  'huong-dan-ban-hang': {
    title: 'Hướng dẫn bán hàng và đăng tin',
    description: 'Cách đưa hồ sơ và sản phẩm của bạn lên website.',
    body: [
      '## Đưa hồ sơ lên website',
      '- Trong ứng dụng, vào Báo cáo, chọn Hồ sơ website; điền giới thiệu, hình ảnh, sản phẩm và chứng chỉ.',
      '- Chủ cơ sở đồng ý công khai từng nhóm thông tin rồi gửi duyệt.',
      '- Hồ sơ hiển thị sau khi được kiểm duyệt.',
      '## Công khai mùa vụ để truy xuất',
      'Với từng vụ, chủ cơ sở bấm "Mở công khai website" để tạo mã truy xuất. Bạn có thể dừng hoặc cập nhật bất cứ lúc nào.',
    ].join('\n\n'),
  },
  'lien-he': {
    title: 'Liên hệ',
    description: 'Liên hệ với AgriConnect.',
    body: [
      'Thông tin liên hệ nằm ở cuối trang. Nếu cần báo cáo hồ sơ có thông tin sai hoặc vi phạm, vui lòng liên hệ qua các kênh đó, kèm đường dẫn trang liên quan.',
    ].join('\n\n'),
  },
  'dieu-khoan-su-dung': { title: 'Điều khoản sử dụng', description: 'Điều khoản sử dụng website.', body: SOON },
  'chinh-sach-bao-mat': { title: 'Chính sách bảo mật', description: 'Chính sách bảo mật thông tin.', body: SOON },
  'quy-che-hoat-dong': { title: 'Quy chế hoạt động', description: 'Quy chế hoạt động của website.', body: SOON },
  'giai-quyet-tranh-chap': { title: 'Giải quyết tranh chấp', description: 'Cơ chế giải quyết tranh chấp.', body: SOON },
};

// ---------------------------------------------------------------------------
// Thân bài đơn giản (không cho người soạn chèn HTML):
//   dòng trống ngăn cách các đoạn;  "## Tiêu đề";  các dòng "- mục";  một dòng riêng "[[Chữ trên nút|/đường-dẫn]]"
// ---------------------------------------------------------------------------
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'btn'; label: string; href: string };

/** Liên kết an toàn: đường dẫn nội bộ hoặc https; ngoài ra trả '' */
export function safeHref(h: string | undefined | null): string {
  const s = (h ?? '').trim();
  if (/^\/(?!\/)[^\s"'<>]*$/.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return '';
}

export function parseBody(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of String(text ?? '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const para = raw.trim();
    if (!para) continue;
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    let list: string[] = [];
    const flush = () => { if (list.length) { out.push({ t: 'ul', items: list }); list = []; } };
    for (const line of lines) {
      const btn = /^\[\[(.+?)\|(.+?)\]\]$/.exec(line);
      if (line.startsWith('## ')) { flush(); out.push({ t: 'h', text: line.slice(3).trim() }); }
      else if (line.startsWith('- ')) list.push(line.slice(2).trim());
      else if (btn) { flush(); const href = safeHref(btn[2]); if (href) out.push({ t: 'btn', label: btn[1]!.trim(), href }); }
      else { flush(); out.push({ t: 'p', text: line }); }
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Các khối trang chủ (sau banner): quản trị website đổi thứ tự và ẩn/hiện (cài đặt 'home')
// ---------------------------------------------------------------------------
export interface HomeBlock { id: string; on: boolean }
export const HOME_BLOCK_LABEL: Record<string, string> = {
  giao_thuong: 'Giao thương',
  nha_cung_cap: 'Nhà cung cấp sản phẩm',
  dang_co_hang: 'Đang có hàng',
  trai_cay: 'Trái cây',
  rau_cu_qua: 'Rau củ quả',
  vat_nuoi: 'Vật nuôi',
  vat_tu: 'Vật tư nông nghiệp',
  tin: 'Sự kiện, hội chợ và tin tức',
  truy_xuat: 'Kiểm tra nguồn gốc',
  cta: 'Lời mời nhà vườn, hợp tác xã',
};
export const DEFAULT_HOME_BLOCKS: HomeBlock[] = Object.keys(HOME_BLOCK_LABEL).map((id) => ({ id, on: true }));

/** Ghép cấu hình đã lưu với danh sách mặc định: giữ thứ tự đã lưu, bỏ mã lạ, thêm khối mới ở cuối */
export function normalizeHomeBlocks(raw: unknown): HomeBlock[] {
  const saved = Array.isArray(raw) ? (raw as { id?: unknown; on?: unknown }[]) : [];
  const seen = new Set<string>();
  const out: HomeBlock[] = [];
  for (const b of saved) {
    if (typeof b.id === 'string' && HOME_BLOCK_LABEL[b.id] && !seen.has(b.id)) { seen.add(b.id); out.push({ id: b.id, on: b.on !== false }); }
  }
  for (const d of DEFAULT_HOME_BLOCKS) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}

// ---------------------------------------------------------------------------
// Giao thương (W4): đơn vị, yêu cầu chất lượng, nhãn trạng thái
// ---------------------------------------------------------------------------
export const TRADE_UNITS = ['kg', 'tấn', 'quả', 'trái', 'bó', 'thùng', 'bao', 'con', 'chai', 'lít', 'cây', 'khay'] as const;
export const TRADE_TAGS = ['VietGAP', 'Hữu cơ', 'Có truy xuất nguồn gốc', 'Loại 1', 'Đồng đều kích cỡ', 'Giao tận nơi', 'Có hóa đơn', 'Có kiểm định'] as const;
export const TRADE_KIND_LABEL: Record<string, string> = { buy: 'Cần mua', sell: 'Cần bán' };
export const TRADE_STATUS_LABEL: Record<string, string> = { pending: 'Chờ duyệt', published: 'Đang hiển thị', closed: 'Đã đóng', rejected: 'Chưa được duyệt', hidden: 'Đã bị ẩn' };

/** Đơn đặt hàng nông sản (W5, D68) */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  placed: 'Chờ nhà cung cấp báo giá', quoted: 'Đã báo giá, chờ bạn đồng ý', accepted: 'Đã chốt', preparing: 'Đang chuẩn bị hàng', shipped: 'Đang giao',
  delivered: 'Đã giao, chờ xác nhận', completed: 'Hoàn tất', cancelled: 'Đã hủy', rejected: 'Bị từ chối',
};
export const PAYMENT_LABEL: Record<string, string> = { unpaid: 'Chưa thanh toán', partial: 'Đã thanh toán một phần', paid: 'Đã thanh toán đủ' };
