import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0075 (D94, T1): thông tin giống và diện tích của vụ; năng suất, chi phí, lãi theo diện tích.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000e1';
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), mgr = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['manager']::member_role[])`, [org, wk, mgr]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [CYC, org, area, tpl]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',1000000,'2026-09-05')`, [id('b', 1), org, CYC]);
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity) values ($1,$2,$3,'2026-09-20 07:00+07',1100,100)`, [id('d', 1), org, CYC]);
  await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values ($1,$2,$3,'2026-09-21',1000,5000000)`, [id('c', 1), org, CYC]);
  return { db, owner, wk, mgr, org };
}
const stat = async (c, u) => (await asUser(c.db, u, `select get_cycles_stats($1) r`, [c.org])).rows[0].r.cycles[0];
const setInfo = (c, u, area = 500, plants = 1200) => asUser(c.db, u, `select set_cycle_info($1,$2,$3,'Kim Cô Nương','Công ty giống A','LOT-2026-07','2026-08-20','2026-09-01')`, [CYC, area, plants]);

test('đặt thông tin giống và diện tích: quản lý vụ đặt được; giá trị sai bị từ chối; nhân viên không đặt được', async () => {
  const c = await setup();
  await setInfo(c, c.owner);
  const r = (await c.db.query(`select planted_area_m2::float a, plant_count p, variety_name v, seed_lot l, sowing_date::text s, planting_date::text t from production_cycles where id=$1`, [CYC])).rows[0];
  assert.deepEqual([r.a, r.p, r.v, r.l, r.s, r.t], [500, 1200, 'Kim Cô Nương', 'LOT-2026-07', '2026-08-20', '2026-09-01']);
  assert.match(await expectError(setInfo(c, c.owner, 0)), /INVALID_AMOUNT/);
  assert.match(await expectError(setInfo(c, c.owner, 500, -1)), /INVALID_AMOUNT/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_info($1,500,1200,null,null,null,'2026-09-05','2026-09-01')`, [CYC])), /INVALID_DATE/);
  assert.match(await expectError(setInfo(c, c.wk)), /FORBIDDEN/);
  await asUser(c.db, c.owner, `select set_cycle_info($1,null,null,null,null,null,null,null)`, [CYC]); // bỏ hết
  assert.equal((await c.db.query(`select planted_area_m2 a from production_cycles where id=$1`, [CYC])).rows[0].a, null);
});

test('năng suất, chi phí, doanh thu, lãi theo 1.000 m², kg mỗi cây, mật độ; chưa nhập diện tích thì không có', async () => {
  const c = await setup();
  let s = await stat(c, c.owner);
  assert.deepEqual([s.area_m2, s.yield_per_1000m2, s.cost_per_1000m2], [null, null, null]);
  await setInfo(c, c.owner, 500, 1200);
  s = await stat(c, c.owner);
  // thu hoạch sau hao hụt 1.000 kg trên 500 m²; chi 1.000.000; thu 5.000.000
  assert.deepEqual([Number(s.area_m2), s.plant_count, s.variety, Number(s.density_per_1000m2)], [500, 1200, 'Kim Cô Nương', 2400]);
  assert.deepEqual([Number(s.yield_per_1000m2), Number(s.kg_per_plant)], [2000, 0.83]);
  assert.deepEqual([Number(s.cost_per_1000m2), Number(s.revenue_per_1000m2), Number(s.profit_per_1000m2)], [2000000, 10000000, 8000000]);
});

test('quyền: quản lý chưa có quyền Tổng kết thấy năng suất nhưng không thấy chi phí và lãi theo diện tích', async () => {
  const c = await setup();
  await setInfo(c, c.owner);
  const m = await stat(c, c.mgr);
  assert.equal(Number(m.yield_per_1000m2), 2000);
  assert.deepEqual([m.cost_per_1000m2, m.profit_per_1000m2, m.revenue_per_1000m2], [null, null, null]);
});
