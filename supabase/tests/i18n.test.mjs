import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ABOUT_MENU, DEFAULT_FOOTER_COLS, DEFAULT_HEADER_NAV, DEFAULT_PAGES, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, HOME_BLOCK_LABEL, TRADE_UNITS, TRADE_TAGS,
  TRADE_KIND_LABEL, TRADE_STATUS_LABEL, ORDER_STATUS_LABEL, PAYMENT_LABEL, parseBody,
} from '../../packages/shared/src/site.ts';
import { translate, translateHtml, localizePath, stripLang, hasVietnamese, hasTranslation } from '../../packages/shared/src/i18n.ts';
import { EN_UI } from '../../packages/shared/src/i18n-ui.ts';
import { EN_PAGES } from '../../packages/shared/src/i18n-pages.ts';
import { EN_MSGS } from '../../packages/shared/src/i18n-msgs.ts';

// Song ngữ (W8, D71): bộ dịch an toàn, đường dẫn /en, độ phủ của nội dung mặc định.
test('dịch văn bản: khớp nguyên câu, tiền tố biểu tượng, quy tắc có số, nhiều đoạn; không đụng tới chữ người dùng', () => {
  assert.equal(translate('Giỏ hàng'), 'Cart');
  assert.equal(translate('  Giỏ hàng \n'), '  Cart \n');                                 // giữ khoảng trắng
  assert.equal(translate('🛒 Giỏ hàng'), '🛒 Cart');
  assert.equal(translate('🛒 Giỏ hàng (3)'), '🛒 Cart (3)');
  assert.equal(translate('Từ 40.000đ/kg'), 'From 40,000 VND/kg');
  assert.equal(translate('còn 12 ngày'), '12 days left');
  assert.equal(translate('Tháng 12/2026'), 'December 2026');
  assert.equal(translate('📍 Long An · còn 5 ngày'), '📍 Long An · 5 days left');         // tên riêng giữ nguyên
  assert.equal(translate('Tin hội chợ: Sắp diễn ra — Agricovi'), 'Trade fair news: Upcoming — Agricovi');
  assert.equal(translate('Gian hàng đăng tối đa 10 vật tư trong giai đoạn này.'), 'A shop can list at most 10 supply items at this stage.');
  // chữ do người dùng nhập giữ nguyên dù chứa từ có trong từ điển
  for (const t of ['Cần báo giá nhanh cho dưa lưới', 'Mô tả của người dùng: giỏ hàng đẹp', 'Dưa lưới Taki loại 1 đẹp']) assert.equal(translate(t), t);
  assert.equal(translate('Hello world'), 'Hello world');
  assert.equal(translate(''), '');
});

test('từ điển bổ sung của quản trị được ưu tiên', () => {
  assert.equal(translate('Khuyến mãi tháng 10', { 'Khuyến mãi tháng 10': 'October deals' }), 'October deals');
  assert.equal(translate('Giỏ hàng', { 'Giỏ hàng': 'Basket' }), 'Basket');
});

test('dịch HTML: chữ, placeholder/title/alt, liên kết /en; không đụng script, style, value, tên trường, nội dung ô nhập', () => {
  const html = '<head><title>Giỏ hàng — Agricovi</title><meta name="description" content="Giỏ hàng"><script>const a = "Giỏ hàng";</script><style>.x::after{content:"Giỏ hàng"}</style></head>'
    + '<a href="/gio-hang/" class="Giỏ hàng">Giỏ hàng</a><a href="https://x.vn/a">Giỏ hàng</a><a href="/anh/sp/1">Xem</a><form action="/bao-gia/"><input placeholder="Tìm kiếm" value="Giỏ hàng" name="Giỏ hàng">'
    + '<select><option value="tấn">tấn</option></select><textarea placeholder="Tìm kiếm">Giỏ hàng</textarea><img alt="Giỏ hàng" src="/anh/sp/x/0"></form><p>Nhà cung cấp:<textarea>x</textarea> Giỏ hàng</p>';
  const out = translateHtml(html);
  assert.match(out, /<title>Cart — Agricovi<\/title>/);
  assert.match(out, /content="Cart"/);
  assert.match(out, /const a = "Giỏ hàng";/);                    // script nguyên
  assert.match(out, /content:"Giỏ hàng"/);                       // style nguyên
  assert.match(out, /<a href="\/en\/gio-hang\/" class="Giỏ hàng">Cart<\/a>/);
  assert.match(out, /<a href="https:\/\/x\.vn\/a">Cart<\/a>/);   // liên kết ngoài giữ nguyên
  assert.match(out, /<a href="\/anh\/sp\/1">Xem<\/a>/);          // ảnh không thêm /en
  assert.match(out, /<form action="\/en\/bao-gia\/">/);
  assert.match(out, /placeholder="Search" value="Giỏ hàng" name="Giỏ hàng"/);   // placeholder dịch, value/name giữ
  assert.match(out, /<option value="tấn">ton<\/option>/);       // chữ hiển thị dịch, GIÁ TRỊ gửi đi giữ nguyên
  assert.match(out, /<textarea placeholder="Search">Giỏ hàng<\/textarea>/);
  assert.match(out, /<img alt="Cart"/);
  assert.match(out, /<p>Supplier:<textarea>x<\/textarea> Cart<\/p>/);           // chữ sát ô nhập vẫn được dịch
});

