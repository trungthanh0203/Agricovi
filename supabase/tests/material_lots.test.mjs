import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0081 (D98, P1/M2): thuộc tính vật tư, số lô + hạn dùng, tự gắn lô theo FIFO, lô hết hạn, đảo kho theo lô.

const LOC = '50000000-0000-4000-8000-0000000000c1';
const MAT = '60000000-0000-4000-8000-0000000000c1';
const AREA = '20000000-0000-4000-8000-0000000000c1';
const CYC = '30000000-0000-4000-8000-0000000000c1';
const LOG = '40000000-0000-4000-8000-0000000000c1';
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (n) => `(current_date + ${n})`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id,material_group,active_ingredient,registration_no,manufacturer)
    values ($1,$2,'Cám heo thịt',(select id from units_of_measure where code='kg'),'feed','Đạm 18%','TACN-123','C.P.')`, [MAT, org]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at) values ($1,$2,$3,(select id from work_types limit 1),now())`, [LOG, org, CYC]);
  const receipt = (n, qty, lot, exp) => db.query(
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,lot_no,lot_expiry)
     values ($1,$2,$3,$4,'receipt',$5,current_date,$6,${exp === null ? 'null' : day(exp)})`, [tid(n), org, LOC, MAT, qty, lot]);
  const issue = (n, qty, extra = '', lotId = null, reason = null) => db.query(
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id,activity_log_id,lot_id,reason)
     values ($1,$2,$3,$4,'issue',$5,current_date,$6,${extra || 'null'},$7,$8)`, [tid(n), org, LOC, MAT, -qty, CYC, lotId, reason]);
  const lotOf = async (n) => (await db.query(`select l.lot_no from inventory_transactions t left join material_lots l on l.id=t.lot_id where t.id=$1`, [tid(n)])).rows[0].lot_no;
  return { db, owner, wk, org, receipt, issue, lotOf };
}

test('vật tư có nhóm, hoạt chất, số đăng ký, nhà sản xuất; nhóm sai bị từ chối', async () => {
  const { db, org } = await setup();
  const r = (await db.query(`select material_group, active_ingredient, registration_no, manufacturer from materials where id=$1`, [MAT])).rows[0];
  assert.deepEqual(r, { material_group: 'feed', active_ingredient: 'Đạm 18%', registration_no: 'TACN-123', manufacturer: 'C.P.' });
  assert.match(await expectError(db.query(`update materials set material_group='khac' where id=$1`, [MAT])), /check|material_group/i);
  void org;
});

test('nhập kho kèm lô tạo lô; cùng số lô dùng lại; hạn dùng khác nhau bị từ chối', async () => {
  const { db, receipt } = await setup();
  await receipt(1, 100, 'A', 90);
  await receipt(2, 50, 'a', 90);   // cùng lô (không phân biệt hoa thường)
  assert.equal((await db.query(`select count(*)::int n from material_lots`)).rows[0].n, 1);
  assert.match(await expectError(receipt(3, 10, 'A', 120)), /LOT_EXPIRY_MISMATCH/);
});

test('xuất dùng tự gắn lô hạn gần nhất trước (FIFO); lô không đủ thì chuyển lô kế; không lô nào đủ thì để trống', async () => {
  const { receipt, issue, lotOf } = await setup();
  await receipt(1, 100, 'B', 120);
  await receipt(2, 100, 'A', 90);
  await issue(10, 60);                          // lô A (hạn gần hơn)
  assert.equal(await lotOf(10), 'A');
  await issue(11, 60);                          // A còn 40 < 60 => sang B
  assert.equal(await lotOf(11), 'B');
  await issue(12, 80);                          // A 40, B 40: không lô nào đủ => để trống, KHÔNG chặn
  assert.equal(await lotOf(12), null);
});

test('lô đã hết hạn không được tự gắn; chỉ định lô hết hạn thì cần lý do', async () => {
  const { db, receipt, issue, lotOf } = await setup();
  await receipt(1, 100, 'OLD', -5);             // hạn đã qua 5 ngày
  await issue(10, 10);
  assert.equal(await lotOf(10), null);          // không tự gắn lô hết hạn
  const lot = (await db.query(`select id from material_lots where lot_no='OLD'`)).rows[0].id;
  assert.match(await expectError(issue(11, 10, '', lot)), /EXPIRED_LOT_REASON/);
  await issue(12, 10, '', lot, 'Xử lý tiêu hủy lô cũ');
  assert.equal(await lotOf(12), 'OLD');
});

test('hủy nhật ký đảo kho: bản đảo mang đúng lô; get_lot_status liệt kê lô sắp/đã hết hạn còn tồn', async () => {
  const { db, owner, org, receipt, issue } = await setup();
  await receipt(1, 100, 'SOON', 10);
  await receipt(2, 100, 'LATER', 200);
  await issue(10, 30, `'${LOG}'`);              // gắn nhật ký, lô SOON
  const rem = async () => (await asUser(db, owner, `select lot_no, remaining::float r from get_lot_status($1, 30)`, [org])).rows;
  assert.deepEqual(await rem(), [{ lot_no: 'SOON', r: 70 }]);   // LATER còn xa nên không liệt kê
  await db.query(`update activity_logs set voided_at=now(), void_reason='nhập nhầm' where id=$1`, [LOG]);
  assert.deepEqual(await rem(), [{ lot_no: 'SOON', r: 100 }]);  // trả lại đúng lô
});

test('mua có hóa đơn: dòng hàng kèm số lô và hạn dùng tạo lô như nhập kho', async () => {
  const { db, owner, org } = await setup();
  const partner = '10000000-0000-4000-8000-0000000000c1';
  await db.query(`insert into partners (id,organization_id,name) values ($1,$2,'Đại lý cám')`, [partner, org]);
  const lines = JSON.stringify([{ id: tid(40), location_id: LOC, material_id: MAT, quantity: 100, unit_cost: 12000, lot_no: 'HD-01', lot_expiry: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) }]);
  await asUser(db, owner, `select * from record_purchase($1,$2,$3,'HD1',current_date,null,1200000,null,$4::jsonb,0,'cash')`, [tid(41), org, partner, lines]);
  const r = (await db.query(`select l.lot_no, l.expiry_date is not null has_exp from inventory_transactions t join material_lots l on l.id=t.lot_id where t.id=$1`, [tid(40)])).rows[0];
  assert.deepEqual(r, { lot_no: 'HD-01', has_exp: true });
});
