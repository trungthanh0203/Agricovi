import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// D147: tài khoản đăng nhập của hộ thành viên (chức vụ "Hộ nhập liệu"): chỉ thấy và nhập dữ liệu của hộ mình; chủ HTX vẫn quản lý được.
test('chức vụ Hộ nhập liệu: đúng quyền, hộ này không thấy hộ khác, chủ HTX vẫn thấy', async () => {
  const db = await createDb();
  const coopOwner = await addUser(db, 1), hoA = await addUser(db, 2), stranger = await addUser(db, 3);
  const coop = (await asUser(db, coopOwner, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const hhA = (await asUser(db, coopOwner, `select create_member_household($1,'Hộ A') id`, [coop])).rows[0].id;
  const hhB = (await asUser(db, coopOwner, `select create_member_household($1,'Hộ B') id`, [coop])).rows[0].id;

  // chỉ chủ của hộ được tạo chức vụ; chạy lại không tạo trùng
  assert.match(await expectError(asUser(db, stranger, `select ensure_household_position($1)`, [hhA])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, coopOwner, `select ensure_household_position($1)`, [coop])), /INVALID_ORG/);
  const pos = (await asUser(db, coopOwner, `select ensure_household_position($1) id`, [hhA])).rows[0].id;
  assert.equal((await asUser(db, coopOwner, `select ensure_household_position($1) id`, [hhA])).rows[0].id, pos);
  assert.equal((await db.query(`select count(*)::int n from org_positions where organization_id=$1 and name='Hộ nhập liệu'`, [hhA])).rows[0].n, 1);

  // gán người của hộ A vào chức vụ (như sau khi Edge Function tạo tài khoản)
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [hhA, hoA]);
  await asUser(db, coopOwner, `select set_member_position($1,$2,$3)`, [hhA, hoA, pos]);
  const perms = (await db.query(`select roles, (select perms from org_positions where id=$3) p from organization_memberships where organization_id=$1 and user_id=$2`, [hhA, hoA, pos])).rows[0];
  assert.deepEqual(perms.roles, ['manager']);
  assert.equal(perms.p.expenses, 'edit'); assert.equal(perms.p.payroll, 'none'); assert.equal(perms.p.coop, 'none');

  // hộ A tạo vụ và ghi chi phí/doanh thu của mình; không thấy dữ liệu hộ B hay HTX
  const area = '20000000-0000-4000-8000-000000000001', areaB = '20000000-0000-4000-8000-000000000002';
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn A'),($3,$4,'Vườn B')`, [area, hhA, areaB, hhB]);
  await db.query(`insert into expense_records (id,organization_id,category,kind,amount,expense_date) values ('e0000000-0000-4000-8000-000000000001',$1,'other','cash_paid',100,current_date),('e0000000-0000-4000-8000-000000000002',$2,'other','cash_paid',200,current_date)`, [hhA, hhB]);
  const seen = (await asUser(db, hoA, `select organization_id from expense_records`)).rows.map((r) => r.organization_id);
  assert.deepEqual(seen, [hhA]);
  assert.deepEqual((await asUser(db, hoA, `select id from production_areas`)).rows.map((r) => r.id), [area]);
  await asUser(db, hoA, `insert into expense_records (id,organization_id,category,kind,amount,expense_date) values ('e0000000-0000-4000-8000-000000000003',$1,'other','cash_paid',300,current_date)`, [hhA]);
  assert.match(await expectError(asUser(db, hoA, `insert into expense_records (id,organization_id,category,kind,amount,expense_date) values ('e0000000-0000-4000-8000-000000000004',$1,'other','cash_paid',300,current_date)`, [hhB])), /row-level security/);

  // người của hộ không tạo/sửa chức vụ, không đổi chức vụ người khác, không cấp tài khoản
  assert.match(await expectError(asUser(db, hoA, `select ensure_household_position($1)`, [hhA])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, hoA, `select set_member_position($1,$2,$3)`, [hhA, coopOwner, pos])), /FORBIDDEN|INVALID/);
  // chủ HTX vẫn thấy cả khoản chi do hộ nhập
  const all = (await asUser(db, coopOwner, `select count(*)::int n from expense_records where organization_id=$1`, [hhA])).rows[0].n;
  assert.equal(all, 2);
});
