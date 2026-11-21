// Bộ B1: Sản xuất và nhật ký (7 ảnh). Chạy: node marketing/gioi-thieu/build_b1.mjs [số ảnh,số ảnh]
import { C, qrSvg, li, mini, tip, bslide, render } from './common.mjs';

const SET = 'Bộ B1 · Sản xuất và nhật ký';
const TOTAL = 7;
const S = (n, o) => bslide({ set: SET, n, total: TOTAL, ...o });

const tabsBar = (on) => `<div class="tabs">${['🏠|Tổng quan', '🌱|Sản xuất', '✍️|Ghi việc', '📦|Kho', '☰|Thêm'].map((t, i) => { const [ic, tx] = t.split('|'); return `<i class="${i === on ? 'on' : ''}">${ic}<br>${tx}</i>`; }).join('')}</div>`;
const phone = (style, title, body, on) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">${title}</div><div class="ab">${body}</div>${tabsBar(on)}</div></div>`;
const phoneCycle = (style) => phone(style, 'Quản lý vụ', `
<div class="ac"><small>Dưa lưới Hè · Nhà màng 1</small><b>Đang chăm sóc · ngày 32/75</b>
<div style="height:10px;background:#e6f4ea;border-radius:6px;margin-top:8px"><div style="width:43%;height:10px;background:var(--g);border-radius:6px"></div></div></div>
<div class="ac" style="background:#fff7e6;border-color:#f6c98f"><b style="color:#b25e00">⏰ Việc đến hạn hôm nay</b>
<div class="row"><span>Bón phân đợt 2</span><span class="chip on" style="margin:0">Ghi việc</span></div>
<div class="row"><span>Tưới nhỏ giọt</span><span class="ok">✓ Đã ghi</span></div></div>
<div class="ac"><small>Số liệu tạm tính</small><div class="row"><span>Chi phí</span><b>47,8 tr</b></div><div class="row"><span>Thu hoạch</span><b>0 kg</b></div></div>
<div class="ac"><div class="row"><span>🌱 Gieo trồng</span><span class="ok">Xong</span></div><div class="row"><span>🌿 Chăm sóc</span><b style="color:var(--o)">Đang làm</b></div><div class="row"><span>🧺 Thu hoạch</span><span>Sắp tới</span></div></div>`, 1);
const phoneLog = (style) => phone(style, 'Ghi việc', `
<div class="ac"><small>Vụ</small><b>Dưa lưới Hè · Nhà màng 1</b></div>
<div class="ac"><small>Việc</small><b>Bón phân đợt 2</b></div>
<div class="ac" style="display:flex;justify-content:space-between;align-items:center"><div><small>Nội dung</small><b>Bón NPK gốc, tưới đẫm</b></div><div style="font-size:34px;background:#e6f4ea;border-radius:50%;width:48px;height:48px;text-align:center;line-height:48px">🎤</div></div>
<div class="ac"><small>Vật tư đã dùng (kho tự trừ)</small><b>NPK 20-20-15 · 5 kg</b></div>
<div><span class="chip on">Hôm nay</span><span class="chip">Hôm qua</span><span class="chip">Hôm kia</span><span class="chip">📷 Ảnh</span></div>
<div class="btn">Lưu việc</div>`, 2);

const roadmap = (rows) => rows.map(([i, t, d], k) => `<div class="card" style="display:flex;gap:14px;align-items:center;padding:18px 18px;margin-bottom:14px"><span class="num">${k + 1}</span><div style="font-size:40px">${i}</div><div><div style="font-size:26px;font-weight:800;color:var(--gd)">${t}</div><div style="font-size:20px;color:var(--mut);line-height:1.25">${d}</div></div></div>`).join('');

