import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0063 (D82): quản trị nền tảng đổi tên vai trò có sẵn; gói dịch vụ chỉ chủ xem.

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2), mgr = await addUser(db, 3), owner2 = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, owner2, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  return { db, admin, owner, mgr, owner2, org, org2 };
}
const names = async (db, org, role) => (await db.query(`select name from org_positions where organization_id=$1 and is_builtin and base_role=$2`, [org, role])).rows[0]?.name;

test('đổi tên vai trò có sẵn: mọi cơ sở đổi theo, cơ sở mới dùng tên mới, có nhật ký; người khác không đổi được', async () => {
  const c = await setup();
  assert.equal(await names(c.db, c.org, 'manager'), 'Quản lý');
  assert.match(await expectError(asUser(c.db, c.owner, `select admin_set_role_label('manager','Điều hành',null)`)), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.admin, `select admin_set_role_label('manager','Đ',null)`)), /INVALID_NAME/);
  const n = (await asUser(c.db, c.admin, `select admin_set_role_label('manager','Điều hành viên','Đổi cho dễ hiểu') n`)).rows[0].n;
  assert.equal(n, 2);
  assert.equal(await names(c.db, c.org, 'manager'), 'Điều hành viên');
  assert.equal(await names(c.db, c.org2, 'manager'), 'Điều hành viên');
  assert.equal(await names(c.db, c.org, 'worker'), 'Nhân viên sản xuất'); // vai trò khác giữ nguyên
  const owner3 = await addUser(c.db, 5);
  const org3 = (await asUser(c.db, owner3, `select create_organization('household','Hộ C') id`)).rows[0].id;
  assert.equal(await names(c.db, org3, 'manager'), 'Điều hành viên');
  // mọi người đăng nhập đọc được tên để hiển thị; không tự ghi được
  assert.equal((await asUser(c.db, c.mgr, `select name from platform_role_labels where role='manager'`)).rows[0].name, 'Điều hành viên');
  try { await asUser(c.db, c.mgr, `update platform_role_labels set name='Tự đổi'`); } catch { /* bị chặn quyền cũng được */ }
  assert.equal((await c.db.query(`select name from platform_role_labels where role='manager'`)).rows[0].name, 'Điều hành viên'); // không tự sửa được
  const log = (await c.db.query(`select action, reason from audit_events where action='set_role_label'`)).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].reason, 'Đổi cho dễ hiểu');
});

test('không đổi sang tên trùng vai trò tự tạo của cơ sở nào đó', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select save_position($1,null,'Tổ trưởng vườn','',$2::jsonb,null,false,true,'worker')`, [c.org, JSON.stringify({})]);
  assert.match(await expectError(asUser(c.db, c.admin, `select admin_set_role_label('worker','tổ trưởng vườn',null)`)), /NAME_TAKEN/);
});

test('gói dịch vụ chỉ chủ cơ sở xem', async () => {
  const c = await setup();
  assert.equal((await asUser(c.db, c.owner, `select * from org_plan_usage($1)`, [c.org])).rows.length, 1);
  assert.match(await expectError(asUser(c.db, c.mgr, `select * from org_plan_usage($1)`, [c.org])), /FORBIDDEN/);
});
