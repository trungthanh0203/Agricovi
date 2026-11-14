import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0201 (mục 13 lát 1): bảng kê thu mua nông sản. Thông tin người bán là dữ liệu cá nhân: cần đồng ý, che số giấy tờ khi xem danh sách, ghi audit.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2), staff = await addUser(db, 3), farmer2 = await addUser(db, 4), outsider = await addUser(db, 5);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ An') id`)).rows[0].id;
  const hh2 = (await asUser(db, farmer2, `select create_organization('household','Hộ Bình') id`)).rows[0].id;
  const alien = (await asUser(db, outsider, `select create_organization('household','Hộ ngoài') id`)).rows[0].id;
  for (const [u, h, n] of [[2, hh, 1], [4, hh2, 2]]) {
    const inv = (await asUser(db, boss, `select invite_household($1,$2) id`, [coop, `u${u}@test.local`])).rows[0].id;
    await asUser(db, u === 2 ? farmer : farmer2, `select accept_coop_invitation($1,$2)`, [inv, h]);
  }
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [coop, staff]);
  const rc = (n, household, qty, price, date = 'current_date') => db.query(
    `insert into procurement_receipts (id,cooperative_org_id,household_org_id,receipt_date,quantity,unit_price,amount) values ($1,$2,$3,${date},$4::numeric,$5::bigint,round($4::numeric*$5::bigint)::bigint)`, [id("7", n), coop, household, qty, price]);
  const pay = (n, receipt, amt, method) => db.query(
    `insert into procurement_payments (id,receipt_id,cooperative_org_id,household_org_id,paid_on,amount,method) select $1,$2,cooperative_org_id,household_org_id,current_date,$3,$4 from procurement_receipts where id=$2`, [id('8', n), receipt, amt, method]);
  const seller = (u, household, o = {}) => asUser(db, u, `select set_procurement_seller($1,$2,$3,$4,$5,$6,$7,$8) r`,
    [coop, household, o.name ?? 'Nguyễn Văn An', o.idn ?? '079123456789', o.addr ?? 'Ấp 3, xã Tân Phú, Đồng Nai', o.phone ?? '0901234567', o.consent ?? true, o.note ?? 'Đồng ý trực tiếp ngày 10/11/2026']);
  return { db, boss, farmer, staff, farmer2, outsider, coop, hh, hh2, alien, rc, pay, seller };
}

test('lưu thông tin người bán: chỉ HTX có quyền, hộ phải thuộc HTX, bắt buộc có đồng ý, số giấy tờ đúng 9 hoặc 12 số', async () => {
  const c = await setup();
  assert.match(await expectError(c.seller(c.staff, c.hh)), /FORBIDDEN/);                       // nhân viên chưa có quyền HTX sửa
  assert.match(await expectError(c.seller(c.farmer, c.hh)), /FORBIDDEN/);                      // hộ không tự lưu cho HTX
  assert.match(await expectError(c.seller(c.boss, c.alien)), /NOT_MEMBER/);
  assert.match(await expectError(c.seller(c.boss, c.hh, { consent: false })), /CONSENT_REQUIRED/);
  assert.match(await expectError(c.seller(c.boss, c.hh, { idn: '12345' })), /CCCD gồm 12 số/);
  assert.match(await expectError(c.seller(c.boss, c.hh, { name: 'A' })), /họ tên/);
  assert.match(await expectError(c.seller(c.boss, c.hh, { addr: 'ab' })), /địa chỉ/);
  assert.match(await expectError(c.seller(c.boss, c.hh, { phone: 'abc' })), /điện thoại/);
  const r = (await c.seller(c.boss, c.hh)).rows[0].r;
  assert.equal(r.id_masked, '********6789');
  await c.seller(c.boss, c.hh, { name: 'Nguyễn Văn An (sửa)' });                                   // lưu lại = cập nhật, không nhân đôi
  assert.equal((await c.db.query(`select count(*)::int n from procurement_sellers`)).rows[0].n, 1);
  assert.match(await expectError(asUser(c.db, c.boss, `select * from procurement_sellers`)), /permission denied/i);   // chỉ đọc qua hàm
});

