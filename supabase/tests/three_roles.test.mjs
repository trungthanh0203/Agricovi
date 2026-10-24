import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0064 (D83): chỉ 3 vai trò; Quản lý/Nhân viên quyền tối thiểu; chức vụ gán thêm quyền mà không đổi vai trò chính.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup(type = 'household') {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization($1,'Cơ sở A') id`, [type])).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [id('2', 1), org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [id('3', 1), org, id('2', 1)]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',1000,current_date)`, [id('b', 1), org, id('3', 1)]);
  await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values ($1,$2,$3,current_date,1,1000)`, [id('c', 1), org, id('3', 1)]);
  const w = (await db.query(`insert into worker_profiles (organization_id, full_name, user_id) values ($1,'Nam',$2) returning id`, [org, wk])).rows[0].id;
  await db.query(`insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from) values ($1,'hour',$2,25000,'2026-01-01')`, [org, w]);
  return { db, org, owner, mgr, wk, w };
}
const count = async (db, u, tbl) => (await asUser(db, u, `select count(*)::int n from ${tbl}`)).rows[0].n;
const pos = async (db, org, name) => (await db.query(`select id from org_positions where organization_id=$1 and name=$2`, [org, name])).rows[0]?.id;

test('cơ sở mới: chức vụ có sẵn Quản lý (vai trò quản lý), Nhân viên + gợi ý; HTX có thêm Quản lý hợp tác xã', async () => {
  const c = await setup();
  const rows = (await c.db.query(`select name, base_role::text b, is_builtin from org_positions where organization_id=$1 order by name`, [c.org])).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.b]), [['Biên tập hồ sơ', 'worker'], ['Nhân viên', 'worker'], ['Quản lý', 'manager'], ['Thủ kho và kế toán', 'worker']]);
  assert.ok(rows.every((r) => r.is_builtin === false)); // D84: tất cả đều là chức vụ thường, sửa/xóa được
  const h = await setup('cooperative');
  assert.ok(await pos(h.db, h.org, 'Quản lý hợp tác xã'));
});

test('Quản lý: làm được việc sản xuất; không thấy chi phí, doanh thu, lương; khai báo chỉ xem', async () => {
  const c = await setup();
  assert.equal(await count(c.db, c.mgr, 'expense_records'), 0);
  assert.equal(await count(c.db, c.mgr, 'sales_records'), 0);
  assert.equal(await count(c.db, c.mgr, 'work_rates'), 0);
  assert.equal(await count(c.db, c.owner, 'expense_records'), 1);
  assert.match(await expectError(asUser(c.db, c.mgr, `insert into production_areas (organization_id,name) values ($1,'N2')`, [c.org])), /row-level security/);
  assert.equal(await count(c.db, c.mgr, 'production_areas'), 1); // vẫn xem được
  const per = (await c.db.query(`insert into payroll_periods (organization_id,start_date,end_date) values ($1,'2026-10-01','2026-10-31') returning id`, [c.org])).rows[0].id;
  assert.match(await expectError(asUser(c.db, c.mgr, `select compute_payroll($1)`, [per])), /FORBIDDEN/);
  assert.equal((await asUser(c.db, c.owner, `select compute_payroll($1) t`, [per])).rows.length, 1);
  const r = (await asUser(c.db, c.mgr, `select can_manage_cycle($1) a, has_perm($2,'inventory','view') b, has_perm($2,'inventory','edit') e`, [id('3', 1), c.org])).rows[0];
  assert.deepEqual([r.a, r.b, r.e], [true, true, false]);
});

test('Nhân viên: chỉ ghi việc, thu hoạch của mình; không thấy kho, chi phí, lương của người khác', async () => {
  const c = await setup();
  const r = (await asUser(c.db, c.wk, `select has_perm($1,'harvest','edit') h, has_perm($1,'inventory','view') i, has_perm($1,'declare','view') d, can_log_cycle($2) l`, [c.org, id('3', 1)])).rows[0];
  assert.deepEqual([r.h, r.i, r.d, r.l], [true, false, false, true]);
  assert.equal(await count(c.db, c.wk, 'expense_records'), 0);
  assert.equal(await count(c.db, c.wk, 'work_rates'), 0);
});

test('chức vụ gán thêm quyền, không đổi vai trò chính; chủ cấp riêng thêm quyền Tiền công', async () => {
  const c = await setup();
  assert.match(await expectError(asUser(c.db, c.owner, `select set_member_roles($1,$2,array['inventory_finance']::member_role[])`, [c.org, c.wk])), /INVALID_ROLE/);
  await asUser(c.db, c.owner, `select set_member_positions($1,$2,array[$3]::uuid[])`, [c.org, c.wk, await pos(c.db, c.org, 'Thủ kho và kế toán')]);
  assert.deepEqual((await c.db.query(`select roles from organization_memberships where user_id=$1`, [c.wk])).rows[0].roles, ['worker']); // vai trò chính giữ nguyên
  assert.equal(await count(c.db, c.wk, 'expense_records'), 1);
  assert.equal((await asUser(c.db, c.wk, `select has_perm($1,'inventory','edit') e`, [c.org])).rows[0].e, true);
  await asUser(c.db, c.owner, `select set_member_permissions($1,$2,$3::jsonb)`, [c.org, c.mgr, JSON.stringify({ payroll: 'view' })]);
  assert.equal(await count(c.db, c.mgr, 'work_rates'), 1);
  assert.match(await expectError(asUser(c.db, c.mgr, `insert into work_rates (organization_id, rate_type, worker_id, amount, valid_from) values ($1,'hour',$2,1,'2026-02-01')`, [c.org, c.w])), /row-level security/);
});

test('hồ sơ website và hộ thành viên theo quyền riêng, không theo vai trò cũ', async () => {
  const c = await setup('cooperative');
  const f = async (u) => (await asUser(c.db, u, `select can_edit_profile($1) p, has_perm($1,'coop','edit') c`, [c.org])).rows[0];
  assert.deepEqual(await f(c.mgr), { p: false, c: false });
  assert.deepEqual(await f(c.owner), { p: true, c: true });
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.wk, await pos(c.db, c.org, 'Biên tập hồ sơ')]);
  assert.deepEqual(await f(c.wk), { p: true, c: false });
  assert.match(await expectError(asUser(c.db, c.mgr, `select invite_household($1,'a@b.vn')`, [c.org])), /FORBIDDEN/);
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.mgr, await pos(c.db, c.org, 'Quản lý hợp tác xã')]);
  assert.deepEqual(await f(c.mgr), { p: false, c: true });
  assert.ok((await asUser(c.db, c.mgr, `select invite_household($1,'a@b.vn') i`, [c.org])).rows[0].i);
  assert.equal((await c.db.query(`select count(*)::int n from website_staff_ids($1)`, [c.org])).rows[0].n, 2); // chủ + người có quyền website
});
