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
const foot = () => `<div class="foot"><b>${C.web}</b><span>Zalo ${C.zalo} · ${C.facebook}</span></div>`;
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
<div class="sub" style="max-width:760px">Ghi nhật ký, kho, chi phí, thu hoạch, nhân công, xem lãi lỗ từng vụ. Có sẵn website để khách tìm thấy bạn.</div>
<div class="chips"><div>📱 Dùng trên điện thoại</div><div>💻 Dùng trên máy tính</div><div>🌐 Có website kết nối mua bán</div></div>
<div class="vis">${deskDash('left:0;top:50px;width:640px;height:380px')}${phoneLog('right:0;top:0;transform:scale(.7);transform-origin:top right')}</div>
${foot()}</div></body></html>`);

/* 02 Toàn cảnh */
slides.push(slide(2, 'Toàn cảnh', 'Ghi một lần,<br><em>dùng nhiều nơi</em>', ['Ghi chép ở app: điện thoại hoặc máy tính', 'Website giúp khách hàng và đối tác tìm thấy bạn', 'Quản trị an toàn, mỗi người chỉ thấy phần được cấp'],
  `<div style="display:flex;gap:18px;align-items:stretch;margin-top:10px">
${[['📱', 'APP', 'Nhật ký, kho, chi phí, thu hoạch, nhân công, lãi lỗ', 'var(--g)'], ['🌐', 'WEBSITE', 'Hồ sơ cơ sở, gian hàng, giao thương, báo giá', 'var(--o)'], ['🔒', 'QUẢN TRỊ', 'Phân quyền, duyệt nội dung, dữ liệu riêng tư', 'var(--gd)']].map(([i, t, d, c], k) => `${k ? '<div style="align-self:center;font-size:54px;color:var(--o);font-weight:800">➜</div>' : ''}<div class="card" style="flex:1;padding:22px 16px;text-align:center;border-top:10px solid ${c}"><div style="font-size:72px">${i}</div><div style="font-size:34px;font-weight:800;color:${c};margin:6px 0">${t}</div><div style="font-size:23px;color:var(--mut);line-height:1.3">${d}</div></div>`).join('')}</div>
<div class="card" style="margin-top:26px;padding:20px 26px;font-size:28px;font-weight:600;background:#e6f4ea;border-color:#b7dcc3">Dữ liệu vận hành của bạn <b style="color:var(--g)">luôn riêng tư</b>. Website chỉ hiện những gì bạn đã chọn và được duyệt.</div>`));

/* 03 Ai dùng */
slides.push(slide(3, 'Ai dùng, thấy gì', 'Mỗi người<br><em>một cách nhìn</em>', ['Chủ cơ sở thấy toàn bộ và cấp quyền cho từng người', 'Nhân viên chỉ thấy việc của mình, ghi việc rất nhanh'],
  `<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:8px">${[['🧑‍🌾', 'Hộ nuôi trồng', 'Ghi việc, theo dõi chi phí, thu hoạch, lãi lỗ từng vụ'], ['🏢', 'HTX', 'Quản lý nhiều hộ thành viên, thu mua, hợp đồng bao tiêu'], ['👷', 'Nhân viên', 'Mở app là ghi việc, chấm công; chỉ thấy phần được giao'], ['🛒', 'Người mua', 'Tìm trên website, xem hồ sơ, báo giá, quét QR truy xuất']].map(([i, t, d]) => `<div class="card" style="padding:22px 22px 24px"><div style="font-size:64px">${i}</div><div style="font-size:34px;font-weight:800;color:var(--gd);margin:6px 0">${t}</div><div style="font-size:24px;color:var(--mut);line-height:1.32">${d}</div></div>`).join('')}</div>`));

