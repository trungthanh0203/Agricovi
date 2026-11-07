import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0185: thống kê tổng hợp cho quản trị nền tảng (sắp xếp theo cột, phân trang, không lộ tiền/điện thoại) + danh sách của cơ sở bỏ bản ghi đã hủy.
test('admin_org_stats / admin_org_stats_items: chỉ quản trị viên, đếm đúng, sắp xếp, phân trang, không lộ tiền', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn A') id`)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select admin_org_stats($1)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select admin_org_stats_items($1,'areas')`, [org])), /FORBIDDEN/);

  const ct = (await db.query(`select id from crop_types limit 1`)).rows[0].id;
  const area = '85200000-0000-4000-8000-000000000001', cyc = '85200000-0000-4000-8000-000000000002';
  await db.query(`insert into production_areas (id, organization_id, name) values ($1,$2,'Khu 1')`, [area, org]);
  await db.query(`insert into production_cycles (id, owner_org_id, area_id, crop_type_id, mgmt_model) values ($1,$2,$3,$4,'family')`, [cyc, org, area, ct]);
  await db.query(`insert into inventory_locations (organization_id, name) values ($1,'Kho chính')`, [org]);
  await db.query(`insert into partners (id,organization_id,name,is_supplier,phone) values (gen_random_uuid(),$1,'Đại lý X',true,'0900000001')`, [org]);
  for (let i = 1; i <= 35; i++) await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values (gen_random_uuid(),$1,$2,'other','cash_paid',$3,$4::date)`, [org, cyc, 777000 + i, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`]);
  await db.query(`update expense_records set voided_at = now(), void_reason = 'nhập nhầm' where organization_id = $1 and amount = 777001`, [org]);

  const s = (await asUser(db, admin, `select admin_org_stats($1) s`, [org])).rows[0].s;
  assert.deepEqual([s.areas, s.cells, s.warehouses, s.suppliers, s.expenses].map(Number), [1, 0, 1, 1, 34]);
  assert.ok(s.plans.current);

  const it = (kind, sort = 1, desc = false, off = 0) => asUser(db, admin, `select admin_org_stats_items($1,$2,$3,$4,30,$5) r`, [org, kind, sort, desc, off]).then((r) => r.rows[0].r);
  let r = await it('expenses', 1, true);
  assert.equal(Number(r.total), 34);
  assert.equal(r.rows.length, 30);
  assert.equal(JSON.stringify(r).includes('777'), false);
  assert.equal((await it('expenses', 1, true, 30)).rows.length, 4);
  r = await it('suppliers');
  assert.equal(JSON.stringify(r).includes('0900000001'), false);
  assert.equal(r.rows[0][0], 'Đại lý X');
  for (const k of ['plans', 'areas', 'cells', 'warehouses', 'materials', 'suppliers', 'staff', 'templates', 'cycles_active', 'cycles_preparing', 'cycles_paused', 'cycles_ended', 'expenses', 'harvests', 'sales', 'public_cycles', 'web_orders']) {
    assert.ok(Array.isArray((await it(k)).rows), k);
  }
  assert.equal((await it('areas', 99)).rows.length, 1);
  assert.match(await expectError(asUser(db, admin, `select admin_org_stats_items($1,'xyz')`, [org])), /INVALID_KIND/);
});
