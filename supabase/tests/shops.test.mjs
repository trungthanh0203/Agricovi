import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0047 (D67): gian hàng vật tư — đăng ký, duyệt, đăng vật tư có kiểm duyệt, báo giá, báo cáo, tạm khóa.
async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), mod = await addUser(db, 2), owner = await addUser(db, 3), owner2 = await addUser(db, 4), buyer = await addUser(db, 5), plain = await addUser(db, 6);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','moderator',true)`);
  for (const [u, n] of [[owner, 'Chủ Đại Lý'], [owner2, 'Chủ Khác'], [buyer, 'Người Mua'], [plain, 'Chưa Xác Nhận']]) await asUser(db, u, `select ensure_buyer_profile($1,'individual',null)`, [n]);
  await db.query(`update auth.users set email_confirmed_at = now() where id = any ($1::uuid[])`, [[owner, owner2, buyer, mod]]);
  const phan = (await db.query(`select id from product_categories where slug='phan-bon'`)).rows[0].id;
  const rau = (await db.query(`select id from product_categories where slug='rau-cu-qua'`)).rows[0].id;
  return { db, admin, mod, owner, owner2, buyer, plain, phan, rau };
}
const open = (db, u, over = {}) => asUser(db, u, `select open_material_shop($1,'Long An','Đức Hòa','Số 5 đường A',$2,$3,$4,'Sở KH&ĐT',null) id`,
  [over.name ?? 'Đại lý Phân bón Hòa Bình', over.desc ?? 'Chuyên phân bón, vật tư nông nghiệp', over.phone ?? '0912345678', over.license ?? 'GP-12345']);
const save = (db, u, id, cat, over = {}) => asUser(db, u, `select shop_save_material($1,$2,$3,'Hòa Bình',$4,'N 30%','Bón gốc 20 kg/ha','Đeo găng','kg',$5,'',$6,$7) r`,
  [id, cat, over.name ?? 'NPK 30-11-10', over.summary ?? 'Phân NPK cho dưa lưới', over.price ?? 18000, over.image ?? null, over.submit ?? false]);
async function activeShop(ctx) {
  const id = (await open(ctx.db, ctx.owner)).rows[0].id;
  await asUser(ctx.db, ctx.mod, `select site_review_shop($1,'approve',null,true)`, [id]);
  return id;
}

test('mở gian hàng: cần email đã xác nhận, số giấy phép, nội dung không chứa liên hệ; một người một gian hàng; chờ duyệt', async () => {
  const { db, owner, plain, buyer } = await setup();
  assert.match(await expectError(open(db, plain)), /VERIFY/);
  assert.match(await expectError(open(db, owner, { name: 'Gọi 0912345678' })), /CONTACT/);
  assert.match(await expectError(open(db, owner, { desc: 'xem http://x.vn' })), /CONTACT/);
  assert.match(await expectError(open(db, owner, { license: '' })), /INVALID/);
  assert.match(await expectError(open(db, owner, { phone: '123' })), /INVALID/);
  const id = (await open(db, owner)).rows[0].id;
  assert.match(await expectError(open(db, owner)), /INVALID/);                                   // đã có gian hàng
  const a = (await asUser(db, owner, `select get_my_web_account() a`)).rows[0].a;
  assert.deepEqual([a.material_shop.id === id, a.material_shop.status], [true, 'pending']);
  assert.equal((await asUser(db, buyer, `select get_my_web_account() a`)).rows[0].a.material_shop, null);
  assert.equal((await asAnon(db, `select count(*)::int n from public_material_shops`)).rows[0].n, 0);
  assert.match(await expectError(save(db, owner, null, null)), /FORBIDDEN/);                      // chưa duyệt: chưa đăng vật tư
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='shop'`, [owner])).rows[0].n, 1);
});

test('duyệt gian hàng: kiểm duyệt viên duyệt/từ chối/tạm khóa; phần công khai không có điện thoại, địa chỉ, giấy phép', async () => {
  const { db, mod, owner, buyer } = await setup();
  const id = (await open(db, owner)).rows[0].id;
  assert.match(await expectError(asUser(db, buyer, `select site_list_shops('pending')`)), /FORBIDDEN/);
  const l = (await asUser(db, mod, `select site_list_shops('pending') l`)).rows[0].l;
  assert.deepEqual([l.length, l[0].license_no, l[0].owner_name, l[0].owner_email], [1, 'GP-12345', 'Chủ Đại Lý', 'u3@test.local']);
  assert.match(await expectError(asUser(db, mod, `select site_review_shop($1,'reject','',false)`, [id])), /INVALID/);
  await asUser(db, mod, `select site_review_shop($1,'reject','Giấy phép chưa rõ',false)`, [id]);
  assert.equal((await asUser(db, owner, `select my_material_shop() s`)).rows[0].s.shop.status, 'rejected');
  await asUser(db, owner, `select update_shop_license('GP-99999','Sở KH&ĐT',null)`);                // nộp lại giấy phép → chờ duyệt
  assert.equal((await asUser(db, owner, `select my_material_shop() s`)).rows[0].s.shop.status, 'pending');
  await asUser(db, mod, `select site_review_shop($1,'approve',null,true)`, [id]);
  const pub = (await asAnon(db, `select * from public_material_shops`)).rows[0];
  assert.deepEqual([pub.name, pub.province, pub.license_verified, pub.phone, pub.address, pub.license_no], ['Đại lý Phân bón Hòa Bình', 'Long An', true, undefined, undefined, undefined]);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%đã được duyệt%'`, [owner])).rows[0].n, 1);
  assert.ok((await db.query(`select 1 from audit_events where action='site_shop_approve'`)).rows.length >= 1);
});

