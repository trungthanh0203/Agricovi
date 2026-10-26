import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0101: xuất kho tay (issue_kind) và chuyển kho (transfer_stock)

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LA = id('5', 1), LB = id('5', 2), MAT = id('6', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), worker = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$3,'Kho A'),($2,$3,'Kho B')`, [LA, LB, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Cám',(select id from units_of_measure where code='kg'))`, [MAT, org]);
  let n = 0;
  const receipt = (qty, lot, expiry) => asUser(db, owner, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,lot_no,lot_expiry)
     values ($1,$2,$3,$4,'receipt',$5,current_date,$6,$7)`, [id('7', ++n), org, LA, MAT, qty, lot, expiry]);
  const bal = async (loc) => Number((await db.query(`select coalesce(sum(quantity_delta),0) b from inventory_transactions where location_id=$1`, [loc])).rows[0].b);
  const lotBal = async (lot, loc) => Number((await db.query(`select coalesce(sum(t.quantity_delta),0) b from inventory_transactions t join material_lots l on l.id=t.lot_id where l.lot_no=$1 and t.location_id=$2`, [lot, loc])).rows[0].b);
  return { db, owner, worker, org, receipt, bal, lotBal };
}

test('chuyển kho: theo lô hạn gần nhất trước, tổng tồn không đổi; cho chuyển quá tồn; kiểm tra đầu vào và quyền', async () => {
  const { db, owner, worker, org, receipt, bal, lotBal } = await setup();
  await receipt(10, 'L1', '2027-01-01');
  await receipt(5, 'L2', '2027-06-01');
  const move = (who, qty, from = LA, to = LB) => asUser(db, who, `select transfer_stock($1,$2,$3,$4,$5,current_date,'Cho trại 2') id`, [org, MAT, from, to, qty]);

  await move(owner, 12);
  assert.deepEqual([await bal(LA), await bal(LB)], [3, 12]);
  assert.deepEqual([await lotBal('L1', LA), await lotBal('L1', LB), await lotBal('L2', LA), await lotBal('L2', LB)], [0, 10, 3, 2]);
  const t = (await db.query(`select count(*)::int n, count(distinct transfer_id)::int d, bool_and(txn_type='adjustment') adj from inventory_transactions where transfer_id is not null`)).rows[0];
  assert.deepEqual(t, { n: 4, d: 1, adj: true });
  assert.match((await db.query(`select reason from inventory_transactions where transfer_id is not null limit 1`)).rows[0].reason, /Kho A → Kho B — Cho trại 2/);

  await move(owner, 5); // chỉ còn 3 ở Kho A: vẫn chuyển, Kho A âm (cảnh báo, không chặn)
  assert.equal(await bal(LA) + await bal(LB), 15);
  assert.equal(await bal(LA), -2);

  assert.match(await expectError(move(owner, 0)), /INVALID_QTY/);
  assert.match(await expectError(move(owner, 1, LA, LA)), /INVALID_LOCATION/);
  assert.match(await expectError(move(worker, 1)), /row-level security|FORBIDDEN/);
});

test('xuất kho tay: cần quyền Kho và lý do; tự gắn lô hạn gần nhất; nhân viên không xuất tay được', async () => {
  const { db, owner, worker, org, receipt, lotBal } = await setup();
  await receipt(10, 'L1', '2027-01-01');
  await receipt(5, 'L2', '2027-06-01');
  const out = (who, n, kind, qty, reason) => asUser(db, who, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason,issue_kind)
     values ($1,$2,$3,$4,'issue',$5,current_date,$6,$7)`, [id('8', n), org, LA, MAT, qty, reason, kind]);

  await out(owner, 1, 'loss', -3, 'Chuột cắn bao');
  assert.equal(await lotBal('L1', LA), 7); // tự gắn lô hạn gần nhất
  assert.match(await expectError(out(owner, 2, 'sale', -1, ' ')), /REASON_REQUIRED/);
  assert.match(await expectError(out(worker, 3, 'loss', -1, 'Hỏng')), /FORBIDDEN/);
  assert.match(await expectError(out(owner, 4, 'khac', -1, 'Hỏng')), /check|issue_kind/i);
  assert.match(await expectError(asUser(db, owner, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason,issue_kind)
     values ($1,$2,$3,$4,'receipt',1,current_date,'xxx','loss')`, [id('8', 5), org, LA, MAT])), /check|inv_issue_kind/i); // chỉ loại 'issue'
});
