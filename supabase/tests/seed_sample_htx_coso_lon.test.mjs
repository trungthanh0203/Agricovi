import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser } from './harness.mjs';

// Dữ liệu mẫu quy mô lớn cho chính cơ sở HTX (supabase/maintenance/seed_sample_htx_coso_lon.sql): đủ quy mô, nhất quán, chạy chung với bộ mẫu nhỏ và bộ hộ, xóa sạch.
const read = (f) => readFileSync(new URL(`../maintenance/${f}`, import.meta.url), 'utf8');
const big = (mode = 'THEM') => read('seed_sample_htx_coso_lon.sql').replace("'plaumai.tnb@gmail.com'", "'u1@test.local'").replace("v_mode     constant text := 'THEM'", `v_mode     constant text := '${mode}'`);
const small = (mode = 'THEM') => read('seed_sample_htx.sql').replace("'trungthanhfx23@gmail.com'", "'u1@test.local'").replace("v_mode     constant text := 'THEM'", `v_mode     constant text := '${mode}'`);
const hoFile = (mode = 'THEM') => read('seed_sample_htx_ho.sql').replace("'plaumai.tnb@gmail.com'", "'u1@test.local'").replace("v_mode  constant text := 'THEM'", `v_mode  constant text := '${mode}'`);
const one = async (db, sql) => (await db.query(sql)).rows[0];

test('mẫu cơ sở HTX quy mô lớn: đủ quy mô, nhất quán, chạy chung với bộ mẫu nhỏ và bộ hộ, xóa từng bộ không ảnh hưởng bộ kia', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const org = (await asUser(db, boss, `select create_organization('cooperative','HTX Lớn') id`)).rows[0].id;
  await db.exec(big());
  const x = await one(db, `select
    (select count(*)::int from production_areas where organization_id='${org}' and code like 'MAUL-%' and parent_id is null) areas,
    (select count(*)::int from production_areas where organization_id='${org}' and code like 'MAUL-%' and parent_id is not null) cells,
    (select count(*)::int from inventory_locations where organization_id='${org}' and description like 'Mẫu quy mô lớn%') locs,
    (select count(*)::int from worker_teams where organization_id='${org}') teams,
    (select count(*)::int from worker_profiles where organization_id='${org}' and phone like '09118%') workers,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and code like 'MAUL-%' and status='ended') ended,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and code like 'MAUL-%' and status='active') active,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and code like 'MAUL-%' and status='preparing') prep,
    (select count(*)::int from partners where organization_id='${org}' and is_supplier) sup,
    (select count(*)::int from partners where organization_id='${org}' and is_customer) cus,
    (select count(*)::int from activity_logs where organization_id='${org}') logs,
    (select count(*)::int from harvest_records where organization_id='${org}') harvests,
    (select count(*)::int from sales_records where organization_id='${org}') sales,
    (select count(*)::int from attendance_records where organization_id='${org}') att,
    (select count(*)::int from work_rates where organization_id='${org}' and amount=35000) leaders,
    (select count(*)::int from work_rates where organization_id='${org}' and amount=30000) staff`);
  assert.deepEqual([x.areas, x.cells, x.locs, x.teams, x.workers], [8, 40, 16, 8, 120]);
  assert.deepEqual([x.ended, x.active, x.prep, x.sup, x.cus], [40, 40, 40, 8, 10]);
  assert.deepEqual([x.leaders, x.staff], [8, 112]);
  assert.ok(x.logs > 3000 && x.harvests > 250 && x.sales === x.harvests && x.att > 3000, JSON.stringify(x));
  // mỗi trại 15 vụ... (5 nhà màng × 3): 5 ended, 5 active, 5 preparing
  const per = (await db.query(`select a.name, count(*)::int n, count(*) filter (where c.status='ended' and c.end_date < current_date)::int e, count(*) filter (where c.status='active' and c.start_date <= current_date and c.expected_end_date >= current_date)::int a, count(*) filter (where c.status='preparing' and c.start_date > current_date)::int p
    from production_cycles c join production_areas ch on ch.id=c.area_id join production_areas a on a.id=ch.parent_id where c.owner_org_id='${org}' and c.code like 'MAUL-%' group by a.name`)).rows;
  assert.equal(per.length, 8);
  for (const r of per) assert.deepEqual([r.n, r.e, r.a, r.p], [15, 5, 5, 5], r.name);
  assert.equal((await one(db, `select count(*)::int n from (select location_id, material_id, sum(quantity_delta) q from inventory_transactions where organization_id='${org}' group by 1,2) x where q < 0`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from production_stages s join production_cycles c on c.id=s.cycle_id where c.owner_org_id='${org}' and c.status='ended' and s.status<>'done'`)).n, 0);
  const pay = (await one(db, `select jsonb_agg(distinct x->>'status') s from jsonb_array_elements(get_payables('${org}', false)) x`)).s;
  const rec = (await one(db, `select jsonb_agg(distinct x->>'status') s from jsonb_array_elements(get_receivables('${org}', false)) x`)).s;
  for (const s of ['paid', 'overdue']) { assert.ok(pay.includes(s), 'payables ' + pay); assert.ok(rec.includes(s), 'receivables ' + rec); }

  // chạy chung: bộ mẫu nhỏ và bộ hộ không đụng bộ lớn
  await db.exec(small());
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}' and code like 'MAU-%'`)).n, 60);
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}' and code like 'MAUL-%'`)).n, 120);
  await db.exec(hoFile());
  assert.equal((await one(db, `select count(*)::int n from production_cycles where code like 'MAUHO-%'`)).n, 30);

  // chạy lại: bỏ qua. Xóa bộ nhỏ: bộ lớn và bộ hộ còn nguyên
  await db.exec(big());
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}' and code like 'MAUL-%'`)).n, 120);
  await db.exec(hoFile('XOA'));
  await db.exec(small('XOA'));
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}' and code like 'MAU-%'`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}' and code like 'MAUL-%'`)).n, 120);
  // xóa bộ lớn: sạch
  await db.exec(big('XOA'));
  const after = await one(db, `select (select count(*)::int from production_cycles where owner_org_id='${org}') cy, (select count(*)::int from worker_profiles where organization_id='${org}') w,
    (select count(*)::int from partners where organization_id='${org}' and note like 'Mẫu quy mô lớn%') p, (select count(*)::int from inventory_transactions where organization_id='${org}') t,
    (select count(*)::int from expense_records where organization_id='${org}') e, (select count(*)::int from production_areas where organization_id='${org}') a`);
  assert.deepEqual([after.cy, after.w, after.p, after.t, after.e, after.a], [0, 0, 0, 0, 0, 0]);
});