test('đăng vật tư: nhóm hợp lệ, không liên hệ; đăng lần đầu và sửa nội dung phải duyệt; sửa giá áp dụng ngay; ẩn/hiện, xóa nháp', async () => {
  const ctx = await setup();
  const { db, mod, owner, owner2, phan, rau } = ctx;
  const shop = await activeShop(ctx);
  assert.match(await expectError(save(db, owner, null, rau)), /INVALID/);                          // nhóm nông sản
  assert.match(await expectError(save(db, owner, null, null)), /INVALID/);
  assert.match(await expectError(save(db, owner, null, phan, { summary: 'liên hệ zalo' })), /CONTACT/);
  assert.match(await expectError(save(db, owner, null, phan, { image: 'http://x/a.png' })), /INVALID/);
  const m = (await save(db, owner, null, phan)).rows[0].r;
  assert.equal(m.status, 'draft');
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  assert.match(await expectError(save(db, owner2, m.id, phan)), /FORBIDDEN|NOT_FOUND/);           // người khác không sửa được
  await asUser(db, owner, `select shop_set_material_status($1,'submit')`, [m.id]);
  const q = (await asUser(db, mod, `select site_list_shop_materials('review') l`)).rows[0].l;
  assert.deepEqual([q.length, q[0].shop_name, q[0].category_name], [1, 'Đại lý Phân bón Hòa Bình', 'Phân bón']);
  assert.match(await expectError(asUser(db, mod, `select site_review_shop_material($1,'reject','')`, [m.id])), /INVALID/);
  await asUser(db, mod, `select site_review_shop_material($1,'reject','Thiếu thành phần chi tiết')`, [m.id]);
  const d = (await asUser(db, owner, `select shop_get_material($1) d`, [m.id])).rows[0].d;
  assert.deepEqual([d.status, d.review_note], ['draft', 'Thiếu thành phần chi tiết']);
  await save(db, owner, m.id, phan, { submit: true });
  await asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m.id]);
  const pub = (await asAnon(db, `select name, shop_id from site_materials`)).rows;
  assert.deepEqual([pub.length, pub[0].name, pub[0].shop_id === shop], [1, 'NPK 30-11-10', true]);
  await save(db, owner, m.id, phan, { price: 20000 });                                              // sửa giá: áp dụng ngay
  assert.equal(Number((await asAnon(db, `select price_from from site_materials`)).rows[0].price_from), 20000);
  const r = (await save(db, owner, m.id, phan, { summary: 'Phân NPK mới công thức', price: 20000 })).rows[0].r;   // sửa nội dung: phải duyệt lại
  assert.equal(r.status, 'review');
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  await asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m.id]);
  await asUser(db, owner, `select shop_set_material_status($1,'hide')`, [m.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  await asUser(db, owner, `select shop_set_material_status($1,'show')`, [m.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, owner, `select shop_delete_material($1)`, [m.id])), /INVALID/);       // đã đăng: chỉ ẩn
  const n = (await save(db, owner, null, phan, { name: 'MKP' })).rows[0].r;
  await asUser(db, owner, `select shop_delete_material($1)`, [n.id]);
  const mine = (await asUser(db, owner, `select my_material_shop() s`)).rows[0].s;
  assert.deepEqual([mine.materials.length, mine.materials[0].status], [1, 'published']);
});

test('tạm khóa gian hàng: mọi vật tư biến khỏi website, khôi phục thì hiện lại; không duyệt vật tư khi gian hàng chưa hoạt động', async () => {
  const ctx = await setup();
  const { db, mod, owner, phan } = ctx;
  const shop = await activeShop(ctx);
  const m = (await save(db, owner, null, phan, { submit: true })).rows[0].r;
  await asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, mod, `select site_review_shop($1,'suspend','',false)`, [shop])), /INVALID/);
  await asUser(db, mod, `select site_review_shop($1,'suspend','Bán hàng không đúng giấy phép',false)`, [shop]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  assert.equal((await asAnon(db, `select count(*)::int n from public_material_shops`)).rows[0].n, 0);
  assert.match(await expectError(save(db, owner, null, phan, { name: 'Mới' })), /FORBIDDEN/);
  const m2 = (await db.query(`insert into site_materials (shop_id, slug, name, status) values ($1,'x-1','Chờ','review') returning id`, [shop])).rows[0].id;
  assert.match(await expectError(asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m2])), /INVALID/);
  await asUser(db, mod, `select site_review_shop($1,'restore',null,false)`, [shop]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 1);
});

