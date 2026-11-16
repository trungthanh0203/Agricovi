import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0211 (D174): công ghi tay hiện ở dòng "Tiền công" của số liệu vụ; tổng chi phí không đổi.

const id = (n) => `87000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('công ghi tay vào cost_labor, bớt khỏi cost_other; tổng không đổi; cả hai hàm số liệu', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const area = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu') returning id`, [org])).rows[0].id;
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date) values ($1,$2,$3,(select id from crop_types limit 1),'active',current_date - 10)`, [id(1), org, area]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values
    ($1,$2,$3,'labor','cash_paid',2000000,current_date - 5), ($4,$2,$3,'other','cash_paid',500000,current_date - 5), ($5,$2,$3,'material','material_used',700000,current_date - 5)`, [id(10), org, id(1), id(11), id(12)]);
  const all = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles[0];
  const some = (await asUser(db, owner, `select get_cycles_stats_for($1, $2::uuid[]) j`, [org, [id(1)]])).rows[0].j.cycles[0];
  for (const s of [all, some]) {
    assert.equal(Number(s.cost_total), 3200000);
    assert.equal(Number(s.cost_labor), 2000000);
    assert.equal(Number(s.cost_material), 700000);
    assert.equal(Number(s.cost_other), 500000);
  }
});
