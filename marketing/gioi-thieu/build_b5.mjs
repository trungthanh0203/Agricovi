// Bộ B5: Website và truy xuất (7 ảnh). Chạy: node marketing/gioi-thieu/build_b5.mjs [số ảnh,số ảnh]
import { C, qrSvg, li, mini, tip, bslide, render } from './common.mjs';

const SET = 'Bộ B5 · Website và truy xuất';
const TOTAL = 7;
const S = (n, o) => bslide({ set: SET, n, total: TOTAL, ...o });

const step = (i, t, d, hl) => `<div class="card" style="flex:1;padding:12px 6px;text-align:center;${hl ? 'background:var(--g);border-color:var(--g);color:#fff' : ''}"><div style="font-size:36px">${i}</div><div style="font-size:19px;font-weight:800;margin-top:2px">${t}</div><div style="font-size:14px;opacity:.85;line-height:1.25">${d}</div></div>`;
const arrow = '<div style="align-self:center;color:var(--o);font-size:24px;font-weight:800">➜</div>';
const table = (head, rows, st = '') => `<table style="font-size:19px;${st}"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const card = (inner, st = '') => `<div class="card" style="padding:16px 20px;${st}">${inner}</div>`;
const h3 = (t) => `<div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:8px">${t}</div>`;
const grid2 = (inner, st = '') => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;${st}">${inner}</div>`;
const cta = (st = '') => `<div class="card" style="padding:14px 22px;display:flex;gap:22px;align-items:center;background:var(--gd);border-color:var(--gd);color:#fff;${st}"><div style="line-height:0;background:#fff;border-radius:10px;padding:6px">${qrSvg(C.webUrl, 118)}</div><div style="font-size:26px;font-weight:700;line-height:1.4">Dùng thử miễn phí 12 tháng<br><span style="font-size:22px;font-weight:600;color:#ffd9a8">Zalo ${C.zalo} · ${C.phone} · ${C.web}</span></div></div>`;
const phone = (style, title, body) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">${title}</div><div class="ab">${body}</div></div></div>`;
const phoneTrace = (style) => phone(style, 'Truy xuất nguồn gốc', `
<div class="ac" style="background:#e6f4ea;border-color:#b7dcc3"><b>🍈 Dưa lưới Hè 2026</b><small>Hộ ông Sáu · Nhà màng 1 · Đồng Nai</small></div>
<div class="ac"><div class="row"><span>🌱 01/12 · Gieo trồng</span><span class="ok">✓</span></div><div class="row"><span>💧 02/12 · Tưới nhỏ giọt</span><span class="ok">✓</span></div><div class="row"><span>🌿 20/12 · Bón phân đợt 1</span><span class="ok">✓</span></div><div class="row"><span>🧪 05/01 · Phòng bệnh sinh học</span><span class="ok">✓</span></div><div class="row"><span>🧺 10/02 · Thu hoạch</span><span class="ok">✓</span></div></div>
<div class="ac"><small>Giấy chứng nhận</small><b>🛡️ Còn hiệu lực đến 08/2027</b></div>
<div class="btn">Nhắn người bán</div>`);
const phoneLead = (style) => phone(style, 'Khách tiềm năng', `
<div class="ac"><b>Cô Lan · 0903 *** ***</b><small>Quan tâm: Dưa lưới loại 1 · cần 500 kg</small><div style="display:flex;gap:6px;margin-top:6px"><span class="chip on" style="margin:0">📞 Gọi</span><span class="chip" style="margin:0">Đã xử lý</span><span class="chip" style="margin:0">+ Khách hàng</span></div></div>
<div class="ac"><b>Nhà hàng Hoa Sen</b><small>Quan tâm: Xoài cát · cần 200 kg/tuần</small><div style="display:flex;gap:6px;margin-top:6px"><span class="chip on" style="margin:0">📞 Gọi</span><span class="chip" style="margin:0">Đã xử lý</span></div></div>
<div class="ac" style="background:#fff7e6;border-color:#f6c98f"><b style="color:#b25e00">📬 Việc chờ từ website</b><small>2 yêu cầu báo giá mới</small></div>`);

const slides = [];

