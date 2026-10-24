import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0059 (G2-5 R4, D78): ghi doanh thu từ đơn website; chỉ đọc bảng đơn của website; đúng quyền, đúng cơ sở, đúng trạng thái, không ghi trùng.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1);
const CYC = id('3', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const buyer = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  const prof = (await db.query(`insert into business_profiles (organization_id, display_name, description, province, location_precision) values ($1,'Hộ A','Mô tả đủ dài cho hồ sơ','Long An','district') returning id`, [org])).rows[0].id;
  const listing = (await db.query(`insert into product_listings (business_profile_id, organization_id, name, unit, cycle_id) values ($1,$2,'Dưa lưới Taki','kg',$3) returning id`, [prof, org, CYC])).rows[0].id;
  await db.query(`insert into partners (id, organization_id, name, is_supplier, is_customer) values ($1,$2,'Anh Nam',false,true)`, [id('7', 1), org]);
  return { db, org, owner, mgr, stranger, buyer, prof, listing };
}

async function order(c, n, status = 'delivered', payment = 'unpaid') {
  const oid = id('e', n);
  await c.db.query(`insert into web_orders (id, code, buyer_id, organization_id, profile_id, supplier_name, status, payment_status, recipient, recipient_phone, province, address, shipping_fee)
                    values ($1,$2,$3,$4,$5,'Hộ A',$6,$7,'Anh Nam','0987654321','Lâm Đồng','12 Đường A',30000)`, [oid, `DH-${n}`, c.buyer, c.org, c.prof, status, payment]);
  await c.db.query(`insert into web_order_items (order_id, listing_id, name, unit, unit_price, quantity, agreed_quantity, position) values ($1,$2,'Dưa lưới Taki','kg',40000,100,90,0)`, [oid, c.listing]);
  return oid;
}
const sell = (c, u, oid, sale, { amount = 3600000, paid = 0, partner = id('7', 1), cycle = CYC, org = null, qty = 90 } = {}) =>
  asUser(c.db, u, `select * from record_order_sale($1,$2,$3,$4,vn_today(),$5,$6,null,$7,'DH',null,$8,'cash')`, [oid, sale, org ?? c.org, cycle, qty, amount, partner, paid]);

test('bối cảnh đơn: cơ sở, vụ gợi ý từ sản phẩm niêm yết, đơn vị; người ngoài không xem được', async () => {
  const c = await setup();
  const oid = await order(c, 1);
  const ctx = (await asUser(c.db, c.owner, `select app_order_context($1) j`, [oid])).rows[0].j;
  assert.equal(ctx.organization_id, c.org);
  assert.equal(ctx.items[0].cycle_id, CYC);
  assert.equal(ctx.items[0].listing_unit, 'kg');
  assert.equal(Number(ctx.items[0].agreed_quantity), 90);
  assert.deepEqual(ctx.sales, []);
  await expectError(asUser(c.db, c.stranger, `select app_order_context($1) j`, [oid]), /NOT_FOUND|không tìm thấy/i);
});

test('danh sách đơn theo cơ sở: chỉ đơn của cơ sở người dùng xử lý được', async () => {
  const c = await setup();
  const oid = await order(c, 1);
  const map = (await asUser(c.db, c.owner, `select app_seller_order_orgs() j`)).rows[0].j;
  assert.equal(map[oid], c.org);
  assert.deepEqual((await asUser(c.db, c.stranger, `select app_seller_order_orgs() j`)).rows[0].j, {});
});

