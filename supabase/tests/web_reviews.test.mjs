import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0049 (W7, D69): đánh giá nhà cung cấp, kiểm duyệt đánh giá, hộp tin website cho app.
async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), mod = await addUser(db, 2), owner = await addUser(db, 3), buyer = await addUser(db, 6), buyer2 = await addUser(db, 7), staff = await addUser(db, 8), unverified = await addUser(db, 9);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','moderator',true)`);
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
  return { db, admin, mod, owner, buyer, buyer2, staff, unverified, org, prof, l1, l2, addr };
}

async function completed(c, buyer = c.buyer) {
  await asUser(c.db, buyer, `select cart_set_item($1,5)`, [c.l1]);
  const id = (await asUser(c.db, buyer, `select checkout_cart($1,$2,null,null) id`, [c.prof, c.addr])).rows[0].id;
  const o = (await asUser(c.db, c.owner, `select get_order($1) o`, [id])).rows[0].o;
  await asUser(c.db, c.owner, `select quote_order($1,$2::jsonb,0,null,null)`, [id, JSON.stringify(o.items.map((i) => ({ id: i.id, unit_price: 40000 })))]);
  await asUser(c.db, buyer, `select order_action($1,'accept')`, [id]);
  for (const a of ['prepare', 'ship', 'deliver']) await asUser(c.db, c.owner, `select order_action($1,$2)`, [id, a]);
  await asUser(c.db, buyer, `select order_action($1,'receive')`, [id]);
  return id;
}

test('đánh giá: chỉ người mua của đơn đã hoàn tất, một lần, có lọc liên hệ; công khai không lộ danh tính', async () => {
  const c = await setup();
  const { db, buyer, buyer2, owner, prof } = c;
  await asUser(db, buyer, `select cart_set_item($1,1)`, [c.l1]);
  const open = (await asUser(db, buyer, `select checkout_cart($1,$2,null,null) id`, [prof, c.addr])).rows[0].id;
  assert.match(await expectError(asUser(db, buyer, `select review_order($1,5,'tốt')`, [open])), /INVALID/);       // đơn chưa hoàn tất
  const id = await completed(c);
  assert.equal((await asUser(db, buyer, `select get_order_review($1) r`, [id])).rows[0].r.can_review, true);
  assert.match(await expectError(asUser(db, buyer2, `select review_order($1,5,'tốt')`, [id])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, owner, `select review_order($1,5,'tự khen')`, [id])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, buyer, `select review_order($1,6,null)`, [id])), /INVALID/);
  assert.match(await expectError(asUser(db, buyer, `select review_order($1,1,'')`, [id])), /INVALID/);          // sao thấp phải có lý do
  assert.match(await expectError(asUser(db, buyer, `select review_order($1,5,'gọi 0912345678')`, [id])), /CONTACT/);
  await asUser(db, buyer, `select review_order($1,4,'Dưa ngọt, giao đúng hẹn')`, [id]);
  assert.match(await expectError(asUser(db, buyer, `select review_order($1,5,'lần nữa')`, [id])), /INVALID/);
  assert.equal((await asUser(db, buyer, `select get_order_review($1) r`, [id])).rows[0].r.can_review, false);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%đánh giá%'`, [owner])).rows[0].n, 1);
  const pub = (await asAnon(db, `select * from public_reviews`)).rows;
  assert.deepEqual([pub.length, pub[0].stars, pub[0].buyer_label, pub[0].order_id, pub[0].buyer_id], [1, 4, 'Khách Mua', undefined, undefined]);
  const rt = (await asAnon(db, `select * from public_supplier_ratings`)).rows[0];
  assert.deepEqual([Number(rt.avg_stars), rt.review_count], [4, 1]);
  assert.match(await expectError(asAnon(db, `select * from supplier_reviews`)), /permission|denied/i);
});

test('quá 30 ngày kể từ khi hoàn tất thì không đánh giá nữa', async () => {
  const c = await setup();
  const id = await completed(c);
  await c.db.query(`update web_orders set completed_at = now() - interval '31 days' where id=$1`, [id]);
  assert.match(await expectError(asUser(c.db, c.buyer, `select review_order($1,5,null)`, [id])), /INVALID/);
  assert.equal((await asUser(c.db, c.buyer, `select get_order_review($1) r`, [id])).rows[0].r.can_review, false);
});

