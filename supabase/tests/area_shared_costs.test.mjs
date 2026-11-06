import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0180: chia chi phí chung của ô cho các vụ; báo cáo theo ô.
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const cid = (n) => `89000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OP = '89100000-0000-4000-8000-000000000001';

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`update subscriptions set max_cycles = 20 where organization_id = $1`, [org]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,area_size,area_unit) values (gen_random_uuid(),$1,'Nhà màng 1',1000,'m2') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},60)`, [tpl]);
  const mk = (id, start, name, a) => asUser(db, owner, `select create_cycle_checked($1,$2,$3,$4,$5::date,'active'::cycle_status,$6,'Kim Cô Nương',$7,100,false,false)`, [id, org, area, tpl, start, name, a]);
  await mk(cid(1), '2026-10-01', 'Dưa A', 400);
  await mk(cid(2), '2026-10-16', 'Dưa B', 300);
  return { db, owner, wk, org, area, tpl };
}
const alloc = (c, who, op = OP, amount = 1000000) => asUser(c.db, who, `select allocate_area_expense($1,$2,'2026-10-01'::date,'2026-10-31'::date,$3,'utility'::expense_category,'Tiền điện tháng 10',$4) r`, [c.org, c.area, amount, op]);

test('chia chi phí chung theo diện tích × số ngày: tổng đúng, ghi chú giả định, gọi lặp không nhân đôi, kiểm quyền', async () => {
  const c = await setup();
  const pv = (await asUser(c.db, c.owner, `select preview_area_expense($1,$2,'2026-10-01'::date,'2026-10-31'::date,1000000) r`, [c.org, c.area])).rows[0].r;
  assert.equal(pv.shares.length, 2);
  assert.equal(pv.shares.reduce((t, x) => t + Number(x.amount), 0), 1000000);
  const a = pv.shares.find((x) => x.name === 'Dưa A'), b = pv.shares.find((x) => x.name === 'Dưa B');
  assert.deepEqual([a.days, b.days], [31, 16]);
  assert.ok(Math.abs(Number(a.amount) - 720930) <= 1 && Math.abs(Number(b.amount) - 279070) <= 1);
  const r = (await alloc(c, c.owner)).rows[0].r;
  assert.deepEqual([r.created, r.already], [2, false]);
  const rows = (await c.db.query(`select cycle_id, kind::text k, amount::int a, expense_date::text d, note from expense_records where organization_id=$1 order by amount desc`, [c.org])).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((x) => x.k), ['allocated', 'allocated']);
  assert.equal(rows.reduce((t, x) => t + x.a, 0), 1000000);
  assert.match(rows[0].note, /theo diện tích × số ngày/);
  assert.equal((await alloc(c, c.owner)).rows[0].r.already, true);          // lặp cùng mã thao tác
  assert.equal((await c.db.query(`select count(*)::int n from expense_records`)).rows[0].n, 2);
  assert.match(await expectError(alloc(c, c.wk, '89100000-0000-4000-8000-000000000002')), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select allocate_area_expense($1,$2,'2026-10-01'::date,'2099-01-01'::date,1000,'utility'::expense_category,null,gen_random_uuid())`, [c.org, c.area])), /INVALID_DATE/);
  assert.match(await expectError(alloc(c, c.owner, '89100000-0000-4000-8000-000000000003', 0)), /INVALID_AMOUNT/);
});

test('vụ chưa khai diện tích không có phần; ô không có vụ hợp lệ thì báo lỗi', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-10-01'::date,'active'::cycle_status,'Vụ cũ')`, [cid(3), c.org, c.area, c.tpl]);
  const pv = (await asUser(c.db, c.owner, `select preview_area_expense($1,$2,'2026-10-01'::date,'2026-10-31'::date,1000000) r`, [c.org, c.area])).rows[0].r;
  assert.equal(pv.shares.length, 2);
  assert.deepEqual(pv.skipped.map((x) => x.name), ['Vụ cũ']);
  const a2 = (await asUser(c.db, c.owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Ô trống') returning id`, [c.org])).rows[0].id;
  assert.match(await expectError(asUser(c.db, c.owner, `select allocate_area_expense($1,$2,'2026-10-01'::date,'2026-10-31'::date,1000,'utility'::expense_category,null,gen_random_uuid())`, [c.org, a2])), /NO_CYCLES/);
});

test('báo cáo theo ô: mỗi ô một dòng, kiểm quyền', async () => {
  const c = await setup();
  await alloc(c, c.owner);
  const r = (await asUser(c.db, c.owner, `select report_by_area($1,'2026-10-01'::date,'2026-12-31'::date) r`, [c.org])).rows[0].r;
  assert.equal(r.type, 'areas');
  assert.equal(r.rows.length, 1);
  const row = r.rows[0];
  assert.deepEqual([row.label, Number(row.cycles), Number(row.area_used_m2), Number(row.capacity_m2)], ['Nhà màng 1', 2, 700, 1000]);
  assert.equal(Number(row.cost), 1000000);
  assert.match(await expectError(asUser(c.db, c.wk, `select report_by_area($1,null,null)`, [c.org])), /FORBIDDEN/);
});
