// Bộ B3: Nhân công và chấm công (7 ảnh). Chạy: node marketing/gioi-thieu/build_b3.mjs [số ảnh,số ảnh]
import { C, qrSvg, li, mini, tip, bslide, render } from './common.mjs';

const SET = 'Bộ B3 · Nhân công và chấm công';
const TOTAL = 7;
const S = (n, o) => bslide({ set: SET, n, total: TOTAL, ...o });

const tabsBar = (on) => `<div class="tabs">${['🏠|Tổng quan', '🌱|Sản xuất', '✍️|Ghi việc', '📦|Kho', '☰|Thêm'].map((t, i) => { const [ic, tx] = t.split('|'); return `<i class="${i === on ? 'on' : ''}">${ic}<br>${tx}</i>`; }).join('')}</div>`;
const phone = (style, title, body, on) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">${title}</div><div class="ab">${body}</div>${on === null ? '' : tabsBar(on)}</div></div>`;
const phoneKiosk = (style) => phone(style, 'Máy chấm công · Vườn Đông', `
<div style="text-align:center;font-size:46px;font-weight:800;color:var(--gdd);margin:2px 0">07:02</div>
<div class="ac"><small>Số điện thoại</small><b>0912 345 678</b></div>
<div class="ac"><small>Mã PIN</small><b>● ● ● ●</b></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => `<div style="background:#fff;border:1px solid #dfe6df;border-radius:10px;text-align:center;padding:7px 0;font-size:20px;font-weight:700">${k}</div>`).join('')}</div>
<div style="display:flex;gap:8px"><div class="btn" style="flex:1;margin:0">Vào ca</div><div class="btn" style="flex:1;margin:0;background:var(--o);border-color:var(--o)">Ra ca</div></div>
<div style="text-align:center;font-size:14px;color:var(--mut);margin-top:8px">📷 Camera trước đối chiếu khuôn mặt</div>`, null);
const phonePay = (style) => phone(style, 'Phiếu lương tháng 11', `
<div class="ac"><small>Nguyễn Văn A</small><b>Thực nhận 6.780.000đ</b></div>
<div class="ac"><div class="row"><span>208 giờ × 35.000đ</span><b>7.280.000</b></div><div class="row"><span>Thưởng</span><b class="ok">+ 500.000</b></div><div class="row"><span>Ứng lương</span><b style="color:#c0392b">− 1.000.000</b></div><div class="row"><span>Thực nhận</span><b>6.780.000</b></div></div>
<div class="ac" style="background:#e6f4ea;border-color:#b7dcc3"><b>🔒 Kỳ lương đã khóa</b><small>Chủ khóa ngày 01/12</small></div>`, 3);

const step = (i, t, d, hl) => `<div class="card" style="flex:1;padding:12px 6px;text-align:center;${hl ? 'background:var(--g);border-color:var(--g);color:#fff' : ''}"><div style="font-size:36px">${i}</div><div style="font-size:19px;font-weight:800;margin-top:2px">${t}</div><div style="font-size:14px;opacity:.85;line-height:1.25">${d}</div></div>`;
const arrow = '<div style="align-self:center;color:var(--o);font-size:24px;font-weight:800">➜</div>';
const table = (head, rows, st = '') => `<table style="font-size:19px;${st}"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const card = (inner, st = '') => `<div class="card" style="padding:16px 20px;${st}">${inner}</div>`;
const h3 = (t) => `<div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:8px">${t}</div>`;
const col = (inner, st = '') => `<div style="display:flex;flex-direction:column;gap:12px;${st}">${inner}</div>`;

const slides = [];

/* 01 Bìa */
slides.push(S(1, {
  title: 'Chấm công rõ ràng,<br><em>lương không lo tranh cãi</em>',
  sub: 'Từ lúc vào ca đến phiếu lương cuối tháng, mọi bước đều có dấu vết. Dành cho gói Hộ / HTX.',
  vis: `<div style="display:flex;gap:5px;align-items:stretch">${step('🧑‍🔧', 'Tạo nhân sự', 'Số điện thoại')}${arrow}${step('🔐', 'Đặt PIN', 'Đăng ký mặt')}${arrow}${step('⏱️', 'Vào, ra ca', 'Ở máy chấm công')}${arrow}${step('✅', 'Xác nhận', 'Chủ, quản lý')}${arrow}${step('🧾', 'Bảng lương', 'Khóa kỳ', 1)}</div>
<div style="display:flex;gap:16px;margin-top:18px;align-items:flex-start"><div style="flex:1">${col(mini('🙅', 'Không ai chấm hộ', 'Mỗi người có số điện thoại và PIN riêng') + mini('📷', 'Đối chiếu khuôn mặt', 'Ảnh nghi ngờ gắn cờ để chủ xem') + mini('💵', 'Chỉ công đã xác nhận mới thành tiền', 'Chấm sai cũng bị chặn trước khi tính lương') + mini('🧾', 'Chi phí nhân công tự vào vụ', 'Lãi lỗ vụ tính đủ tiền công'))}</div>
${phoneKiosk('position:relative;flex:none;transform:scale(.82);transform-origin:top right;margin:0 -30px -115px 0')}</div>`,
  nextHint: 'Ảnh tiếp: Máy chấm công',
}));