/* 04 Bản đồ tính năng */
const feats = [['🌱', 'Vụ & phân khu'], ['📒', 'Nhật ký'], ['📅', 'Quy trình mẫu'], ['🔔', 'Nhắc việc'], ['📦', 'Kho vật tư'], ['💸', 'Chi phí'], ['🧺', 'Thu hoạch'], ['💰', 'Doanh thu'], ['👷', 'Nhân công'], ['🤝', 'HTX & hộ'], ['📊', 'Báo cáo'], ['🧾', 'Đọc hóa đơn AI'], ['🔳', 'QR truy xuất'], ['🌐', 'Website'], ['📣', 'Giao thương'], ['🔒', 'Phân quyền']];
slides.push(slide(4, 'Bản đồ tính năng', 'Có <em>đủ</em> những gì<br>bạn cần mỗi ngày', null,
  `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:14px;margin-top:10px">${feats.map(([i, t]) => `<div class="card" style="padding:18px 6px 14px;text-align:center"><div style="font-size:54px">${i}</div><div style="font-size:23px;font-weight:700;margin-top:4px;color:var(--gdd)">${t}</div></div>`).join('')}</div>
<div class="card" style="margin-top:22px;padding:16px 24px;font-size:27px;font-weight:600;text-align:center;background:#e6f4ea;border-color:#b7dcc3">Từ cây ăn trái, rau màu đến heo, gà, thủy sản: cùng một cách dùng</div>`,
  'Nhật ký, kho, chi phí, nhân công, HTX, báo cáo và website, tất cả trong một hệ thống.'));

/* 05 Ghi việc */
slides.push(slide(5, 'Ghi việc mỗi ngày', 'Chạm vài lần<br>là <em>xong việc</em>', ['<b>Dùng được cả khi mất sóng</b>, có mạng tự gửi lại', 'Quy trình mẫu theo từng cây, vật nuôi: nhắc đúng lúc', 'Tưới, bón, phun thuốc, cho ăn, tiêm phòng: chọn là ghi'],
  `${phoneLog('left:40px;top:0;transform:scale(.98);transform-origin:top left')}
<div class="card" style="position:absolute;right:0;top:60px;width:470px;padding:22px"><div style="font-size:28px;font-weight:800;color:var(--gd);margin-bottom:12px">📅 Việc cần làm tuần này</div>
${[['Thứ 2', 'Tưới nhỏ giọt · Dưa lưới'], ['Thứ 3', 'Tiêm vắc-xin · Chuồng heo 2'], ['Thứ 5', 'Bón phân đợt 2 · Dưa lưới'], ['Thứ 6', 'Cân heo, ghi trọng lượng']].map(([d, t]) => `<div class="row" style="font-size:23px;padding:10px 0"><b style="color:var(--o);width:90px">${d}</b><span style="flex:1">${t}</span></div>`).join('')}</div>`));

/* 06 Lãi lỗ */
slides.push(slide(6, 'Từ ghi chép đến lãi lỗ', 'Biết ngay<br>vụ này <em>lời hay lỗ</em>', ['Chi phí, vật tư xuất kho, nhân công tự cộng vào vụ', 'Thu hoạch và doanh thu ghi một lần', 'Xem lãi lỗ từng vụ, từng khu bất cứ lúc nào'],
  `<div style="display:flex;gap:10px;align-items:center;margin-top:6px;font-size:23px;font-weight:700;color:var(--gd)">${['Chi phí', 'Kho', 'Thu hoạch', 'Doanh thu', 'Lãi / lỗ'].map((t, i) => `${i ? '<span style="color:var(--o);font-size:30px">➜</span>' : ''}<div class="card" style="padding:12px 14px;${i === 4 ? 'background:var(--g);color:#fff;border-color:var(--g)' : ''}">${t}</div>`).join('')}</div>
${phoneProfit('right:30px;top:80px;transform:scale(.8);transform-origin:top right')}
<div class="card" style="position:absolute;left:0;top:96px;width:450px;padding:22px;font-size:27px;line-height:1.45;font-weight:600">Ví dụ một vụ dưa lưới:<br><span style="color:var(--mut)">Doanh thu</span> 186 triệu<br><span style="color:var(--mut)">Chi phí</span> 121,4 triệu<br><b style="color:var(--g);font-size:38px">Lãi 64,6 triệu</b><div style="font-size:19px;color:var(--mut);margin-top:8px;font-weight:400">Số liệu mẫu minh họa</div></div>`));

