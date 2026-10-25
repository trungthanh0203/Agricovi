// Tạo bộ nhận diện Agricovi (favicon, biểu tượng app, logo, ảnh chia sẻ, ảnh minh họa) từ ảnh gốc trong brand/source.
// Chạy: node brand/build-brand.cjs   (cần gói sharp có sẵn ở thư mục gốc kho)
// Giữ nguyên thiết kế favicon/logo của chủ sản phẩm: chỉ xóa nền trắng thành trong suốt, xóa dấu "Gemini Notebook", cắt gọn, đổi kích cỡ.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'source');
const WEB = path.join(__dirname, '..', 'apps', 'web', 'public');
const APP = path.join(__dirname, '..', 'apps', 'app', 'public');
fs.mkdirSync(path.join(WEB, 'brand'), { recursive: true });

async function raw(file) {
  const { data, info } = await sharp(path.join(SRC, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
// Xóa dấu bằng cách tô trắng vùng góc dưới phải (nền logo là trắng)
function whiteRect(img, x0, y0) {
  for (let y = y0; y < img.h; y++) for (let x = x0; x < img.w; x++) { const i = (y * img.w + x) * 3; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
}
// Nền trắng -> trong suốt, giữ nguyên màu thiết kế (color-to-alpha)
function toAlpha(img) {
  const out = Buffer.alloc(img.w * img.h * 4);
  for (let p = 0; p < img.w * img.h; p++) {
    const r = img.data[p * 3], g = img.data[p * 3 + 1], b = img.data[p * 3 + 2];
    const d = Math.max(255 - r, 255 - g, 255 - b);
    let a = Math.max(0, (d - 8) / (255 - 8));
    a = Math.min(1, a * 1.04);
    if (a < 0.02) { out[p * 4 + 3] = 0; continue; }
    const f = (c) => Math.max(0, Math.min(255, Math.round(255 - (255 - c) / a)));
    out[p * 4] = f(r); out[p * 4 + 1] = f(g); out[p * 4 + 2] = f(b); out[p * 4 + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: img.w, height: img.h, channels: 4 } });
}
const png = (s) => s.png({ compressionLevel: 9 }).toBuffer();
const write = (f, buf) => { fs.writeFileSync(f, buf); console.log(path.relative(path.join(__dirname, '..'), f), buf.length); };

// ICO chứa PNG (16, 32, 48)
function ico(pngs) {
  const n = pngs.length;
  const head = Buffer.alloc(6 + 16 * n);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    head[o] = size >= 256 ? 0 : size; head[o + 1] = size >= 256 ? 0 : size; head[o + 2] = 0; head[o + 3] = 0;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

(async () => {
  // ---------- biểu tượng chữ A (ảnh 21)
  const markT = await (await toAlpha(await raw('21.png'))).png().toBuffer();
  const markTrim = await sharp(markT).trim({ threshold: 1 }).png().toBuffer();
  const mm = await sharp(markTrim).metadata();
  const side = Math.max(mm.width, mm.height);
  const square = async (size, padFrac, bg) => {
    const inner = Math.round(size * (1 - 2 * padFrac));
    const m = await sharp(markTrim).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: m, gravity: 'centre' }]);
  };
  const clear = { r: 0, g: 0, b: 0, alpha: 0 }, white = { r: 255, g: 255, b: 255, alpha: 1 };
  const favs = [];
  for (const s of [16, 32, 48]) { const b = await png(await square(s, 0.04, clear)); favs.push({ size: s, buf: b }); if (s === 32) write(path.join(WEB, 'favicon-32.png'), b); if (s === 16) write(path.join(WEB, 'favicon-16.png'), b); }
  const icoBuf = ico(favs);
  write(path.join(WEB, 'favicon.ico'), icoBuf);
  write(path.join(WEB, 'apple-touch-icon.png'), await png(await square(180, 0.1, white)));
  write(path.join(WEB, 'brand', 'logo-mark.png'), await png(await square(512, 0.03, clear)));
  // ứng dụng
  write(path.join(APP, 'favicon.ico'), icoBuf);
  write(path.join(APP, 'favicon-32.png'), await png(await square(32, 0.04, clear)));
  write(path.join(APP, 'favicon-16.png'), await png(await square(16, 0.04, clear)));
  write(path.join(APP, 'apple-touch-icon.png'), await png(await square(180, 0.1, white)));
  write(path.join(APP, 'icon-192.png'), await png(await square(192, 0.1, white)));
  write(path.join(APP, 'icon-512.png'), await png(await square(512, 0.1, white)));
  write(path.join(APP, 'icon-maskable-512.png'), await png(await square(512, 0.2, white)));   // vùng an toàn của biểu tượng "maskable" (Android cắt tròn)
  write(path.join(APP, 'logo-mark.png'), await png(await square(256, 0.03, clear)));
  void side;

  // ---------- logo dọc (ảnh 23) và ngang (ảnh 25)
  const v = await raw('23.png'); whiteRect(v, 820, 960);
  const vT = await sharp(await (await toAlpha(v)).png().toBuffer()).trim({ threshold: 1 }).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  write(path.join(WEB, 'brand', 'logo-vertical.webp'), vT);
  write(path.join(APP, 'logo-vertical.webp'), vT);

  const hz = await raw('25.png'); whiteRect(hz, 1370, 440);
  const hzT = await sharp(await (await toAlpha(hz)).png().toBuffer()).trim({ threshold: 1 }).png().toBuffer();
  const hm = await sharp(hzT).metadata();
  const hWeb = await sharp(hzT).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  write(path.join(WEB, 'brand', 'logo-horizontal.webp'), hWeb);
  write(path.join(APP, 'logo-horizontal.webp'), hWeb);

  // logo gọn cho thanh đầu trang: chữ A + chữ AgriCoVi (bỏ dòng khẩu hiệu nhỏ)
  const { data: hd, info: hi } = await sharp(hzT).raw().toBuffer({ resolveWithObject: true });
  const colHas = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (hd[(y * hi.width + x) * 4 + 3] > 40) return true; return false; };
  // cụm cột đầu tiên = chữ A (kết thúc ở khoảng trống rộng đầu tiên)
  let x = 0, gap = 0, markEnd = 0; const minGap = Math.round(hi.width * 0.012);
  let seen = false;
  for (x = 0; x < hi.width; x++) { if (colHas(x, x + 1, 0, hi.height)) { seen = true; gap = 0; markEnd = x; } else if (seen && ++gap > minGap) break; }
  let textStart = markEnd + 1; while (textStart < hi.width && !colHas(textStart, textStart + 1, 0, hi.height)) textStart++;
  // hàng của chữ AgriCoVi: khối hàng đầu tiên trong vùng chữ
  let y = 0, rowSeen = false, rgap = 0, wordEnd = 0, wordStart = -1; const minRGap = Math.round(hi.height * 0.02);
  for (y = 0; y < hi.height; y++) {
    if (colHas(textStart, hi.width, y, y + 1)) { if (wordStart < 0) wordStart = y; rowSeen = true; rgap = 0; wordEnd = y; } else if (rowSeen && ++rgap > minRGap) break;
  }
  const markImg = await sharp(hzT).extract({ left: 0, top: 0, width: markEnd + 1, height: hi.height }).trim({ threshold: 1 }).png().toBuffer();
  const wordImg = await sharp(hzT).extract({ left: textStart, top: wordStart, width: hi.width - textStart, height: wordEnd - wordStart + 1 }).trim({ threshold: 1 }).png().toBuffer();
  const mI = await sharp(markImg).metadata(), wI = await sharp(wordImg).metadata();
  const H = 120, wordH = Math.round(H * 0.62);
  const wordScaled = await sharp(wordImg).resize({ height: wordH }).png().toBuffer();
  const markScaled = await sharp(markImg).resize({ height: H }).png().toBuffer();
  const mS = await sharp(markScaled).metadata(), wS = await sharp(wordScaled).metadata();
  const gapPx = 14;
  const compact = await sharp({ create: { width: mS.width + gapPx + wS.width, height: H, channels: 4, background: clear } })
    .composite([{ input: markScaled, left: 0, top: 0 }, { input: wordScaled, left: mS.width + gapPx, top: Math.round((H - wordH) / 2) }]).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
  write(path.join(WEB, 'brand', 'logo-header.webp'), compact);
  write(path.join(APP, 'logo-header.webp'), compact);
  console.log('mark', mI.width, mI.height, 'word', wI.width, wI.height, 'src', hm.width, hm.height);

  // ---------- ảnh minh họa và ảnh chia sẻ: bỏ dải có dấu "Gemini Notebook" ở đáy (cắt 52 px)
  const photo = async (file, out, width, quality = 80, crop = 52) => {
    const meta = await sharp(path.join(SRC, file)).metadata();
    const buf = await sharp(path.join(SRC, file)).extract({ left: 0, top: 0, width: meta.width, height: meta.height - crop }).resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
    write(path.join(WEB, 'brand', out), buf); return buf;
  };
  await photo('22.webp', 'photo-about.webp', 1200);
  await photo('24.webp', 'app-illustration.webp', 1200);
  await photo('26.webp', 'photo-seller.webp', 1200);
  await photo('27.webp', 'photo-guide.webp', 1200);
  write(path.join(APP, 'welcome.webp'), await sharp(path.join(SRC, '24.webp')).extract({ left: 0, top: 0, width: 1376, height: 716 }).resize({ width: 900 }).webp({ quality: 78 }).toBuffer());
  // ảnh chia sẻ 1200x630 (Zalo/Facebook/Google) từ ảnh bìa
  write(path.join(WEB, 'brand', 'og-default.jpg'), await sharp(path.join(SRC, '22.webp')).extract({ left: 0, top: 0, width: 1376, height: 722 }).resize({ width: 1200, height: 630, fit: 'cover', position: 'left top' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
})().catch((e) => { console.error(e); process.exit(1); });
