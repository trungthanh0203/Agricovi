import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0048 (W5, D68): giỏ hàng, đơn đặt hàng nông sản, sửa tin giao thương.
async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), owner = await addUser(db, 3), buyer = await addUser(db, 6), buyer2 = await addUser(db, 7), staff = await addUser(db, 8), unverified = await addUser(db, 9);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  await db.query(`insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name) values ($1,$2,'0900000008','0900000008@sdt.agricovi.com','Công')`, [staff, org]);
  const prof = (await asUser(db, owner, `insert into business_profiles (organization_id, display_name, description, province, location_precision)
    values ($1,'Vườn Thành Công','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP','Long An','district') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  const l1 = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from) values ($1,$2,'Dưa lưới Taki','kg',40000) returning id`, [prof, org])).rows[0].id;
  const l2 = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from) values ($1,$2,'Dưa leo','kg',15000) returning id`, [prof, org])).rows[0].id;
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  for (const [u, n] of [[buyer, 'Người Mua'], [buyer2, 'Người Mua Hai'], [unverified, 'Chưa Xác Nhận']]) await asUser(db, u, `select ensure_buyer_profile($1,'individual',null)`, [n]);
  await db.query(`update auth.users set email_confirmed_at = now() where id = any ($1::uuid[])`, [[owner, buyer, buyer2, admin]]);
  const addr = (await asUser(db, buyer, `select save_buyer_address(null,'Nhà','Nguyễn An','0912345678','Hồ Chí Minh','Quận 1','12 Lê Lợi',true) id`)).rows[0].id;
  return { db, admin, owner, buyer, buyer2, staff, unverified, org, prof, l1, l2, addr };
}
async function place(c, items = [[c.l1, 10], [c.l2, 5]]) {
  for (const [l, q] of items) await asUser(c.db, c.buyer, `select cart_set_item($1,$2)`, [l, q]);
  return (await asUser(c.db, c.buyer, `select checkout_cart($1,$2,null,'Giao buổi sáng') id`, [c.prof, c.addr])).rows[0].id;
}
const detail = async (c, u, id) => (await asUser(c.db, u, `select get_order($1) o`, [id])).rows[0].o;
async function quote(c, id) {
  const o = await detail(c, c.owner, id);
  const items = o.items.map((i) => ({ id: i.id, unit_price: i.unit_price, quantity: i.quantity }));
  await asUser(c.db, c.owner, `select quote_order($1,$2::jsonb,30000,'Giao trong 2 ngày',null)`, [id, JSON.stringify(items)]);
}

test('giỏ hàng: cần tài khoản người mua; không đặt của chính mình; hàng hết không thêm được; đặt về 0 là xóa', async () => {
  const c = await setup();
  const { db, buyer, owner, staff, l1, l2 } = c;
  assert.match(await expectError(asAnon(db, `select cart_get()`)), /permission|denied|AUTH/i);
  assert.match(await expectError(asUser(db, staff, `select cart_set_item($1,1)`, [l1])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select cart_set_item($1,1)`, [l1])), /INVALID/);
  await asUser(db, buyer, `select cart_set_item($1,3)`, [l1]);
  await asUser(db, buyer, `select cart_set_item($1,4)`, [l1]);              // đặt lại thì ghi đè, không nhân đôi
  await asUser(db, buyer, `select cart_set_item($1,2)`, [l2]);
  assert.equal((await asUser(db, buyer, `select cart_count() n`)).rows[0].n, 2);
  const g = (await asUser(db, buyer, `select cart_get() g`)).rows[0].g;
  assert.deepEqual([g.groups.length, g.groups[0].items.length, Number(g.groups[0].items[0].quantity)], [1, 2, 4]);
  await db.query(`update public_products set supply_status='out_of_stock' where listing_id=$1`, [l2]);
  const g2 = (await asUser(db, buyer, `select cart_get() g`)).rows[0].g;
  assert.equal(g2.groups[0].items.find((i) => i.listing_id === l2).sellable, false);
  assert.match(await expectError(asUser(db, buyer, `select checkout_cart($1,$2,null,null)`, [c.prof, c.addr])), /INVALID/);   // có hàng hết
  await asUser(db, buyer, `select cart_set_item($1,0)`, [l2]);
  assert.equal((await asUser(db, buyer, `select cart_count() n`)).rows[0].n, 1);
  assert.equal((await asUser(c.db, c.buyer2, `select cart_count() n`)).rows[0].n, 0);       // giỏ riêng từng người
  assert.match(await expectError(asUser(db, buyer, `select * from cart_items`)), /permission|denied/i);
});

