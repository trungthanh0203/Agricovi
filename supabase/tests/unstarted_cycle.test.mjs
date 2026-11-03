import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// D155: vụ chưa bắt đầu: đổi nhà màng giữ nhật ký; xóa vụ làm sai (hủy nhật ký + hoàn kho, xóa hẳn hoặc chuyển Đã hủy).
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), stranger = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const orgB = (await asUser(db, stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Phân khu'),($3,$2,'Nhà màng 1'),($4,$2,'Nhà màng 2'),($5,$6,'Khu hộ B')`, [id('2', 1), org, id('2', 2), id('2', 3), id('2', 4), orgB]);
  await db.query(`update production_areas set parent_id=$1 where id in ($2,$3)`, [id('2', 1), id('2', 2), id('2', 3)]);
  await db.query(`select set_config('agri.legacy_cycle_insert','on',false)`);
  const mk = (n, status = 'preparing') => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),$4,'Vụ ' || $5)`, [id('3', n), org, id('2', 2), status, String(n)]);
  await mk(1); await mk(2, 'active');
  return { db, owner, stranger, org, mk };
}

test('đổi nhà màng: chỉ vụ chuẩn bị, cùng cơ sở, đúng quyền; giữ nhật ký', async () => {
  const c = await setup();
  await c.db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at) values ($1,$2,$3,(select id from work_types limit 1),now())`, [id('a', 1), c.org, id('3', 1)]);
  await asUser(c.db, c.owner, `select change_cycle_area($1,$2)`, [id('3', 1), id('2', 3)]);
  assert.equal((await c.db.query(`select area_id from production_cycles where id=$1`, [id('3', 1)])).rows[0].area_id, id('2', 3));
  assert.equal((await c.db.query(`select count(*)::int n from activity_logs where cycle_id=$1 and voided_at is null`, [id('3', 1)])).rows[0].n, 1);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_area($1,$2)`, [id('3', 2), id('2', 3)])), /CYCLE_STARTED/);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_area($1,$2)`, [id('3', 1), id('2', 4)])), /INVALID_AREA/);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_area($1,$2)`, [id('3', 1), id('2', 1)])), /AREA_HAS_CELLS|FORBIDDEN|INVALID/);
  assert.match(await expectError(asUser(c.db, c.stranger, `select change_cycle_area($1,$2)`, [id('3', 1), id('2', 2)])), /FORBIDDEN/);
  await c.db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity) values ($1,$2,$3,now(),5)`, [id('d', 1), c.org, id('3', 1)]);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_area($1,$2)`, [id('3', 1), id('2', 2)])), /HAS_OUTPUT/);
});

test('xóa vụ làm sai: vụ trống xóa hẳn; có nhật ký + xuất kho thì hủy nhật ký, hoàn kho, chuyển Đã hủy; chặn vụ đã chạy/đã có chi phí', async () => {
  const c = await setup();
  const discard = (n, reason = 'chọn nhầm nhà màng') => asUser(c.db, c.owner, `select discard_unstarted_cycle($1,$2) r`, [id('3', n), reason]);
  await c.mk(5);
  assert.equal((await discard(5)).rows[0].r, 'deleted');
  assert.equal((await c.db.query(`select count(*)::int n from production_cycles where id=$1`, [id('3', 5)])).rows[0].n, 0);
  const unit = (await c.db.query(`select id from units_of_measure limit 1`)).rows[0].id;
  await c.db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [id('5', 1), c.org]);
  await c.db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân thử',$3)`, [id('6', 1), c.org, unit]);
  await c.db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date) values ($1,$2,$3,$4,'receipt',100,current_date)`, [id('7', 1), c.org, id('5', 1), id('6', 1)]);
  await c.db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at) values ($1,$2,$3,(select id from work_types limit 1),now())`, [id('a', 1), c.org, id('3', 1)]);
  await c.db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id,activity_log_id) values ($1,$2,$3,$4,'issue',-30,current_date,$5,$6)`, [id('7', 2), c.org, id('5', 1), id('6', 1), id('3', 1), id('a', 1)]);
  const stock = async () => Number((await c.db.query(`select sum(quantity_delta) q from inventory_transactions where organization_id=$1`, [c.org])).rows[0].q);
  assert.equal(await stock(), 70);
  assert.match(await expectError(discard(1, 'ab')), /REASON_REQUIRED/);
  assert.equal((await discard(1)).rows[0].r, 'cancelled');
  assert.equal(await stock(), 100);
  assert.equal((await c.db.query(`select status from production_cycles where id=$1`, [id('3', 1)])).rows[0].status, 'cancelled');
  assert.equal((await c.db.query(`select count(*)::int n from activity_logs where cycle_id=$1 and voided_at is null`, [id('3', 1)])).rows[0].n, 0);
  assert.match(await expectError(discard(2)), /CYCLE_STARTED/);
  await c.mk(6);
  await c.db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',100,current_date)`, [id('e', 1), c.org, id('3', 6)]);
  assert.match(await expectError(discard(6)), /HAS_FINANCE/);
  await c.mk(7);
  assert.match(await expectError(asUser(c.db, c.stranger, `select discard_unstarted_cycle($1,'xóa thử')`, [id('3', 7)])), /FORBIDDEN/);
});
