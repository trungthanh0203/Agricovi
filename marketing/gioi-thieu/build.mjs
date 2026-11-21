// Dựng bộ ảnh giới thiệu tầng A (10 ảnh 1080x1350). Chạy: node marketing/gioi-thieu/build.mjs
// Sửa chữ ở file này, thông tin liên hệ ở contact.json. Ảnh ra ở png/, mã nguồn HTML ở html/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');
const here = path.dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(fs.readFileSync(path.join(here, 'contact.json'), 'utf8'));
const TOTAL = 10;

function qrSvg(text, size = 220) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0e3d20"/></svg>`;
}

const CSS = `
:root{--g:#168043;--gd:#0e5e2e;--gdd:#0b3f20;--o:#f08a24;--cream:#f5f2e6;--ink:#17241b;--mut:#5b6a60;--line:#dcd8c6}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Segoe UI','Segoe UI Emoji',Arial,sans-serif;color:var(--ink);background:var(--cream);position:relative}
body:before{content:'';position:absolute;inset:0;background:radial-gradient(900px 500px at 100% 0,#dff0e2 0,transparent 70%),radial-gradient(700px 500px at 0 100%,#fbe7cf 0,transparent 70%)}
.wrap{position:relative;height:100%;padding:44px 64px 0;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.top img{height:62px}
.pg{font-weight:700;color:var(--gd);background:#fff;border:2px solid var(--line);border-radius:30px;padding:6px 20px;font-size:26px;letter-spacing:1px}
.kick{margin-top:34px;display:inline-block;align-self:flex-start;background:var(--g);color:#fff;font-weight:700;font-size:26px;letter-spacing:2px;text-transform:uppercase;padding:8px 22px;border-radius:30px}
h1{font-size:74px;line-height:1.08;font-weight:800;margin-top:18px;color:var(--gdd);letter-spacing:-1px}
h1 em{font-style:normal;color:var(--o)}
.sub{font-size:32px;color:var(--mut);margin-top:14px;line-height:1.35}
ul.ck{list-style:none;margin-top:26px;display:flex;flex-direction:column;gap:14px}
ul.ck li{font-size:34px;line-height:1.28;padding-left:58px;position:relative;font-weight:600}
ul.ck li:before{content:'✓';position:absolute;left:0;top:3px;width:40px;height:40px;border-radius:50%;background:var(--g);color:#fff;font-size:26px;font-weight:800;text-align:center;line-height:40px}
ul.ck li small{display:block;font-weight:400;font-size:26px;color:var(--mut)}
.vis{flex:1;position:relative;margin-top:18px;min-height:0}
.foot{margin:0 -64px;background:var(--gd);color:#fff;height:92px;padding:0 64px;display:flex;align-items:center;justify-content:space-between;font-size:27px;font-weight:600;flex:none}
.foot b{color:#ffd9a8;font-size:32px}
.foot span{opacity:.95}
.tag{display:inline-block;background:#fff3e0;color:#b25e00;border:2px solid #f6c98f;border-radius:24px;padding:4px 16px;font-size:24px;font-weight:700}
.card{background:#fff;border:2px solid var(--line);border-radius:26px;box-shadow:0 10px 30px rgba(14,94,46,.10)}
/* khung điện thoại */
.phone{position:absolute;width:330px;height:650px;background:#17241b;border-radius:48px;padding:12px;box-shadow:0 24px 50px rgba(0,0,0,.28)}
.phone .scr{width:100%;height:100%;background:#f7faf7;border-radius:38px;overflow:hidden;position:relative;font-size:17px}
.phone .scr:before{content:'';position:absolute;top:8px;left:50%;transform:translateX(-50%);width:90px;height:20px;background:#17241b;border-radius:12px;z-index:3}
.ah{background:var(--g);color:#fff;padding:44px 16px 14px;font-weight:700;font-size:21px}
.ab{padding:12px}
.ac{background:#fff;border:1px solid #dfe6df;border-radius:14px;padding:10px 12px;margin-bottom:9px}
.ac b{display:block;font-size:17px}
.ac small{color:#6b7a70;font-size:14px}
.chip{display:inline-block;background:#e6f4ea;color:var(--gd);border-radius:20px;padding:6px 12px;margin:0 6px 7px 0;font-weight:600;font-size:16px}
.chip.on{background:var(--g);color:#fff}
.btn{background:var(--g);color:#fff;text-align:center;border-radius:12px;padding:12px;font-weight:700;font-size:19px;margin-top:10px}
.tabs{position:absolute;bottom:0;left:0;right:0;height:58px;background:#fff;border-top:1px solid #dfe6df;display:flex;justify-content:space-around;align-items:center;font-size:13px;color:#6b7a70}
.tabs i{font-style:normal;display:block;text-align:center}
.tabs i.on{color:var(--g);font-weight:700}
.row{display:flex;justify-content:space-between;align-items:center;font-size:15px;padding:5px 0;border-bottom:1px dashed #e1e7e1}
.row:last-child{border:none}
.ok{color:var(--g);font-weight:700}
/* khung máy tính */
.desk{position:absolute;background:#fff;border-radius:18px;border:2px solid #cfd6cf;box-shadow:0 24px 50px rgba(0,0,0,.22);overflow:hidden}
.desk .bar{height:36px;background:#e8ece8;display:flex;align-items:center;gap:7px;padding:0 14px;font-size:13px;color:#6b7a70}
.desk .bar i{width:11px;height:11px;border-radius:50%;background:#c3cac3;display:block}
.desk .bar u{margin-left:12px;text-decoration:none;background:#fff;border-radius:12px;padding:3px 14px;flex:1;max-width:340px}
.dbody{display:flex;height:calc(100% - 36px)}
.side{width:178px;background:var(--gd);color:#d7efdf;padding:14px 10px;font-size:14px;flex:none}
.side b{display:block;color:#fff;font-size:17px;margin-bottom:12px}
.side div{padding:8px 10px;border-radius:8px;margin-bottom:3px}
.side div.on{background:rgba(255,255,255,.18);color:#fff;font-weight:700}
.main{flex:1;padding:14px 16px;background:#f7faf7;font-size:14px;overflow:hidden}
.main h4{font-size:18px;margin-bottom:10px;color:var(--gdd)}
.kpis{display:flex;gap:10px;margin-bottom:12px}
.kpi{flex:1;background:#fff;border:1px solid #dfe6df;border-radius:12px;padding:9px 11px}
.kpi small{color:#6b7a70;font-size:12px;display:block}
.kpi b{font-size:21px}
.kpi b.g{color:var(--g)}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
th{background:#e6f4ea;text-align:left;padding:7px 9px;color:var(--gd)}
td{padding:7px 9px;border-bottom:1px solid #eef1ee}
.bars{display:flex;align-items:flex-end;gap:8px;height:90px;background:#fff;border:1px solid #dfe6df;border-radius:12px;padding:10px}
.bars i{flex:1;background:var(--g);border-radius:5px 5px 0 0;display:block}
.bars i.o{background:var(--o)}
.grid{display:grid;gap:16px}
`;

