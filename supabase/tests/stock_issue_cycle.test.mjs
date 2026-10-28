import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0122: xuất kho cho vụ (issue_kind = 'cycle') không cần nhật ký.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LOC = id('5', 1), MAT = id('6', 1), FEED = id('6', 2), CYC = id('3', 1), CYC2 = id('3', 2), AREA = id('2', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), worker = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho A')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg')),($3,$2,'Cám heo',(select id from units_of_measure where code='kg'))`, [MAT, org, FEED]);
  await db.query(`update materials set material_group='feed' where id=$1`, [FEED]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng 1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,plant_count) values ($1,$2,$3,(select id from crop_types limit 1),'active',50),($4,$2,$3,(select id from crop_types limit 1),'ended',10)`, [CYC, org, AREA, CYC2]);
  let n = 0;
  const receipt = (mat, qty, cost) => asUser(db, owner, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ($1,$2,$3,$4,'receipt',$5,$6,current_date)`, [id('7', ++n), org, LOC, mat, qty, cost]);
  const issue = (who, mat, qty, cyc, reason = null) => asUser(db, who, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,issue_kind,cycle_id,reason,source)
     values ($1,$2,$3,$4,'issue',$5,current_date,'cycle',$6,$7,'online') returning reason`, [id('8', ++n), org, LOC, mat, -qty, cyc, reason]);
  return { db, owner, worker, other, org, receipt, issue };
}

test('xuất cho vụ: chỉ cần chọn vụ (lý do tự ghi), vào giá vốn vật tư của Tổng kết vụ; người không có quyền, vụ đã kết thúc, vụ cơ sở khác bị chặn', async () => {
  const { db, owner, worker, org, receipt, issue } = await setup();
  await receipt(MAT, 100, 20000);
  const r = (await issue(owner, MAT, 10, CYC)).rows[0].reason;
  assert.match(r, /^Xuất cho vụ/);
  assert.equal((await issue(owner, MAT, 5, CYC, 'Bón thúc lần 2')).rows[0].reason, 'Bón thúc lần 2');
  const s = (await asUser(db, owner, `select get_cycle_summary($1) s`, [CYC])).rows[0].s;
  assert.equal(Number(s.material_used_cost), 15 * 20000); // 15 kg x giá vốn 20.000
  assert.match(await expectError(issue(worker, MAT, 1, CYC)), /FORBIDDEN|row-level security/);
  assert.match(await expectError(issue(owner, MAT, 1, CYC2)), /CYCLE_CLOSED/);
  assert.match(await expectError(issue(owner, MAT, 1, null)), /INVALID_CYCLE/);
  // các lý do khác vẫn bắt buộc ghi lý do và không được gắn vụ
  assert.match(await expectError(asUser(db, owner, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,issue_kind,reason,source) values ($1,$2,$3,$4,'issue',-1,current_date,'loss','','online')`, [id('9', 1), org, LOC, MAT])), /REASON_REQUIRED/);
  assert.match(await expectError(asUser(db, owner, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,issue_kind,reason,cycle_id,source) values ($1,$2,$3,$4,'issue',-1,current_date,'loss','chuột cắn',$5,'online')`, [id('9', 2), org, LOC, MAT, CYC])), /check|inv_issue_cycle_kind|violates/i);
});

test('cám xuất cho vụ (không qua nhật ký) được tính vào cám của Tăng trọng/FCR', async () => {
  const { db, owner, receipt, issue } = await setup();
  await receipt(FEED, 200, 12000);
  await issue(owner, FEED, 40, CYC);
  const g = (await asUser(db, owner, `select get_cycle_growth($1) g`, [CYC])).rows[0].g;
  assert.equal(g.feed.stock_by_date.length, 1);
  assert.equal(Number(g.feed.stock_by_date[0].kg), 40); // cám lấy từ kho theo ngày xuất cho vụ
});