test('đặt hàng: cần email xác nhận và địa chỉ của mình; chụp giá lúc đặt; giỏ được dọn; không lộ cho người khác', async () => {
  const c = await setup();
  const { db, buyer, buyer2, unverified, prof, addr, l1, l2 } = c;
  await asUser(db, unverified, `select cart_set_item($1,1)`, [l1]);
  assert.match(await expectError(asUser(db, unverified, `select checkout_cart($1,$2,null,null)`, [prof, addr])), /VERIFY/);
  await asUser(db, buyer, `select cart_set_item($1,10)`, [l1]);
  assert.match(await expectError(asUser(db, buyer, `select checkout_cart($1,$2,null,null)`, [prof, '00000000-0000-4000-8000-000000000001'])), /INVALID/);
  assert.match(await expectError(asUser(db, buyer, `select checkout_cart($1,$2,'2020-01-01',null)`, [prof, addr])), /INVALID/);
  assert.match(await expectError(asUser(db, buyer, `select checkout_cart($1,$2,null,'gọi 0912345678')`, [prof, addr])), /CONTACT/);
  await asUser(db, buyer, `select cart_set_item($1,5)`, [l2]);
  const id = (await asUser(db, buyer, `select checkout_cart($1,$2,null,'Giao sáng') id`, [prof, addr])).rows[0].id;
  assert.equal((await asUser(db, buyer, `select cart_count() n`)).rows[0].n, 0);
  const o = await detail(c, c.buyer, id);
  assert.deepEqual([o.status, o.side, o.items.length, o.recipient, o.total], ['placed', 'buyer', 2, 'Nguyễn An', 40000 * 10 + 15000 * 5]);
  assert.deepEqual(o.actions, ['cancel']);
  assert.equal(o.supplier_contact, null);                                              // chưa chốt: chưa lộ liên hệ
  await db.query(`update product_listings set price_from = 99999 where id=$1`, [l1]);
  await db.query(`update public_products set snapshot = jsonb_set(snapshot,'{price_from}','99999') where listing_id=$1`, [l1]);
  assert.equal(Number((await detail(c, c.buyer, id)).items.find((i) => i.listing_id === l1).unit_price), 40000);   // giá đã chụp không đổi
  assert.match(await expectError(asUser(db, buyer2, `select get_order($1)`, [id])), /NOT_FOUND/);
  assert.equal((await asUser(db, buyer2, `select list_orders('buyer') l`)).rows[0].l.length, 0);
  assert.equal((await asUser(db, c.owner, `select list_orders('seller') l`)).rows[0].l.length, 1);
  assert.equal((await asUser(db, buyer, `select list_orders('seller') l`)).rows[0].l.length, 0);   // không phải nhà cung cấp
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='order'`, [c.owner])).rows[0].n, 1);
  assert.match(await expectError(asUser(db, buyer, `select * from web_orders`)), /permission|denied/i);
  assert.match(await expectError(asUser(db, c.admin, `select * from web_order_items`)), /permission|denied/i);       // quản trị nền tảng không đọc đơn
});

test('báo giá → đồng ý → chuẩn bị → giao → nhận: đúng người, đúng bước; số lượng chốt không vượt đặt; có nhật ký', async () => {
  const c = await setup();
  const { db, buyer, buyer2, owner } = c;
  const id = await place(c);
  assert.match(await expectError(asUser(db, buyer, `select order_action($1,'accept')`, [id])), /INVALID/);        // chưa báo giá
  assert.match(await expectError(asUser(db, buyer2, `select quote_order($1,null,0,null,null)`, [id])), /FORBIDDEN/);
  const o = await detail(c, owner, id);
  assert.deepEqual(o.actions, ['quote', 'reject']);
  assert.match(await expectError(asUser(db, owner, `select quote_order($1,$2::jsonb,0,null,null)`, [id, JSON.stringify([{ id: o.items[0].id, quantity: 999 }])])), /INVALID/);
  await asUser(db, owner, `select quote_order($1,$2::jsonb,30000,'Giao trong 2 ngày',null)`, [id, JSON.stringify([{ id: o.items[0].id, unit_price: 42000, quantity: 8 }, { id: o.items[1].id, unit_price: 15000 }])]);
  const q = await detail(c, buyer, id);
  assert.deepEqual([q.status, Number(q.total), q.actions], ['quoted', 42000 * 8 + 15000 * 5 + 30000, ['accept', 'cancel']]);
  assert.match(await expectError(asUser(db, buyer, `select order_action($1,'receive')`, [id])), /INVALID/);
  assert.match(await expectError(asUser(db, owner, `select order_action($1,'prepare')`, [id])), /INVALID/);       // chưa được đồng ý
  await asUser(db, buyer, `select order_action($1,'accept')`, [id]);
  assert.match(await expectError(asUser(db, buyer, `select order_action($1,'accept')`, [id])), /INVALID/);        // bấm lặp
  assert.match(await expectError(asUser(db, owner, `select quote_order($1,null,0,null,null)`, [id])), /INVALID/);   // đã chốt: không đổi giá nữa
  for (const a of ['prepare', 'ship', 'deliver']) await asUser(db, owner, `select order_action($1,$2)`, [id, a]);
  assert.match(await expectError(asUser(db, owner, `select order_action($1,'seller_cancel','vì lý do nào đó')`, [id])), /INVALID/);   // đã giao: không hủy được
  await asUser(db, owner, `select set_order_payment($1,'paid','Đã nhận tiền mặt')`, [id]);
  await asUser(db, buyer, `select order_action($1,'receive')`, [id]);
  const f = await detail(c, buyer, id);
  assert.deepEqual([f.status, f.payment_status, f.actions], ['completed', 'paid', []]);
  assert.deepEqual(f.events.map((e) => e.kind), ['created', 'quoted', 'accept', 'prepare', 'ship', 'deliver', 'payment', 'receive']);
  assert.match(await expectError(db.query(`update web_order_events set note='x'`)), /APPEND_ONLY/);
  assert.match(await expectError(asUser(db, buyer, `select set_order_payment($1,'unpaid',null)`, [id])), /FORBIDDEN/);   // người mua không tự ghi thanh toán
  assert.ok((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='order'`, [buyer])).rows[0].n >= 5);
});