const brandTop = (n) => `<div class="top"><img src="../assets/acovin-horizontal.png"><div class="pg">${String(n).padStart(2, '0')} / ${TOTAL}</div></div>`;
const foot = () => `<div class="foot"><b>${C.web}</b><span>Zalo ${C.zalo} · ĐT ${C.phone}</span></div>`;
function slide(n, kicker, title, items, vis, sub) {
  const ck = items && items.length ? `<ul class="ck">${items.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="wrap">${brandTop(n)}<div class="kick">${kicker}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}${ck}<div class="vis">${vis}</div>${foot()}</div></body></html>`;
}

/* ---- thành phần minh họa ---- */
const tabsBar = (on) => `<div class="tabs">${['🏠|Tổng quan', '🌱|Sản xuất', '✍️|Ghi việc', '📦|Kho', '☰|Thêm'].map((t, i) => { const [ic, tx] = t.split('|'); return `<i class="${i === on ? 'on' : ''}">${ic}<br>${tx}</i>`; }).join('')}</div>`;
const phoneLog = (style) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">Ghi việc hôm nay</div><div class="ab">
<div class="ac"><small>Vụ đang ghi</small><b>Dưa lưới Hè · Nhà màng 1</b></div>
<div><span class="chip on">💧 Tưới</span><span class="chip">🌿 Bón phân</span><span class="chip">🧪 Phun thuốc</span><span class="chip">🐖 Cho ăn</span><span class="chip">💉 Tiêm phòng</span></div>
<div class="ac"><small>Vật tư đã dùng</small><b>Phân NPK 20-20-15 · 5 kg</b></div>
<div class="ac"><small>Ghi chú</small><b>Tưới nhỏ giọt 30 phút</b></div>
<div class="ac" style="background:#fff7e6;border-color:#f6c98f"><b style="color:#b25e00">📶 Đang mất sóng</b><small>Đã lưu trên máy, có mạng sẽ tự gửi</small></div>
<div class="btn">Lưu việc</div></div>${tabsBar(2)}</div></div>`;
const phoneProfit = (style) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">Tổng kết vụ</div><div class="ab">
<div class="ac"><small>Dưa lưới Hè 2026</small><b>Đang thu hoạch</b></div>
<div class="ac"><div class="row"><span>Doanh thu</span><b>186.000.000đ</b></div><div class="row"><span>Chi phí</span><b>121.400.000đ</b></div><div class="row"><span>Lãi / lỗ</span><b class="ok">+64.600.000đ</b></div></div>
<div class="ac"><small>Chi phí theo nhóm</small><div class="row"><span>Giống, vật tư</span><span>58,2 tr</span></div><div class="row"><span>Nhân công</span><span>41,0 tr</span></div><div class="row"><span>Điện, nước, khác</span><span>22,2 tr</span></div></div>
</div>${tabsBar(0)}</div></div>`;
const phoneSite = (style) => `<div class="phone" style="${style}"><div class="scr"><div class="ah">Trại heo Ba Hùng</div><div class="ab">
<div class="ac" style="background:#e6f4ea"><b>✅ Hồ sơ đã được duyệt</b><small>Heo thịt · Đồng Nai</small></div>
<div class="ac"><b>🐖 Heo thịt xuất chuồng</b><small>Báo giá: liên hệ · Sẵn hàng 120 con</small></div>
<div class="ac"><b>🥬 Rau sạch có QR truy xuất</b><small>Quét mã xem nguồn gốc</small></div>
<div class="btn">Chat Zalo</div></div></div></div>`;
const deskDash = (style) => `<div class="desk" style="${style}"><div class="bar"><i></i><i></i><i></i><u>app.${C.web}</u></div><div class="dbody"><div class="side"><b>Acovin</b><div class="on">Tổng quan</div><div>Sản xuất</div><div>Ghi việc</div><div>Kho</div><div>Chi phí</div><div>Thu hoạch</div><div>Báo cáo</div></div>
<div class="main"><h4>Tổng quan cơ sở</h4><div class="kpis"><div class="kpi"><small>Vụ đang chạy</small><b>3</b></div><div class="kpi"><small>Doanh thu tháng</small><b>86 tr</b></div><div class="kpi"><small>Lãi tạm tính</small><b class="g">+29 tr</b></div></div>
<div class="bars"><i style="height:35%"></i><i style="height:50%"></i><i style="height:42%"></i><i style="height:70%"></i><i style="height:58%"></i><i class="o" style="height:90%"></i></div></div></div></div>`;
const deskPayroll = (style) => `<div class="desk" style="${style}"><div class="bar"><i></i><i></i><i></i><u>app.${C.web}</u></div><div class="dbody"><div class="side"><b>Acovin</b><div>Tổng quan</div><div>Sản xuất</div><div class="on">Nhân công</div><div>Kho</div><div>Báo cáo</div></div>
<div class="main"><h4>Bảng chấm công tháng 11</h4><table><tr><th>Nhân viên</th><th>Công</th><th>Khoán</th><th>Thành tiền</th></tr>
<tr><td>Nguyễn Văn A</td><td>24</td><td>2,0 tr</td><td><b>9.800.000</b></td></tr><tr><td>Trần Thị B</td><td>22</td><td>—</td><td><b>7.700.000</b></td></tr><tr><td>Lê Văn C</td><td>26</td><td>1,5 tr</td><td><b>10.600.000</b></td></tr><tr><td>Phạm Thị D</td><td>20</td><td>—</td><td><b>7.000.000</b></td></tr></table>
<div class="kpis" style="margin-top:12px"><div class="kpi"><small>Tổng lương tháng</small><b class="g">35.100.000đ</b></div><div class="kpi"><small>Số người</small><b>4</b></div></div></div></div></div>`;
const deskHtx = (style) => `<div class="desk" style="${style}"><div class="bar"><i></i><i></i><i></i><u>app.${C.web}</u></div><div class="dbody"><div class="side"><b>HTX Tân Phát</b><div>Tổng quan</div><div class="on">Hộ thành viên</div><div>Thu mua</div><div>Hợp đồng</div><div>Truy xuất</div></div>
<div class="main"><h4>Hộ thành viên</h4><table><tr><th>Hộ</th><th>Cây / vật nuôi</th><th>Sản lượng</th><th>Công nợ</th></tr>
<tr><td>Hộ ông Sáu</td><td>Dưa lưới</td><td>4,2 tấn</td><td>0</td></tr><tr><td>Hộ bà Năm</td><td>Xoài</td><td>6,8 tấn</td><td>12 tr</td></tr><tr><td>Hộ ông Bảy</td><td>Heo thịt</td><td>96 con</td><td>0</td></tr><tr><td>Hộ bà Tư</td><td>Gà thả vườn</td><td>1.200 con</td><td>5 tr</td></tr></table>
<div class="kpis" style="margin-top:12px"><div class="kpi"><small>Hộ thành viên</small><b>24</b></div><div class="kpi"><small>Hợp đồng bao tiêu</small><b class="g">6</b></div></div></div></div></div>`;
const deskWeb = (style) => `<div class="desk" style="${style}"><div class="bar"><i></i><i></i><i></i><u>${C.web}/gian-hang</u></div><div style="height:calc(100% - 36px);background:#f7faf7"><div style="background:var(--g);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;font-weight:700"><span>Acovin</span><span style="font-weight:400;font-size:14px">Giao thương · Gian hàng · Giá nông sản · Tin tức</span></div>
<div style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${['🍈|Dưa lưới Hà Nội|Hộ ông Sáu', '🐖|Heo thịt|Trại Ba Hùng', '🥭|Xoài cát Hòa Lộc|HTX Tân Phát', '🐔|Gà thả vườn|Hộ bà Tư', '🥬|Rau sạch|Hộ bà Mai', '🐟|Cá lóc|Trại Hai Lúa'].map((t) => { const [i, a, b] = t.split('|'); return `<div class="ac" style="margin:0"><div style="font-size:40px">${i}</div><b>${a}</b><small>${b}</small></div>`; }).join('')}</div></div></div>`;