/* 02 Máy chấm công */
slides.push(S(2, {
  title: 'Máy chấm công<br><em>chỉ là một chiếc điện thoại</em>',
  sub: 'Đặt cố định ở khu làm việc. Người làm tự chấm bằng số điện thoại và PIN.',
  vis: `${phoneKiosk('left:0;top:0;transform:scale(1.02);transform-origin:top left')}
<div style="position:absolute;left:370px;right:0;top:0">${col(mini('📱', 'Liên kết điện thoại cố định', 'Chủ liên kết máy ở phân khu, cần có mạng') + mini('🔑', 'Số điện thoại và PIN', 'Người làm tự đặt PIN lần đầu') + mini('👤', 'Đăng ký khuôn mặt', 'Máy đối chiếu khi vào, ra ca') + mini('🚩', 'Chụp tối đa 3 lần', 'Chưa khớp: lần cuối vẫn ghi công nhưng gắn cờ đỏ') + mini('🗑️', 'Ảnh giữ 60 ngày', 'Chủ xóa được dữ liệu khuôn mặt bất cứ lúc nào') + mini('🏞️', 'Hỏi vụ khi chấm', 'Bật tùy chọn để biết công làm cho vụ nào'))}</div>`,
  nextHint: 'Ảnh tiếp: Không dùng máy vẫn được',
}));

