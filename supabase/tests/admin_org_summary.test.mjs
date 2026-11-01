import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0155: tổng hợp số liệu và danh sách chi tiết của một cơ sở cho trang quản trị nền tảng.
test('admin_org_summary / admin_org_items: chỉ quản trị viên, đếm đúng, không lộ tiền', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn A') id`)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select admin_org_summary($1)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select admin_org_items($1,'areas')`, [org])), /FORBIDDEN/);

  const ct = (await db.query(`select id from crop_types limit 1`)).rows[0].id;
  const area = '85100000-0000-4000-8000-000000000001', cyc = '85100000-0000-4000-8000-000000000002', exp = '85100000-0000-4000-8000-000000000003';
  await db.query(`insert into production_areas (id, organization_id, name) values ($1,$2,'Khu 1')`, [area, org]);
  await db.query(`insert into production_cycles (id, owner_org_id, area_id, crop_type_id, mgmt_model) values ($1,$2,$3,$4,'family')`, [cyc, org, area, ct]);
  await db.query(`insert into inventory_locations (organization_id, name) values ($1,'Kho chính')`, [org]);
  await db.query(`insert into expense_records (id, organization_id, cycle_id, category, amount, expense_date) values ($1,$2,$3,'other',123456,current_date)`, [exp, org, cyc]);

  const s = (await asUser(db, admin, `select admin_org_summary($1) s`, [org])).rows[0].s;
  assert.deepEqual([s.areas, s.cells, s.warehouses, Number(s.models), s.cycles, s.expenses, s.harvests, s.sales, s.web_orders].map(Number), [1, 0, 1, 1, 1, 1, 0, 0, 0]);
  assert.equal(s.plan.status, 'trial');

  const ex = (await asUser(db, admin, `select admin_org_items($1,'expenses') r`, [org])).rows[0].r;
  assert.equal(ex.length, 1);
  assert.equal(JSON.stringify(ex).includes('123456'), false);
  const md = (await asUser(db, admin, `select admin_org_items($1,'models') r`, [org])).rows[0].r;
  assert.equal(md[0][3], 'family');
  assert.match(await expectError(asUser(db, admin, `select admin_org_items($1,'xyz')`, [org])), /INVALID_KIND/);
});