const gantt = (rows, days) => {
  const ax = `<div style="display:flex;margin-left:190px;font-size:17px;color:var(--mut);border-bottom:2px solid var(--line);padding-bottom:4px">${days.map((d) => `<span style="flex:1">Ngày ${d}</span>`).join('')}</div>`;
  const body = rows.map(([l, s, w, c, t]) => `<div style="display:flex;align-items:center;height:46px;border-bottom:1px dashed #e4e8e2"><div style="width:190px;font-size:20px;font-weight:700;color:var(--gdd)">${l}</div><div style="flex:1;position:relative;height:100%"><div style="position:absolute;left:${s}%;width:${w}%;top:9px;height:28px;border-radius:14px;background:${c};color:#fff;font-size:15px;font-weight:700;line-height:28px;padding:0 10px;white-space:nowrap;overflow:hidden">${t || ''}</div></div></div>`).join('');
  return ax + body;
};

const slides = [];

/* 01 Bìa bộ */
slides.push(S(1, {
  title: 'Từ mảnh đất đến<br><em>từng việc mỗi ngày</em>',
  sub: 'Sáu bước làm một lần, dùng mãi cho cả trồng trọt và chăn nuôi.',
  vis: `<div style="position:absolute;left:0;top:0;width:590px">${roadmap([['🏞️', 'Phân khu và ô', 'Khai báo nơi sản xuất'], ['📋', 'Quy trình mẫu', 'Công thức làm một loại cây, con'], ['🌱', 'Tạo vụ', 'Chọn quy trình, phân khu, ngày'], ['📈', 'Quản lý vụ', 'Lịch, việc hôm nay, Bắt đầu, Xong'], ['✍️', 'Ghi việc', 'Chạm vài lần, mất sóng vẫn ghi'], ['📒', 'Nhật ký', 'Xem lại, sửa, truy xuất khi cần']])}</div>
${phoneCycle('right:0;top:0;transform:scale(.95);transform-origin:top right')}
${tip('<b>Trồng trọt hay chăn nuôi</b> đều đi đúng sáu bước này: chỉ khác tên gọi (vụ hay đợt nuôi, ô hay chuồng, ao).', 'position:absolute;left:0;right:0;top:690px')}`,
  nextHint: 'Ảnh tiếp: Phân khu và ô',
}));

/* 02 Phân khu */
const group = (head, sub, cells) => `<div style="flex:1"><div class="card" style="background:var(--g);border-color:var(--g);color:#fff;padding:12px 14px;text-align:center"><div style="font-size:36px">${head[0]}</div><div style="font-size:24px;font-weight:800">${head[1]}</div><div style="font-size:18px;opacity:.9">${sub}</div></div><div style="width:4px;height:16px;background:var(--g);margin:0 auto"></div>${cells.map(([n, d]) => `<div class="card" style="padding:10px 12px;margin-bottom:8px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--gd)">${n}</div><div style="font-size:18px;color:var(--mut)">${d}</div></div>`).join('')}</div>`;
slides.push(S(2, {
  title: 'Khai báo <em>phân khu</em><br>và ô sản xuất',
  sub: 'Làm một lần: sau này tạo vụ chỉ việc chọn.',
  vis: `<div class="card" style="padding:18px 16px 8px"><div style="display:flex;gap:14px;align-items:flex-start">${group(['🏞️', 'Vườn Đông'], '2,4 ha', [['Nhà màng 1', '1.000 m² · trồng trọt'], ['Nhà màng 2', '1.000 m² · trồng trọt'], ['Vườn xoài', '8.000 m² · cây ăn trái']])}${group(['🐖', 'Khu chuồng A'], '1.200 m²', [['Chuồng 1', 'heo thịt · 300 con'], ['Chuồng 2', 'heo thịt · 300 con'], ['Ao lót bạt', 'thủy sản']])}${group(['🏭', 'Cơ sở vật chất'], 'không trồng', [['Kho vật tư', 'loại: cơ sở vật chất'], ['Nhà sơ chế', 'loại: cơ sở vật chất']])}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">${mini('➕', 'Thêm nhiều ô cùng lúc', 'Nhập số lượng, app tự đánh số')}${mini('📐', 'Diện tích để tính năng suất', 'Và chia vật tư dùng chung cho nhiều vụ')}${mini('📷', 'Có mã, vị trí, ảnh', 'Nhìn là biết đúng chỗ nào')}${mini('🔗', 'Mỗi vụ chạy trong một phân khu', 'App ưu tiên đúng loại, cảnh báo nếu khác')}</div>
${tip('<b>Mẹo:</b> chỗ không trồng, nuôi như cổng, kho thì khai là ô loại “Cơ sở vật chất”.', 'margin-top:16px')}`,
  nextHint: 'Ảnh tiếp: Quy trình mẫu',
}));

