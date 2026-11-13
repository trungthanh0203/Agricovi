import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0184: thống kê tổng hợp của chính cơ sở, sắp xếp theo cột và phân trang ở máy chủ.
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const cid = (n) => `8c000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`update subscriptions set max_cycles = 20 where organization_id = $1`, [org]);
  const parent = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu A') returning id`, [org])).rows[0].id;
  const cell = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,area_size,parent_id) values (gen_random_uuid(),$1,'Nhà màng 1',1000,$2) returning id`, [org, parent])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},10)`, [tpl]);
  const mk = (id, name, a) => asUser(db, owner, `select create_cycle_checked($1,$2,$3,$4,'2026-10-01'::date,'active'::cycle_status,$5,'Kim Cô Nương',$6,100,false,false)`, [id, org, cell, tpl, name, a]);
  await mk(cid(1), 'Dưa B', 300); await mk(cid(2), 'Dưa A', 400);
  await db.query(`update production_cycles set status='ended' where id=$1`, [cid(2)]);
  for (let i = 1; i <= 35; i++) await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values (gen_random_uuid(),$1,$2,'other','cash_paid',$3,$4::date)`, [org, cid(1), i * 1000, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`]);
  await db.query(`insert into partners (id,organization_id,name,is_supplier,phone) values (gen_random_uuid(),$1,'Đại lý X',true,'0900000001')`, [org]);
  await db.query(`insert into partners (id,organization_id,name,is_supplier,is_customer,phone) values (gen_random_uuid(),$1,'Khách Y',false,true,'0900000002')`, [org]);
  return { db, owner, wk, stranger, org };
}
const items = (c, who, kind, sort = 1, desc = false, off = 0) => asUser(c.db, who, `select org_stats_items($1,$2,$3,$4,30,$5) r`, [c.org, kind, sort, desc, off]);

test('tóm tắt: đúng số, mục không đủ quyền là null', async () => {
  const c = await setup();
  const s = (await asUser(c.db, c.owner, `select org_stats_summary($1) r`, [c.org])).rows[0].r;
  assert.deepEqual([s.areas, s.cells, s.cycles_active, s.cycles_ended, s.cycles_preparing, s.expenses, s.suppliers, s.templates, s.customers].map(Number), [1, 1, 1, 1, 0, 35, 1, 1, 1]);
  assert.ok(Number(s.plans.count) >= 0 && s.plans.current);
  const w = (await asUser(c.db, c.wk, `select org_stats_summary($1) r`, [c.org])).rows[0].r;
  assert.equal(w.plans, null);
  assert.equal(w.expenses, null);
  assert.equal(w.staff, null);
  assert.equal(w.customers, null);
  assert.equal(Number(w.areas), 1);
  assert.match(await expectError(asUser(c.db, c.stranger, `select org_stats_summary($1)`, [c.org])), /FORBIDDEN/);
});

test('danh sách: sắp xếp theo cột (tăng/giảm), phân trang 30 dòng, tổng đúng', async () => {
  const c = await setup();
  let r = (await items(c, c.owner, 'expenses', 5, true)).rows[0].r;     // cột 5 = số tiền, giảm dần
  assert.equal(Number(r.total), 35);
  assert.equal(r.rows.length, 30);
  assert.equal(Number(r.rows[0][4]), 35000);
  assert.ok(Number(r.rows[0][4]) >= Number(r.rows[29][4]));
  r = (await items(c, c.owner, 'expenses', 5, true, 30)).rows[0].r;     // trang 2
  assert.equal(r.rows.length, 5);
  assert.equal(Number(r.rows[0][4]), 5000);
  r = (await items(c, c.owner, 'expenses', 5, false)).rows[0].r;
  assert.equal(Number(r.rows[0][4]), 1000);
  const cy = (await items(c, c.owner, 'cycles_active')).rows[0].r;
  assert.deepEqual([cy.rows.length, cy.rows[0][0]], [1, 'Dưa B']);
  assert.equal((await items(c, c.owner, 'cycles_ended')).rows[0].r.rows[0][0], 'Dưa A');
  const cells = (await items(c, c.owner, 'cells')).rows[0].r;
  assert.deepEqual([cells.rows[0][0], cells.rows[0][1], Number(cells.rows[0][5])], ['Nhà màng 1', 'Khu A', 1]);
  const bad = (await items(c, c.owner, 'expenses', 99, false)).rows[0].r;   // cột không hợp lệ -> cột 1
  assert.equal(bad.rows.length, 30);
});

test('danh sách: kiểm quyền từng mục; loại lạ bị từ chối', async () => {
  const c = await setup();
  for (const k of ['plans', 'staff', 'expenses', 'sales', 'suppliers', 'customers', 'warehouses', 'materials', 'web_orders', 'public_cycles']) {
    assert.match(await expectError(items(c, c.wk, k)), /FORBIDDEN/, k);
    assert.match(await expectError(items(c, c.stranger, k)), /FORBIDDEN/, k);
  }
  for (const k of ['plans', 'areas', 'cells', 'warehouses', 'materials', 'suppliers', 'customers', 'staff', 'templates', 'cycles_active', 'cycles_preparing', 'cycles_paused', 'cycles_ended', 'expenses', 'harvests', 'sales', 'public_cycles', 'web_orders']) {
    assert.ok(Array.isArray((await items(c, c.owner, k)).rows[0].r.rows), k);
  }
  assert.match(await expectError(items(c, c.owner, 'xyz')), /INVALID_KIND/);
  assert.equal((await items(c, c.wk, 'areas')).rows[0].r.rows.length, 1);     // nhân viên vẫn xem được phân khu
});
