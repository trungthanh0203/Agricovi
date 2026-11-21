// Bộ B4: HTX và hộ thành viên (7 ảnh). Chạy: node marketing/gioi-thieu/build_b4.mjs [số ảnh,số ảnh]
import { C, qrSvg, li, mini, tip, bslide, render } from './common.mjs';

const SET = 'Bộ B4 · HTX và hộ thành viên';
const TOTAL = 7;
const S = (n, o) => bslide({ set: SET, n, total: TOTAL, ...o });

const step = (i, t, d, hl) => `<div class="card" style="flex:1;padding:12px 6px;text-align:center;${hl ? 'background:var(--g);border-color:var(--g);color:#fff' : ''}"><div style="font-size:36px">${i}</div><div style="font-size:19px;font-weight:800;margin-top:2px">${t}</div><div style="font-size:14px;opacity:.85;line-height:1.25">${d}</div></div>`;
const arrow = '<div style="align-self:center;color:var(--o);font-size:24px;font-weight:800">➜</div>';
const table = (head, rows, st = '') => `<table style="font-size:19px;${st}"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const card = (inner, st = '') => `<div class="card" style="padding:16px 20px;${st}">${inner}</div>`;
const h3 = (t) => `<div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:8px">${t}</div>`;
const col = (inner, st = '') => `<div style="display:flex;flex-direction:column;gap:12px;${st}">${inner}</div>`;
const grid2 = (inner, st = '') => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;${st}">${inner}</div>`;
const cta = (st = '') => `<div class="card" style="padding:14px 22px;display:flex;gap:22px;align-items:center;background:var(--gd);border-color:var(--gd);color:#fff;${st}"><div style="line-height:0;background:#fff;border-radius:10px;padding:6px">${qrSvg(C.webUrl, 118)}</div><div style="font-size:26px;font-weight:700;line-height:1.4">Dùng thử miễn phí 12 tháng<br><span style="font-size:22px;font-weight:600;color:#ffd9a8">Zalo ${C.zalo} · ${C.phone} · ${C.web}</span></div></div>`;
const toggle = (on) => `<span style="display:inline-block;width:64px;height:34px;border-radius:17px;background:${on ? 'var(--g)' : '#c3cac3'};position:relative;vertical-align:middle"><span style="position:absolute;top:4px;${on ? 'right:4px' : 'left:4px'};width:26px;height:26px;border-radius:50%;background:#fff"></span></span>`;
const hoRow = ['Hộ ông Sáu', 'Hộ bà Năm', 'Hộ ông Bảy', 'Hộ bà Tư'];

const slides = [];