/* 03 Quy trình */
slides.push(S(3, {
  title: 'Quy trình mẫu:<br><em>làm một lần, dùng nhiều vụ</em>',
  sub: 'Có sẵn mẫu để tham khảo, bạn chỉnh theo kinh nghiệm của mình.',
  vis: `<div class="card" style="padding:16px 18px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:27px;font-weight:800;color:var(--gd)">🍈 Dưa lưới nhà màng <span style="font-size:19px;color:var(--mut);font-weight:600">· bản minh họa</span></div><span class="chip on" style="margin:0">Áp dụng cho cơ sở của tôi</span></div>
${gantt([['Chuẩn bị', 0, 14, '#8d6e63', 'Làm đất'], ['Gieo trồng', 14, 12, '#2a9d5c', 'Gieo'], ['Tưới nước', 20, 70, '#4aa3df', 'lặp mỗi 1 ngày'], ['Bón phân', 40, 10, 'var(--o)', 'ngày 30'], ['Bón phân', 66, 10, 'var(--o)', 'ngày 50'], ['Phòng bệnh', 30, 50, '#9b6bd6', 'lặp mỗi 7 ngày'], ['Thu hoạch', 86, 14, 'var(--g)', 'Thu']], ['1', '15', '30', '45', '60', '75'])}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">${mini('⏱️', 'Ngày bắt đầu từng việc', 'Để trống: nối tiếp việc trước. Nhập số: chạy song song')}${mini('🔁', 'Lặp lại mỗi … ngày', 'Ví dụ tưới, cho ăn mỗi ngày')}${mini('🧪', 'Vật tư dự kiến, hướng dẫn', 'Nhân viên mới nhìn là làm được')}${mini('🛡️', 'Mốc an toàn', 'Như thời gian cách ly thuốc')}</div>
<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;font-size:22px;font-weight:700;color:var(--gd)"><span class="chip">🐖 Mẫu heo thịt</span><span class="chip">🦐 Mẫu tôm ao lót bạt</span><span class="chip">🐔 Tự lập: gà, vịt, cút...</span></div>
${tip('<b>Lưu ý thật:</b> mẫu của hệ thống chỉ để tham khảo. Hãy hỏi người có kinh nghiệm rồi chỉnh số ngày cho đúng.', 'margin-top:14px')}`,
  nextHint: 'Ảnh tiếp: Tạo vụ',
}));

