import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0207 (D170): vật nuôi mới xuất một phần thì chưa tính giá thành/kg; xuất hết hoặc kết thúc vụ thì tính.

const id = (n) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup(status = 'active') {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Chuồng') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,created_by,plant_count,start_date) values ($1,$2,$3,(select id from crop_types limit 1),$4,$5,100,current_date - 100)`, [cyc, org, area, status, owner]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',10000000,current_date - 50)`, [id(1), org, cyc]);
  return { db, owner, org, cyc };
}
const harvest = (db, org, cyc, n, kg, heads) => db.query(
  `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,unit,unit_count) values ($1,$2,$3,now() - interval '1 day',$4,'kg',$5)`, [id(100 + n), org, cyc, kg, heads]);
const summary = async (db, owner, cyc) => (await asUser(db, owner, `select get_cycle_summary($1) j`, [cyc])).rows[0].j;

test('xuất một phần: chưa có giá thành/kg; còn con thì partial_out = true', async () => {
  const { db, owner, org, cyc } = await setup();
  await harvest(db, org, cyc, 1, 4000, 40);
  const s = await summary(db, owner, cyc);
  assert.equal(s.partial_out, true); assert.equal(s.heads_out, 40); assert.equal(s.heads_left, 60);
  assert.equal(s.cost_per_kg, null);
  const st = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles[0];
  assert.equal(st.partial_out, true); assert.equal(st.cost_per_kg, null); assert.equal(st.profit_per_kg, null);
});

test('chết/loại thải và xuất hết thì tính giá thành/kg; vụ đã kết thúc luôn tính', async () => {
  const { db, owner, org, cyc } = await setup();
  await harvest(db, org, cyc, 1, 6000, 60);
  await db.query(`insert into cycle_count_events (id,cycle_id,organization_id,event_date,kind,quantity) values ($1,$2,$3,current_date - 5,'dead',5)`, [id(50), cyc, org]);
  let s = await summary(db, owner, cyc);
  assert.equal(s.heads_left, 35); assert.equal(s.partial_out, true);
  await harvest(db, org, cyc, 2, 3500, 35);
  s = await summary(db, owner, cyc);
  assert.equal(s.partial_out, false); assert.equal(s.heads_left, 0);
  assert.ok(Number(s.cost_per_kg) > 0);
  // vụ đã kết thúc dù còn con: vẫn tính
  const e = await setup('ended');
  await harvest(e.db, e.org, e.cyc, 1, 4000, 40);
  const s2 = await summary(e.db, e.owner, e.cyc);
  assert.equal(s2.partial_out, false); assert.ok(Number(s2.cost_per_kg) > 0);
});

test('cây trồng không ghi số con ở phiếu thu hoạch: không bị coi là xuất dở', async () => {
  const { db, owner, org, cyc } = await setup();
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,unit) values ($1,$2,$3,now(),500,'kg')`, [id(120), org, cyc]);
  const s = await summary(db, owner, cyc);
  assert.equal(s.partial_out, false); assert.ok(Number(s.cost_per_kg) > 0);
});
