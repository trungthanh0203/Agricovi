// Tạo trang so sánh từ kết quả của run.mjs: ảnh bên trái, kết quả từng mô hình bên phải, tích ô nào SAI; trang tự tính tỉ lệ đúng và so với ngưỡng.
//   node scripts/invoice-bench/report.mjs   → scripts/invoice-bench/ket-qua/so-sanh.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(DIR, 'anh');
const OUT_DIR = path.join(DIR, 'ket-qua');
const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'results.json'), 'utf8'));
delete results.__llamaAgreed;

const LABEL = { 'cf-gemma3': 'Cloudflare · Gemma 3 12B', 'cf-llama32': 'Cloudflare · Llama 3.2 Vision', 'cf-mistral31': 'Cloudflare · Mistral 3.1 24B', 'groq-scout': 'Groq · Llama 4 Scout' };
const files = Object.keys(results).sort();
const data = [];
for (const f of files) {
  const p = path.join(IMG_DIR, f);
  if (!fs.existsSync(p)) continue;
  const buf = await sharp(p).rotate().resize({ width: 1100, height: 1500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  data.push({ file: f, img: `data:image/jpeg;base64,${buf.toString('base64')}`, engines: results[f] });
}
const engineIds = [...new Set(data.flatMap((d) => Object.keys(d.engines)))];

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>So sánh đọc hóa đơn</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:0;background:#f4f6f4;color:#1b2b1f}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #cfd8cf;padding:10px 16px;z-index:5}
h1{font-size:18px;margin:0 0 6px} table.sum{border-collapse:collapse;font-size:13px} table.sum td,table.sum th{border:1px solid #cfd8cf;padding:4px 8px;text-align:left}
.ok{color:#0a7a3b;font-weight:700}.bad{color:#b3261e;font-weight:700}
.doc{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:14px;margin:14px;padding:12px;background:#fff;border:1px solid #cfd8cf;border-radius:10px}
.doc img{width:100%;border:1px solid #ddd;position:sticky;top:120px;align-self:start}
.eng{border:1px solid #dfe6df;border-radius:8px;margin-bottom:10px;padding:8px}.eng h3{margin:0 0 6px;font-size:14px}
.eng table{border-collapse:collapse;width:100%;font-size:13px}.eng td,.eng th{border-bottom:1px solid #eee;padding:3px 6px;text-align:left;vertical-align:top}
.err{color:#b3261e;font-size:12px;word-break:break-word}.miss{font-size:12px}.miss input{width:3.5em}
.wrong td{background:#fde8e6} label{white-space:nowrap}
button{font:inherit;padding:6px 12px;margin-right:8px}
@media(max-width:800px){.doc{grid-template-columns:1fr}.doc img{position:static}}
</style></head><body>
<header><h1>So sánh đọc hóa đơn — tích ô SAI hoặc THIẾU</h1>
<div id="summary"></div>
<p style="margin:6px 0 0"><button id="exp">Lưu kết quả đã tích (tải file)</button><button id="clr">Xóa hết dấu tích</button><span id="saved" style="font-size:12px;color:#666"></span></p></header>
<div id="docs"></div>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const LABEL = ${JSON.stringify(LABEL)};
const ENGINES = ${JSON.stringify(engineIds)};
const HEAD = [['Nhà cung cấp (bên bán)', p => p.nha_cung_cap?.ten], ['Mã số thuế', p => p.nha_cung_cap?.ma_so_thue], ['Mã đơn / số hóa đơn', p => p.ma_don], ['Ngày', p => p.ngay], ['Tổng tiền', p => p.tong_tien]];
const KEY = 'invoice-bench-ticks-v1';
let ticks = {}; try { ticks = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ticks)); document.getElementById('saved').textContent = 'đã lưu trên trình duyệt này'; } catch {} };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = v => v === null || v === undefined || v === '' ? '<i style="color:#999">(trống)</i>' : esc(typeof v === 'number' ? v.toLocaleString('vi-VN') : v);
const k = (f, e, part) => f + '|' + e + '|' + part;

function render() {
  const root = document.getElementById('docs'); root.innerHTML = '';
  DATA.forEach(d => {
    const div = document.createElement('div'); div.className = 'doc';
    let h = '<div><img src="' + d.img + '" alt="' + esc(d.file) + '"><div style="font-size:12px;color:#666">' + esc(d.file) + '</div></div><div>';
    ENGINES.forEach(e => {
      const r = d.engines[e]; h += '<div class="eng"><h3>' + esc(LABEL[e] || e) + (r?.ms ? ' <small>(' + (r.ms/1000).toFixed(1) + ' giây)</small>' : '') + '</h3>';
      if (!r) { h += '<div class="err">Chưa chạy mô hình này.</div></div>'; return; }
      if (!r.ok) { h += '<div class="err">' + esc(r.error || 'Không ra JSON: ' + (r.raw || '').slice(0, 200)) + '</div><label><input type="checkbox" data-k="' + k(d.file, e, 'fail') + '"> ' + 'tính là sai toàn bộ' + '</label></div>'; return; }
      const p = r.parsed; h += '<table><tr><th>Trường</th><th>Đọc được</th><th>Sai?</th></tr>';
      HEAD.forEach(([n, g], i) => { const kk = k(d.file, e, 'h' + i); h += '<tr class="' + (ticks[kk] ? 'wrong' : '') + '"><td>' + n + '</td><td>' + fmt(g(p)) + '</td><td><input type="checkbox" data-k="' + kk + '"></td></tr>'; });
      (p.dong_hang || []).forEach((l, i) => { const kk = k(d.file, e, 'l' + i); h += '<tr class="' + (ticks[kk] ? 'wrong' : '') + '"><td>Dòng ' + (i+1) + '</td><td>' + esc(l.ten) + ' · ' + fmt(l.so_luong) + ' ' + esc(l.don_vi || '') + ' · giá ' + fmt(l.don_gia) + ' · tiền ' + fmt(l.thanh_tien) + '</td><td><input type="checkbox" data-k="' + kk + '"></td></tr>'; });
      const mk = k(d.file, e, 'missing');
      h += '</table><div class="miss">Số dòng hàng trên ảnh mà mô hình BỎ SÓT: <input type="number" min="0" value="' + (ticks[mk] || 0) + '" data-n="' + mk + '"></div>';
      if (p.ghi_chu_khong_chac) h += '<div class="miss">Mô hình ghi chú: ' + esc(p.ghi_chu_khong_chac) + '</div>';
      h += '</div>';
    });
    div.innerHTML = h + '</div>'; root.appendChild(div);
  });
  root.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = Boolean(ticks[c.dataset.k]); c.onchange = () => { ticks[c.dataset.k] = c.checked; save(); render(); }; });
  root.querySelectorAll('input[data-n]').forEach(c => { c.onchange = () => { ticks[c.dataset.n] = Number(c.value) || 0; save(); summary(); }; });
  summary();
}

function summary() {
  const rows = ENGINES.map(e => {
    let hTot = 0, hOk = 0, lTot = 0, lOk = 0, docs = 0, fail = 0;
    DATA.forEach(d => {
      const r = d.engines[e]; if (!r) return; docs++;
      if (!r.ok) { fail++; return; }
      if (ticks[k(d.file, e, 'fail')]) return;
      HEAD.forEach((_, i) => { hTot++; if (!ticks[k(d.file, e, 'h' + i)]) hOk++; });
      const lines = r.parsed.dong_hang || []; const miss = ticks[k(d.file, e, 'missing')] || 0;
      lTot += lines.length + miss; lines.forEach((_, i) => { if (!ticks[k(d.file, e, 'l' + i)]) lOk++; });
    });
    const failTotal = fail; const hp = hTot ? hOk / hTot * 100 : 0, lp = lTot ? lOk / lTot * 100 : 0;
    const pass = hp >= 90 && lp >= 80;
    return '<tr><td>' + esc(LABEL[e] || e) + '</td><td>' + docs + '</td><td>' + failTotal + '</td><td class="' + (hp >= 90 ? 'ok' : 'bad') + '">' + hp.toFixed(0) + '%</td><td class="' + (lp >= 80 ? 'ok' : 'bad') + '">' + lp.toFixed(0) + '%</td><td class="' + (pass ? 'ok' : 'bad') + '">' + (pass ? 'ĐẠT' : 'chưa đạt') + '</td></tr>';
  }).join('');
  document.getElementById('summary').innerHTML = '<table class="sum"><tr><th>Mô hình</th><th>Số ảnh</th><th>Không ra kết quả</th><th>Đầu phiếu đúng (cần ≥90%)</th><th>Dòng hàng đúng (cần ≥80%)</th><th>Kết luận</th></tr>' + rows + '</table><div style="font-size:12px;color:#666;margin-top:4px">Đầu phiếu = nhà cung cấp, mã số thuế, mã đơn, ngày, tổng tiền. Dòng bỏ sót tính là sai.</div>';
}

document.getElementById('exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(ticks, null, 1)], { type: 'application/json' })); a.download = 'dau-tich-doc-hoa-don.json'; a.click(); };
document.getElementById('clr').onclick = () => { if (confirm('Xóa hết dấu tích đã làm?')) { ticks = {}; save(); render(); } };
render();
</script></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'so-sanh.html'), html);
console.log(`Đã tạo ${path.join(OUT_DIR, 'so-sanh.html')} (${data.length} ảnh). Mở file này bằng trình duyệt.`);