const slides = [];

/* 01 Bìa */
slides.push(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${CSS}
.badge{position:absolute;right:34px;top:140px;background:var(--o);color:#fff;border-radius:50%;width:200px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-weight:800;box-shadow:0 14px 30px rgba(240,138,36,.45);transform:rotate(8deg);z-index:5}
.badge span{font-size:31px;line-height:1}.badge b{font-size:70px;line-height:1}.badge i{font-style:normal;font-size:26px}
.chips{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap}
.chips div{background:#fff;border:2px solid var(--line);border-radius:30px;padding:10px 22px;font-size:27px;font-weight:700;color:var(--gd)}
</style></head><body><div class="wrap">${brandTop(1)}
<div class="badge"><span>MIỄN PHÍ</span><b>12</b><i>THÁNG</i></div>
<div class="kick">Cho hộ và HTX Việt Nam</div>
<h1 style="font-size:78px">Quản lý <em>trồng trọt</em><br>& <em>chăn nuôi</em><br>trên một ứng dụng</h1>
<div class="sub" style="max-width:760px">Đủ chức năng: nhật ký, kho, chi phí, thu hoạch, nhân công, HTX, lãi lỗ từng vụ và website kết nối. Tặng gói Khởi đầu miễn phí 12 tháng.</div>
<div class="chips"><div>📱 Dùng trên điện thoại</div><div>💻 Dùng trên máy tính</div><div>🌐 Có website kết nối mua bán</div></div>
<div class="vis">${deskDash('left:0;top:50px;width:640px;height:380px')}${phoneLog('right:0;top:0;transform:scale(.7);transform-origin:top right')}</div>
${foot()}</div></body></html>`);

const li = (arr, fs = 22) => `<div style="font-size:${fs}px;line-height:1.38;color:var(--mut);text-align:left;margin-top:8px">${arr.map((t) => `<div style="padding-left:24px;position:relative;margin-bottom:4px"><span style="position:absolute;left:0;color:var(--g);font-weight:800">✓</span>${t}</div>`).join('')}</div>`;
const mini = (i, t, d, st = '') => `<div class="card" style="padding:14px 16px;${st}"><div style="display:flex;gap:12px;align-items:center"><div style="font-size:42px">${i}</div><div><div style="font-size:25px;font-weight:800;color:var(--gd)">${t}</div><div style="font-size:20px;color:var(--mut);line-height:1.3">${d}</div></div></div></div>`;
const banner = (h, st = '') => `<div class="card" style="padding:16px 24px;font-size:26px;font-weight:600;background:#e6f4ea;border-color:#b7dcc3;${st}">${h}</div>`;
const star = '<span class="tag" style="font-size:20px;padding:2px 12px;margin-left:8px;vertical-align:middle">★ Gói đầy đủ</span>';

/* 02 Toàn cảnh */
slides.push(slide(2, 'Toàn cảnh hệ thống', 'Ghi một lần,<br><em>dùng nhiều nơi</em>', ['Ghi chép ở app: tự cộng vào kho, chi phí, báo cáo', 'Website giúp khách hàng và đối tác tìm thấy bạn', 'Quản trị an toàn, mỗi người chỉ thấy phần được cấp'],
  `<div style="display:flex;gap:14px;align-items:stretch;margin-top:6px">
${[['📱', 'APP', 'var(--g)', ['Điện thoại và máy tính', 'Ghi việc cả khi mất sóng', 'Kho, chi phí, lãi lỗ, báo cáo']], ['🌐', 'WEBSITE', 'var(--o)', ['Hồ sơ và gian hàng', 'Giao thương, báo giá', 'Tin tức, giá nông sản']], ['🔒', 'QUẢN TRỊ', 'var(--gd)', ['Phân quyền từng người', 'Duyệt nội dung công khai', 'Dữ liệu riêng tư mặc định']]].map(([i, t, c, l], k) => `${k ? '<div style="align-self:center;font-size:44px;color:var(--o);font-weight:800">➜</div>' : ''}<div class="card" style="flex:1;padding:20px 14px;text-align:center;border-top:10px solid ${c}"><div style="font-size:68px">${i}</div><div style="font-size:32px;font-weight:800;color:${c};margin:4px 0">${t}</div>${li(l, 21)}</div>`).join('')}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px">${mini('⚡', 'Nhập một lần', 'Việc ghi trong ngày tự đi vào kho, chi phí, báo cáo')}${mini('🌾', 'Trồng trọt và chăn nuôi', 'Cây ăn trái, rau màu, heo, gà, thủy sản')}</div>
${banner('Dữ liệu vận hành của bạn <b style="color:var(--g)">luôn riêng tư</b>. Website chỉ hiện những gì bạn đã chọn và được duyệt.', 'margin-top:16px')}`));

/* 03 Ai dùng */
slides.push(slide(3, 'Ai dùng, thấy gì', 'Mỗi người<br><em>một cách nhìn</em>', ['Chủ cơ sở thấy toàn bộ và cấp quyền cho từng người', 'Nhân viên chỉ thấy việc của mình, ghi việc rất nhanh'],
  `<div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">${[['🧑‍🌾', 'Hộ nuôi trồng', ['Ghi việc, nhật ký hằng ngày', 'Chi phí, thu hoạch, doanh thu', 'Lãi lỗ từng vụ, từng khu']], ['🏢', 'HTX', ['Quản lý nhiều hộ thành viên', 'Thu mua, hợp đồng bao tiêu', 'Truy xuất về từng hộ']], ['👷', 'Nhân viên', ['Mở app là ghi việc, chấm công', 'Chỉ thấy phần được giao', 'Dùng được khi mất sóng']], ['🛒', 'Người mua', ['Tìm cơ sở, gian hàng trên web', 'Xem hồ sơ, xin báo giá', 'Quét QR xem nguồn gốc']]].map(([i, t, l]) => `<div class="card" style="padding:18px 20px"><div style="display:flex;align-items:center;gap:12px"><div style="font-size:56px">${i}</div><div style="font-size:33px;font-weight:800;color:var(--gd)">${t}</div></div>${li(l, 22)}</div>`).join('')}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">${mini('🔑', 'Nhiều vai trò', 'Một người có thể giữ nhiều vai trò')}${mini('🎚️', 'Cấp quyền từng mục', 'Kho, thu hoạch, chi phí, doanh thu')}</div>`));

/* 04 Bản đồ tính năng */
const feats = [['🌱', 'Vụ & phân khu'], ['📒', 'Nhật ký'], ['📅', 'Quy trình mẫu'], ['🔔', 'Nhắc việc'], ['📦', 'Kho vật tư', 1], ['💸', 'Chi phí'], ['🧺', 'Thu hoạch'], ['💰', 'Doanh thu'], ['👷', 'Nhân công', 1], ['🤝', 'HTX & hộ', 1], ['📊', 'Báo cáo, xuất Excel', 1], ['🧾', 'Đọc hóa đơn AI'], ['🔳', 'QR truy xuất'], ['🌐', 'Website'], ['📣', 'Giao thương'], ['🔒', 'Phân quyền', 1]];
slides.push(slide(4, 'Bản đồ tính năng', 'Có <em>đủ</em> những gì<br>bạn cần mỗi ngày', null,
  `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:14px;margin-top:10px">${feats.map(([i, t, s]) => `<div class="card" style="padding:18px 6px 14px;text-align:center;position:relative">${s ? '<div style="position:absolute;top:8px;right:12px;color:var(--o);font-size:26px;font-weight:800">★</div>' : ''}<div style="font-size:54px">${i}</div><div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--gdd)">${t}</div></div>`).join('')}</div>
${banner('<b style="color:var(--o)">★</b> = dùng đầy đủ ở gói Hộ / HTX. Gói Khởi đầu miễn phí có bản gọn hoặc giới hạn số lượng. Dùng cho cả trồng trọt lẫn chăn nuôi.', 'margin-top:20px;font-size:24px')}`,
  'Nhật ký, kho, chi phí, nhân công, HTX, báo cáo và website, tất cả trong một hệ thống.'));

/* 05 Ghi việc */
slides.push(slide(5, 'Ghi việc mỗi ngày', 'Chạm vài lần<br>là <em>xong việc</em>', ['<b>Dùng được cả khi mất sóng</b>, có mạng tự gửi lại', 'Quy trình mẫu theo từng cây, vật nuôi: nhắc đúng lúc', 'Tưới, bón, phun thuốc, cho ăn, tiêm phòng: chọn là ghi'],
  `${phoneLog('left:0;top:0;transform:scale(.98);transform-origin:top left')}
<div style="position:absolute;left:350px;right:0;top:0;display:flex;flex-direction:column;gap:14px">
<div class="card" style="padding:18px 20px"><div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:6px">📅 Việc cần làm tuần này</div>
${[['T2', 'Tưới nhỏ giọt · Dưa lưới'], ['T3', 'Tiêm vắc-xin · Chuồng heo 2'], ['T5', 'Bón phân đợt 2 · Dưa lưới'], ['T6', 'Cân heo, ghi trọng lượng']].map(([d, t]) => `<div class="row" style="font-size:21px;padding:7px 0"><b style="color:var(--o);width:52px">${d}</b><span style="flex:1">${t}</span></div>`).join('')}</div>
<div class="card" style="padding:18px 20px"><div style="font-size:26px;font-weight:800;color:var(--gd);margin-bottom:8px">📋 Quy trình mẫu</div>
<div style="font-size:20px;color:var(--mut);margin-bottom:4px">🍈 Dưa lưới</div><div><span class="chip">Làm đất</span><span class="chip">Xuống giống</span><span class="chip on">Chăm sóc</span><span class="chip">Thu hoạch</span></div>
<div style="font-size:20px;color:var(--mut);margin:4px 0">🐖 Heo thịt</div><div><span class="chip">Úm</span><span class="chip on">Nuôi</span><span class="chip">Xuất chuồng</span></div></div>
${mini('📷', 'Kèm ảnh, ghi chú', 'Lưu hình ảnh làm bằng chứng cho từng việc')}
${mini('📒', 'Sổ nhật ký theo mẫu VietGAP', 'Xem lại, in khi cần')}</div>`));

/* 06 Lãi lỗ */
slides.push(slide(6, 'Từ ghi chép đến lãi lỗ', 'Biết ngay<br>vụ này <em>lời hay lỗ</em>', ['Chi phí, vật tư xuất kho, nhân công tự cộng vào vụ', 'Thu hoạch và doanh thu ghi một lần', 'Xem lãi lỗ từng vụ, từng khu bất cứ lúc nào'],
  `<div style="display:flex;gap:8px;align-items:center;font-size:21px;font-weight:700;color:var(--gd)">${['Chi phí', 'Kho', 'Thu hoạch', 'Doanh thu', 'Lãi / lỗ'].map((t, i) => `${i ? '<span style="color:var(--o);font-size:26px">➜</span>' : ''}<div class="card" style="padding:9px 12px;${i === 4 ? 'background:var(--g);color:#fff;border-color:var(--g)' : ''}">${t}</div>`).join('')}</div>
${phoneProfit('right:0;top:70px;transform:scale(.93);transform-origin:top right')}
<div style="position:absolute;left:0;top:70px;width:575px;display:flex;flex-direction:column;gap:14px">
<div class="card" style="padding:18px 22px;font-size:26px;line-height:1.5;font-weight:600">Ví dụ một vụ dưa lưới<br><span style="color:var(--mut)">Doanh thu</span> 186 triệu · <span style="color:var(--mut)">Chi phí</span> 121,4 triệu<br><b style="color:var(--g);font-size:40px">Lãi 64,6 triệu (34,7%)</b><div style="font-size:18px;color:var(--mut);font-weight:400">Số liệu mẫu minh họa</div></div>
<div class="card" style="padding:16px 22px"><div style="font-size:23px;font-weight:800;color:var(--gd);margin-bottom:8px">Chi phí chia theo nhóm</div>
${[['Giống, vật tư', 48, '58,2 tr'], ['Nhân công', 34, '41,0 tr'], ['Điện, nước, khác', 18, '22,2 tr']].map(([n, w, v]) => `<div style="font-size:20px;display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="width:160px">${n}</span><div style="flex:1;background:#e6f4ea;border-radius:8px;height:20px"><div style="width:${w * 2}%;height:20px;border-radius:8px;background:var(--g)"></div></div><b>${v}</b></div>`).join('')}</div>
${mini('🧮', 'Chi phí chung chia cho vụ', 'Điện, nước, thuê... tự chia theo từng vụ')}
${mini('🧾', 'Chụp hóa đơn, AI đọc giúp', 'Nhập chi phí nhanh, đỡ gõ tay')}</div>`));

/* 07 Nhân công */
slides.push(slide(7, 'Nhân công' + star, 'Chấm công, khoán,<br><em>bảng lương rõ ràng</em>', ['Chấm công bằng PIN và khuôn mặt, hoặc chủ nhập hộ', 'Công tính theo giờ × đơn giá, hoặc khoán theo sản lượng', 'Bảng lương tự động, chốt lương mỗi tháng'],
  `${deskPayroll('left:0;width:732px;top:0;height:360px;zoom:1.3')}
<div style="position:absolute;left:0;right:0;top:490px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">${mini('🔐', 'Chấm công', 'Bằng PIN, đối chiếu khuôn mặt')}${mini('📱', 'Máy chấm công', 'Một điện thoại cố định ở khu làm việc')}${mini('📝', 'Nghỉ phép, phiếu khoán', 'Ghi nghỉ, giao khoán theo sản lượng')}</div>`));

/* 08 HTX */
slides.push(slide(8, 'HTX và hộ thành viên' + star, 'HTX quản lý<br><em>nhiều hộ</em> dễ dàng', ['Theo dõi từng hộ: vụ, sản lượng, công nợ', 'Thu mua, hợp đồng bao tiêu, bảng kê rõ ràng', 'Truy xuất nguồn gốc về tận hộ trồng, hộ nuôi'],
  `${deskHtx('left:0;width:732px;top:0;height:360px;zoom:1.3')}
<div style="position:absolute;left:0;right:0;top:490px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">${mini('🛒', 'Thu mua', 'Bảng kê thu mua từ hộ')}${mini('📃', 'Bao tiêu', 'Hợp đồng và theo dõi giao hàng')}${mini('🔳', 'Truy xuất', 'Mã QR về tận hộ sản xuất')}</div>`));

/* 09 Website */
slides.push(slide(9, 'Website kết nối', 'Để khách hàng<br><em>tìm thấy bạn</em>', ['Hồ sơ cơ sở, gian hàng, giao thương, báo giá', 'Có tin nông nghiệp và giá nông sản mỗi ngày', '<b>Dữ liệu riêng tư</b>, chỉ công khai thứ bạn đã duyệt'],
  `${deskWeb('left:0;top:0;width:690px;height:380px')}${phoneSite('right:0;top:0;transform:scale(.55);transform-origin:top right')}
<div style="position:absolute;left:0;right:0;top:400px;display:grid;grid-template-columns:1fr 1fr;gap:12px">${mini('🏡', 'Hồ sơ cơ sở', 'Giới thiệu trại, vườn, HTX của bạn')}${mini('🛍️', 'Gian hàng', 'Đăng sản phẩm, vật tư để bán')}${mini('📣', 'Giao thương', 'Đăng nhu cầu mua bán, nhận báo giá')}${mini('📈', 'Giá nông sản và tin tức', 'Cập nhật mỗi ngày')}</div>
${banner('Vụ nào công khai là do <b style="color:var(--g)">bạn chọn</b>; mọi hồ sơ đều qua kiểm duyệt trước khi hiện.', 'position:absolute;left:0;right:0;top:630px;font-size:23px')}`));

/* 10 Bắt đầu */
slides.push(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${CSS}.pl{padding:16px 20px;font-size:21px}.pl h3{font-size:28px;margin-bottom:2px}</style></head><body><div class="wrap">${brandTop(10)}
<div class="kick">Bắt đầu ngay</div><h1 style="font-size:66px">Dùng thử <em>miễn phí 12 tháng</em><br>rồi nâng cấp khi cần</h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
<div class="card pl" style="border:3px solid var(--g);background:#f1faf3"><h3 style="color:var(--g)">🎁 Gói Khởi đầu · 0 đồng</h3><b>12 tháng, không cần thẻ</b>${li(['1 vụ, 1 phân khu, 1 ô; chủ + 1 nhân viên', 'Nhật ký, kho gọn, chi phí, thu hoạch, doanh thu, lãi lỗ', 'Đăng hồ sơ, giao thương lên website', 'Đọc hóa đơn bằng AI 2 lần/tháng'], 20)}</div>
<div class="card pl" style="border:3px solid var(--o)"><h3 style="color:#b25e00">🚀 Gói Hộ / HTX đầy đủ</h3><b>Khi cần làm lớn</b>${li(['Nhiều vụ, nhiều phân khu, nhiều người', 'Chấm công, lương, phân quyền chi tiết', 'Kho có lô và hạn dùng, xuất báo cáo Excel', 'HTX quản lý nhiều hộ thành viên'], 20)}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">${mini('📱', 'Cài trên điện thoại', 'Mở ' + C.appUrl.replace('https://', '') + ', chọn "Thêm vào màn hình chính"')}${mini('💻', 'Cài trên máy tính', 'Mở cùng địa chỉ, bấm biểu tượng cài đặt ở thanh địa chỉ')}</div>
<div class="vis" style="display:flex;gap:28px;align-items:center;justify-content:center"><div class="card" style="padding:12px;line-height:0">${qrSvg(C.webUrl, 220)}</div>
<div style="font-size:29px;font-weight:700;line-height:1.55;color:var(--gdd)"><div style="font-size:36px;color:var(--g);font-weight:800">Quét mã để bắt đầu</div>🌐 ${C.web}<br>💬 Zalo: ${C.zalo}<br>📞 ĐT: ${C.phone}<br>✉️ ${C.email}<br>👍 ${C.facebook}</div></div>
${foot()}</div></body></html>`);

const nFinal = slides.length;
if (nFinal !== TOTAL) throw new Error('Số ảnh ' + nFinal + ' khác ' + TOTAL);

fs.mkdirSync(path.join(here, 'html'), { recursive: true });
fs.mkdirSync(path.join(here, 'png'), { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
slides.forEach((h, i) => {
  const n = i + 1;
  const f = path.join(here, 'html', `${String(n).padStart(2, '0')}.html`);
  fs.writeFileSync(f, h);
  if (only && !only.includes(n)) return;
  const out = path.join(here, 'png', `${String(n).padStart(2, '0')}.png`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1350', '--virtual-time-budget=3000', `--screenshot=${out}`, pathToFileURL(f).href], { stdio: 'ignore' });
  console.log('xong', out);
});