test('danh sách hộ kèm tình trạng thông tin: số giấy tờ bị che; người ngoài HTX không xem', async () => {
  const c = await setup();
  await c.seller(c.boss, c.hh);
  const list = (await asUser(c.db, c.boss, `select get_procurement_sellers($1) r`, [c.coop])).rows[0].r;
  assert.equal(list.length, 2);
  const a = list.find((x) => x.household_org_id === c.hh), b = list.find((x) => x.household_org_id === c.hh2);
  assert.deepEqual([a.has_profile, a.id_masked, a.full_name], [true, '********6789', 'Nguyễn Văn An']);
  assert.ok(!JSON.stringify(list).includes('079123456789'));                                    // không lộ số đầy đủ
  assert.deepEqual([b.has_profile, b.id_masked], [false, null]);
  assert.match(await expectError(asUser(c.db, c.outsider, `select get_procurement_sellers($1)`, [c.coop])), /FORBIDDEN/);
});

test('bảng kê: mỗi phiếu chưa hủy một dòng trong khoảng ngày, kèm người bán đủ số giấy tờ và tiền mặt đã trả; hộ chưa có thông tin thì seller null', async () => {
  const c = await setup();
  await c.seller(c.boss, c.hh);
  await c.rc(1, c.hh, 100, 25000);                                  // 2.500.000
  await c.rc(2, c.hh, 400, 30000);                                  // 12.000.000
  await c.rc(3, c.hh2, 50, 20000);                                  // hộ Bình chưa có thông tin người bán
  await c.rc(4, c.hh, 10, 10000, `current_date - 100`);             // ngoài khoảng ngày
  await c.rc(5, c.hh, 77, 10000);
  await c.db.query(`update procurement_receipts set voided_at = now(), void_reason = 'nhập nhầm' where id=$1`, [id('7', 5)]);   // đã hủy: không vào bảng kê
  await c.pay(1, id('7', 2), 7000000, 'cash');
  await c.pay(2, id('7', 2), 5000000, 'transfer');
  const st = (u) => asUser(c.db, u, `select get_purchase_statement($1, current_date - 30, current_date) r`, [c.coop]);
  assert.match(await expectError(st(c.staff)), /FORBIDDEN/);        // có dữ liệu cá nhân nên chỉ quyền HTX sửa
  assert.match(await expectError(st(c.farmer)), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.boss, `select get_purchase_statement($1, current_date, current_date - 1)`, [c.coop])), /INVALID_DATE/);
  assert.match(await expectError(asUser(c.db, c.boss, `select get_purchase_statement($1, current_date - 500, current_date)`, [c.coop])), /13 tháng/);
  const rows = (await st(c.boss)).rows[0].r.rows;
  assert.equal(rows.length, 3);
  const big = rows.find((x) => x.receipt_id === id('7', 2));
  assert.deepEqual([Number(big.amount), Number(big.paid), Number(big.cash_paid), big.seller.id_number, big.seller.full_name], [12000000, 12000000, 7000000, '079123456789', 'Nguyễn Văn An']);
  assert.equal(rows.find((x) => x.receipt_id === id('7', 3)).seller, null);
  assert.equal(Number(rows.find((x) => x.receipt_id === id('7', 1)).cash_paid), 0);
  // mỗi lần dựng bảng kê và lưu thông tin đều có audit, không ghi số giấy tờ đầy đủ
  const audit = (await c.db.query(`select action, after::text a from audit_events where entity in ('procurement_seller','procurement_receipts') order by id`)).rows;
  assert.ok(audit.some((x) => x.action === 'set_seller'));
  assert.ok(audit.some((x) => x.action === 'view_purchase_statement'));
  assert.ok(!audit.some((x) => x.a && x.a.includes('079123456789')));
});

test('xóa thông tin người bán (rút lại đồng ý): chỉ HTX có quyền; sau xóa bảng kê không còn số giấy tờ; có audit', async () => {
  const c = await setup();
  await c.seller(c.boss, c.hh);
  await c.rc(1, c.hh, 10, 10000);
  assert.match(await expectError(asUser(c.db, c.staff, `select delete_procurement_seller($1,$2)`, [c.coop, c.hh])), /FORBIDDEN/);
  await asUser(c.db, c.boss, `select delete_procurement_seller($1,$2)`, [c.coop, c.hh]);
  assert.equal((await c.db.query(`select count(*)::int n from procurement_sellers`)).rows[0].n, 0);
  const rows = (await asUser(c.db, c.boss, `select get_purchase_statement($1, current_date - 30, current_date) r`, [c.coop])).rows[0].r.rows;
  assert.equal(rows[0].seller, null);
  assert.ok((await c.db.query(`select 1 from audit_events where action='delete_seller'`)).rows.length === 1);
});
