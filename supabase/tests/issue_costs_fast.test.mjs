import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0209 (D172): view giá vốn xuất kho chỉ tính giá nhập bình quân khi dòng xuất không có giá riêng; kết quả không đổi.

const tid = (n) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('giá vốn xuất kho: có giá riêng dùng giá riêng; không có giá thì dùng bình quân các lần nhập đến ngày xuất', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const loc = (await db.query(`insert into inventory_locations (id,organization_id,name) values (gen_random_uuid(),$1,'Kho') returning id`, [org])).rows[0].id;
  const mat = (await db.query(`insert into materials (id,organization_id,name,base_unit_id) values (gen_random_uuid(),$1,'Cám',(select id from units_of_measure where code='kg')) returning id`, [org])).rows[0].id;
  const ins = (n, type, qty, cost, date) => db.query(
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tid(n), org, loc, mat, type, qty, cost, date]);
  await ins(1, 'receipt', 10, 10000, '2026-01-01');
  await ins(2, 'receipt', 10, 20000, '2026-01-10');
  await ins(3, 'receipt', 10, 90000, '2026-02-01');   // sau ngày xuất: không được tính vào bình quân
  await ins(4, 'issue', -2, null, '2026-01-15');       // không giá: bình quân (10×10000 + 10×20000)/20 = 15000 → 30000
  await ins(5, 'issue', -1, 12000, '2026-01-15');      // có giá riêng: 12000
  const r = (await db.query(`select txn_id, cost, unit_cost_used::numeric u, cost_known, cost_from_average from inventory_issue_costs order by txn_id`)).rows;
  const by = Object.fromEntries(r.map((x) => [x.txn_id, x]));
  assert.equal(Number(by[tid(4)].cost), 30000); assert.equal(by[tid(4)].cost_from_average, true); assert.equal(Number(by[tid(4)].u), 15000);
  assert.equal(Number(by[tid(5)].cost), 12000); assert.equal(by[tid(5)].cost_from_average, false); assert.equal(by[tid(5)].cost_known, true);
});