test('hủy/từ chối: người mua hủy trước khi chuẩn bị; nhà cung cấp từ chối phải có lý do; hủy xong thì đóng', async () => {
  const c = await setup();
  const { db, buyer, owner } = c;
  const a = await place(c, [[c.l1, 3]]);
  await asUser(db, buyer, `select order_action($1,'cancel','Đổi ý')`, [a]);
  assert.equal((await detail(c, buyer, a)).status, 'cancelled');
  assert.match(await expectError(asUser(db, owner, `select order_action($1,'prepare')`, [a])), /INVALID/);
  const b = await place(c, [[c.l2, 3]]);
  assert.match(await expectError(asUser(db, owner, `select order_action($1,'reject','')`, [b])), /INVALID/);
  await asUser(db, owner, `select order_action($1,'reject','Hết hàng tuần này')`, [b]);
  const r = await detail(c, buyer, b);
  assert.deepEqual([r.status, r.cancel_reason], ['rejected', 'Hết hàng tuần này']);
  const d = await place(c, [[c.l1, 2]]);
  await quote(c, d);
  await asUser(db, buyer, `select order_action($1,'accept')`, [d]);
  await asUser(db, owner, `select order_action($1,'prepare')`, [d]);
  assert.match(await expectError(asUser(db, buyer, `select order_action($1,'cancel')`, [d])), /INVALID/);        // đang chuẩn bị: người mua không tự hủy
  await asUser(db, owner, `select order_action($1,'seller_cancel','Hỏng lô hàng, xin lỗi')`, [d]);
  assert.equal((await detail(c, buyer, d)).status, 'cancelled');
});

