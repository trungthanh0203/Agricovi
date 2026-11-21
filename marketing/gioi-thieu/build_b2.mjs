// Bộ B2: Kho, chi phí, lãi lỗ (7 ảnh). Chạy: node marketing/gioi-thieu/build_b2.mjs [số ảnh,số ảnh]
import { C, qrSvg, li, mini, tip, bslide, render } from './common.mjs';

const SET = 'Bộ B2 · Kho, chi phí, lãi lỗ';
const TOTAL = 7;
const S = (n, o) => bslide({ set: SET, n, total: TOTAL, ...o });

const tabsBar = (on) => `<div class="tabs">${['🏠|Tổng quan', '🌱|Sản xuất', '✍️|Ghi việc', '📦|Kho', '☰|Thêm'].map((t, i) => { const [ic, tx] = t.split('|'); return `<i class="${i === on ? 'on' : ''}">${ic}<br>${tx}</i>`; }).join('')}</div>`;
const phone = (style, title, body, on) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">${title}</div><div class="ab">${body}</div>${tabsBar(on)}</div></div>`;
const phoneSummary = (style) => phone(style, 'Tổng kết vụ', `
<div class="ac"><small>Dưa lưới Hè 2026 · Nhà màng 1</small><b>Đã thu hoạch xong</b></div>
<div class="ac"><div class="row"><span>Doanh thu</span><b>186.000.000đ</b></div><div class="row"><span>Chi phí</span><b>121.400.000đ</b></div><div class="row"><span>Lãi</span><b class="ok">+64.600.000đ</b></div></div>
<div class="ac"><div class="row"><span>Sản lượng (sau hao hụt)</span><b>12.000 kg</b></div><div class="row"><span>Giá thành mỗi kg</span><b>10.117đ</b></div><div class="row"><span>Giá bán trung bình</span><b>15.500đ</b></div></div>
<div class="ac"><small>Chi phí gồm</small><div class="row"><span>Vật tư</span><span>58,2 tr</span></div><div class="row"><span>Tiền công</span><span>41,0 tr</span></div><div class="row"><span>Chi phí khác</span><span>22,2 tr</span></div></div>`, 0);
const phoneStock = (style) => phone(style, 'Kho vật tư', `
<div><span class="chip on">Kho phân</span><span class="chip">Kho thuốc</span><span class="chip">Kho thức ăn</span></div>
${[['Phân NPK 20-20-15', '120 kg', 70, 0], ['Phân hữu cơ vi sinh', '800 kg', 90, 0], ['Thuốc trừ sâu sinh học', '3 chai', 25, 1], ['Giống dưa lưới', '8 gói', 60, 0]].map(([n, q, w, low]) => `<div class="ac"><div class="row" style="border:none;padding:0"><b style="font-size:16px">${n}</b><b class="${low ? '' : 'ok'}" style="${low ? 'color:#c0392b' : ''}">${q}</b></div><div style="height:8px;background:#eef1ee;border-radius:5px;margin-top:6px"><div style="width:${w}%;height:8px;border-radius:5px;background:${low ? '#e74c3c' : 'var(--g)'}"></div></div>${low ? '<small style="color:#c0392b">⚠ Sắp hết, dưới mức tối thiểu</small>' : ''}</div>`).join('')}`, 3);

const step = (i, t, d, hl) => `<div class="card" style="flex:1;padding:12px 8px;text-align:center;${hl ? 'background:var(--g);border-color:var(--g);color:#fff' : ''}"><div style="font-size:38px">${i}</div><div style="font-size:20px;font-weight:800;margin-top:2px">${t}</div><div style="font-size:15px;opacity:.85;line-height:1.25">${d}</div></div>`;
const arrow = '<div style="align-self:center;color:var(--o);font-size:28px;font-weight:800">➜</div>';
const table = (head, rows, st = '') => `<table style="font-size:19px;${st}"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const card = (inner, st = '') => `<div class="card" style="padding:16px 20px;${st}">${inner}</div>`;
const h3 = (t) => `<div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:8px">${t}</div>`;

const slides = [];