test('bản dịch của quản trị không chèn được mã HTML', () => {
  const out = translateHtml('<p>Khuyến mãi</p><input placeholder="Khuyến mãi">', { 'Khuyến mãi': '<img src=x onerror=alert(1)> & "deals"' });
  assert.equal(out.includes('<img'), false);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt; &amp; "deals"/);
  assert.equal(out.includes('placeholder="<'), false);
});

test('đường dẫn /en: thêm tiền tố cho trang, bỏ qua tệp/ảnh/quản trị/API; bỏ tiền tố khi vào', () => {
  assert.equal(localizePath('/', 'en'), '/en/');
  assert.equal(localizePath('/danh-ba/?q=a#x', 'en'), '/en/danh-ba/?q=a#x');
  assert.equal(localizePath('/en/danh-ba/', 'en'), '/en/danh-ba/');
  assert.equal(localizePath('/admin/', 'en'), '/admin/');
  assert.equal(localizePath('/anh/sp/1', 'en'), '/anh/sp/1');
  assert.equal(localizePath('/_astro/a.js', 'en'), '/_astro/a.js');
  assert.equal(localizePath('/sitemap.xml', 'en'), '/sitemap.xml');
  assert.equal(localizePath('//evil.com', 'en'), '//evil.com');
  assert.equal(localizePath('https://a.vn/x', 'en'), 'https://a.vn/x');
  assert.equal(localizePath('/danh-ba/', 'vi'), '/danh-ba/');
  assert.deepEqual(stripLang('/en'), { path: '/', lang: 'en' });
  assert.deepEqual(stripLang('/en/danh-ba/'), { path: '/danh-ba/', lang: 'en' });
  assert.deepEqual(stripLang('/english'), { path: '/english', lang: 'vi' });
  assert.deepEqual(stripLang('/danh-ba/'), { path: '/danh-ba/', lang: 'vi' });
});

test('từ điển hợp lệ: bản dịch không rỗng, không chứa thẻ HTML, không còn chữ Việt', () => {
  for (const [name, d] of [['ui', EN_UI], ['pages', EN_PAGES], ['msgs', EN_MSGS]]) {
    for (const [k, v] of Object.entries(d)) {
      assert.ok(v.trim().length > 0, `${name}: "${k}" rỗng`);
      assert.equal(/[<>]/.test(v), false, `${name}: "${k}" có thẻ HTML`);
      assert.equal(hasVietnamese(v), false, `${name}: "${k}" bản dịch còn chữ Việt: ${v}`);
    }
  }
});

test('nội dung mặc định của website đều đã có bản dịch (thêm chữ Việt mới mà quên dịch sẽ báo ở đây)', () => {
  const need = new Set();
  const add = (t) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); if (s && hasVietnamese(s)) need.add(s); };
  const nav = (items) => { for (const it of items ?? []) { add(it.label); add(it.title); nav(it.children); nav(it.links); } };
  nav(DEFAULT_HEADER_NAV); nav(DEFAULT_ABOUT_MENU); nav(DEFAULT_FOOTER_COLS); nav(DEFAULT_CATEGORIES);
  for (const v of Object.values(DEFAULT_SETTINGS.brand)) add(v);
  for (const p of Object.values(DEFAULT_PAGES)) {
    add(p.title); add(p.description);
    for (const b of parseBody(p.body)) { if (b.t === 'h' || b.t === 'p') add(b.text); else if (b.t === 'ul') b.items.forEach(add); else add(b.label); }
  }
  for (const m of [HOME_BLOCK_LABEL, TRADE_KIND_LABEL, TRADE_STATUS_LABEL, ORDER_STATUS_LABEL, PAYMENT_LABEL]) Object.values(m).forEach(add);
  [...TRADE_UNITS, ...TRADE_TAGS].forEach(add);
  const missing = [...need].filter((s) => !hasTranslation(s) && translate(s) === s);
  assert.deepEqual(missing, []);
});