/* 07 Nhân công */
slides.push(slide(7, 'Nhân công <span style="opacity:.8;font-size:.8em">· gói trả phí</span>', 'Chấm công, khoán,<br><em>bảng lương rõ ràng</em>', ['Chấm công bằng điện thoại hoặc máy chấm công', 'Tính công theo ngày, theo giờ hoặc khoán', 'Bảng lương tự động, in và lưu lại khi cần'],
  `${deskPayroll('left:0;width:732px;top:10px;height:440px;zoom:1.3')}`));

/* 08 HTX */
slides.push(slide(8, 'HTX và hộ thành viên', 'HTX quản lý<br><em>nhiều hộ</em> dễ dàng', ['Theo dõi từng hộ: vụ, sản lượng, công nợ', 'Thu mua, hợp đồng bao tiêu, bảng kê rõ ràng', 'Truy xuất nguồn gốc về tận hộ trồng, hộ nuôi'],
  `${deskHtx('left:0;width:732px;top:10px;height:440px;zoom:1.3')}`));

/* 09 Website */
slides.push(slide(9, 'Website kết nối', 'Để khách hàng<br><em>tìm thấy bạn</em>', ['Hồ sơ cơ sở, gian hàng, giao thương, báo giá', 'Có tin nông nghiệp và giá nông sản mỗi ngày', '<b>Dữ liệu riêng tư</b>, chỉ công khai thứ bạn đã duyệt'],
  `${deskWeb('left:0;top:20px;width:720px;height:400px')}${phoneSite('right:10px;top:0;transform:scale(.8);transform-origin:top right')}`));

/* 10 Bắt đầu */
slides.push(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${CSS}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}.two .card{padding:18px 20px;font-size:23px;line-height:1.35}.two h3{font-size:29px;color:var(--gd);margin-bottom:6px}</style></head><body><div class="wrap">${brandTop(10)}
<div class="kick">Bắt đầu miễn phí</div><h1>Dùng thử <em>12 tháng</em><br>không mất phí</h1>
<div class="two"><div class="card" style="border-color:#b7dcc3;background:#f1faf3"><h3>Gói Khởi đầu · 0 đồng</h3>1 vụ, 1 phân khu, 1 ô, chủ cơ sở + 1 nhân viên. Có nhật ký, kho, chi phí, thu hoạch, doanh thu, lãi lỗ và lên website. Chưa gồm chấm công và xuất báo cáo.</div>
<div class="card"><h3>Cần nhiều hơn?</h3>Nhiều vụ, nhiều khu, nhiều người, chấm công, xuất báo cáo, HTX nhiều hộ: nâng cấp trong vài phút, dữ liệu giữ nguyên.</div>
<div class="card"><h3>📱 Trên điện thoại</h3>Mở ${C.appUrl.replace('https://', '')} bằng trình duyệt, chọn "Thêm vào màn hình chính". Không cần cửa hàng ứng dụng.</div>
<div class="card"><h3>💻 Trên máy tính</h3>Mở cùng địa chỉ, bấm biểu tượng cài đặt trên thanh địa chỉ để dùng như một phần mềm.</div></div>
<div class="vis" style="display:flex;gap:30px;align-items:center;justify-content:center"><div class="card" style="padding:14px;line-height:0">${qrSvg(C.webUrl, 250)}</div>
<div style="font-size:30px;font-weight:700;line-height:1.7;color:var(--gdd)"><div style="font-size:38px;color:var(--g);font-weight:800">Quét mã để bắt đầu</div>🌐 ${C.web}<br>💬 Zalo: ${C.zalo}<br>📞 ${C.phone}<br>✉️ ${C.email}<br>👍 ${C.facebook}</div></div>
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