test('trả lời một lần; báo không đúng; kiểm duyệt ẩn/hiện có lý do; ẩn thì biến khỏi công khai', async () => {
  const c = await setup();
  const { db, buyer, owner, mod, buyer2 } = c;
  const id = await completed(c);
  const rid = (await asUser(db, buyer, `select review_order($1,1,'Hàng không như mô tả') id`, [id])).rows[0].id;
  assert.match(await expectError(asUser(db, buyer2, `select reply_review($1,'x ok')`, [rid])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, buyer, `select reply_review($1,'tự trả lời')`, [rid])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, owner, `select reply_review($1,'xem http://x.vn')`, [rid])), /CONTACT/);
  await asUser(db, owner, `select reply_review($1,'Xin lỗi bạn, chúng tôi sẽ đổi hàng')`, [rid]);
  assert.match(await expectError(asUser(db, owner, `select reply_review($1,'trả lời lần hai')`, [rid])), /INVALID/);
  assert.equal((await asAnon(db, `select reply from public_reviews`)).rows[0].reply, 'Xin lỗi bạn, chúng tôi sẽ đổi hàng');
  assert.equal((await asUser(db, owner, `select my_shop_reviews() l`)).rows[0].l.length, 1);
  assert.equal((await asUser(db, buyer2, `select my_shop_reviews() l`)).rows[0].l.length, 0);
  assert.match(await expectError(asUser(db, owner, `select flag_review($1,'ngắn')`, [rid])), /INVALID/);
  await asUser(db, owner, `select flag_review($1,'Khách này chưa từng nhận hàng của chúng tôi')`, [rid]);
  assert.match(await expectError(asUser(db, owner, `select site_list_reviews('flagged')`)), /FORBIDDEN/);
  assert.equal((await asUser(db, mod, `select site_list_reviews('flagged') l`)).rows[0].l.length, 1);
  assert.match(await expectError(asUser(db, mod, `select site_set_review_hidden($1,true,'')`, [rid])), /INVALID/);
  await asUser(db, mod, `select site_set_review_hidden($1,true,'Nhận xét không phù hợp quy tắc')`, [rid]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_reviews`)).rows[0].n, 0);
  assert.equal((await asAnon(db, `select count(*)::int n from public_supplier_ratings`)).rows[0].n, 0);
  assert.ok((await db.query(`select 1 from audit_events where action='site_review_hide'`)).rows.length >= 1);
  await asUser(db, mod, `select site_set_review_hidden($1,false,null)`, [rid]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_reviews`)).rows[0].n, 1);
});

test('hộp tin website cho app: đúng số đơn, báo giá, đánh giá chưa trả lời; chỉ người quản lý cơ sở xem được', async () => {
  const c = await setup();
  const { db, buyer, buyer2, owner, org } = c;
  assert.deepEqual((await asUser(db, owner, `select org_web_inbox($1) i`, [org])).rows[0].i, { orders_new: 0, orders_todo: 0, quotes_new: 0, reviews_unreplied: 0 });
  await asUser(db, buyer, `select cart_set_item($1,1)`, [c.l1]);
  await asUser(db, buyer, `select checkout_cart($1,$2,null,null)`, [c.prof, c.addr]);
  await db.query(`insert into quote_requests (kind, organization_id, profile_id, sender_name, sender_email, message) values ('profile',$1,$2,'Khách','a@b.vn','Cần báo giá')`, [org, c.prof]);
  const id = await completed(c);
  await asUser(db, buyer, `select review_order($1,5,'Rất tốt')`, [id]);
  const i = (await asUser(db, owner, `select org_web_inbox($1) i`, [org])).rows[0].i;
  assert.deepEqual([i.orders_new, i.orders_todo, i.quotes_new, i.reviews_unreplied], [1, 1, 1, 1]);
  assert.match(await expectError(asUser(db, buyer2, `select org_web_inbox($1)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asAnon(db, `select org_web_inbox($1)`, [org])), /permission|denied|FORBIDDEN/i);
});