/* 01 Bìa */
slides.push(S(1, {
  title: 'Biết tiền đi đâu,<br><em>tiền về đâu</em>',
  sub: 'Kho, chi phí, thu hoạch, doanh thu nối thành một mạch, ra thẳng lãi lỗ từng vụ.',
  vis: `<div style="display:flex;gap:6px;align-items:stretch">${step('📥', 'Nhập kho', 'Giá, lô, hạn')}${arrow}${step('✍️', 'Ghi việc', 'Dùng vật tư')}${arrow}${step('💸', 'Chi phí', 'Công, điện, nước')}${arrow}${step('🧺', 'Thu hoạch', 'Sau hao hụt')}${arrow}${step('💰', 'Bán', 'Thu tiền')}</div>
<div style="display:flex;justify-content:center;font-size:44px;color:var(--o);margin:6px 0">⬇</div>
<div style="display:flex;gap:18px;align-items:flex-start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">${mini('📦', 'Kho tự trừ', 'Ghi việc có vật tư là kho trừ đúng số')}${mini('🧮', 'Giá vốn bình quân', 'Mỗi đồng chỉ tính một lần, không bị nhân đôi')}${mini('📉', 'Giá thành mỗi kg', 'Biết bán giá nào thì có lời')}${mini('🔔', 'Báo sắp hết, nhắc nợ', 'Không để hết hàng hay quên thu tiền')}</div>
${phoneSummary('position:relative;flex:none;transform:scale(.8);transform-origin:top right;margin:0 -32px -130px 0')}</div>`,
  nextHint: 'Ảnh tiếp: Kho vật tư',
}));

/* 02 Kho */
slides.push(S(2, {
  title: 'Kho vật tư<br><em>luôn rõ ràng</em>',
  sub: 'Phân, thuốc, giống, thức ăn: biết còn bao nhiêu, sắp hết thì app báo.',
  vis: `${phoneStock('left:0;top:0;transform:scale(1.02);transform-origin:top left')}
<div style="position:absolute;left:370px;right:0;top:0;display:flex;flex-direction:column;gap:12px">${mini('🏬', 'Nhiều kho', 'Kho phân, kho thuốc, kho thức ăn...')}${mini('📚', 'Có sẵn danh sách vật tư', 'Bạn sửa, thêm vật tư của mình')}${mini('⚠️', 'Mức tồn tối thiểu', 'Sắp hết là app báo')}${mini('🏪', 'Nhà cung ứng', 'Nhập hàng có hóa đơn là theo dõi được công nợ')}${mini('🔒', 'Giao dịch chỉ thêm', 'Sửa bằng điều chỉnh, không xóa mất dấu vết')}${mini('🧾', 'Nhập, xuất, điều chỉnh tồn', 'Mỗi lần có ngày, số lượng, người ghi')}</div>`,
  nextHint: 'Ảnh tiếp: Nhập kho và hóa đơn',
}));