test('đã chốt thì người mua thấy liên hệ nhà cung cấp; đơn giao quá 7 ngày tự hoàn tất; mua lại thêm vào giỏ', async () => {
  const c = await setup();
  const { db, buyer, owner } = c;
  const id = await place(c);
  await quote(c, id);
  await asUser(db, buyer, `select order_action($1,'accept')`, [id]);
  assert.ok('supplier_contact' in (await detail(c, buyer, id)));
  for (const a of ['prepare', 'ship', 'deliver']) await asUser(db, owner, `select order_action($1,$2)`, [id, a]);
  await db.query(`update web_orders set delivered_at = now() - interval '8 days' where id=$1`, [id]);
  const f = await detail(c, buyer, id);
  assert.equal(f.status, 'completed');
  assert.ok(f.events.some((e) => e.kind === 'auto_completed' && e.role === 'system'));
  assert.equal((await asUser(db, buyer, `select reorder($1) n`, [id])).rows[0].n, 2);
  assert.equal((await asUser(db, buyer, `select cart_count() n`)).rows[0].n, 2);
  assert.match(await expectError(asUser(db, c.buyer2, `select reorder($1)`, [id])), /NOT_FOUND/);
});

test('sửa tin giao thương: chỉ chủ tin; tin đã đóng không sửa; sửa nội dung tin đang hiển thị thì duyệt lại, sửa số lượng/giá thì không; chặn liên hệ', async () => {
  const c = await setup();
  const { db, buyer, buyer2, admin } = c;
  const cat = (await db.query(`select id from product_categories where slug='rau-cu-qua'`)).rows[0].id;
  const create = () => asUser(db, buyer, `select create_trade_post('buy',$1,'Dưa lưới',100,'kg',30000,40000,'Long An','Đức Hòa',null,14,'{}','Cần dưa loại 1','{}',null) r`, [cat]);
  const id = (await create()).rows[0].r.id;
  const upd = (u, id2, over = {}) => asUser(db, u, `select update_trade_post($1,$2,$3,$4,'kg',$5,40000,'Long An','Đức Hòa',null,14,'{}',$6,'{}') r`,
    [id2, cat, over.product ?? 'Dưa lưới', over.qty ?? 100, over.min ?? 30000, over.desc ?? 'Cần dưa loại 1']);
  assert.match(await expectError(upd(buyer2, id)), /NOT_FOUND/);
  assert.match(await expectError(upd(buyer, id, { desc: 'gọi 0912345678' })), /CONTACT/);
  assert.match(await expectError(upd(buyer, id, { qty: 0 })), /INVALID/);
  assert.equal((await upd(buyer, id, { qty: 150 })).rows[0].r.status, 'pending');                  // đang chờ duyệt: sửa tự do
  await db.query(`update trade_posts set status='published' where id=$1`, [id]);
  assert.equal((await upd(buyer, id, { qty: 200, min: 31000 })).rows[0].r.status, 'published');   // chỉ đổi số lượng/giá: giữ nguyên
  assert.equal((await upd(buyer, id, { qty: 200, min: 31000, desc: 'Cần dưa loại 2 đẹp' })).rows[0].r.status, 'pending');   // đổi chữ: duyệt lại
  const t = (await db.query(`select title, quantity from trade_posts where id=$1`, [id])).rows[0];
  assert.deepEqual([t.title.startsWith('Cần mua Dưa lưới 200'), Number(t.quantity)], [true, 200]);
  await db.query(`update trade_posts set status='rejected' where id=$1`, [id]);
  assert.equal((await upd(buyer, id)).rows[0].r.status, 'pending');                                // sửa tin bị từ chối → gửi lại
  await asUser(db, buyer, `select close_trade_post($1)`, [id]);
  assert.match(await expectError(upd(buyer, id)), /INVALID/);
  void admin;
});

test('tìm kiếm trả thêm gian hàng vật tư đang hoạt động', async () => {
  const c = await setup();
  const r = (await asAnon(c.db, `select site_search('thành công') r`)).rows[0].r;
  assert.ok(Array.isArray(r.shops) && Array.isArray(r.profiles) && r.profiles.length === 1);
});