test('báo giá vật tư của gian hàng đi thẳng tới chủ gian hàng; liên hệ thật chỉ hiện sau đăng nhập', async () => {
  const ctx = await setup();
  const { db, mod, owner, owner2, buyer, phan } = ctx;
  await activeShop(ctx);
  const m = (await save(db, owner, null, phan, { submit: true })).rows[0].r;
  await asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m.id]);
  const slug = (await db.query(`select slug from site_materials where id=$1`, [m.id])).rows[0].slug;
  await asAnon(db, `select submit_quote_request('material',$1,'Nguyễn Văn An','0988000111',null,'200 kg','Cần giá 200 kg')`, [slug]);
  assert.equal((await asUser(db, owner, `select my_material_shop() s`)).rows[0].s.quotes_new, 1);
  const list = (await asUser(db, owner, `select my_shop_quotes(null) l`)).rows[0].l;
  assert.deepEqual([list.length, list[0].target_name, list[0].sender_phone], [1, 'NPK 30-11-10', '0988000111']);
  assert.equal((await asUser(db, owner2, `select my_shop_quotes(null) l`)).rows[0].l.length, 0);
  assert.match(await expectError(asUser(db, owner2, `select set_shop_quote($1,'handled',null)`, [list[0].id])), /FORBIDDEN/);
  await asUser(db, owner, `select set_shop_quote($1,'handled','Đã gọi lại')`, [list[0].id]);
  assert.equal((await asUser(db, owner, `select my_material_shop() s`)).rows[0].s.quotes_new, 0);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%báo giá vật tư%'`, [owner])).rows[0].n, 1);
  // liên hệ
  const shopSlug = (await db.query(`select slug from material_shops`)).rows[0].slug;
  assert.match(await expectError(asAnon(db, `select get_shop_contact($1)`, [shopSlug])), /permission|denied/i);
  const c = (await asUser(db, buyer, `select get_shop_contact($1) c`, [shopSlug])).rows[0].c;
  assert.deepEqual([c.phone, c.address], ['0912345678', 'Số 5 đường A']);
});

test('báo cáo gian hàng/vật tư: kiểm duyệt ẩn vật tư, tạm khóa gian hàng hoặc khóa chủ gian hàng; tổng quan có số liệu', async () => {
  const ctx = await setup();
  const { db, mod, owner, buyer, phan } = ctx;
  const shop = await activeShop(ctx);
  const m = (await save(db, owner, null, phan, { submit: true })).rows[0].r;
  await asUser(db, mod, `select site_review_shop_material($1,'approve',null)`, [m.id]);
  await asUser(db, buyer, `select report_abuse('material',$1,'Mô tả sai thành phần')`, [m.id]);
  await asUser(db, buyer, `select report_abuse('shop',$1,'Nghi bán hàng giả')`, [shop]);
  const ov = (await asUser(db, mod, `select site_overview() o`)).rows[0].o;
  assert.deepEqual([Number(ov.reports_open), Number(ov.shops_active), Number(ov.shops_pending)], [2, 1, 0]);
  const reps = (await asUser(db, mod, `select site_list_reports('open') l`)).rows[0].l;
  const rm = reps.find((r) => r.target_type === 'material'), rs = reps.find((r) => r.target_type === 'shop');
  assert.deepEqual([rm.target_label, rs.target_label], ['NPK 30-11-10', 'Đại lý Phân bón Hòa Bình']);
  await asUser(db, mod, `select site_handle_report($1,'handled','Đã ẩn vật tư','hide_material')`, [rm.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  assert.equal((await db.query(`select hidden_by from site_materials where id=$1`, [m.id])).rows[0].hidden_by, 'staff');
  assert.match(await expectError(asUser(db, owner, `select shop_set_material_status($1,'show')`, [m.id])), /INVALID/);   // chủ không tự hiện lại vật tư bị kiểm duyệt ẩn
  await asUser(db, mod, `select site_handle_report($1,'handled','Khóa gian hàng','suspend_shop')`, [rs.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_material_shops`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, mod, `select site_handle_report($1,'handled',null,'xoa')`, [rs.id])), /INVALID/);
  await asUser(db, buyer, `select report_abuse('user',$1,'Chủ gian hàng lừa đảo')`, [owner]);
  const r3 = (await asUser(db, mod, `select site_list_reports('open') l`)).rows[0].l[0];
  await asUser(db, mod, `select site_handle_report($1,'handled','Khóa tài khoản','block_user')`, [r3.id]);
  assert.match(await expectError(asUser(db, owner, `select my_material_shop()`)), /đã bị khóa/);
});
