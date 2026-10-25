import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { growthSummary } from '../../apps/app/src/lib/growthLogic.ts';

// Migration 0088 (D100, P3 gọn): số liệu thô cho ADG / FCR và phần tính ở app.

const AREA = '20000000-0000-4000-8000-0000000000b9';
const CYC = '30000000-0000-4000-8000-0000000000b9';
const LOC = '50000000-0000-4000-8000-0000000000b9';
const FEED = '60000000-0000-4000-8000-0000000000b9';
const BAG = '60000000-0000-4000-8000-0000000000ba';
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lid = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,plant_count) values ($1,$2,$3,(select id from crop_types limit 1),'active',100)`, [CYC, org, AREA]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id,material_group) values ($1,$3,'Cám heo vỗ béo',(select id from units_of_measure where code='kg'),'feed'), ($2,$3,'Cám bao',(select id from units_of_measure where code='bag'),'feed')`, [FEED, BAG, org]);
  const wtW = (await db.query(`insert into work_types (organization_id, code, name, field_schema) values ($1,'can_heo','Cân heo','[]') returning id`, [org])).rows[0].id;
  const weigh = (n, at, pigs, avg) => db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,data) values ($1,$2,$3,$4,$5,$6::jsonb)`, [lid(n), org, CYC, wtW, at, JSON.stringify({ pigs, avg_kg: avg })]);
  const issue = (n, mat, kg, date) => db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id) values ($1,$2,$3,$4,'issue',$5,$6,$7)`, [tid(n), org, LOC, mat, -kg, date, CYC]);
  const growth = (u) => asUser(db, u, `select get_cycle_growth($1) g`, [CYC]).then((r) => r.rows[0].g);
  return { db, owner, wk, other, org, weigh, issue, growth };
}

test('lấy các lần cân và cám đã xuất theo ngày; đơn vị lạ báo cờ; hủy nhật ký thì bỏ lần cân; người ngoài không xem', async () => {
  const { db, owner, wk, other, weigh, issue, growth } = await setup();
  await weigh(1, '2026-11-01T03:00:00Z', 100, 30);
  await weigh(2, '2026-12-01T03:00:00Z', 20, 55.5);
  await weigh(3, '2026-12-02T03:00:00Z', 20, 60);
  await db.query(`update activity_logs set voided_at=now(), void_reason='cân nhầm' where id=$1`, [lid(3)]);
  await issue(10, FEED, 800, '2026-11-10');
  await issue(11, FEED, 700, '2026-11-20');
  await issue(12, BAG, 5, '2026-11-21');   // đơn vị "bao" không quy được kg
  const g = await growth(owner);
  assert.deepEqual(g.weighings.map((w) => [w.date, w.pigs, w.avg_kg]), [['2026-11-01', 100, 30], ['2026-12-01', 20, 55.5]]);
  assert.deepEqual(g.feed.stock_by_date.map((x) => [x.date, x.kg]), [['2026-11-10', 800], ['2026-11-20', 700], ['2026-11-21', 0]]);
  assert.equal(g.feed.other_unit, true);
  assert.equal(g.feed.can_view, true);
  assert.equal((await growth(wk)).feed.can_view, false);            // nhân viên không xem kho: không thấy cám từ kho
  assert.deepEqual((await growth(wk)).feed.stock_by_date, []);
  assert.match(await expectError(asUser(db, other, `select get_cycle_growth($1)`, [CYC])), /NOT_FOUND/);
});

test('ADG và FCR tính từ lần cân đầu/cuối và cám dùng giữa hai lần cân; thiếu dữ liệu thì không bịa số', () => {
  const raw = { weighings: [{ date: '2026-11-01', pigs: 100, avg_kg: 30 }, { date: '2026-12-01', pigs: 20, avg_kg: 55.5 }],
    feed: { can_view: true, other_unit: false, logs_by_date: [], stock_by_date: [{ date: '2026-11-01', kg: 500 }, { date: '2026-11-10', kg: 800 }, { date: '2026-11-20', kg: 700 }, { date: '2026-12-05', kg: 900 }] } };
  const cycle = { plant_count: 100 };
  const events = [{ event_date: '2026-11-15', kind: 'dead', quantity: 4 }, { event_date: '2026-11-25', kind: 'culled', quantity: 1 }];
  const g = growthSummary(raw, cycle, events, [{ harvested_at: '2026-12-20T03:00:00Z', quantity: 5000, unit_count: 50 }], true);
  assert.equal(g.days, 30);
  assert.equal(g.adgG, 850);                 // (55,5 − 30) × 1000 ÷ 30
  assert.equal(g.heads, 95);                 // 100 − 4 − 1 (phiếu xuất 20/12 sau ngày cân cuối nên chưa trừ)
  assert.equal(g.feedBetweenKg, 1500);       // 800 + 700 (cám ngày 1/11 là của ngày cân đầu, ngày 5/12 sau lần cân cuối)
  assert.equal(g.fcr, 0.62);                 // 1500 ÷ (25,5 × 95)
  assert.equal(g.feedTotalKg, 2900);
  assert.equal(g.feedPerSoldKg, 0.58);
  // một lần cân: chưa tính được
  assert.equal(growthSummary({ ...raw, weighings: [raw.weighings[0]] }, cycle, [], [], true).needMore, 'weighings');
  // chưa có cám: có ADG nhưng chưa có FCR
  const noFeed = growthSummary({ ...raw, feed: { ...raw.feed, stock_by_date: [] } }, cycle, [], [], true);
  assert.deepEqual([noFeed.adgG, noFeed.fcr, noFeed.needMore], [850, null, 'feed']);
  // không có quyền xem kho: dùng lượng cho ăn ghi tay
  const logsOnly = growthSummary({ ...raw, feed: { can_view: false, other_unit: false, stock_by_date: [], logs_by_date: [{ date: '2026-11-10', kg: 1200 }] } }, cycle, [], [], true);
  assert.deepEqual([logsOnly.feedSource, logsOnly.feedBetweenKg], ['logs', 1200]);
  // cân giảm: không tính FCR
  assert.equal(growthSummary({ ...raw, weighings: [{ date: '2026-11-01', pigs: 10, avg_kg: 60 }, { date: '2026-12-01', pigs: 10, avg_kg: 55 }] }, cycle, [], [], true).fcr, null);
});