/* 04 Tạo vụ */
const fld = (l, v) => `<div style="margin-bottom:10px"><div style="font-size:17px;color:var(--mut)">${l}</div><div style="border:2px solid var(--line);border-radius:12px;padding:9px 12px;font-size:22px;font-weight:700;background:#fff">${v}</div></div>`;
slides.push(S(4, {
  title: 'Tạo vụ <em>trong một phút</em>',
  sub: 'Chọn quy trình, phân khu, ngày bắt đầu. App tự dựng lịch cho cả vụ.',
  vis: `<div style="display:flex;gap:16px"><div class="card" style="flex:1.05;padding:18px 18px 8px"><div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:10px">＋ Tạo vụ mới</div>${fld('Sản phẩm', '🍈 Dưa lưới')}${fld('Quy trình', 'Dưa lưới nhà màng')}${fld('Phân khu', 'Nhà màng 1 · Vườn Đông')}${fld('Ngày bắt đầu', '01/12/2026')}<div><span class="chip on">Bắt đầu ngay</span><span class="chip">Chưa bắt đầu (Chuẩn bị)</span></div><div class="btn" style="margin-bottom:10px">Tạo vụ</div></div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px"><div class="card" style="padding:16px 18px;background:#e6f4ea;border-color:#b7dcc3"><div style="font-size:25px;font-weight:800;color:var(--gd);margin-bottom:4px">App tự làm giúp bạn</div>${li(['Sao quy trình thành lịch riêng của vụ', 'Sửa lịch vụ này không đổi quy trình gốc', 'Cảnh báo nếu phân khu khác loại'], 21)}</div>
${mini('📊', 'Nhập thêm để tính chuẩn', 'Giống, diện tích, số cây, sản lượng và ngân sách dự kiến')}${mini('🔢', 'Chăn nuôi: nhập số con', 'Con số gốc để tính hao hụt, mật độ, FCR')}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">${mini('🌤️', 'Chuẩn bị trước', 'Lập lịch trước, bắt đầu chạy sau (tối đa 45 ngày ghi việc chuẩn bị)')}${mini('⏭️', 'Nối tiếp sau vụ trước', 'Vụ trước xong, app nhắc bắt đầu vụ này')}</div>
${tip('<b>Gói miễn phí:</b> chạy 1 vụ. Cần nhiều vụ cùng lúc thì dùng gói Hộ / HTX.', 'margin-top:16px')}`,
  nextHint: 'Ảnh tiếp: Quản lý vụ',
}));

/* 05 Quản lý vụ */
slides.push(S(5, {
  title: 'Mở vụ ra là biết<br><em>hôm nay làm gì</em>',
  sub: 'Một màn hình: tiến độ, việc đến hạn, chi phí và lãi lỗ tạm tính.',
  vis: `${phoneCycle('left:0;top:0;transform:scale(1.04);transform-origin:top left')}
<div style="position:absolute;left:380px;right:0;top:0;display:flex;flex-direction:column;gap:12px">${mini('⏰', 'Việc đến hạn hôm nay', 'Nhắc việc phải làm mà chưa ghi, bấm Ghi việc ngay trên dòng đó')}${mini('▶️', 'Bắt đầu và Xong', 'Người quản lý bấm khi việc thật sự bắt đầu, hoàn thành')}${mini('🔄', 'Lịch tự dời theo thực tế', 'Làm sớm hay trễ, các việc phía sau tự dời')}${mini('✅', 'Xong là đủ nhật ký', 'Chỉ bấm Xong khi ghi đủ số lần cần thiết')}${mini('✎', 'Sửa riêng cho vụ này', 'Sửa, xóa việc chưa làm, mở lại việc đã xong')}${mini('📈', 'Chi phí, thu hoạch, lãi lỗ', 'Tạm tính ngay trên thẻ vụ')}</div>`,
  nextHint: 'Ảnh tiếp: Ghi việc hằng ngày',
}));

/* 06 Ghi việc */
slides.push(S(6, {
  title: 'Ghi việc nhanh,<br><em>nói cũng được</em>',
  sub: 'Một việc làm xong chỉ cần một bản ghi, không phải ghi từng công nhân.',
  vis: `${phoneLog('right:0;top:0;transform:scale(1.04);transform-origin:top right')}
<div style="position:absolute;left:0;top:0;width:540px"><div class="card" style="padding:14px 18px;margin-bottom:12px"><div style="font-size:25px;font-weight:800;color:var(--gd);margin-bottom:6px">5 bước, chưa đến 1 phút</div>${['Chạm nút ＋ ở giữa thanh dưới', 'Chọn vụ và việc', 'Gõ hoặc bấm micro để nói', 'Thêm vật tư, ảnh', 'Lưu'].map((t, i) => `<div style="display:flex;gap:12px;align-items:center;font-size:22px;font-weight:600;margin:7px 0"><span class="num" style="width:36px;height:36px;font-size:21px">${i + 1}</span>${t}</div>`).join('')}</div>
${mini('📦', 'Kho tự trừ', 'Tiền vật tư vào chi phí vụ')}<div style="height:10px"></div>${mini('🕘', 'Quên thì ghi bù', 'Hôm nay, hôm qua, hôm kia, chọn giờ')}<div style="height:10px"></div>${mini('📋', 'Nhân bản', 'Việc giống hôm trước, bấm một lần')}<div style="height:10px"></div>${mini('📶', 'Mất sóng vẫn ghi', 'Lưu trên máy, có mạng tự gửi')}</div>`,
  nextHint: 'Ảnh tiếp: Nhật ký và chăn nuôi',
}));

