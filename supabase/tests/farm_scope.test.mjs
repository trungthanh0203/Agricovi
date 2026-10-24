import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0065 (D83): phạm vi theo trang trại. Người được giao trang trại nào chỉ thấy/ghi vụ, nhật ký, thu hoạch của trang trại đó.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA_A = id('2', 1), AREA_B = id('2', 2), CYC_A = id('3', 1), CYC_B = id('3', 2);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  for (const [a, n] of [[AREA_A, 'Vườn A'], [AREA_B, 'Vườn B']]) await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,$3)`, [a, org, n]);
  for (const [c, a] of [[CYC_A, AREA_A], [CYC_B, AREA_B]]) await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [c, org, a]);
  for (const [n, c] of [[1, CYC_A], [2, CYC_B]]) {
    await db.query(`insert into activity_logs (id, organization_id, cycle_id, work_type_id, performed_at, data) values ($1,$2,$3,(select id from work_types limit 1),now(),'{}')`, [id('a', n), org, c]);
    await db.query(`insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity) values ($1,$2,$3,now(),10)`, [id('d', n), org, c]);
  }
  return { db, org, owner, mgr, wk, other };
}
const count = async (db, u, tbl) => (await asUser(db, u, `select count(*)::int n from ${tbl}`)).rows[0].n;
const setAreas = (c, who, areas) => asUser(c.db, c.owner, `select set_member_areas($1,$2,$3::uuid[])`, [c.org, who, areas]);

test('mặc định thấy mọi trang trại; giao trang trại thì chỉ thấy phần được giao; một người làm nhiều trang trại', async () => {
  const c = await setup();
  for (const t of ['production_areas', 'production_cycles', 'activity_logs', 'harvest_records']) assert.equal(await count(c.db, c.wk, t), 2, t);
  await setAreas(c, c.wk, [AREA_A]);
  for (const t of ['production_areas', 'production_cycles', 'activity_logs', 'harvest_records']) assert.equal(await count(c.db, c.wk, t), 1, t);
  assert.equal((await asUser(c.db, c.wk, `select id from production_cycles`)).rows[0].id, CYC_A);
  await setAreas(c, c.wk, [AREA_A, AREA_B]);
  assert.equal(await count(c.db, c.wk, 'production_cycles'), 2);
  await setAreas(c, c.wk, [AREA_B]);
  assert.equal((await asUser(c.db, c.wk, `select id from production_cycles`)).rows[0].id, CYC_B);
  await setAreas(c, c.wk, null); // trả về tất cả
  assert.equal(await count(c.db, c.wk, 'production_cycles'), 2);
});

test('chỉ ghi được vào trang trại được giao; quản lý bị giới hạn không tạo/sửa vụ ngoài phạm vi', async () => {
  const c = await setup();
  await setAreas(c, c.wk, [AREA_A]);
  const ins = (cyc, n) => asUser(c.db, c.wk, `insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity, created_by) values ($1,$2,$3,now(),5,$4)`, [id('d', n), c.org, cyc, c.wk]);
  await ins(CYC_A, 7);
  assert.match(await expectError(ins(CYC_B, 8)), /row-level security/);
  await setAreas(c, c.mgr, [AREA_A]);
  const r = (await asUser(c.db, c.mgr, `select can_manage_cycle($1) a, can_manage_cycle($2) b, can_create_cycle($3,$4) c, can_create_cycle($3,$5) d`, [CYC_A, CYC_B, c.org, AREA_A, AREA_B])).rows[0];
  assert.deepEqual([r.a, r.b, r.c, r.d], [true, false, true, false]);
});

test('chủ luôn thấy tất cả; chỉ chủ giao trang trại; không giao trang trại của cơ sở khác', async () => {
  const c = await setup();
  assert.match(await expectError(asUser(c.db, c.mgr, `select set_member_areas($1,$2,array[$3]::uuid[])`, [c.org, c.wk, AREA_A])), /FORBIDDEN/);
  assert.match(await expectError(setAreas(c, c.owner, [AREA_A])), /INVALID_TARGET/);
  const ob = (await c.db.query(`select id from organizations where name='Cơ sở B'`)).rows[0].id;
  await c.db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn lạ')`, [id('2', 9), ob]);
  assert.match(await expectError(setAreas(c, c.wk, [id('2', 9)])), /INVALID_AREA/);
  await setAreas(c, c.wk, [AREA_A]);
  assert.equal(await count(c.db, c.owner, 'production_cycles'), 2);
});