/* 01 Bìa */
slides.push(S(1, {
  title: 'Từ nông trại<br><em>đến tay khách hàng</em>',
  sub: 'App và website dùng chung một tài khoản: bạn làm một lần, khách tìm thấy và liên hệ ngay.',
  vis: `<div style="display:flex;gap:14px;align-items:stretch"><div class="card" style="flex:1;padding:16px;background:#f1faf3;border-color:#b7dcc3;text-align:center"><div style="font-size:54px">📱</div><div style="font-size:30px;font-weight:800;color:var(--g)">APP</div><div style="font-size:20px;color:var(--mut)">Soạn hồ sơ, ghi nhật ký, xử lý khách</div></div>
<div style="align-self:center;text-align:center;color:var(--o);font-weight:800"><div style="font-size:30px">➜</div><div style="font-size:15px;color:var(--mut)">gửi duyệt</div><div style="font-size:30px;margin-top:8px">⬅</div><div style="font-size:15px;color:var(--mut)">khách liên hệ</div></div>
<div class="card" style="flex:1;padding:16px;background:#fff7e6;border-color:#f6c98f;text-align:center"><div style="font-size:54px">🌐</div><div style="font-size:30px;font-weight:800;color:#b25e00">WEBSITE</div><div style="font-size:20px;color:var(--mut)">Hồ sơ, gian hàng, giao thương, truy xuất</div></div></div>
<div style="display:flex;gap:5px;align-items:stretch;margin-top:14px">${step('📝', 'Soạn hồ sơ', 'Ngay trong app')}${arrow}${step('📤', 'Gửi duyệt', 'Quản trị xem')}${arrow}${step('🌐', 'Lên website', 'Bản đã duyệt')}${arrow}${step('📬', 'Khách hỏi', 'Về lại app')}${arrow}${step('💰', 'Ghi doanh thu', 'Vào lãi lỗ', 1)}</div>
${grid2(mini('🔒', 'Riêng tư mặc định', 'Chi phí, lương, nhật ký chi tiết không bao giờ lên web') + mini('✅', 'Chỉ hiện bản đã duyệt', 'Không đổi lặng lẽ sau lưng bạn') + mini('🔳', 'Mỗi vụ một mã QR', 'In dán lên sản phẩm để khách tự kiểm chứng') + mini('🌏', 'Song ngữ Việt - Anh', 'Cho cả khách trong và ngoài nước'), 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Hồ sơ cơ sở',
}));

/* 02 Hồ sơ */
slides.push(S(2, {
  title: 'Hồ sơ cơ sở<br><em>làm một lần, khách tin ngay</em>',
  sub: 'Soạn ngay trong app: bạn quyết định công khai đến mức nào.',
  vis: `<div style="display:flex;gap:14px"><div class="card" style="flex:1.15;padding:16px 18px"><div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:6px">🏡 Trại Hai Lúa</div><div style="font-size:19px;color:var(--mut);margin-bottom:8px">Heo thịt, dưa lưới sạch · Đồng Nai</div>
${[['📅 Năm thành lập', '2016'], ['📐 Tổng diện tích', '3,2 ha'], ['🏠 Canh tác', 'Nhà màng, tưới nhỏ giọt'], ['📦 Năng lực', '40 tấn / vụ'], ['🛡️ Giấy chứng nhận', 'Đã tải lên']].map(([a, b]) => `<div class="row" style="font-size:20px;padding:8px 0"><span>${a}</span><b>${b}</b></div>`).join('')}<div style="font-size:16px;color:var(--mut);margin-top:6px">Hồ sơ mẫu minh họa</div></div>
<div style="flex:.85;display:flex;flex-direction:column;gap:12px">${mini('✍️', 'Tên, giới thiệu, mô tả', 'Mô tả ít nhất 20 ký tự')}${mini('📍', 'Địa chỉ tùy mức công khai', 'Không buộc lộ địa chỉ nhà')}${mini('☎️', 'Liên hệ bạn chọn', 'Điện thoại, Zalo, email, Facebook')}</div></div>
${grid2(mini('📷', 'Ảnh và giấy chứng nhận', 'Hồ sơ rõ ràng, có ảnh được chọn nhiều hơn') + mini('🧑‍💼', 'Giao cho người biên tập', 'Gán chức vụ “Biên tập hồ sơ” cho một người lo phần web'), 'margin-top:14px')}
${tip('<b>Mẹo:</b> điền đủ năm thành lập, diện tích, cách canh tác. Người mua tin hồ sơ có số liệu cụ thể hơn lời quảng cáo.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Duyệt và riêng tư',
}));

/* 03 Duyệt và riêng tư */
slides.push(S(3, {
  title: 'Bạn chọn công khai gì,<br><em>phần còn lại giữ kín</em>',
  sub: 'Website chỉ đọc bản đã duyệt, không bao giờ đọc thẳng dữ liệu vận hành.',
  vis: `<div style="display:flex;gap:6px;align-items:stretch">${step('📝', 'Soạn', 'Trong app')}${arrow}${step('📤', 'Gửi duyệt', 'Một nút bấm')}${arrow}${step('🧑‍⚖️', 'Quản trị duyệt', 'Kiểm tra nội dung')}${arrow}${step('🌐', 'Hiện trên web', 'Bản đã duyệt', 1)}</div>
<div style="display:flex;gap:14px;margin-top:14px"><div class="card" style="flex:1;padding:16px 18px;background:#f1faf3;border-color:#b7dcc3"><div style="font-size:26px;font-weight:800;color:var(--g)">✅ Có thể lên website</div>${li(['Hồ sơ cơ sở, ảnh, giấy chứng nhận', 'Sản phẩm niêm yết, báo giá', 'Vụ bạn chọn công khai', 'Trang truy xuất của vụ'], 22)}</div>
<div class="card" style="flex:1;padding:16px 18px;background:#fdecea;border-color:#f3b6ae"><div style="font-size:26px;font-weight:800;color:#c0392b">⛔ Không bao giờ lên web</div><div style="font-size:22px;line-height:1.5;margin-top:8px;color:var(--mut)">✗ Chi phí<br>✗ Lương, chấm công<br>✗ Nhật ký chi tiết<br>✗ Công nợ, kho</div></div></div>
${grid2(mini('🔐', 'Quyền “Hồ sơ website”', 'Chủ, quản lý hoặc người được giao mới sửa được') + mini('📸', 'Bản chụp bất biến', 'Mỗi lần duyệt là một bản chụp, không đổi ngầm'), 'margin-top:14px')}
${tip('<b>Gói miễn phí vẫn được công khai vụ</b> và đăng tin giao thương; hồ sơ vẫn qua kiểm duyệt như mọi gói.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Mã QR truy xuất',
}));

/* 04 QR truy xuất */
slides.push(S(4, {
  title: 'Quét mã QR,<br><em>thấy cả quá trình nuôi trồng</em>',
  sub: 'Mỗi vụ có một mã QR. In ra dán lên bao bì, thùng hàng, chuồng hoặc ao.',
  vis: `${phoneTrace('right:0;top:0;transform:scale(.88);transform-origin:top right')}
<div style="position:absolute;left:0;top:0;width:560px"><div class="card" style="padding:16px;display:flex;gap:16px;align-items:center"><div style="line-height:0">${qrSvg(C.webUrl, 170)}</div><div><div style="font-size:26px;font-weight:800;color:var(--gd)">Mã QR của vụ</div><div style="font-size:21px;color:var(--mut);line-height:1.35">Dưa lưới Hè 2026<br>Quét bằng điện thoại, không cần cài app</div></div></div>
<div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${mini('🖨️', 'In dán lên sản phẩm', 'Bao bì, thùng hàng, chuồng, ao')}${mini('📒', 'Lấy từ nhật ký thật', 'Ghi việc đúng ngày thì trang truy xuất đáng tin')}${mini('🔒', 'Chỉ hiện phần công khai', 'Chi phí và lương không hiện')}${mini('🛡️', 'Giấy phép, chứng nhận', 'Lưu ngày hết hạn, app nhắc khi sắp hết')}</div></div>
<div style="position:absolute;left:0;right:0;top:618px">${tip('<b>Lưu ý:</b> mã QR trong ảnh chỉ minh họa, trỏ về trang chủ. Mã thật của từng vụ do app tạo.', '')}</div>`,
  nextHint: 'Ảnh tiếp: Gian hàng và giao thương',
}));

/* 05 Website */
const sec = (i, t, d) => `<div class="card" style="padding:12px 14px;text-align:center"><div style="font-size:40px">${i}</div><div style="font-size:21px;font-weight:800;color:var(--gd)">${t}</div><div style="font-size:16px;color:var(--mut);line-height:1.25">${d}</div></div>`;
slides.push(S(5, {
  title: 'Một website,<br><em>nhiều cách kết nối</em>',
  sub: 'Xem tin, giá và danh mục không cần đăng nhập; liên hệ và giao thương cần tài khoản.',
  vis: `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${sec('🌾', 'Nông sản', 'Tìm theo loại, vùng')}${sec('🧪', 'Vật tư', 'Phân, thuốc, giống')}${sec('🏪', 'Gian hàng', 'Nhà cung cấp vật tư')}${sec('📖', 'Danh bạ cơ sở', 'Hồ sơ trang trại, HTX')}${sec('📣', 'Giao thương', 'Tin cần mua, cần bán')}${sec('💲', 'Giá nông sản', 'Cập nhật mỗi ngày')}${sec('📰', 'Tin nông nghiệp', 'Tin, xuất khẩu, hội chợ')}${sec('📅', 'Lịch mùa vụ', 'Gợi ý theo mùa')}</div>
<div style="display:flex;gap:12px;margin-top:14px">${[['🛒', 'Người mua', 'Tìm nông sản, xem hồ sơ, quét QR, nhắn và xin báo giá'], ['🏪', 'Nhà cung cấp vật tư', 'Mở gian hàng, đăng vật tư và giá, nhận liên hệ, xem lượt xem'], ['🌱', 'Cơ sở nuôi trồng', 'Đăng tin cần bán, nhận báo giá và khách hỏi mua']].map(([i, t, d]) => `<div class="card" style="flex:1;padding:14px 14px"><div style="font-size:36px">${i}</div><div style="font-size:23px;font-weight:800;color:var(--gd)">${t}</div><div style="font-size:18px;color:var(--mut);line-height:1.3">${d}</div></div>`).join('')}</div>
${grid2(mini('⭐', 'Đánh giá', 'Người mua đánh giá nhà cung cấp, tăng uy tín') + mini('🌏', 'Song ngữ Việt - Anh', 'Mở rộng ra thị trường nước ngoài'), 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Khách tìm đến',
}));

/* 06 Khách tìm đến */
slides.push(S(6, {
  title: 'Khách hỏi mua,<br><em>app báo ngay cho bạn</em>',
  sub: 'Yêu cầu từ website về thẳng app: gọi lại, báo giá, lưu thành khách hàng.',
  vis: `${phoneLead('right:0;top:0;transform:scale(.88);transform-origin:top right')}
<div style="position:absolute;left:0;top:0;width:575px;display:flex;flex-direction:column;gap:12px">${mini('📬', 'Việc chờ từ website', 'Hiện ngay ở Trang chủ khi có yêu cầu mới')}${mini('📞', 'Bấm gọi, bấm “Đã xử lý”', 'Có thể ghi chú sau cuộc gọi')}${mini('👤', 'Thêm vào Khách hàng', 'Trùng số điện thoại thì nối vào khách cũ, không tạo trùng')}${mini('💬', 'Báo giá từng dòng', 'Nhập đơn giá, số lượng chốt, phí giao, ngày giao')}${mini('🔐', 'Thông tin người hỏi được bảo vệ', 'Chỉ người có quyền website mới xem')}</div>
<div style="position:absolute;left:0;right:0;top:600px">${tip('<b>Đơn hàng trực tuyến:</b> phần đặt hàng và hoa hồng giao thương sẽ mở cho người dùng sau khi hoàn tất tư vấn pháp lý. Hiện khách liên hệ và xin báo giá.', '')}</div>`,
  nextHint: 'Ảnh tiếp: Từ khách đến lãi lỗ',
}));

/* 07 Từ khách đến lãi lỗ */
slides.push(S(7, {
  title: 'Chốt khách xong,<br><em>lãi lỗ tự cập nhật</em>',
  sub: 'Ghi doanh thu từ đơn đã giao chỉ một lần bấm, không phải nhập lại.',
  vis: `<div style="display:flex;gap:5px;align-items:stretch">${step('📬', 'Khách hỏi', 'Từ website')}${arrow}${step('💬', 'Báo giá', 'Chốt số lượng')}${arrow}${step('🚚', 'Giao hàng', 'Ghi trạng thái')}${arrow}${step('💰', 'Ghi doanh thu', 'Một lần bấm')}${arrow}${step('📈', 'Lãi lỗ vụ', 'Tự cập nhật', 1)}</div>
${card(h3('💰 Ghi doanh thu từ đơn đã giao') + table(['Mục', 'App điền sẵn'], [['Vụ', 'Dưa lưới Hè · Nhà màng 1'], ['Khách hàng', 'Cô Lan'], ['Số kg', '500 kg'], ['Số tiền', '7.500.000đ (500 × 15.000)']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa · tạo cả công nợ phải thu</div>', 'margin-top:14px')}
${grid2(mini('🧯', 'Không ghi hai lần', 'Đơn đã ghi rồi, app cảnh báo') + mini('🚚', 'Phí giao không tính vào doanh thu', 'Mặc định tách riêng cho đúng lãi lỗ') + mini('💵', 'Thanh toán ghi nhận ngoài hệ thống', 'Chưa trả, trả một phần, đã trả') + mini('⭐', 'Giữ uy tín', 'Xem và trả lời đánh giá của người mua'), 'margin-top:14px')}
${cta('margin-top:14px')}`,
  nextHint: 'Bộ tiếp theo: B6 Báo cáo và hồ sơ',
}));

render('b5', slides, process.argv[2] ? process.argv[2].split(',').map(Number) : null);
