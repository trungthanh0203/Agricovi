// Nội dung và cấu trúc mặc định của website (W1, D60–D61). Website và trang quản trị dùng chung để:
// - website luôn hiển thị được khi CSDL chưa có nội dung hoặc chưa kết nối;
// - quản trị viên có điểm xuất phát để sửa (menu, trang tĩnh).

export interface SiteLink { label: string; href: string }
export interface SiteNavItem extends SiteLink { children?: SiteLink[] }
export interface SiteFooterCol { title: string; links: SiteLink[] }
export interface SiteSettings {
  brand: { name?: string; tagline?: string; description?: string; hero_title?: string; hero_text?: string; hero_trade?: string };
  contact: { hotline?: string; email?: string; address?: string; operator?: string };
  social: { facebook?: string; zalo?: string; youtube?: string; tiktok?: string };
  legal: { registration?: string; copyright?: string };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  brand: {
    name: 'Agricovi',
    tagline: 'Kết nối nông nghiệp Việt',
    description: 'Nền tảng kết nối nhà vườn, hợp tác xã và người mua nông sản, vật tư; truy xuất nguồn gốc từ dữ liệu sản xuất thật.',
    hero_title: 'Tìm nơi trồng, sản phẩm và nguồn gốc nông sản',
    hero_text: 'Danh bạ nhà cung cấp đã được kiểm duyệt, tình trạng cung ứng cập nhật thường xuyên và truy xuất nguồn gốc từng mùa vụ.',
    hero_trade: 'Đăng tin cần mua, cần bán và trao đổi trực tiếp với người mua, nhà cung cấp đã đăng ký. Liên hệ chỉ mở khi hai bên cùng đồng ý.',
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

/** Mục con của một chuyên mục tin (bài viết lưu mã mục con ở cột section). Tin hội chợ không có mục con lưu (Sắp diễn ra/Đã diễn ra/Lịch tính theo ngày). */
export const NEWS_CHANNEL_HREF = { nong_nghiep: '/tin-nong-nghiep/', xuat_khau: '/tin-xuat-khau/', hoi_cho: '/tin-hoi-cho/' } as const;
export function newsSections(channel: keyof typeof NEWS_CHANNEL_HREF): { slug: string; label: string }[] {
  if (channel === 'hoi_cho') return [];
  const base = NEWS_CHANNEL_HREF[channel];
  return (DEFAULT_HEADER_NAV.find((i) => i.href === base)?.children ?? [])
    .filter((c) => c.href.startsWith(base) && c.href !== base)   // bỏ các mục dẫn sang trang khác (Giá nông sản, Lịch mùa vụ)
    .map((c) => ({ slug: c.href.slice(base.length).replace(/\/+$/, ''), label: c.label }));
}

/** Menu "Tìm hiểu về Agricovi" trên thanh xanh */
export const DEFAULT_ABOUT_MENU: SiteLink[] = [
  { label: 'Về chúng tôi', href: '/gioi-thieu' },
  { label: 'Hướng dẫn sử dụng', href: '/huong-dan-su-dung' },
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
    description: 'Agricovi kết nối nhà vườn, hợp tác xã và người mua nông sản.',
    body: [
      'Agricovi giúp nhà vườn, trang trại và hợp tác xã ghi chép quá trình nuôi trồng, quản lý vật tư, chấm công và chi phí; đồng thời giới thiệu sản phẩm đến người mua.',
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
      'Đăng ký tài khoản trên ứng dụng Agricovi, tạo cơ sở của bạn và làm theo hướng dẫn từng bước.',
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
    description: 'Giải đáp thắc mắc khi dùng Agricovi.',
    body: [
      '## Tài liệu hướng dẫn',
      '[[Giới thiệu hệ thống Agricovi|/huong-dan/he-thong/]]',
      '[[Hướng dẫn trồng trọt|/huong-dan/trong-cay/]]',
      '[[Hướng dẫn vật nuôi|/huong-dan/vat-nuoi/]]',
      '## Câu hỏi thường gặp',
      '- Thông tin cơ sở trên website có đáng tin không? Hồ sơ do từng cơ sở tự khai và được kiểm duyệt trước khi hiển thị. Nhãn "Tự khai báo" nghĩa là chưa được xác minh độc lập.',
      '- Làm sao xem nguồn gốc một sản phẩm? Nhập mã vụ in trên bao bì (dạng VU-XXXXXXXX) hoặc quét mã QR.',
      '- Cần hỗ trợ thêm? Vào trang Liên hệ.',
      '[[Kiểm tra nguồn gốc|/truyxuat/]]',
    ].join('\n\n'),
  },
  'huong-dan-su-dung': {
    title: 'Hướng dẫn sử dụng',
    description: 'Giới thiệu tổng thể Agricovi, cách dữ liệu từ ứng dụng lên website và hướng dẫn từng chức năng.',
    body: [
      'Trang này giúp bạn hiểu Agricovi hoạt động thế nào và cách dùng từng phần của website. Đọc từ trên xuống nếu mới làm quen, hoặc chọn nhanh phần bạn cần.',
      '## 1. Agricovi là gì?',
      'Agricovi gồm hai phần làm việc cùng nhau:',
      '- Ứng dụng (app.agricovi.com): dành cho nhà vườn, trang trại, hợp tác xã ghi chép sản xuất hằng ngày: nhật ký, vật tư, thu hoạch, chi phí, chấm công.',
      '- Website (trang bạn đang xem): nơi người mua tìm nhà cung cấp, xem nguồn gốc nông sản, tìm vật tư và giao thương với nhau.',
      '## 2. Dữ liệu từ ứng dụng lên website như thế nào?',
      'Website không tự lấy dữ liệu sản xuất của ai. Mọi thông tin chỉ lên website khi chủ cơ sở chủ động công khai, theo các bước sau:',
      '- Bước 1: chủ cơ sở ghi chép trong ứng dụng (mùa vụ, vật tư đã dùng, thu hoạch, chứng chỉ, sản phẩm).',
      '- Bước 2: chủ cơ sở chọn nhóm thông tin muốn công khai (giới thiệu, hình ảnh, sản phẩm, mùa vụ truy xuất) rồi gửi duyệt.',
      '- Bước 3: ban quản trị website kiểm duyệt. Chỉ hồ sơ đạt mới được hiển thị.',
      '- Bước 4: website hiện một bản chụp đã duyệt. Dữ liệu vận hành bên trong (kho, chi phí, tiền công, nhân sự) luôn riêng tư và không bao giờ hiện ra website.',
      'Khi chủ cơ sở sửa thông tin và gửi duyệt lại, website cập nhật sau khi được duyệt. Chủ cơ sở có thể dừng công khai bất cứ lúc nào.',
      '## 3. Tìm nhà cung cấp và sản phẩm',
      '- Danh bạ nhà cung cấp: tìm theo tên cơ sở hoặc sản phẩm, lọc theo tỉnh/thành, tình trạng còn hàng và chứng chỉ.',
      '- Danh mục và sản phẩm: duyệt theo nhóm (rau củ quả, trái cây, vật nuôi, gạo và nông sản khô, giống…), xem giá từ và nơi bán.',
      '- Nhãn "Đang có hàng", "Sắp có", "Hết hàng" do cơ sở tự cập nhật; nhãn "Tự khai báo" nghĩa là thông tin chưa được xác minh độc lập.',
      '- Huy hiệu tin cậy (Cơ bản, Tin cậy, Rất tin cậy) cho biết mức độ đầy đủ và minh bạch của hồ sơ.',
      '- Ô tìm kiếm trên đầu trang tìm cùng lúc sản phẩm, vật tư và nhà cung cấp.',
      '[[Xem danh bạ nhà cung cấp|/danh-ba/]]',
      '## 4. Kiểm tra nguồn gốc nông sản',
      '- Nhập mã vụ in trên bao bì (dạng VU-XXXXXXXX) vào ô "Truy xuất nguồn gốc" ở trang chủ, hoặc quét mã QR.',
      '- Bạn sẽ thấy dòng thời gian của vụ: nơi trồng, các công việc đã làm, vật tư đã dùng và thời gian cách ly.',
      '- Thông tin này đi thẳng từ nhật ký sản xuất của cơ sở nên đáng tin hơn lời giới thiệu thông thường.',
      '[[Kiểm tra nguồn gốc|/truyxuat/]]',
      '## 5. Vật tư nông nghiệp và gian hàng vật tư',
      '- Mục Vật tư: phân bón, thuốc, giống, thiết bị… do ban quản trị biên soạn, có thông tin sử dụng và nơi bán.',
      '- Gian hàng bán vật tư: các cửa hàng vật tư đăng ký để giới thiệu sản phẩm của mình (mỗi gian hàng hiển thị tối đa 10 vật tư).',
      '- Bấm "Yêu cầu báo giá" ở sản phẩm, vật tư hoặc nhà cung cấp để hỏi giá. Không cần tài khoản; bạn để lại số điện thoại hoặc email để được liên hệ lại.',
      '[[Xem vật tư|/vat-tu/]]',
      '## 6. Giá, lịch mùa vụ và thống kê',
      '- Giá nông sản: bảng giá tham khảo được tổng hợp từ các nhà cung cấp.',
      '- Lịch mùa vụ: nông sản nào đang vào vụ, thời điểm nào có hàng.',
      '- Thống kê: số liệu tổng quan về nhà cung cấp và sản phẩm trên website.',
      '[[Xem giá nông sản|/gia-nong-san/]]',
      '[[Xem lịch mùa vụ|/lich-mua-vu/]]',
      '## 7. Tin tức, sự kiện và hội chợ',
      'Ba chuyên mục trên thanh menu: Tin nông nghiệp, Tin xuất khẩu và Tin hội chợ. Chữ chạy ở thanh trên cùng hiện tin cần mua và kết quả giao thương mới nhất.',
      '## 8. Tài khoản người dùng',
      '- Xem thông tin, tìm kiếm và truy xuất nguồn gốc không cần đăng nhập.',
      '- Đăng ký tài khoản (bằng email) để lưu nhà cung cấp và sản phẩm yêu thích, theo dõi yêu cầu báo giá, nhận thông báo và dùng giao thương.',
      '- Cần xác nhận email trước khi đăng tin giao thương. Quên mật khẩu: dùng trang "Quên mật khẩu"; tài khoản đăng ký bằng số điện thoại cần liên hệ quản trị để được hỗ trợ.',
      '[[Đăng ký tài khoản|/dang-ky/]]',
      '## 9. Giao thương',
      'Nơi người mua và nhà cung cấp gặp nhau trực tiếp:',
      '- Tin cần mua: người mua đăng nhu cầu; nhà cung cấp gửi báo giá (giá, số lượng, ngày giao dự kiến).',
      '- Tin cần bán: nhà cung cấp đăng hàng đang có; người mua gửi quan tâm.',
      '- Tin được ban quản trị duyệt trước khi hiển thị. Khách chưa đăng nhập xem được danh sách; đăng nhập để xem chi tiết và trao đổi.',
      '- Hộp thư: hai bên trao đổi ngay trên website. Số điện thoại và email chỉ mở khi cả hai bên cùng đồng ý, và không được dán vào tin hay tin nhắn.',
      '- Kết quả giao thương: các giao dịch đã chốt thành công được tổng hợp công khai (ẩn thông tin cá nhân).',
      '- Đánh giá: sau giao dịch, bạn có thể đánh giá nhà cung cấp để giúp người khác chọn đúng nơi.',
      '- Thấy tin hoặc hồ sơ có dấu hiệu sai, lừa đảo: dùng nút "Báo cáo vi phạm"; ban quản trị sẽ xử lý.',
      '[[Vào giao thương|/giao-thuong/]]',
      '## 10. Dành cho người bán',
      '- Đăng ký tài khoản trên ứng dụng, tạo cơ sở và dùng thử miễn phí.',
      '- Trong ứng dụng, vào Báo cáo, chọn Hồ sơ website để điền giới thiệu, hình ảnh, sản phẩm, chứng chỉ rồi gửi duyệt.',
      '- Với từng vụ, bấm "Mở công khai website" để tạo mã truy xuất và mã QR in lên bao bì.',
      '- Trả lời yêu cầu báo giá và tin nhắn ở Gian hàng của tôi và Hộp thư.',
      '[[Hướng dẫn bán hàng và đăng tin|/huong-dan-ban-hang]]',
      '## 11. Dùng tiếng Anh và trên điện thoại',
      '- Nút VI/EN ở thanh trên cùng đổi giữa tiếng Việt và tiếng Anh.',
      '- Website dùng tốt trên điện thoại; ứng dụng cài được như một ứng dụng thường và ghi việc hằng ngày kể cả khi mất mạng.',
      '## 12. Cần thêm trợ giúp?',
      '- Câu hỏi thường gặp và tài liệu trồng trọt, vật nuôi: Trung tâm trợ giúp.',
      '- Cần hỗ trợ trực tiếp hoặc báo vi phạm: trang Liên hệ.',
      '[[Trung tâm trợ giúp|/tro-giup]]',
      '[[Liên hệ hỗ trợ|/lien-he]]',
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
    description: 'Liên hệ với Agricovi.',
    body: [
      'Nếu cần báo cáo hồ sơ có thông tin sai hoặc vi phạm, vui lòng liên hệ qua thông tin hoặc biểu mẫu dưới đây, kèm đường dẫn trang liên quan.',
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
  | { t: 'img'; src: string; alt: string }
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
      const im = /^!\[(.*?)\]\((.+?)\)$/.exec(line);
      if (line.startsWith('## ')) { flush(); out.push({ t: 'h', text: line.slice(3).trim() }); }
      else if (line.startsWith('- ')) list.push(line.slice(2).trim());
      else if (im) { flush(); const src = safeHref(im[2]); if (src) out.push({ t: 'img', src, alt: im[1]!.trim() }); }
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
// Đơn vị bán vật tư (chọn trong danh sách để mọi nơi dùng cùng một cách viết); đơn vị cũ gõ tay ngoài danh sách vẫn giữ khi sửa
export const MATERIAL_UNITS = ['kg', 'g', 'tấn', 'lít', 'ml', 'chai', 'lọ', 'gói', 'hộp', 'bao', 'thùng', 'túi', 'can', 'cái', 'bộ', 'cuộn', 'mét', 'cây', 'khay'] as const;
export const unitOptions = (cur: string | null | undefined, list: readonly string[] = MATERIAL_UNITS): string[] => (cur && !list.includes(cur) ? [cur, ...list] : [...list]);
export const TRADE_TAGS =['VietGAP', 'Hữu cơ', 'Có truy xuất nguồn gốc', 'Loại 1', 'Đồng đều kích cỡ', 'Giao tận nơi', 'Có hóa đơn', 'Có kiểm định'] as const;
export const TRADE_KIND_LABEL: Record<string, string> = { buy: 'Cần mua', sell: 'Cần bán' };
export const TRADE_STATUS_LABEL: Record<string, string> = { pending: 'Chờ duyệt', published: 'Đang hiển thị', closed: 'Đã đóng', rejected: 'Chưa được duyệt', hidden: 'Đã bị ẩn' };

/** Đơn đặt hàng nông sản (W5, D68) */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  placed: 'Chờ nhà cung cấp báo giá', quoted: 'Đã báo giá, chờ bạn đồng ý', accepted: 'Đã chốt', preparing: 'Đang chuẩn bị hàng', shipped: 'Đang giao',
  delivered: 'Đã giao, chờ xác nhận', completed: 'Hoàn tất', cancelled: 'Đã hủy', rejected: 'Bị từ chối',
};
export const PAYMENT_LABEL: Record<string, string> = { unpaid: 'Chưa thanh toán', partial: 'Đã thanh toán một phần', paid: 'Đã thanh toán đủ' };