test('ghi doanh thu từ đơn đã giao: lần bán + lần thu đầu + liên kết đơn; công nợ phải thu đúng', async () => {
  const c = await setup();
  const oid = await order(c, 1, 'delivered', 'partial');
  const r = await sell(c, c.owner, oid, id('9', 1), { amount: 3600000, paid: 1000000 });
  assert.equal(r.rows[0].partner_id, id('7', 1));
  assert.equal(Number(r.rows[0].amount), 3600000);
  assert.equal((await c.db.query(`select count(*)::int n from sale_receipts where sale_id = $1`, [id('9', 1)])).rows[0].n, 1);
  const recv = (await asUser(c.db, c.owner, `select get_receivables($1,true) j`, [c.org])).rows[0].j;
  assert.equal(Number(recv[0].remaining), 2600000);
  const ctx = (await asUser(c.db, c.owner, `select app_order_context($1) j`, [oid])).rows[0].j;
  assert.equal(ctx.sales.length, 1);
  assert.equal(ctx.sales[0].sale_id, id('9', 1));
});

test('gọi lặp cùng mã không ghi hai lần; mã đã dùng cho việc khác bị từ chối', async () => {
  const c = await setup();
  const oid = await order(c, 1, 'completed');
  await sell(c, c.owner, oid, id('9', 1), { paid: 3600000 });
  await sell(c, c.owner, oid, id('9', 1), { paid: 3600000 });
  assert.equal((await c.db.query(`select count(*)::int n from sales_records`)).rows[0].n, 1);
  assert.equal((await c.db.query(`select count(*)::int n from sale_receipts`)).rows[0].n, 1);
  assert.equal((await c.db.query(`select count(*)::int n from web_order_sales`)).rows[0].n, 1);
  // một lần bán thường (không qua đơn) không bị "mượn" mã
  await asUser(c.db, c.owner, `select * from record_sale($1,$2,$3,vn_today(),10,1000,null,null,null,null,0,'cash')`, [id('9', 5), c.org, CYC]);
  const oid2 = await order(c, 2, 'completed');
  await expectError(sell(c, c.owner, oid2, id('9', 5)), /đã được dùng cho việc khác/);
});

test('chỉ ghi khi đơn đã giao hoặc hoàn tất; đúng cơ sở; vụ phải thuộc cơ sở', async () => {
  const c = await setup();
  const oid = await order(c, 1, 'preparing');
  await expectError(sell(c, c.owner, oid, id('9', 1)), /Chỉ ghi doanh thu khi đơn đã giao/);
  const done = await order(c, 2, 'delivered');
  const org2 = (await asUser(c.db, c.stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await expectError(sell(c, c.stranger, done, id('9', 2), { org: org2, partner: null }), /NOT_FOUND|không tìm thấy đơn hàng của cơ sở này/i);
  await expectError(sell(c, c.owner, done, id('9', 3), { cycle: id('3', 99) }), /Vụ được chọn không thuộc/);
});

test('quyền: cần xử lý được website VÀ sửa được Doanh thu', async () => {
  const c = await setup();
  const oid = await order(c, 1);
  await expectError(sell(c, c.mgr, oid, id('9', 1)), /FORBIDDEN|quyền sửa mục Doanh thu/); // quản lý xử lý được website, chỉ xem Doanh thu
  await expectError(sell(c, c.stranger, oid, id('9', 1)), /FORBIDDEN/);
  await asUser(c.db, c.owner, `select set_member_permissions($1,$2,$3::jsonb)`, [c.org, c.mgr, JSON.stringify({ sales: 'edit', website: 'edit' })]); // D83: quản lý cần cả quyền website
  assert.equal((await sell(c, c.mgr, oid, id('9', 1))).rows.length, 1);
  assert.equal((await asUser(c.db, c.stranger, `select count(*)::int n from web_order_sales`)).rows[0].n, 0);
});

test('một đơn nhiều vụ: ghi được nhiều lần bán, mỗi lần một mã', async () => {
  const c = await setup();
  const oid = await order(c, 1);
  const cyc2 = id('3', 2);
  await c.db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [cyc2, c.org, AREA]);
  await sell(c, c.owner, oid, id('9', 1), { amount: 2000000, qty: 50 });
  await sell(c, c.owner, oid, id('9', 2), { amount: 1600000, qty: 40, cycle: cyc2 });
  const ctx = (await asUser(c.db, c.owner, `select app_order_context($1) j`, [oid])).rows[0].j;
  assert.equal(ctx.sales.length, 2);
});