/* 01 Bìa */
slides.push(S(1, {
  title: 'HTX nắm rõ từng hộ,<br><em>hộ rõ ràng tiền của mình</em>',
  sub: 'Một hệ thống chung cho HTX và hộ thành viên: sản xuất, thu mua, công nợ, truy xuất.',
  vis: `<div class="card" style="padding:18px 18px 14px;background:linear-gradient(180deg,#f1faf3,#fff)"><div style="background:var(--g);color:#fff;border-radius:18px;padding:12px 18px;text-align:center"><div style="font-size:26px;font-weight:800">🏢 HTX Tân Phát</div><div style="font-size:19px;opacity:.9">Quản lý, thu mua, bao tiêu, truy xuất</div></div>
<div style="display:flex;justify-content:space-around;font-size:34px;color:var(--o);font-weight:800;margin:6px 0"><span>⇅</span><span>⇅</span><span>⇅</span><span>⇅</span></div>
<div style="display:flex;gap:10px">${[['🍈', 'Hộ ông Sáu', 'Dưa lưới'], ['🥭', 'Hộ bà Năm', 'Xoài'], ['🐖', 'Hộ ông Bảy', 'Heo thịt'], ['🐔', 'Hộ bà Tư', 'Gà thả vườn']].map(([i, n, p]) => `<div class="card" style="flex:1;padding:10px 6px;text-align:center"><div style="font-size:40px">${i}</div><div style="font-size:19px;font-weight:800;color:var(--gd)">${n}</div><div style="font-size:16px;color:var(--mut)">${p}</div></div>`).join('')}</div>
<div style="display:flex;justify-content:space-between;font-size:17px;color:var(--mut);margin-top:10px"><span>⬇ Hướng dẫn, thu mua, trả tiền</span><span>⬆ Dữ liệu sản xuất (hộ đồng ý)</span></div></div>
<div style="display:flex;gap:5px;align-items:stretch;margin-top:14px">${step('➕', 'Thêm hộ', 'Mời thành viên')}${arrow}${step('🤝', 'Hộ đồng ý', 'Chia sẻ dữ liệu')}${arrow}${step('🛒', 'Thu mua', 'Phiếu từng lần')}${arrow}${step('📃', 'Bao tiêu', 'Hợp đồng')}${arrow}${step('🔳', 'Truy xuất', 'Về tận hộ', 1)}</div>
${tip('<b>Gói miễn phí:</b> HTX thêm được 1 hộ để thử. Quản lý nhiều hộ là gói HTX đầy đủ.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Hộ thành viên',
}));

/* 02 Hộ thành viên */
slides.push(S(2, {
  title: 'Danh sách hộ<br><em>đầy đủ trong tay</em>',
  sub: 'Mỗi hộ là một cơ sở riêng, có khu, vụ, nhật ký của mình; HTX chỉ quản lý hồ sơ thành viên.',
  vis: `${card(h3('👥 Hộ thành viên · 24 hộ') + table(['Mã', 'Hộ', 'Sản phẩm chính', 'Diện tích', 'Vụ chạy'], [['H001', 'Hộ ông Sáu', 'Dưa lưới', '3.000 m²', '2'], ['H002', 'Hộ bà Năm', 'Xoài', '1,2 ha', '1'], ['H003', 'Hộ ông Bảy', 'Heo thịt', '600 m²', '1'], ['H004', 'Hộ bà Tư', 'Gà thả vườn', '800 m²', '2']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}
${grid2(mini('🪪', 'Hồ sơ từng hộ', 'Mã hộ, chủ hộ, điện thoại, địa chỉ, sản phẩm chính') + mini('📐', 'Diện tích, số vụ đang chạy', 'Nhìn tổng thể toàn HTX trong một bảng') + mini('✉️', 'Mời hộ vào HTX', 'Hộ chấp nhận lời mời là tham gia') + mini('🏠', 'Hộ vẫn tự chủ', 'Dữ liệu sản xuất của hộ vẫn thuộc về hộ'), 'margin-top:14px')}
${tip('<b>Hộ có tài khoản riêng:</b> hộ dùng đúng app này để ghi nhật ký, kho, chi phí của mình; không phải nhập hai nơi.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Hộ quyết định chia sẻ',
}));

/* 03 Chia sẻ */
slides.push(S(3, {
  title: 'Hộ đồng ý,<br><em>HTX mới được xem</em>',
  sub: 'Minh bạch hai chiều: HTX thấy tổng quan sản xuất, hộ giữ quyền quyết định.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1">${card(h3('🏠 Phía hộ') + `<div style="font-size:22px;line-height:1.5">Cho HTX xem dữ liệu sản xuất<br>${toggle(true)} <b class="ok">Đang bật</b></div><div style="font-size:19px;color:var(--mut);margin-top:8px">Hộ đổi được bất cứ lúc nào, trừ khi HTX có sản phẩm bao tiêu thì cần chia sẻ.</div>`, 'height:100%')}</div>
<div style="flex:1">${card(h3('🏢 Phía HTX') + `<div style="font-size:22px;line-height:1.55">Xem tổng quan của hộ ông Sáu:<br>• Các vụ đang chạy<br>• Giai đoạn từng vụ<br>• Việc hộ đã ghi gần đây</div><div class="chip" style="margin-top:6px">👁 Chỉ xem, không sửa</div>`, 'height:100%')}</div></div>
${grid2(mini('🔒', 'HTX không đọc thẳng dữ liệu hộ', 'Chỉ xem tổng quan qua đường có kiểm soát, khi hộ đồng ý') + mini('🔁', 'Đổi ý được', 'Hộ bật hoặc tắt chia sẻ ngay trên app') + mini('📢', 'Hộ cũ chờ xác nhận', 'Hộ đã ở HTX từ trước mặc định chưa chia sẻ') + mini('🛡️', 'Quyền ghi vẫn của hộ', 'HTX không sửa nhật ký, kho, chi phí của hộ'), 'margin-top:14px')}
${tip('<b>Vì sao quan trọng:</b> hộ yên tâm dữ liệu không bị lộ, HTX vẫn nắm được tiến độ để bao tiêu.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Danh mục bao tiêu',
}));

/* 04 Bao tiêu */
slides.push(S(4, {
  title: 'Khai sản phẩm bao tiêu,<br><em>hộ ghi vụ là biết ngay</em>',
  sub: 'HTX khai danh mục và đơn giá gợi ý; hộ tạo vụ thấy gợi ý ghi theo HTX.',
  vis: `${card(h3('📋 Sản phẩm HTX bao tiêu') + table(['Sản phẩm', 'Đơn giá gợi ý', 'Ghi chú'], [['Dưa lưới loại 1', '15.000đ / kg', 'Giao tại điểm thu mua'], ['Xoài cát Hòa Lộc', '28.000đ / kg', 'Theo mùa'], ['Heo thịt hơi', '62.000đ / kg', 'Xuất chuồng đủ cách ly']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}
<div style="display:flex;gap:6px;align-items:stretch;margin-top:14px">${step('📋', 'HTX khai danh mục', 'Sản phẩm, đơn giá')}${arrow}${step('🌱', 'Hộ tạo vụ', 'Thấy gợi ý “theo HTX”')}${arrow}${step('🔗', 'Dữ liệu chia sẻ', 'Bắt buộc với sản phẩm bao tiêu', 1)}</div>
${grid2(mini('💬', 'Thống nhất đầu ra từ đầu vụ', 'Hộ biết bán cho ai, giá tham chiếu bao nhiêu') + mini('👀', 'HTX biết hộ trồng, nuôi gì', 'Nắm nguồn hàng để lên kế hoạch thu mua'), 'margin-top:14px')}
${tip('<b>Hộ chưa có gói trả phí riêng:</b> vụ của hộ ghi theo HTX, số vụ tính theo hạn mức đã thống nhất.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Thu mua từ hộ',
}));

/* 05 Thu mua */
slides.push(S(5, {
  title: 'Thu mua từ hộ,<br><em>sổ sách hai bên khớp nhau</em>',
  sub: 'Mỗi lần thu mua lập một phiếu; trả tiền từng đợt; hộ cùng thấy một sổ.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1.2">${card(h3('📝 Phiếu thu mua') + `<div style="font-size:21px;line-height:1.55"><b>Hộ:</b> Hộ ông Sáu<br><b>Sản phẩm:</b> Dưa lưới loại 1<br><b>Khối lượng:</b> 3.000 kg × 15.000đ<br><b style="font-size:25px" class="ok">Thành tiền: 45.000.000đ</b><br><b>Hạn trả:</b> 30/12</div>`, 'height:100%')}</div>
<div style="flex:1">${card(h3('💳 Đã trả') + table(['Ngày', 'Số tiền'], [['05/12', '20.000.000'], ['20/12', '15.000.000']]) + '<div style="font-size:21px;margin-top:8px"><b>Còn lại:</b> <b style="color:#c0392b">10.000.000đ</b></div>', 'height:100%')}</div></div>
${grid2(mini('🔍', 'Hộ chỉ xem', 'Mục “Bán cho HTX” hiện đúng sổ của hộ để đối chiếu') + mini('⚠️', 'Trả không vượt tổng', 'Nhập quá số còn lại, app chặn lại') + mini('🗒️', 'Hủy phải có lý do', 'Không xóa, vẫn còn dấu vết') + mini('🖨️', 'In phiếu thu mua', 'Đủ bên mua, bên bán, khối lượng, thành tiền'), 'margin-top:14px')}
${tip('<b>Tiền hai bên tách bạch:</b> phiếu thu mua là giao dịch giữa HTX và hộ, không lẫn vào chi phí, doanh thu của vụ.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Công nợ và hợp đồng',
}));

/* 06 Công nợ và hợp đồng */
slides.push(S(6, {
  title: 'Công nợ gọn gàng,<br><em>hợp đồng bao tiêu rõ ràng</em>',
  sub: 'Biết HTX còn nợ hộ nào bao nhiêu, quá hạn ra sao, và có hợp đồng để ký.',
  vis: `${card(h3('📒 Công nợ thu mua từ hộ') + `<div style="display:flex;gap:12px;margin-bottom:10px"><div class="kpi" style="background:#fdecea;border-color:#f3b6ae"><small>HTX còn phải trả hộ</small><b style="color:#c0392b">38.000.000đ</b></div><div class="kpi"><small>Số hộ còn nợ</small><b>3</b></div><div class="kpi"><small>Quá hạn</small><b>1 phiếu</b></div></div>` + table(['Hộ', 'Còn nợ', 'Hạn trả'], [['Hộ ông Sáu', '10.000.000', '30/12'], ['Hộ bà Năm', '18.000.000', '15/12'], ['Hộ bà Tư', '10.000.000', '05/01']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}
${card(h3('📃 Hợp đồng bao tiêu') + `<div style="display:flex;gap:6px;align-items:stretch">${step('✍️', 'Lập hợp đồng', 'Điền sẵn từ dữ liệu')}${arrow}${step('🖨️', 'In, ký tay', 'Hai bên')}${arrow}${step('☑️', 'Đã ký', 'Đánh dấu')}${arrow}${step('🏁', 'Hoàn thành', 'Hoặc hủy', 1)}</div>`, 'margin-top:14px')}
${grid2(mini('⏰', 'Nhắc quá hạn', 'Phiếu quá hạn trả được đánh dấu rõ') + mini('🤝', 'Cả hợp đồng bán cho khách', 'Cơ sở có quyền Doanh thu cũng lập được'), 'margin-top:14px')}
${tip('<b>Lưu ý thật:</b> hợp đồng là mẫu tham khảo, nên nhờ luật sư xem trước khi ký; app chưa có chữ ký số.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Bảng kê và truy xuất',
}));

/* 07 Bảng kê, truy xuất, CTA */
slides.push(S(7, {
  title: 'Bảng kê thu mua<br><em>và truy xuất nguồn gốc</em>',
  sub: 'Dựng sẵn từ các phiếu thu mua, không phải nhập lại từng dòng.',
  vis: `${card(h3('📑 Bảng kê thu mua nông sản (xem trước)') + table(['Người bán', 'Sản phẩm', 'Khối lượng', 'Thành tiền'], [['Nguyễn Văn Sáu', 'Dưa lưới', '3.000 kg', '45.000.000'], ['Trần Thị Năm', 'Xoài', '1.800 kg', '50.400.000']]) + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><span class="chip on">In A4 ngang</span><span class="chip">Lưu PDF</span><span class="chip">Tải Excel</span></div><div style="font-size:16px;color:var(--mut);margin-top:4px">Số liệu mẫu minh họa</div>')}
${grid2(mini('🪪', 'Thông tin người bán một lần', 'Họ tên, CCCD, địa chỉ, điện thoại, kèm xác nhận đồng ý') + mini('📅', 'Chọn kỳ nhanh', 'Tháng này, tháng trước, quý, năm') + mini('🔳', 'Truy xuất về tận hộ', 'Phiếu thu mua gắn vụ của hộ, quét QR xem nguồn gốc') + mini('🌐', 'Lên website HTX', 'Công khai sản phẩm bạn chọn, qua kiểm duyệt'), 'margin-top:14px')}
${tip('<b>Lưu ý thật:</b> bảng kê là mẫu tham khảo, nên nhờ kế toán đối chiếu với mẫu đang áp dụng.', 'margin-top:14px')}
${cta('margin-top:14px')}`,
  nextHint: 'Bộ tiếp theo: B5 Website và truy xuất',
}));

render('b4', slides, process.argv[2] ? process.argv[2].split(',').map(Number) : null);
