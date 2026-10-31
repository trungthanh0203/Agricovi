import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// D149: Phiếu thu mua HTX–hộ: HTX lập và ghi trả tiền; hộ chỉ xem; công nợ hai phía khớp nhau; hủy kèm lý do.
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2), outsider = await addUser(db, 3), boss2 = await addUser(db, 4);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const coop2 = (await asUser(db, boss2, `select create_organization('cooperative','HTX B') id`)).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv, hh]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn hộ')`, [id('2', 1), hh]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),'active','Vụ riêng')`, [id('3', 1), hh, id('2', 1)]);
  return { db, boss, farmer, outsider, boss2, coop, coop2, hh };
}
const create = (c, who, n, o = {}) => asUser(c.db, who, `select create_procurement_receipt($1,$2,$3,$4,null,current_date,$5,$6,$7,$8,null) r`,
  [id('7', n), o.coop ?? c.coop, c.hh, o.cycle === undefined ? id('3', 1) : o.cycle, o.qty ?? 100, o.price ?? 25000, o.due ?? null, o.inv ?? null]);

test('lập phiếu: chỉ HTX có quyền, hộ phải thuộc HTX, thành tiền = khối lượng × đơn giá, lập lại cùng mã không nhân đôi', async () => {
  const c = await setup();
  await create(c, c.boss, 1, { qty: 120.5, price: 24000 });
  assert.equal(Number((await c.db.query(`select amount from procurement_receipts`)).rows[0].amount), 2892000);
  await create(c, c.boss, 1, { qty: 120.5, price: 24000 });   // lặp: trả lại bản cũ
  assert.equal((await c.db.query(`select count(*)::int n from procurement_receipts`)).rows[0].n, 1);
  assert.match(await expectError(create(c, c.farmer, 2)), /FORBIDDEN/);          // hộ không tự lập phiếu bán cho HTX
  assert.match(await expectError(create(c, c.boss2, 3, { coop: c.coop2 })), /NOT_MEMBER/);   // hộ không thuộc HTX B
  assert.match(await expectError(create(c, c.boss, 4, { qty: 0 })), /INVALID_QUANTITY/);
  assert.match(await expectError(create(c, c.boss, 5, { cycle: id('3', 9) })), /INVALID_CYCLE/);
});

test('trả tiền và công nợ hai phía: không trả vượt, hộ chỉ xem, hủy phải kèm lý do và không hủy phiếu đã có tiền', async () => {
  const c = await setup();
  await create(c, c.boss, 1, { qty: 100, price: 25000, due: '2099-01-01' });   // 2.500.000
  const ledger = async (who, org, as) => (await asUser(c.db, who, `select get_procurement_ledger($1,$2,false) l`, [org, as])).rows[0].l;
  let h = await ledger(c.farmer, c.hh, 'household');
  let k = await ledger(c.boss, c.coop, 'coop');
  assert.deepEqual([h.length, h[0].partner_name, Number(h[0].remaining), h[0].status], [1, 'HTX A', 2500000, 'ok']);
  assert.deepEqual([k.length, k[0].partner_name, Number(k[0].remaining)], [1, 'Hộ A', 2500000]);

  const pay = (who, n, amt) => asUser(c.db, who, `select pay_procurement($1,$2,$3,current_date,'transfer','đợt 1') p`, [id('8', n), id('7', 1), amt]);
  await pay(c.boss, 1, 1000000);
  await pay(c.boss, 1, 1000000);                                                   // lặp cùng mã: không ghi hai lần
  assert.match(await expectError(pay(c.boss, 2, 1600000)), /OVERPAY/);              // còn 1.500.000
  assert.match(await expectError(pay(c.farmer, 3, 100000)), /FORBIDDEN/);          // hộ không tự ghi trả
  h = await ledger(c.farmer, c.hh, 'household');
  k = await ledger(c.boss, c.coop, 'coop');
  assert.equal(Number(h[0].remaining), 1500000);
  assert.equal(Number(k[0].paid), 1000000);
  assert.equal(Number((await ledger(c.boss, c.coop, 'coop')).length), 1);

  // người ngoài không xem được sổ của HTX/hộ này
  assert.match(await expectError(asUser(c.db, c.outsider, `select get_procurement_ledger($1,'coop',true)`, [c.coop])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.outsider, `select get_procurement_ledger($1,'household',true)`, [c.hh])), /FORBIDDEN/);
  assert.equal((await asUser(c.db, c.outsider, `select count(*)::int n from procurement_receipts`)).rows[0].n, 0);
  assert.equal((await asUser(c.db, c.farmer, `select count(*)::int n from procurement_receipts`)).rows[0].n, 1);

  // hủy: phiếu đã có tiền thì hủy tiền trước; cần lý do
  assert.match(await expectError(asUser(c.db, c.boss, `select void_procurement_receipt($1,'sai')`, [id('7', 1)])), /REASON_REQUIRED|HAS_PAYMENTS/);
  assert.match(await expectError(asUser(c.db, c.boss, `select void_procurement_receipt($1,'nhập nhầm khối lượng')`, [id('7', 1)])), /HAS_PAYMENTS/);
  await asUser(c.db, c.boss, `select void_procurement_payment($1,'ghi nhầm số tiền')`, [id('8', 1)]);
  assert.equal(Number((await ledger(c.farmer, c.hh, 'household'))[0].remaining), 2500000);
  await asUser(c.db, c.boss, `select void_procurement_receipt($1,'nhập nhầm khối lượng')`, [id('7', 1)]);
  assert.equal((await ledger(c.farmer, c.hh, 'household')).length, 0);
  // không ghi trả vào phiếu đã hủy
  assert.match(await expectError(pay(c.boss, 9, 1000)), /BILL_INVALID/);
});

test('hộ do HTX tạo (tài khoản Hộ nhập liệu) cũng chỉ xem sổ bán cho HTX của mình', async () => {
  const c = await setup();
  // hộ do HTX tạo + người của hộ có chức vụ Hộ nhập liệu
  const mgd = (await asUser(c.db, c.boss, `select create_member_household($1,'Hộ do HTX tạo') id`, [c.coop])).rows[0].id;
  const worker = await addUser(c.db, 6);
  await c.db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [mgd, worker]);
  const pos = (await asUser(c.db, c.boss, `select ensure_household_position($1) id`, [mgd])).rows[0].id;
  await asUser(c.db, c.boss, `select set_member_position($1,$2,$3)`, [mgd, worker, pos]);
  await asUser(c.db, c.boss, `select create_procurement_receipt($1,$2,$3,null,null,current_date,50,20000,null,null,null)`, [id('7', 20), c.coop, mgd]);
  const mine = (await asUser(c.db, worker, `select get_procurement_ledger($1,'household',true) l`, [mgd])).rows[0].l;
  assert.equal(mine.length, 1); assert.equal(Number(mine[0].total_amount), 1000000);
  assert.match(await expectError(asUser(c.db, worker, `select get_procurement_ledger($1,'household',true)`, [c.hh])), /FORBIDDEN/);
});