/* 03 Không dùng máy */
slides.push(S(3, {
  title: 'Không dùng máy<br><em>vẫn chấm công được</em>',
  sub: 'Chủ hoặc quản lý nhập hộ, hoặc in bảng giấy cho người làm ghi tay.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1">${card(h3('✍️ Nhập hộ') + li(['Sản xuất → Chấm công → Hôm nay', 'Chọn “Chấm công cho người làm”', 'Chủ, quản lý nhập cho mọi người; tổ trưởng nhập cho người trong tổ'], 21), 'height:100%')}</div><div style="flex:1">${card(h3('🖨️ Bảng chấm công giấy') + li(['In khổ A4 ngang, một cột mỗi ngày', 'Có sẵn tên người và các ngày từ - đến', 'Mỗi bảng in ra được lưu mã để nhập lại đúng bảng'], 21), 'height:100%')}</div></div>
${card(h3('Bảng giấy (xem trước)') + table(['Người làm', '01', '02', '03', '04', '05', '06', '…'], [['Nguyễn Văn A', '', '', '', '', '', '', ''], ['Trần Thị B', '', '', '', '', '', '', ''], ['Lê Văn C', '', '', '', '', '', '', '']], 'text-align:center') + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Ô trống để ghi tay giờ vào, giờ ra</div>', 'margin-top:14px')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('🏖️', 'Nghỉ phép', 'Ghi nghỉ hộ, xem danh sách theo tháng, tổng hợp năm')}${mini('👥', 'Chia tổ, tổ trưởng', 'Mỗi tổ một người phụ trách')}</div>
${tip('<b>Hộ chỉ có người nhà?</b> Không cần tạo nhân sự: ghi tiền công ở mục Chi phí, nhóm Nhân công.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Ba lớp kiểm tra',
}));

/* 04 Ba lớp kiểm tra */
const layer = (n, t, d, c) => `<div class="card" style="display:flex;gap:16px;align-items:center;padding:16px 20px;border-left:12px solid ${c}"><span class="num" style="background:${c}">${n}</span><div><div style="font-size:28px;font-weight:800;color:var(--gdd)">${t}</div><div style="font-size:22px;color:var(--mut);line-height:1.3">${d}</div></div></div>`;
slides.push(S(4, {
  title: 'Ba lớp kiểm tra<br><em>trước khi thành tiền</em>',
  sub: 'Người chấm không phải người trả tiền, nên chấm sai cũng bị chặn.',
  vis: `${col(layer(1, 'Đúng người', 'Chấm bằng số điện thoại và PIN, không bấm trong tài khoản nên không ai chấm hộ', 'var(--g)') + layer(2, 'Đúng mặt', 'Máy đối chiếu khuôn mặt; ảnh nghi ngờ gắn cờ đỏ để chủ xem lại', 'var(--o)') + layer(3, 'Đúng người duyệt', 'Chủ hoặc quản lý xác nhận công; chỉ công đã xác nhận mới tính tiền', 'var(--gd)'))}
${card('<div style="display:flex;gap:10px;align-items:stretch">' + step('⏱️', 'Công chờ xác nhận', 'Vừa chấm xong') + arrow + step('✅', 'Đã xác nhận', 'Chủ, quản lý duyệt', 1) + arrow + step('💵', 'Thành tiền', 'Giờ × đơn giá') + '</div>', 'margin-top:16px')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('👑', 'Chủ', 'Làm mọi việc, cấp quyền từng mục')}${mini('🧭', 'Quản lý', 'Điều hành sản xuất, xác nhận công')}${mini('👷', 'Nhân viên', 'Ghi việc, xem lương của mình')}${mini('🔒', 'Phân quyền chi tiết', 'Chủ cấp quyền từng người, từng mục')}</div>`,
  nextHint: 'Ảnh tiếp: Phiếu khoán',
}));

/* 05 Phiếu khoán */
slides.push(S(5, {
  title: 'Khoán việc,<br><em>chia tiền công bằng</em>',
  sub: 'Giao khoán theo sản lượng hoặc trọn gói, nghiệm thu rồi chia cho người nhận.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1">${card(h3('📝 Giao khoán') + `<div style="font-size:22px;line-height:1.6"><b>Việc:</b> Hái dưa lưới<br><b>Vụ:</b> Dưa lưới Hè · Nhà màng 1<br><b>Cách tính:</b> <span class="chip on" style="margin:0">Theo sản lượng</span> <span class="chip" style="margin:0">Trọn gói</span><br><b>Đơn giá:</b> 800đ / kg<br><b>Người nhận:</b> 4 người</div>`, 'height:100%')}</div>
<div style="flex:1">${card(h3('✅ Nghiệm thu') + `<div style="font-size:22px;line-height:1.6"><b>Sản lượng thực tế:</b> 4.200 kg<br><b>Thành tiền:</b> 4.200 × 800 = <b class="ok">3.360.000đ</b><br><b>Cách chia:</b> <span class="chip on" style="margin:0">Chia đều</span> <span class="chip" style="margin:0">Theo %</span></div>${table(['Người', 'Được chia'], [['Nguyễn Văn A', '840.000'], ['Trần Thị B', '840.000'], ['Lê Văn C', '840.000'], ['Phạm Thị D', '840.000']])}<div style="font-size:16px;color:var(--mut);margin-top:4px">Số liệu mẫu minh họa</div>`, 'height:100%')}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('🔎', 'Xem trước cách chia', 'Biết mỗi người nhận bao nhiêu rồi mới xác nhận')}${mini('🧺', 'Hợp với việc theo sản lượng', 'Hái, thu hoạch, đóng gói, trồng, phun theo cây, theo m²')}${mini('📌', 'Gắn đúng vụ', 'Tiền khoán tự vào chi phí vụ')}${mini('❌', 'Hủy được khi giao nhầm', 'Phiếu hủy vẫn lưu dấu vết')}</div>`,
  nextHint: 'Ảnh tiếp: Bảng lương',
}));

/* 06 Bảng lương */
slides.push(S(6, {
  title: 'Bảng lương<br><em>tự tính, minh bạch</em>',
  sub: 'Giờ công đã xác nhận nhân đơn giá, cộng thưởng, trừ phạt và ứng lương.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1.45">${card(h3('📒 Bảng lương tháng 11') + table(['Người', 'Giờ', 'Thưởng', 'Trừ', 'Thực nhận'], [['Nguyễn Văn A', '208', '500k', '1.000k', '<b>6.780.000</b>'], ['Trần Thị B', '192', '—', '100k', '<b>6.620.000</b>'], ['Lê Văn C', '224', '—', '2.000k', '<b>6.960.000</b>']], '') + '<div style="display:flex;justify-content:space-between;font-size:24px;font-weight:800;margin-top:10px"><span>Tổng thực nhận</span><span class="ok">20.360.000đ</span></div><div style="font-size:16px;color:var(--mut)">Số liệu mẫu minh họa · “Trừ” gồm phạt và ứng lương</div>', 'height:100%')}</div>
<div style="flex:1">${card(h3('📄 Phiếu lương') + '<div style="font-size:19px;color:var(--mut)">Nguyễn Văn A</div><div class="row" style="font-size:21px"><span>208 giờ × 35.000đ</span><b>7.280.000</b></div><div class="row" style="font-size:21px"><span>Thưởng</span><b class="ok">+ 500.000</b></div><div class="row" style="font-size:21px"><span>Ứng lương</span><b style="color:#c0392b">− 1.000.000</b></div><div class="row" style="font-size:23px"><b>Thực nhận</b><b>6.780.000</b></div><div class="chip on" style="margin-top:8px">🔒 Kỳ lương đã khóa</div>', 'height:100%')}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('📄', 'Phiếu lương từng người', 'Bấm dòng để mở chi tiết')}${mini('➕', 'Thưởng, phạt, ứng lương', 'Ghi kèm lý do, sửa được khi cần')}${mini('🔒', 'Chủ khóa kỳ lương', 'Khóa xong số liệu tháng đó được giữ nguyên')}${mini('👁️', 'Nhân viên xem lương của mình', 'Mỗi người chỉ thấy phần của mình')}</div>
${card(h3('Từ chấm công đến phiếu lương') + `<div style="display:flex;gap:8px;align-items:stretch">${step('⏱️', 'Công', 'Đã xác nhận')}${arrow}${step('✖️', 'Đơn giá', 'Theo giờ')}${arrow}${step('➕', 'Thưởng', 'Phạt, ứng')}${arrow}${step('🔒', 'Khóa kỳ', 'Chốt tháng', 1)}</div>`, 'margin-top:14px')}
${tip('<b>Mẹo:</b> xác nhận công đều đặn mỗi tuần, cuối tháng chốt lương chỉ mất vài phút.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Dùng thế nào cho vừa',
}));

/* 07 Dùng cho vừa */
slides.push(S(7, {
  title: 'Dùng đúng mức<br><em>cho từng quy mô</em>',
  sub: 'Chấm công và bảng lương dành cho cơ sở có người làm thuê; hộ nhỏ cứ ghi gọn.',
  vis: `<div style="display:flex;gap:14px"><div class="card" style="flex:1;padding:16px 18px;background:#f1faf3;border-color:#b7dcc3"><div style="font-size:27px;font-weight:800;color:var(--g)">🏡 Hộ nhỏ, người nhà</div>${li(['Không cần nhân sự, chấm công', 'Ghi tiền công ở mục Chi phí', 'Vẫn thấy lãi lỗ từng vụ', 'Gói Khởi đầu miễn phí là đủ'], 22)}</div>
<div class="card" style="flex:1;padding:16px 18px;border-color:#f6c98f"><div style="font-size:27px;font-weight:800;color:#b25e00">🏢 Cơ sở, trang trại, HTX</div>${li(['Mỗi người một tài khoản', 'Chấm công bằng PIN, khuôn mặt', 'Khoán việc, bảng lương, khóa kỳ', 'Gói Hộ / HTX đầy đủ'], 22)}</div></div>
<div style="margin-top:14px">${card(h3('Tiền công đi vào đâu?') + `<div style="display:flex;gap:10px;align-items:stretch">${step('⏱️', 'Công, khoán', 'Đã xác nhận')}${arrow}${step('💵', 'Tiền công', 'Giờ × đơn giá')}${arrow}${step('🌱', 'Chi phí vụ', 'Vật tư + công + khác')}${arrow}${step('📈', 'Lãi lỗ', 'Từng vụ', 1)}</div>`)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('🔄', 'Nâng cấp bất cứ lúc nào', 'Dữ liệu đang có được giữ nguyên')}${mini('💬', 'Cần tư vấn chọn gói?', 'Nhắn Zalo, chúng tôi hướng dẫn tận tình')}</div>
<div class="card" style="margin-top:14px;padding:14px 22px;display:flex;gap:22px;align-items:center;background:var(--gd);border-color:var(--gd);color:#fff"><div style="line-height:0;background:#fff;border-radius:10px;padding:6px">${qrSvg(C.webUrl, 118)}</div><div style="font-size:26px;font-weight:700;line-height:1.4">Dùng thử miễn phí 12 tháng<br><span style="font-size:22px;font-weight:600;color:#ffd9a8">Zalo ${C.zalo} · ${C.phone} · ${C.web}</span></div></div>`,
  nextHint: 'Bộ tiếp theo: B4 HTX và hộ thành viên',
}));

render('b3', slides, process.argv[2] ? process.argv[2].split(',').map(Number) : null);