/* 07 Nhật ký và chăn nuôi */
const logRow = (t, w, d, ok) => `<div class="row" style="font-size:20px;padding:9px 0"><div><b>${w}</b><div style="font-size:17px;color:var(--mut)">${t} · ${d}</div></div><span class="${ok ? 'ok' : ''}" style="font-size:18px">${ok ? '✓ đã ghi' : 'đã sửa'}</span></div>`;
slides.push(S(7, {
  title: 'Nhật ký đầy đủ,<br><em>truy xuất khi cần</em>',
  sub: 'Mọi việc đã ghi nằm gọn trong một danh sách để xem, sửa, hủy.',
  vis: `<div style="display:flex;gap:16px"><div class="card" style="flex:1.1;padding:14px 18px"><div style="font-size:25px;font-weight:800;color:var(--gd)">📒 Nhật ký việc</div>${logRow('08:10', 'Tưới nhỏ giọt · Dưa lưới', '02/12', 1)}${logRow('09:30', 'Phun phòng bệnh · Dưa lưới', '02/12', 1)}${logRow('07:00', 'Cho ăn · Chuồng heo 1', '02/12', 1)}${logRow('15:20', 'Tiêm vắc-xin · Chuồng heo 2', '01/12', 0)}${logRow('16:45', 'Bón phân đợt 1 · Dưa lưới', '30/11', 1)}</div>
<div class="card" style="flex:.9;padding:14px 18px;background:#f1faf3;border-color:#b7dcc3"><div style="font-size:25px;font-weight:800;color:var(--gd)">🐖 Đợt nuôi heo</div><div class="row" style="font-size:20px"><span>Số con nhập</span><b>300</b></div><div class="row" style="font-size:20px"><span>Còn lại</span><b>294</b></div><div class="row" style="font-size:20px"><span>Hao hụt</span><b class="ok">2,0%</b></div><div class="row" style="font-size:20px"><span>FCR</span><b>2,5</b></div><div style="font-size:16px;color:var(--mut);margin-top:6px">Số liệu mẫu minh họa</div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">${mini('✏️', 'Sai thì sửa hoặc hủy', 'Hủy chỉ đánh dấu, vẫn còn dấu vết')}${mini('💉', 'Thuốc, vắc-xin đúng ngày', 'Hồ sơ chứng minh thời gian cách ly')}${mini('🛡️', 'Chuẩn VietGAP', 'Có kiểu quản lý với sổ nhật ký, bảng kiểm')}${mini('🌐', 'Lên website, mã QR', 'Công khai vụ bạn chọn để truy xuất')}</div>
<div class="card" style="margin-top:18px;padding:16px 22px;display:flex;gap:22px;align-items:center;background:var(--gd);border-color:var(--gd);color:#fff"><div style="line-height:0;background:#fff;border-radius:10px;padding:6px">${qrSvg(C.webUrl, 130)}</div><div style="font-size:27px;font-weight:700;line-height:1.4">Dùng thử miễn phí 12 tháng<br><span style="font-size:23px;font-weight:600;color:#ffd9a8">Zalo ${C.zalo} · ${C.phone}</span><br><span style="font-size:21px;font-weight:600">${C.web}</span></div></div>`,
  nextHint: 'Bộ tiếp theo: B2 Kho, chi phí, lãi lỗ',
}));

render('b1', slides, process.argv[2] ? process.argv[2].split(',').map(Number) : null);