/* 03 Nhập kho */
slides.push(S(3, {
  title: 'Nhập kho nhanh,<br><em>chụp hóa đơn cũng được</em>',
  sub: 'Nhập nhiều dòng một lần; có hóa đơn thì số còn nợ tự vào công nợ.',
  vis: `${card(h3('📥 Phiếu nhập kho') + table(['Vật tư', 'Số lượng', 'Đơn giá', 'Thành tiền'], [['Phân NPK 20-20-15', '200 kg', '14.000', '2.800.000'], ['Phân hữu cơ vi sinh', '1.000 kg', '3.500', '3.500.000'], ['Thuốc trừ sâu sinh học', '10 chai', '95.000', '950.000']]) + '<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><span class="chip on">☑ Có hóa đơn</span><span class="chip">Nhà cung ứng: Đại lý Hòa Phát</span><span class="chip">Hạn trả: 30/12</span></div><div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('📷', 'Chụp hóa đơn, AI đọc giúp', 'Điền sẵn dòng vật tư, bạn kiểm tra rồi lưu. Gói miễn phí: 2 lần mỗi tháng')}${mini('📅', 'Số lô và hạn dùng', 'Dùng là lấy lô gần hết hạn trước')}${mini('💳', 'Công nợ tự ghi', 'Số còn nợ nhà cung ứng nằm trong mục Công nợ')}${mini('❔', 'Chưa biết giá?', 'Để trống, app ghi “chưa có giá”, không tự đoán')}</div>
${tip('<b>Lưu ý:</b> kho có lô và hạn dùng thuộc gói Hộ / HTX; gói Khởi đầu dùng bản kho gọn (nhập, xuất).', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Vật tư tính lúc dùng',
}));

/* 04 Vật tư tính lúc dùng */
slides.push(S(4, {
  title: 'Dùng đến đâu,<br><em>tính tiền đến đó</em>',
  sub: 'Tiền mua vật tư chỉ vào chi phí vụ khi bạn thật sự dùng, đúng giá vốn bình quân.',
  vis: `${card(h3('Ví dụ: bón phân đợt 2 cho vụ dưa lưới') + `<div style="display:flex;gap:8px;align-items:stretch">${step('📥', 'Nhập 200 kg', 'NPK, 14.000đ/kg')}${arrow}${step('✍️', 'Ghi việc: dùng 5 kg', 'Chọn vật tư và số lượng')}${arrow}${step('📦', 'Kho còn 195 kg', 'Tự trừ')}${arrow}${step('💸', 'Chi phí +70.000đ', 'Vào đúng vụ', 1)}</div>`)}
<div style="display:flex;gap:14px;margin-top:14px"><div style="flex:1">${card(h3('Công thức một vụ') + `<div style="font-size:26px;font-weight:700;line-height:1.7">Vật tư <span style="color:var(--mut);font-weight:500">58,2 tr</span><br>+ Tiền công <span style="color:var(--mut);font-weight:500">41,0 tr</span><br>+ Chi phí khác <span style="color:var(--mut);font-weight:500">22,2 tr</span><br><span style="color:var(--g);font-size:30px">= Chi phí vụ 121,4 tr</span></div>`, 'height:100%')}</div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px">${mini('🚫', 'Đừng ghi hai lần', 'Tiền mua vật tư không ghi ở mục Chi phí, kẻo bị tính trùng')}${mini('👷', 'Tiền công đã xác nhận', 'Chỉ công được xác nhận mới tính (giờ × đơn giá)')}${mini('🧾', 'Ghi việc là xong', 'Không cần nhập vật tư lần hai ở đâu khác')}</div></div>
${tip('<b>Mẹo:</b> ghi việc ngay sau khi làm, chi phí và giá thành sẽ đúng hơn.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Chi phí chung chia cho vụ',
}));

/* 05 Chi phí chung */
slides.push(S(5, {
  title: 'Chi phí chung<br><em>chia công bằng cho từng vụ</em>',
  sub: 'Điện, nước, thuê đất, khấu hao: chia theo diện tích và số ngày của từng vụ.',
  vis: `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${[['👷', 'Nhân công'], ['💡', 'Điện nước'], ['🏞️', 'Thuê đất'], ['🛠️', 'Khấu hao'], ['📎', 'Khác']].map(([i, t]) => `<div class="card" style="padding:10px 18px;font-size:24px;font-weight:700;color:var(--gd)">${i} ${t}</div>`).join('')}</div>
${card(h3('Chia điện nước tháng 11: 6.000.000đ') + table(['Vụ', 'Diện tích', 'Số ngày', 'Được chia'], [['Dưa lưới · Nhà màng 1', '1.000 m²', '30', '<b>600.000</b>'], ['Dưa lưới · Nhà màng 2', '1.000 m²', '30', '<b>600.000</b>'], ['Xoài · Vườn xoài', '8.000 m²', '30', '<b>4.800.000</b>']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('👀', 'Xem trước khi chia', 'Biết mỗi vụ nhận bao nhiêu rồi mới ghi')}${mini('🎯', 'Chọn phạm vi', 'Cả cơ sở, một phân khu hoặc một ô')}${mini('🔗', 'Chi riêng thì gắn vụ', 'Chi chung cả cơ sở thì để trống vụ')}${mini('📝', 'Ghi rõ cách chia', 'Mỗi khoản có ghi chú để đối chiếu sau')}</div>
${tip('<b>Muốn chia được:</b> vụ hoặc ô cần có diện tích. Vụ nào chưa có, app báo để bạn bổ sung.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Thu hoạch, doanh thu, công nợ',
}));

/* 06 Thu hoạch, doanh thu, công nợ */
slides.push(S(6, {
  title: 'Thu hoạch, bán hàng,<br><em>không sót đồng nào</em>',
  sub: 'Ghi sản lượng sau hao hụt, ghi từng lần bán, theo dõi ai còn nợ bạn.',
  vis: `<div style="display:flex;gap:14px"><div style="flex:1">${card(h3('🧺 Thu hoạch') + table(['Ngày', 'Sản lượng', 'Hao hụt'], [['10/02', '4.200 kg', '120 kg'], ['14/02', '5.100 kg', '90 kg'], ['18/02', '3.000 kg', '60 kg']]) + '<div style="font-size:19px;margin-top:8px"><b class="ok">12.000 kg</b> sau hao hụt</div>')}</div><div style="flex:1">${card(h3('💰 Bán hàng') + table(['Khách', 'Số tiền', 'Tình trạng'], [['Chợ đầu mối', '82.000.000', '<span class="ok">Đã thu</span>'], ['Siêu thị A', '64.000.000', '<span class="ok">Đã thu</span>'], ['Nhà hàng B', '40.000.000', '<span style="color:#c0392b;font-weight:700">Nợ 15 tr</span>']]) + '<div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div>')}</div></div>
<div style="margin-top:14px">${card(h3('📒 Công nợ') + `<div style="display:flex;gap:12px"><div class="kpi" style="background:#fdecea;border-color:#f3b6ae"><small>Phải trả (nhà cung ứng)</small><b style="color:#c0392b">3.750.000đ</b></div><div class="kpi" style="background:#e6f4ea;border-color:#b7dcc3"><small>Phải thu (khách hàng)</small><b class="g">15.000.000đ</b></div><div class="kpi"><small>Quá hạn</small><b>1 khoản</b></div></div>`)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">${mini('⏰', 'Hạn thu tiền', 'Quá hạn là app nhắc bạn')}${mini('📶', 'Thu hoạch ghi được khi mất sóng', 'Có mạng tự gửi lại')}</div>`,
  nextHint: 'Ảnh tiếp: Tổng kết vụ',
}));

/* 07 Tổng kết vụ */
slides.push(S(7, {
  title: 'Lời hay lỗ,<br><em>giá thành bao nhiêu</em>',
  sub: 'Một báo cáo trả lời câu hỏi lớn nhất của mỗi vụ.',
  vis: `${phoneSummary('right:0;top:0;transform:scale(.9);transform-origin:top right')}
<div style="position:absolute;left:0;top:0;width:590px;display:flex;flex-direction:column;gap:12px">${card('<div style="font-size:22px;color:var(--mut)">Lãi vụ dưa lưới</div><div style="font-size:60px;font-weight:800;color:var(--g);line-height:1.1">+64,6 triệu</div><div style="font-size:20px;color:var(--mut)">Doanh thu 186 tr − chi phí 121,4 tr · số liệu mẫu</div>')}
${mini('📉', 'Giá thành mỗi kg', 'Chi phí chia sản lượng thật, sau hao hụt')}${mini('💵', 'Doanh thu, giá bán trung bình', 'Cộng từ từng lần bán hàng đã ghi')}${mini('⚖️', 'Trung thực với số liệu', 'Thiếu giá vật tư hay chưa thu hoạch thì hiện “chưa đủ số liệu”, không đưa số sai')}${mini('📤', 'Xuất bảng CSV', 'Mở bằng Excel; xuất báo cáo đầy đủ là gói Hộ / HTX')}</div>
<div class="card" style="position:absolute;left:0;right:0;top:640px;padding:14px 22px;display:flex;gap:22px;align-items:center;background:var(--gd);border-color:var(--gd);color:#fff"><div style="line-height:0;background:#fff;border-radius:10px;padding:6px">${qrSvg(C.webUrl, 120)}</div><div style="font-size:26px;font-weight:700;line-height:1.4">Dùng thử miễn phí 12 tháng<br><span style="font-size:22px;font-weight:600;color:#ffd9a8">Zalo ${C.zalo} · ${C.phone} · ${C.web}</span></div></div>`,
  nextHint: 'Bộ tiếp theo: B3 Nhân công và chấm công',
}));

render('b2', slides, process.argv[2] ? process.argv[2].split(',').map(Number) : null);
